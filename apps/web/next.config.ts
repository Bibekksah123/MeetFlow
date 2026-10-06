import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Next.js loads app-local env files from apps/web. Database tooling and
// server-only integration credentials also use the repository root .env.local,
// so load it without overriding values already provided by Next or deployment.
loadEnv({
  path: fileURLToPath(new URL("../../.env.local", import.meta.url)),
  override: false,
  quiet: true,
});

const nextConfig: NextConfig = {
  transpilePackages: ["@meetflow/db", "@meetflow/ui"],
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(self), display-capture=(self)",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000",
      });
    }

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
