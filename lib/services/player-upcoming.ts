import { and, desc, eq, gte, or } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import { games, playerCurrentStatus } from "../db/schema/index.ts";
import { loadTeamMap, opponentFromTeams, type TeamMap } from "./team-map.ts";

const OpponentSchema = z
  .object({ abbrev: z.string().nullable(), name: z.string() })
  .nullable();

const NextGameSchema = z.object({
  gamePk: z.number().int(),
  gameDate: z.string(),
  startTimeUtc: z.string().nullable(),
  isHome: z.boolean().nullable(),
  opponent: OpponentSchema,
  venueName: z.string().nullable(),
  seriesGameNumber: z.number().int().nullable(),
  gamesInSeries: z.number().int().nullable(),
});

const RecentResultSchema = z.object({
  gamePk: z.number().int(),
  gameDate: z.string(),
  isHome: z.boolean().nullable(),
  opponent: OpponentSchema,
  teamScore: z.number().int().nullable(),
  opponentScore: z.number().int().nullable(),
  win: z.boolean().nullable(),
});

export const UpcomingSchema = z
  .object({
    /** 出賽預告標籤（spec-02 §2.1 第 3 區規則）。 */
    tag: z.enum(["probable_starter", "possible", "il"]),
    nextGame: NextGameSchema.nullable(),
    recentResults: z.array(RecentResultSchema),
  })
  .nullable();
export type Upcoming = z.infer<typeof UpcomingSchema>;

/**
 * Today's US game day (YYYY-MM-DD). Uses US-Pacific — the westmost US zone — so a
 * game still being played out west is never prematurely treated as past.
 */
export function usToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

/**
 * Zone 5 (spec-02 §2.3 / §2.1 rule 3): the player's next-game prediction tag +
 * next scheduled game (series context) + their team's recent results. Returns
 * null when the player has no current team. Data comes from the `games`
 * preview rows (schedule + probable pitcher).
 */
export async function getPlayerUpcoming(
  id: number,
  db = defaultDb,
  today: string = usToday(),
  teamMap?: TeamMap,
  skipRecentResults = false,
): Promise<Upcoming> {
  const [status] = await db
    .select({
      teamId: playerCurrentStatus.teamId,
      health: playerCurrentStatus.health,
    })
    .from(playerCurrentStatus)
    .where(eq(playerCurrentStatus.playerId, id))
    .limit(1);

  if (!status || status.teamId === null) return null;
  const teamId = status.teamId;
  const map = teamMap ?? (await loadTeamMap(db));
  const onTeam = or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId));

  const [next] = await db
    .select({
      gamePk: games.gamePk, gameDate: games.gameDateUs, startTimeUtc: games.startTimeUtc,
      homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId, venueName: games.venueName,
      seriesGameNumber: games.seriesGameNumber, gamesInSeries: games.gamesInSeries,
      probableHome: games.probableHomePitcherId, probableAway: games.probableAwayPitcherId,
    })
    .from(games)
    .where(and(onTeam, eq(games.status, "scheduled"), gte(games.gameDateUs, today)))
    .orderBy(games.gameDateUs, games.gamePk)
    .limit(1);

  // Recent results are a player-page-only concern; callers that don't render them
  // (e.g. the homepage upcoming zone) skip the extra query entirely.
  const recentRows = skipRecentResults
    ? []
    : await db
        .select({
          gamePk: games.gamePk, gameDate: games.gameDateUs,
          homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId,
          homeScore: games.homeScore, awayScore: games.awayScore,
        })
        .from(games)
        .where(and(onTeam, eq(games.status, "final")))
        .orderBy(desc(games.gameDateUs), desc(games.gamePk))
        .limit(3);

  const nextGame = next
    ? (() => {
        const { opponent, isHome } = opponentFromTeams(teamId, next.homeTeamId, next.awayTeamId, map);
        return {
          gamePk: next.gamePk,
          gameDate: String(next.gameDate),
          startTimeUtc: next.startTimeUtc ? next.startTimeUtc.toISOString() : null,
          isHome,
          opponent,
          venueName: next.venueName,
          seriesGameNumber: next.seriesGameNumber,
          gamesInSeries: next.gamesInSeries,
        };
      })()
    : null;

  // Tag: IL players get "傷兵中" (no prediction); a probable starter is anyone
  // named as the game's probable pitcher — keyed off the id match, not the
  // position string, so two-way players are covered; everyone else healthy and
  // on a team is "可能出賽" (spec-02 §2.1 rule 3).
  let tag: "probable_starter" | "possible" | "il";
  if (status.health === "il") {
    tag = "il";
  } else if (next && (next.probableHome === id || next.probableAway === id)) {
    tag = "probable_starter";
  } else {
    tag = "possible";
  }

  const recentResults = recentRows.map((g) => {
    const { opponent, isHome } = opponentFromTeams(teamId, g.homeTeamId, g.awayTeamId, map);
    const teamScore = isHome === null ? null : isHome ? g.homeScore : g.awayScore;
    const opponentScore = isHome === null ? null : isHome ? g.awayScore : g.homeScore;
    const win =
      teamScore !== null && opponentScore !== null ? teamScore > opponentScore : null;
    return {
      gamePk: g.gamePk,
      gameDate: String(g.gameDate),
      isHome,
      opponent,
      teamScore,
      opponentScore,
      win,
    };
  });

  return UpcomingSchema.parse({ tag, nextGame, recentResults });
}
