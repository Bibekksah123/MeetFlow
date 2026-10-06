import { GetObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpegPath from "ffmpeg-static";

import {
  AudioCompressionError,
  MAX_TRANSCRIPTION_FILE_BYTES,
  RecordingTooLargeError,
} from "./transcription";

const MAX_SOURCE_RECORDING_BYTES = 1_000_000_000;
const executeFile = promisify(execFile);

let client: S3Client | undefined;

export class RecordingNotFoundError extends Error {
  constructor() {
    super("The recording file is missing from private storage.");
    this.name = "RecordingNotFoundError";
  }
}

export class SourceRecordingTooLargeError extends Error {
  constructor() {
    super("Recording exceeds the worker's 1 GB source file limit.");
    this.name = "SourceRecordingTooLargeError";
  }
}

function getStorageClient() {
  if (client) return client;

  const endpoint = process.env.RECORDING_S3_ENDPOINT;
  const region = process.env.RECORDING_S3_REGION;
  const bucket = process.env.RECORDING_S3_BUCKET;
  const accessKey = process.env.RECORDING_S3_ACCESS_KEY;
  const secretKey = process.env.RECORDING_S3_SECRET_KEY;
  if (!endpoint || !region || !bucket || !accessKey || !secretKey) {
    throw new Error("Recording storage is not configured.");
  }

  const parsedEndpoint = new URL(endpoint);
  if (
    parsedEndpoint.protocol !== "https:" ||
    parsedEndpoint.username ||
    parsedEndpoint.password ||
    parsedEndpoint.search ||
    parsedEndpoint.hash ||
    !parsedEndpoint.pathname.replace(/\/+$/, "").endsWith("/storage/v1/s3")
  ) {
    throw new Error("Recording storage configuration is invalid.");
  }

  const config: S3ClientConfig = {
    endpoint: parsedEndpoint.toString().replace(/\/+$/, ""),
    region,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  };
  client = new S3Client(config);
  return client;
}

export async function downloadRecordingAudio(options: {
  meetingId: string;
  recordingId: string;
  objectKey: string;
}): Promise<{ audio: Uint8Array; filename: string; mediaType: string }> {
  const expectedKey = `meetings/${options.meetingId}/recordings/${options.recordingId}.mp4`;
  if (options.objectKey !== expectedKey) {
    throw new Error("The recording storage reference is invalid.");
  }

  const bucket = process.env.RECORDING_S3_BUCKET;
  if (!bucket) throw new Error("Recording storage is not configured.");

  let result;
  try {
    result = await getStorageClient().send(
      new GetObjectCommand({ Bucket: bucket, Key: options.objectKey }),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      ["NotFound", "NoSuchKey"].includes(String(error.name))
    ) {
      throw new RecordingNotFoundError();
    }
    throw error;
  }
  if (!result.Body) throw new RecordingNotFoundError();
  if (
    !Number.isSafeInteger(result.ContentLength) ||
    result.ContentLength === undefined ||
    result.ContentLength <= 0
  ) {
    throw new Error("The recording file is empty or unreadable.");
  }
  if (result.ContentLength > MAX_SOURCE_RECORDING_BYTES) throw new SourceRecordingTooLargeError();

  return compressRecordingToAudio(result.Body.transformToWebStream());
}

export async function compressRecordingToAudio(source: ReadableStream<Uint8Array>) {
  if (!ffmpegPath) throw new AudioCompressionError();
  const directory = await mkdtemp(join(tmpdir(), "meetflow-transcription-"));
  const sourcePath = join(directory, "source.mp4");
  const audioPath = join(directory, "transcription.mp3");

  try {
    await chmod(directory, 0o700);
    await pipeline(Readable.fromWeb(source), createWriteStream(sourcePath, { flags: "wx" }));
    if ((await stat(sourcePath)).size > MAX_SOURCE_RECORDING_BYTES) {
      throw new SourceRecordingTooLargeError();
    }
    await executeFile(
      ffmpegPath,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "24k",
        "-f",
        "mp3",
        audioPath,
      ],
      { timeout: 5 * 60 * 1000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    const metadata = await stat(audioPath);
    if (metadata.size === 0) throw new Error("The recording has no audio track.");
    if (metadata.size > MAX_TRANSCRIPTION_FILE_BYTES) throw new RecordingTooLargeError();
    const audio = await readFile(audioPath);
    return { audio, filename: "meeting-recording.mp3", mediaType: "audio/mpeg" };
  } catch (error) {
    if (error instanceof RecordingTooLargeError) throw error;
    if (error instanceof SourceRecordingTooLargeError) throw error;
    throw new AudioCompressionError();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function closeRecordingStorage() {
  const activeClient = client;
  client = undefined;
  activeClient?.destroy();
}
