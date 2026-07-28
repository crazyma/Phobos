import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import { players, seasonBattingStats, teams } from "../db/schema/index.ts";
import { loadFrontmatter } from "./content.ts";
import { getMetricExamples } from "./examples-db.ts";

const TEAM = 990401;
const STAR = 900401; // extreme wOBA → should sort first
const THIN = 900402; // below the PA threshold → excluded
const CUR = new Date().getUTCFullYear();

async function cleanup() {
  await db.delete(seasonBattingStats).where(inArray(seasonBattingStats.playerId, [STAR, THIN]));
  await db.delete(players).where(inArray(players.mlbPlayerId, [STAR, THIN]));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [TEAM]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();
  await db.insert(teams).values({ mlbTeamId: TEAM, nameEn: "Ex Team", abbrev: "EXT", level: "mlb" });
  await db.insert(players).values([
    { mlbPlayerId: STAR, nameEn: "Star", nameZh: "明星", primaryPosition: "1B", lifecycle: "tracked" },
    { mlbPlayerId: THIN, nameEn: "Thin", nameZh: "樣本不足", primaryPosition: "2B", lifecycle: "tracked" },
  ]);
  // Use the latest season so it counts as "current" (examples-db picks max).
  await db.insert(seasonBattingStats).values([
    { playerId: STAR, season: CUR, level: "mlb", teamId: TEAM, pa: 300, ab: 260, h: 100, woba: 0.9 },
    { playerId: THIN, season: CUR, level: "mlb", teamId: TEAM, pa: 10, ab: 9, h: 3, woba: 0.95 },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getMetricExamples", () => {
  it("picks the extreme-value player and drops the below-threshold one", async () => {
    const woba = loadFrontmatter("woba")!;
    const picks = await getMetricExamples(woba, db);
    expect(picks[0]?.playerId).toBe(STAR);
    expect(picks[0]).toMatchObject({ name: "明星", level: "mlb", levelHeader: "MLB" });
    expect(picks.map((p) => p.playerId)).not.toContain(THIN);
  });
});
