import "server-only";

import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";

import type { recordingStatus } from "@meetflow/db/schema";

import { getLiveKitServerConfig } from "./server";

export type RecordingState = (typeof recordingStatus.enumValues)[number];

export class RecordingConfigurationError extends Error {
  constructor() {
    super("Recording storage configuration is incomplete or invalid.");
    this.name = "RecordingConfigurationError";
  }
}

type RecordingStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

export function getRecordingStorageConfig(): RecordingStorageConfig {
  const endpointValue = process.env.RECORDING_S3_ENDPOINT;
  const region = process.env.RECORDING_S3_REGION;
  const bucket = process.env.RECORDING_S3_BUCKET;
  const accessKey = process.env.RECORDING_S3_ACCESS_KEY;
  const secretKey = process.env.RECORDING_S3_SECRET_KEY;

  if (!endpointValue || !region || !bucket || !accessKey || !secretKey) {
    throw new RecordingConfigurationError();
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new RecordingConfigurationError();
  }

  const endpointPath = endpoint.pathname.replace(/\/+$/, "");
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !endpointPath.endsWith("/storage/v1/s3") ||
    !region.trim() ||
    !bucket.trim() ||
    !accessKey.trim() ||
    !secretKey.trim()
  ) {
    throw new RecordingConfigurationError();
  }

  return {
    endpoint: endpoint.toString().replace(/\/+$/, ""),
    region: region.trim(),
    bucket: bucket.trim(),
    accessKey,
    secretKey,
  };
}

export function recordingObjectKey(meetingId: string, recordingId: string): string {
  return `meetings/${meetingId}/recordings/${recordingId}.mp4`;
}

export function createRecordingFileOutput(meetingId: string, recordingId: string) {
  const storage = getRecordingStorageConfig();
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: recordingObjectKey(meetingId, recordingId),
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: storage.accessKey,
        secret: storage.secretKey,
        endpoint: storage.endpoint,
        region: storage.region,
        bucket: storage.bucket,
        forcePathStyle: true,
      }),
    },
  });
}

export function getRecordingEgressClient(): EgressClient {
  const liveKit = getLiveKitServerConfig();
  return new EgressClient(liveKit.apiUrl, liveKit.apiKey, liveKit.apiSecret);
}

export async function startRoomRecording(
  meetingId: string,
  recordingId: string,
): Promise<EgressInfo> {
  return getRecordingEgressClient().startRoomCompositeEgress(
    meetingId,
    createRecordingFileOutput(meetingId, recordingId),
    {
      layout: "grid",
    },
  );
}

export function stopRoomRecording(egressId: string): Promise<EgressInfo> {
  return getRecordingEgressClient().stopEgress(egressId);
}

export async function getRoomRecordingEgress(egressId: string): Promise<EgressInfo | null> {
  const records = await getRecordingEgressClient().listEgress({ egressId });
  return records.find((record) => record.egressId === egressId) ?? null;
}

export function isRecordingEgressReady(info: EgressInfo | null): boolean {
  return info?.status === EgressStatus.EGRESS_ACTIVE;
}

export function summarizeEgress(info: EgressInfo): {
  status: "recording" | "processing" | "completed" | "failed";
  durationSeconds: number | null;
  errorCode: string | null;
} {
  if (info.status === EgressStatus.EGRESS_STARTING || info.status === EgressStatus.EGRESS_ACTIVE) {
    return { status: "recording", durationSeconds: null, errorCode: null };
  }

  if (info.status === EgressStatus.EGRESS_ENDING) {
    return { status: "processing", durationSeconds: null, errorCode: null };
  }

  if (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) {
    return { status: "failed", durationSeconds: null, errorCode: "egress_failed" };
  }

  if (
    info.status === EgressStatus.EGRESS_COMPLETE ||
    info.status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    const file = info.fileResults[0];
    if (!file?.location && !file?.filename) {
      return { status: "failed", durationSeconds: null, errorCode: "recording_file_missing" };
    }

    const fileDuration = Number(file.duration);
    const egressDuration = Number(info.endedAt) - Number(info.startedAt);
    const duration = fileDuration > 0 ? fileDuration : egressDuration;
    return {
      status: "completed",
      durationSeconds: duration > 0 ? Math.floor(duration / 1_000_000_000) : 0,
      errorCode: null,
    };
  }

  return { status: "processing", durationSeconds: null, errorCode: null };
}
