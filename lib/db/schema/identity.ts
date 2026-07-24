import { type AnyPgColumn, date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { handedness, playerLifecycle, teamLevel } from "./enums.ts";

/** 手動白名單，「誰算台灣球員」的事實來源（spec-01 A.1 / C.1）。 */
export const players = pgTable("players", {
  mlbPlayerId: integer("mlb_player_id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh"),
  primaryPosition: text("primary_position"),
  bats: handedness("bats"),
  throws: handedness("throws"),
  birthdate: date("birthdate"),
  lifecycle: playerLifecycle("lifecycle").notNull().default("tracked"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 球隊／affiliate；`parent_org_team_id` 區分母球團與所屬球隊（spec-01 C.2）。 */
export const teams = pgTable("teams", {
  mlbTeamId: integer("mlb_team_id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh"),
  abbrev: text("abbrev"),
  level: teamLevel("level").notNull(),
  parentOrgTeamId: integer("parent_org_team_id").references((): AnyPgColumn => teams.mlbTeamId),
});
