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
    // Load DATABASE_URL (and friends) from .env before test modules evaluate,
    // since lib/db/client.ts reads process.env at import time.
    setupFiles: ["dotenv/config"],
    // Integration tests share one real Postgres; run test files serially so
    // row-count / fixture assertions don't race across worker processes.
    fileParallelism: false,
  },
});
