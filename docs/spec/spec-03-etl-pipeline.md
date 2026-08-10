# Spec 03 — ETL / 資料同步管線

<!--badges: 語言=Python; 排程=一天兩批 cron; 原則=upsert + 事件溯源; 上游=spec-01-->

> 定義**資料怎麼進 DB**：批次職責、來源→表對照、回填範圍、狀態投影與近況一句話生成、錯誤處理。Python 只當純資料層，經 Postgres 與 Web 解耦（ADR §3）；非常駐，兩支 cron job。

---

## 1. 管線總覽

```
[StatsAPI（＋Savant xwOBA）] → fetch（存 raw_payloads）→ transform（純函式）→ upsert curated
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
| 賽程/先發預告（**前瞻**） | StatsAPI `schedule`（現役球隊 `teamId`，`hydrate=probablePitcher`） | `games`（美西今天前後 7 天的前瞻賽程） | 兩批 |
| 逐場成績 | **StatsAPI 人員 gameLog**（`people/{id}/stats?stats=gameLog`，每位 tracked 球員、按季／群組 hitting·pitching／必要時 sportId）；整場 boxscore **不落庫**，需要時 by-case 取 | `game_*_lines` | morning／evening 各抓整個當季 gameLog（冪等；evening 補 morning 時未結束的場次）；歷史球季一次性 `etl backfill` |
| 球季標準數據（全層級） | StatsAPI 人員 season stats（各 sportId；**上游直接提供累積 AVG/ERA/OPS 等，取計數欄落庫、比率仍由 services 推導**） | `season_*_stats` 計數欄 | morning（**2020 起整季重拉**，人數少可行） |
| 球季進階數據（僅 MLB 層級） | **StatsAPI `stats=sabermetrics`**（打 `woba/wRcPlus/war`、投 `fip/fipMinus/xfip/war/eraMinus`，2026-07-23 實測確認）＋ **ETL 自算**（LOB%）＋ Savant 官方 CSV 匯出（xwOBA） | `season_*_stats` 進階欄 | morning；小聯盟不供應→留 NULL，best-effort |

> **Savant xwOBA 的抓取範圍與 raw 存法（2026-08-03）**——與 season stats 的「2020 起整季重拉」刻意**不同**：
>
> - **只抓需要的球季**：當季（會變）＋ **任何「寫得進去卻仍為 NULL」的過去球季**（該 tracked 球員該季 MLB 只有一列 `pa > 0` 且 `xwoba is null`）。已結束的球季在上游是凍結的，每天早上重抓 2020~去年只是白花請求與 raw 空間。白名單新增球員 → season stats 補出他的 MLB 歷史列 → 缺口自動出現 → 隔天早上自動補齊，**不需人工介入**。實測：改前每批 7 個請求，改後常態 1 個。
>   - 已知代價：Savant 真的沒有值的球季（`est_woba` 空白、或該球員不在 bip leaderboard 上）會每天重查一次，上限就是原本固定的 7 個請求，不會更差。
>   - 需要無視缺口掃描、強制全部重抓時走 `etl resync --season`（見 §7）。
> - **raw 只存 tracked 球員的列**：CSV 匯出是全聯盟 577~946 列，但白名單只有 5 人、日後 reprocess 也只針對他們。實測一批 7 檔共 **1679 kB → 過濾後單檔約 1 kB**。
> - **逐年容錯**：某一年抓取失敗只記 warning 並跳過，**成功的年份照樣寫入**（`batch.py` 一拋例外就整個 source rollback，所以部分失敗刻意不拋）；**全部年份都失敗才拋** `SavantError`，讓批次如實落成 partial／failed。例外訊息帶上底層 `repr`，`sync_runs.detail` 才看得出是 timeout、403 還是 DNS。

> **來源可用性（ADR §6.4，2026-07-23 實測）**：pybaseball 的 FanGraphs／Baseball-Reference 接口因兩站 Cloudflare 防護一律 403，**不可用、不繞過**——一切以 **MLB Stats API 為主**，Savant 只當進階數據補充。Savant 更新較 MLB API 慢：進階欄允許**落後主資料一批**，不因 Savant 未更新而標整批失敗。wRC+/WAR/xFIP 已確認可由 StatsAPI `stats=sabermetrics` 取得（僅 MLB 層級、2020~ 可回查；為 MLB 官方自算版本，名詞頁延伸來源指向 MLB），見 §9 實測紀錄。
| 異動 | StatsAPI `transactions` | `transaction_events` | evening（另 morning 補漏） |
| roster / IL | StatsAPI roster 端點 | 僅當**對帳信號**（§6），不直接寫狀態 | evening |
| 球員/球隊基本資料 | StatsAPI people / teams | `players`（非白名單欄位）、`teams` | 低頻（每週或手動） |

> **逐場來源策略（2026-07-27 定案，球員中心）**：逐場成績一律走**人員 gameLog**（只抓 tracked 球員自己的比賽），**不再逐場掃全賽程 boxscore、也不把 boxscore 落庫**。逐場表自帶日期／對手／主客場並永久保留；`games` 只保留現役球隊的短期前瞻賽程，gameLog 不再寫入它。原始層 `raw_payloads` 保留 gameLog／schedule／people／teams／Savant CSV 原檔、**不存 boxscore**。`career_high`/`season_high` 以歷史逐場為基準（引擎讀全 `game_*_lines` 歷史，無日期窗），故初期需一次性 **backfill 2020~今**才會正確。

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
- **對帳**：evening 批抓的 roster/IL 快照與投影結果比對；不一致 → 記錄結構化告警到 `sync_runs.detail.sources_warnings`（含 `player_id`、欄位、投影值、觀測值與建議的 manual event），提示補錄 manual 事件——**不自動改投影**（維持事件為真相）。

## 7. 錯誤處理與韌性

- 上游呼叫：保守 delay（上游未宣告 rate limit）、重試 2 次、本地檔案快取（`etl/src/etl/cache.py`）。（原訂的 pybaseball 從未採用，見 §9。）
- 失敗語意：來源級失敗 → 該來源跳過、其餘照跑、`partial`；整批失敗 → `failed`，網站繼續供舊資料（spec-02 §5）。
- **告警語意**：source 正常完成時可回傳結構化 warning；批次將其依 source 寫入 `sync_runs.detail.sources_warnings`。**失敗的 source 也會保留它在拋例外前已回報的 warning**（例如上游重試紀錄——那正是解釋失敗原因的線索），與 `sources_failed` 的 error 並存。warning 純供稽核，**不影響** `success`／`partial`／`failed`（`derive_status` 只依來源是否失敗判定）。既有無 warning 的 detail 保持原形狀，讀取端須容忍沒有 `sources_warnings`。
- **Raw 保留策略（TTL）**：`raw_payloads` 依 endpoint 分級保留，**每批收尾**由 `raw_retention` source 清一次（排在最後：清理失敗只回滾清理本身，不影響當批 ingest）。天數＝`transactions` 365／`people`(bio) 90／`teams` 60／`schedule` 30／`people/*/stats` 14／`savant` 14；分級依據是「重抓得回來嗎、新的是否涵蓋舊的」。**未分類的 `(source, endpoint)` 保留不刪，並以 warning 落進 `sync_runs.detail`**（無 catch-all 預設天數）。單純刪列、不歸檔；`etl prune-raw [--dry-run]` 可手動觸發。
- 手動工具（CLI）：`resync --season`（球季數據 2020→當季整季重拉，**並強制重抓每一年的 Savant xwOBA**——batch 的缺口掃描正是這個指令要繞過的東西）、`resync --gamelog --from DATE`（回補早於當季的歷史逐場）、`add-event`（補錄 manual 事件）、`reproject`（重放投影）。

## 8. 測試決策

- transform 純函式：**錄下的 StatsAPI／Savant fixture** → 斷言 curated 列（不打真網路）；每個來源模組至少一組正常＋一組欄位缺漏 fixture。
- 一句話規則引擎：表驅動測試——輸入 game line 序列，斷言 pattern 與句子；覆蓋 §5 每列＋fallback 必中。
- 投影：同 spec-01 §E（與 Node 側共用 seed 概念，合約=curated schema）。
- 排程/IO 薄殼不測邏輯，只測「來源失敗不中斷整批、sync_runs 正確落帳」。

## 9. Open Items

- [x] ~~waiver claim 歸到 `trade` 或 `other`~~ → **已決策（2026-08-07，batu）：兩者皆不採，新增 enum 值 `waiver_claim`**（migration `0004`，比照 `declare_fa`／`assign` 的前例）。實測上游形狀：typeCode `CLW`、typeDesc `Claimed Off Waivers`，`fromTeam`／`toTeam` 皆齊（raw transaction 630444）。
  - **`other` 是錯的，不只是分類粗糙**：`other` 在投影是 no-op，而 `dfa` 的規則是「保留原隊參考」。鄭宗哲 2026-01~02 連續四次 claim＋DFA（PIT→TB→NYM→WSH→BOS），每次 DFA 都保留了**claim 之前**那一隊 → 網站曾有兩個月顯示「Pittsburgh Pirates・指定讓渡」，實際是坦帕灣 DFA 他。3/19 的 `send_down` 蓋掉才「看起來正常」——錯誤被後續事件掩蓋，不是沒發生。
  - **`trade` 投影正確但呈現錯誤**：`lib/services/player-status.ts` 會把它標成「交易」，鄭宗哲時間軸就會出現四筆交易，而他一次都沒被交易過；站上又已有 `waiver`（讓渡）與 `dfa`（指定讓渡）兩則名詞頁分開講這件事。
  - 落地：typeDesc/typeCode 對照、`_ROSTER_TYPES` 納入、標籤「讓渡挑選」、`waiver.mdx` 掛 `roster_event_types: [waiver_claim]`（名詞頁自動有實例回連）。重跑 transactions 後 5 筆既有事件已重新歸類（`on conflict … do update set type` 覆蓋）。
- [x] ~~實測 StatsAPI `transactions` 回傳的 typeDesc 字串全集 → spec-01 C.3 enum 對照（`_TYPEDESC_RULES` 目前是 best-effort，未匹配一律 `other`）~~ → **已完成（2026-08-10）**。展開 5 位 tracked 球員自 2020-01-01 起的 32 份 `transactions` raw payload，得 **238 筆不重複上游異動**；`(typeCode, typeDesc)` 只有以下 12 組，均已明確分類：

  | typeCode / typeDesc | 上游筆數 | 分類結果 |
  |---|---:|---|
  | SC / Status Change | 81 | `il_on` 20、`il_off` 17、`activate` 38、`other` 6 |
  | ASG / Assigned | 67 | `assign` 48、`other` 19 |
  | OPT / Optioned | 23 | `send_down` 23 |
  | CU / Recalled | 19 | `call_up` 19 |
  | DES / Designated for Assignment | 13 | `dfa` 13 |
  | TR / Trade | 7 | `trade` 7 |
  | SE / Selected | 7 | `call_up` 7 |
  | NUM / Number Change | 7 | `other` 7 |
  | CLW / Claimed Off Waivers | 5 | `waiver_claim` 5 |
  | SFA / Signed as Free Agent | 5 | `sign` 5 |
  | DFA / Declared Free Agency | 3 | `declare_fa` 3 |
  | OUT / Outrighted | 1 | `send_down` 1 |

  `other` 仍是刻意的 no-op：NUM 改背號沒有狀態語意；ASG 的春訓邀請／復健移地不能當 roster 指派；SC 剩下的 6 筆是「roster status changed by [球隊]」5 筆與「placed on the reserve list」1 筆，都沒有可投影的狀態。唯一需要新型別的是 SC 的 **38 筆**裸「activated」：字串無法分辨小聯盟 IL 復出、下放後例行登錄與國家隊徵召，故一律分類為 `activate`；投影只有在當前 `health='il'` 時才清為 `active`，否則 no-op，且從不改 affiliation／team／level。顯式含 `injured list`／`disabled list` 的 activation 照舊為 `il_off`。
- [x] ~~小聯盟成績資料源細節（原題：StatsAPI `sportId=11/12` 與 pybaseball 的欄位對齊表）~~ → **已實測、已決策（2026-08-07，batu）：小聯盟不提供 wOBA／xwOBA／wRC+／WAR／FIP，缺值不顯示。** 原題目已失效——pybaseball **從未被使用**（ETL 全 repo 無 import，僅散文殘留；ADR §6.4 早在 07-23 就實測 FanGraphs／B-R 全 403），沒有第二個來源要對齊。實測全庫各層級的非空計數：
  - **計數欄無缺口**：`hbp`／`sf`／`cs`／`bf`／`hld` 在 3A/2A/A+/A/Rk 全部有值 → 由計數欄推導的指標（AVG／OBP／SLG／OPS／ISO／K%／BB%／BABIP／WHIP／ERA／HR9）全層級成立。
  - **`lob_pct` 全層級有值**（aaa 7/7、aa 4/4…）→ 07-27「所有層級皆算」的決策已落地。
  - **只缺四個**：wOBA／xwOBA／wRC+／WAR（打擊）、FIP／WAR（投球），全為 MLB-only（來自 `stats=sabermetrics`，sportId≠1 回空；xwOBA 來自 Savant，亦僅 MLB）。
  - 不自算的理由：wOBA/wRC+ 需各聯盟各年度線性權重與 league constants，MiLB 無公開權威版本；FIP 公式需 HBP，而 `season_pitching_stats` **無 `hbp` 欄**；WAR 需守備調整與 replacement level，MiLB 無可信來源。三者自算都等於自創數字掛在球員頁上。
  - **連帶影響 spec-04 §G**：`woba`／`wrc-plus`／`fip`／`war` 四則名詞頁目前寫了 `aaa:`／`aa:` 級距，但這些指標在小聯盟永遠無值，該級距不可能被任何球員對上——校訂時應一併處理。
- [ ] cron 時刻上線後依實際結算延遲微調（§2 為建議值）
- [x] ~~實測 StatsAPI `stats=sabermetrics`~~ → **已實測（2026-07-23）：命中**——(a) hitting 供 `woba/wRc/wRcPlus/war`、pitching 供 `fip/fipMinus/xfip/war/eraMinus`；(b) **僅 MLB**：sportId≠1 回空（以三位台灣球員 2025 AAA「season 有 split、sabermetrics 回空」對照確認）；(c) 2020~ 可回查；(d) 抽樣 Judge 2024：wRC+ 219.8 vs FG 218、WAR 11.33 vs 11.2（wOBA .476 vs .458，MLB 自算權重）。→ 維持清單、requirements §9.1 預案封存
