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
const PITCHER = 900201; // probable starter
const FIELDER = 900202; // possible
const IL_PLAYER = 900203; // injured
const NO_TEAM = 900204; // no current team
const NEXT_GAME = 970201;
const PAST_GAME = 970202;

const TEAM_IDS = [TEAM, OPP];
const PLAYER_IDS = [PITCHER, FIELDER, IL_PLAYER, NO_TEAM];
const GAME_PKS = [NEXT_GAME, PAST_GAME];

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
  ]);
  await db.insert(players).values([
    { mlbPlayerId: PITCHER, nameEn: "Pitcher", primaryPosition: "P", lifecycle: "tracked" },
    { mlbPlayerId: FIELDER, nameEn: "Fielder", primaryPosition: "SS", lifecycle: "tracked" },
    { mlbPlayerId: IL_PLAYER, nameEn: "Injured", primaryPosition: "P", lifecycle: "tracked" },
    { mlbPlayerId: NO_TEAM, nameEn: "Free", primaryPosition: "1B", lifecycle: "tracked" },
  ]);
  await db.insert(playerCurrentStatus).values([
    { playerId: PITCHER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: FIELDER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "active" },
    { playerId: IL_PLAYER, affiliation: "rostered", teamId: TEAM, level: "mlb", health: "il", ilDetail: "il_10" },
    { playerId: NO_TEAM, affiliation: "free_agent", teamId: null, level: null, health: "active" },
  ]);
  // Next scheduled game: MYT away at RIV, PITCHER is the probable away pitcher.
  await db.insert(games).values([
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
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("getPlayerUpcoming", () => {
  it("tags a matching probable pitcher as probable_starter with series + recent results", async () => {
    const up = await getPlayerUpcoming(PITCHER);
    expect(() => UpcomingSchema.parse(up)).not.toThrow();
    expect(up!.tag).toBe("probable_starter");
    expect(up!.nextGame?.opponent?.abbrev).toBe("RIV");
    expect(up!.nextGame?.isHome).toBe(false);
    expect(up!.nextGame?.gamesInSeries).toBe(3);
    // recent: MYT home win 5-3
    expect(up!.recentResults[0].win).toBe(true);
    expect(up!.recentResults[0].teamScore).toBe(5);
    expect(up!.recentResults[0].opponentScore).toBe(3);
  });

  it("tags a healthy non-pitcher as possible", async () => {
    const up = await getPlayerUpcoming(FIELDER);
    expect(up!.tag).toBe("possible");
    expect(up!.nextGame?.opponent?.abbrev).toBe("RIV");
  });

  it("tags an injured player as il", async () => {
    const up = await getPlayerUpcoming(IL_PLAYER);
    expect(up!.tag).toBe("il");
  });

  it("returns null when the player has no current team", async () => {
    expect(await getPlayerUpcoming(NO_TEAM)).toBeNull();
  });
});
