import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LevelBandSet } from "@/lib/glossary/schema";
import { BandsTable } from "./bands-table.tsx";
import { GlossaryExamples } from "./examples.tsx";

const set: LevelBandSet = {
  mlb: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aaa: [{ max: 100, label: "及格" }, { label: "厲害" }],
  aa: [{ max: 100, label: "及格" }, { label: "厲害" }],
};

describe("BandsTable", () => {
  it("shows MLB/3A/2A columns for a single perspective", () => {
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: set }} />);
    expect(html).toContain("MLB");
    expect(html).toContain("3A");
    expect(html).toContain("2A");
    expect(html).toContain("厲害");
    expect(html).not.toContain("打者視角"); // single perspective → no label
  });

  it("labels both perspectives for a shared term", () => {
    const html = renderToStaticMarkup(<BandsTable bands={{ batter: set, pitcher: set }} />);
    expect(html).toContain("打者視角");
    expect(html).toContain("投手視角");
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
