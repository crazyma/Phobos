# 03 — services 基礎 + PlayerSummary + /api/players

**What to build:** `lib/services` 分層的第一個樣板，加對外 `/api/players`。從 DB 組出「球員總覽」所需資料（含歸屬×健康的狀態一句、近況一句話），供頁面（票 04）與 API 共用同一組邏輯（ADR §4）。這是第一條真 vertical：DB → services → API。

**Blocked by:** 01（Route Handler 需 Next.js app；services 讀既有 lib/db）。

**Status:** done

- [x] `lib/services`：`getPlayerSummaries()`——join `players` + `player_current_status` + `teams` + `player_recent_form`，組出 `PlayerSummary`（中英名、目前隊伍/層級、**狀態一句**＝歸屬×健康組合 spec-01 B.2、近況一句話、lifecycle）
- [x] **空狀態優雅處理**：`player_current_status`／`player_recent_form` 目前為空 → fallback「狀態同步中」／`team`=null／`recentForm`=null，不因缺列而炸（LEFT JOIN）
- [x] Zod schema 定義 `PlayerSummary`（對外合約，`getPlayerSummaries` 回傳前以 `z.array().parse` 執行期斷言）
- [x] `/api/players` Route Handler：回 `PlayerSummary[]`，經 `lib/services`（thin handler，無 business logic）
- [x] 測試（seed DB）：狀態一句組合（`3A・傷兵名單（IL-60）`）、archived 標記、空狀態 fallback；`/api/players` 以 Zod parse 斷言形狀。純 `buildStatusSentence` 另有 8 例單測（TDD red→green）
- [x] tracked / archived 皆回，`lifecycle` 標明（`orderBy(lifecycle, nameEn)`，tracked 先）

**Notes:** 狀態一句拆成純函式 `buildStatusSentence`（`lib/services/player-status.ts`）獨立單測；DB 測試用專屬 fixture id（990001/900001/900002）避免撞種子測試的 count 斷言，並在 `afterAll` 清乾淨。`vitest.config` 加 `fileParallelism:false`（共用一個 Postgres，序列化跑）與 `@` alias（route 測試 import 用）。E2E 煙測：`/api/players` 回 5 名白名單、皆 `狀態同步中`（ETL 未跑）。
