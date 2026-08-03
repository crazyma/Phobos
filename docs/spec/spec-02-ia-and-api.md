# Spec 02 — 頁面 IA 與對外 API 合約

<!--badges: 上游=requirements + spec-01; 渲染=Server Component + ISR / SSG; API=Route Handlers + Zod-->

> 把需求落成**具體路由、每頁顯示什麼與怎麼渲染、對外 JSON API 合約**。分層原則（ADR §4）：頁面用 **Server Component 經 `lib/services` 直讀 DB**；**Route Handlers（`/api/*`）走同一組 services**，只是把結果包成對外 JSON。兩者共用邏輯、不重複。

---

## 1. 路由總表

| 路由 | 內容 | 渲染 |
|---|---|---|
| `/` | 首頁（動態導向） | ISR，revalidate 1800s |
| `/players` | 球員總覽（名冊） | ISR 1800s |
| `/players/[id]` | 球員個人頁（`id`＝`mlb_player_id`） | ISR 1800s |
| `/glossary` | 名詞索引（主題分類） | SSG（MDX，build time） |
| `/glossary/[slug]` | 名詞頁 | SSG |
| `/api/*` | 對外 JSON API（§3） | 動態，`Cache-Control` 同 ISR 節奏 |

- 名冊與名詞入口放**全域導覽（top bar；手機收合選單）**，不佔首頁主體。
- URL 用數字 id（穩定、免 slug 衝突）；SEO 靠 `<title>`／metadata 的中英文名，日後要美化 slug 再加 alias 轉址。
- ISR 1800s 的理由：資料一天只更新兩批（spec-03），時間型 revalidate 已足夠；不做 ETL 完成即時觸發 revalidation（v1 簡化，列 §8）。

## 2. 頁面規格

### 2.1 首頁 `/`

由上而下：

1. **最新賽況（主）**：錨定「**最新一個已結束的美國比賽日**」：該日已依美西時鐘完全結束。每張快訊卡＝一位球員一場：中文名、隊伍/層級徽章、**單場精簡 line**（打者：打席/安打/全壘打/打點/保送/三振；投手：局數/被安打/失分/自責/三振/保送）、**近況一句話**。
2. **球員動態**：該比賽日之後發生的 `transaction_events`（升降/交易/DFA/釋出/IL 進出），一則一行＋日期。
3. **即將出賽（次）**：每位 `tracked` 球員的下一場：對手、**台灣時間**開賽、標示——**「確定先發」僅投手**（`games.probable_*_pitcher_id` 命中）；其他健康在隊者一律「**可能出賽**」；`health=il` 顯示「傷兵中」不列預告。
4. **空狀態**：當日無台灣球員賽事或休賽期 → 改顯示**本季/上季回顧卡**（每人季數據摘要＋近況一句話）＋**名詞知識入口輪播**（自名詞庫輪選）。

### 2.2 球員總覽 `/players`

- 每位 `tracked` 球員一列/卡：中英文名、目前隊伍＋層級、狀態一句（歸屬×健康組合，spec-01 B.2）、近況一句話。
- 可依層級/球隊篩選排序（client 端即可，資料量小）。`archived` 球員收在「歷史球員」折疊區。

### 2.3 球員個人頁 `/players/[id]`

依 requirements F1-2 五區：

1. **基本資料＋近況一句話**（顯眼處）；狀態一句組合顯示。
2. **球季數據**：自 2020 起，依球季分組、層級分節；**球季×層級×球隊分列＋層級合計列**（合計規則見 spec-01 C.7）。標準數據常駐；**進階數據（打/投各 7 項）**放次要位置/可展開，缺值不顯示；每個指標名可點入對應名詞頁（**雙向連結**，對應表見 spec-04 §D）。低階（1A 以下）數據旁固定顯示「低階層級數據僅供參考」。
3. **逐場成績**：最近 `RECENT_GAMES_N=10` 場 box line，打/投分表（二刀流兩表並列）。
4. **動態時間軸**：`transaction_events` 依時間倒序；每則含日期、類型徽章、描述。
5. **出賽預告＋下一個系列賽**：同 2.1 第 3 區規則；系列賽顯示對手、地點（`venue_name`）、`series_game_number/games_in_series`、最近幾場結果。
- **`archived` 球員**：僅顯示第 1 區（標「已離開美職體系」）＋生涯總成績表；隱藏 3~5 區。

### 2.4 名詞索引 `/glossary`

主題分類分組（spec-04 §B 的 category）：打擊進階／投球進階／標準數據／名單與規則。每則列中英文名＋一句白話。

### 2.5 名詞頁 `/glossary/[slug]`

三層結構由 MDX 模板強制（內容規格見 spec-04）：

1. **判讀（主）**：一句白話＋數值分布＋**級距表**——MLB/3A/2A 三欄（tab 或欄），級距標籤：及格/不錯/厲害/MVP 等級。
2. **定義算法（次，小字）**：中英文名、公式點到為止。
3. **延伸**：權威原始連結（MLB/Savant/FanGraphs）。
4. **範例球員回連**（自動挑選，spec-04 §E；挑不到整塊隱藏）。

## 3. 對外 API 合約（`/api/*`）

全部經 `lib/services`，Zod schema 即合約與測試斷言器。代表性形狀（欄位齊全版以 Zod 原始碼為準）：

```ts
// GET /api/home
{ digestDate: string /* 美國比賽日 YYYY-MM-DD */,
  gameCards: Array<{ playerId, nameZh, teamAbbrev, level,
    role: 'batting'|'pitching', line: {...單場精簡}, recentForm: string }>,
  events: Array<{ playerId, type, date, description }>,
  upcoming: Array<{ playerId, opponent, startTimeUtc,
    tag: 'probable_starter'|'possible'|'il' }>,
  emptyState: null | { seasonReviewCards: [...], glossaryPicks: [...] },
  dataUpdatedAt: string }

// GET /api/players → PlayerSummary[]
{ playerId, nameZh, nameEn, position, teamAbbrev, level,
  statusLine: string, recentForm: string, lifecycle: 'tracked'|'archived' }

// GET /api/players/:id → 上述 + seasons[]（分列+合計）、
//   gameLog: { batting: [...], pitching: [...] }（各 ≤10）、
//   timeline: [...]、upcoming: {...}
```

錯誤慣例：404（不在白名單）、500 帶 `{ error: string }`；不做版本前綴（v1 唯一版本）。

## 4. SEO / 分享

- `lang="zh-Hant"`；每頁 `<title>`＝「球員中文名（英文名）」或「名詞中文名（英文）」＋站名。
- `sitemap.xml`：全部球員頁（含 archived）＋全部名詞頁；`robots.txt` 開放。
- **Open Graph**：球員頁 `og:title`＝名字＋隊伍、`og:description`＝**近況一句話**、`og:image`＝球隊 logo（v1 不做動態合成圖）。名詞頁 og:description＝一句白話。

## 5. 資料新鮮度與韌性

- 每頁 footer 顯示「資料更新於 {台灣時間}」＝`sync_runs` 最近一筆非 failed 的 `finished_at`（spec-01 C.9）。
- Web 只讀 DB：ETL 失敗時繼續供既有內容（自然滿足「不因資料層問題整站不可用」）；不做對 ETL 的 health check 依賴。

## 6. 時區與格式

- DB 一律 UTC；顯示一律 **Asia/Taipei**（server 端以 `Intl`/`date-fns-tz` 格式化，避免 client 時區飄移）。
- 局數顯示：`ip_outs` → 「5.2 局」格式；比率顯示位數：AVG/OBP/SLG/OPS 三位小數、ERA/FIP 兩位、百分比一位。

## 7. Out of Scope（本 spec）

收藏「我的球員」（F1-4 低優先：實作時 localStorage＋名冊置頂，不動 API）；轉播/觀看資訊；深色模式；即時比分。

## 8. 測試決策與 Open Items

**測試**：以 seed DB 打 `lib/services` 與 `/api/*`，Zod parse 當斷言；重點案例——最新已結算比賽日的判定（含有比賽未 final 的日子）、二刀流球員的 gameLog 兩表、合計列重算、archived 球員的縮減回應、空狀態分支。頁面僅做 smoke（能 render、關鍵區塊存在）。

- [ ] ISR 是否升級為 ETL 完成後 on-demand revalidate（v2；需 ETL 呼叫 revalidate endpoint）
- [ ] OG 動態合成圖（v2）
