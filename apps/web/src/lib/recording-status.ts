export type RecordingEgressSummary = {
  status: "recording" | "processing" | "completed" | "failed";
  durationSeconds: number | null;
  errorCode: string | null;
};

export function mergeRecordingStorageResult(
  summary: RecordingEgressSummary,
  options: {
    objectExists: boolean;
    canRetry: boolean;
    egressDurationSeconds: number | null;
  },
): RecordingEgressSummary {
  if (summary.status !== "completed" && summary.errorCode !== "recording_file_missing") {
    return summary;
  }

  if (options.objectExists) {
    return {
      status: "completed",
      durationSeconds: summary.durationSeconds ?? options.egressDurationSeconds,
      errorCode: null,
    };
  }

  if (options.canRetry) {
    return { status: "processing", durationSeconds: null, errorCode: null };
  }

  return { status: "failed", durationSeconds: null, errorCode: "recording_file_missing" };
}
