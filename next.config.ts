import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-checking is delegated to `pnpm typecheck` (TypeScript 7 / tsgo, the
    // native compiler this repo standardises on — see package.json). Next 16's
    // bundled build-time checker still targets the classic tsc JS API and
    // crashes against tsgo, so we skip it here. `pnpm typecheck` covers the
    // whole app + lib and is the real type gate (run it in CI / pre-commit).
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
