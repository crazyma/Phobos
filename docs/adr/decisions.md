# 台灣球員大聯盟網站 — 技術決策記錄（Decisions / ADR）

<!--badges: 前端=Next.js 全包; ORM=Drizzle; 驗證=Zod; UI=shadcn/ui + Tailwind; DB=PostgreSQL; ETL=Python-->

> 本文件整併 `棒球網站技術選型討論.md`（框架選型）與 `baseball-tracker-plan.md`（落地規劃）兩份思考，收斂三項分歧後記錄「選什麼、為什麼」。欄位級規格見 `spec/`（2026-07-23 重建版，入口 `spec/spec-00-overview.md`；舊版封存於 `archive/spec/`）。
>
> 開發者背景：Android engineer 轉後端，主力語言 Node.js（TypeScript），搭配 Python 處理資料 ETL。

---

## 1. 產品範疇

**這一版實作（功能 1、2）**

1. **台灣球員大聯盟數據追蹤**（動態）— 打擊/投球數據、球員基本資料、個人動態（賽程、傷兵、升降/交易）。需定期從外部同步。
2. **現代棒球規則/名詞介紹**（靜態為主）— 變動頻率低。

**設計上預留、這版不實作（功能 3、4）**

3. 爬取官網/社群新聞並呈現。
4. 專欄功能（寫手發布文章、規則更新消息）。

> 範疇決策：**先做 1、2**，但 DB schema 與後端分層要**預留 news / articles 的 domain 邊界**，讓功能 3、4 之後能加得乾淨，不用大重構。

---

## 2. 技術選型（定案）

| 角色 | 選擇 | 原因 |
|---|---|---|
| 全端框架 | **Next.js（App Router）+ TypeScript** | 一套框架同時處理動態 JSON API（Route Handlers）與靜態規則頁（SSG/ISR）；SEO 佳 |
| ORM / Query builder | **Drizzle ORM** | TypeScript-first、寫法貼近 SQL、型別從 schema 推導；適合偏唯讀查詢 + 清楚的 migration 版控 |
| 輸入 / 環境變數驗證 | **Zod** | 驗證 Route Handler 參數與 env，型別可從 schema 推導 |
| Markdown / MDX | **@next/mdx** | 規則說明頁以 Markdown/MDX 撰寫，build time 產生靜態 HTML |
| UI | **shadcn/ui + Tailwind** | 元件原始碼複製進專案（是「你的程式碼」）、最好替換；配合分層設計彈性大 |
| 資料庫 | **PostgreSQL** | 結構化、關聯性強；作為 Node 與 Python 之間的整合邊界 |
| 資料 ETL / 爬蟲 | **Python** | 主要資料源 `pybaseball` 為 Python 套件 |
| 部署 | **Vercel 或自架 `next start`** | Next.js 原生支援，SSG 頁面可搭 CDN，起步階段免運維 |

> 後端**不另起 NestJS**。初期用 Next.js 全包，但刻意把 business logic / 資料存取分層封裝（見 §4），未來若功能 3、4 複雜度長出來，可把 `lib/services` 抽成獨立服務。

---

## 3. 系統架構：用資料庫解耦

```
[Python] 定期 ETL（一天兩次，非常駐服務）
    ↓ 寫入
[Postgres] 賽程、球季數據、球員異動、傷兵名單
    ↑ 讀取
[Node.js / Next.js] Web 服務 — JSON API + 頁面渲染（含規則說明靜態頁）
```

**理由**

- 比賽數據、球季統計、球員異動都非秒級變動，排程批次同步即可，不需即時互相呼叫。
- Web 服務不會因 Python 服務掛掉而跟著壞；兩邊可獨立部署、獨立除錯。
- 之後若 Python 端資料源或實作換掉，只要維持寫入 DB 的 schema 不變，Web 服務端完全不受影響。

---

## 4. 後端分層（保留未來抽離空間）

```
app/
  api/            ← Route Handlers（對外 JSON API，供未來行動端等其他 client 共用）
  (pages)/        ← Server Components 直接讀 DB 渲染
lib/
  services/       ← business logic（跟框架解耦；未來要抽 NestJS，搬這層即可）
  db/             ← Drizzle schema + queries
```

**原則**

- **分層是重點，不是選哪個框架**：business logic 不該知道 UI 長怎樣（MVI 概念 — UI 只是 state 的投影）。
- 資料抓取、狀態管理獨立成 custom hooks / server components；UI 元件盡量「笨」（只接 props、發事件）。
- 頁面 / Route Handler 不直接寫 business logic，一律透過 `lib/services`。
- 維持這條界線，日後換 UI 樣式/元件庫或抽出後端服務，動到的範圍都被限制住。

---

## 5. 兩大功能的實作方式

### (1) 比賽 / 數據追蹤（動態）

- Python 排程腳本抓外部資料 → 正規化 → upsert 進 Postgres。
- 球員數據頁用 **Server Component 直接讀 DB（curated layer）** 渲染。
- 同時保留 **Route Handlers**（`app/api/players/[id]/route.ts` 等）對外提供 JSON API，讓未來其他 client（如行動端 App）共用同一組對外 API。
- 讀多寫少、查詢頻率低，**初期不加 cache 層**，直接查 Postgres。

### (2) 規則 / 名詞介紹（靜態）

- 內容以 **Markdown / MDX** 撰寫，透過 `@next/mdx` 於 **build time** 產生 SSG 靜態頁。
- request time 不查 DB、不需 Python 介入，對 SEO 與載入速度最有利。
- 內容更新重新 build/deploy 即可；若要免重部署更新，改用 **ISR**。

---

## 6. 資料來源

### 6.1 pybaseball（~~主要來源~~ → 僅 Savant/Statcast 接口可用，見 §6.4）

- 涵蓋：Statcast / Baseball Savant、FanGraphs、Baseball-Reference、Retrosheet、Lahman。回傳 pandas DataFrame。
- ~~本專案用到：球季數據 `batting_stats()` / `pitching_stats()`；球隊賽程 / 戰績 `schedule_and_record()`~~ ← **實測不可用**：這兩路分別走 FanGraphs / Baseball-Reference 的 HTML 爬蟲，兩站已上 Cloudflare 防護，一律回 **403**（2026-07-23 實測，見 §6.4）。

| 注意事項 | 說明 |
|---|---|
| Cache 預設關閉 | 需手動 `pybaseball.cache.enable()`，否則每次都重打上游 |
| Statcast 會事後修正 | 官方標註「even for prior seasons」→ 需 **upsert 而非 append**，並定期重抓近期資料 |
| 無內建 rate limit | 自行加保守 delay，避免被上游 ban |
| Baseball-Reference 限制 | 一次只能查一個球季，需按球季分批 |

### 6.2 MLB Stats API（`statsapi.mlb.com`）

- **用途：球員異動（升降/交易）與傷兵名單 / roster 狀態** — pybaseball 未涵蓋。
- 本質是 JSON REST API（比爬 mlb.com HTML 穩定）。
- 可用社群套件 `MLB-StatsAPI`（`pip install MLB-StatsAPI`）或直接呼叫 `https://statsapi.mlb.com/api/v1/...`。
- 實作前先實測 transactions / roster 端點的確切參數與回傳格式（無正式官方文件）。

### 6.3 自建爬蟲（保留，非必要立刻做）

- 原設想補 mlb.com / FanGraphs / Savant 缺漏；因異動與傷兵改用 MLB Stats API，必要性大幅降低。
- 若日後發現 pybaseball 缺特定欄位再評估，且**優先找結構化 API**，避免 HTML 爬蟲。

### 6.4 來源可用性實測與修正（2026-07-23 定案）

實測結果與由此收斂的來源策略：

| 發現 | 內容 |
|---|---|
| **FanGraphs / Baseball-Reference 不可用** | pybaseball 對這兩站走 HTML 爬蟲，兩站已上 **Cloudflare 防護**，一律回 403；短期無解，不嘗試繞過 |
| **可用來源只剩兩個** | **MLB Stats API**（`statsapi.mlb.com/api/v1/`）＋ **pybaseball 的 Savant/Statcast 接口** |
| **更新速度差異** | MLB API 更新**快**、Savant **較慢** |
| **MLB API 有累積數據** | 直接提供至今累積 AVG／ERA／OPS 等，不必自己從逐場加總 |

**決策**：

- **以 MLB Stats API 為主**：賽程/賽果、box score、**累積季數據**、異動、roster/IL 全走它。
- **Savant（經 pybaseball）為輔**：只補 Statcast 系進階數據（xwOBA 等）；因更新較慢，允許落後主資料一批（best-effort）。
- **後果（同日實測後更新）**：FanGraphs 系指標改由 **StatsAPI `stats=sabermetrics`** 供應——打 `woba/wRcPlus/war`、投 `fip/xfip/war`，為 MLB 官方自算版本（與 FanGraphs 同量級、非同值）；**僅 MLB 層級**（小聯盟進階維持 best-effort NULL）、2020~ 可回查。SIERA 仍無來源。實測紀錄見 spec-03 §9、應變決策見 requirements §9.1。

---

## 7. 版本範疇與更新頻率

- **先只做球季層級（season-level）數據**；Statcast 逐球（pitch-level，單季 70 萬+ 顆、修正頻繁）之後再加。
- **更新頻率：一天兩次**
  - 早上：前一天比賽結算穩定後，同步賽果、更新球季累計。
  - 傍晚：當日開打前，同步當日賽程、球員異動與傷兵名單（常臨開賽前才公布）。
- **兩支獨立 cron job / systemd timer 即可**，不需 APScheduler 等常駐排程服務。

---

## 8. 資料庫設計

### 8.1 分層：Raw layer vs Curated layer

```
[Raw layer]     儲存 pybaseball / MLB Stats API 的原始資料（接近原始欄位）
     ↓ 轉換 / 正規化
[Curated layer] 自訂、穩定的 schema，Node.js 服務只讀這層
```

理由：上游格式可能隨時變動；有 raw layer，之後只要重寫轉換邏輯、reprocess 既有資料即可，不必重抓。

### 8.2 Curated schema 草案

| 資料表 | 說明 |
|---|---|
| `teams` | 球隊基本資料 |
| `players` | 球員基本資料 |
| `games` | 賽程與比賽結果（來自 `schedule_and_record`） |
| `season_batting_stats` | 球員球季打擊數據 |
| `season_pitching_stats` | 球員球季投手數據 |
| `transactions` | 球員異動（callup / send_down / trade / waiver / released…），含 `player_id`、`team_id`、`date`、`type`、`description` |
| `roster_status` | 球員名單狀態歷史（active / il_10 / il_60 / minors…），**存歷史紀錄而非只存目前狀態**，方便呈現異動時間軸 |

> **為功能 3、4 預留**（這版不建、僅標記邊界）：`news`（新聞爬取）、`articles` + `authors`（專欄/寫手）。屆時新增獨立 domain 與資料表，不動既有 curated schema。

---

## 9. ETL / 爬蟲設計原則

1. **各資料來源獨立成模組 / 腳本**（pybaseball ETL、MLB Stats API 同步），避免單一來源出問題拖累整條 pipeline。
2. **Upsert 而非 append**（Statcast 未來加入時與球季數據都可能事後修正）。
3. 若未來需自建 HTML 爬蟲，保持最小範圍，並優先確認是否有結構化 API 可替代。
4. 爬蟲 / API 呼叫都要有基本錯誤處理與 log；單一來源失敗時跳過並記錄，不讓整個排程中斷。

---

## 10. 下一步 / Open Items

- [ ] 定案 curated layer schema 的完整欄位與型別（Drizzle schema）。
- [ ] 實測 MLB Stats API 的 transactions / roster 端點回傳格式。
- [ ] Next.js 端先用假資料把 `lib/services` → Route Handler → 頁面串起來，與 Python ETL 平行開發。
- [ ] 規劃哪些頁面 SSG（規則頁）、哪些動態渲染 / Server Component（球員數據頁）。
- [ ] 導入 shadcn/ui + Tailwind，建立基礎 UI 元件（維持「笨元件」原則）。
- [ ] 若後續需自建爬蟲補資料，先確認 pybaseball 是否真的缺該欄位再動手。
