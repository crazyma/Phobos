import { bigserial, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { recentFormPattern, syncKind, syncStatus } from "./enums.ts";
import { players } from "./identity.ts";

/** 近況一句話，ETL 每批重算，永不為空（spec-01 C.8 / spec-03 §5）。 */
export const playerRecentForm = pgTable("player_recent_form", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => players.mlbPlayerId),
  sentenceZh: text("sentence_zh").notNull(),
  pattern: recentFormPattern("pattern").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 同步批次；頁面「資料最後更新時間」取最近一筆非 failed 的 finished_at（spec-01 C.9）。 */
export const syncRuns = pgTable("sync_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: syncKind("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatus("status").notNull(),
  detail: jsonb("detail"),
});

/** Raw layer：上游原始 payload，供轉換邏輯變動時 reprocess（spec-01 C.10 / ADR §8.1）。 */
export const rawPayloads = pgTable("raw_payloads", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  endpoint: text("endpoint"),
  params: jsonb("params"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  payload: jsonb("payload"),
});
