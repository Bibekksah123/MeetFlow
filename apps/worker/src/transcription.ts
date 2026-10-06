import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const MAX_TRANSCRIPTION_FILE_BYTES = 25_000_000;
export const TRANSCRIPTION_MODEL = "gemini-3.5-transcribe";

const transcriptionResponseSchema = z.object({
  output_text: z.string().max(1_000_000),
});

const uploadedFileSchema = z.object({
  name: z.string().optional(),
  uri: z.string().url(),
  mimeType: z.enum(["audio/mpeg", "audio/mp3"]).optional(),
});

export class RecordingTooLargeError extends Error {
  constructor() {
    super("Recording exceeds the transcription service's 25 MB request limit after compression.");
    this.name = "RecordingTooLargeError";
  }
}

export class AudioCompressionError extends Error {
  constructor() {
    super("The recording could not be compressed for transcription.");
    this.name = "AudioCompressionError";
  }
}

export class InvalidTranscriptionError extends Error {
  constructor() {
    super("The transcription provider returned an invalid or empty result.");
    this.name = "InvalidTranscriptionError";
  }
}

export async function transcribeAudioBuffer(
  audio: Uint8Array,
  client: Pick<GoogleGenAI, "files" | "interactions">,
): Promise<{ content: string; segments: [] }> {
  if (audio.byteLength === 0) throw new InvalidTranscriptionError();
  if (audio.byteLength > MAX_TRANSCRIPTION_FILE_BYTES) throw new RecordingTooLargeError();

  let uploadedFileName: string | undefined;
  try {
    const uploaded = await client.files.upload({
      file: new Blob([toArrayBuffer(audio)], { type: "audio/mpeg" }),
      config: { mimeType: "audio/mpeg", displayName: "meetflow-recording.mp3" },
    });
    uploadedFileName =
      typeof uploaded.name === "string" && uploaded.name.length > 0 ? uploaded.name : undefined;
    const file = uploadedFileSchema.safeParse(uploaded);
    if (!file.success) throw new InvalidTranscriptionError();

    const response = await client.interactions.create({
      model: TRANSCRIPTION_MODEL,
      store: false,
      input: [
        {
          type: "audio",
          uri: file.data.uri,
          mime_type: file.data.mimeType ?? "audio/mpeg",
        },
      ],
    });
    const result = transcriptionResponseSchema.safeParse(response);
    if (!result.success || !result.data.output_text.trim()) {
      throw new InvalidTranscriptionError();
    }

    return { content: result.data.output_text.trim(), segments: [] };
  } finally {
    if (uploadedFileName) {
      try {
        await client.files.delete({ name: uploadedFileName });
      } catch {
        // Gemini expires uploaded files automatically; cleanup should not hide the transcript result.
      }
    }
  }
}

function toArrayBuffer(audio: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(audio.byteLength);
  copy.set(audio);
  return copy.buffer;
}
