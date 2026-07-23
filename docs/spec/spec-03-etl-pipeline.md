# Spec 03 — ETL / 資料同步管線

<!--badges: 語言=Python; 依賴=spec-01（資料模型）; 產出=資料同步管線設計-->

> 定義**資料怎麼進 DB**：各資料源模組、raw→curated 轉換、排程、近況一句話生成、時區與錯誤處理。是 spec-02 頁面/API 的資料供給端。資料表見 `spec-01`。
>
> 承 `adr/decisions.md`：Python 只當**純資料層**，透過 Postgres 與 Web 端解耦；非常駐服務，靠排程批次跑。

---

## A. 管線總覽

```
[來源]                          [raw layer]              [curated layer]
pybaseball（FanGraphs）  ──►  raw_fangraphs_*      ──┐
MLB Stats API                                        ├─► 轉換/正規化 ──► players / teams
  schedule ─────────────►  raw_statsapi_schedule  ──┤                     season_*_stats
  gameLog ──────────────►  raw_statsapi_gamelog   ──┤                     game_*_stats
  transactions ─────────►  raw_statsapi_txn       ──┤                     transactions
  roster ───────────────►  raw_statsapi_roster    ──┘                     roster_status / games
                                                     └─► ETL 端歸納 ────► player_recent_form
```

- **raw 先落地**（`payload jsonb` + `fetched_at`）；curated 由 raw 轉換而來。上游變格式只需重寫轉換 + reprocess，不必重抓。
- 各來源**獨立成模組/腳本**，單源失敗不拖累其他（見 §G）。

---

## B. 資料源模組

### B.0 來源 → curated 表 對照

| curated 表 | 主要來源 | 備註 |
|---|---|---|
| `players`（bio/crosswalk） | 手動白名單 + StatsAPI `people` + pybaseball `playerid_lookup` | 種子見 spec-01 A.2 |
| `teams` | StatsAPI `teams`（追蹤球員所屬各層級球隊） | |
| `season_batting/pitching_stats`（MLB） | **pybaseball** `batting_stats()`/`pitching_stats()` | FanGraphs，含進階 wRC+/wOBA/WAR/FIP |
| `season_batting/pitching_stats`（小聯盟） | **StatsAPI** `stats?stats=season&sportId=…` | 多為計數；進階常缺 → best-effort |
| `game_batting/pitching_stats` | **StatsAPI** `people/{id}/stats?stats=gameLog` | 逐場 box line |
| `games` | **StatsAPI** `schedule`（含 `probablePitcher`、`gameDate`、`venue`、score、status） | |
| `transactions` | **StatsAPI** `transactions` | |
| `roster_status` | **StatsAPI** `roster` + 由 transactions 推導 IL/options | |
| `player_recent_form` | ETL 端由 `game_*_stats` 歸納 | 見 §E |

### B.1 pybaseball（MLB 球季數據）

- `batting_stats(season)` / `pitching_stats(season)`（FanGraphs）→ MLB 進階數據來源。
- **crosswalk**：pybaseball 以 `key_fangraphs` 命名，須經 `playerid_lookup` 對回 `mlb_player_id`（結果快取進 `players`，spec-01 A.3）。
- **注意事項**（承 plan §5）：
  | 事項 | 對策 |
  |---|---|
  | cache 預設關 | 啟動 `pybaseball.cache.enable()` |
  | Statcast/球季數據事後修正 | **upsert**，並定期重抓近期球季 |
  | 無 rate limit 建議 | 自加保守 delay，避免被 ban |
  | Baseball-Reference 一次一季 | 按球季分批 |

### B.2 MLB Stats API（逐場、賽程、異動、名單、小聯盟）

- JSON REST（`statsapi.mlb.com/api/v1/...`）；可用 `MLB-StatsAPI` 套件或直呼。
- **端點用途**：
  - `schedule?teamId=&sportId=&date=` → `games`（含 `probablePitcher`、開賽時間 UTC、`venue`、比分、status）
  - `people/{id}/stats?stats=gameLog&group=hitting|pitching&season=` → `game_*_stats`
  - `people/{id}/stats?stats=season&sportId=` → 小聯盟 `season_*_stats`
  - `transactions?startDate=&endDate=` → `transactions`
  - `teams/{id}/roster` + transactions 推導 → `roster_status`
- 無正式官方文件，**實作前先實測** transactions/roster/gameLog 的參數與回傳（spec-01 §E）。

### B.3 自建爬蟲

- v1 不做。若日後 pybaseball/StatsAPI 都缺某欄位再評估，且優先找結構化 API，避免 HTML 爬蟲。

---

## C. 排程（一天兩次，非常駐）

兩支獨立 cron / systemd timer（不用 APScheduler）：

| 時機 | 觸發點 | 同步內容 |
|---|---|---|
| **早班** | 前一天賽事結算穩定後 | 昨日 `games` 結果與比分、當日結束球員的 `game_*_stats`（逐場）、更新 `season_*_stats` 累計、**重算 `player_recent_form`** |
| **晚班** | 當日開打前 | 當日/未來 `games` 賽程 + `probablePitcher`、`transactions`、`roster_status`（升降/IL 常臨場才公布） |

- 具體台灣時間點為**設定值**（美國賽事跨夜，見 §F、§H）。
- 每次跑完更新「資料最後更新時間」，供頁面顯示（requirements F1-3）；並可觸發 Web 端 revalidation（對接 spec-02 §D）。

---

## D. 轉換與 upsert 原則

1. **各來源獨立模組**（pybaseball ETL、StatsAPI 各端點同步），單源失敗跳過並記錄。
2. **Upsert 而非 append**（球季/逐場數據都可能事後修正）；upsert key 見 spec-01 各表。
3. **best-effort 層級**：低階小聯盟資料稀疏/缺，抓得到就寫、缺則略過，不視為錯誤。
4. **只存無法由計數重算的進階值**（wOBA/wRC+/WAR/FIP）；其餘由 Web 端算（spec-01 B.4/B.5）。
5. **raw 保留**：轉換邏輯改動時 reprocess 既有 raw，不必重抓上游。

---

## E. 近況一句話生成（`player_recent_form`）

- **輸入**：該球員近期 `game_*_stats`（+ 生涯/賽季基準供「新高」判定）。
- **輸出**：一句 ≤20 字的 `blurb`（無明顯亮點則留 NULL，不硬湊）。
- **偵測 pattern（依訊號強度排序，取最有代表性的一句）**：

  | 類型 | 例 |
  |---|---|
  | 連續紀錄 | 「連續 5 場有安打」「先發連 3 場無自責分」 |
  | 單場亮點（上一場） | 「上一場 3 安 1 轟」「上一場投出 8 次三振」 |
  | 生涯/賽季新高 | 「敲出生涯首轟」「單場生涯最多 8K」 |
  | 近期彙總 | 「近 5 場打擊率 .420」「近 3 場防禦率 1.20」 |

- **選句規則**：新高 > 連續紀錄 > 單場亮點 > 近期彙總；同級取數值最突出者。門檻（幾場算連續、彙總看幾場）為**設定值**，可調。
- 於**早班**重算全體。生成為規則式（pandas 算連續/rolling/max），**不需 LLM**。

---

## F. 時區

- 上游賽事時間為美國時區；**一律存 UTC**（`games.start_time_utc` 等），顯示端轉台灣時間（spec-02 §D）。
- Python 端如需時區運算用標準庫 `zoneinfo`（3.9+）。
- 排程 cron 的觸發時刻需考慮美國賽事跨夜——「前一天結算」對台灣是隔日早上，時刻設定值待定（§H）。

---

## G. 錯誤處理 / 觀測

- **來源隔離**：單一來源/單一球員失敗 → 記 log、跳過、續跑，不中斷整批。
- **重試/退避**：呼叫加保守 delay 與有限重試，避免被上游 ban。
- **log**：每次同步記錄抓取筆數、成功/失敗、耗時；失敗保留足夠上下文可重跑。
- **冪等**：靠 upsert key，重跑同一批不產生重複或髒資料。

---

## H. Open Items

- [ ] 排程的**確切台灣時間點**（早/晚班），對齊美國賽事跨夜結算與開打前公布。
- [ ] StatsAPI `transactions`/`roster` 回傳實測 → `transaction_type` 列舉與 `roster_status` 推導規則。
- [ ] `roster_status` 怎麼從 roster + transactions 可靠推導 IL_10/IL_60/optioned 等狀態與起訖日。
- [ ] 近況一句話的 pattern 門檻與**生涯基準**（要不要 backfill 生涯資料才能判「生涯新高」）。
- [ ] 小聯盟球季/逐場資料的 StatsAPI 欄位 → curated 對齊表（含哪些進階算得出）。
- [ ] revalidation 觸發方式（ETL 完成後如何通知 Web 端，對接 spec-02 §D）。
