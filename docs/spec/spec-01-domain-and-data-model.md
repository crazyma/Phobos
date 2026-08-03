# Spec 01 — 領域與資料模型

<!--badges: 名單=手動白名單（含生命週期）; 真相來源=事件溯源; 主鍵=mlb_player_id; 起始=2020-->

> 把最底層的東西釘死：**(A) 「台灣球員」範疇與生命週期**、**(B) 事件溯源與狀態投影**、**(C) curated layer 欄位級 schema**。頁面（spec-02）、ETL（spec-03）都掛在這上面。領域模型推導過程見 `plan/domain-regrill-2026-07-23.md`。

---

## A. 範疇與生命週期

### A.1 白名單

- `players` 表＝**手動維護的白名單**，是「誰算台灣球員」的唯一事實來源（十餘人，用 seed 腳本維護；不做後台）。
- 正規主鍵一律 **`mlb_player_id`**（MLB Stats API 的 person id，涵蓋小聯盟球員）。

### A.2 生命週期（tracked / archived）

| 狀態 | 意義 | 行為 |
|---|---|---|
| `tracked` | 現役美職體系內（MLB～新人聯盟） | 全功能：同步、首頁、名冊、預告 |
| `archived` | 已離開美職體系（退役/轉戰他聯） | **精簡存檔頁**：基本資料＋生涯總成績；不再同步、不進首頁與預設名冊；SEO 連結不斷 |

切換為人工操作（改 seed / DB），切換後下一批 ETL 即停止抓取該球員。

### A.3 資料粒度層次

```
season（球季 × 層級 × 球隊）      ← 球員頁球季數據
game（逐場 box line，球員 × 比賽 × 角色）← 逐場、快訊、近況一句話素材
event（異動事件流）               ← 時間軸、狀態投影
```

成績涵蓋**能抓到資料的所有層級**（MLB／3A／2A／1A／新人聯盟，best-effort）；球季數據自 **2020** 起。

## B. 事件溯源與狀態投影

### B.1 原則

- **`transaction_events` 是異動的唯一真相來源**；「目前狀態」是由事件流重放（replay）得到的**投影**，由 ETL 每批重算寫入 `player_current_status`。
- 時間軸與目前狀態因此**不可能矛盾**。上游漏事件時，**人工補錄一筆 `source='manual'` 事件**再重放；**禁止**直接改投影表。

### B.2 狀態＝歸屬 × 健康（兩軸）

- **歸屬（affiliation）**：`rostered`（在某隊某層級）｜`dfa`｜`free_agent`｜`released`｜`departed`（已離開美職，對應 A.2 archived）。
- **健康（health）**：`active`｜`il`（各層級都可能進 IL；`il_detail` 存 10/15/60 天等細節）。
- 呈現時組合成一句（spec-02），例：「3A・傷兵名單（IL-60）」。

### B.3 投影規則（狀態機）

事件依 `(effective_date, announced_at, id)` 排序重放：

| 事件 type | 歸屬變化 | 健康變化 |
|---|---|---|
| `sign` / `trade` / `call_up` / `send_down` | → `rostered`（取 `to_team` 的隊/層級） | 不變 |
| `assign` | → `rostered`（取 `to_team` 的隊/層級）；**`to_team` 無法解析（非追蹤隊，如冬季/秋季聯盟）→ 不變、不清隊** | 不變 |
| `dfa` | → `dfa`（保留原隊參考） | 不變 |
| `release` | → `released`（清隊） | 重設 `active` |
| `declare_fa` | → `free_agent`（清隊） | 重設 `active` |
| `il_on` | 不變 | → `il`（記 `il_detail`） |
| `il_off` | 不變 | → `active` |
| `depart`（手動事件） | → `departed` | 重設 `active` |
| `other` | 不變（僅時間軸顯示） | 不變 |

## C. Curated schema（欄位級）

慣例：時間戳一律 `timestamptz`（UTC）；比率欄**只存無法由計數重算的**，可推導者（AVG/OBP/SLG/OPS/ISO/BB%/K%/WHIP/ERA/HR9/BABIP）由 `lib/services` 讀取時計算。

### C.1 `players`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_player_id` | int **PK** | |
| `name_en` / `name_zh` | text | 中英文名 |
| `primary_position` | text | `P`/`C`/`SS`/`OF`… |
| `bats` / `throws` | enum `L,R,S` | |
| `birthdate` | date | |
| `lifecycle` | enum `tracked,archived` | A.2 |
| `created_at` / `updated_at` | timestamptz | |

### C.2 `teams`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_team_id` | int **PK** | StatsAPI team id（含小聯盟隊） |
| `name_en` / `name_zh` | text（zh 可空） | |
| `abbrev` | text | |
| `level` | enum `mlb,aaa,aa,a_plus,a,rookie` | sportId 對照見 spec-03 §4 |
| `parent_org_team_id` | int，可空 | 所屬母球團（MLB 隊）；區分「球團」與「所屬球隊」 |

### C.3 `transaction_events`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | bigserial **PK** | |
| `source_tx_id` | text，可空 unique | 上游 transaction id |
| `player_id` | int FK | |
| `type` | enum `sign,call_up,send_down,trade,dfa,release,declare_fa,assign,il_on,il_off,depart,other` | `declare_fa`＝宣告成為自由球員（StatsAPI「Declared Free Agency」/typeCode DFA）→ 投影 `free_agent`。`assign`＝小聯盟指派（StatsAPI「assigned to [隊]」/typeCode ASG）→ 投影 `rostered` 於該隊/層級；**須與「invited non-roster」（春訓邀請，非上 roster）、國家隊 activate 區分——後者仍歸 `other`** |
| `effective_date` | date | 排序主鍵之一 |
| `announced_at` | timestamptz，可空 | |
| `from_team_id` / `to_team_id` | int FK，可空 | |
| `il_detail` | text，可空 | `il_10`/`il_15`/`il_60`… |
| `description` | text | 顯示於時間軸 |
| `source` | enum `statsapi,manual` | |

Upsert key：`source_tx_id`；無上游 id 時 `(player_id, type, effective_date, to_team_id)`。

### C.4 `player_current_status`（投影，僅 ETL 寫入）

`player_id` PK；`affiliation`（B.2 enum）；`team_id`/`level` 可空；`health`；`il_detail` 可空；`as_of_event_id` FK；`projected_at`。

### C.5 `games`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `game_pk` | int **PK** | StatsAPI gamePk（天然處理雙重賽） |
| `level` | enum 同 teams.level | |
| `game_date_us` | date | **美國比賽日**（首頁窗口錨定，spec-02/03） |
| `start_time_utc` | timestamptz | |
| `home_team_id` / `away_team_id` | int FK | |
| `venue_name` | text | |
| `status` | enum `scheduled,live,final,postponed,suspended,cancelled` | |
| `home_score` / `away_score` | int，可空 | |
| `game_number` / `games_in_series` / `series_game_number` | int | 雙重賽場次與系列賽資訊 |
| `probable_home_pitcher_id` / `probable_away_pitcher_id` | int，可空 | 出賽預告（僅投手有「確定先發」） |

`games` 是**純前瞻賽程表**：只保留現役 tracked 球員所屬球隊、美西今天前後各 7 天的賽程；窗口外資料每批清除。歷史比賽資訊由逐場表自帶，不依賴本表。

### C.6 逐場成績（球員 × 比賽 × **角色**＝兩張表）

角色由**當場行為**決定（野手投球、二刀流＝同場兩表各一列）。

`game_batting_lines`：PK `(player_id, game_pk)`；`team_id`、`level`、`pa, ab, h, doubles, triples, hr, rbi, r, bb, so, sb`；另有 `game_date_us`（not null）、`opponent_team_id`／`is_home`（可空）。不設 `game_pk → games` FK。

`game_pitching_lines`：PK `(player_id, game_pk)`；`team_id`、`level`、`started` bool、`ip_outs`（局數×3，整數存）、`h, r, er, bb, so, hr`；同樣自帶 `game_date_us`、`opponent_team_id`、`is_home`，不依賴 `games`。

### C.7 球季數據（球季 × 層級 × **球隊**）

PK 皆 `(player_id, season, level, team_id)`——同季同層級跨隊分列；**層級合計列由 services 從計數欄重算**（比率可加總重算；進階指標不可加總，合計列僅在該層級單隊時顯示進階值）。**不做跨層級合計**。

`season_batting_stats`：計數 `g, pa, ab, h, doubles, triples, hr, rbi, r, sb, cs, bb, so, hbp, sf`；進階（可空，best-effort）`woba, xwoba, wrc_plus, war`。`xwoba` 由 Savant 官方 CSV 補入，僅 MLB 且 player-season 只有一隊時寫入；多隊球季留 NULL；`source_updated_at`。

`season_pitching_stats`：計數 `g, gs, ip_outs, bf, h, r, er, hr, bb, so, w, l, sv, hld`；進階（可空）`fip, lob_pct, war`；`source_updated_at`。

> 進階清單為**可調整清單**（目前打/投各 7 項，其中 ISO/BB%/K%/BABIP/HR9 由計數推導、不落欄）。增減指標時遵守「**名詞頁先行**」（spec-04 §D）。
>
> **來源定案（2026-07-23 實測，ADR §6.4、requirements §9.1）**：`woba`／`wrc_plus`／`war`（打）與 `fip`／`war`（投）由 **StatsAPI `stats=sabermetrics`** 取得——**僅 MLB 層級**（sportId≠1 回空 → 小聯盟留 NULL，符合既定 best-effort）、2020~ 可回查；數值為 MLB 官方自算版本（與 FanGraphs 同量級、非同值）。`lob_pct` 仍由 ETL 自算；`xwoba` 欄保留為 Savant 可選補充。requirements §9.1 的遞補鏈／WAR 移除預案**封存不啟動**。

### C.8 `player_recent_form`（近況一句話，ETL 每批重算）

`player_id` PK；`sentence_zh` text（≤20 字，**永不為空**）；`pattern` enum `career_high,season_high,streak,single_game,recent_agg,status_fallback`；`computed_at`。生成規則見 spec-03 §5。

### C.9 `sync_runs`

`id` PK；`kind` enum `morning,evening,manual`；`started_at` / `finished_at`；`status` enum `success,partial,failed`；`detail` jsonb（各來源成敗）。頁面「資料最後更新時間」取最近一筆非 `failed` 的 `finished_at`。

### C.10 Raw layer

`raw_payloads`：`id` PK；`source`（`statsapi`/`fangraphs`…）；`endpoint`；`params` jsonb；`fetched_at`；`payload` jsonb。上游變動時重寫轉換邏輯 reprocess，不必重抓（ADR §8.1）。

## D. 未來 domain 邊界（只預留、不建）

`news`（功能 3）、`articles`+`authors`（功能 4）屆時為獨立 domain 新表，不動本 spec 既有表。

## E. 測試決策

- 純函式：**狀態投影**——給定事件列斷言（affiliation, health），案例覆蓋 B.3 全表＋亂序補錄事件重放。
- 衍生計算：services 的比率推導（含 `ip_outs`→IP 顯示、合計列重算）以已知數字對照官方值。
- Schema 即合約：Drizzle schema 與本 spec 對齊即為 ETL/Web 兩側 fixture 測試的共同基準（spec-00 §3）。

## F. Open Items

- [ ] StatsAPI transactions 端點的 type 字串 → C.3 enum 對照表（實測後補，spec-03 承接）
- [ ] `name_zh` 補齊方式（手動 seed；無中文名球員顯示英文）
- [x] ~~`wrc_plus`／`war` 欄位去留~~ → 已定（2026-07-23 實測命中）：欄位保留，來源＝StatsAPI `stats=sabermetrics`（僅 MLB 層級）
