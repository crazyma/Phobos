# 04 — 出賽預告 + 下一系列賽（zone 5）

**What to build:** 個人頁的前瞻區：球員下一次可能出賽的預告標籤，加上下一個系列賽的對手、地點、場次與最近幾場結果。資料取自 `games` 的前瞻列（schedule + 先發預告）。

**Blocked by:** 01（個人頁骨架 + service/API 基礎）。

**Status:** done (2026-07-28)

- [x] `getPlayerDetail` 加 `upcoming`：**出賽預告標籤**（`probable_starter`/`possible`/`il`，規則同 spec-02 §2.1 第 3 區——投手確定用 probable、野手一律 possible、IL 者標 il）＋**下一系列賽**（對手、`venue_name`、`series_game_number`/`games_in_series`、最近幾場結果）
- [x] 資料自 `games` 前瞻列（`scheduled` + `probablePitcher`）；與球員目前隊伍/狀態對應
- [x] `archived` 球員隱藏此區
- [x] `upcoming` 形狀入 Zod 合約；`/api/players/:id` 一併回傳
- [x] 測試：service（seed DB，probable/possible/il 三分支、無即將賽事空狀態）；頁面 smoke
