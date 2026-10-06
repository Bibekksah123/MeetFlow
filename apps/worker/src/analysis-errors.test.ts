import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";

import { describeAnalysisFailure } from "./analysis-errors";
import { InvalidMeetingAnalysisError } from "./analysis";

describe("meeting analysis failure diagnostics", () => {
  it("redacts provider messages while preserving the Gemini HTTP status", () => {
    const failure = describeAnalysisFailure(
      new ApiError({ status: 429, message: "private transcript or provider detail" }),
      "gemini_analysis",
    );

    expect(failure.message).toContain("quota or rate limits");
    expect(failure.details).toMatchObject({
      stage: "gemini_analysis",
      category: "gemini_api",
      httpStatus: 429,
    });
    expect(JSON.stringify(failure)).not.toContain("private transcript or provider detail");
  });

  it("reports invalid structured output without exposing generated content", () => {
    const failure = describeAnalysisFailure(new InvalidMeetingAnalysisError(), "gemini_analysis");

    expect(failure.message).toContain("invalid format after a retry");
    expect(failure.details.category).toBe("worker");
  });

  it("classifies Interactions API errors without logging provider response text", () => {
    const failure = describeAnalysisFailure(
      Object.assign(new Error("private provider response"), {
        name: "BadRequestError",
        status: 400,
        statusCode: 400,
        error: { error: { code: "invalid_request", message: "private meeting text" } },
      }),
      "gemini_analysis",
    );

    expect(failure.message).toContain("rejected the analysis request format");
    expect(failure.details).toMatchObject({
      stage: "gemini_analysis",
      category: "gemini_api",
      errorName: "BadRequestError",
      httpStatus: 400,
      providerCode: "invalid_request",
    });
    expect(JSON.stringify(failure)).not.toContain("private provider response");
    expect(JSON.stringify(failure)).not.toContain("private meeting text");
  });
});
