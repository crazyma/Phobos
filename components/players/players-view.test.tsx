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
    // 層級篩選是 chip；排序控制項已移除（分區渲染後「依姓名/依層級」輸出一致）。
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("全部");
    expect(html).not.toContain("排序");
    expect(html).not.toContain("<select");
  });

  it("keeps name ordering even though the sort control is gone", () => {
    // DB 回傳順序刻意反過來；輸出仍應是 zh-Hant 姓名序。
    const sameLevel: PlayerSummary[] = [
      { ...tracked[0], playerId: 101, nameEn: "Wei-Chung Wang", nameZh: "王維中" },
      { ...tracked[0], playerId: 102, nameEn: "Chih-Jung Liu", nameZh: "劉致榮" },
    ];
    const html = renderToStaticMarkup(<PlayersView tracked={sameLevel} archived={[]} />);
    const expected = ["王維中", "劉致榮"].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    expect(html.indexOf(expected[0])).toBeLessThan(html.indexOf(expected[1]));
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
    // 封存的視覺訊號＝壓底色，且必須在「展開後」還看得到（不能被 open 狀態覆寫抵銷）。
    // 注意：本檔的斷言字串刻意不寫出「已經不該存在」的完整 Tailwind class
    //（例如把 variant 與 utility 用冒號接起來的那種），因為 Tailwind 會掃描測試檔，
    // 完整字串會被當成候選字、把死掉的 utility 重新編回 CSS bundle。
    expect(withArchived).toMatch(/bg-muted(?![-\w])/); // 不要誤中 bg-muted-foreground
    expect(withArchived).not.toContain("group-open");
    // 不再用 opacity 降對比——那會把次要小字壓到 WCAG AA 4.5:1 以下。
    expect(withArchived).not.toMatch(/opacity-\d/);

    const withoutArchived = renderToStaticMarkup(
      <PlayersView tracked={tracked} archived={[]} />,
    );
    expect(withoutArchived).not.toContain("歷史球員");
  });

  it("de-accents archived cards instead of fading them", () => {
    // 只渲染封存球員（tracked 留空），避免比對到現役卡片與 chip 上的 accent。
    const archivedOnly = renderToStaticMarkup(<PlayersView tracked={[]} archived={archived} />);
    const trackedOnly = renderToStaticMarkup(<PlayersView tracked={tracked} archived={[]} />);

    // 現役卡片的橘色重點：頂端短線與狀態句左側直線。
    expect(trackedOnly).toContain("h-0.5 w-8 bg-accent");
    expect(trackedOnly).toContain("border-l-4 border-accent");

    // 封存卡片同樣位置換成灰色，整張去彩度；文字色不動，所以對比不受影響。
    expect(archivedOnly).toContain("老將");
    expect(archivedOnly).toContain("h-0.5 w-8 bg-muted-foreground");
    expect(archivedOnly).toContain("border-l-4 border-muted-foreground");
    expect(archivedOnly).not.toContain("h-0.5 w-8 bg-accent");
    expect(archivedOnly).not.toContain("border-l-4 border-accent");
  });

  it("shows the shared empty state when no tracked player is available", () => {
    const html = renderToStaticMarkup(<PlayersView tracked={[]} archived={[]} />);
    expect(html).toContain("目前沒有符合條件的球員");
    expect(html).toContain("調整篩選條件後再試試看");
  });
});
