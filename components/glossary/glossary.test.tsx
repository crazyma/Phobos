import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LevelBandSet } from "@/lib/glossary/schema";
import { BandsTable } from "./bands-table.tsx";
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

  it("reverses good-tone direction when the perspective reverses", () => {
    const batter = renderToStaticMarkup(<BandsTable bands={{ batter: set }} higherIsBetter />);
    const pitcher = renderToStaticMarkup(<BandsTable bands={{ pitcher: set }} higherIsBetter={false} />);
    expect(batter).toMatch(/class="[^"]*bg-up[^"]*"[^>]*title="厲害/);
    expect(batter).toMatch(/class="[^"]*bg-down[^"]*"[^>]*title="及格/);
    expect(pitcher).toMatch(/class="[^"]*bg-down[^"]*"[^>]*title="厲害/);
    expect(pitcher).toMatch(/class="[^"]*bg-up[^"]*"[^>]*title="及格/);
  });

  it("labels both perspectives for a shared term", () => {
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: set, pitcher: set }} higherIsBetter />);
    expect(html).toContain("打者視角");
    expect(html).toContain("投手視角");
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
