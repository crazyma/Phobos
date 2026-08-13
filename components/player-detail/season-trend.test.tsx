import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeasonTrend } from "./season-trend.tsx";

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

  // 走勢線不再做方向配色（`trendTone` 已移除，理由見 `season-trend.tsx`）；
  // 方向資訊改由文字承擔，所以這裡驗的是那行小字而不是顏色。
  it("states the direction in words instead of colouring the line", () => {
    const html = renderToStaticMarkup(
      <SeasonTrend
        trend={{
          batting: [{ level: "mlb", levelLabel: "大聯盟", latest: 0.256, points: [{ gameDate: "2026-04-01", value: 0.4 }, { gameDate: "2026-04-02", value: 0.256 }] }],
          pitching: [{ level: "aaa", levelLabel: "3A", latest: 3.2, points: [{ gameDate: "2026-04-01", value: 4.5 }, { gameDate: "2026-04-02", value: 3.2 }] }],
        }}
      />,
    );

    expect(html).toContain("數字越高越好");
    expect(html).toContain("數字越低越好");
    expect(html).not.toContain("text-up");
    expect(html).not.toContain("text-down");
  });
});
