import { ApiError } from "@google/genai";

import { AnalysisTranscriptTooLargeError, InvalidMeetingAnalysisError } from "./analysis";

export type AnalysisFailureStage =
  "gemini_analysis" | "analysis_persistence" | "analysis_failure_persistence";

export function describeAnalysisFailure(error: unknown, stage: AnalysisFailureStage) {
  const details = getSafeFailureDetails(error, stage);

  if (error instanceof AnalysisTranscriptTooLargeError) {
    return {
      message: "This transcript is too long for the current analysis limit.",
      details,
    };
  }
  if (error instanceof InvalidMeetingAnalysisError) {
    return {
      message: "Gemini returned analysis in an invalid format after a retry.",
      details,
    };
  }
  const httpStatus = getGeminiApiStatus(error, stage);
  if (httpStatus !== undefined) {
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        message: "Google Gemini rejected the worker's API key or permissions.",
        details,
      };
    }
    if (httpStatus === 400) {
      return {
        message:
          "Google Gemini rejected the analysis request format. Restart the worker, then retry.",
        details,
      };
    }
    if (httpStatus === 429) {
      return {
        message:
          "Google Gemini quota or rate limits blocked analysis. Check the API project's quota.",
        details,
      };
    }
    if (httpStatus === 503) {
      return {
        message: "Google Gemini analysis is temporarily overloaded. Try again later.",
        details,
      };
    }
    return {
      message: "Google Gemini could not analyze this transcript. Check the worker configuration.",
      details,
    };
  }

  return {
    message: "MeetFlow could not analyze this transcript. Check the redacted worker error details.",
    details,
  };
}

function getSafeFailureDetails(error: unknown, stage: AnalysisFailureStage) {
  const httpStatus = getGeminiApiStatus(error, stage);
  if (httpStatus !== undefined) {
    const value = asRecord(error);
    return {
      stage,
      category: "gemini_api",
      errorName: safeName(value?.name),
      httpStatus,
      providerCode: getProviderCode(value),
    };
  }

  const value = asRecord(error);
  return {
    stage,
    category: "worker",
    errorName: safeName(value?.name),
    errorCode: safeIdentifier(value?.code),
  };
}

const interactionsApiErrorNames = new Set([
  "BadRequestError",
  "AuthenticationError",
  "PermissionDeniedError",
  "NotFoundError",
  "ConflictError",
  "UnprocessableEntityError",
  "RateLimitError",
  "InternalServerError",
  "APIError",
  "APIConnectionError",
  "APIConnectionTimeoutError",
]);

function getGeminiApiStatus(error: unknown, stage: AnalysisFailureStage): number | undefined {
  if (error instanceof ApiError) return error.status;
  if (stage !== "gemini_analysis") return undefined;

  const value = asRecord(error);
  if (!value || typeof value.name !== "string" || !interactionsApiErrorNames.has(value.name)) {
    return undefined;
  }

  const status = typeof value.status === "number" ? value.status : value.statusCode;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : undefined;
}

function getProviderCode(value: Record<string, unknown> | undefined): string | undefined {
  const body = asRecord(value?.error);
  const nestedError = asRecord(body?.error);
  const code = nestedError?.code ?? body?.code;
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(code) ? code : undefined;
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
