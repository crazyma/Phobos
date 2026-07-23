import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Load DATABASE_URL (and friends) from .env before test modules evaluate,
    // since lib/db/client.ts reads process.env at import time.
    setupFiles: ["dotenv/config"],
  },
});
