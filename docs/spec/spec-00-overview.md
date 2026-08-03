# Spec 00 — 總覽與追溯

<!--badges: 類型=spec 索引/地圖; 上游=requirements.md + adr/decisions.md + plan/domain-regrill-2026-07-23.md; 重建版=2026-07-23-->

> `spec/` 入口地圖（2026-07-23 重建版）：規格切成哪幾塊、彼此依賴、需求追溯、整體測試策略。上游是 `requirements.md`（產品需求）、`adr/decisions.md`（技術決策）與 `plan/domain-regrill-2026-07-23.md`（領域模型）。舊版 spec 已封存於 `archive/spec/`，本組 spec 與其脫鉤、從零重建。

---

## 1. Spec 切分

| Spec | 範圍 | 依賴 |
|---|---|---|
| `spec-01-domain-and-data-model.md` | 領域模型落地：白名單與球員生命週期、事件溯源與狀態投影、curated schema 欄位級定義、enum、upsert key | — |
| `spec-02-ia-and-api.md` | 路由/頁面 IA、每頁顯示與渲染策略、對外 JSON API 合約（Zod 形狀）、SEO/OG/時區呈現 | spec-01、spec-04 |
| `spec-03-etl-pipeline.md` | Python 資料管線：來源→表對照、一天兩批的班表與職責、回填範圍、近況一句話生成、狀態投影、錯誤處理 | spec-01 |
| `spec-04-glossary-content.md` | 名詞庫內容規格：起手名詞清單、MDX frontmatter schema、級距×層級、指標↔名詞頁對應（名詞頁先行）、範例回連規則 | spec-01（指標鍵名） |

**橫向歸屬**：時區（存 UTC＝spec-01；顯示台灣時間＝spec-02；批次錨定＝spec-03）；近況一句話（欄位＝spec-01；顯示＝spec-02；生成＝spec-03）；級距（資料形狀＝spec-04；顯示＝spec-02）。

## 2. 需求追溯（requirements → spec）

| 需求 | 落點 |
|---|---|
| F1-0 首頁（最新已結算美國比賽日＋動態、即將出賽、空狀態） | spec-02 §2.1；資料供給 spec-03 §3 |
| F1-1 球員總覽頁 | spec-02 §2.2 |
| F1-2 球員個人頁（基本資料/近況一句話/球季數據/逐場/時間軸/出賽預告） | spec-02 §2.3；模型 spec-01 §3~§6 |
| F1-3 資料新鮮度（一天兩批、每頁標示更新時間） | spec-01 §8（sync_runs）；spec-02 §5；spec-03 §2 |
| F1-4 收藏我的球員（低優先） | spec-02 §7（out of scope 註記，localStorage 預留） |
| F2-1~F2-3 名詞庫（三層結構、級距、雙向連結） | spec-04；頁面 spec-02 §2.4~2.5 |
| §7.1 動態/狀態（事件類型、歸屬×健康、層級標示） | spec-01 §4~§5 |
| §7.2/§7.3 數據分層（快訊單場精簡／標準+進階） | spec-01 §6；spec-02 §2 |
| §7.4 近況一句話（優先序＋狀態 fallback、永不為空） | spec-03 §5 |
| §6 非功能（SEO/OG/手機優先/正確性/韌性） | spec-02 §4~§6；spec-03 §6 |
| §9.1 2026-07-23 拍板 13 條 | 全數落入對應 spec；核對清單見 `plan/domain-regrill-2026-07-23.md` §10 |

## 3. 測試策略（接縫）

接縫越高、越少越好；本專案的理想主接縫只有一條，架構上已存在（ADR §3）：

1. **主接縫：Postgres curated schema** —— Python ETL 與 Next.js 的唯一合約。
   - Python 側：raw fixture（錄下的上游 payload）→ 轉換函式 → 斷言 curated 列；不打真網路。
   - Node 側：seed 好的測試 DB → `lib/services` → 斷言查詢結果與 API JSON（Zod schema 同時當測試斷言器）。
2. **次接縫：`lib/services`** —— 頁面與 Route Handler 都只經此層；契約測試打在 services 與 `/api/*` 回應形狀，不測 UI 內部。
3. **純函式單元**（不需 DB）：狀態投影（事件列→歸屬×健康）、近況一句話規則引擎（逐場列→句子）、級距判讀查表。規則以表格寫死在 spec，測試即對表驗收。

原則：只測外部行為（輸入→輸出），不測實作細節；greenfield 專案無既有測試先例，上述即為先例起點。

## 4. 全域常數（各 spec 引用）

| 常數 | 值 | 出處 |
|---|---|---|
| `SEASON_BACKFILL_START` | 2020 | requirements F1-2 |
| `RECENT_GAMES_N` | 10（球員頁逐場顯示場數） | requirements F1-2 第 3 區（N 由本 spec 定案） |
| 級距層級 | MLB / 3A / 2A | requirements §9.1 |
| 顯示時區 | Asia/Taipei（儲存一律 UTC） | requirements F1-2 |

## 5. 範疇外（整組 spec 不涵蓋）

功能 3 新聞、功能 4 專欄（schema 僅預留 domain 邊界，見 spec-01 §9）；pitch-level 數據；使用者帳號/留言/推播/付費；深色模式（設計階段再議）。
