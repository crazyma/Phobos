import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import {
  players,
  seasonBattingStats,
  teams,
} from "../db/schema/index.ts";
import { getPlayerSeasons } from "./player-seasons.ts";

const TEAM = 990301;
const PLAYER = 900301;

async function cleanup() {
  await db.delete(seasonBattingStats).where(inArray(seasonBattingStats.playerId, [PLAYER]));
  await db.delete(players).where(inArray(players.mlbPlayerId, [PLAYER]));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [TEAM]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  await db.insert(teams).values({ mlbTeamId: TEAM, nameEn: "Seasons Team", abbrev: "SSN", level: "mlb" });
  await db.insert(players).values({
    mlbPlayerId: PLAYER, nameEn: "Seasons Player", primaryPosition: "SS", lifecycle: "tracked",
  });
  await db.insert(seasonBattingStats).values([
    { playerId: PLAYER, season: 2019, level: "mlb", teamId: TEAM, ab: 100, h: 30 },
    { playerId: PLAYER, season: 2021, level: "mlb", teamId: TEAM, ab: 200, h: 60 },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerSeasons", () => {
  it("excludes seasons before the 2020 floor (spec-01 A.3)", async () => {
    const seasons = await getPlayerSeasons(PLAYER);
    expect(seasons.map((s) => s.season)).toEqual([2021]);
  });

  it("keeps the real team on each row (not mislabeled as a total)", async () => {
    const [season] = await getPlayerSeasons(PLAYER);
    expect(season.batting[0].rows[0].team).toEqual({ id: TEAM, name: "Seasons Team", abbrev: "SSN" });
  });
});
