import { migrate } from "drizzle-orm/node-postgres/migrator";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import {
  games,
  playerCurrentStatus,
  players,
  teams,
} from "../db/schema/index.ts";
import { getPlayerUpcoming, UpcomingSchema } from "./player-upcoming.ts";

const TEAM = 990201;
const OPP = 990202;
const TWO_WAY_TEAM = 990203;
const STALE_TEAM = 990204;
const PITCHER = 900201; // probable starter
const FIELDER = 900202; // possible
const IL_PLAYER = 900203; // injured
const NO_TEAM = 900204; // no current team
const TWO_WAY = 900205; // DH listed as probable pitcher
const STALE_ONLY = 900206; // team's only scheduled game is in the past
const NEXT_GAME = 970201;
const PAST_GAME = 970202;
const STALE_GAME = 970203; // scheduled but earlier & in the past
const TWO_WAY_GAME = 970204;
const STALE_ONLY_GAME = 970205;

// Fixed "today" so the gameDateUs lower-bound guard is deterministic.
const TODAY = "2026-07-29";

const TEAM_IDS = [TEAM, OPP, TWO_WAY_TEAM, STALE_TEAM];
const PLAYER_IDS = [PITCHER, FIELDER, IL_PLAYER, NO_TEAM, TWO_WAY, STALE_ONLY];
const GAME_PKS = [NEXT_GAME, PAST_GAME, STALE_GAME, TWO_WAY_GAME, STALE_ONLY_GAME];

async function cleanup() {
  await db.delete(playerCurrentStatus).where(inArray(playerCurrentStatus.playerId, PLAYER_IDS));
  await db.delete(games).where(inArray(games.gamePk, GAME_PKS));
  await db.delete(players).where(inArray(players.mlbPlayerId, PLAYER_IDS));
  await db.delete(teams).where(inArray(teams.mlbTeamId, TEAM_IDS));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await cleanup();

  await db.insert(teams).values([
    { mlbTeamId: TEAM, nameEn: "My Team", abbrev: "MYT", level: "mlb" },
    { mlbTeamId: OPP, nameEn: "Rival", abbrev: "RIV", level: "mlb" },
    { mlbTeamId: TWO_WAY_TEAM, nameEn: "Two Way", abbrev: "TWO", level: "mlb" },
    { mlbTeamId: STALE_TEAM, nameEn: "Stale", abbrev: "STL", level: "mlb" },
  ]);
  await db.insert(players).values([
    { mlbPlayerId: PITCHER, nameEn: "Pitcher", primaryPosition: "P", lifecycle: "tracked" },
    { mlbPlayerId: FIELDER, nameEn: "Fielder", primaryPosition: "SS", lifecycle: "tracked" },
    { mlbPlayerId: IL_PLAYER, nameEn: "Injured", primaryPosition: "P", lifecycle: "tracked" },
    { mlbPlayerId: NO_TEAM, nameEn: "Free", primaryPosition: "1B", lifecycle: "tracked" },
    { mlbPlayerId: TWO_WAY, nameEn: "TwoWay", primaryPosition: "DH", lifecycle: "tracked" },
    { mlbPlayerId: STALE_ONLY, nameEn: "Staler", primaryPosition: "SS", lifecycle: "tracked" },
  ]);
  await db.insert(playerCurrentStatus).values([
    { playerId: PITCHER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: FIELDER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: IL_PLAYER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "il", ilDetail: "il_10" },
    { playerId: NO_TEAM, affiliation: "free_agent", teamId: null, level: null, health: "active" },
    { playerId: TWO_WAY, affiliation: "rostered", teamId: TWO_WAY_TEAM, level: "mlb", health: "active" },
    { playerId: STALE_ONLY, affiliation: "rostered", teamId: STALE_TEAM, level: "mlb", health: "active" },
  ]);
  await db.insert(games).values([
    // Next scheduled game: MYT away at RIV, PITCHER is the probable away pitcher.
    {
      gamePk: NEXT_GAME, level: "mlb", gameDateUs: "2026-07-30", status: "scheduled",
      homeTeamId: OPP, awayTeamId: TEAM, venueName: "Rival Park",
      seriesGameNumber: 2, gamesInSeries: 3, probableAwayPitcherId: PITCHER,
    },
    // A past final result: MYT (home) won 5-3.
    {
      gamePk: PAST_GAME, level: "mlb", gameDateUs: "2026-07-28", status: "final",
      homeTeamId: TEAM, awayTeamId: OPP, homeScore: 5, awayScore: 3,
    },
    // A stale scheduled game (earlier date, in the past) — must be excluded so it
    // never surfaces as MYT's next game despite sorting first ascending.
    {
      gamePk: STALE_GAME, level: "mlb", gameDateUs: "2026-07-20", status: "scheduled",
      homeTeamId: TEAM, awayTeamId: OPP,
    },
    // Two-way player's team next game: TWO listed as the probable away pitcher.
    {
      gamePk: TWO_WAY_GAME, level: "mlb", gameDateUs: "2026-07-31", status: "scheduled",
      homeTeamId: OPP, awayTeamId: TWO_WAY_TEAM, probableAwayPitcherId: TWO_WAY,
    },
    // Stale team's only scheduled game is in the past.
    {
      gamePk: STALE_ONLY_GAME, level: "mlb", gameDateUs: "2026-07-19", status: "scheduled",
      homeTeamId: STALE_TEAM, awayTeamId: OPP,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerUpcoming", () => {
  it("tags a matching probable pitcher as probable_starter with series + recent results", async () => {
    const up = await getPlayerUpcoming(PITCHER, db, TODAY);
    expect(() => UpcomingSchema.parse(up)).not.toThrow();
    expect(up!.tag).toBe("probable_starter");
    // The stale past scheduled game must NOT win despite sorting first.
    expect(up!.nextGame?.gamePk).toBe(NEXT_GAME);
    expect(up!.nextGame?.opponent?.abbrev).toBe("RIV");
    expect(up!.nextGame?.isHome).toBe(false);
    expect(up!.nextGame?.gamesInSeries).toBe(3);
    // recent: MYT home win 5-3
    expect(up!.recentResults[0].win).toBe(true);
    expect(up!.recentResults[0].teamScore).toBe(5);
    expect(up!.recentResults[0].opponentScore).toBe(3);
  });

  it("tags a healthy non-pitcher as possible", async () => {
    const up = await getPlayerUpcoming(FIELDER, db, TODAY);
    expect(up!.tag).toBe("possible");
    expect(up!.nextGame?.opponent?.abbrev).toBe("RIV");
  });

  it("tags an injured player as il", async () => {
    const up = await getPlayerUpcoming(IL_PLAYER, db, TODAY);
    expect(up!.tag).toBe("il");
  });

  it("returns null when the player has no current team", async () => {
    expect(await getPlayerUpcoming(NO_TEAM, db, TODAY)).toBeNull();
  });

  it("tags a two-way player named as probable pitcher as probable_starter", async () => {
    const up = await getPlayerUpcoming(TWO_WAY, db, TODAY);
    expect(up!.tag).toBe("probable_starter");
    expect(up!.nextGame?.gamePk).toBe(TWO_WAY_GAME);
  });

  it("has no next game when the team's only scheduled game is in the past", async () => {
    const up = await getPlayerUpcoming(STALE_ONLY, db, TODAY);
    expect(up!.nextGame).toBeNull();
    expect(up!.tag).toBe("possible");
  });
});
