import "server-only";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { getRecordingStorageConfig, recordingObjectKey } from "./recordings";

let s3Client: S3Client | undefined;

export async function recordingObjectExists(meetingId: string, recordingId: string) {
  const storage = getRecordingStorageConfig();
  s3Client ??= new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storage.accessKey,
      secretAccessKey: storage.secretKey,
    },
  });

  try {
    const object = await s3Client.send(
      new HeadObjectCommand({
        Bucket: storage.bucket,
        Key: recordingObjectKey(meetingId, recordingId),
      }),
    );
    return object.ContentLength !== undefined && object.ContentLength > 0;
  } catch (error) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (
      s3Error.$metadata?.httpStatusCode === 404 ||
      s3Error.name === "NotFound" ||
      s3Error.name === "NoSuchKey"
    ) {
      return false;
    }
    throw error;
  }
}
