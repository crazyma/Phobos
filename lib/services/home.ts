import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import {
  gameBattingLines,
  gamePitchingLines,
  games,
  playerRecentForm,
  players,
  teams,
  transactionEvents,
} from "../db/schema/index.ts";
import { teamLevel, transactionType } from "../db/schema/enums.ts";
import { loadAllFrontmatter } from "../glossary/content.ts";
import { transactionTypeLabel } from "./player-status.ts";
import { getLastSyncedAt } from "./sync.ts";
import { getPlayerUpcoming } from "./player-upcoming.ts";
import { getPlayerSeasons } from "./player-seasons.ts";

const BattingLineSchema = z.object({
  pa: z.number().int(), h: z.number().int(), hr: z.number().int(),
  rbi: z.number().int(), bb: z.number().int(), so: z.number().int(),
});
const PitchingLineSchema = z.object({
  ipOuts: z.number().int(), h: z.number().int(), r: z.number().int(),
  er: z.number().int(), so: z.number().int(), bb: z.number().int(),
});

export const HomeGameCardSchema = z.object({
  playerId: z.number().int(),
  nameZh: z.string(),
  teamAbbrev: z.string().nullable(),
  level: z.enum(teamLevel.enumValues),
  role: z.enum(["batting", "pitching"]),
  line: z.union([BattingLineSchema, PitchingLineSchema]),
  recentForm: z.string(),
});
export const HomeEventSchema = z.object({
  playerId: z.number().int(),
  nameZh: z.string(),
  type: z.enum(transactionType.enumValues),
  typeLabel: z.string(),
  date: z.string(),
  description: z.string().nullable(),
});
export const HomeUpcomingSchema = z.object({
  playerId: z.number().int(),
  nameZh: z.string(),
  opponent: z.string().nullable(),
  startTimeUtc: z.string().nullable(),
  tag: z.enum(["probable_starter", "possible", "il"]),
});
const SeasonReviewBattingSchema = z.object({
  g: z.number().int(), h: z.number().int(), hr: z.number().int(), rbi: z.number().int(),
  avg: z.number().nullable(),
}).nullable();
const SeasonReviewPitchingSchema = z.object({
  g: z.number().int(), ipOuts: z.number().int(), w: z.number().int(), l: z.number().int(),
  era: z.number().nullable(), so: z.number().int(),
}).nullable();
export const HomeEmptyStateSchema = z.object({
  seasonReviewCards: z.array(z.object({
    playerId: z.number().int(), nameZh: z.string(), season: z.number().int().nullable(),
    batting: SeasonReviewBattingSchema, pitching: SeasonReviewPitchingSchema,
    recentForm: z.string(),
  })),
  glossaryPicks: z.array(z.object({
    nameZh: z.string(), nameEn: z.string(), blurb: z.string(), link: z.string(),
  })),
});

// Later homepage zones grow this same public contract. Keeping their empty
// shapes from ticket 01 means page and API consumers do not need a breaking
// response change as each zone lands.
export const HomeSchema = z.object({
  digestDate: z.string().nullable(),
  gameCards: z.array(HomeGameCardSchema),
  events: z.array(HomeEventSchema),
  upcoming: z.array(HomeUpcomingSchema),
  emptyState: HomeEmptyStateSchema.nullable(),
  dataUpdatedAt: z.string().nullable(),
});
export type Home = z.infer<typeof HomeSchema>;

type RelatedGame = { gamePk: number; gameDate: string; status: string };

/**
 * The digest only considers games in which a tracked player has a game line.
 * A date is eligible iff every such related game has reached `final`; this
 * keeps a later live game from displacing the last complete US game day.
 */
async function getDigestDate(db = defaultDb): Promise<string | null> {
  const battingGames = await db
    .select({ gamePk: games.gamePk, gameDate: games.gameDateUs, status: games.status })
    .from(gameBattingLines)
    .innerJoin(players, eq(players.mlbPlayerId, gameBattingLines.playerId))
    .innerJoin(games, eq(games.gamePk, gameBattingLines.gamePk))
    .where(eq(players.lifecycle, "tracked"));
  const pitchingGames = await db
    .select({ gamePk: games.gamePk, gameDate: games.gameDateUs, status: games.status })
    .from(gamePitchingLines)
    .innerJoin(players, eq(players.mlbPlayerId, gamePitchingLines.playerId))
    .innerJoin(games, eq(games.gamePk, gamePitchingLines.gamePk))
    .where(eq(players.lifecycle, "tracked"));

  const unique = new Map<number, RelatedGame>();
  for (const game of [...battingGames, ...pitchingGames]) {
    unique.set(game.gamePk, {
      gamePk: game.gamePk,
      gameDate: String(game.gameDate),
      status: game.status,
    });
  }

  const byDate = new Map<string, RelatedGame[]>();
  for (const game of unique.values()) {
    const dated = byDate.get(game.gameDate) ?? [];
    dated.push(game);
    byDate.set(game.gameDate, dated);
  }
  return [...byDate.entries()]
    .filter(([, dated]) => dated.every((game) => game.status === "final"))
    .map(([date]) => date)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

/** Homepage zone 1 plus the stable outer API envelope (spec-02 §2.1/§3). */
export async function getHome(
  db = defaultDb,
  _today?: string,
  digestDateOverride?: string | null,
): Promise<Home> {
  const digestDate = digestDateOverride === undefined
    ? await getDigestDate(db)
    : digestDateOverride;
  const gameCards: Home["gameCards"] = [];

  if (digestDate) {
    const battingRows = await db
      .select({
        playerId: players.mlbPlayerId, nameZh: players.nameZh, nameEn: players.nameEn,
        teamAbbrev: teams.abbrev, level: gameBattingLines.level,
        pa: gameBattingLines.pa, h: gameBattingLines.h, hr: gameBattingLines.hr,
        rbi: gameBattingLines.rbi, bb: gameBattingLines.bb, so: gameBattingLines.so,
        recentForm: playerRecentForm.sentenceZh,
      })
      .from(gameBattingLines)
      .innerJoin(players, eq(players.mlbPlayerId, gameBattingLines.playerId))
      .innerJoin(games, eq(games.gamePk, gameBattingLines.gamePk))
      .leftJoin(teams, eq(teams.mlbTeamId, gameBattingLines.teamId))
      .leftJoin(playerRecentForm, eq(playerRecentForm.playerId, players.mlbPlayerId))
      .where(and(eq(players.lifecycle, "tracked"), eq(games.gameDateUs, digestDate)))
      .orderBy(players.nameEn, gameBattingLines.gamePk);
    gameCards.push(...battingRows.map((row) => ({
      playerId: row.playerId, nameZh: row.nameZh ?? row.nameEn,
      teamAbbrev: row.teamAbbrev ?? null, level: row.level, role: "batting" as const,
      line: { pa: row.pa, h: row.h, hr: row.hr, rbi: row.rbi, bb: row.bb, so: row.so },
      recentForm: row.recentForm ?? "近況同步中",
    })));

    const pitchingRows = await db
      .select({
        playerId: players.mlbPlayerId, nameZh: players.nameZh, nameEn: players.nameEn,
        teamAbbrev: teams.abbrev, level: gamePitchingLines.level,
        ipOuts: gamePitchingLines.ipOuts, h: gamePitchingLines.h, r: gamePitchingLines.r,
        er: gamePitchingLines.er, so: gamePitchingLines.so, bb: gamePitchingLines.bb,
        recentForm: playerRecentForm.sentenceZh,
      })
      .from(gamePitchingLines)
      .innerJoin(players, eq(players.mlbPlayerId, gamePitchingLines.playerId))
      .innerJoin(games, eq(games.gamePk, gamePitchingLines.gamePk))
      .leftJoin(teams, eq(teams.mlbTeamId, gamePitchingLines.teamId))
      .leftJoin(playerRecentForm, eq(playerRecentForm.playerId, players.mlbPlayerId))
      .where(and(eq(players.lifecycle, "tracked"), eq(games.gameDateUs, digestDate)))
      .orderBy(players.nameEn, gamePitchingLines.gamePk);
    gameCards.push(...pitchingRows.map((row) => ({
      playerId: row.playerId, nameZh: row.nameZh ?? row.nameEn,
      teamAbbrev: row.teamAbbrev ?? null, level: row.level, role: "pitching" as const,
      line: { ipOuts: row.ipOuts, h: row.h, r: row.r, er: row.er, so: row.so, bb: row.bb },
      recentForm: row.recentForm ?? "近況同步中",
    })));
  }

  const events = digestDate
    ? await db
        .select({
          playerId: players.mlbPlayerId, nameZh: players.nameZh, nameEn: players.nameEn,
          type: transactionEvents.type, date: transactionEvents.effectiveDate,
          description: transactionEvents.description,
        })
        .from(transactionEvents)
        .innerJoin(players, eq(players.mlbPlayerId, transactionEvents.playerId))
        .where(and(eq(players.lifecycle, "tracked"), gt(transactionEvents.effectiveDate, digestDate)))
        .orderBy(desc(transactionEvents.effectiveDate), desc(transactionEvents.id))
    : [];

  const trackedPlayers = await db
    .select({
      playerId: players.mlbPlayerId, nameZh: players.nameZh, nameEn: players.nameEn,
      recentForm: playerRecentForm.sentenceZh,
    })
    .from(players)
    .leftJoin(playerRecentForm, eq(playerRecentForm.playerId, players.mlbPlayerId))
    .where(eq(players.lifecycle, "tracked"));
  const upcomingResults = await Promise.all(
    trackedPlayers.map(async (player) => {
      const prediction = await getPlayerUpcoming(player.playerId, db, _today);
      // A healthy player without a scheduled game has no row; IL players remain
      // visible so the homepage can explicitly say「傷兵中」.
      if (!prediction || (!prediction.nextGame && prediction.tag !== "il")) return null;
      const nextGame = prediction.nextGame;
      return {
        playerId: player.playerId,
        nameZh: player.nameZh ?? player.nameEn,
        opponent: prediction.tag === "il"
          ? null
          : nextGame?.opponent?.abbrev ?? nextGame?.opponent?.name ?? null,
        startTimeUtc: prediction.tag === "il" ? null : nextGame?.startTimeUtc ?? null,
        tag: prediction.tag,
      };
    }),
  );
  const upcoming = upcomingResults.filter((item): item is NonNullable<typeof item> => item !== null);

  let emptyState: Home["emptyState"] = null;
  if (gameCards.length === 0) {
    const currentSeason = Number((_today ?? new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
    }).format(new Date())).slice(0, 4));
    const seasonReviewCards = await Promise.all(trackedPlayers.map(async (player) => {
      const seasons = await getPlayerSeasons(player.playerId, db);
      // `getPlayerSeasons` is newest first. Choosing the newest row at or
      // before this year gives the required current-season → prior-season fallback.
      const season = seasons.find((candidate) => candidate.season <= currentSeason) ?? null;
      const battingLine = season?.batting[0]?.total ?? season?.batting[0]?.rows[0] ?? null;
      const pitchingLine = season?.pitching[0]?.total ?? season?.pitching[0]?.rows[0] ?? null;
      return {
        playerId: player.playerId,
        nameZh: player.nameZh ?? player.nameEn,
        season: season?.season ?? null,
        batting: battingLine ? {
          g: battingLine.g, h: battingLine.h, hr: battingLine.hr,
          rbi: battingLine.rbi, avg: battingLine.avg,
        } : null,
        pitching: pitchingLine ? {
          g: pitchingLine.g, ipOuts: pitchingLine.ipOuts, w: pitchingLine.w,
          l: pitchingLine.l, era: pitchingLine.era, so: pitchingLine.so,
        } : null,
        recentForm: player.recentForm ?? "近況同步中",
      };
    }));
    // Static v1 picks: stable content-driven selection, not client-side animation.
    const glossaryPicks = loadAllFrontmatter().slice(0, 3).map((term) => ({
      nameZh: term.name_zh,
      nameEn: term.name_en,
      blurb: term.blurb,
      link: `/glossary/${term.slug}`,
    }));
    emptyState = { seasonReviewCards, glossaryPicks };
  }

  const dataUpdatedAt = await getLastSyncedAt(db);
  return HomeSchema.parse({
    digestDate,
    gameCards,
    events: events.map((event) => ({
      playerId: event.playerId,
      nameZh: event.nameZh ?? event.nameEn,
      type: event.type,
      typeLabel: transactionTypeLabel(event.type),
      date: String(event.date),
      description: event.description ?? null,
    })),
    upcoming,
    emptyState,
    dataUpdatedAt: dataUpdatedAt?.toISOString() ?? null,
  });
}
