import { integer, pgTable, primaryKey, real, timestamp } from "drizzle-orm/pg-core";
import { teamLevel } from "./enums.ts";
import { players, teams } from "./identity.ts";

/**
 * 球季打擊數據，粒度＝球季 × 層級 × 球隊（spec-01 C.7）。層級合計列由 services 重算。
 * 進階欄 best-effort：woba/wrc_plus/war 來自 StatsAPI sabermetrics（僅 MLB 層級），
 * xwoba 為 Savant 可選補充。只落不可推導欄（AVG/OBP/SLG/OPS/ISO/BABIP 由 services 算）。
 */
export const seasonBattingStats = pgTable(
  "season_batting_stats",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.mlbPlayerId),
    season: integer("season").notNull(),
    level: teamLevel("level").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.mlbTeamId),
    g: integer("g").notNull().default(0),
    pa: integer("pa").notNull().default(0),
    ab: integer("ab").notNull().default(0),
    h: integer("h").notNull().default(0),
    doubles: integer("doubles").notNull().default(0),
    triples: integer("triples").notNull().default(0),
    hr: integer("hr").notNull().default(0),
    rbi: integer("rbi").notNull().default(0),
    r: integer("r").notNull().default(0),
    sb: integer("sb").notNull().default(0),
    cs: integer("cs").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    so: integer("so").notNull().default(0),
    hbp: integer("hbp").notNull().default(0),
    sf: integer("sf").notNull().default(0),
    woba: real("woba"),
    xwoba: real("xwoba"),
    wrcPlus: real("wrc_plus"),
    war: real("war"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.season, t.level, t.teamId] })],
);

/**
 * 球季投手數據，粒度同上（spec-01 C.7）。進階欄：fip/war 來自 sabermetrics，
 * lob_pct 由 ETL 自算。ERA/WHIP/HR9/K%/BB% 由 services 算、不落欄。
 */
export const seasonPitchingStats = pgTable(
  "season_pitching_stats",
  {
    playerId: integer("player_id")
      .notNull()
      .references(() => players.mlbPlayerId),
    season: integer("season").notNull(),
    level: teamLevel("level").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.mlbTeamId),
    g: integer("g").notNull().default(0),
    gs: integer("gs").notNull().default(0),
    ipOuts: integer("ip_outs").notNull().default(0),
    bf: integer("bf").notNull().default(0),
    h: integer("h").notNull().default(0),
    r: integer("r").notNull().default(0),
    er: integer("er").notNull().default(0),
    hr: integer("hr").notNull().default(0),
    bb: integer("bb").notNull().default(0),
    so: integer("so").notNull().default(0),
    w: integer("w").notNull().default(0),
    l: integer("l").notNull().default(0),
    sv: integer("sv").notNull().default(0),
    hld: integer("hld").notNull().default(0),
    fip: real("fip"),
    lobPct: real("lob_pct"),
    war: real("war"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.season, t.level, t.teamId] })],
);
