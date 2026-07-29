# 01 — 以 Baseball Savant 填 `season_batting_stats.xwoba`

**What to build:** `season_batting_stats.xwoba` 自建表以來一直**全為 NULL**——StatsAPI 的 `sabermetrics` 區塊不給 xwOBA，它是 Statcast 的東西。schema 從一開始就替它留好位置：`season_stats.py:288` 的 `upsert_season_batting` **刻意把 `xwoba` 排除在 `ON CONFLICT DO UPDATE SET` 之外**，註解寫明留給未來的 Savant source。本票補上那個 source。

**來源（2026-07-29 實測可用）**：Baseball Savant 的 expected statistics leaderboard，**官方 CSV 匯出參數**，非 scraping：

```
https://baseballsavant.mlb.com/leaderboard/expected_statistics
  ?type=batter&year=<YYYY>&position=&team=&filterType=bip&min=1&csv=true
→ 200, content-type: text/csv
→ last_name/first_name, player_id, year, pa, bip, ba, est_ba, slg, est_slg, woba, est_woba, ...
```

- `player_id` 就是我們的 `mlb_player_id`，可直接對接
- `est_woba` 就是 xwOBA
- **`min=1` 必須明設**：預設 `min=q`（規定打席）會濾掉兼職球員。實測 2025 年 `min=1` 回 666 列，抓得到鄭宗哲 `pa=7`（est_woba 0.170）與 Fairchild `pa=55`（0.264）
- **不引 pybaseball**：它底層就是打這個 CSV endpoint，但會拖進 pandas + numpy + matplotlib 只為一個欄位。用標準庫 `urllib` + `csv` 即可，與 `snapshot.py`／`build_docs.py` 的零依賴路線一致。（另記：pybaseball 的 BR／FanGraphs 路徑 2026-07-29 實測皆 **403**，BR 回的是 Cloudflare 挑戰頁；Savant 之所以可用是因為它與 StatsAPI 同屬 MLB Advanced Media、CSV 是官方匯出。**BR/FG 一律不進排程 ETL**。）

**Blocked by:** None。與 `games-role-split` 兩票無相依，可並行。

**Status:** ready-for-agent

## ⚠️ 動工前必須先決策：粒度不匹配

`season_batting_stats` 的 PK 是 `(player_id, season, level, team_id)`，但 **Savant 的 leaderboard 是「球員 × 球季」一列，不分球隊**。同一季換過隊的球員，我們有多列、Savant 只有一個數字，**無法歸屬到個別球隊**。

現有資料就有實例：Fairchild（656413）**2022 年 MLB 有 3 支球隊**（113／136／137）。其餘 8 個 player-season 都只有 1 支。

| 選項 | 作法 | 評價 |
|---|---|---|
| **(a) 只在無歧義時寫入**（建議） | 該 `(player_id, season)` 在 `level='mlb'` 只有一列時才寫，多隊時全部留 NULL | 誠實、零誤導。現有 9 個 player-season 中覆蓋 8 個。個人頁本來就「缺值不顯示」 |
| (b) 同值寫進所有 MLB 列 | 三列都填 0.31x | ❌ 會讓讀者以為那是「在該隊期間」的數字，是假資料 |
| (c) 加球季合計列 | `team_id` 是 PK 一部分，需改 schema | 成本遠大於效益，且 spec-01 C.7 明載「層級合計由 services 重算、不落表」 |

**預設採 (a)**，動工前跟 batu 確認。

## Checklist

- [ ] 新模組 `etl/src/etl/sources/savant.py`（獨立於 `season_stats.py`：不同 host、不同格式）
  - 零依賴：`urllib.request` + `csv.DictReader`（注意 CSV 帶 BOM，需 `encoding='utf-8-sig'`）
  - 沿用既有 client 的保守 rate-limit 精神：一年一個請求，2020→今約 7 個請求
  - 逐年抓 `type=batter&min=1`，於本地濾出 tracked 球員（**不要**逐球員打一次）
- [ ] **只更新 `xwoba` 一欄**的 UPDATE 敘述：`update season_batting_stats set xwoba = %s where player_id=%s and season=%s and level='mlb' and team_id=%s`。**絕不碰其他欄位**——這正是 `upsert_season_batting` 當初把 `xwoba` 排除在 UPDATE SET 外的理由，兩個 source 各管各的欄位、不互相覆蓋
- [ ] 套用上面決策 (a)：寫入前先確認該 `(player_id, season, level='mlb')` 只有一列
- [ ] **只寫 `level='mlb'`**：Statcast 沒有小聯盟資料，其他層級永遠 NULL（與 `woba`／`wrc_plus`／`war` 的 MLB-only 特性一致）
- [ ] raw 層：把 CSV 轉成 JSON array 存進 `raw_payloads`（`source='savant'`、`endpoint='leaderboard/expected_statistics'`），維持「上游原檔可 reprocess」的既有慣例（ADR §8.1）
- [ ] 批次編排（`sources/__init__.py`）：掛在 **morning**（季數據本來就是 morning 全量重拉），**排在 `season_stats` 之後**——要先有列才能 UPDATE
- [ ] 失敗不炸批次：Savant 掛掉時記 warning、該 source 標 partial，不影響其他 source（沿用既有 best-effort 慣例，spec-03 §7）
- [ ] `docs/spec/spec-03-etl-pipeline.md` §3 來源表新增一列（Savant → `season_batting_stats.xwoba`，morning）；`docs/spec/spec-01-domain-and-data-model.md` C.7 把 `xwoba` 從「目前全空」改為實際來源與 MLB-only／單一球隊限制
- [ ] 個人頁進階區確認 xwOBA 有值時顯示得出來（`glossary-and-advanced-metrics` 票 03 已做「缺值不顯示」，本票只是讓它終於有值）；`content/glossary/woba.mdx` 檢查是否該補 xwOBA 的說明與對照
- [ ] 測試：CSV 解析（含 BOM、`est_woba` 空字串）、tracked 濾出、**多球隊季不寫入**、只更新 xwoba 不動其他欄、非 MLB 層級不寫、Savant 失敗不中斷批次
- [ ] 跑一次 morning 真連線，確認 Fairchild／鄭宗哲的 MLB 列 xwoba 有值，再跑 `python3 scripts/db/snapshot.py`

## Comments

- **投手側不在範圍內**：Savant 也有 `type=pitcher` 的 expected statistics，但 `season_pitching_stats` **沒有 `xwoba` 欄**。要做得先改 schema，另開票。
- `est_ba`／`est_slg`（xBA／xSLG）同一份 CSV 就有，但目前 schema 沒有對應欄位，本票不擴充。日後要加是低成本的（同一個 source 多寫兩欄）。
- 覆蓋率預期不高且會隨球員組成變動：目前 5 人中 2 位投手不會出現在打者 leaderboard（正常），李灝宇 2025 年不在名單（2026 才登板 MLB）。**這是資料的實況，不是 bug**。
