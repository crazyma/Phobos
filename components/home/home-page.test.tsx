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

/** 沒有任何賽事的首頁；`emptyState` 由各測試自行決定要不要給。 */
function homeWithoutGames(emptyState: unknown) {
  return HomeSchema.parse({ ...activeHome, digestDate: null, gameCards: [], emptyState });
}

const glossaryPicks = [{
  nameZh: "純長打率", nameEn: "ISO", blurb: "衡量純長打能力", link: "/glossary/iso",
}];

describe("HomePageView", () => {
  it("renders result cards, transaction feed, and upcoming-game tag", () => {
    const html = renderToStaticMarkup(<HomePageView home={activeHome} />);

    expect(html).toContain("近期賽果");
    expect(html).toContain("IP 局數");
    expect(html).toContain("5.2 局");
    expect(html).toContain("上一場飆 7K");
    expect(html).toContain("升上大聯盟");
    expect(html).toContain("確定先發");
    expect(html).toContain("/players/1");
  });

  it("只在有賽事時掛出「今日焦點」", () => {
    const withGames = renderToStaticMarkup(<HomePageView home={activeHome} />);
    expect(withGames).toContain("今日焦點");
    // 焦點取第一張卡：姓名、球隊、近況與該角色的數據面板都要在。
    expect(withGames).toContain('id="today-focus"');
    expect(withGames).toContain("TPE");
    expect(withGames).toContain("閱讀完整檔案");

    // 沒有賽事就沒有焦點——連 heading 的 anchor 都不該留下。
    const noGames = renderToStaticMarkup(
      <HomePageView home={homeWithoutGames(null)} />,
    );
    expect(noGames).not.toContain("今日焦點");
    expect(noGames).not.toContain('id="today-focus"');
  });

  it("依序退回三層：賽果 → 本季回顧 → 全空佔位", () => {
    const withGames = renderToStaticMarkup(<HomePageView home={activeHome} />);
    expect(withGames).toContain("美國比賽日 2026-07-28");
    expect(withGames).not.toContain("本日沒有賽事");
    expect(withGames).not.toContain("近期無賽事");

    const withReview = renderToStaticMarkup(
      <HomePageView
        home={homeWithoutGames({
          seasonReviewCards: [{
            playerId: 2, nameZh: "回顧球員", season: 2025,
            batting: { g: 20, h: 22, hr: 3, rbi: 12, avg: 0.3 },
            pitching: null, recentForm: "近況整理中",
          }],
          glossaryPicks,
        })}
      />,
    );
    expect(withReview).toContain("本日沒有賽事");
    expect(withReview).toContain("本季／上季回顧");
    expect(withReview).not.toContain("近期無賽事");
    expect(withReview).not.toContain("美國比賽日");

    // 連 emptyState 都算不出來時，只剩最陽春的佔位。
    const bare = renderToStaticMarkup(<HomePageView home={homeWithoutGames(null)} />);
    expect(bare).toContain("近期無賽事");
    expect(bare).not.toContain("本日沒有賽事");
    expect(bare).not.toContain("本季／上季回顧");
  });

  it("replaces no-result placeholder with season review and glossary picks", () => {
    const html = renderToStaticMarkup(
      <HomePageView
        home={homeWithoutGames({
          seasonReviewCards: [{
            playerId: 2, nameZh: "回顧球員", season: 2025,
            batting: { g: 20, h: 22, hr: 3, rbi: 12, avg: 0.3 },
            pitching: null, recentForm: "近況整理中",
          }],
          glossaryPicks,
        })}
      />,
    );

    expect(html).toContain("本季／上季回顧");
    expect(html).toContain("回顧球員");
    expect(html).toContain("棒球名詞");
    expect(html).toContain("純長打率");
    expect(html).not.toContain("近期無賽事");
  });

  it("回顧卡：二刀流球員的打擊與投球兩份都要出現", () => {
    // 迴歸守門員。`getHome` 的 battingLine / pitchingLine 是各自算的，兩者皆非 null
    // 就是二刀流；若這裡寫成單一三元運算子，投球那份會被吃掉。
    const html = renderToStaticMarkup(
      <HomePageView
        home={homeWithoutGames({
          seasonReviewCards: [{
            playerId: 7, nameZh: "二刀流", season: 2025,
            batting: { g: 30, h: 41, hr: 6, rbi: 25, avg: 0.301 },
            pitching: { g: 12, ipOuts: 100, w: 5, l: 3, era: 2.71, so: 77 },
            recentForm: "投打雙修",
          }],
          glossaryPicks,
        })}
      />,
    );

    // 打擊那份
    expect(html).toContain("41 安");
    expect(html).toContain("6 轟");
    expect(html).toContain("25 打點");
    // 投球那份——同一張卡片裡不能因為有打擊就消失
    expect(html).toContain("33.1 局");
    expect(html).toContain("77 三振");
  });

  it("回顧卡：兩份都沒有時留佔位", () => {
    const html = renderToStaticMarkup(
      <HomePageView
        home={homeWithoutGames({
          seasonReviewCards: [{
            playerId: 8, nameZh: "無成績", season: null,
            batting: null, pitching: null, recentForm: "近況同步中",
          }],
          glossaryPicks,
        })}
      />,
    );

    expect(html).toContain("尚無球季成績");
    expect(html).toContain("—");
  });

  it("異動快訊：升／降／中性三種語氣各自不同色", () => {
    // 刻意不寫出 Tailwind class 字串（Tailwind 會掃測試檔，寫出來就會被編進
    // CSS bundle），改成比對三種語氣的 class 互不相同。
    const html = renderToStaticMarkup(
      <HomePageView
        home={HomeSchema.parse({
          ...activeHome,
          events: [
            { playerId: 1, nameZh: "甲", type: "call_up", typeLabel: "升上大聯盟", date: "2026-07-29", description: null },
            { playerId: 2, nameZh: "乙", type: "send_down", typeLabel: "下放小聯盟", date: "2026-07-28", description: null },
            { playerId: 3, nameZh: "丙", type: "trade", typeLabel: "交易", date: "2026-07-27", description: null },
          ],
        })}
      />,
    );

    const toneClass = (nameZh: string) => {
      const match = html.match(new RegExp(`<a class="([^"]+)"[^>]*>[^<]*${nameZh}</a>`));
      expect(match, `找不到 ${nameZh} 的異動連結`).not.toBeNull();
      return match![1];
    };

    const [up, down, neutral] = ["甲", "乙", "丙"].map(toneClass);
    expect(up).not.toBe(down);
    expect(up).not.toBe(neutral);
    expect(down).not.toBe(neutral);
  });
});
