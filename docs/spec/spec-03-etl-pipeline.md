# Spec 03 — ETL / 資料同步管線

<!--badges: 語言=Python; 排程=一天兩批 cron; 原則=upsert + 事件溯源; 上游=spec-01-->

> 定義**資料怎麼進 DB**：批次職責、來源→表對照、回填範圍、狀態投影與近況一句話生成、錯誤處理。Python 只當純資料層，經 Postgres 與 Web 解耦（ADR §3）；非常駐，兩支 cron job。

---

## 1. 管線總覽

```
[StatsAPI / pybaseball] → fetch（存 raw_payloads）→ transform（純函式）→ upsert curated
                                                        ↓ 每批收尾
                                    狀態投影（transaction_events → player_current_status）
                                    近況一句話（game lines → player_recent_form）
                                    sync_runs 落帳
```

- 各來源獨立模組；單一來源失敗跳過並記錄，不中斷整批（`sync_runs.status='partial'`）。
- 一律 **upsert**（上游會事後修正，ADR §6.1）；upsert key 見 spec-01 各表。
- 只處理 `players.lifecycle='tracked'` 的球員。

## 2. 班表（一天兩批）

| 批次 | 台灣時間（建議，可調） | 職責 |
|---|---|---|
| `morning` | 09:00 | **結算為主**：昨日（美國比賽日）box score→逐場、賽果；球季數據**整季重拉**；投影＋一句話重算 |
| `evening` | 17:30 | **前瞻＋掃尾**：美西晚場此時已結束→補結算殘餘場次；當日賽程＋先發投手預告；transactions＋roster/IL |

> 美國比賽日跨台灣兩個日曆日（美西晚場約台灣 16:00 才結束），所以**單一批次不保證結算完整比賽日**——兩批都執行「嘗試結算」，首頁只認「該比賽日所有相關比賽皆 `final`」的最新一日（spec-02 §2.1）。這是設計，不是缺陷。

## 3. 來源 → 表對照

| 資料 | 來源 | 寫入 | 批次 |
|---|---|---|---|
| 賽程/賽果/先發預告 | StatsAPI `schedule`（帶 `sportId`，`hydrate=probablePitcher`） | `games` | 兩批 |
| 逐場 box line | StatsAPI boxscore／人員 `gameLog` | `game_*_lines` | morning（回看 `GAMELOG_LOOKBACK_DAYS=10` 天）＋evening 掃尾 |
| 球季標準數據（全層級） | StatsAPI 人員 season stats（各 sportId） | `season_*_stats` 計數欄 | morning（**2020 起整季重拉**，人數少可行） |
| 球季進階數據（MLB 為主） | pybaseball（FanGraphs `batting_stats`/`pitching_stats`） | `season_*_stats` 進階欄 | morning；抓不到（低階）留 NULL，best-effort |
| 異動 | StatsAPI `transactions` | `transaction_events` | evening（另 morning 補漏） |
| roster / IL | StatsAPI roster 端點 | 僅當**對帳信號**（§6），不直接寫狀態 | evening |
| 球員/球隊基本資料 | StatsAPI people / teams | `players`（非白名單欄位）、`teams` | 低頻（每週或手動） |

### 4. sportId ↔ level 對照

`1=mlb, 11=aaa, 12=aa, 13=a_plus, 14=a, 16=rookie`（實作時以 StatsAPI `/sports` 端點驗證後寫成常數表）。

## 5. 近況一句話生成（每批全量重算）

輸入：該球員近期 game lines（含跨層級）＋`player_current_status`＋歷史極值。規則引擎為**純函式**，依優先序取第一個命中：

| 優先序 | pattern | 例 |
|---|---|---|
| 1 | `career_high` / `season_high`（單場計數欄創 2020 起新高；**照樣稱「生涯」**，接受基準誤差） | 「上一場投出生涯最多 8 次三振」 |
| 2 | `streak`（連續安打場次≥3、連續無失分場次等；**連續紀錄跨層級延續**） | 「連續 5 場有安打」 |
| 3 | `single_game`（上一場亮點：3 安以上、全壘打、優質先發…） | 「上一場 3 支安打」 |
| 4 | `recent_agg`（近 5~10 場聚合） | 「近 3 場防禦率 1.20」 |
| 5 | `status_fallback`（無近期賽事資料時**必定命中**，句子永不為空） | 「傷兵名單中，最後出賽 6/12」「休賽期」「近兩週無出賽紀錄」 |

門檻與句式表（含 ≤20 字裁切規則）維護在 ETL 程式碼的規則常數中，新增 pattern 時回填本表。

## 6. 狀態投影與對帳

- 每批收尾以事件流全量重放（球員數 × 事件數都小）寫 `player_current_status`（規則＝spec-01 B.3）。
- **對帳**：evening 批抓的 roster/IL 快照與投影結果比對；不一致 → log 告警（`sync_runs.detail`），提示補錄 manual 事件——**不自動改投影**（維持事件為真相）。

## 7. 錯誤處理與韌性

- 上游呼叫：保守 delay（pybaseball 無內建 rate limit）、重試 2 次、`pybaseball.cache.enable()`。
- 失敗語意：來源級失敗 → 該來源跳過、其餘照跑、`partial`；整批失敗 → `failed`，網站繼續供舊資料（spec-02 §5）。
- 手動工具（CLI）：`resync --season`、`resync --gamelog --from DATE`（早於 lookback 的上游修正用）、`add-event`（補錄 manual 事件）、`reproject`（重放投影）。

## 8. 測試決策

- transform 純函式：**錄下的 StatsAPI/pybaseball fixture** → 斷言 curated 列（不打真網路）；每個來源模組至少一組正常＋一組欄位缺漏 fixture。
- 一句話規則引擎：表驅動測試——輸入 game line 序列，斷言 pattern 與句子；覆蓋 §5 每列＋fallback 必中。
- 投影：同 spec-01 §E（與 Node 側共用 seed 概念，合約=curated schema）。
- 排程/IO 薄殼不測邏輯，只測「來源失敗不中斷整批、sync_runs 正確落帳」。

## 9. Open Items

- [ ] 實測 StatsAPI `transactions` 回傳的 typeDesc 字串全集 → spec-01 C.3 enum 對照（含 waiver claim 歸到 `trade` 或 `other`）
- [ ] 小聯盟 boxscore 欄位與 MLB 差異確認（缺欄留 NULL）
- [ ] cron 時刻上線後依實際結算延遲微調（§2 為建議值）
