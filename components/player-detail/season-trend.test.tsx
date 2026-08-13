import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonTrend, trendTone } from "./season-trend.tsx";

describe("SeasonTrend", () => {
  it("labels the metric and latest value even for a one-point series", () => {
    const html = renderToStaticMarkup(
      <SeasonTrend trend={{ batting: [{ level: "mlb", levelLabel: "大聯盟", latest: 0.3, points: [{ gameDate: "2026-04-01", value: 0.3 }] }], pitching: [] }} />,
    );

    expect(html).toContain("本季累積打擊率走勢");
    expect(html).toContain("0.300");
    expect(html).not.toContain("Infinity");
  });

  it("hides the entire section without qualified series", () => {
    expect(renderToStaticMarkup(<SeasonTrend trend={{ batting: [], pitching: [] }} />)).toBe("");
  });

  it("evaluates AVG and ERA directions independently", () => {
    expect(trendTone([{ value: 0.25 }, { value: 0.3 }], true)).toBe("up");
    expect(trendTone([{ value: 4.5 }, { value: 3.2 }], false)).toBe("up");
    expect(trendTone([{ value: 3.2 }, { value: 4.5 }], false)).toBe("down");
  });
});
