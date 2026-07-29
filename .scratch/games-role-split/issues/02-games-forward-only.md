# 02 — `games` 收斂成純前瞻表：只抓現役球隊、窗口往未來拉、過期即清

**What to build:** 票 01 拆掉 FK 之後，`games` 的唯一消費者剩下 `player-upcoming.ts:75-101`（下一系列賽、先發預告、球隊近期戰績），也就是它本來該是的那張「即將的比賽」表。本票把 ingest 與保留策略收斂到這個角色。

**現況三個問題**（2026-07-29 實測，2691 筆）：

| 問題 | 數字 |
|---|---|
| schedule 每批對六個 sportId **掃全聯盟**，不按球隊過濾 | 929 筆（35%）跟任何 tracked 球員都無關，且無人參照、只增不減 |
| 窗口是 `today-1 .. today`（`games.py:226`）——**從不抓未來** | 41 筆 `scheduled` 全部日期 `2026-07-27`，早於當日；`player-upcoming.ts:85` 要求 `>= today` → **「下一系列賽」實際上全空** |
| 沒有保留策略 | 過期的 `scheduled` 與全聯盟殘留永久留著 |

**Blocked by:** 票 01（`game_*_lines` 仍有 FK 指向 `games` 時無法刪列）。

**Status:** ready-for-agent

- [ ] **schedule 只抓現役球隊**（`etl/src/etl/sources/games.py` `ingest_schedule`）：改以 `player_current_status.team_id`（tracked 球員、非 NULL）為過濾依據。實作可用 StatsAPI `schedule` 的 `teamId` 參數逐隊查，或維持 sportId 查詢後於 `transform_schedule` 之後濾掉兩隊都不在名單內的比賽——擇一即可，以**呼叫次數少**者為準（現役球隊數 ≤ 球員數，15 人約 ≤ 15 支）
- [ ] **窗口改成往未來**（`_schedule_window`）：`today .. today + 7 天`（美西）。**不要用 1–2 天**——「下一系列賽」要顯示對手／球場／系列第幾戰，一個系列 3–4 場，球隊休兵或系列未開打時短窗口會讓該區塊空掉（正是現在的狀況）。7 天 × 15 支球隊也才百來筆
- [ ] **gameLog 不再 upsert `games` 表頭**（`game_lines.py:215-228` 的 `upsert_game_headers`）：票 01 拆掉 FK 後這個 upsert 已無存在理由，移除之，連同 `GameHeaderRow`
- [ ] **每批收尾清理**：刪掉 `game_date_us < 美西今天` 的列。票 01 之後 `games` 已無任何 FK 子表，可直接刪。清理放在 games source 內、與 ingest 同一個 transaction
- [ ] **一次性清掉存量**：既有 2691 筆中不屬於前瞻窗口者全數刪除（票 01 回填完成後才執行——回填要靠 `games` 取日期與對手）
- [ ] `docs/spec/spec-01-domain-and-data-model.md` C.5 與 `docs/spec/spec-03-*.md` §3 改寫 `games` 定位：**純前瞻賽程表，只含現役球隊、只往未來、過期即清**；歷史比賽資訊改由逐場表自帶（票 01）
- [ ] 測試：窗口計算（美西今天 → +7）、只保留現役球隊的比賽、過期列被清、清理不影響逐場表；`player-upcoming` 三分支續綠且**真的取得到未來比賽**（現行 fixture 若假設有歷史列需調整）
- [ ] 跑一次 ETL `evening` 真連線驗證「下一系列賽」在個人頁與首頁都顯示得出來，再跑 `python3 scripts/db/snapshot.py`

## Comments

- 完成後 `games` 預期筆數：現役球隊數 × 約 7 天，15 人規模下約百來筆（現況 2691）。
- 「球隊近期戰績」（`player-upcoming.ts:95-101` 查 `status='final'` 的近期比賽）**會被這個保留策略清掉**。實作時需確認：該區塊目前顯示什麼、要不要保留。若要保留，選項是（a）保留窗口改成 `today-3 .. today+7`，或（b）改由逐場表推導。**這是本票唯一需要決策的點，動工前先確認。**
