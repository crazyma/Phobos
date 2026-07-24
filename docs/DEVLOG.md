# 開發日誌 — 台灣球員大聯盟網站（Phobos）

> 記錄進度：已完成（含日期）、進行中/下一步、待決問題、未來 phase。
> 文件位置慣例（皆在 `docs/` 下）：`plan/` = 發想脈絡；`adr/` = 技術決策記錄；`spec/` = 照著能建的規格。路徑引用以 `docs/` 為根。

---

## ✅ 已完成

### 2026-07-23

- [x] **票 01（bootstrap 資料層骨架）實作完成**（`.scratch/curated-schema-and-seed/issues/01`）：pnpm+TS+Drizzle+drizzle-kit+vitest 骨架、`docker-compose.yml`（Postgres 16）、`lib/db`（client+空 schema barrel）、`scripts/db/migrate.ts`、連線 smoke test 通過、`db:migrate` 對全新 DB 乾淨 no-op、README 啟動步驟。本機無 Docker→smoke test 走 homebrew pg（連線字串與 docker 共用）；pnpm 11 build 核准移至 `pnpm-workspace.yaml`
- [x] **票 02（curated schema + 首版 migration）實作完成**：spec-01 §C 全 12 表 + 11 enum 以 Drizzle 定義（`lib/db/schema/` 分 6 檔）、20 FK、複合主鍵、只存不可推導比率；`drizzle/0000_*.sql` 對全新 DB 乾淨套用；schema introspection 測試 6 案例全綠（TDD：先 red 後 green，斷言取自 spec）
- [x] **票 03（players 白名單 seed）實作完成**：`lib/db/seed/players.ts` 的 `taiwanesePlayers` 為白名單事實來源，`pnpm db:seed` 幂等 upsert（保留 lifecycle/created_at）；seed 測試 2 案例綠。**白名單起手 5 人**（2026-07-24 自 StatsAPI 抓）：鄭宗哲/Tsung-Che Cheng、Stuart Fairchild、李灝宇/Hao-Yu Lee、林昱珉/Yu-Min Lin、鄧愷威/Kai-Wei Teng；Fairchild 台裔美生印證「birthCountry 非準則」。**完整白名單與部分中文名待上線前補**。schema+seed slice（3 票）全部完成。中文名經人工校對確認（鄭宗哲、史都華·費爾柴德）
- [x] **/grill-with-docs：僅以 `requirements.md` 為輸入重新做領域分析**（刻意不參考既有 spec/adr），四輪訪談拍板 14 項決策：
  - 模型骨架：名單狀態拆**歸屬×健康**兩軸、**事件為真相來源（狀態＝投影）**；季數據＝球季×層級×球隊＋層級合計列；逐場＝球員×比賽×**角色**（野手投球/二刀流可並存）
  - 語意收斂：先發預告（投手確定/野手一律「可能出賽」，F1-2 已修正）、首頁 24h＝最新已結算**美國比賽日**、生涯新高照稱（接受 2020 起算誤差）、近況一句話＝優先序＋狀態 fallback（永不為空）
  - 邊界：白名單退場＝**精簡存檔頁**；名詞級距只做 MLB/3A/2A（低階給警語）；換進階指標**名詞頁先行**；範例回連自動挑、挑不到隱藏；回填＝季累計整季重拉＋逐場回看 7~14 天
  - 空狀態定案：本季/上季回顧卡＋名詞知識入口輪播（**§9.2 待定清空**）
  - 產出：requirements §9.1 新增 2026-07-23 區塊＋F1-0/F1-2/§9.2 修正；模型全文 `plan/domain-regrill-2026-07-23.md`
- [x] **封存舊文件**：定調 spec 與既有內容脫鉤、依 requirements 從零重建——`spec/` 整組移至 `archive/spec/`、`plan/baseball-tracker-plan-rust.*` 移至 `archive/plan/`（各檔加已封存 banner），更新 requirements／plan／adr／CLAUDE.md 交叉引用
- [x] **重建 spec（/to-spec）**：以 requirements＋plan（domain-regrill）＋adr 為輸入，全新寫出 5 份——
  - `spec-00-overview`（切分/依賴/需求追溯表/測試策略：主接縫=Postgres curated schema、次接縫=`lib/services`、純函式=投影+一句話引擎；全域常數 N=10、lookback=10 天）
  - `spec-01-domain-and-data-model`（生命週期、事件溯源狀態機、欄位級 curated schema：兩張 game line 表、季數據含球隊維度、只存不可推導比率）
  - `spec-02-ia-and-api`（路由/五頁規格/Zod API 合約/OG/SEO/ISR 1800s/台灣時間）
  - `spec-03-etl-pipeline`（早晚批職責、來源→表、sportId 對照、一句話規則引擎表、roster 對帳不自動改投影、CLI 手動工具）
  - `spec-04-glossary-content`（26 則起手清單、frontmatter schema、三組級距編制、registry build-fail 強制名詞頁先行、範例回連規則）
  - regrill §10 檢查清單全數涵蓋核對完畢；requirements/adr/plan 交叉引用改指新 spec
- [x] **記錄資料源實測 issue 並修訂文件**：pybaseball 的 FanGraphs/Baseball-Reference 接口因 Cloudflare 一律 403（僅 Savant 接口可用）；MLB API 更新較快且直接提供累積數據 → 定案「**MLB Stats API 為主、Savant 為輔**」寫入 adr §6.4；spec-03 §3 來源對照與 spec-01 C.7 連動修訂；wRC+/WAR（FanGraphs 系）暫無來源列 open item（spec-03 §9）
- [x] **小 grilling：進階數據來源應變定案**（requirements §9.1 決策樹）——①先實測 StatsAPI `stats=sabermetrics`（命中全解）；②未命中預案：打者頭號欄**遞補鏈 wRC+→xwOBA→wOBA**（退至 wOBA 清單縮 6）、**WAR 移除不補**、口袋替補換血（K-BB%/xERA/WHIP，原 xFIP/SIERA 同為 403 系）；③名詞頁不連動：wRC+/WAR 照寫當純知識、xwOBA 進清單時名詞頁先行。spec-01（xwoba 預留欄）/spec-03（實測任務規格）/spec-04（連動注記）同步修訂
- [x] **實測 `stats=sabermetrics` → 命中，預案封存**：hitting 供 `woba/wRc/wRcPlus/war`、pitching 供 `fip/fipMinus/xfip/war/eraMinus`；**僅 MLB 層級**（三位台灣球員 2025 AAA 對照：season 有 split、sabermetrics 回空）；2020~ 可回查；抽樣 Judge 2024 與 FanGraphs 同量級（MLB 官方自算版本）。→ 維持進階清單、口袋 xFIP 復活（SIERA 仍除名）；requirements §7.3/§9.1、adr §6.4、spec-01 C.7/§F、spec-03 §3/§9 收斂為定案版

### 2026-07-22

- [x] `scripts/build_docs.py` 加上**側邊欄目錄（TOC）**：自動從 `##`/`###` 標題產生 sticky 左側導覽，可快速前往章節
  - 每個 `<h2>`/`<h3>` 加錨點 id（`sec-N` / `sec-N-M`），h3 以子清單巢狀呈現、h2 保留章節編號徽章
  - IntersectionObserver 標示目前章節；`scroll-behavior: smooth` 平滑捲動
  - 響應式：960px 以下側邊欄收合為頂部 `<details>`（手機預設收合），沿用既有明暗主題變數
  - 已全量重建現有 8 份文件的 `.html`
- [x] **（Spec 02 前置）重新檢討 requirements**——從使用者角度壓力測試，補強/收斂多項並寫進 PRD：
  - 新增：出賽預告（先發明顯標示 + 台灣時間）、**近況一句話**（≤20 字自動生成，球員頁+首頁快訊）、逐場成績 game log、社群分享（OG）、收藏我的球員（低優先）、首頁空狀態
  - 收斂：賽程 → 至少「下一個系列賽（對手/地點）」；進階數據定位為「重要但非 v1 首要，可延續下一 phase」（名詞解釋維持核心）
  - 深色模式留待設計階段；§9.2 新增待定：休賽期空狀態內容
- [x] 依調整後 requirements 重審 dev plan 技術：**語言/核心套件不用改**，真正變的是資料範疇——**新增 game-log（逐場）層**
  - spec-01 補：A.6 資料粒度層次、B.8 games 擴充（start_time_utc/venue/先發投手預告）、B.9 `game_batting_stats`、B.10 `game_pitching_stats`、B.11 `player_recent_form`（近況一句話）、raw 加 gamelog、更新 §E
  - game-log 資料源走 MLB Stats API `gameLog`；時區 Node 用 Intl/date-fns-tz、Python 用 zoneinfo
  - plan §6「season-level only」標記過時、指向 spec-01
- [x] 建立 spec 總覽 `docs/spec/spec-00-overview.md`——把規格切成 spec-01~04（範疇+資料模型／IA+API／ETL／名詞庫），含各自範圍、橫向項目歸屬、依賴關係、狀態
- [x] spec-01 一致性複查+修正：B.1 enum 註解過時（已全層級）、B.4 打者進階補 `war`、B.5 投手進階改 `fip/war`、§E 收斂；統一「只存無法由計數重算的」原則
- [x] 開 **spec-02（頁面/路由 IA + 對外 API 合約）初稿**：路由/sitemap、5 頁規格（顯示/資料源/渲染）、`/api/*` endpoint + 代表性 Zod 回傳形狀、時區/OG/ISR 橫向處理；6 項 open items（URL slug、revalidation 觸發、動態 OG、逐場 N…）
- [x] 開 **spec-03（ETL / 資料同步管線）初稿**：管線總覽、來源→表對照、pybaseball/StatsAPI 各模組、一天兩次排程（早/晚班）、upsert 原則、**近況一句話生成規則**、時區存 UTC、錯誤處理；6 項 open items（排程時刻、roster 推導、生涯基準…）

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

- [ ] **frontend-shell-and-roster slice**（spec-02 切片 1+2，已用 /to-tickets 拆 4 票，`.scratch/frontend-shell-and-roster/issues/`）：01 Next.js app bootstrap → {02 全站 shell+格式 helper、03 services 基礎+PlayerSummary+/api/players（可並行）} → 04 /players 總覽頁。名詞庫（spec-02 §2.4-5）延到 spec-04 slice；假資料平行開發（ADR）。frontier＝票 01

> spec 已於 2026-07-23 重建完成（入口 `spec/spec-00-overview.md`）；舊 spec 封存於 `archive/spec/`。

- [x] ~~重建 spec~~（2026-07-23 完成，見已完成區）
- [ ] **schema + seed slice**（已用 /to-tickets 拆成 3 票，見 `.scratch/curated-schema-and-seed/issues/`）：01 bootstrap 資料層骨架（pnpm/TS/Drizzle/docker-compose Postgres）→ 02 spec-01 §C 全 curated schema + 首版 migration → 03 players 白名單 seed（StatsAPI 拉+人工校、幂等）
- [ ] Next.js 端用假資料把 `lib/services` → Route Handler → 頁面串起來（與 Python ETL 平行開發；渲染策略已定於 spec-02 §1）
- [ ] 導入 shadcn/ui + Tailwind，建立基礎「笨元件」
- [ ] spec-04 §A 的 12 則進階名詞開寫（球員頁上線前置）

---

## ❓ 待決問題（原自舊 Spec 01；2026-07-23 spec 重建後盤點）

- [x] ~~進階數據要顯示到多細~~ → 已定：打/投各 7 項、只落不可推導欄（spec-01 C.7）
- [x] ~~時區怎麼統一~~ → 已定：存 UTC＋顯示 Asia/Taipei＋`game_date_us` 錨定比賽日（spec-01 C.5、spec-02 §6）
- [x] ~~白名單維護方式~~ → 已定：seed 腳本、不做後台（spec-01 A.1）
- [ ] 小聯盟成績資料源細節：StatsAPI `sportId=11/12` 端點回傳欄位與 pybaseball 欄位對齊表（→ spec-03 §9）
- [ ] 實測 MLB Stats API 的 `transactions` / `roster` 端點回傳格式，確認 enum 對照是否齊全（→ spec-01 §F、spec-03 §9）
- [x] ~~實測 StatsAPI `stats=sabermetrics` 端點~~ → 已實測（2026-07-23）：**命中、維持原清單、預案封存**（結果見 spec-03 §9）

---

## 🔮 未來 Phase（先記著，這版不做）

- [ ] backfill 2020 年以前的歷史球季數據
- [ ] Statcast 逐球（pitch-level）數據
- [ ] 功能 3：爬取官網 / 社群新聞（DB 已預留 `news` domain 邊界）
- [ ] 功能 4：專欄 / 寫手（DB 已預留 `articles` + `authors` domain 邊界）
- [ ] 視需要把 `lib/services` 抽成獨立後端服務

---

## 🗂️ 雜項 / 待整理

- [x] `plan/baseball-tracker-plan-rust.md` / `.html` 已被 Node.js 方案取代 → 已封存至 `archive/plan/`（2026-07-23）
