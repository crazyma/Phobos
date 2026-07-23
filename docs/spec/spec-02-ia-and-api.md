# Spec 02 — 頁面 / 路由 IA + 對外 API 合約

<!--badges: 上游=requirements.md; 依賴=spec-01（資料模型）; 產出=路由/頁面/API 合約-->

> 把 requirements 的功能，落成**具體路由、每頁顯示什麼與怎麼渲染、對外 JSON API 合約**。資料模型見 `spec-01`；本 spec 是前端與 API 層的施工圖。
>
> 分層原則（承 `adr/decisions.md`）：頁面用 **Server Component 經 `lib/services` 直讀 DB**；**Route Handlers（`/api/*`）也走同一組 `lib/services`**，只是把結果包成對外 JSON（供未來行動端等 client 共用）。兩者共用邏輯、不重複。

---

## A. 路由 / Sitemap

| 路由 | 頁面 | 渲染 | 說明 |
|---|---|---|---|
| `/` | 首頁（動態導向） | SSR / ISR | 最近 24h + 即將發生；動態需新鮮 |
| `/players` | 球員總覽（名冊） | ISR | 全名單現況；一天兩次變動 |
| `/players/[id]` | 球員個人頁 | ISR（+ `generateStaticParams`） | `id` = `mlb_player_id` |
| `/glossary` | 名詞總覽（分類） | SSG | 靜態內容 |
| `/glossary/[slug]` | 單一名詞頁 | SSG（`generateStaticParams`） | `slug` = 名詞代碼（`ops`/`wrc-plus`/`fip`…） |

- **全域導覽（top / side bar）**：放「球員名冊」「名詞」入口（首頁不放名冊，見 requirements F1-0）。
- **URL 決策（待定）**：球員頁 `id` 用穩定的 `mlb_player_id`；是否為 SEO 追加英文名 slug（`/players/[id]/[slug]`）見 §E。
- **名詞 slug** 用英文縮寫代碼，兼顧 SEO 與「數據→名詞」雙向連結（球員頁的 `wRC+` 連到 `/glossary/wrc-plus`）。

---

## B. 各頁面規格

> 格式：**顯示什麼**（對照 requirements）／**資料來源**（spec-01 的表）／**渲染**。

### B.1 `/` 首頁（動態導向）
- **顯示**：① 最近 24h 賽果 + 球員動態（每則可帶近況一句話）② 即將發生（下一場出賽預告、台灣時間）③ 空狀態／休賽期 fallback。
- **資料**：`games`（近 24h `final` + 即將到來含 `probable_*_pitcher`）、`game_batting_stats`/`game_pitching_stats`（那些場的台灣球員 box）、`transactions` + `roster_status`（近 24h）、`player_recent_form`、`teams`。
- **渲染**：Server Component 直讀 DB；**ISR**，revalidate 對齊一天兩次同步（見 §D 的 on-demand revalidation）。

### B.2 `/players` 球員總覽
- **顯示**：全名單，每人一列/卡：目前球隊、層級、名單狀態、近況一句話；簡單排序/篩選（層級、球隊）。**v1 極簡**，不做複雜篩選器。
- **資料**：`players`（`is_tracked=true`）、`roster_status`（現況 = `end_date IS NULL`）、`player_recent_form`、`teams`。
- **渲染**：ISR。

### B.3 `/players/[id]` 球員個人頁
- **顯示**（對照 requirements F1-2 五元素）：
  1. 基本資料 + 近況一句話
  2. 球季數據（標準 + 進階，分季/分層；進階缺就不顯示）
  3. 逐場成績（近 N 場 box line）
  4. 動態時間軸（升降/交易/傷兵…）
  5. 出賽預告 + 下一個系列賽（先發明顯標示、台灣時間、對手/場地）
- **資料**：`players`、`season_batting_stats`/`season_pitching_stats`、`game_batting_stats`/`game_pitching_stats`、`roster_status`（歷史）、`transactions`、`games`（下一系列 + probable）、`player_recent_form`、`teams`。
- **渲染**：Server Component 直讀 DB；`generateStaticParams` 產出名單內球員頁 + **ISR** revalidate。
- **`generateMetadata`**：OG/分享（標題=球員名、描述=近況一句話、圖=球隊 logo，見 §D）。

### B.4 `/glossary` 名詞總覽
- **顯示**：依主題分類列出名詞（打擊/投球/規則…）。
- **資料**：MDX 檔（spec-04 定內容）。**渲染**：SSG。

### B.5 `/glossary/[slug]` 單一名詞頁
- **顯示**：解讀優先三層（判讀/級距 → 定義算法小字 → 權威原始連結）+ 回連範例球員。
- **資料**：MDX 檔。**渲染**：SSG（`generateStaticParams` 掃 MDX）；`generateMetadata` OG。

---

## C. 對外 API 合約（`/api/*`）

- 一律回 JSON；時間欄位一律 **UTC ISO-8601**（顯示端轉台灣時間，見 §D）。
- 查詢參數與環境變數用 **Zod** 驗證；型別由 schema 推導。
- 錯誤統一形狀：`{ "error": { "code": string, "message": string } }`；常見 `NOT_FOUND` / `BAD_REQUEST`。

### C.1 Endpoint 一覽

| Method | 路徑 | 用途 | 主要參數 |
|---|---|---|---|
| GET | `/api/players` | 名冊（現況摘要） | — |
| GET | `/api/players/[id]` | 球員完整（bio + 球季 + 動態 + 下一系列 + 近況） | — |
| GET | `/api/players/[id]/game-log` | 逐場成績 | `season?`、`group=hitting\|pitching`、`limit?` |
| GET | `/api/feed` | 首頁動態（近 N 時窗賽果 + 異動） | `window=24h`（預設） |
| GET | `/api/schedule/upcoming` | 即將出賽 / 下一系列（含先發預告） | `playerId?` |

- 名詞（glossary）為靜態 MDX，**無需 API**。

### C.2 代表性回傳形狀（Zod）

```ts
import { z } from "zod";

export const Level = z.enum(["MLB", "AAA", "AA", "A_PLUS", "A", "ROOKIE"]);

// GET /api/players 的單筆
export const PlayerSummary = z.object({
  mlbPlayerId: z.number().int(),
  fullName: z.string(),
  nameZh: z.string().nullable(),
  primaryPosition: z.string().nullable(),
  currentTeam: z.object({ id: z.number().int(), name: z.string(), abbr: z.string().nullable() }).nullable(),
  currentLevel: Level.nullable(),
  rosterStatus: z.string().nullable(),        // active / il_10 / minors…
  recentForm: z.string().nullable(),          // 近況一句話（≤20 字）
});
export const PlayersResponse = z.array(PlayerSummary);

// GET /api/players/[id]
export const SeasonBatting = z.object({
  season: z.number().int(), level: Level, teamId: z.number().int(),
  g: z.number().int().nullable(), pa: z.number().int().nullable(), /* …計數… */
  advanced: z.object({                        // 缺則為 null（best-effort）
    wrcPlus: z.number().nullable(), woba: z.number().nullable(), war: z.number().nullable(),
  }).partial().nullable(),
});
export const GameLine = z.object({
  gameId: z.number().int(), gameDate: z.string(),  // YYYY-MM-DD
  level: Level, teamId: z.number().int(), opponent: z.string().nullable(),
  // 打者或投手其一
  batting: z.object({ ab: z.number(), h: z.number(), hr: z.number(), rbi: z.number(), bb: z.number(), so: z.number() }).nullable(),
  pitching: z.object({ ipOuts: z.number(), h: z.number(), er: z.number(), so: z.number(), bb: z.number(), decision: z.string().nullable() }).nullable(),
});
export const TimelineEvent = z.object({
  date: z.string(), type: z.string(), description: z.string().nullable(),
  fromTeam: z.string().nullable(), toTeam: z.string().nullable(),
});
export const UpcomingGame = z.object({
  gameId: z.number().int(),
  startTimeUtc: z.string().nullable(),         // ISO-8601 UTC；顯示端轉台灣時間
  opponent: z.string().nullable(), venue: z.string().nullable(), home: z.boolean(),
  probableStarter: z.boolean(),                // 該球員是否為先發預告
});
export const PlayerDetail = z.object({
  bio: PlayerSummary,
  seasonBatting: z.array(SeasonBatting),
  seasonPitching: z.array(z.object({ /* 同理，advanced: fip/war */ })),
  recentGames: z.array(GameLine),
  timeline: z.array(TimelineEvent),
  nextSeries: z.array(UpcomingGame),
});
```

- 標準比率（avg/obp/slg/ops、era/whip、iso/bb%/k%/hr9/lob%/babip）由計數欄在 `lib/services` **算好再回**，前端不自算（呼應 spec-01「只存無法重算的」）。

---

## D. 橫向處理

- **時區**：DB/API 一律 UTC；顯示層用 `Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", … })` 轉台灣時間（零依賴；若嫌繁可加 `date-fns-tz`）。
- **OG / 分享**：每頁 `generateMetadata` 出 OG/Twitter tags——球員頁（標題=球員名、描述=近況一句話、圖=球隊 logo）、名詞頁（標題=名詞、描述=一句判讀）。動態 OG 圖（`next/og`）列 §E 選配。
- **空狀態 / 休賽期**：首頁無 24h 動態時顯示 fallback 畫面；**內容待 requirements §9.2 定**，本 spec 先定「有此狀態、走同一版位」。
- **資料新鮮度 / revalidation**：ISR 對齊一天兩次 ETL——**首選 on-demand revalidation**（ETL 完成後呼叫 `revalidatePath`/`revalidateTag`），退而求其次 time-based（`revalidate` 秒數）。每頁標示「資料最後更新時間」（requirements F1-3）。

---

## E. Open Items

- [ ] **URL 方案**：球員頁是否為 SEO 追加英文名 slug（`/players/[id]/[slug]`）還是純 `mlb_player_id`。
- [ ] **revalidation 觸發**：on-demand（ETL 打 webhook / `revalidateTag`）vs time-based，擇一定案（與 spec-03 排程對接）。
- [ ] **動態 OG 圖**：是否用 `next/og` 產近況卡片圖，或 v1 先用球隊 logo/預設圖。
- [ ] **逐場 `N`**：球員頁逐場成績顯示最近幾場（10？15？）。
- [ ] **名詞新增後的重建**：SSG 內容新增走 rebuild 還是 ISR（與 spec-04 對接）。
- [ ] 首頁動態 feed 的排序與去重規則（同一球員同日多事件）。
