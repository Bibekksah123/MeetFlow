import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import dotenv from "dotenv";
import postgres from "../../packages/db/node_modules/postgres";
import { EgressClient } from "livekit-server-sdk";

dotenv.config({ path: resolve(import.meta.dir, "../../.env.local") });
const execFileAsync = promisify(execFile);
const db = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 10, prepare: false });

try {
  const rows = await db`
    select id, egress_id, status, object_key, duration_seconds, error_code, created_at
    from public.recordings order by created_at desc limit 5
  `;
  const rawUrl = new URL(process.env.LIVEKIT_URL!);
  if (rawUrl.protocol === "wss:") rawUrl.protocol = "https:";
  else if (rawUrl.protocol === "ws:") rawUrl.protocol = "http:";
  const egressClient = new EgressClient(rawUrl.toString().replace(/\/+$/, ""), process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!);
  const storage = {
    endpoint: process.env.RECORDING_S3_ENDPOINT!,
    bucket: process.env.RECORDING_S3_BUCKET!,
    accessKey: process.env.RECORDING_S3_ACCESS_KEY!,
    secretKey: process.env.RECORDING_S3_SECRET_KEY!,
    region: process.env.RECORDING_S3_REGION!,
  };
  const result = [];
  for (const row of rows) {
    let egress = null;
    if (row.egress_id) {
      const infos = await egressClient.listEgress({ egressId: row.egress_id });
      const info = infos.find((item) => item.egressId === row.egress_id);
      if (info) egress = {
        status: info.status,
        errorCode: info.errorCode,
        errorClass: classifyError(info.error ?? ""),
        fileCount: info.fileResults.length,
        hasLocation: info.fileResults.some((file) => Boolean(file.location)),
        hasFilename: info.fileResults.some((file) => Boolean(file.filename)),
        durationSeconds: info.fileResults[0]?.duration ? Number(info.fileResults[0].duration) / 1e9 : null,
      };
    }
    let s3: { exists: boolean; sizeBytes?: number; contentType?: string } = { exists: false };
    if (row.object_key) {
      try {
        const { stdout } = await execFileAsync("aws", [
          "s3api", "head-object", "--endpoint-url", storage.endpoint,
          "--bucket", storage.bucket, "--key", row.object_key,
          "--region", storage.region, "--query", "{size:ContentLength,type:ContentType}", "--output", "json",
        ], {
          windowsHide: true,
          env: { ...process.env, AWS_ACCESS_KEY_ID: storage.accessKey, AWS_SECRET_ACCESS_KEY: storage.secretKey, AWS_DEFAULT_REGION: storage.region },
          timeout: 15000,
        });
        const meta = JSON.parse(stdout);
        s3 = { exists: true, sizeBytes: meta.size, contentType: meta.type };
      } catch {
        s3 = { exists: false };
      }
    }
    result.push({
      status: row.status,
      errorCode: row.error_code,
      durationSeconds: row.duration_seconds,
      hasObjectKey: Boolean(row.object_key),
      s3,
      egress,
      createdAt: row.created_at,
    });
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.end({ timeout: 5 });
}

function classifyError(error: string) {
  if (!error) return "none";
  if (/start.signal|signal.*start/i.test(error)) return "start_signal";
  if (/timeout|deadline/i.test(error)) return "timeout";
  if (/audio|track|participant/i.test(error)) return "media_or_participant";
  if (/room|closed/i.test(error)) return "room_lifecycle";
  return "other";
}
