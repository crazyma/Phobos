# 05 — 首頁 polish：digest 錨定改 wall-clock + 即將出賽效率

**What to build:** 兩個 code-review 觀察的收尾（皆在首頁 service）：**①** 修正「最新賽況」錨定的美國比賽日。目前 digest date 由 game line 反推「該日全 `final`」，但有 line 的 game 一律被 gamelog 強制 `final`，guard 實質失效——同日某位 tracked 球員賽事已結算、另一位仍在進行（尚無 line）時，會選到半日、只顯示已結束者。**決策（2026-07-28，batu）：不查 `games`/roster 判定 live，改用 wall-clock**——只顯示「整天已結束」的比賽日，天然保證完整、又不需偵測進行中賽事。**②** 首頁「即將出賽」區目前對每位 tracked 球員各呼叫一次 `getPlayerUpcoming`，每次都全表掃 `teams` 並算出首頁用不到的近期戰績，N 位球員造成多餘查詢。

**Blocked by:** None（首頁 slice 票 01–04 已完成、在 main）。

**Status:** ready-for-agent

- [ ] **① digest 改 wall-clock 錨定**：digest date＝最新一個「**有 tracked 球員逐場 line**」且「**該美國比賽日整天已依美西（America/Los_Angeles）時鐘結束**」的比賽日——亦即 `game_date_us` **早於當前美西日期**（整天已過 → 保證該日所有賽事都已打完）。**不再從 line 反推 `status`、不查 `games`/`player_current_status`、不偵測 live**。美西「今天」以純函式計算、**可注入 `today`** 以利測試（可重用 `player-upcoming` 既有的 `America/Los_Angeles` helper 概念）。代價（可接受、屬設計）：首頁最新賽況常態落後約一天
- [ ] **② 即將出賽效率**：首頁 upcoming 以**單次載入 team map 往下傳**給每次 `getPlayerUpcoming`（消掉每位球員全表掃 `teams`），且**不計算首頁用不到的近期戰績**（`getPlayerUpcoming` 加可選 skip 參數或等效作法）；維持 reuse `getPlayerUpcoming` 使 tag 判定與個人頁一致，結果與現在相同
- [ ] 對外 `/api/home` 形狀與現有 Zod 合約不變（純內部修正）
- [ ] 測試：① digest 選出「早於美西今天」的最新有-line 比賽日；今天（美西當日）即使有 tracked line 也**不**被選（注入 `today` 斷言，不需 live fixture）；空資料→null。② upcoming 三分支/過期排除既有斷言續綠、team map 只載一次、近期戰績不再計算
- [ ] Node 全綠、`pnpm typecheck` 過、`pnpm build` 過
