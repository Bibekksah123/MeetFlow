import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({
  path: fileURLToPath(new URL("../../../.env.local", import.meta.url)),
  override: false,
  quiet: true,
});

export function requireWorkerConfig() {
  const missing = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["GEMINI_API_KEY", process.env.GEMINI_API_KEY],
    ["RECORDING_S3_ENDPOINT", process.env.RECORDING_S3_ENDPOINT],
    ["RECORDING_S3_REGION", process.env.RECORDING_S3_REGION],
    ["RECORDING_S3_BUCKET", process.env.RECORDING_S3_BUCKET],
    ["RECORDING_S3_ACCESS_KEY", process.env.RECORDING_S3_ACCESS_KEY],
    ["RECORDING_S3_SECRET_KEY", process.env.RECORDING_S3_SECRET_KEY],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Meeting processing worker configuration is incomplete: ${missing.map(([key]) => key).join(", ")}`,
    );
  }
}
