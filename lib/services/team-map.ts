import { db as defaultDb } from "../db/client.ts";
import { teams } from "../db/schema/index.ts";
import { levelLabel, type TeamLevel } from "./player-status.ts";

/** A team as shown next to a game line: zh name (falling back to en) + abbrev. */
export type TeamRef = {
  abbrev: string | null;
  name: string;
};
export type TeamMap = Map<number, TeamRef>;

/** What deciding a team's Chinese display name needs (spec-01 C.2). */
export type TeamNameParts = {
  nameZh: string | null;
  nameEn: string;
  level: TeamLevel;
  /** 母隊的中文名；大聯盟球隊為 null。 */
  parentNameZh: string | null;
};

/**
 * 球隊顯示名。大聯盟用人工中文隊名；小聯盟**不逐支翻譯**，改用
 * 「母隊中文名 + 層級（原名）」——小聯盟隊名在中文沒有既定譯法，而且會改名
 * 增隊，逐支翻譯追不完；台灣媒體本來就講「紅襪 3A」。
 *
 * `withLevel` 由呼叫端決定，因為兩種介面的需求相反：名冊列自己已經印了一個
 * 層級徽章（`levelLabel`），隊名再帶一次會變成「3A・紅襪 3A（…）」；而季數據
 * 表一列跨多個層級，層級**必須**留在隊名裡才分得出來。
 *
 * 母隊沒有中文名時（30 支 seed 齊全就不會發生）退回球隊原名，不吐空字串。
 */
export function teamDisplayName(
  team: TeamNameParts,
  { withLevel = true }: { withLevel?: boolean } = {},
): string {
  if (team.level === "mlb") return team.nameZh ?? team.nameEn;
  if (team.parentNameZh === null) return team.nameEn;
  const level = withLevel ? `${levelLabel(team.level) ?? ""}` : "";
  return `${team.parentNameZh}${level ? ` ${level}` : ""}（${team.nameEn}）`;
}

/**
 * Load every team keyed by id. The `teams` table is small (all tracked orgs +
 * their affiliates), so one full scan per page is fine — but load it once and
 * pass it to the per-section resolvers rather than scanning per section.
 */
export async function loadTeamMap(db = defaultDb): Promise<TeamMap> {
  const rows = await db
    .select({
      id: teams.mlbTeamId,
      nameEn: teams.nameEn,
      nameZh: teams.nameZh,
      abbrev: teams.abbrev,
      level: teams.level,
      parentId: teams.parentOrgTeamId,
    })
    .from(teams);
  // The parent org is in this same scan, so resolve it in memory rather than
  // paying for a self-join or a second query.
  const zhById = new Map(rows.map((r) => [r.id, r.nameZh]));
  const map = new Map(
    rows.map((r) => [
      r.id,
      {
        abbrev: r.abbrev,
        name: teamDisplayName({
          nameZh: r.nameZh,
          nameEn: r.nameEn,
          level: r.level,
          parentNameZh: r.parentId === null ? null : (zhById.get(r.parentId) ?? null),
        }),
      },
    ]),
  );
  return map;
}

/** Resolve an opponent stored directly on a player's game line. */
export function opponentOf(
  teamId: number | null,
  opponentTeamId: number | null,
  isHome: boolean | null,
  teamMap: TeamMap,
): { opponent: TeamRef | null; isHome: boolean | null } {
  if (teamId === null || opponentTeamId === null || isHome === null) {
    return { opponent: null, isHome: null };
  }
  return { opponent: teamMap.get(opponentTeamId) ?? null, isHome };
}

/** Resolve a schedule game's opponent before it becomes a player game line. */
export function opponentFromTeams(
  teamId: number | null,
  homeTeamId: number | null,
  awayTeamId: number | null,
  teamMap: TeamMap,
): { opponent: TeamRef | null; isHome: boolean | null } {
  if (teamId === null || homeTeamId === null || awayTeamId === null) {
    return { opponent: null, isHome: null };
  }
  const isHome = homeTeamId === teamId;
  return { opponent: teamMap.get(isHome ? awayTeamId : homeTeamId) ?? null, isHome };
}
