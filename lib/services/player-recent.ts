import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import {
  gameBattingLines,
  gamePitchingLines,
  games,
  transactionEvents,
} from "../db/schema/index.ts";
import { teamLevel, transactionType } from "../db/schema/enums.ts";
import { levelLabel, transactionTypeLabel } from "./player-status.ts";
import { loadTeamMap, opponentOf, type TeamMap } from "./team-map.ts";
import { deriveBatting, derivePitching } from "./stats.ts";

/** Most recent games shown per table on the player page (spec-02 §2.3). */
export const RECENT_GAMES_N = 10;

const OpponentSchema = z
  .object({ abbrev: z.string().nullable(), name: z.string() })
  .nullable();

const BattingGameSchema = z.object({
  gamePk: z.number().int(),
  gameDate: z.string(),
  level: z.enum(teamLevel.enumValues),
  levelLabel: z.string(),
  isHome: z.boolean().nullable(),
  opponent: OpponentSchema,
  ab: z.number().int(),
  h: z.number().int(),
  doubles: z.number().int(),
  triples: z.number().int(),
  hr: z.number().int(),
  rbi: z.number().int(),
  r: z.number().int(),
  bb: z.number().int(),
  so: z.number().int(),
  sb: z.number().int(),
  /** single-game OPS, derived (spec-02 §2.3); null when no at-bats. */
  ops: z.number().nullable(),
});

const PitchingGameSchema = z.object({
  gamePk: z.number().int(),
  gameDate: z.string(),
  level: z.enum(teamLevel.enumValues),
  levelLabel: z.string(),
  isHome: z.boolean().nullable(),
  opponent: OpponentSchema,
  started: z.boolean(),
  ipOuts: z.number().int(),
  h: z.number().int(),
  r: z.number().int(),
  er: z.number().int(),
  bb: z.number().int(),
  so: z.number().int(),
  hr: z.number().int(),
  /** single-game ERA / WHIP, derived; null when no outs recorded. */
  era: z.number().nullable(),
  whip: z.number().nullable(),
});

export const GameLogSchema = z.object({
  batting: z.array(BattingGameSchema),
  pitching: z.array(PitchingGameSchema),
});
export type GameLog = z.infer<typeof GameLogSchema>;

export const TimelineEntrySchema = z.object({
  date: z.string(),
  type: z.enum(transactionType.enumValues),
  typeLabel: z.string(),
  description: z.string().nullable(),
});
export const TimelineSchema = z.array(TimelineEntrySchema);
export type Timeline = z.infer<typeof TimelineSchema>;

/** A player's recent game log — batting and pitching split, ≤ N each, newest first. */
export async function getPlayerGameLog(
  id: number,
  db = defaultDb,
  limit = RECENT_GAMES_N,
  teamMap?: TeamMap,
): Promise<GameLog> {
  const map = teamMap ?? (await loadTeamMap(db));
  const b = gameBattingLines;
  const p = gamePitchingLines;

  const battingRows = await db
    .select({
      gamePk: b.gamePk, gameDate: games.gameDateUs, level: b.level,
      teamId: b.teamId, homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId,
      ab: b.ab, h: b.h, doubles: b.doubles, triples: b.triples, hr: b.hr,
      rbi: b.rbi, r: b.r, bb: b.bb, so: b.so, sb: b.sb,
    })
    .from(b)
    .innerJoin(games, eq(games.gamePk, b.gamePk))
    .where(eq(b.playerId, id))
    .orderBy(desc(games.gameDateUs), desc(b.gamePk))
    .limit(limit);

  const pitchingRows = await db
    .select({
      gamePk: p.gamePk, gameDate: games.gameDateUs, level: p.level,
      teamId: p.teamId, homeTeamId: games.homeTeamId, awayTeamId: games.awayTeamId,
      started: p.started, ipOuts: p.ipOuts, h: p.h, r: p.r, er: p.er,
      bb: p.bb, so: p.so, hr: p.hr,
    })
    .from(p)
    .innerJoin(games, eq(games.gamePk, p.gamePk))
    .where(eq(p.playerId, id))
    .orderBy(desc(games.gameDateUs), desc(p.gamePk))
    .limit(limit);

  const batting = battingRows.map((row) => {
    const { opponent, isHome } = opponentOf(row.teamId, row.homeTeamId, row.awayTeamId, map);
    const rates = deriveBatting({
      ...row, pa: 0, cs: 0, hbp: 0, sf: 0, g: 0,
    });
    return {
      gamePk: row.gamePk, gameDate: String(row.gameDate), level: row.level,
      levelLabel: levelLabel(row.level) ?? row.level, isHome, opponent,
      ab: row.ab, h: row.h, doubles: row.doubles, triples: row.triples, hr: row.hr,
      rbi: row.rbi, r: row.r, bb: row.bb, so: row.so, sb: row.sb,
      ops: rates.ops,
    };
  });

  const pitching = pitchingRows.map((row) => {
    const { opponent, isHome } = opponentOf(row.teamId, row.homeTeamId, row.awayTeamId, map);
    const rates = derivePitching({
      ...row, g: 0, gs: 0, bf: 0, w: 0, l: 0, sv: 0, hld: 0,
    });
    return {
      gamePk: row.gamePk, gameDate: String(row.gameDate), level: row.level,
      levelLabel: levelLabel(row.level) ?? row.level, isHome, opponent,
      started: row.started, ipOuts: row.ipOuts, h: row.h, r: row.r, er: row.er,
      bb: row.bb, so: row.so, hr: row.hr, era: rates.era, whip: rates.whip,
    };
  });

  return GameLogSchema.parse({ batting, pitching });
}

/** A player's transaction timeline, newest first (spec-02 §2.3 zone 4). */
export async function getPlayerTimeline(id: number, db = defaultDb): Promise<Timeline> {
  const rows = await db
    .select({
      date: transactionEvents.effectiveDate,
      type: transactionEvents.type,
      description: transactionEvents.description,
    })
    .from(transactionEvents)
    .where(eq(transactionEvents.playerId, id))
    .orderBy(desc(transactionEvents.effectiveDate), desc(transactionEvents.id));

  return TimelineSchema.parse(
    rows.map((r) => ({
      date: String(r.date),
      type: r.type,
      typeLabel: transactionTypeLabel(r.type),
      description: r.description ?? null,
    })),
  );
}
