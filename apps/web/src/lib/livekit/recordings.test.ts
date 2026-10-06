import { afterEach, describe, expect, it, vi } from "vitest";

import { EgressInfo, EgressStatus } from "livekit-server-sdk";

import {
  createRecordingFileOutput,
  getRecordingStorageConfig,
  isRecordingEgressReady,
  recordingObjectKey,
  RecordingConfigurationError,
  summarizeEgress,
} from "./recordings";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setRecordingEnvironment() {
  vi.stubEnv("RECORDING_S3_ENDPOINT", "https://project.storage.supabase.co/storage/v1/s3/");
  vi.stubEnv("RECORDING_S3_REGION", "ap-southeast-1");
  vi.stubEnv("RECORDING_S3_BUCKET", "meetflow-recordings");
  vi.stubEnv("RECORDING_S3_ACCESS_KEY", "test-access-key");
  vi.stubEnv("RECORDING_S3_SECRET_KEY", "test-secret-key");
}

describe("meeting recording storage", () => {
  it("requires a complete HTTPS S3-compatible storage configuration", () => {
    setRecordingEnvironment();
    expect(getRecordingStorageConfig()).toMatchObject({
      endpoint: "https://project.storage.supabase.co/storage/v1/s3",
      region: "ap-southeast-1",
      bucket: "meetflow-recordings",
    });

    vi.stubEnv("RECORDING_S3_SECRET_KEY", "");
    expect(() => getRecordingStorageConfig()).toThrow(RecordingConfigurationError);
    vi.stubEnv("RECORDING_S3_SECRET_KEY", "test-secret-key");
    vi.stubEnv("RECORDING_S3_ENDPOINT", "http://storage.example.test/storage/v1/s3");
    expect(() => getRecordingStorageConfig()).toThrow(RecordingConfigurationError);
  });

  it("uses a meeting-scoped MP4 object key and private S3 output", () => {
    setRecordingEnvironment();
    const output = createRecordingFileOutput(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(output.filepath).toBe(
      "meetings/00000000-0000-4000-8000-000000000001/recordings/00000000-0000-4000-8000-000000000002.mp4",
    );
    expect(output.output.case).toBe("s3");
    if (output.output.case === "s3") {
      expect(output.output.value.bucket).toBe("meetflow-recordings");
      expect(output.output.value.forcePathStyle).toBe(true);
      expect(output.output.value.secret).toBe("test-secret-key");
    }
    expect(recordingObjectKey("meeting", "recording")).toBe(
      "meetings/meeting/recordings/recording.mp4",
    );
  });
});

describe("LiveKit Egress lifecycle mapping", () => {
  it("only allows stopping after Egress is active", () => {
    expect(isRecordingEgressReady(new EgressInfo({ status: EgressStatus.EGRESS_STARTING }))).toBe(
      false,
    );
    expect(isRecordingEgressReady(new EgressInfo({ status: EgressStatus.EGRESS_ACTIVE }))).toBe(
      true,
    );
    expect(isRecordingEgressReady(null)).toBe(false);
  });

  it("maps active, ending, completed, and failed egress states", () => {
    expect(summarizeEgress(new EgressInfo({ status: EgressStatus.EGRESS_ACTIVE }))).toMatchObject({
      status: "recording",
    });
    expect(summarizeEgress(new EgressInfo({ status: EgressStatus.EGRESS_ENDING }))).toMatchObject({
      status: "processing",
    });
    const completedEgress = {
      status: EgressStatus.EGRESS_COMPLETE,
      fileResults: [
        { filename: "recording.mp4", location: "private-object", duration: 5_900_000_000 },
      ],
      startedAt: 0,
      endedAt: 5_900_000_000,
    } as unknown as EgressInfo;
    expect(summarizeEgress(completedEgress)).toMatchObject({
      status: "completed",
      durationSeconds: 5,
    });
    expect(summarizeEgress(new EgressInfo({ status: EgressStatus.EGRESS_FAILED }))).toMatchObject({
      status: "failed",
      errorCode: "egress_failed",
    });
  });

  it("does not report a successful record when Egress has no output file", () => {
    expect(summarizeEgress(new EgressInfo({ status: EgressStatus.EGRESS_COMPLETE }))).toMatchObject(
      {
        status: "failed",
        errorCode: "recording_file_missing",
      },
    );
  });
});
