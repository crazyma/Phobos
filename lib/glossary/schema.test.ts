import { describe, expect, it } from "vitest";
import { FrontmatterSchema } from "./schema.ts";

const bands = {
  mlb: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aaa: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aa: [{ max: 100, label: "及格" }, { label: "厲害" }],
};

const valid = () => structuredClone({
  slug: "woba",
  name_zh: "加權上壘率",
  name_en: "wOBA",
  category: "batting_adv",
  applies_to: ["batter"],
  metric_keys: ["woba"],
  higher_is_better: true,
  blurb: "把每種上壘方式依價值加權的上壘率。",
  formula: "wOBA = (...)/PA",
  bands: { batter: bands },
  sources: [{ label: "FanGraphs", url: "https://library.fangraphs.com/offense/woba/" }],
});

describe("FrontmatterSchema", () => {
  it("accepts a complete metric term", () => {
    expect(FrontmatterSchema.parse(valid()).slug).toBe("woba");
  });

  it("rejects a missing required field", () => {
    const fm = valid();
    delete (fm as Record<string, unknown>).blurb;
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("rejects bands with a level outside mlb/aaa/aa", () => {
    const fm = valid();
    (fm.bands.batter as Record<string, unknown>).a_plus = bands.mlb;
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("rejects non-ascending band ranges", () => {
    const fm = valid();
    fm.bands.batter.mlb = [{ max: 100, label: "a" }, { max: 80, label: "b" }, { label: "c" }];
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("rejects a non-last band that omits max", () => {
    const fm = valid();
    fm.bands.batter.mlb = [{ label: "open" }, { max: 100, label: "b" }];
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("requires band perspectives to match applies_to (shared term)", () => {
    const fm = valid();
    fm.applies_to = ["batter", "pitcher"]; // but bands only has batter
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("accepts a shared term with both perspectives", () => {
    const fm = valid();
    fm.category = "shared_adv";
    fm.applies_to = ["batter", "pitcher"];
    fm.bands = structuredClone({ batter: bands, pitcher: bands }) as typeof fm.bands;
    expect(FrontmatterSchema.parse(fm).applies_to).toHaveLength(2);
  });

  it("rejects a roster term that carries metric_keys or bands", () => {
    const fm = valid();
    fm.category = "roster";
    fm.metric_keys = ["il"];
    expect(() => FrontmatterSchema.parse(fm)).toThrow();
  });

  it("accepts a roster term with no metric_keys and no bands", () => {
    const parsed = FrontmatterSchema.parse({
      slug: "il",
      name_zh: "傷兵名單",
      name_en: "IL",
      category: "roster",
      applies_to: ["batter", "pitcher"],
      metric_keys: [],
      higher_is_better: false,
      blurb: "球員因傷暫離現役名單。",
      sources: [{ label: "MLB", url: "https://www.mlb.com/glossary/rules/injured-list" }],
    });
    expect(parsed.metric_keys).toHaveLength(0);
  });
});
