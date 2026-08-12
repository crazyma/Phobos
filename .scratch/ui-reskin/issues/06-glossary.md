# 06 — 名詞索引與名詞頁：搜尋卡片牆 ＋ 五段版面骨架

**What to build:** `/glossary` 索引改成設計的搜尋框＋分類卡片牆；`/glossary/[slug]` **維持獨立靜態頁**，只借設計 modal 的五段內容骨架。**不做 modal**（§5.3 決議：先 A，B 留後續 polish）。

**Blocked by:** 01。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.4、§3、§5.3。

---

## ⚠️ 先讀：為什麼不做 modal

設計的名詞是「單頁 ＋ 點卡片開 modal」（`Phobos-UI/components/magazine/glossary-page.tsx`）。**全面 modal 化會**：

- 24 個 `/glossary/[slug]` 靜態頁 → 1 個 URL
- per-term 的 title/description/OG/Twitter（`app/glossary/[slug]/page.tsx:24-39`）全失
- sitemap 掉 24 條（`lib/seo/sitemap.ts:12-14`）
- 卡片是 `<button>`（`glossary-page.tsx:204`）⇒ 爬蟲走不進去
- **`components/player-detail/season-stats.tsx:150` 的雙向連結沒有去處**
- **`getRegistry()` 的 build-fail 護欄失去掛載點**（`app/glossary/[slug]/page.tsx:51`）

而 `docs/requirements.md` §8「球員頁與名詞頁能被 Google 搜到」是**驗收條件**。

**⇒ 本票：卡片是真 `<Link href="/glossary/[slug]">`，點擊進全頁。**

---

## 1. 索引頁 `/glossary`

現況 `app/glossary/page.tsx`（60 行，`dynamic = "force-static"`）。

### 搜尋框

移植 `glossary-page.tsx:113-141`：左側 `Search` 圖示、聚焦暖橘框、有字時右側 `X` 清除、下方「找到 N 則結果」。

⚠️ 索引頁目前是 **static server component**。加搜尋需要 client state——**把搜尋＋卡片牆抽成一個 client component**，`loadAllFrontmatter()` 的結果由 server page 傳進去。**`force-static` 保持**（資料是 build 時的 MDX frontmatter，不是 DB）。

### 分類分區

⚠️ **分類對不上，要做對照：**

| 設計 | 我們（`lib/glossary/schema.ts:10-16`） |
|---|---|
| 打擊數據 | `batting_adv` |
| 投球數據 | `pitching_adv` |
| 防守數據 | **我們沒有** → 不出現 |
| 綜合評估數據 | `shared_adv` |
| 規則 | `roster` |
| — | **`standard`（標準數據）** → 設計沒有，需自己給圖示與字樣 |

沿用現有的 `GLOSSARY_CATEGORIES` 順序與 `CATEGORY_LABELS`（`app/glossary/page.tsx:14-20`），**不要改分類本身**。每區標題掛 `baseball-icons`（票 01 已移植）的對應圖示 ＋右側「N 則」。

### 名詞卡

`glossary-page.tsx:196-227`，但改成 `<Link>`：襯線中文名 ＋ mono 英文名（暖橘）＋ `line-clamp-2` 的 `blurb` ＋ hover 上浮。

### 空狀態

搜尋無結果時走 `glossary-page.tsx:534` 的 `EmptyState`（票 01 已建）。

### 不要搬

`glossary-page.tsx:182-190` 右下角的「測試畫面」浮動按鈕（循環 default/keyword/empty）是設計檢視工具。

---

## 2. 名詞頁 `/glossary/[slug]`

現況 `app/glossary/[slug]/page.tsx`（111 行）是四層結構。改用設計 modal 的**五段骨架**（`ModalSection`：圖示 ＋ mono 大寫小標），對映如下：

| 設計五段 | 我們的來源 |
|---|---|
| 導言 | MDX body 的第一段（現況 `<Body />` 整段渲染，`:76`） |
| 簡述概念（條列） | MDX body 其餘部分——**不改內容結構**，維持 `<Body />` 整塊渲染即可 |
| 對球員的意義 | 同上（MDX 內） |
| 數據高低比較 | **`BandsTable` → 改用堆疊 ScaleBar，見下** |
| 站內相關 / 延伸參考 | `term.sources`（`:94-103`）＋ `GlossaryExamples` / `RosterExamples`（`:107-108`） |

「定義算法小字」層（`:82-90`，`term.formula`）**保留**，設計沒有對應段但這是 spec-04 §B layer 2。

### BandsTable → 堆疊 ScaleBar（本票最大的一塊）

現況 `components/glossary/bands-table.tsx`：MLB/3A/2A **三欄並排**，每欄一組 band 標籤＋範圍；打投兩視角各一組。

設計的 `ScaleBar`（`glossary-page.tsx:471-532`）是**單一軸**：區間標籤在上、色帶、接縫數值、方向提示。

**做法：一個層級一條 ScaleBar，垂直堆三條**，左側掛 `LevelBadge`；打投兩視角各一個 `ModalSection` 段落。

對映：

- `zones[].tone`（low/mid/high）← band 的優劣。⚠️ **`higher_is_better` / `higher_is_better_pitcher`（`lib/glossary/schema.ts:91-101`）決定 tone 的方向**，投手視角常常相反，不能只看順序
- 接縫數值 ← `band.max`（最後一段開放，`bandRange()` 已處理過這個邏輯，`bands-table.tsx:11-17`）
- `hint` ← 「數字越高／越低越好」，由 `higher_is_better` 推
- 最後一段沒有 `max`（開放區間）——ScaleBar 需要有限寬度，**要決定開放段畫多寬**（建議取前一段寬度，並在數值處標 `>`）

## Checklist

- [ ] 索引頁：搜尋＋卡片牆抽成 client component，server page 傳 frontmatter，**`force-static` 保持**
- [ ] 分類分區沿用 `GLOSSARY_CATEGORIES`，`standard` 自己補圖示與字樣，**分類本身不改**
- [ ] **卡片是 `<Link href="/glossary/[slug]">`，不是 `<button>`**
- [ ] 搜尋無結果走 `EmptyState`；「測試畫面」浮動按鈕沒有被搬進來
- [ ] 名詞頁改五段骨架，`formula` 層保留
- [ ] `BandsTable` 改堆疊 ScaleBar，**tone 方向吃 `higher_is_better` / `higher_is_better_pitcher`**
- [ ] 開放區間（最後一段無 `max`）的畫法有明確決定並記在 Comments
- [ ] `GlossaryExamples` / `RosterExamples` 兩塊回連保留（缺資料時整塊隱藏的行為不變）
- [ ] `components/glossary/glossary.test.tsx`、`app/glossary/index.test.tsx` 更新並綠
- [ ] **`app/seo.test.ts` 綠**、`pnpm build` 綠且 sitemap 仍含 24 條名詞 URL
- [ ] `pnpm typecheck` 綠

## Comments

- **B（intercepting routes `app/@modal/(.)glossary/[slug]`）是後續 polish，不在本票**。開那張票前需要一次 spike：驗證 intercepting route 配 `await import(...content/glossary/${slug}.mdx)` 的動態 MDX 匯入在 Next 16 的行為（plan §5.3）。
- 本票**不新增、不修改任何 MDX 內容**。24 則名詞的文字是 spec-04 的範圍。
