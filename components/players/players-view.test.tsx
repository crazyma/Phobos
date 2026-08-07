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
  it("renders the roster: player names, team, status and recent-form fallback", () => {
    const html = renderToStaticMarkup(<PlayersView tracked={tracked} archived={[]} />);
    expect(html).toContain("鄭宗哲");
    expect(html).toContain("林昱珉");
    expect(html).toContain("3A・響尾蛇（Reno Aces）"); // 層級徽章＋推導隊名，層級只出現一次
    expect(html).toContain("連三場猛打賞");
    // null recentForm → placeholder
    expect(html).toContain("近況同步中");
    // filter + sort controls present
    expect(html).toContain("層級");
    expect(html).toContain("排序");
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
});
