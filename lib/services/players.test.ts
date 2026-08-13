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
const PARENT_TEAM_ID = 990002;
/** 小聯盟隊但沒有母隊——logo 推不出來的那條路。 */
const ORPHAN_TEAM_ID = 990003;
const TEST_TEAM_IDS = [AAA_TEAM_ID, ORPHAN_TEAM_ID, PARENT_TEAM_ID];
const ROSTERED_ID = 900001;
const ARCHIVED_ID = 900002;
const MLB_ID = 900003;
const ORPHAN_ID = 900004;
const TEST_PLAYER_IDS = [ROSTERED_ID, ARCHIVED_ID, MLB_ID, ORPHAN_ID];

/** 素材到位後的樣子；正式的 `LICENSED_TEAM_LOGO_IDS` 目前仍是空集合。 */
const LICENSED = new Set([PARENT_TEAM_ID]);

async function cleanup() {
  await db.delete(playerRecentForm).where(inArray(playerRecentForm.playerId, TEST_PLAYER_IDS));
  await db.delete(playerCurrentStatus).where(inArray(playerCurrentStatus.playerId, TEST_PLAYER_IDS));
  await db.delete(players).where(inArray(players.mlbPlayerId, TEST_PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, TEST_TEAM_IDS));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  // 小聯盟球隊**不**自帶中文名（spec-01 C.2）：顯示名由母隊中文名推導，
  // 所以這裡刻意只給英文原名，母隊才是中文名的來源。
  await db.insert(teams).values({
    mlbTeamId: PARENT_TEAM_ID,
    nameEn: "Test Parent Club",
    nameZh: "測試母隊",
    abbrev: "TPC",
    level: "mlb",
  });
  await db.insert(teams).values({
    mlbTeamId: AAA_TEAM_ID,
    nameEn: "Reno Aces",
    abbrev: "RNO",
    level: "aaa",
    parentOrgTeamId: PARENT_TEAM_ID,
  });
  // 沒有母隊的小聯盟隊：logo 推不出 root id，只能是 null。
  await db.insert(teams).values({
    mlbTeamId: ORPHAN_TEAM_ID,
    nameEn: "Sugar Land Space Cowboys",
    abbrev: "SL",
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

  // Scenario C: rostered in the majors — logo 直接用球隊自己的 id。
  await db.insert(players).values({
    mlbPlayerId: MLB_ID,
    nameEn: "MLB Test Rostered",
    nameZh: "測試大聯盟",
    primaryPosition: "OF",
    lifecycle: "tracked",
  });
  await db.insert(playerCurrentStatus).values({
    playerId: MLB_ID,
    affiliation: "rostered",
    teamId: PARENT_TEAM_ID,
    level: "mlb",
    health: "active",
  });

  // Scenario D: rostered at a AAA club with no parent org — logo 解不出。
  await db.insert(players).values({
    mlbPlayerId: ORPHAN_ID,
    nameEn: "Orphan Test Rostered",
    nameZh: "測試無母隊",
    primaryPosition: "P",
    lifecycle: "tracked",
  });
  await db.insert(playerCurrentStatus).values({
    playerId: ORPHAN_ID,
    affiliation: "rostered",
    teamId: ORPHAN_TEAM_ID,
    level: "aaa",
    health: "active",
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
    // 名冊列另外印 levelLabel 徽章，所以隊名不重複帶層級。
    expect(rostered?.team).toEqual({
      id: AAA_TEAM_ID,
      name: "測試母隊（Reno Aces）",
      abbrev: "RNO",
      level: "aaa",
      levelLabel: "3A",
      logoSrc: null,
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

/**
 * logo 走的是名冊頁**實際會走的那條路**：`getPlayerSummaries()` → `team.logoSrc`。
 * 舊寫法讓元件自己呼叫 `teamLogo(player.team?.id)` 去讀一個 module 層級的可變
 * 全域，而名冊頁的資料來源從來沒填過那個全域——測試傳 map 進去所以是綠的，
 * 上線卻會讓小聯盟球員推不到母隊。這裡只從 service 的輸出斷言，不留那個縫。
 */
describe("getPlayerSummaries：team.logoSrc", () => {
  it("小聯盟球員解析到母隊的 logo", async () => {
    const summaries = await getPlayerSummaries(db, LICENSED);
    const rostered = summaries.find((s) => s.playerId === ROSTERED_ID);
    expect(rostered?.team?.logoSrc).toBe(`/logos/${PARENT_TEAM_ID}.svg`);
  });

  it("大聯盟球員直接用自己球隊的 id", async () => {
    const summaries = await getPlayerSummaries(db, LICENSED);
    const mlb = summaries.find((s) => s.playerId === MLB_ID);
    expect(mlb?.team?.logoSrc).toBe(`/logos/${PARENT_TEAM_ID}.svg`);
  });

  it("小聯盟隊推不出母隊時為 null，不退回球隊自己的 id", async () => {
    const summaries = await getPlayerSummaries(db, new Set([ORPHAN_TEAM_ID]));
    const orphan = summaries.find((s) => s.playerId === ORPHAN_ID);
    expect(orphan?.team?.id).toBe(ORPHAN_TEAM_ID);
    expect(orphan?.team?.logoSrc).toBeNull();
  });

  it("素材未到位時全部為 null（目前正式行為：授權清單為空）", async () => {
    const summaries = await getPlayerSummaries();
    for (const id of [ROSTERED_ID, MLB_ID, ORPHAN_ID]) {
      expect(summaries.find((s) => s.playerId === id)?.team?.logoSrc).toBeNull();
    }
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
