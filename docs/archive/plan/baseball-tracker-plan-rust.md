# 棒球球員追蹤網站 — 專案規劃

> **⚠️ 已封存（2026-07-23）**：Rust 後端方案已被 Node.js/Next.js 方案取代（見 `adr/decisions.md`），本文件僅留作發想背景，內容不再維護。

> 背景：開發者為 Android engineer，轉寫後端服務，主力語言選擇 Rust，並搭配 Python 處理資料 ETL。

## 1. 產品範疇

網站包含兩大功能面向：

1. **追蹤球員的比賽及數據** — 動態資料，需要定期從外部來源同步
2. **解釋現在棒球的規則及數據** — 靜態內容為主，變動頻率低

## 2. 技術選型

| 角色 | 語言/工具 | 原因 |
|---|---|---|
| Web 後端服務 | Rust (`axum` + `sqlx`) | 主力學習目標，型別安全 |
| 資料 ETL / 爬蟲 | Python | 主要資料源 `pybaseball` 為 Python 套件 |
| 資料庫 | PostgreSQL | 作為 Rust / Python 之間的整合邊界 |

## 3. 架構決策：用資料庫解耦，而非即時 API 呼叫

```
[Python] 定期 ETL（一天兩次，非常駐服務）
    ↓ 寫入
[Postgres] 賽程、球季數據、球員異動
    ↑ 讀取
[Rust] Web 服務 — 對外 API + 網頁渲染（含規則說明靜態頁）
```

**理由：**

- 比賽數據、球季統計、球員異動都不是秒級變動的資訊，用排程批次同步即可，不需要即時互相呼叫
- 避免 Rust 服務因為 Python 服務掛掉而跟著壞掉，兩邊可以獨立部署、獨立除錯
- 之後若 Python 端的資料來源或實作換掉，只要維持寫入 DB 的 schema 不變，Rust 端完全不受影響

## 4. 兩大功能對應的實作方式

### (1) 比賽 / 數據追蹤（動態內容）

- Python 排程腳本從外部資料源抓資料 → 正規化 → 寫入 Postgres（upsert）
- Rust 只負責讀取 DB、提供 JSON API 給前端

### (2) 規則 / 數據解釋（靜態內容）

- 內容以 Markdown 撰寫，Rust 端用 `pulldown-cmark` 轉 HTML，或搭配模板引擎（`askama` / `maud`）
- 不需要 Python、也不太需要資料庫，甚至可以在 build time 就把 Markdown 轉好存成 HTML，加快回應速度
- 建議前端先採用 Rust server-side render，避免額外引入 JS 框架的學習成本（規則說明頁對 SEO 也有利）

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
[Curated layer] 自訂、穩定的 schema，Rust 只讀這層
```

理由：上游資料格式（pybaseball 背後網站、Statcast 欄位）可能隨時變動，若 Rust 直接依賴原始欄位命名，上游一有變動網站就會壞掉。有 raw layer 的話，之後只要重寫轉換邏輯、reprocess 既有資料即可，不必重新抓一次。

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

## 9. Rust 技術選型

| 用途 | 建議 | 備註 |
|---|---|---|
| Web framework | `axum` | 生態成熟，與 tokio 整合佳 |
| DB | `sqlx` | Compile-time 檢查 SQL，寫錯欄位編譯期就會噴 |
| 模板 / 靜態頁 | `askama` 或 `maud` | Compile-time 檢查模板（`askama`） |
| Markdown 解析 | `pulldown-cmark` | 用於規則說明頁 |

## 10. 下一步 / Open Items

- [ ] 定案 curated layer schema 的完整欄位與型別
- [ ] 實測 MLB Stats API 的 transactions / roster 端點回傳格式
- [ ] Rust 端先用假資料把 API 串起來，與 Python ETL 平行開發
- [ ] 前端最終決定：SSR（Rust 模板）優先，之後視需求再局部導入 JS
- [ ] 若後續需要自建爬蟲補資料，先確認 pybaseball 是否真的缺少該欄位再動手
