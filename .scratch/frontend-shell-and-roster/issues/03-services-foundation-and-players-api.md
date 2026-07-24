# 03 — services 基礎 + PlayerSummary + /api/players

**What to build:** `lib/services` 分層的第一個樣板，加對外 `/api/players`。從 DB 組出「球員總覽」所需資料（含歸屬×健康的狀態一句、近況一句話），供頁面（票 04）與 API 共用同一組邏輯（ADR §4）。這是第一條真 vertical：DB → services → API。

**Blocked by:** 01（Route Handler 需 Next.js app；services 讀既有 lib/db）。

**Status:** ready-for-agent

- [ ] `lib/services`：`getPlayerSummaries()`——join `players` + `player_current_status` + `teams` + `player_recent_form`，組出 `PlayerSummary`（中英名、目前隊伍/層級、**狀態一句**＝歸屬×健康組合 spec-01 B.2、近況一句話、lifecycle）
- [ ] **空狀態優雅處理**：`player_current_status`／`player_recent_form` 目前為空 → 給 fallback（如「狀態同步中」），不因缺列而炸
- [ ] Zod schema 定義 `PlayerSummary`（對外合約，同時當測試斷言器）
- [ ] `/api/players` Route Handler：回 `PlayerSummary[]`，經 `lib/services`（不在 handler 寫 business logic）
- [ ] 測試（seed DB）：service 以注入 fixture 驗狀態一句組合、archived 標記、空狀態 fallback；`/api/players` 回應以 Zod parse 斷言形狀
- [ ] tracked / archived 皆回，`lifecycle` 標明（供票 04 分區）
