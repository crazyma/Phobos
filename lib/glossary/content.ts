/**
 * Reads glossary term frontmatter straight off the MDX files (spec-04 §B).
 * gray-matter parses the YAML block; Zod validates it. The MDX *body* is
 * rendered separately by the slug page (dynamic MDX import) — here we only
 * need the structured frontmatter that drives the index, registry, band
 * tables and example picker. Server-only (uses `node:fs`).
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { FrontmatterSchema, type Frontmatter } from "./schema.ts";

export const CONTENT_DIR = path.join(process.cwd(), "content/glossary");

/** Parse + validate every term file in `dir`; slug must match the filename. */
export function loadAllFrontmatter(dir = CONTENT_DIR): Frontmatter[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = FrontmatterSchema.parse(matter(raw).data);
      const base = file.replace(/\.mdx$/, "");
      if (parsed.slug !== base) {
        throw new Error(`glossary slug "${parsed.slug}" must match filename "${base}.mdx"`);
      }
      return parsed;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** One term's frontmatter, or undefined when the slug has no file. */
export function loadFrontmatter(slug: string, dir = CONTENT_DIR): Frontmatter | undefined {
  return loadAllFrontmatter(dir).find((t) => t.slug === slug);
}
