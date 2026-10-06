import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";

import { describeTranscriptionFailure } from "./transcription-errors";

describe("Gemini transcription failure diagnostics", () => {
  it("identifies quota or rate limits and keeps provider messages private", () => {
    const error = new ApiError({ status: 429, message: "private provider response" });
    const failure = describeTranscriptionFailure(error, "gemini_transcription");

    expect(failure.message).toContain("quota or rate limits");
    expect(failure.details).toMatchObject({
      stage: "gemini_transcription",
      category: "gemini_api",
      httpStatus: 429,
      errorName: "ApiError",
    });
    expect(JSON.stringify(failure)).not.toContain("private provider response");
  });

  it("explains a temporary model overload separately", () => {
    const failure = describeTranscriptionFailure(
      new ApiError({ status: 503, message: "private provider response" }),
      "gemini_transcription",
    );

    expect(failure.message).toContain("temporarily overloaded");
    expect(failure.details.httpStatus).toBe(503);
  });

  it("identifies credential and permission failures", () => {
    const failure = describeTranscriptionFailure(
      new ApiError({ status: 403, message: "private provider response" }),
      "gemini_transcription",
    );

    expect(failure.message).toContain("API key or permissions");
    expect(failure.details.httpStatus).toBe(403);
  });

  it("keeps generic worker errors redacted while preserving a safe error code", () => {
    const failure = describeTranscriptionFailure(
      Object.assign(new Error("private filesystem detail"), { code: "ECONNRESET" }),
      "storage_download",
    );

    expect(failure.details).toMatchObject({
      stage: "storage_download",
      category: "worker",
      errorName: "Error",
      errorCode: "ECONNRESET",
    });
    expect(JSON.stringify(failure)).not.toContain("private filesystem detail");
  });
});
