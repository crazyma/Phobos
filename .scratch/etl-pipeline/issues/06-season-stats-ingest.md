# 06 — 球季數據 vertical：season_*_stats（標準計數 + 進階）

**What to build:** 為每位 tracked 球員抓各層級球季數據（標準計數欄 + 僅 MLB 的進階欄），只落「無法由計數重算」的欄位；比率交給 services 讀取時推導。

**Blocked by:** 01（骨架）、02（球隊外鍵、grain 需 team_id）。

**Status:** ready-for-agent

- [ ] StatsAPI season stats（各 sportId、**2020 起整季重拉**，人數少可行）→ `season_*_stats` **計數欄**；grain `(player_id, season, level, team_id)`；比率**不落庫**
- [ ] `stats=sabermetrics`（**僅 MLB 層級**）→ 進階欄（打 `woba`／`wrc_plus`／`war`、投 `fip`／`war` 等）；ETL **自算 LOB%**；小聯盟進階留 NULL
- [ ] pybaseball Savant 可選補充 xwOBA 等 Statcast 系；**允許落後主資料一批**，Savant 未更新不標整批失敗
- [ ] 純 transform + fixture 測（含欄位缺漏）→ upsert 幂等
- [ ] 驗收：`season_*_stats` 有資料、比率可由 services 推導（球員頁 UI 尚未建 → 以 DB／測試驗）
