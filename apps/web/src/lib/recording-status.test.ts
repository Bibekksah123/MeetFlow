import { describe, expect, it } from "vitest";

import { mergeRecordingStorageResult } from "./recording-status";

describe("recording storage reconciliation", () => {
  it("accepts a completed Egress when its deterministic S3 object exists", () => {
    expect(
      mergeRecordingStorageResult(
        { status: "failed", durationSeconds: null, errorCode: "recording_file_missing" },
        { objectExists: true, canRetry: false, egressDurationSeconds: 42 },
      ),
    ).toEqual({ status: "completed", durationSeconds: 42, errorCode: null });
  });

  it("keeps an uploaded-file check pending briefly while storage finalizes", () => {
    expect(
      mergeRecordingStorageResult(
        { status: "completed", durationSeconds: 42, errorCode: null },
        { objectExists: false, canRetry: true, egressDurationSeconds: 42 },
      ),
    ).toEqual({ status: "processing", durationSeconds: null, errorCode: null });
  });

  it("preserves real Egress failures", () => {
    expect(
      mergeRecordingStorageResult(
        { status: "failed", durationSeconds: null, errorCode: "egress_failed" },
        { objectExists: true, canRetry: false, egressDurationSeconds: null },
      ),
    ).toEqual({ status: "failed", durationSeconds: null, errorCode: "egress_failed" });
  });
});
