# 05 — 名詞索引與名詞頁

**What to build:** 打開 `/glossary`，可以直接搜尋名詞、縮寫或關鍵字，結果依分類分區成卡片牆，搜不到時有明確的空狀態；點任一張卡進入該名詞的**獨立頁面**（網址可分享、可被搜尋引擎索引），頁內依「導讀 → 數據高低比較 → 定義算法 → 延伸參考 → 範例球員」分段，級距以一層級一條的分布尺標呈現。

**Blocked by:** 01（字體／語意色／外框／共用樣板）。

**Status:** done

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.4、§3、§5.3。

---

## ⚠️ 先讀：為什麼不做 modal

設計是「單頁 ＋ 點卡片開 modal」（`Phobos-UI/components/magazine/glossary-page.tsx`）。**全面 modal 化會**：

- 24 個 `/glossary/[slug]` 靜態頁 → 1 個 URL
- per-term 的 title／description／OG／Twitter（`app/glossary/[slug]/page.tsx:24-39`）全失
- sitemap 掉 24 條（`lib/seo/sitemap.ts:12-14`）
- 卡片是 `<button>`（`glossary-page.tsx:204`）⇒ 爬蟲走不進去
- **`components/player-detail/season-stats.tsx:150` 的雙向連結沒有去處**
- **`getRegistry()` 的 build-fail 護欄失去掛載點**（`app/glossary/[slug]/page.tsx:51`）

而 `docs/requirements.md` §8「球員頁與名詞頁能被 Google 搜到」是**驗收條件**。

**⇒ 本票：卡片是真 `<Link href="/glossary/[slug]">`，點擊進全頁。**

---

## 索引頁 `/glossary`

現況 `app/glossary/page.tsx`（60 行，`dynamic = "force-static"`）。

- **搜尋框**：移植 `glossary-page.tsx:113-141`——左側 `Search` 圖示、聚焦暖橘框、有字時右側 `X` 清除、下方「找到 N 則結果」。
  > ⚠️ 索引頁目前是 static server component。加搜尋需要 client state ⇒ **把搜尋＋卡片牆抽成 client component**，`loadAllFrontmatter()` 的結果由 server page 傳入。**`force-static` 保持**（資料是 build 時的 MDX frontmatter，不是 DB）。
- **分類分區**：沿用現有 `GLOSSARY_CATEGORIES` 與 `CATEGORY_LABELS`（`app/glossary/page.tsx:14-20`），**不要改分類本身**。每區標題掛 `baseball-icons` 對應圖示 ＋右側「N 則」。

  ⚠️ **分類對不上，要做對照**：

  | 設計 | 我們（`lib/glossary/schema.ts:10-16`） |
  |---|---|
  | 打擊數據 | `batting_adv` |
  | 投球數據 | `pitching_adv` |
  | 防守數據 | **我們沒有** → 不出現 |
  | 綜合評估數據 | `shared_adv` |
  | 規則 | `roster` |
  | — | **`standard`（標準數據）** → 設計沒有，需自己給圖示與字樣 |

  > `baseball-icons.tsx` 需自 `Phobos-UI/components/magazine/` 移植（票 01 未帶，本票帶入）。
- **名詞卡**：`glossary-page.tsx:196-227` 的樣式，但改成 `<Link>`——襯線中文名 ＋ mono 英文名（暖橘）＋ `line-clamp-2` 的 `blurb` ＋ hover 上浮。
- **空狀態**：搜尋無結果走 `EmptyState`（票 01 已建）。
- **不要搬**：`glossary-page.tsx:182-190` 右下角的「測試畫面」浮動按鈕（循環 default/keyword/empty），那是設計檢視工具。

## 名詞頁 `/glossary/[slug]`

現況 `app/glossary/[slug]/page.tsx`（111 行）。改用設計 modal 的**五段骨架**（`ModalSection`：圖示 ＋ mono 大寫小標）：

| 設計段落 | 我們的來源 |
|---|---|
| 導言／簡述概念／對球員的意義 | MDX body——**不改內容結構**，維持 `<Body />` 整塊渲染（`:76`） |
| 數據高低比較 | **`BandsTable` → 改堆疊分布尺標，見下** |
| 站內相關／延伸參考 | `term.sources`（`:94-103`）＋ `GlossaryExamples`／`RosterExamples`（`:107-108`） |

「定義算法小字」層（`:82-90`，`term.formula`）**保留**——設計沒有對應段，但這是 spec-04 §B layer 2。

### BandsTable → 堆疊分布尺標（本票最大的一塊）

現況 `components/glossary/bands-table.tsx`：MLB/3A/2A **三欄並排**，打投兩視角各一組。設計的 `ScaleBar`（`glossary-page.tsx:471-532`）是**單一軸**：區間標籤在上、色帶、接縫數值、方向提示。

**做法：一個層級一條尺標，垂直堆三條**，左側掛 `LevelBadge`；打投兩視角各一個分段。

- `zones[].tone`（low/mid/high）← band 優劣。⚠️ **方向要吃 `higher_is_better` / `higher_is_better_pitcher`**（`lib/glossary/schema.ts:91-101`）——投手視角常常相反，不能只看順序
- 接縫數值 ← `band.max`；`bandRange()`（`bands-table.tsx:11-17`）已處理過開放區間的邏輯，沿用
- 方向提示 ← 由 `higher_is_better` 推出「數字越高／越低越好」
- ⚠️ **最後一段沒有 `max`（開放區間）**，而尺標需要有限寬度——**要決定開放段畫多寬**（建議取前一段寬度，數值處標 `>`），並把決定記在 Comments

## Checklist

- [x] 索引頁可搜尋（名稱／縮寫／說明），搜尋＋卡片牆為 client component，server page 傳 frontmatter，**`force-static` 保持**
- [x] 分類分區沿用 `GLOSSARY_CATEGORIES`，`standard` 自補圖示與字樣，**分類本身未改**
- [x] **卡片是 `<Link>`，不是 `<button>`**
- [x] 搜尋無結果走 `EmptyState`；「測試畫面」浮動按鈕未被搬入
- [x] `baseball-icons.tsx` 已移植
- [x] 名詞頁改五段骨架，`formula` 層保留
- [x] 級距改堆疊尺標，**tone 方向吃 `higher_is_better` / `higher_is_better_pitcher`**
- [x] 開放區間畫法有明確決定並記在 Comments
- [x] `GlossaryExamples`／`RosterExamples` 保留，缺資料時整塊隱藏的行為不變
- [x] `components/glossary/glossary.test.tsx`、`app/glossary/index.test.tsx` 更新並綠
- [x] **`app/seo.test.ts` 綠**，且 sitemap 仍含 24 條名詞 URL
- [x] `pnpm typecheck` 綠
- [x] **`pnpm build` 綠**——typecheck 與 vitest 都不驗 RSC 的 client/server 邊界，只有 `next build` 會（見票 02 Comments 的教訓）

## Comments

- **modal 版（intercepting routes `app/@modal/(.)glossary/[slug]`）是後續 polish，不在本票**。開那張票前需要一次 spike：驗證 intercepting route 配 `await import(...content/glossary/${slug}.mdx)` 的動態 MDX 匯入在 Next 16 的行為（plan §5.3）。
- 本票**不新增、不修改任何 MDX 內容**——24 則名詞的文字屬 spec-04 範圍。
- 尺標兩端的開放區間：第一段取下一段的寬度，最後一段取前一段的寬度；只有一段時給等寬 100%。接縫仍用既有 `bandRange()` 顯示 `≤`／`>`，不捏造無界數值。
- `higher_is_better_pitcher` 只在投手視角覆蓋預設方向；`k-pct`、`babip`、`bb-pct` 的雙視角因此會呈現相反的好壞色帶。
- 索引搜尋只接收 server 傳入的 frontmatter，未 import `content.ts` 或 DB service；`force-static`、24 個獨立名詞 URL、metadata、sitemap 與 registry build-fail 護欄均保留。

### 事後修正（code review）

- **接縫數值的座標**：原本用 flex 排數值列，每個 `<span>` 寬度＝自己那段的寬度 ⇒ 標籤停在自己那段的**左緣**，但 `band.max` 是該段的**右緣**，整排數字左移一格。改採設計稿 `ScaleBar` 結構（標籤在上、細色帶、數值絕對定位在下）。設計稿用 `((b - min) / span) * 100` 算 `left%`，**我們兩端都是開放區間、沒有真正的 min/max**，所以改用**累積區段寬度**：第 i 個接縫的位置 = 前 i 段寬度總和 ÷ 總寬（沿用既有 `segmentWidths()`）。
- **只畫內部接縫**：schema 保證「只有最後一段可以省略 `max`」，因此接縫取 `i < bands.length - 1` 的 `band.max`——尺標左右兩端是**合成**出來的寬度（見 `segmentWidths()`），標在 0% / 100% 會是捏造的界線。
- **tone 推導規則**（`Band` 沒有 `tone` 欄位，設計的假資料才有）：以**位置＋方向**推導——**最差端 → `low`（`bg-muted`）、最好端 → `high`（`bg-accent`）、中間全部 → `mid`（`bg-accent/40`）**；哪一端是「最好」由 `higherIsBetter` 決定，投手視角吃 `higher_is_better_pitcher` 覆蓋；`bands.length === 1` 時不構成端點，給 `mid`。
- **不用 `bg-up`／`bg-down`**：綠／紅在站上已是升降與勝敗的語彙（異動時間軸、首頁異動快訊、近期戰績），挪來表示級距好壞會混淆；設計原則亦明列「深藍為主、暖橘為輔」。
- **幾何有測試護欄**：`scaleGeometry()`／`bandTones()` 抽成純函式，`glossary.test.tsx` 斷言「第 i 個接縫位置＝前 i 段寬度累積和」（用不等寬 bands，等寬會蓋掉差一格的錯誤）並從 render 出的 HTML 驗 `left:X%`。
