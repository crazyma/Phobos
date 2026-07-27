# 04 — 逐場 vertical：schedule/賽果 + boxscore → games + game_*_lines

**What to build:** 把賽程（含先發預告）與逐場 box line 灌進 `games` 與打者／投手逐場表。這是近況一句話的資料前置。

**Blocked by:** 01（骨架）、02（球隊外鍵）。

**Status:** done (2026-07-27)

- [x] StatsAPI schedule（帶 sportId、`hydrate=probablePitcher`）→ upsert `games`（賽果／狀態／先發預告；以美國比賽日 `game_date_us` 錨定）
- [x] boxscore／人員 gameLog → `game_batting_lines`／`game_pitching_lines`，grain＝`(player_id, game_pk)`，**角色由行為決定**（二刀流可兩表並存）；morning 回看 `GAMELOG_LOOKBACK_DAYS=10` 天＋evening 掃尾
- [x] 小聯盟 boxscore 缺欄留 NULL（best-effort）
- [x] 純 transform + fixture 測（MLB 正常＋小聯盟缺欄各一組）→ upsert 幂等
- [x] 驗收：`games`／`game_*_lines` 有資料（今日賽況與球員頁 UI 尚未建 → 以 DB／測試驗）
