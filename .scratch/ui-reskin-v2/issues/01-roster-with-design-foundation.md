# 01 — 球員名冊改版（含設計地基）

**What to build:** 打開 `/players`，看到的是雜誌風格的球員名冊——依層級由高到低分區、每區標出人數、卡片以字體排印呈現球員（**沒有人物圖像**）、用 chip 切換層級、可切換排序、歷史球員收在折疊區、篩不到人時有明確的空狀態。全站的字體、色彩、報頭與頁尾也在這一刻換成新設計；**其餘頁面此時仍是舊版面，會由後續票逐一跟上**。

**Blocked by:** None — can start immediately。**Blocks:** 02、04、05、07。

**Status:** done

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §1、§2.2、§4、§5.1、§5.2。

---

## 為什麼地基在這張票裡

地基變更是**純加法**——新增 token 與字體不會弄壞既有頁面，刪深色盤是刪死碼。因此不需要拆成獨立的水平票，折進第一個垂直切片即可。**只帶這一頁用得到的共用樣板**，其餘（數據區塊、分布尺標…）留給後續票各自帶，避免建一堆沒人用的元件。

## 地基

### 字體（`app/layout.tsx`）

現況只有 `Geist`（`:11`）。改為三角色分工，全走 `next/font/google`（**不需新增 npm 依賴**）：

| 角色 | 字體 | 用途 |
|---|---|---|
| `font-serif` | `Noto_Serif_TC` | 標題、人名、區塊大標 |
| `font-sans` | `Noto_Sans_TC` | 內文 |
| `font-mono` | `Geist_Mono` | **所有數據與標籤**（設計原則：數據一律等寬以維持對齊） |

weight 設定參考 `Phobos-UI/app/layout.tsx:6-21`。三個 variable 都要掛上 `<html>`。

### 語意色（`app/globals.css`）

設計色盤見 `Phobos-UI/app/globals.css:52-83`：深藍 `--primary: oklch(0.32 0.09 262)`、暖橘 `--accent: oklch(0.68 0.17 45)`、頁面底 `oklch(0.98 0.006 250)`。

新增並在 `@theme inline` 註冊：`--mlb`／`--aaa`／`--aa`（各含 `-foreground`）、`--up`／`--down`。

> ⚠️ **設計只有三階層級，我們有六階。** `components/players/players-view.tsx:11` 的 `LEVEL_ORDER` 是 `mlb / aaa / aa / a_plus / a / rookie`。**必須自己補 `--a-plus`／`--a`／`--rookie`**（建議自 `--aa` 的灰逐階降對比）。漏掉的話低階球員徽章會沒有顏色，而不是 fallback。

### 刪深色模式（plan §5.2 已決議不做）

**是刪未曾生效的碼，不是移除功能**——已實測：全 repo 沒有任何地方掛 `.dark` class（無 theme toggle、無 `next-themes`），且 `app/globals.css:5` 的 `@custom-variant dark (&:is(.dark *))` 是 class-based、不吃 `prefers-color-scheme`。⇒ `app/globals.css:85-117` 那 33 行從未被觸發。

`components/ui/button.tsx` 內 shadcn 原樣帶來的 `dark:` variant 同樣不可達，**無害，別為它大改 button**。

### 外框

| 檔案 | 改為 |
|---|---|
| `components/site-header.tsx` | 報頭樣式：`border-b-4 border-primary`、站名襯線 `uppercase tracking-[0.3em]`、nav 襯線 bold、active 暖橘（參考 `Phobos-UI/components/magazine/magazine-nav.tsx`）。⚠️ **保留現有漢堡選單**（`:44-73`）——設計的 nav 是桌機 flex、沒有 mobile 收合 |
| `components/site-footer.tsx` | kicker 樣式（`font-mono text-[11px] uppercase tracking-[0.3em]`）＋上邊框；**資料新鮮度那句與 `lastSyncedAt` 串接不動** |
| 容器 | `max-w-5xl px-4` → `max-w-6xl px-6` |

### 本票需要的共用樣板（單一落點，後續票沿用）

`SectionTitle`（kicker＋襯線大標，`styleguide-page.tsx:61`）、`LevelBadge`（吃 `TeamLevel` 六階，文字用既有 `levelLabel()`、**不做第二份層級字樣對照**）、`TagButton`（`questions-page.tsx:77`）、`EmptyState`（`styleguide-page.tsx:416`）、卡片 hover（`styleguide-page.tsx:684`）。

## 名冊頁

參考 `Phobos-UI/components/magazine/roster-page.tsx`。

- **層級分區**：`LevelBadge` ＋襯線中文副標 ＋ mono 英文 ＋右側「N 位」（`:96-113`）。⚠️ 設計寫死三區（`:14-18`）——分區要由 `LEVEL_ORDER` 產生，六階都要有中英文字樣，且沿用現有 `availableLevels` 邏輯：**沒有球員的層級不出現空區**。
- **卡片純字排**（`components/players/player-card.tsx` 現況 38 行）：編號浮水印（`:27`）＋暖橘短線（`:44`）＋襯線大名＋mono 英文名＋守位·隊名，再加**狀態一句話**與**近況一句話**（設計卡片沒有這兩句的位置，要自己安排；建議狀態句字重略強、近況句 muted 小字）。
- ⚠️ 隊名不要重複印層級——`player.team.levelLabel` 已含層級，見 DEVLOG 2026-08-07 的 `withLevel` 坑。
- 隊徽（票 07）尚未定時機：**預留可選 slot 即可，不要被它 block**。
- **篩選**：`players-view.tsx:55-82` 兩個原生 `<select>` → 層級改 `TagButton`（「全部」＋各層級），**排序保留下拉**（chip 表達不了排序語意）。
- **archived 折疊區**（`:96-109`）：設計無 disclosure 樣板 → 沿用分區標題列樣式包 `<details>`，卡片降對比，標題維持「歷史球員（N）」。
- **空狀態**：`shown.length === 0` 改走 `EmptyState`。

## Checklist

- [x] `/players` 整頁為新版面，分區由 `LEVEL_ORDER` 產生、**六階皆有字樣**、空層級不出現
- [x] 卡片純字排、**無頭像框**，狀態句與近況句都在且未被截斷
- [x] 隊名不重複印層級
- [x] 層級篩選為 chip、~~排序下拉保留~~（**票面有誤，見 Comments：排序已移除**）、archived 折疊區可用、空狀態走 `EmptyState`
- [x] 三字體生效；8 個語意 token ＋ **補齊 `--a-plus`／`--a`／`--rookie`**
- [x] `globals.css:85-117` 深色盤已刪
- [x] 報頭樣式且**漢堡選單仍可用**；頁尾 kicker 化且 `lastSyncedAt` 不動；容器統一 `max-w-6xl px-6`
- [x] 五個共用樣板為單一落點，未重複實作
- [x] `components/players/players-view.test.tsx` 更新並綠
- [x] `pnpm typecheck` 綠、`pnpm test` 綠

## Comments

- **不搬設計的 `next.config.mjs` 設定**：它開了 `typescript.ignoreBuildErrors: true` 與 `images.unoptimized: true`，是 v0 產出的權宜設定。
- 本票不動任何 `lib/services/*`。
- 完成後其他頁面會是「新報頭＋舊內文」的混搭狀態，**這是預期的**，由 02／04／05 收斂。
- 2026-08-13：完成全站設計地基與 `/players` 雜誌風名冊。新增 Noto Sans TC／Noto Serif TC／Geist Mono 三字體、亮色語意 token 與六階徽章色，移除未生效的 `.dark` token；新增 `SectionTitle`、`LevelBadge`、`TagButton`、`EmptyState`、卡片 hover 共用樣板。名冊改為六階動態分區、chips 篩選、排序下拉、archived disclosure 與空狀態；卡片維持純字排並保留狀態／近況句。實際以 dev server 與本機 Chrome 檢視桌機及 390px 手機版 `/players`。

### 事後 review 修掉三件（2026-08-13，同分支）

完整敘述與實測數字見 `docs/DEVLOG.md` 2026-08-13。摘要：

1. **頁尾 `mt-16` 從未生效**——與 `mt-auto` 同為 `margin-top`、同 specificity，編譯後 `mt-auto` 勝出。修法是單純移除、不補間距（頁面 section 已有 `pb-16`，且既然它從未生效，dev server 上驗收過的外觀就是沒有這 4rem）。
2. **archived 卡片降對比空轉**——`opacity-60 … group-open:opacity-100` 在收合時子節點不顯示、展開時又拉回全不透明。改成 `PlayerCard` 的 `archived` prop、壓底色去彩度；實測次要文字由 3.47:1（透明度方案）回到 5.04:1，全數過 WCAG AA。
3. **排序下拉完全失效，已移除**——見下條。

> ⚠️ **本票開票時的錯誤（記給後續票參考）**：Checklist 寫「排序下拉保留」，理由是「chip 表達不了排序語意」。但這與同一張票要求的「層級分區」**直接相衝**——分區後區內成員層級必然相同，`levelRank` 差恆為 0，兩個排序選項輸出完全一致，那個 `<select>` 從一開始就是死的。**開票時沒想到，實作照票做也沒察覺。** 後續票若同時要求「分組呈現」與「排序控制」，先確認兩者不會互相抵銷。
>
> 已移除的是**控制項**不是排序本身——區內仍固定依姓名 `localeCompare(…, "zh-Hant")`，避免退化成 DB 回傳順序。
