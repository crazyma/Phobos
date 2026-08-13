import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import { gameBattingLines, gamePitchingLines } from "../db/schema/index.ts";
import { teamLevel } from "../db/schema/enums.ts";
import { levelLabel } from "./player-status.ts";

/** A full season needs enough opportunity before a cumulative rate is useful. */
export const MIN_TREND_BATTING_AB = 20;
/** Ten innings: enough to avoid treating one brief appearance as an ERA trend. */
export const MIN_TREND_PITCHING_OUTS = 30;

const TrendPointSchema = z.object({
  gameDate: z.string(),
  value: z.number(),
});

const TrendSeriesSchema = z.object({
  level: z.enum(teamLevel.enumValues),
  levelLabel: z.string(),
  latest: z.number(),
  points: z.array(TrendPointSchema).min(1),
});

export const PlayerTrendSchema = z.object({
  batting: z.array(TrendSeriesSchema),
  pitching: z.array(TrendSeriesSchema),
});

export type PlayerTrend = z.infer<typeof PlayerTrendSchema>;
type TrendSeries = z.infer<typeof TrendSeriesSchema>;

type BattingRow = {
  gameDate: Date | string;
  gamePk: number;
  level: (typeof teamLevel.enumValues)[number];
  ab: number;
  h: number;
};

type PitchingRow = {
  gameDate: Date | string;
  gamePk: number;
  level: (typeof teamLevel.enumValues)[number];
  ipOuts: number;
  er: number;
};

function dateText(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

/** Build separately accumulated AVG series for each level. Exported for focused tests. */
export function buildBattingTrends(rows: BattingRow[]): TrendSeries[] {
  const groups = new Map<string, BattingRow[]>();
  for (const row of rows) groups.set(row.level, [...(groups.get(row.level) ?? []), row]);

  return [...groups.entries()].flatMap(([level, levelRows]) => {
    let ab = 0;
    let h = 0;
    const points = levelRows.flatMap((row) => {
      ab += row.ab;
      h += row.h;
      return ab === 0 ? [] : [{ gameDate: dateText(row.gameDate), value: h / ab }];
    });
    if (ab < MIN_TREND_BATTING_AB) return [];
    return [{
      level: level as TrendSeries["level"],
      levelLabel: levelLabel(level as TrendSeries["level"]) ?? level,
      latest: points.at(-1)!.value,
      points,
    }];
  });
}

/** Build separately accumulated ERA series for each level. Exported for focused tests. */
export function buildPitchingTrends(rows: PitchingRow[]): TrendSeries[] {
  const groups = new Map<string, PitchingRow[]>();
  for (const row of rows) groups.set(row.level, [...(groups.get(row.level) ?? []), row]);

  return [...groups.entries()].flatMap(([level, levelRows]) => {
    let ipOuts = 0;
    let er = 0;
    const points = levelRows.flatMap((row) => {
      ipOuts += row.ipOuts;
      er += row.er;
      return ipOuts === 0 ? [] : [{ gameDate: dateText(row.gameDate), value: (er * 27) / ipOuts }];
    });
    if (ipOuts < MIN_TREND_PITCHING_OUTS || points.length === 0) return [];
    return [{
      level: level as TrendSeries["level"],
      levelLabel: levelLabel(level as TrendSeries["level"]) ?? level,
      latest: points.at(-1)!.value,
      points,
    }];
  });
}

/**
 * Full current-season game lines, grouped by level. This intentionally does
 * not reuse the ten-game recent-log limit: a trend is season-to-date.
 */
export async function getPlayerTrend(
  id: number,
  db = defaultDb,
  season = new Date().getUTCFullYear(),
): Promise<PlayerTrend> {
  const start = `${season}-01-01`;
  const end = `${season + 1}-01-01`;
  const batting = gameBattingLines;
  const pitching = gamePitchingLines;

  const [battingRows, pitchingRows] = await Promise.all([
    db
      .select({
        gameDate: batting.gameDateUs,
        gamePk: batting.gamePk,
        level: batting.level,
        ab: batting.ab,
        h: batting.h,
      })
      .from(batting)
      .where(
        and(
          eq(batting.playerId, id),
          gte(batting.gameDateUs, start),
          lt(batting.gameDateUs, end),
        ),
      )
      .orderBy(asc(batting.gameDateUs), asc(batting.gamePk)),
    db
      .select({
        gameDate: pitching.gameDateUs,
        gamePk: pitching.gamePk,
        level: pitching.level,
        ipOuts: pitching.ipOuts,
        er: pitching.er,
      })
      .from(pitching)
      .where(
        and(
          eq(pitching.playerId, id),
          gte(pitching.gameDateUs, start),
          lt(pitching.gameDateUs, end),
        ),
      )
      .orderBy(asc(pitching.gameDateUs), asc(pitching.gamePk)),
  ]);

  return PlayerTrendSchema.parse({
    batting: buildBattingTrends(battingRows),
    pitching: buildPitchingTrends(pitchingRows),
  });
}
