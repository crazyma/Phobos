/**
 * The metric_key → slug registry (spec-04 §D) — the mechanical guarantee of
 * "名詞頁先行". `buildRegistry`/`assertMetricsCovered` are pure and unit-tested
 * against fixtures; `getRegistry` is the memoized live one built from the real
 * content dir and coverage-checked on first use, so a `next build` that renders
 * any page will fail if a displayed metric has no term page.
 */
import { loadAllFrontmatter } from "./content.ts";
import { PLAYER_DISPLAY_METRICS } from "./metrics.ts";
import type { Frontmatter } from "./schema.ts";

/** Build metric_key → slug; throws if one key maps to two different slugs. */
export function buildRegistry(terms: Frontmatter[]): Map<string, string> {
  const registry = new Map<string, string>();
  for (const term of terms) {
    for (const key of term.metric_keys) {
      const existing = registry.get(key);
      if (existing !== undefined && existing !== term.slug) {
        throw new Error(
          `glossary metric_key "${key}" maps to both "${existing}" and "${term.slug}"`,
        );
      }
      registry.set(key, term.slug);
    }
  }
  return registry;
}

/** Throw if any required metric_key has no term page (spec-04 §D build-fail). */
export function assertMetricsCovered(
  registry: Map<string, string>,
  required: readonly string[],
): void {
  const missing = required.filter((key) => !registry.has(key));
  if (missing.length > 0) {
    throw new Error(
      `glossary registry missing term pages for: ${missing.join(", ")} ` +
        `— add the MDX page(s) before the player page displays them (spec-04 §D 名詞頁先行)`,
    );
  }
}

let cached: Map<string, string> | undefined;

/** Live registry, built once and coverage-checked (build-fail on gap). */
export function getRegistry(): Map<string, string> {
  if (!cached) {
    cached = buildRegistry(loadAllFrontmatter());
    assertMetricsCovered(cached, PLAYER_DISPLAY_METRICS);
  }
  return cached;
}

/** Term slug for a metric_key; throws if unmapped (a covered set can't miss). */
export function metricSlug(key: string): string {
  const slug = getRegistry().get(key);
  if (!slug) throw new Error(`glossary registry has no page for metric "${key}"`);
  return slug;
}
