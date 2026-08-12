import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "@/lib/services";
import { PlayersView } from "./players-view.tsx";

const tracked: PlayerSummary[] = [
  {
    playerId: 1,
    nameEn: "Tsung-Che Cheng",
    nameZh: "鄭宗哲",
    primaryPosition: "SS",
    lifecycle: "tracked",
    team: { id: 10, name: "響尾蛇（Reno Aces）", abbrev: "RNO", level: "aaa", levelLabel: "3A" },
    statusSentence: "3A",
    recentForm: "連三場猛打賞",
  },
  {
    playerId: 2,
    nameEn: "Yu-Min Lin",
    nameZh: "林昱珉",
    primaryPosition: "P",
    lifecycle: "tracked",
    team: null,
    statusSentence: "狀態同步中",
    recentForm: null,
  },
];

const archived: PlayerSummary[] = [
  {
    playerId: 3,
    nameEn: "Retired Guy",
    nameZh: "老將",
    primaryPosition: "OF",
    lifecycle: "archived",
    team: null,
    statusSentence: "已離開美職",
    recentForm: null,
  },
];

describe("PlayersView (page smoke)", () => {
  it("renders the magazine roster: level section, chip filters, player details and recent-form fallback", () => {
    const html = renderToStaticMarkup(<PlayersView tracked={tracked} archived={[]} />);
    expect(html).toContain("鄭宗哲");
    expect(html).toContain("林昱珉");
    expect(html).toContain("3A 一階之遙");
    expect(html).toContain("Triple-A");
    expect(html).toContain("1 位");
    expect(html).toContain("SS ・ 響尾蛇（Reno Aces）");
    expect(html).not.toContain("3A・響尾蛇（Reno Aces）"); // 隊名不重複印層級
    expect(html).toContain("連三場猛打賞");
    // null recentForm → placeholder
    expect(html).toContain("近況同步中");
    // level filter uses chips, while sort stays a select.
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("全部");
    expect(html).toContain("排序");
    expect(html).toContain("<select");
  });

  it("renders every populated level from LEVEL_ORDER with Chinese and English labels", () => {
    const everyLevel = ["mlb", "aaa", "aa", "a_plus", "a", "rookie"] as const;
    const levelNames = [
      ["大聯盟現役", "Major League"],
      ["3A 一階之遙", "Triple-A"],
      ["2A 養成階段", "Double-A"],
      ["高階 1A 養成", "High-A"],
      ["1A 養成階段", "Single-A"],
      ["新人聯盟養成", "Rookie League"],
    ];
    const players = everyLevel.map((level, index) => ({
      ...tracked[0],
      playerId: index + 10,
      team: {
        id: index + 20,
        name: `${level} 隊`,
        abbrev: level.toUpperCase(),
        level,
        levelLabel: level,
      },
    }));

    const html = renderToStaticMarkup(<PlayersView tracked={players} archived={[]} />);
    for (const [zh, en] of levelNames) {
      expect(html).toContain(zh);
      expect(html).toContain(en);
    }
  });

  it("shows the 歷史球員 collapsible only when archived players exist", () => {
    const withArchived = renderToStaticMarkup(
      <PlayersView tracked={tracked} archived={archived} />,
    );
    expect(withArchived).toContain("歷史球員");
    expect(withArchived).toContain("老將");

    const withoutArchived = renderToStaticMarkup(
      <PlayersView tracked={tracked} archived={[]} />,
    );
    expect(withoutArchived).not.toContain("歷史球員");
  });

  it("shows the shared empty state when no tracked player is available", () => {
    const html = renderToStaticMarkup(<PlayersView tracked={[]} archived={[]} />);
    expect(html).toContain("目前沒有符合條件的球員");
    expect(html).toContain("調整篩選條件後再試試看");
  });
});
