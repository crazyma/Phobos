import type { TeamLevel } from "./player-status.ts";

/**
 * 球隊 logo 的解析規則。**本檔案刻意只有 type-only import**——logo 的解析結果
 * （`logoSrc`）會被塞進 `PlayerSummary` / `PlayerDetail`，而那兩個型別被
 * `"use client"` 元件（`components/players/players-view.tsx`）用到；只要這條路上
 * 任何模組 import 到 `lib/db/client.ts`，整包 `pg` 就會被拉進瀏覽器 bundle 而
 * 讓 `next build` 直接失敗（`Module not found: 'dns' / 'fs'`）。
 *
 * 也因此這裡**沒有** team map：解析只吃「球隊自己的 id + level + 母隊 id」，
 * 這三個值 server 端查球員時本來就在同一列上（`teams` 的 self-join），不必再
 * 掃一次 `teams`、更不必靠跨請求共用的可變全域。
 */

/** 素材備妥的 MLB 球隊 id；batu 放進授權檔案後才會有內容。 */
export const LICENSED_TEAM_LOGO_IDS: ReadonlySet<number> = new Set();

/** 解析 logo 需要的球隊欄位——都直接來自 `teams` 那一列。 */
export type TeamLogoParts = {
  id: number;
  level: TeamLevel;
  /** 母隊的 MLB team id；大聯盟球隊為 null。 */
  parentTeamId: number | null;
};

/**
 * logo 要用哪個 id：大聯盟用自己，小聯盟用母隊（小聯盟隊沒有自己的授權 logo）。
 * 小聯盟球隊推不出母隊時回 null——**不退回球隊自己的 id**，那個 id 永遠不會在
 * 授權清單裡，退回去只會讓「解不出」跟「大聯盟」兩種情況看起來一樣。
 */
export function logoTeamId(team: TeamLogoParts): number | null {
  return team.level === "mlb" ? team.id : team.parentTeamId;
}

/**
 * 靜態 logo 路徑，或 null。null 有兩種來源，呈現層一律當成「不畫圖」：
 * 推不出母隊 id，或素材還沒放進 `public/logos`（授權清單為空時就是全部）。
 *
 * `availableLogoIds` 可注入，讓測試不必等素材到位就能驗證解析。
 */
export function teamLogoSrc(
  team: TeamLogoParts | null | undefined,
  availableLogoIds: ReadonlySet<number> = LICENSED_TEAM_LOGO_IDS,
): string | null {
  if (!team) return null;
  const rootId = logoTeamId(team);
  if (rootId === null) return null;
  return availableLogoIds.has(rootId) ? `/logos/${rootId}.svg` : null;
}
