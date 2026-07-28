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
  const html = renderToStaticMarkup(<SeasonStats seasons={seasons} />);

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
});
