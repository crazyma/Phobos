# Spec 01 — 台灣球員範疇 + 資料模型

<!--badges: 名單=手動白名單表; 層級=全層級（能抓到就收）; 起始=2020（可 backfill）; 主鍵=mlb_player_id-->

> 本文件把兩個最底層、影響最大的東西釘死：**(A) 「台灣球員」範疇的定義**、**(B) curated layer 的欄位級資料模型**。頁面、API、ETL 都掛在這兩塊上，之後的 spec 以此為地基。
>
> 前置決策（已定）：名單用**手動白名單表**；成績涵蓋**能抓到資料的所有層級**（大聯盟到新人聯盟，best-effort）；球季數據**從 2020 起**，未來 phase 可 backfill 更早。

---

## A. 台灣球員範疇

### A.1 名單模型：`players` 表即 source of truth

- 一位球員「在範疇內」的唯一判準：**存在於 `players` 表且 `is_tracked = true`**。
- ETL、頁面、API 一律只認這張表；不在表內的球員不抓、不顯示。

### A.2 名單怎麼建與維護

1. **初始種子**：用 MLB Stats API 查 `birthCountry ∈ {"Taiwan", "Chinese Taipei"}` 撈出候選（`/api/v1/sports/1/players` 或 people search），寫入 `players`。
2. **人工確認**：種子結果人工覆核，欄位 `verify_source` 標記來源（`birthCountry-seed` / `manual`）。
3. **後續維護**：新登場球員手動加一列即可（歷史上台籍大聯盟球員僅十幾位，完全可控）。`is_tracked` 可關掉某人而不刪資料。
4. birthCountry 只在種子階段用一次，**不作為每次 ETL 的即時篩選條件**（上游國籍欄位不可靠）。

### A.3 身分主鍵與跨源對照（crosswalk）

- **正規主鍵**：`mlb_player_id`（= MLB Stats API 的 person id，等同 pybaseball 的 `key_mlbam`）。所有表都用它 join。
- pybaseball 的資料是用 `key_fangraphs` / `key_bbref` 命名，**必須先透過 `playerid_lookup` 對照回 `mlb_player_id`** 才能寫入。對照結果存在 `players` 上的 crosswalk 欄位，避免每次 ETL 重查。

### A.4 涵蓋層級

| 層級 | sportId | level enum | 成績 | 說明 |
|---|---|---|---|---|
| MLB | 1 | `MLB` | ✅ | 主要 |
| Triple-A (3A) | 11 | `AAA` | ✅ | |
| Double-A (2A) | 12 | `AA` | ✅ | |
| High-A (1A+) | 13 | `A_PLUS` | ✅ | |
| Single-A (1A) | 14 | `A` | ✅ | |
| Rookie / 新人聯盟 | 16 | `ROOKIE` | ✅（best-effort） | 資料可能稀疏或缺，抓得到就收 |

- **原則：能抓到資料的層級一律呈現成績**（多數台灣球員剛進體系、主要在低階層級，若只做 3A 以上會幾乎沒資料）。從大聯盟到新人聯盟，只要來源有資料就存。
- 資料源差異：MLB 走 pybaseball；小聯盟各級走 MLB Stats API 的 `sportId`。**低階層級（Rookie/複合聯盟）資料常稀疏甚至缺**，採 best-effort — 有就呈現、沒有就略過，不因缺資料而視為錯誤。
- **roster / 異動追蹤**：涵蓋所有層級的升降（含下放到更低層級、IL），那是「動態」的核心。

### A.5 時間範圍

- `SEASON_BACKFILL_START = 2020`（設定值，非寫死）。v1 只抓 2020 (含) 之後的球季。
- 未來 phase 要往前補時，只需調小這個值 + reprocess，schema 不動。

---

## B. Curated 資料模型（欄位級）

> 命名慣例：表名/欄位 `snake_case`；時間戳一律 `timestamptz`；金額無；所有表帶 `updated_at`。
> **投球局數不用浮點**：以 `ip_outs`（出局數 = 局數 × 3）儲存，避免 `6.1/6.2` 這種棒球記法的精度問題，顯示時再換算。

### B.1 列舉型別（enums）

```
level          : MLB | AAA | AA | A_PLUS | A | ROOKIE      # v1 成績只用前三，roster 可用全部
roster_status  : active | il_10 | il_15 | il_60 | minors | restricted | dfa | free_agent | suspended
transaction_type: callup | send_down | trade | waiver | released | signed
                | selected | dfa | il_placed | il_activated | outrighted | other
game_status    : scheduled | in_progress | final | postponed | suspended
bat_side       : L | R | S
throw_side     : L | R
```

### B.2 `players` — 白名單 + 身分 + bio

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_player_id` | `integer` **PK** | MLB Stats API person id（正規主鍵） |
| `full_name` | `text` NOT NULL | 英文全名 |
| `name_zh` | `text` NULL | 中文名 |
| `birth_country` | `text` NULL | 種子當時的國籍 |
| `birth_date` | `date` NULL | |
| `primary_position` | `text` NULL | P / C / 1B / OF… |
| `bats` | `bat_side` NULL | |
| `throws` | `throw_side` NULL | |
| `mlb_debut_date` | `date` NULL | |
| `key_fangraphs` | `integer` NULL | crosswalk（pybaseball/FanGraphs） |
| `key_bbref` | `text` NULL | crosswalk（Baseball-Reference） |
| `key_retro` | `text` NULL | crosswalk（Retrosheet） |
| `is_tracked` | `boolean` NOT NULL default `true` | 是否納入追蹤/顯示 |
| `verify_source` | `text` NULL | `birthCountry-seed` / `manual` |
| `note` | `text` NULL | 人工備註 |
| `added_at` | `timestamptz` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **Upsert key**：`mlb_player_id`。

### B.3 `teams` — 球隊（含小聯盟附屬球隊）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_team_id` | `integer` **PK** | MLB Stats API team id |
| `name` | `text` NOT NULL | |
| `abbreviation` | `text` NULL | |
| `level` | `level` NOT NULL | 該隊所屬層級 |
| `parent_org_id` | `integer` NULL → `teams.mlb_team_id` | 小聯盟球隊的大聯盟母隊 |
| `league` | `text` NULL | |
| `division` | `text` NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **Upsert key**：`mlb_team_id`。

### B.4 `season_batting_stats` — 球季打擊

- **粒度（grain）**：`(mlb_player_id, season, level, team_id)` = 一位球員在某季、某層級、某球隊的一段成績。**保留交易造成的多段**（台灣球員常換隊），跨隊/跨層級總和用查詢時聚合，不另存一列避免重複計算。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_player_id` | `integer` NOT NULL → `players` | |
| `season` | `integer` NOT NULL | |
| `level` | `level` NOT NULL | |
| `team_id` | `integer` NOT NULL → `teams` | |
| 計數：`g, pa, ab, r, h, b2, b3, hr, rbi, bb, so, sb, cs, hbp, sf, sh, gdp` | `integer` | 二壘打/三壘打用 `b2`/`b3` 避免數字開頭 |
| 進階（存上游值，無法由計數重算的才存）：`woba, wrc_plus` | `numeric` NULL | avg/obp/slg/ops 由計數欄算，不落庫 |
| `source` | `text` NOT NULL | `fangraphs` / `statsapi` |
| `updated_at` | `timestamptz` NOT NULL | |

- **PK / Upsert key**：複合 `(mlb_player_id, season, level, team_id)`。
- **Upsert 而非 append**（球季數據會事後修正）。

### B.5 `season_pitching_stats` — 球季投球

- **粒度**：同上 `(mlb_player_id, season, level, team_id)`。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_player_id` | `integer` NOT NULL → `players` | |
| `season` | `integer` NOT NULL | |
| `level` | `level` NOT NULL | |
| `team_id` | `integer` NOT NULL → `teams` | |
| `w, l, g, gs, sv, hld, ip_outs, h, r, er, hr, bb, so, hbp, bf, wp, bk` | `integer` | **局數存 `ip_outs`** |
| 進階（存值）：`era, fip, whip` | `numeric` NULL | 可由計數算的顯示時算；存 fip 因需常數 |
| `source` | `text` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **PK / Upsert key**：複合 `(mlb_player_id, season, level, team_id)`。

### B.6 `roster_status` — 名單狀態歷史

- **存歷史，不只存現況**（呈現異動時間軸）。「現況」= `end_date IS NULL` 的那一列。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | `bigserial` **PK** | |
| `mlb_player_id` | `integer` NOT NULL → `players` | |
| `status` | `roster_status` NOT NULL | |
| `level` | `level` NULL | 目前所在層級 |
| `team_id` | `integer` NULL → `teams` | |
| `effective_date` | `date` NOT NULL | 此狀態開始日 |
| `end_date` | `date` NULL | NULL = 目前仍是此狀態 |
| `source` | `text` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **Upsert key**：`(mlb_player_id, effective_date, status)`。

### B.7 `transactions` — 球員異動

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | `bigserial` **PK** | |
| `mlb_transaction_id` | `bigint` NULL UNIQUE | StatsAPI 的異動 id（有就用它做冪等） |
| `mlb_player_id` | `integer` NOT NULL → `players` | |
| `from_team_id` | `integer` NULL → `teams` | |
| `to_team_id` | `integer` NULL → `teams` | |
| `date` | `date` NOT NULL | |
| `type` | `transaction_type` NOT NULL | |
| `description` | `text` NULL | 原始描述 |
| `source` | `text` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **Upsert key**：有 `mlb_transaction_id` 用它；否則 `(mlb_player_id, date, type, description)`。

### B.8 `games` — 球隊賽程與結果（供「所屬球隊賽程」）

- v1 先做 **MLB 層級**賽程；為 schedule 顯示用，非逐球資料。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mlb_game_id` | `bigint` **PK** | StatsAPI gamePk |
| `season` | `integer` NOT NULL | |
| `date` | `date` NOT NULL | 比賽日（見時區備註） |
| `level` | `level` NOT NULL | |
| `home_team_id` | `integer` NOT NULL → `teams` | |
| `away_team_id` | `integer` NOT NULL → `teams` | |
| `home_score` | `integer` NULL | 未打完為 NULL |
| `away_score` | `integer` NULL | |
| `status` | `game_status` NOT NULL | |
| `updated_at` | `timestamptz` NOT NULL | |

- **Upsert key**：`mlb_game_id`。

---

## C. Raw layer（原則，不逐欄設計）

- 每個來源一張 raw 表：`raw_fangraphs_batting`、`raw_fangraphs_pitching`、`raw_statsapi_transactions`、`raw_statsapi_roster`、`raw_statsapi_schedule`…
- 統一結構：`natural_key`（來源自然鍵）+ `payload jsonb`（原始回傳）+ `source` + `fetched_at`。
- curated 由 raw 轉換而來；上游欄位變動時只重寫轉換 + reprocess，不必重抓。

---

## D. 代表性 Drizzle schema（核心表，其餘照 B 節欄位比照）

```ts
import { pgTable, integer, text, boolean, date, timestamp, numeric, bigserial, bigint, primaryKey, pgEnum } from "drizzle-orm/pg-core";

export const level = pgEnum("level", ["MLB", "AAA", "AA", "A_PLUS", "A", "ROOKIE"]);
export const batSide = pgEnum("bat_side", ["L", "R", "S"]);
export const throwSide = pgEnum("throw_side", ["L", "R"]);

export const players = pgTable("players", {
  mlbPlayerId: integer("mlb_player_id").primaryKey(),
  fullName: text("full_name").notNull(),
  nameZh: text("name_zh"),
  birthCountry: text("birth_country"),
  birthDate: date("birth_date"),
  primaryPosition: text("primary_position"),
  bats: batSide("bats"),
  throws: throwSide("throws"),
  mlbDebutDate: date("mlb_debut_date"),
  keyFangraphs: integer("key_fangraphs"),
  keyBbref: text("key_bbref"),
  keyRetro: text("key_retro"),
  isTracked: boolean("is_tracked").notNull().default(true),
  verifySource: text("verify_source"),
  note: text("note"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const seasonBattingStats = pgTable("season_batting_stats", {
  mlbPlayerId: integer("mlb_player_id").notNull().references(() => players.mlbPlayerId),
  season: integer("season").notNull(),
  level: level("level").notNull(),
  teamId: integer("team_id").notNull(),
  g: integer("g"), pa: integer("pa"), ab: integer("ab"), r: integer("r"), h: integer("h"),
  b2: integer("b2"), b3: integer("b3"), hr: integer("hr"), rbi: integer("rbi"),
  bb: integer("bb"), so: integer("so"), sb: integer("sb"), cs: integer("cs"),
  hbp: integer("hbp"), sf: integer("sf"), sh: integer("sh"), gdp: integer("gdp"),
  woba: numeric("woba"), wrcPlus: numeric("wrc_plus"),
  source: text("source").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.mlbPlayerId, t.season, t.level, t.teamId] }),
}));
```

---

## E. 這塊仍待決 / 往後 spec 要處理的 Open Items

- [ ] 進階數據要顯示到多細？（只 slash line + HR/RBI，還是含 wRC+/FIP…）— 影響 B.4/B.5 落庫欄位。
- [ ] **時區**：`games.date`、ETL 排程時間怎麼統一（美東賽事 vs 台灣時間）— 建議一律存 UTC + 顯示端轉換，下一份 ETL spec 定案。
- [ ] 小聯盟成績的資料源細節：StatsAPI `sportId=11/12` 端點的實際回傳欄位與 pybaseball 欄位對齊表。
- [ ] `transaction_type` 列舉是否涵蓋 StatsAPI 實際會出現的所有型別（需實測 transactions 端點）。
- [ ] `players` 白名單的維護介面：先手動改 DB / 種子腳本，還是要簡單後台？（v1 可先腳本）
