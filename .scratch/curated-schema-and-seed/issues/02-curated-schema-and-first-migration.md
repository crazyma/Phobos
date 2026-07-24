# 02 — Curated schema + 首版 migration

**What to build:** 把 spec-01 §C 的整組 curated 資料模型定義成 Drizzle schema，並產出能乾淨套用到全新 DB 的首版 migration。完成後，DB 裡就有球員追蹤所需的全部表與 enum，供 seed（03）與日後 ETL／services 掛載。

**Blocked by:** 01（需 Drizzle/drizzle-kit/Postgres 骨架就位）。

**Status:** done

- [x] spec-01 §C 全部 12 張 curated 表以 Drizzle 定義（`lib/db/schema/` 拆 enums/identity/status/games/season/operational，由 index barrel 匯出）
- [x] 11 個 enum 值集依 spec-01 落定（handedness/player_lifecycle/team_level/transaction_type/event_source/affiliation/health/game_status/recent_form_pattern/sync_kind/sync_status）
- [x] 複合主鍵：季數據表 `(player_id, season, level, team_id)`、逐場表 `(player_id, game_pk)`（打/投分兩表）——introspection 測試驗證
- [x] 關聯：20 條 FK，含 `transaction_events → players`、`teams.parent_org_team_id` 自我 FK、`player_current_status.as_of_event_id → transaction_events`；probable pitcher 刻意不設 FK（可能非白名單投手）
- [x] 只存不可推導比率：進階欄僅 woba/xwoba/wrc_plus/war（打）、fip/lob_pct/war（投）為 real nullable；**無** avg/era/ops/whip 等（負向斷言測試通過）
- [x] drizzle-kit 產出 `drizzle/0000_*.sql`，對全新 DB 乾淨套用（"Migrations applied cleanly."，12 表建成）
- [x] schema 測試（`lib/db/schema/schema.test.ts`）：6 案例斷言複合主鍵×2、FK、enum 值集×2、無可推導欄；全綠
- [x] 未來 domain 邊界（news/articles/authors）未建，照 spec-01 §D 留白

**實作註記：**
- 進階數據型別用 `real`（float），顯示用足夠；時間戳一律 `timestamptz`。
- TDD：schema 測試先寫（red，5 failed）→ 建 schema+migration → green（6 passed）；斷言取自 spec-01 §C，非照抄 schema。
