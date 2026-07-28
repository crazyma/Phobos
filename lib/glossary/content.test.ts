import { describe, expect, it } from "vitest";
import { loadAllFrontmatter } from "./content.ts";
import { assertMetricsCovered, buildRegistry } from "./registry.ts";
import { PLAYER_DISPLAY_METRICS } from "./metrics.ts";

// Real content dir: the term files ship valid frontmatter, and the registry
// they produce covers every metric the player page can display (spec-04 §D).
describe("glossary content", () => {
  const terms = loadAllFrontmatter();

  it("parses every term file's frontmatter", () => {
    expect(terms.length).toBeGreaterThanOrEqual(24);
  });

  it("ships all eight standard and six roster v1 explainers outside the metric registry", () => {
    const standard = terms.filter((term) => term.category === "standard");
    const roster = terms.filter((term) => term.category === "roster");
    expect(standard).toHaveLength(8);
    expect(roster).toHaveLength(6);
    expect([...standard, ...roster].every((term) => term.metric_keys.length === 0)).toBe(true);
  });

  it("covers all player-page display metrics (build-fail guard)", () => {
    const registry = buildRegistry(terms);
    expect(() => assertMetricsCovered(registry, PLAYER_DISPLAY_METRICS)).not.toThrow();
  });

  it("gives shared terms bands for both perspectives", () => {
    const war = terms.find((t) => t.slug === "war");
    expect(war?.bands?.batter).toBeDefined();
    expect(war?.bands?.pitcher).toBeDefined();
  });
});
