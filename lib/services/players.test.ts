import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { db, pool } from "../db/client.ts";
import {
  players,
  playerCurrentStatus,
  playerRecentForm,
  teams,
} from "../db/schema/index.ts";
import { getPlayerSummaries, PlayerSummarySchema } from "./players.ts";

// Dedicated fixture ids well outside the whitelist range so this suite never
// collides with the seed test's exact-count assertions.
const AAA_TEAM_ID = 990001;
const ROSTERED_ID = 900001;
const ARCHIVED_ID = 900002;
const TEST_PLAYER_IDS = [ROSTERED_ID, ARCHIVED_ID];

async function cleanup() {
  await db.delete(playerRecentForm).where(inArray(playerRecentForm.playerId, TEST_PLAYER_IDS));
  await db.delete(playerCurrentStatus).where(inArray(playerCurrentStatus.playerId, TEST_PLAYER_IDS));
  await db.delete(players).where(inArray(players.mlbPlayerId, TEST_PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [AAA_TEAM_ID]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  await db.insert(teams).values({
    mlbTeamId: AAA_TEAM_ID,
    nameEn: "Reno Aces",
    nameZh: "里諾王牌",
    abbrev: "RNO",
    level: "aaa",
  });

  // Scenario A: rostered at AAA, on the 60-day IL, with a recent-form line.
  await db.insert(players).values({
    mlbPlayerId: ROSTERED_ID,
    nameEn: "AAA Test Rostered",
    nameZh: "測試在隊",
    primaryPosition: "SS",
    lifecycle: "tracked",
  });
  await db.insert(playerCurrentStatus).values({
    playerId: ROSTERED_ID,
    affiliation: "rostered",
    teamId: AAA_TEAM_ID,
    level: "aaa",
    health: "il",
    ilDetail: "il_60",
  });
  await db.insert(playerRecentForm).values({
    playerId: ROSTERED_ID,
    sentenceZh: "測試近況：連三場猛打賞",
    pattern: "streak",
  });

  // Scenario B: archived, no projected status, no recent form (empty state).
  await db.insert(players).values({
    mlbPlayerId: ARCHIVED_ID,
    nameEn: "ZZZ Test Archived",
    nameZh: "測試封存",
    primaryPosition: "P",
    lifecycle: "archived",
  });
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerSummaries", () => {
  it("composes 狀態一句 from affiliation × health and joins team + recent form", async () => {
    const summaries = await getPlayerSummaries();
    const rostered = summaries.find((s) => s.playerId === ROSTERED_ID);

    expect(rostered).toBeDefined();
    expect(rostered?.statusSentence).toBe("3A・傷兵名單（IL-60）");
    expect(rostered?.team).toEqual({
      id: AAA_TEAM_ID,
      name: "里諾王牌",
      abbrev: "RNO",
      level: "aaa",
      levelLabel: "3A",
    });
    expect(rostered?.recentForm).toBe("測試近況：連三場猛打賞");
    expect(rostered?.lifecycle).toBe("tracked");
  });

  it("falls back gracefully when status / recent form rows are missing", async () => {
    const summaries = await getPlayerSummaries();
    const archived = summaries.find((s) => s.playerId === ARCHIVED_ID);

    expect(archived).toBeDefined();
    expect(archived?.statusSentence).toBe("狀態同步中");
    expect(archived?.team).toBeNull();
    expect(archived?.recentForm).toBeNull();
    expect(archived?.lifecycle).toBe("archived");
  });

  it("returns tracked players before archived ones", async () => {
    const summaries = await getPlayerSummaries();
    const idxRostered = summaries.findIndex((s) => s.playerId === ROSTERED_ID);
    const idxArchived = summaries.findIndex((s) => s.playerId === ARCHIVED_ID);

    expect(idxRostered).toBeGreaterThanOrEqual(0);
    expect(idxArchived).toBeGreaterThan(idxRostered);
  });

  it("every row satisfies the PlayerSummary contract", async () => {
    const summaries = await getPlayerSummaries();
    expect(() => z.array(PlayerSummarySchema).parse(summaries)).not.toThrow();
  });
});

describe("GET /api/players", () => {
  it("responds with a Zod-valid PlayerSummary[] including our fixture", async () => {
    const { GET } = await import("../../app/api/players/route.ts");
    const res = await GET();
    const body = await res.json();

    const parsed = z.array(PlayerSummarySchema).parse(body);
    expect(parsed.some((s) => s.playerId === ROSTERED_ID)).toBe(true);
  });
});
