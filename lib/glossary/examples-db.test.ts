import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import { players, seasonBattingStats, teams } from "../db/schema/index.ts";
import { loadFrontmatter } from "./content.ts";
import { getMetricExamples } from "./examples-db.ts";

const TEAM = 990401;
const TEAM2 = 990402;
const STAR = 900401; // extreme wOBA → should sort first
const THIN = 900402; // below the PA threshold → excluded
const SPLIT = 900403; // traded mid-season: two 30-PA stints, 60 combined
const CUR = new Date().getUTCFullYear();
const PLAYER_IDS = [STAR, THIN, SPLIT];

async function cleanup() {
  await db.delete(seasonBattingStats).where(inArray(seasonBattingStats.playerId, PLAYER_IDS));
  await db.delete(players).where(inArray(players.mlbPlayerId, PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [TEAM, TEAM2]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();
  await db.insert(teams).values([
    { mlbTeamId: TEAM, nameEn: "Ex Team", abbrev: "EXT", level: "mlb" },
    { mlbTeamId: TEAM2, nameEn: "Ex Team 2", abbrev: "EX2", level: "mlb" },
  ]);
  await db.insert(players).values([
    { mlbPlayerId: STAR, nameEn: "Star", nameZh: "明星", primaryPosition: "1B", lifecycle: "tracked" },
    { mlbPlayerId: THIN, nameEn: "Thin", nameZh: "樣本不足", primaryPosition: "2B", lifecycle: "tracked" },
    { mlbPlayerId: SPLIT, nameEn: "Split", nameZh: "季中換隊", primaryPosition: "SS", lifecycle: "tracked" },
  ]);
  // Use the latest season so it counts as "current" (examples-db picks max).
  await db.insert(seasonBattingStats).values([
    { playerId: STAR, season: CUR, level: "mlb", teamId: TEAM, pa: 300, ab: 260, h: 100, bb: 30, woba: 0.9 },
    { playerId: THIN, season: CUR, level: "mlb", teamId: TEAM, pa: 10, ab: 9, h: 3, bb: 1, woba: 0.95 },
    // Same MLB level, two teams: 30 + 30 PA (each below 50), 6 + 3 BB → .150 BB%.
    { playerId: SPLIT, season: CUR, level: "mlb", teamId: TEAM, pa: 30, ab: 24, h: 6, bb: 6 },
    { playerId: SPLIT, season: CUR, level: "mlb", teamId: TEAM2, pa: 30, ab: 27, h: 6, bb: 3 },
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

  it("aggregates a multi-team level: combined PA passes and the derived value is the level total", async () => {
    // For a derived metric (BB%), the split player's two 30-PA stints must sum to
    // 60 PA (above the 50 gate) and yield the aggregated .150, not a single stint.
    const bb = loadFrontmatter("bb-pct")!;
    const picks = await getMetricExamples(bb, db);
    const split = picks.find((p) => p.playerId === SPLIT);
    expect(split).toBeDefined();
    expect(split!.value).toBe("15.0%");
  });
});
