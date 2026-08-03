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

## 粒度不匹配 —— 決策已定 (a)（2026-08-03，batu）

`season_batting_stats` 的 PK 是 `(player_id, season, level, team_id)`，但 **Savant 的 leaderboard 是「球員 × 球季」一列，不分球隊**。同一季換過隊的球員，我們有多列、Savant 只有一個數字，**無法歸屬到個別球隊**。

現有資料就有實例：Fairchild（656413）**2022 年 MLB 有 3 支球隊**（113／136／137）。9 個 MLB player-season 中，8 個單隊、1 個多隊。

| 選項 | 作法 | 評價 |
|---|---|---|
| **(a) 只在無歧義時寫入 ← 採用** | 該 `(player_id, season)` 在 `level='mlb'` 只有一列時才寫，多隊時全部留 NULL | 誠實、零誤導。覆蓋 8/9。個人頁本來就「缺值不顯示」 |
| (b) 同值寫進所有 MLB 列 | 三列都填同一個數字 | ❌ 假資料，見下方實例 |
| (c) 加球季合計列 | `team_id` 是 PK 一部分，需改 schema | 成本遠大於效益，且 spec-01 C.7 明載「層級合計由 services 重算、不落表」 |

### 為什麼 (b) 特別糟：同列的鄰居是分隊的

`season_stats.py:158-167` 的 `_index_saber_by_team` 把 StatsAPI 的 sabermetrics **按 `team.id` 索引**，每一列取自己那隊的值（上游同時回一個「跨隊合計」split，ETL 刻意跳過——`transform_season_batting` docstring 明寫）。所以 `woba` 是「在該隊期間」的。實測 Fairchild 2022：

| 球隊 | PA | 我們的 `woba` | 若寫入整季 `est_woba` 0.323 | 讀者會得到的結論 |
|---|---:|---:|---:|---|
| 113 | 99 | 0.389 | 0.323 | 「打得比實質好」——幅度被誇大 |
| 136 | 3 | 0 | 0.323 | 「運氣爛透了」← **憑空捏造** |
| 137 | 8 | 0 | 0.323 | 「運氣爛透了」← **憑空捏造** |

（兩個 `woba=0` 是真值：3 PA／8 PA 全部出局，wOBA 就是 0.000。）xwOBA 存在的意義正是拿來跟 wOBA 對照看運氣成分，**口徑不一致的對照比留白傷害更大**。

### `team=` 參數已實測，救不了這題（2026-08-03）

leaderboard URL 有 `team=` 欄位，看似能拿到分隊數字。實測 `year=2022`：

| 查詢 | 回傳列數 | Fairchild |
|---|---:|---|
| 無 filter | 685 | `pa=110`, `woba=0.350`, `est_woba=0.323` |
| `team=113` | 29 | `pa=110`, `woba=0.350`, `est_woba=0.323` ← **完全相同** |
| `team=136` | 25 | 查無此人 |
| `team=137` | 28 | 查無此人 |

**`team=` 是名單篩選、不是數據口徑**：加了它回的還是整季 110 PA（不是他在 113 隊的 99 PA），而且每個球員只掛在一支球隊底下，連「用 `team=` 偵測多隊球季」都做不到。多隊球季的分隊 xwOBA **在這個 endpoint 上無解**，(a) 是唯一誠實的作法。

（順帶驗證：用我們自己的 per-team `woba` 做 PA 加權 `(0.389×99 + 0×3 + 0×8) / 110 = 0.3501`，對上 Savant 的整季 `woba=0.350`。證實 ETL 的 per-team 值與上游一致，且 wOBA 是 PA 加權**可合成**的——但**可合成 ≠ 可拆解**，已知整季 0.323 要反推三隊各自的值是一條方程式三個未知數，無解。）

## Checklist

- [ ] 新模組 `etl/src/etl/sources/savant.py`（獨立於 `season_stats.py`：不同 host、不同格式）
  - 零依賴：`urllib.request` + `csv.DictReader`（注意 CSV 帶 BOM，需 `encoding='utf-8-sig'`）
  - 沿用既有 client 的保守 rate-limit 精神：一年一個請求，2020→今約 7 個請求
  - 逐年抓 `type=batter&min=1`，於本地濾出 tracked 球員（**不要**逐球員打一次）
- [ ] **只更新 `xwoba` 一欄**的 UPDATE 敘述：`update season_batting_stats set xwoba = %s where player_id=%s and season=%s and level='mlb' and team_id=%s`。**絕不碰其他欄位**——這正是 `upsert_season_batting` 當初把 `xwoba` 排除在 UPDATE SET 外的理由，兩個 source 各管各的欄位、不互相覆蓋
- [ ] 套用決策 (a)：寫入前先確認該 `(player_id, season, level='mlb')` 只有一列；多隊球季**整組跳過、留 NULL**（現況唯一實例：Fairchild 656413 的 2022）
- [ ] **只寫 `level='mlb'`**：Statcast 沒有小聯盟資料，其他層級永遠 NULL（與 `woba`／`wrc_plus`／`war` 的 MLB-only 特性一致）
- [ ] raw 層：把 CSV 轉成 JSON array 存進 `raw_payloads`（`source='savant'`、`endpoint='leaderboard/expected_statistics'`），維持「上游原檔可 reprocess」的既有慣例（ADR §8.1）
- [ ] 批次編排（`sources/__init__.py`）：掛在 **morning**（季數據本來就是 morning 全量重拉），**排在 `season_stats` 之後**——要先有列才能 UPDATE
- [ ] 失敗不炸批次：Savant 掛掉時記 warning、該 source 標 partial，不影響其他 source（沿用既有 best-effort 慣例，spec-03 §7）
- [ ] `docs/spec/spec-03-etl-pipeline.md` §3 來源表新增一列（Savant → `season_batting_stats.xwoba`，morning）；`docs/spec/spec-01-domain-and-data-model.md` C.7 把 `xwoba` 從「目前全空」改為實際來源與 MLB-only／單一球隊限制
- [ ] 個人頁進階區確認 xwOBA 有值時顯示得出來（`glossary-and-advanced-metrics` 票 03 已做「缺值不顯示」，本票只是讓它終於有值）；`content/glossary/woba.mdx` 檢查是否該補 xwOBA 的說明與對照
- [ ] 測試：CSV 解析（含 BOM、`est_woba` 空字串）、tracked 濾出、**多球隊季不寫入**、只更新 xwoba 不動其他欄、非 MLB 層級不寫、Savant 失敗不中斷批次
- [ ] 跑一次 morning 真連線，確認 Fairchild／鄭宗哲的 MLB 列 xwoba 有值，再跑 `python3 scripts/db/snapshot.py`
  - **具體驗收範例**：鄭宗哲（691907）2025 年 MLB 只有一隊（team 134）、`pa=7`，我們的 `woba = 0`，Savant `est_woba = 0.170`。寫入後該列應呈現 wOBA 0.000 / xwOBA 0.170——**這正是這個欄位存在的意義**（打得不算差但一無所獲），可當成個人頁進階區的顯示範例
  - 反向驗收：Fairchild 2022 的三列 MLB `xwoba` 應**全部維持 NULL**

## Comments

- **多隊球季的 xwOBA 有一個正當歸屬位置，但不是這張表。** 整季 `est_woba` 0.323 若拿去跟 **services 端重算的層級合計 wOBA**（0.350，PA 加權）並排，那是同口徑、完全有效的對照。做不到只是因為 `season_batting_stats` 的 PK 含 `team_id`、放不下沒有球隊的那一列，而 spec-01 C.7 又明訂層級合計不落表。**日後若真要顯示多隊球季的 xwOBA，正解是在 services 合計層處理，不是往 per-team 列裡塞。** 記在這裡，免得日後有人重新發明選項 (b)。
- **投手側不在範圍內**：Savant 也有 `type=pitcher` 的 expected statistics，但 `season_pitching_stats` **沒有 `xwoba` 欄**。要做得先改 schema，另開票。
- `est_ba`／`est_slg`（xBA／xSLG）同一份 CSV 就有，但目前 schema 沒有對應欄位，本票不擴充。日後要加是低成本的（同一個 source 多寫兩欄）。
- 覆蓋率預期不高且會隨球員組成變動：目前 5 人中 2 位投手不會出現在打者 leaderboard（正常），李灝宇 2025 年不在名單（2026 才登板 MLB）。**這是資料的實況，不是 bug**。
