import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" → repo root so route handlers importing
    // "@/lib/services" resolve under vitest too.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Load the isolated test DATABASE_URL before test modules evaluate, since
    // lib/db/client.ts reads process.env at import time.
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests share the isolated test DB; run test files serially so
    // row-count / fixture assertions don't race across worker processes.
    fileParallelism: false,
  },
});
