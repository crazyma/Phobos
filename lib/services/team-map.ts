import { db as defaultDb } from "../db/client.ts";
import { teams } from "../db/schema/index.ts";

/** A team as shown next to a game line: zh name (falling back to en) + abbrev. */
export type TeamRef = { abbrev: string | null; name: string };
export type TeamMap = Map<number, TeamRef>;

/**
 * Load every team keyed by id. The `teams` table is small (all tracked orgs +
 * their affiliates), so one full scan per page is fine — but load it once and
 * pass it to the per-section resolvers rather than scanning per section.
 */
export async function loadTeamMap(db = defaultDb): Promise<TeamMap> {
  const rows = await db
    .select({ id: teams.mlbTeamId, name: teams.nameEn, nameZh: teams.nameZh, abbrev: teams.abbrev })
    .from(teams);
  return new Map(rows.map((r) => [r.id, { abbrev: r.abbrev, name: r.nameZh ?? r.name }]));
}

/** Resolve the opponent + home flag for a game, given the player's team. */
export function opponentOf(
  teamId: number | null,
  homeTeamId: number | null,
  awayTeamId: number | null,
  teamMap: TeamMap,
): { opponent: TeamRef | null; isHome: boolean | null } {
  if (teamId === null || homeTeamId === null || awayTeamId === null) {
    return { opponent: null, isHome: null };
  }
  const isHome = homeTeamId === teamId;
  const oppId = isHome ? awayTeamId : homeTeamId;
  return { opponent: teamMap.get(oppId) ?? null, isHome };
}
