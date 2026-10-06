import { fileURLToPath } from "node:url";
import { globalIgnores } from "eslint/config";

import nextTypescript from "eslint-config-next/typescript";
import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/.turbo/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
  ]),
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      react: { version: "19.3" },
      next: {
        rootDir: [fileURLToPath(new URL("./apps/web", import.meta.url))],
      },
    },
  },
];
