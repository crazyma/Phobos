import { describe, expect, it } from "vitest";
import { selectMetricExamples, selectRosterExamples, type MetricCandidate } from "./examples.ts";
import type { Frontmatter } from "./schema.ts";

const bandsSet = {
  mlb: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aaa: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aa: [{ max: 100, label: "及格" }, { label: "厲害" }],
};

const wrcTerm: Frontmatter = {
  slug: "wrc-plus",
  metric_keys: ["wrc_plus"],
  higher_is_better: true,
  applies_to: ["batter"],
  bands: { batter: bandsSet },
} as Frontmatter;

// Shared metric whose good-direction inverts by perspective: batter wants high
// BB%, pitcher wants low.
const bbTerm: Frontmatter = {
  slug: "bb-pct",
  metric_keys: ["bb_pct"],
  higher_is_better: true,
  higher_is_better_pitcher: false,
  applies_to: ["batter", "pitcher"],
  bands: { batter: bandsSet, pitcher: bandsSet },
} as Frontmatter;

const cand = (o: Partial<MetricCandidate>): MetricCandidate => ({
  playerId: 1, nameZh: "球員", lifecycle: "tracked", perspective: "batter",
  level: "mlb", value: 130, pa: 200, ipOuts: 0, ...o,
});

describe("selectMetricExamples", () => {
  it("returns qualifying batters, best value first at the top level", () => {
    const picks = selectMetricExamples(wrcTerm, [
      cand({ playerId: 1, nameZh: "甲", value: 110 }),
      cand({ playerId: 2, nameZh: "乙", value: 150 }),
    ]);
    expect(picks.map((p) => p.name)).toEqual(["乙", "甲"]);
    expect(picks[0]).toMatchObject({ level: "mlb", levelHeader: "MLB", bandLabel: "厲害", value: "150" });
  });

  it("hides players below the sample threshold", () => {
    expect(selectMetricExamples(wrcTerm, [cand({ pa: 20 })])).toEqual([]);
  });

  it("excludes non-graded (low) levels and archived players", () => {
    expect(
      selectMetricExamples(wrcTerm, [
        cand({ level: "a" }),
        cand({ playerId: 3, lifecycle: "archived" }),
      ]),
    ).toEqual([]);
  });

  it("picks each perspective by its own good-direction for a shared metric", () => {
    const picks = selectMetricExamples(bbTerm, [
      cand({ playerId: 1, nameZh: "高保送打者", perspective: "batter", value: 150, pa: 200 }),
      cand({ playerId: 2, nameZh: "控球差投手", perspective: "pitcher", value: 150, pa: 0, ipOuts: 120 }),
      cand({ playerId: 3, nameZh: "控球好投手", perspective: "pitcher", value: 50, pa: 0, ipOuts: 120 }),
    ]);
    // Batter side wants the high value; pitcher side wants the LOW value (not the
    // high one it would get from the term-level higher_is_better).
    expect(picks.map((p) => p.name)).toEqual(["高保送打者", "控球好投手"]);
  });

  it("skips rows with no value and prefers MLB over 3A", () => {
    const picks = selectMetricExamples(wrcTerm, [
      cand({ playerId: 1, nameZh: "小聯盟", level: "aaa", value: 140 }),
      cand({ playerId: 2, nameZh: "大聯盟", level: "mlb", value: 105 }),
      cand({ playerId: 3, nameZh: "缺值", value: null }),
    ]);
    expect(picks.map((p) => p.name)).toEqual(["大聯盟", "小聯盟"]);
  });
});

describe("selectRosterExamples", () => {
  it("takes the most recent tracked players, deduped", () => {
    const picks = selectRosterExamples([
      { playerId: 1, nameZh: "甲", lifecycle: "tracked", date: "2026-07-01", typeLabel: "傷兵名單" },
      { playerId: 2, nameZh: "乙", lifecycle: "tracked", date: "2026-07-20", typeLabel: "傷兵名單" },
      { playerId: 3, nameZh: "丙", lifecycle: "archived", date: "2026-07-25", typeLabel: "傷兵名單" },
    ]);
    expect(picks.map((p) => p.name)).toEqual(["乙", "甲"]);
  });

  it("hides when nobody matches", () => {
    expect(selectRosterExamples([])).toEqual([]);
  });
});
