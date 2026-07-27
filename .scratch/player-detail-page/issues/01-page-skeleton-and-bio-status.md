# 01 — 個人頁骨架 + 基本資料/近況（zone 1）+ /api/players/:id

**What to build:** 使用者從名冊點一位球員，進到 `/players/[id]` 個人頁，一眼看到他的基本資料、狀態一句、近況一句話。對外 `/api/players/:id` 回同一組資料。非白名單 id → 404；`archived` 球員只顯示這一區、標「已離開美職體系」。這是個人頁一切後續區塊的地基（walking skeleton）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] **prefactor**：`/players` 名冊卡片可點入 `/players/[id]`（`id`＝`mlb_player_id`）
- [ ] `/players/[id]` Server Component 經 `lib/services` 直讀 DB，顯示 zone 1——基本資料（中英名/守位/生日/慣用手）＋**狀態一句**（歸屬×健康，複用既有組句）＋**近況一句話**
- [ ] `lib/services` 加 `getPlayerDetail(id)` 回 base 形狀（含既有 PlayerSummary 欄位）；Zod schema 為對外合約
- [ ] `/api/players/:id` Route Handler：回 base 形狀，經同一 services（handler 無 business logic）；**非白名單→404**、錯誤→500 `{error}`
- [ ] `archived` 球員：只顯 zone 1、標「已離開美職體系」（zone 3~5 隱藏；生涯總成績表待票 02 補）
- [ ] ISR `revalidate=1800`
- [ ] 測試：service（seed DB）＋ `/api/players/:id`（Zod parse 斷言形狀、404 分支）；頁面 smoke（能 render、關鍵區塊存在）
