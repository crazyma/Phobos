import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Glossary term pages are authored as MDX (spec-04); frontmatter is stripped
  // by remark-frontmatter so the body renders cleanly (the structured data is
  // read separately via gray-matter in lib/glossary).
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  typescript: {
    // Type-checking is delegated to `pnpm typecheck` (TypeScript 7 / tsgo, the
    // native compiler this repo standardises on — see package.json). Next 16's
    // bundled build-time checker still targets the classic tsc JS API and
    // crashes against tsgo, so we skip it here. `pnpm typecheck` covers the
    // whole app + lib and is the real type gate (run it in CI / pre-commit).
    ignoreBuildErrors: true,
  },
};

const withMDX = createMDX({
  options: {
    // Turbopack can't serialize function references, so plugins are named as
    // strings (resolved by @next/mdx). remark-frontmatter strips the YAML block
    // from the rendered body; remark-mdx-frontmatter is harmless alongside it.
    remarkPlugins: [["remark-frontmatter"], ["remark-mdx-frontmatter"]],
  },
});

export default withMDX(nextConfig);
