import { describe, expect, it } from "vitest";
import { teamDisplayName, teamLogo, type TeamMap } from "./team-map.ts";

/**
 * 球隊顯示名（spec-01 C.2）：大聯盟 30 支人工中文名，小聯盟不逐支翻譯，
 * 改用「母隊中文名 + 層級（原名）」推導。
 */
describe("teamDisplayName", () => {
  it("大聯盟用人工中文隊名", () => {
    expect(
      teamDisplayName({
        nameZh: "紅襪",
        nameEn: "Boston Red Sox",
        level: "mlb",
        parentNameZh: null,
      }),
    ).toBe("紅襪");
  });

  it("小聯盟由母隊中文名 + 層級推導，附原名以利辨識", () => {
    expect(
      teamDisplayName({
        nameZh: null,
        nameEn: "Worcester Red Sox",
        level: "aaa",
        parentNameZh: "紅襪",
      }),
    ).toBe("紅襪 3A（Worcester Red Sox）");
  });

  it("withLevel: false 給已經自己印層級徽章的介面（名冊列）", () => {
    // 否則名冊列會變成「3A・紅襪 3A（…）」，層級講兩次。
    expect(
      teamDisplayName(
        { nameZh: null, nameEn: "Reno Aces", level: "aaa", parentNameZh: "響尾蛇" },
        { withLevel: false },
      ),
    ).toBe("響尾蛇（Reno Aces）");
  });

  it("母隊沒有中文名時退回球隊原名，不吐空字串", () => {
    // 30 支 seed 齊全就不會走到這裡，但缺一支時要看得出是哪一隊。
    expect(
      teamDisplayName({
        nameZh: null,
        nameEn: "Sugar Land Space Cowboys",
        level: "aaa",
        parentNameZh: null,
      }),
    ).toBe("Sugar Land Space Cowboys");
  });

  it("小聯盟球隊自己的 name_zh 不參與推導", () => {
    // 逐支翻譯是本規則刻意否決的方向；就算資料庫裡殘留舊譯名也不採用。
    expect(
      teamDisplayName({
        nameZh: "里諾王牌",
        nameEn: "Reno Aces",
        level: "aaa",
        parentNameZh: "響尾蛇",
      }),
    ).toBe("響尾蛇 3A（Reno Aces）");
  });

  it("每個層級都有中文層級字樣", () => {
    const parts = { nameZh: null, nameEn: "X Club", parentNameZh: "老虎" } as const;
    expect(teamDisplayName({ ...parts, level: "aa" })).toBe("老虎 2A（X Club）");
    expect(teamDisplayName({ ...parts, level: "a_plus" })).toBe("老虎 高階1A（X Club）");
    expect(teamDisplayName({ ...parts, level: "rookie" })).toBe("老虎 新人聯盟（X Club）");
  });
});

describe("teamLogo", () => {
  const map: TeamMap = new Map([
    [10, { abbrev: "BOS", name: "紅襪", parentTeamId: 10 }],
    [110, { abbrev: "WOR", name: "紅襪（Worcester Red Sox）", parentTeamId: 10 }],
    [999, { abbrev: "UNK", name: "未知隊", parentTeamId: 404 }],
  ]);

  it("MLB 直取 logo id，素材未到位時回 null", () => {
    expect(teamLogo(10, map)).toBeNull();
    expect(teamLogo(10, map, new Set([10]))).toBe("/logos/10.svg");
    expect(teamLogo(null, map)).toBeNull();
  });

  it("小聯盟走母隊 id，且不增加 DB 往返", () => {
    expect(teamLogo(110, map, new Set([10]))).toBe("/logos/10.svg");
  });

  it("母隊解不出或素材不存在時回 null", () => {
    expect(teamLogo(999, map, new Set([999]))).toBeNull();
    expect(teamLogo(404, map, new Set([10]))).toBeNull();
  });
});
