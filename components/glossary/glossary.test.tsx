import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Band, LevelBandSet } from "@/lib/glossary/schema";
import { BandsTable, bandTones, scaleGeometry } from "./bands-table.tsx";
import { GlossaryExamples } from "./examples.tsx";
import { RosterExamples } from "./roster-examples.tsx";
import { filterGlossaryTerms } from "./glossary-index-client.tsx";

const set: LevelBandSet = {
  mlb: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aaa: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aa: [{ max: 100, label: "及格" }, { label: "厲害" }],
};

describe("BandsTable", () => {
  it("shows MLB/3A/2A stacked scales for a single perspective", () => {
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: set }} higherIsBetter />);
    expect(html).toContain("大聯盟");
    expect(html).toContain("3A");
    expect(html).toContain("2A");
    expect(html).toContain("厲害");
    expect(html).not.toContain("打者視角"); // single perspective → no label
  });

  it("reverses the tone ramp when the perspective reverses", () => {
    const batter = renderToStaticMarkup(<BandsTable bands={{ batter: set }} higherIsBetter />);
    const pitcher = renderToStaticMarkup(<BandsTable bands={{ pitcher: set }} higherIsBetter={false} />);
    // 及格 (low end) then 厲害 (high end): the accent lands on the good end, which flips.
    expect(bandTones(2, true)).toEqual(["low", "high"]);
    expect(bandTones(2, false)).toEqual(["high", "low"]);
    expect(batter.indexOf("bg-muted")).toBeLessThan(batter.indexOf("bg-accent"));
    expect(pitcher.indexOf("bg-accent")).toBeLessThan(pitcher.indexOf("bg-muted"));
    // Never the up/down palette — green/red mean rise/fall elsewhere on the site.
    expect(batter).not.toContain("bg-up");
    expect(batter).not.toContain("bg-down");
  });

  it("keeps interior bands mid-tone and leaves a lone band neutral", () => {
    expect(bandTones(5, false)).toEqual(["high", "mid", "mid", "mid", "low"]);
    expect(bandTones(1, true)).toEqual(["mid"]);
  });

  it("labels both perspectives for a shared term", () => {
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: set, pitcher: set }} higherIsBetter />);
    expect(html).toContain("打者視角");
    expect(html).toContain("投手視角");
  });
});

describe("BandScale geometry", () => {
  /** Every `left:` offset React rendered, in document order. */
  const seamOffsets = (html: string) => [...html.matchAll(/left:([\d.]+)%/g)].map((m) => Number(m[1]));

  it("puts each seam at the cumulative width of the segments to its left", () => {
    // Uneven on purpose: equal-width bands would hide an off-by-one segment.
    const bands = [{ max: 1, label: "a" }, { max: 4, label: "b" }, { max: 5, label: "c" }, { label: "d" }];
    const { widths, seams } = scaleGeometry(bands);
    expect(widths).toEqual([0.375, 0.375, 0.125, 0.125]);
    expect(seams).toEqual([
      { value: 1, offset: 0.375 },
      { value: 4, offset: 0.75 },
      { value: 5, offset: 0.875 },
    ]);
    // …and each offset is exactly the running sum of the widths before its own boundary.
    seams.forEach((seam, i) => {
      const cumulative = widths.slice(0, i + 1).reduce((sum, w) => sum + w, 0);
      expect(seam.offset).toBeCloseTo(cumulative, 10);
    });
  });

  it("renders those offsets as absolute positions, not flex columns", () => {
    const uneven: LevelBandSet = {
      mlb: [{ max: 1, label: "a" }, { max: 4, label: "b" }, { max: 5, label: "c" }, { label: "d" }],
      aaa: [{ max: 1, label: "a" }, { label: "b" }],
      aa: [{ max: 1, label: "a" }, { label: "b" }],
    };
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: uneven }} higherIsBetter />);
    // MLB's three seams first, then one seam each for 3A and 2A (two even bands → 50%).
    expect(seamOffsets(html)).toEqual([37.5, 75, 87.5, 50, 50]);
  });

  it("aligns k-pct's five even bands with the 20% grid", () => {
    const kPct: Band[] = [
      { max: 0.15, label: "接觸型" },
      { max: 0.2, label: "普通" },
      { max: 0.25, label: "偏高" },
      { max: 0.3, label: "易被三振" },
      { label: "高三振" },
    ];
    const { seams } = scaleGeometry(kPct);
    expect(seams.map((s) => [s.value, Math.round(s.offset * 1000) / 10])).toEqual([
      [0.15, 20],
      [0.2, 40],
      [0.25, 60],
      [0.3, 80],
    ]);
  });
});

describe("glossary search", () => {
  it("matches Chinese name, English abbreviation, and blurb", () => {
    const terms = [{ name_zh: "純長打率", name_en: "ISO", blurb: "長打能力", slug: "iso" }, { name_zh: "打擊率", name_en: "AVG", blurb: "命中率", slug: "avg" }] as never[];
    expect(filterGlossaryTerms(terms, "iso")).toHaveLength(1);
    expect(filterGlossaryTerms(terms, "命中")).toHaveLength(1);
    expect(filterGlossaryTerms(terms, "  ")).toHaveLength(2);
  });
});

describe("RosterExamples", () => {
  it("renders recent transaction players with date and type", () => {
    const html = renderToStaticMarkup(
      <RosterExamples picks={[{ playerId: 42, name: "王小明", date: "2026-07-28", typeLabel: "進入傷兵名單" }]} />,
    );
    expect(html).toContain("最近有此類異動的球員");
    expect(html).toContain("王小明");
    expect(html).toContain("2026-07-28");
    expect(html).toContain("進入傷兵名單");
    expect(html).toContain("/players/42");
  });

  it("renders nothing without matching transactions", () => {
    expect(renderToStaticMarkup(<RosterExamples picks={[]} />)).toBe("");
  });
});

describe("GlossaryExamples", () => {
  it("renders example players with value + band + player link", () => {
    const html = renderToStaticMarkup(
      <GlossaryExamples
        picks={[
          { playerId: 42, name: "王小明", value: "130", level: "mlb", levelHeader: "MLB", bandLabel: "厲害" },
        ]}
      />,
    );
    expect(html).toContain("王小明");
    expect(html).toContain("130");
    expect(html).toContain("厲害");
    expect(html).toContain("/players/42");
  });

  it("renders nothing when there are no picks (block hidden)", () => {
    expect(renderToStaticMarkup(<GlossaryExamples picks={[]} />)).toBe("");
  });
});
