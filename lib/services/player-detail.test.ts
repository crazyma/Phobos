import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import {
  players,
  playerCurrentStatus,
  playerRecentForm,
  teams,
} from "../db/schema/index.ts";
import { getPlayerDetail, PlayerDetailSchema } from "./player-detail.ts";

const AAA_TEAM_ID = 990011;
const ROSTERED_ID = 900011;
const ARCHIVED_ID = 900012;
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

  await db.insert(players).values({
    mlbPlayerId: ROSTERED_ID,
    nameEn: "AAA Detail Rostered",
    nameZh: "測試個人頁",
    primaryPosition: "SS",
    bats: "L",
    throws: "R",
    birthdate: "2001-07-26",
    lifecycle: "tracked",
  });
  await db.insert(playerCurrentStatus).values({
    playerId: ROSTERED_ID,
    affiliation: "rostered",
    teamId: AAA_TEAM_ID,
    level: "aaa",
    health: "active",
  });
  await db.insert(playerRecentForm).values({
    playerId: ROSTERED_ID,
    sentenceZh: "連續 5 場有安打",
    pattern: "streak",
  });

  await db.insert(players).values({
    mlbPlayerId: ARCHIVED_ID,
    nameEn: "ZZZ Detail Archived",
    nameZh: "測試封存",
    primaryPosition: "P",
    lifecycle: "archived",
  });
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerDetail", () => {
  it("returns the base detail shape with bio, team, status, recent form", async () => {
    const player = await getPlayerDetail(ROSTERED_ID);
    expect(player).not.toBeNull();
    expect(player!.nameZh).toBe("測試個人頁");
    expect(player!.bats).toBe("L");
    expect(player!.throws).toBe("R");
    expect(player!.birthdate).toBe("2001-07-26");
    expect(player!.team).toEqual({
      id: AAA_TEAM_ID,
      name: "里諾王牌",
      abbrev: "RNO",
      level: "aaa",
      levelLabel: "3A",
    });
    expect(player!.statusSentence).toBe("3A");
    expect(player!.recentForm).toBe("連續 5 場有安打");
    expect(() => PlayerDetailSchema.parse(player)).not.toThrow();
  });

  it("returns null for an id not in the whitelist", async () => {
    expect(await getPlayerDetail(123456789)).toBeNull();
  });

  it("returns archived players with reduced status but valid shape", async () => {
    const player = await getPlayerDetail(ARCHIVED_ID);
    expect(player).not.toBeNull();
    expect(player!.lifecycle).toBe("archived");
    expect(player!.team).toBeNull();
    // archived players surface「已離開美職」, not the empty-state「狀態同步中」
    expect(player!.statusSentence).toBe("已離開美職");
    expect(player!.recentForm).toBeNull();
  });
});

describe("GET /api/players/:id", () => {
  it("responds with a Zod-valid PlayerDetail for a known id", async () => {
    const { GET } = await import("../../app/api/players/[id]/route.ts");
    const res = await GET(new Request("http://test/api/players/900011"), {
      params: Promise.resolve({ id: String(ROSTERED_ID) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => PlayerDetailSchema.parse(body)).not.toThrow();
    expect(body.playerId).toBe(ROSTERED_ID);
  });

  it("responds 404 for an unknown id", async () => {
    const { GET } = await import("../../app/api/players/[id]/route.ts");
    const res = await GET(new Request("http://test/api/players/123456789"), {
      params: Promise.resolve({ id: "123456789" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });

  it("responds 404 for a non-numeric id", async () => {
    const { GET } = await import("../../app/api/players/[id]/route.ts");
    const res = await GET(new Request("http://test/api/players/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(404);
  });
});
