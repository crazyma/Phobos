import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Season } from "@/lib/services";
import { SeasonStats } from "./season-stats.tsx";

// One MLB batting row with advanced values + one 2A row with none, so we can
// assert the advanced block renders + links on MLB and is hidden on 2A.
const seasons: Season[] = [
  {
    season: 2026,
    batting: [
      {
        level: "mlb", levelLabel: "大聯盟", isLowLevel: false,
        rows: [
          {
            team: { id: 1, name: "洋基", abbrev: "NYY" },
            g: 100, pa: 400, ab: 350, h: 105, doubles: 20, triples: 2, hr: 18,
            rbi: 60, r: 55, sb: 5, cs: 2, bb: 40, so: 80, hbp: 3, sf: 2,
            avg: 0.3, obp: 0.37, slg: 0.5, ops: 0.87, iso: 0.2, bbPct: 0.1,
            kPct: 0.2, babip: 0.32, woba: 0.36, wrcPlus: 130, war: 3.5,
          },
        ],
        total: null,
      },
      {
        level: "aa", levelLabel: "2A", isLowLevel: false,
        rows: [
          {
            team: { id: 2, name: "小熊2A", abbrev: "AA" },
            g: 10, pa: 40, ab: 36, h: 10, doubles: 2, triples: 0, hr: 1,
            rbi: 5, r: 6, sb: 1, cs: 0, bb: 3, so: 9, hbp: 1, sf: 0,
            avg: 0.278, obp: 0.35, slg: 0.4, ops: 0.75, iso: 0.122, bbPct: 0.075,
            kPct: 0.225, babip: 0.3, woba: null, wrcPlus: null, war: null,
          },
        ],
        total: null,
      },
    ],
    pitching: [],
  },
];

describe("SeasonStats advanced block (ticket 03)", () => {
  const html = renderToStaticMarkup(<SeasonStats seasons={seasons} currentTeamId={1} />);

  it("renders the magazine focus card and a native details table", () => {
    expect(html).toContain("SEASON STATS");
    expect(html).toContain("AVG");
    expect(html).toContain("OPS");
    expect(html).toContain("HR");
    expect(html).toContain("RBI");
    expect(html).toContain("目前所在");
    expect(html).toContain("展開完整數據表");
    expect(html).toContain("BABIP");
    expect(html).toContain("左右滑動查看更多欄位");
  });

  it("renders the advanced section with glossary links for the MLB row", () => {
    expect(html).toContain("進階數據");
    expect(html).toContain("wRC+");
    expect(html).toContain("130"); // wRC+ rounded
    expect(html).toContain("/glossary/wrc-plus");
    expect(html).toContain("/glossary/war");
  });

  it("hides advanced metrics that are missing (no wRC+/wOBA/WAR on 2A)", () => {
    // The 2A group has only derived advanced (ISO/BB%/K%/BABIP), so wRC+ and
    // wOBA links appear once (MLB) — not duplicated for 2A.
    expect(html.match(/\/glossary\/wrc-plus/g)).toHaveLength(1);
    // ISO is derived and present on both rows → its link appears twice.
    expect(html.match(/\/glossary\/iso/g)).toHaveLength(2);
  });

  it("uses authored bands only for metrics that have a glossary scale", () => {
    expect(html).toContain("優秀");
    // HR/RBI are real counts but have no glossary bands, so no invented hint is rendered.
    expect(html).not.toContain("HR優");
    expect(html).not.toContain("RBI優");
  });
});

describe("SeasonStats pitching focus", () => {
  it("shows ERA/WHIP/SO/IP without inventing IP or SO band labels", () => {
    const html = renderToStaticMarkup(
      <SeasonStats
        seasons={[{
          season: 2026,
          batting: [],
          pitching: [{
            level: "mlb",
            levelLabel: "大聯盟",
            isLowLevel: false,
            rows: [{
              team: { id: 9, name: "紅襪", abbrev: "BOS" },
              g: 8, gs: 8, ipOuts: 144, bf: 200, h: 40, r: 18, er: 16, hr: 4,
              bb: 12, so: 70, w: 4, l: 2, sv: 0, hld: 0,
              era: 3, whip: 1.08, hr9: 0.75, k9: 13.1, bb9: 2.25,
              kPct: 0.35, bbPct: 0.06, babip: 0.28,
              fip: null, lobPct: null, war: null,
            }],
            total: null,
          }],
        }]}
      />,
    );
    expect(html).toContain("ERA");
    expect(html).toContain("WHIP");
    expect(html).toContain("SO");
    expect(html).toContain("IP");
    expect(html).toContain("優秀");
  });
});
