import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import {
  InvalidTranscriptionError,
  MAX_TRANSCRIPTION_FILE_BYTES,
  RecordingTooLargeError,
  transcribeAudioBuffer,
  TRANSCRIPTION_MODEL,
} from "./transcription";

function createClient(
  options: {
    uploadedFile?: { name?: string; uri?: string; mimeType?: string };
    response?: unknown;
    deleteFails?: boolean;
  } = {},
) {
  const files = {
    upload: vi.fn<
      (params: {
        file: Blob;
        config?: { mimeType?: string; displayName?: string };
      }) => Promise<{ name?: string; uri?: string; mimeType?: string }>
    >(
      async () =>
        options.uploadedFile ?? {
          name: "files/recording-123",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/recording-123",
          mimeType: "audio/mpeg",
        },
    ),
    delete: vi.fn(async () => {
      if (options.deleteFails) throw new Error("private cleanup detail");
    }),
  };
  const interactions = {
    create: vi.fn(
      async () => options.response ?? { output_text: "  We agreed to review the proposal.  " },
    ),
  };
  return {
    client: { files, interactions } as unknown as Pick<GoogleGenAI, "files" | "interactions">,
    files,
    interactions,
  };
}

describe("Gemini recording transcription requests", () => {
  it("uploads MP3 audio, requests transcription, and returns validated plain text", async () => {
    const { client, files, interactions } = createClient();

    await expect(transcribeAudioBuffer(new Uint8Array([1, 2, 3]), client)).resolves.toEqual({
      content: "We agreed to review the proposal.",
      segments: [],
    });

    const upload = files.upload.mock.calls[0]?.[0];
    expect(upload.file).toBeInstanceOf(Blob);
    expect((upload.file as Blob).type).toBe("audio/mpeg");
    expect(upload.config).toEqual({
      mimeType: "audio/mpeg",
      displayName: "meetflow-recording.mp3",
    });
    expect(interactions.create).toHaveBeenCalledWith({
      model: "gemini-3.5-transcribe",
      store: false,
      input: [
        {
          type: "audio",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/recording-123",
          mime_type: "audio/mpeg",
        },
      ],
    });
    expect(files.delete).toHaveBeenCalledWith({ name: "files/recording-123" });
    expect(TRANSCRIPTION_MODEL).toBe("gemini-3.5-transcribe");
  });

  it("rejects audio above the provider upload limit without making a request", async () => {
    const { client, files } = createClient();
    await expect(
      transcribeAudioBuffer(new Uint8Array(MAX_TRANSCRIPTION_FILE_BYTES + 1), client),
    ).rejects.toBeInstanceOf(RecordingTooLargeError);
    expect(files.upload).not.toHaveBeenCalled();
  });

  it("rejects empty audio and malformed or blank provider output", async () => {
    const blank = createClient({ response: { output_text: "  " } });
    const malformed = createClient({ response: { text: "wrong response shape" } });

    await expect(transcribeAudioBuffer(new Uint8Array(), blank.client)).rejects.toBeInstanceOf(
      InvalidTranscriptionError,
    );
    await expect(transcribeAudioBuffer(new Uint8Array([1]), blank.client)).rejects.toBeInstanceOf(
      InvalidTranscriptionError,
    );
    await expect(
      transcribeAudioBuffer(new Uint8Array([1]), malformed.client),
    ).rejects.toBeInstanceOf(InvalidTranscriptionError);
    expect(blank.files.delete).toHaveBeenCalledOnce();
    expect(malformed.files.delete).toHaveBeenCalledOnce();
  });

  it("rejects malformed upload results and still removes a named temporary upload", async () => {
    const { client, files, interactions } = createClient({
      uploadedFile: { name: "files/temporary" },
    });

    await expect(transcribeAudioBuffer(new Uint8Array([1]), client)).rejects.toBeInstanceOf(
      InvalidTranscriptionError,
    );
    expect(interactions.create).not.toHaveBeenCalled();
    expect(files.delete).toHaveBeenCalledWith({ name: "files/temporary" });
  });

  it("does not discard a transcript if temporary file cleanup fails", async () => {
    const { client } = createClient({ deleteFails: true });

    await expect(transcribeAudioBuffer(new Uint8Array([1]), client)).resolves.toMatchObject({
      content: "We agreed to review the proposal.",
    });
  });
});
