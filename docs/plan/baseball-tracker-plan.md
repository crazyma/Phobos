# 棒球球員追蹤網站 — 專案規劃

> 背景：開發者為 Android engineer，轉寫後端服務，主力語言選擇 Node.js（TypeScript），並搭配 Python 處理資料 ETL。

## 1. 產品範疇

網站包含兩大功能面向：

1. **追蹤球員的比賽及數據** — 動態資料，需要定期從外部來源同步
2. **解釋現在棒球的規則及數據** — 靜態內容為主，變動頻率低

## 2. 技術選型

| 角色 | 語言/工具 | 原因 |
|---|---|---|
| Web 後端服務 | Node.js（TypeScript）+ Next.js | 主力學習目標；一套框架同時處理動態 JSON API 與靜態規則頁渲染 |
| 資料 ETL / 爬蟲 | Python | 主要資料源 `pybaseball` 為 Python 套件 |
| 資料庫 | PostgreSQL | 作為 Node.js / Python 之間的整合邊界 |

## 3. 架構決策：用資料庫解耦，而非即時 API 呼叫

```
[Python] 定期 ETL（一天兩次，非常駐服務）
    ↓ 寫入
[Postgres] 賽程、球季數據、球員異動
    ↑ 讀取
[Node.js / Next.js] Web 服務 — JSON API + 頁面渲染（含規則說明靜態頁）
```

**理由：**

- 比賽數據、球季統計、球員異動都不是秒級變動的資訊，用排程批次同步即可，不需要即時互相呼叫
- 避免 Web 服務因為 Python 服務掛掉而跟著壞掉，兩邊可以獨立部署、獨立除錯
- 之後若 Python 端的資料來源或實作換掉，只要維持寫入 DB 的 schema 不變，Web 服務端完全不受影響

## 4. 兩大功能對應的實作方式

### (1) 比賽 / 數據追蹤（動態內容）

- Python 排程腳本從外部資料源抓資料 → 正規化 → 寫入 Postgres（upsert）
- Node.js 服務透過 Next.js **Route Handlers**（`app/api/players/[id]/route.ts` 等）讀取 curated layer、回傳 JSON
- 球員數據頁面本身可用 **Server Component** 直接讀 DB 渲染，不必繞一層自己的 API；保留 Route Handler 是為了讓未來若有其他 client（例如日後想做的行動端 App）能共用同一組對外 API
- 資料查詢頻率低、讀多寫少，不需要額外的 cache 層，直接查 Postgres 即可

### (2) 規則 / 數據解釋（靜態內容）

- 內容以 **Markdown / MDX** 撰寫，透過 `@next/mdx` 在 **build time** 產生靜態頁（SSG）
- 完全不需要在 request time 查 DB，也不需要 Python 介入，對 SEO 與載入速度都最有利
- 內容更新時重新 build/deploy 即可；若之後需要更即時的內容更新（不想每次都重新部署），可改用 ISR（Incremental Static Regeneration）

## 5. 資料來源

### 5.1 pybaseball（主要來源）

- 涵蓋來源：Statcast / Baseball Savant、FanGraphs、Baseball-Reference、Retrosheet、Lahman Database
- 資料回傳格式：pandas DataFrame
- 涵蓋本專案需求：
  - 球季數據：`batting_stats()` / `pitching_stats()`
  - 球隊賽程 / 戰績：`schedule_and_record()`

**使用時需注意：**

| 事項 | 說明 |
|---|---|
| Cache 預設關閉 | 需手動呼叫 `pybaseball.cache.enable()`，否則每次都重新打上游 |
| Statcast 資料會事後修正 | 官方文件明確標註「even for prior seasons」，需 upsert 而非單純 append，並定期重抓近期資料 |
| 無內建 rate limit | 官方文件未提供速率限制建議，自行加保守的 delay，避免被上游 ban |
| Baseball-Reference 限制 | 一次請求只能查一個球季，需按球季分批 |

### 5.2 MLB Stats API（`statsapi.mlb.com`）

- **用途：球員異動（升降/交易）與傷兵名單 / roster 狀態** — 這塊 pybaseball 完全沒有涵蓋
- 本質是 JSON REST API（mlb.com 網站背後也是吃這個），比直接爬 mlb.com 網頁的 HTML 穩定許多
- 可透過社群套件 `MLB-StatsAPI`（`pip install MLB-StatsAPI`）存取，或直接呼叫 `https://statsapi.mlb.com/api/v1/...`
- 實作前建議先花時間實測 transactions / roster 端點的確切參數與回傳格式（無正式官方文件）

### 5.3 自建爬蟲（保留、非必要立刻做）

- 原先設想用來補 mlb.com / FanGraphs / Savant 缺漏資料
- 因球員異動與傷兵名單已改用 MLB Stats API 解決，自建爬蟲的必要性大幅降低
- 若之後真的發現 pybaseball 缺少特定欄位，再評估是否需要，且應優先尋找是否有結構化 API 可用，避免 HTML 爬蟲

## 6. 目前版本的範疇決策

> ⚠️ 已更新：原「只做 season-level」已被 requirements 修正——v1 需**加入 game-log（逐場）層**（供逐場成績、近況一句話、首頁 24h 賽果、出賽預告）。最新資料粒度與 schema 見 `spec/spec-01-scope-and-data-model.md`（A.6、B.8~B.11）。

- **先只做球季層級（season-level）數據**，Statcast 逐球（pitch-level）資料之後再加
  - 理由：pitch-level 資料量大（單季 70 萬+ 顆球）、且修正頻繁，先做穩定、資料量可控的部分
- **更新頻率：一天兩次**
  - 早上一次：前一天比賽結算穩定後，同步賽果、更新球季累計數據
  - 傍晚一次：當日開打前，同步當日賽程、球員異動與傷兵名單（這類消息常常臨開賽前才公布）
- 兩支獨立 cron job / systemd timer 即可，不需要 APScheduler 等常駐排程服務

## 7. 資料庫設計

### 7.1 分層：Raw layer vs Curated layer

```
[Raw layer]    儲存從 pybaseball / MLB Stats API 拿到的原始資料（接近原始欄位）
     ↓ 轉換 / 正規化
[Curated layer] 自訂、穩定的 schema，Node.js 服務只讀這層
```

理由：上游資料格式（pybaseball 背後網站、Statcast 欄位）可能隨時變動，若 Node.js 服務直接依賴原始欄位命名，上游一有變動網站就會壞掉。有 raw layer 的話，之後只要重寫轉換邏輯、reprocess 既有資料即可，不必重新抓一次。

### 7.2 Curated schema 草案

| 資料表 | 說明 |
|---|---|
| `teams` | 球隊基本資料 |
| `players` | 球員基本資料 |
| `games` | 賽程與比賽結果（來自 `schedule_and_record`） |
| `season_batting_stats` | 球員球季打擊數據 |
| `season_pitching_stats` | 球員球季投手數據 |
| `transactions` | 球員異動（callup / send_down / trade / waiver / released…），含 `player_id`、`team_id`、`date`、`type`、`description` |
| `roster_status` | 球員名單狀態歷史（active / il_10 / il_60 / minors…），**存歷史紀錄而非只存目前狀態**，方便呈現異動時間軸 |

## 8. ETL / 爬蟲設計原則

1. **各資料來源獨立成模組 / 腳本**（pybaseball ETL、MLB Stats API 同步），避免一個來源出問題拖累整條 pipeline
2. **Upsert 而非單純 append**，因為 Statcast（未來加入時）與球季數據都有事後修正的可能
3. 若未來真的需要自建 HTML 爬蟲，保持最小範圍，並優先確認是否有結構化 API 可替代
4. 爬蟲 / API 呼叫都要有基本的錯誤處理與 log，單一來源失敗時跳過並記錄，不讓整個排程中斷

## 9. Node.js 技術選型

| 用途 | 建議 | 原因 |
|---|---|---|
| 全端框架 | `Next.js`（App Router） | 同時處理動態 JSON API（Route Handlers）與靜態規則頁（SSG/ISR），是目前 Node 生態中最常見、最成熟的全端方案 |
| 語言 | TypeScript | 型別安全，搭配 ORM 的 schema 型別推導，減少執行期才發現的欄位錯誤 |
| ORM / Query builder | `Drizzle ORM` | TypeScript-first，寫法貼近 SQL、型別從 schema 直接推導，適合本專案偏唯讀查詢、且需要清楚 migration 版控的情境 |
| API 輸入驗證 | `Zod` | 驗證 Route Handler 的參數與環境變數，型別可直接從 schema 推導出來 |
| Markdown / MDX 渲染 | `@next/mdx` | 規則說明頁內容以 Markdown/MDX 撰寫，build time 產生靜態 HTML |
| 部署 | Vercel 或自架 Node server（`next start`） | Next.js 原生支援，SSG 頁面可搭配 CDN，起步階段免運維 |

## 10. 下一步 / Open Items

- [ ] 定案 curated layer schema 的完整欄位與型別
- [ ] 實測 MLB Stats API 的 transactions / roster 端點回傳格式
- [ ] Next.js 端先用假資料把 Route Handler 與頁面串起來，與 Python ETL 平行開發
- [ ] 規劃哪些頁面用 SSG（規則頁）、哪些用動態渲染 / Server Component（球員數據頁）
- [ ] 若後續需要自建爬蟲補資料，先確認 pybaseball 是否真的缺少該欄位再動手
