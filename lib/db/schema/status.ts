import { bigint, bigserial, date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { affiliation, eventSource, health, teamLevel, transactionType } from "./enums.ts";
import { players, teams } from "./identity.ts";

/**
 * 異動事件流——異動的唯一真相來源（spec-01 B.1 / C.3）。目前狀態由此重放推導。
 */
export const transactionEvents = pgTable("transaction_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceTxId: text("source_tx_id").unique(),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.mlbPlayerId),
  type: transactionType("type").notNull(),
  effectiveDate: date("effective_date").notNull(),
  announcedAt: timestamp("announced_at", { withTimezone: true }),
  fromTeamId: integer("from_team_id").references(() => teams.mlbTeamId),
  toTeamId: integer("to_team_id").references(() => teams.mlbTeamId),
  ilDetail: text("il_detail"),
  description: text("description"),
  source: eventSource("source").notNull(),
});

/**
 * 目前狀態的投影（歸屬 × 健康），僅 ETL 每批重放寫入（spec-01 B.1 / C.4）。
 */
export const playerCurrentStatus = pgTable("player_current_status", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => players.mlbPlayerId),
  affiliation: affiliation("affiliation").notNull(),
  teamId: integer("team_id").references(() => teams.mlbTeamId),
  level: teamLevel("level"),
  health: health("health").notNull(),
  ilDetail: text("il_detail"),
  asOfEventId: bigint("as_of_event_id", { mode: "number" }).references(() => transactionEvents.id),
  projectedAt: timestamp("projected_at", { withTimezone: true }).notNull().defaultNow(),
});
