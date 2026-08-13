import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import { gameBattingLines, gamePitchingLines, players } from "../db/schema/index.ts";
import {
  buildBattingTrends,
  buildPitchingTrends,
  getPlayerTrend,
  MIN_TREND_BATTING_AB,
  MIN_TREND_PITCHING_OUTS,
} from "./player-trend.ts";

const PID = 900601;

async function cleanup() {
  await db.delete(gameBattingLines).where(eq(gameBattingLines.playerId, PID));
  await db.delete(gamePitchingLines).where(eq(gamePitchingLines.playerId, PID));
  await db.delete(players).where(eq(players.mlbPlayerId, PID));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();
  await db.insert(players).values({
    mlbPlayerId: PID,
    nameEn: "Trend Fixture",
    lifecycle: "tracked",
  });
  await db.insert(gameBattingLines).values([
    { playerId: PID, gamePk: 996101, gameDateUs: "2026-04-01", level: "mlb", ab: 10, h: 2 },
    { playerId: PID, gamePk: 996102, gameDateUs: "2026-04-03", level: "mlb", ab: 10, h: 4 },
    { playerId: PID, gamePk: 996103, gameDateUs: "2026-04-02", level: "aaa", ab: 20, h: 10 },
  ]);
  await db.insert(gamePitchingLines).values([
    { playerId: PID, gamePk: 996201, gameDateUs: "2026-04-01", level: "mlb", ipOuts: 15, er: 2 },
    { playerId: PID, gamePk: 996202, gameDateUs: "2026-04-03", level: "mlb", ipOuts: 15, er: 1 },
    { playerId: PID, gamePk: 996203, gameDateUs: "2026-04-02", level: "aaa", ipOuts: 30, er: 6 },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("player trend derivation", () => {
  it("queries the injected DB and accumulates every level independently", async () => {
    const trend = await getPlayerTrend(PID, db, 2026);
    const mlb = trend.batting.find((series) => series.level === "mlb")!;
    const aaa = trend.batting.find((series) => series.level === "aaa")!;

    expect(mlb.points.map((point) => point.value)).toEqual([0.2, 0.3]);
    expect(aaa.points.map((point) => point.value)).toEqual([0.5]);
    expect(
      trend.pitching.find((series) => series.level === "mlb")?.points.map((point) => point.value),
    ).toEqual([3.6, 2.7]);
    expect(trend.pitching.find((series) => series.level === "aaa")?.latest).toBe(5.4);
  });

  it("hides groups below the named batting and pitching thresholds", () => {
    expect(
      buildBattingTrends([
        { gameDate: "2026-04-01", gamePk: 1, level: "mlb", ab: MIN_TREND_BATTING_AB - 1, h: 5 },
      ]),
    ).toEqual([]);
    expect(
      buildPitchingTrends([
        { gameDate: "2026-04-01", gamePk: 1, level: "mlb", ipOuts: MIN_TREND_PITCHING_OUTS - 1, er: 1 },
      ]),
    ).toEqual([]);
  });

  it("keeps a qualified one-game series finite", () => {
    const [series] = buildBattingTrends([
      { gameDate: "2026-04-01", gamePk: 1, level: "mlb", ab: MIN_TREND_BATTING_AB, h: 6 },
    ]);
    expect(series.points).toEqual([{ gameDate: "2026-04-01", value: 0.3 }]);
  });

  it("does not emit a NaN point before the first at-bat", () => {
    const [series] = buildBattingTrends([
      { gameDate: "2026-04-01", gamePk: 1, level: "mlb", ab: 0, h: 0 },
      { gameDate: "2026-04-02", gamePk: 2, level: "mlb", ab: MIN_TREND_BATTING_AB, h: 6 },
    ]);
    expect(series.points).toEqual([{ gameDate: "2026-04-02", value: 0.3 }]);
  });
});
