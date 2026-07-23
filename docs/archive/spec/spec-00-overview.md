# Spec 總覽 — 台灣球員大聯盟網站

<!--badges: 類型=spec 索引/地圖; 上游=requirements.md; 用途=一眼看清 spec 切分-->

> **⚠️ 已封存（2026-07-23）**：本 spec 已作廢——新 spec 將依 `requirements.md`（含 2026-07-23 拍板；模型見 `plan/domain-regrill-2026-07-23.md`）從零重建。本文僅供查閱既有實作細節（端點、欄位、時區方案…），內容不再維護。

> `spec/` 的入口地圖：整份規格預計切成哪幾塊、各做什麼、狀態與依賴。每完成一份 spec 回來更新狀態。上游是 `../requirements.md`（產品需求）與 `../adr/decisions.md`（技術決策）。

---

## 1. Spec 清單

| Spec | 主題 | 做什麼 | 狀態 |
|---|---|---|---|
| **spec-01** | 範疇 + 資料模型 | 台灣球員範疇、層級、資料粒度（season / game-log）、curated schema、raw 分層 | 🟡 大致完成（進階數據欄位待補齊） |
| **spec-02** | 頁面 / 路由 IA + 對外 API 合約 | sitemap 與路由、每頁顯示什麼、渲染策略、對外 API endpoint 與回傳 JSON（Zod）、時區顯示、OG／分享 | 🟡 初稿（有 6 項 open items） |
| **spec-03** | ETL / 資料同步管線 | Python 端各資料源模組、raw→curated 轉換、upsert、一天兩次排程、錯誤處理、近況一句話生成、時區存 UTC | 🟡 初稿（有 6 項 open items） |
| **spec-04** | 名詞 / 知識庫（F2） | MDX 內容系統、單頁「解讀優先」三層模板、分類、與球員數據雙向連結、起手 20~30 則清單 | ⬜ 未開始 |

狀態圖例：✅ 完成｜🟡 大致完成／有待補｜⬜ 未開始

---

## 2. 各 Spec 範圍

### spec-01 — 範疇 + 資料模型（🟡）
- 台灣球員白名單、涵蓋層級（MLB→新人聯盟 best-effort）、時間範圍（2020 起）。
- 資料粒度：season 累計、**game-log 逐場**（pitch-level 為未來）。
- curated schema：`players` / `teams` / `season_*_stats` / `game_*_stats` / `roster_status` / `transactions` / `games` / `player_recent_form`；raw 分層。
- **待補**：B.4/B.5 進階數據欄位補齊（對應 requirements §7.3 的打投各 7 項）。

### spec-02 — 頁面 / 路由 IA + 對外 API 合約（🟡 初稿）
- **IA / 路由**：首頁（動態導向）、球員總覽、球員頁、名詞頁；全域導覽（top/side bar）放名冊與名詞入口。
- **每頁顯示什麼**：對照 requirements F1-0~F1-4、F2。
- **渲染策略**：名詞頁 SSG；球員數據頁 Server Component 直讀 DB；首頁動態視情況 SSR/ISR。
- **對外 API 合約**：Route Handlers 的 endpoint、參數、回傳 JSON 形狀（= Zod schema 雛形）。
- **橫向**：時區顯示（台灣時間）、OG／分享 metadata、空狀態／休賽期畫面。

### spec-03 — ETL / 資料同步管線（🟡 初稿）
- **資料源模組**（各自獨立）：pybaseball 球季數據；MLB Stats API 的 gamelog / schedule（含先發預告、開賽時間、場地）/ transactions / roster。
- raw→curated 轉換與 **upsert**；一天兩次 cron / systemd timer；單源失敗跳過並記 log。
- **近況一句話生成**：由 game-log 歸納（連續紀錄／單場亮點／生涯新高…）寫入 `player_recent_form`。
- 時區：一律存 UTC。

### spec-04 — 名詞 / 知識庫（⬜）
- MDX 內容系統、`@next/mdx` build-time SSG。
- 單頁「解讀優先」三層：判讀／級距 → 定義算法小字 → 權威原始連結。
- 主題分類、與球員頁數據雙向連結、起手 20~30 則（打投各 7 項進階為必做核心）。

---

## 3. 橫向項目的歸屬（避免無家可歸）

| 橫向項目 | 生成／儲存 | 呈現 |
|---|---|---|
| 近況一句話 | spec-03（ETL 算） | spec-02（球員頁、首頁快訊） |
| 時區 | spec-03（存 UTC） | spec-02（轉台灣時間顯示） |
| 出賽預告 | spec-03（同步策略／新鮮度） | spec-02（版面） |
| 進階數據欄位 | spec-01（補齊 B.4/B.5） | spec-02 呈現、spec-04 解釋 |

---

## 4. 依賴關係

```
spec-01（資料底層） ──┬──► spec-02（前端 / API）   ← 可平行
                      └──► spec-03（ETL）           ← 可平行
spec-04（名詞庫） ── 幾乎獨立，隨時可做
```

- spec-02、spec-03 都建在 spec-01 之上，可平行推進。
- spec-04 幾乎不依賴其他 spec，可獨立進行。

---

## 5. 更新慣例

- 每份 spec 命名 `spec-NN-<slug>.md`；本總覽的「狀態」欄與 §1 清單在對應 spec 有進展時回來更新。
- 新增橫向需求時，先在 §3 決定它的歸屬，避免散落。
