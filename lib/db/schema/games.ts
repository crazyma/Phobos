import { boolean, date, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { gameStatus, teamLevel } from "./enums.ts";
import { players, teams } from "./identity.ts";

/**
 * 比賽（spec-01 C.5）。`game_date_us` 為美國比賽日，是首頁窗口的錨定單位。
 * probable pitcher 為裸 integer（可能是非白名單投手），不設 FK。
 */
export const games = pgTable("games", {
  gamePk: integer("game_pk").primaryKey(),
  level: teamLevel("level").notNull(),
  gameDateUs: date("game_date_us").notNull(),
  startTimeUtc: timestamp("start_time_utc", { withTimezone: true }),
  homeTeamId: integer("home_team_id").references(() => teams.mlbTeamId),
  awayTeamId: integer("away_team_id").references(() => teams.mlbTeamId),
  venueName: text("venue_name"),
  status: gameStatus("status").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  gameNumber: integer("game_number"),
  gamesInSeries: integer("games_in_series"),
  seriesGameNumber: integer("series_game_number"),
  probableHomePitcherId: integer("probable_home_pitcher_id"),
  probableAwayPitcherId: integer("probable_away_pitcher_id"),
});

/** 逐場打擊 box line；角色由當場行為決定（spec-01 C.6）。 */
export const gameBattingLines = pgTable(
  "game_batting_lines",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.mlbPlayerId),
    gamePk: integer("game_pk")
      .notNull()
      .references(() => games.gamePk),
    teamId: integer("team_id").references(() => teams.mlbTeamId),
    level: teamLevel("level").notNull(),
    pa: integer("pa").notNull().default(0),
    ab: integer("ab").notNull().default(0),
    h: integer("h").notNull().default(0),
    doubles: integer("doubles").notNull().default(0),
    triples: integer("triples").notNull().default(0),
    hr: integer("hr").notNull().default(0),
    rbi: integer("rbi").notNull().default(0),
    r: integer("r").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    so: integer("so").notNull().default(0),
    sb: integer("sb").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.gamePk] })],
);

/** 逐場投球 box line；`ip_outs` 存局數×3（spec-01 C.6）。 */
export const gamePitchingLines = pgTable(
  "game_pitching_lines",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.mlbPlayerId),
    gamePk: integer("game_pk")
      .notNull()
      .references(() => games.gamePk),
    teamId: integer("team_id").references(() => teams.mlbTeamId),
    level: teamLevel("level").notNull(),
    started: boolean("started").notNull().default(false),
    ipOuts: integer("ip_outs").notNull().default(0),
    h: integer("h").notNull().default(0),
    r: integer("r").notNull().default(0),
    er: integer("er").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    so: integer("so").notNull().default(0),
    hr: integer("hr").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.gamePk] })],
);
