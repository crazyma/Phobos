# 01 — 名詞庫管線 + 首則名詞頁（tracer bullet）

**What to build:** 讓名詞庫從無到有跑通一條完整鏈路：使用者能在 `/glossary` 看到主題分類索引、點進 `/glossary/[slug]`（先以 **wRC+** 一則為證）看到三層結構（判讀＋級距表／定義算法小字／延伸權威連結）。同時建立「名詞頁先行」的機械性保證——build time 由所有 MDX frontmatter 產生 `metric_key → slug` registry，並在球員頁顯示指標缺對應名詞頁時 **build fail**（spec-04 §D）。內容為靜態 MDX、build-time 產出（ADR §5(2)）。

**Blocked by:** None — can start immediately.

**Status:** done (2026-07-28)

- [x] Next.js 接上 MDX（frontmatter + body），名詞內容以檔案為單一事實來源；`/glossary`（SSG）主題分類分組（打擊進階／投球進階／標準數據／名單與規則，spec-02 §2.4），每則列中英文名＋一句白話
- [x] `/glossary/[slug]`（SSG）三層模板（spec-02 §2.5）：判讀（白話＋分布＋**級距表** MLB/3A/2A 三欄）→ 定義算法（小字，中英文名＋公式）→ 延伸（權威連結）
- [x] frontmatter 以 Zod（或等價）驗證：欄位齊全（slug/name_zh/name_en/category/applies_to/metric_keys/higher_is_better/bands/sources）、`bands` 僅含 `mlb/aaa/aa`、每組 band 區間遞增（spec-04 §B/§F）
- [x] build-time **registry**（`metric_key → slug`）由全部 frontmatter 生成；**缺頁 build-fail 檢查**：球員頁「顯示指標清單」中每個 `metric_key` 必須命中 registry，否則 build 失敗（spec-04 §D）
- [x] 以 **wRC+** 一則真名詞（含 mlb/aaa/aa 三組級距）打穿；wRC+/WAR 照寫當純知識、即使球員頁最終缺值（spec-04 §A 註）
- [x] 測試：registry 完整性（缺頁 fixture 必 fail，spec-04 §F）；frontmatter Zod（欄位齊全／bands 僅三組／區間遞增）；`/glossary` 與 `/glossary/[slug]` smoke
