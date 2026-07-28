import type { MDXComponents } from "mdx/types";

/**
 * Required by @next/mdx (App Router). Glossary MDX bodies are plain prose, so
 * we just inherit the defaults; page-level layout/styling wraps the body.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components };
}
