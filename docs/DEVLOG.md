# 開發日誌 — 台灣球員大聯盟網站（Phobos）

> 記錄進度：已完成（含日期）、進行中/下一步、待決問題、未來 phase。
> 文件位置慣例（皆在 `docs/` 下）：`plan/` = 發想脈絡；`adr/` = 技術決策記錄；`spec/` = 照著能建的規格。路徑引用以 `docs/` 為根。

---

## ✅ 已完成

### 2026-07-21

- [x] 比對兩份規劃文件（`plan/棒球網站技術選型討論.md` vs `plan/baseball-tracker-plan.md`），整理相同 / 不同之處
- [x] 收斂三項分歧決策：
  - 後端走 **Next.js 全包**，但保留 `lib/services` 分層以利未來抽離（不另起 NestJS）
  - 功能範疇 **以 1、2 為主，設計上預留 3（新聞）、4（專欄）**
  - UI 採 **shadcn/ui + Tailwind**
- [x] 產出技術決策記錄 `adr/decisions.md` / `.html`（原 `final-spec` 改名，改為 ADR 定位）
- [x] 釘死 **Spec 01：台灣球員範疇 + 資料模型** `spec/spec-01-scope-and-data-model.md` / `.html`
  - 名單 = 手動白名單表（`players` 為 source of truth，birthCountry 只當種子）
  - 成績涵蓋 **MLB + 3A / 2A**；roster/異動涵蓋所有層級
  - 球季數據 **從 2020 起**（`SEASON_BACKFILL_START` 設定值，未來可 backfill）
  - 8 張 curated 表 + enums + upsert key + Drizzle 範本；正規主鍵 `mlb_player_id`
- [x] 建立 `spec/` 目錄，與 `plan/` 分開
- [x] 文件重整：全部收進 `docs/`，並拆出 `docs/adr/`（`decisions.*` 移入）；更新交叉引用路徑（以 `docs/` 為根）
- [x] 建立根目錄 `CLAUDE.md`，定義工作流程與目錄慣例（DEVLOG 更新規範、md↔html 同步、plan/adr/spec 用途）
- [x] 寫 md→html 產生器 `scripts/build_docs.py`（零依賴，保留 data-num 編號、響應式表格、arch-diagram、待辦清單）
- [x] 設定 PostToolUse hook（`scripts/sync_docs_hook.py` + `.claude/settings.json`）：存檔 `docs/**/*.md` 後自動同步 `.html`
- [x] 建立產品需求文件 `docs/requirements.md`（PRD，從產品／服務面描述，比 decisions 更具體）；含 7 項待你定調的產品決策
- [x] 調整層級範疇：成績從「MLB + 3A/2A」擴大為**能抓到資料的所有層級**（含 1A、新人聯盟，best-effort）；理由：多數台灣球員在低階層級。同步更新 spec-01、requirements
- [x] 收斂 3 項 PRD 產品決策（客群=關注型優先兼顧、圖像=只放球隊 logo、數據深度=分情境分層）；數據深度定案：今日快訊單場精簡、球員頁標準+6 打者/6 投手進階（可調整清單），WHIP 歸標準層。寫進 requirements §7、§9
- [x] 首頁形態定案：**動態導向**（最近 24h 賽果+動態為主、即將發生為次；名冊改放全域導覽入口）。順帶定了 IA 骨架。寫進 requirements §5 F1-0、§9.1
- [x] F2 名詞內容定案：數據名詞優先、逐步累積、AI 輔助+校訂；單頁**解讀優先**三層結構（判讀/級距為主 → 定義算法小字 → 權威原始連結）；與球員數據雙向連結。寫進 requirements §5 F2、§9.1
- [x] 收尾雙語（中文為主+英文名輔助）、通知訂閱（列 future）；**PRD §9 待定清空、requirements 定稿**

---

## ▶️ 進行中 / 下一步

- [ ] **（Spec 02 前置）重新檢討 `requirements.md`**——整體再看一遍，確認產品需求有無要調整/補強，再往下開規格
- [ ] **Spec 02：頁面 / 路由 IA + 對外 API 合約**（endpoint、參數、回傳 JSON 形狀 = Zod schema 的雛形）
- [ ] 定案 curated schema 的完整欄位型別（把 Spec 01 補成完整 Drizzle schema）
- [ ] `players` 白名單種子腳本 + 首版 Drizzle migration
- [ ] Next.js 端用假資料把 `lib/services` → Route Handler → 頁面串起來（與 Python ETL 平行開發）
- [ ] 規劃哪些頁走 SSG（規則頁）、哪些動態渲染 / Server Component（球員數據頁）
- [ ] 導入 shadcn/ui + Tailwind，建立基礎「笨元件」

---

## ❓ 待決問題（來自 Spec 01 Open Items）

- [ ] 進階數據要顯示到多細？（只 slash line + HR/RBI，還是含 wRC+ / FIP…）— 影響落庫欄位
- [ ] **時區**：`games.date` 與 ETL 排程時間怎麼統一（美東賽事 vs 台灣時間）— 傾向存 UTC + 顯示端轉換
- [ ] 小聯盟成績資料源細節：StatsAPI `sportId=11/12` 端點回傳欄位與 pybaseball 欄位對齊表
- [ ] 實測 MLB Stats API 的 `transactions` / `roster` 端點回傳格式，確認 `transaction_type` 列舉是否齊全
- [ ] `players` 白名單維護方式：先手動改 DB / 種子腳本，還是要簡單後台？（v1 先腳本）

---

## 🔮 未來 Phase（先記著，這版不做）

- [ ] backfill 2020 年以前的歷史球季數據
- [ ] Statcast 逐球（pitch-level）數據
- [ ] 功能 3：爬取官網 / 社群新聞（DB 已預留 `news` domain 邊界）
- [ ] 功能 4：專欄 / 寫手（DB 已預留 `articles` + `authors` domain 邊界）
- [ ] 視需要把 `lib/services` 抽成獨立後端服務

---

## 🗂️ 雜項 / 待整理

- [ ] `plan/baseball-tracker-plan-rust.md` / `.html` 已被 Node.js 方案取代，確認是否清理或封存
