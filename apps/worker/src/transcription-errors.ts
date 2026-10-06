import { ApiError } from "@google/genai";

import {
  AudioCompressionError,
  InvalidTranscriptionError,
  RecordingTooLargeError,
} from "./transcription";
import { RecordingNotFoundError, SourceRecordingTooLargeError } from "./storage";

export type TranscriptionFailureStage =
  | "queue_claim"
  | "storage_download"
  | "gemini_transcription"
  | "transcript_persistence"
  | "failure_status_persistence"
  | "worker_startup";

export function describeTranscriptionFailure(error: unknown, stage: TranscriptionFailureStage) {
  const details = getSafeFailureDetails(error, stage);

  if (error instanceof RecordingTooLargeError) {
    return {
      message:
        "The compressed audio is still larger than the transcription service's 25 MB upload limit.",
      details,
    };
  }
  if (error instanceof SourceRecordingTooLargeError) {
    return {
      message: "This recording exceeds the transcription worker's 1 GB processing limit.",
      details,
    };
  }
  if (error instanceof AudioCompressionError) {
    return {
      message:
        "This recording could not be prepared for transcription. The file may be damaged or contain no audio.",
      details,
    };
  }
  if (error instanceof RecordingNotFoundError) {
    return { message: "The recording file could not be found in private storage.", details };
  }
  if (error instanceof InvalidTranscriptionError) {
    return {
      message: "The transcription service returned an empty or invalid transcript.",
      details,
    };
  }
  if (error instanceof Error && error.message === "The recording file is empty or unreadable.") {
    return { message: "The recording file is empty or could not be read.", details };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        message:
          "Google Gemini rejected the worker's API key or permissions. Check the Gemini API configuration.",
        details,
      };
    }
    if (error.status === 429) {
      return {
        message:
          "Google Gemini quota or rate limits blocked transcription. Check the API project's quota, then retry later.",
        details,
      };
    }
    if (error.status === 503) {
      return {
        message:
          "Google Gemini transcription is temporarily overloaded. Wait, then retry this recording.",
        details,
      };
    }
    if (error.status === 400 || error.status === 413) {
      return {
        message:
          "Google Gemini rejected the recording or request. Check the audio format and 25 MB upload limit.",
        details,
      };
    }
    return {
      message:
        "Google Gemini could not transcribe this recording. Check the redacted worker error details and retry.",
      details,
    };
  }

  return {
    message:
      "We could not transcribe this recording. Check the redacted worker error details and retry.",
    details,
  };
}

function getSafeFailureDetails(error: unknown, stage: TranscriptionFailureStage) {
  if (error instanceof ApiError) {
    return {
      stage,
      category: "gemini_api",
      errorName: safeName(error.name),
      httpStatus: error.status,
    };
  }

  const value = asRecord(error);
  const metadata = asRecord(value?.$metadata);
  return {
    stage,
    category: "worker",
    errorName: safeName(value?.name),
    errorCode: safeIdentifier(value?.code),
    httpStatus: typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeName(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value)
    ? value
    : "UnknownError";
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
}
