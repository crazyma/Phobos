# 03 — 逐場成績 + 動態時間軸（zone 3+4）

**What to build:** 個人頁的兩個「近期動態」區：最近 `RECENT_GAMES_N=10` 場的逐場 box line（打/投分表、二刀流並列、比率即時算），以及依時間倒序的異動時間軸（日期、類型徽章、描述）。

**Blocked by:** 01（個人頁骨架 + service/API 基礎）。

**Status:** done (2026-07-28)

- [x] `getPlayerDetail` 加 `gameLog: { batting[], pitching[] }`（各 ≤ `RECENT_GAMES_N=10`、最近優先）與 `timeline[]`（`transaction_events` 倒序）
- [x] 逐場：打者、投手**分表**；二刀流球員兩表並列；單場比率即時算（沿用票 02 的推導）
- [x] 時間軸：每則含日期、**類型徽章**（sign/call_up/send_down/il_on…中文化）、描述
- [x] `archived` 球員隱藏這兩區（spec-02 §2.3）
- [x] `gameLog`/`timeline` 形狀入 Zod 合約；`/api/players/:id` 一併回傳
- [x] 測試：service（seed DB，含二刀流兩表、無逐場/無事件空狀態）；頁面 smoke 關鍵區塊存在
