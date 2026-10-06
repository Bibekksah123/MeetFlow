import { GoogleGenAI } from "@google/genai";

import { closeDatabase } from "@meetflow/db";

import { analyzeMeetingTranscript } from "./analysis";
import { describeAnalysisFailure } from "./analysis-errors";
import { requireWorkerConfig } from "./env";
import {
  claimNextMeetingAnalysis,
  claimNextTranscription,
  completeMeetingAnalysis,
  completeTranscription,
  failMeetingAnalysis,
  failTranscription,
} from "./queue";
import {
  describeTranscriptionFailure,
  type TranscriptionFailureStage,
} from "./transcription-errors";
import { closeRecordingStorage, downloadRecordingAudio } from "./storage";
import { transcribeAudioBuffer } from "./transcription";

const pollIntervalMs = 15_000;
let stopping = false;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

async function processNext(client: GoogleGenAI) {
  const job = await claimNextTranscription();
  if (!job) return false;

  let stage: TranscriptionFailureStage = "storage_download";
  try {
    const audio = await downloadRecordingAudio(job);
    stage = "gemini_transcription";
    const result = await transcribeAudioBuffer(audio.audio, client);
    stage = "transcript_persistence";
    await completeTranscription(job, result);
    console.info("Meeting transcription completed.", { transcriptId: job.transcriptId });
  } catch (error) {
    const failure = describeTranscriptionFailure(error, stage);
    try {
      await failTranscription(job, failure.message);
    } catch (statusError) {
      const statusFailure = describeTranscriptionFailure(statusError, "failure_status_persistence");
      console.error("Could not save the transcription failure status.", {
        transcriptId: job.transcriptId,
        ...statusFailure.details,
      });
    }
    console.error("Meeting transcription failed.", {
      transcriptId: job.transcriptId,
      ...failure.details,
    });
  }

  return true;
}

async function processNextAnalysis(client: GoogleGenAI) {
  const job = await claimNextMeetingAnalysis();
  if (!job) return false;

  let stage: "gemini_analysis" | "analysis_persistence" = "gemini_analysis";
  try {
    const result = await analyzeMeetingTranscript(client, {
      meetingTitle: job.meetingTitle,
      meetingDate: job.meetingDate,
      transcript: job.transcript,
    });
    stage = "analysis_persistence";
    await completeMeetingAnalysis(job, result);
    console.info("Meeting analysis completed.", { meetingId: job.meetingId });
  } catch (error) {
    const failure = describeAnalysisFailure(error, stage);
    try {
      await failMeetingAnalysis(job, failure.message);
    } catch (statusError) {
      const statusFailure = describeAnalysisFailure(statusError, "analysis_failure_persistence");
      console.error("Could not save the meeting analysis failure status.", {
        meetingId: job.meetingId,
        ...statusFailure.details,
      });
    }
    console.error("Meeting analysis failed.", {
      meetingId: job.meetingId,
      ...failure.details,
    });
  }

  return true;
}

async function waitForNextPoll() {
  await new Promise<void>((resolve) => {
    wakeTimer = setTimeout(resolve, pollIntervalMs);
  });
  wakeTimer = undefined;
}

async function main() {
  requireWorkerConfig();
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.info("MeetFlow transcription and analysis worker started.");

  while (!stopping) {
    try {
      const claimed = await processNext(client);
      const analyzed = await processNextAnalysis(client);
      if (!claimed && !analyzed && !stopping) await waitForNextPoll();
    } catch (error) {
      const failure = describeTranscriptionFailure(error, "queue_claim");
      console.error("Transcription worker polling failed.", failure.details);
      if (!stopping) await waitForNextPoll();
    }
  }
}

function requestStop() {
  stopping = true;
  if (wakeTimer) clearTimeout(wakeTimer);
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

try {
  await main();
} catch (error) {
  const failure = describeTranscriptionFailure(error, "worker_startup");
  console.error("Meeting processing worker could not start.", failure.details);
  process.exitCode = 1;
} finally {
  await closeRecordingStorage();
  await closeDatabase();
}
