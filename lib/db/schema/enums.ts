import { pgEnum } from "drizzle-orm/pg-core";

/** 打擊／投球慣用手（spec-01 C.1）。 */
export const handedness = pgEnum("handedness", ["L", "R", "S"]);

/** 球員生命週期（spec-01 A.2）。 */
export const playerLifecycle = pgEnum("player_lifecycle", ["tracked", "archived"]);

/** 層級（spec-01 C.2；sportId 對照 spec-03 §4）。 */
export const teamLevel = pgEnum("team_level", ["mlb", "aaa", "aa", "a_plus", "a", "rookie"]);

/** 異動事件類型（spec-01 C.3 / B.3）。`declare_fa`＝宣告成為自由球員（→ affiliation free_agent）；`assign`＝小聯盟指派（→ rostered 於 to_team 的隊/層級）；`waiver_claim`＝讓渡挑選（→ rostered 於 to_team，與 `trade` 同為換隊但成因不同）。 */
export const transactionType = pgEnum("transaction_type", [
  "sign",
  "call_up",
  "send_down",
  "trade",
  "waiver_claim",
  "dfa",
  "release",
  "declare_fa",
  "assign",
  "il_on",
  "il_off",
  "depart",
  "other",
]);

/** 事件來源（spec-01 C.3）。 */
export const eventSource = pgEnum("event_source", ["statsapi", "manual"]);

/** 歸屬軸（spec-01 B.2）。 */
export const affiliation = pgEnum("affiliation", [
  "rostered",
  "dfa",
  "free_agent",
  "released",
  "departed",
]);

/** 健康軸（spec-01 B.2）。 */
export const health = pgEnum("health", ["active", "il"]);

/** 比賽狀態（spec-01 C.5）。 */
export const gameStatus = pgEnum("game_status", [
  "scheduled",
  "live",
  "final",
  "postponed",
  "suspended",
  "cancelled",
]);

/** 近況一句話 pattern（spec-01 C.8 / spec-03 §5）。 */
export const recentFormPattern = pgEnum("recent_form_pattern", [
  "career_high",
  "season_high",
  "streak",
  "single_game",
  "recent_agg",
  "status_fallback",
]);

/** 同步批次類型（spec-01 C.9）。 */
export const syncKind = pgEnum("sync_kind", ["morning", "evening", "manual"]);

/** 同步批次結果（spec-01 C.9）。 */
export const syncStatus = pgEnum("sync_status", ["success", "partial", "failed"]);
