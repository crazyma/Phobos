import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import {
  gameBattingLines,
  gamePitchingLines,
  games,
  players,
  teams,
  transactionEvents,
} from "../db/schema/index.ts";
import {
  getPlayerGameLog,
  getPlayerTimeline,
  GameLogSchema,
  TimelineSchema,
} from "./player-recent.ts";

const TEAM_A = 990101; // player's team
const TEAM_B = 990102; // opponent
const PID = 900101; // two-way player
const EMPTY_PID = 900102; // no games / events
const G1 = 970101;
const G2 = 970102;
const TEAM_IDS = [TEAM_A, TEAM_B];
const PLAYER_IDS = [PID, EMPTY_PID];
const GAME_PKS = [G1, G2];

async function cleanup() {
  await db.delete(gameBattingLines).where(inArray(gameBattingLines.playerId, PLAYER_IDS));
  await db.delete(gamePitchingLines).where(inArray(gamePitchingLines.playerId, PLAYER_IDS));
  await db.delete(transactionEvents).where(inArray(transactionEvents.playerId, PLAYER_IDS));
  await db.delete(games).where(inArray(games.gamePk, GAME_PKS));
  await db.delete(players).where(inArray(players.mlbPlayerId, PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, TEAM_IDS));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  await db.insert(teams).values([
    { mlbTeamId: TEAM_A, nameEn: "Home Team", abbrev: "HOM", level: "mlb" },
    { mlbTeamId: TEAM_B, nameEn: "Away Team", abbrev: "AWY", level: "mlb" },
  ]);
  await db.insert(players).values([
    { mlbPlayerId: PID, nameEn: "Two Way", lifecycle: "tracked" },
    { mlbPlayerId: EMPTY_PID, nameEn: "No Games", lifecycle: "tracked" },
  ]);
  // G1: player's team at home vs B; G2 (later): player's team away at B.
  await db.insert(games).values([
    { gamePk: G1, level: "mlb", gameDateUs: "2026-07-20", homeTeamId: TEAM_A, awayTeamId: TEAM_B, status: "final" },
    { gamePk: G2, level: "mlb", gameDateUs: "2026-07-22", homeTeamId: TEAM_B, awayTeamId: TEAM_A, status: "final" },
  ]);
  await db.insert(gameBattingLines).values([
    { playerId: PID, gamePk: G1, teamId: TEAM_A, level: "mlb", ab: 4, h: 2, hr: 1, rbi: 2 },
    { playerId: PID, gamePk: G2, teamId: TEAM_A, level: "mlb", ab: 3, h: 1 },
  ]);
  // Two-way: also pitched in G1.
  await db.insert(gamePitchingLines).values([
    { playerId: PID, gamePk: G1, teamId: TEAM_A, level: "mlb", started: true, ipOuts: 18, h: 4, r: 2, er: 2, bb: 1, so: 7 },
  ]);
  await db.insert(transactionEvents).values([
    { playerId: PID, type: "call_up", effectiveDate: "2026-07-19", source: "statsapi", description: "Recalled" },
    { playerId: PID, type: "send_down", effectiveDate: "2026-07-23", source: "statsapi", description: "Optioned" },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerGameLog", () => {
  it("splits batting/pitching, newest first, resolves opponent, derives rates", async () => {
    const log = await getPlayerGameLog(PID);
    expect(() => GameLogSchema.parse(log)).not.toThrow();

    // batting: G2 (7/22) before G1 (7/20)
    expect(log.batting.map((g) => g.gamePk)).toEqual([G2, G1]);
    const g1bat = log.batting.find((g) => g.gamePk === G1)!;
    expect(g1bat.isHome).toBe(true); // team A hosted G1
    expect(g1bat.opponent?.abbrev).toBe("AWY");
    // single-game OPS derived: OBP (2/4) + SLG (5/4) = .5 + 1.25 = 1.75
    expect(g1bat.ops).toBeCloseTo(1.75, 6);

    // pitching only G1 (two-way)
    expect(log.pitching.map((g) => g.gamePk)).toEqual([G1]);
    const g1pit = log.pitching[0];
    expect(g1pit.isHome).toBe(true);
    expect(g1pit.era).toBeCloseTo(3.0, 6); // 2 ER / 6 IP
  });

  it("returns empty tables for a player with no games", async () => {
    const log = await getPlayerGameLog(EMPTY_PID);
    expect(log.batting).toEqual([]);
    expect(log.pitching).toEqual([]);
  });
});

describe("getPlayerTimeline", () => {
  it("returns events newest first with zh type labels", async () => {
    const timeline = await getPlayerTimeline(PID);
    expect(() => TimelineSchema.parse(timeline)).not.toThrow();
    expect(timeline.map((e) => e.date)).toEqual(["2026-07-23", "2026-07-19"]);
    expect(timeline[0].typeLabel).toBe("下放小聯盟");
    expect(timeline[1].typeLabel).toBe("升上大聯盟");
  });

  it("returns an empty timeline for a player with no events", async () => {
    expect(await getPlayerTimeline(EMPTY_PID)).toEqual([]);
  });
});
