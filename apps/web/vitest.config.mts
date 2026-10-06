import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Next handles this marker during app bundling. Vitest runs outside the
    // React Server Component condition, so point it at a harmless test stub.
    alias: {
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
});
