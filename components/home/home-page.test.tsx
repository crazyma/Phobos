import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeSchema } from "@/lib/services";
import { HomePageView } from "./home-page.tsx";

const activeHome = HomeSchema.parse({
  digestDate: "2026-07-28",
  gameCards: [{
    playerId: 1, nameZh: "測試投手", teamAbbrev: "TPE", level: "mlb", role: "pitching",
    line: { ipOuts: 17, h: 4, r: 2, er: 2, so: 7, bb: 1 }, recentForm: "上一場飆 7K",
  }],
  events: [{
    playerId: 1, nameZh: "測試投手", type: "call_up", typeLabel: "升上大聯盟",
    date: "2026-07-29", description: "Called up",
  }],
  upcoming: [{
    playerId: 1, nameZh: "測試投手", opponent: "BOS", startTimeUtc: "2026-07-30T00:05:00.000Z",
    tag: "probable_starter",
  }],
  emptyState: null,
  dataUpdatedAt: "2026-07-29T00:00:00.000Z",
});

describe("HomePageView", () => {
  it("renders result cards, transaction feed, and upcoming-game tag", () => {
    const html = renderToStaticMarkup(<HomePageView home={activeHome} />);

    expect(html).toContain("近期賽果");
    expect(html).toContain("今日焦點");
    expect(html).toContain("IP 局數");
    expect(html).toContain("5.2 局");
    expect(html).toContain("上一場飆 7K");
    expect(html).toContain("升上大聯盟");
    expect(html).toContain("確定先發");
    expect(html).toContain("/players/1");
    expect(html).toContain("text-up");
  });

  it("replaces no-result placeholder with season review and glossary picks", () => {
    const home = HomeSchema.parse({
      ...activeHome,
      digestDate: null,
      gameCards: [],
      emptyState: {
        seasonReviewCards: [{
          playerId: 2, nameZh: "回顧球員", season: 2025,
          batting: { g: 20, h: 22, hr: 3, rbi: 12, avg: 0.3 },
          pitching: null, recentForm: "近況整理中",
        }],
        glossaryPicks: [{
          nameZh: "純長打率", nameEn: "ISO", blurb: "衡量純長打能力", link: "/glossary/iso",
        }],
      },
    });
    const html = renderToStaticMarkup(<HomePageView home={home} />);

    expect(html).toContain("本季／上季回顧");
    expect(html).toContain("回顧球員");
    expect(html).toContain("棒球名詞");
    expect(html).toContain("純長打率");
    expect(html).not.toContain("近期無賽事");
  });
});
