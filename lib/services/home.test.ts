import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import {
  gameBattingLines,
  gamePitchingLines,
  games,
  playerCurrentStatus,
  playerRecentForm,
  players,
  teams,
  transactionEvents,
  seasonBattingStats,
} from "../db/schema/index.ts";
import { getHome, HomeSchema } from "./home.ts";

const TEAM = 991001;
const OPPONENT = 991002;
const BATTER = 901001;
const PITCHER = 901002;
const TWO_WAY = 901003;
const FINAL_GAME = 971001;
const PARTIAL_GAME = 971002;
const PREVIOUS_FINAL_GAME = 971003;
const NEXT_GAME = 971004;
const PLAYER_IDS = [BATTER, PITCHER, TWO_WAY];
const GAME_PKS = [FINAL_GAME, PARTIAL_GAME, PREVIOUS_FINAL_GAME, NEXT_GAME];

async function cleanup() {
  await db.delete(transactionEvents).where(inArray(transactionEvents.playerId, PLAYER_IDS));
  await db.delete(playerCurrentStatus).where(inArray(playerCurrentStatus.playerId, PLAYER_IDS));
  await db.delete(playerRecentForm).where(inArray(playerRecentForm.playerId, PLAYER_IDS));
  await db.delete(seasonBattingStats).where(inArray(seasonBattingStats.playerId, PLAYER_IDS));
  await db.delete(gameBattingLines).where(inArray(gameBattingLines.gamePk, GAME_PKS));
  await db.delete(gamePitchingLines).where(inArray(gamePitchingLines.gamePk, GAME_PKS));
  await db.delete(games).where(inArray(games.gamePk, GAME_PKS));
  await db.delete(players).where(inArray(players.mlbPlayerId, PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, [TEAM, OPPONENT]));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  await db.insert(teams).values([
    { mlbTeamId: TEAM, nameEn: "Home Team", abbrev: "HOM", level: "mlb" },
    { mlbTeamId: OPPONENT, nameEn: "Away Team", abbrev: "AWY", level: "mlb" },
  ]);
  await db.insert(players).values([
    { mlbPlayerId: BATTER, nameEn: "Batter", nameZh: "測試打者", lifecycle: "tracked" },
    { mlbPlayerId: PITCHER, nameEn: "Pitcher", nameZh: "測試投手", lifecycle: "tracked" },
    { mlbPlayerId: TWO_WAY, nameEn: "Two Way", nameZh: "測試二刀流", lifecycle: "tracked" },
  ]);
  await db.insert(playerRecentForm).values([
    { playerId: BATTER, sentenceZh: "近 5 場打擊率 .400", pattern: "recent_agg" },
    { playerId: PITCHER, sentenceZh: "上一場飆 8K", pattern: "single_game" },
    { playerId: TWO_WAY, sentenceZh: "連續 3 場有安打", pattern: "streak" },
  ]);
  // With no 2099 row, this is the prior-season fallback for the empty state.
  await db.insert(seasonBattingStats).values({
    playerId: BATTER, season: 2098, level: "mlb", teamId: TEAM,
    g: 42, pa: 180, ab: 160, h: 48, hr: 8, rbi: 31,
  });
  await db.insert(playerCurrentStatus).values([
    { playerId: BATTER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: PITCHER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: TWO_WAY, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "il", ilDetail: "il_10" },
  ]);
  await db.insert(games).values([
    {
      gamePk: FINAL_GAME, level: "mlb", gameDateUs: "2099-07-26", status: "final",
      homeTeamId: TEAM, awayTeamId: OPPONENT,
    },
    // Falls on the injected US "today"; the whole day has not yet passed by the
    // US-Pacific wall clock, so its date must not become the digest — regardless
    // of status (wall-clock anchoring no longer inspects game status).
    {
      gamePk: PARTIAL_GAME, level: "mlb", gameDateUs: "2099-07-27", status: "live",
      homeTeamId: TEAM, awayTeamId: OPPONENT,
    },
    {
      gamePk: PREVIOUS_FINAL_GAME, level: "mlb", gameDateUs: "2099-07-25", status: "final",
      homeTeamId: TEAM, awayTeamId: OPPONENT,
    },
    {
      gamePk: NEXT_GAME, level: "mlb", gameDateUs: "2099-07-29", status: "scheduled",
      startTimeUtc: new Date("2099-07-30T00:05:00.000Z"),
      homeTeamId: OPPONENT, awayTeamId: TEAM, probableAwayPitcherId: PITCHER,
    },
  ]);
  await db.insert(gameBattingLines).values([
    { playerId: BATTER, gamePk: FINAL_GAME, teamId: TEAM, level: "mlb", pa: 5, h: 2, hr: 1, rbi: 3, bb: 1, so: 0 },
    { playerId: TWO_WAY, gamePk: FINAL_GAME, teamId: TEAM, level: "mlb", pa: 4, h: 1, hr: 0, rbi: 0, bb: 0, so: 1 },
    { playerId: BATTER, gamePk: PARTIAL_GAME, teamId: TEAM, level: "mlb", pa: 1 },
    { playerId: BATTER, gamePk: PREVIOUS_FINAL_GAME, teamId: TEAM, level: "mlb", pa: 4, h: 1 },
  ]);
  await db.insert(gamePitchingLines).values([
    { playerId: PITCHER, gamePk: FINAL_GAME, teamId: TEAM, level: "mlb", started: true, ipOuts: 18, h: 4, r: 1, er: 1, so: 8, bb: 2 },
    { playerId: TWO_WAY, gamePk: FINAL_GAME, teamId: TEAM, level: "mlb", ipOuts: 3, h: 0, r: 0, er: 0, so: 1, bb: 0 },
  ]);
  await db.insert(transactionEvents).values([
    { playerId: BATTER, type: "call_up", effectiveDate: "2099-07-27", description: "Called up", source: "manual" },
    { playerId: PITCHER, type: "il_on", effectiveDate: "2099-07-28", description: "Placed on IL", source: "manual" },
    // On the digest date: it belongs to the game-day context, not the later feed.
    { playerId: TWO_WAY, type: "trade", effectiveDate: "2099-07-26", description: "Traded", source: "manual" },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getHome", () => {
  it("anchors the digest to the newest US game day fully past by the US-Pacific wall clock", async () => {
    // Injected US "today" is 2099-07-27, so 07-27 (current day) is excluded even
    // though a tracked player has a line on it; the newest fully-past line day is
    // 07-26.
    const home = await getHome(db, "2099-07-27");

    expect(() => HomeSchema.parse(home)).not.toThrow();
    expect(home.digestDate).toBe("2099-07-26");
    expect(home.gameCards).toHaveLength(4); // batter + pitcher + two-way batting/pitching
    expect(home.gameCards).toContainEqual(expect.objectContaining({
      playerId: BATTER,
      role: "batting",
      nameZh: "測試打者",
      teamAbbrev: "HOM",
      line: { pa: 5, h: 2, hr: 1, rbi: 3, bb: 1, so: 0 },
      recentForm: "近 5 場打擊率 .400",
    }));
    expect(home.gameCards).toContainEqual(expect.objectContaining({
      playerId: PITCHER,
      role: "pitching",
      line: { ipOuts: 18, h: 4, r: 1, er: 1, so: 8, bb: 2 },
    }));
  });

  it("returns a null digest (and no game cards) when no line day is fully past", async () => {
    // Inject a "today" before any tracked line exists → nothing is strictly
    // earlier → empty → null.
    const early = await getHome(db, "1990-01-01");
    expect(early.digestDate).toBeNull();
    expect(early.gameCards).toEqual([]);
  });

  it("anchors by wall clock alone, ignoring stored game status", async () => {
    // With today 07-28 the 07-27 game day is fully past, so it is selected as the
    // newest eligible day despite that game being stored as "live".
    const late = await getHome(db, "2099-07-28");
    expect(late.digestDate).toBe("2099-07-27");
  });

  it("lists only post-digest tracked-player transactions in reverse chronological order", async () => {
    const home = await getHome(db, "2099-07-27");

    expect(home.events).toEqual([
      expect.objectContaining({
        playerId: PITCHER, nameZh: "測試投手", type: "il_on", typeLabel: "進入傷兵名單",
        date: "2099-07-28", description: "Placed on IL",
      }),
      expect.objectContaining({
        playerId: BATTER, nameZh: "測試打者", type: "call_up", typeLabel: "升上大聯盟",
        date: "2099-07-27", description: "Called up",
      }),
    ]);
  });

  it("reuses the player-page upcoming rules for probable, possible, and IL players", async () => {
    const home = await getHome(db, "2099-07-27");

    expect(home.upcoming).toEqual(expect.arrayContaining([
      expect.objectContaining({
        playerId: PITCHER, nameZh: "測試投手", opponent: "AWY",
        startTimeUtc: "2099-07-30T00:05:00.000Z", tag: "probable_starter",
      }),
      expect.objectContaining({ playerId: BATTER, nameZh: "測試打者", tag: "possible" }),
      expect.objectContaining({ playerId: TWO_WAY, nameZh: "測試二刀流", tag: "il" }),
    ]));
  });

  it("returns prior-season review cards and static glossary picks only when there are no game cards", async () => {
    const home = await getHome(db, "2099-07-27", null);

    expect(home.digestDate).toBeNull();
    expect(home.gameCards).toEqual([]);
    expect(home.emptyState).toEqual(expect.objectContaining({
      glossaryPicks: expect.arrayContaining([
        expect.objectContaining({ nameZh: expect.any(String), link: expect.stringMatching(/^\/glossary\//) }),
      ]),
      seasonReviewCards: expect.arrayContaining([
        expect.objectContaining({
          playerId: BATTER, nameZh: "測試打者", season: 2098,
          batting: expect.objectContaining({ g: 42, h: 48, hr: 8, rbi: 31 }),
          recentForm: "近 5 場打擊率 .400",
        }),
      ]),
    }));

    expect((await getHome(db, "2099-07-27")).emptyState).toBeNull();
  });

  it("serves the same Zod-valid contract from GET /api/home", async () => {
    const { GET } = await import("../../app/api/home/route.ts");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(() => HomeSchema.parse(body)).not.toThrow();
  });
});
