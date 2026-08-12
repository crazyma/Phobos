# 01 — 設計基礎：字體、token、全域框架與共用樣板 ★frontier

**What to build:** 把 `Phobos-UI` 雜誌風格的地基搬進來——三種字體、語意 token、全域外框（header／footer／容器寬度），以及後續每張票都會用到的共用樣板元件。**這張票不改任何頁面內容**，只換地基與外框；頁面各自在 02–06 改。

**Blocked by:** None。**Blocks:** 02、03、05、06（04 經 03、07 經 04）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §1、§4、§5.2。

---

## 1. 字體（`app/layout.tsx`）

現況只有 `Geist`（`app/layout.tsx:11`）。改為三種角色分工——這是雜誌風格的骨幹，缺了就不像：

| 角色 | 字體 | 用在 |
|---|---|---|
| `font-serif` | `Noto_Serif_TC` | 所有標題、人名、區塊大標 |
| `font-sans` | `Noto_Sans_TC` | 內文 |
| `font-mono` | `Geist_Mono` | **所有數據與標籤**（設計原則：數據一律等寬以維持對齊） |

全走 `next/font/google`，**不需要新增 npm 依賴**。參考 `Phobos-UI/app/layout.tsx:6-21` 的 weight 設定（Serif 取 500/700/900、Sans 取 400/500/700/900）。

`<html>` 上目前掛 `cn("font-sans", geist.variable)`，三種 variable 都要掛上。

## 2. 語意 token（`app/globals.css`）

### 2.1 新增

設計的色盤（`Phobos-UI/app/globals.css:52-83`）：深藍 `--primary: oklch(0.32 0.09 262)`、暖橘 `--accent: oklch(0.68 0.17 45)`、頁面底 `oklch(0.98 0.006 250)`。

新增 8 個我們沒有的語意色，並在 `@theme inline` 註冊成 `--color-*`：

```
--mlb / --mlb-foreground
--aaa / --aaa-foreground
--aa  / --aa-foreground
--up  / --down
```

### 2.2 ⚠️ 層級數對不上——必須自己補

**設計只定義 MLB/3A/2A 三階，我們有六階。** `components/players/players-view.tsx:11` 的 `LEVEL_ORDER`：

```
mlb / aaa / aa / a_plus / a / rookie
```

要補 `--a-plus / --a / --rookie`（建議自 `--aa` 的灰再逐階降對比）。**漏掉的話低階球員的 badge 會沒有顏色**，而不是 fallback 到某個預設色。

### 2.3 刪除深色模式（§5.2 已決議：不做）

**這是刪未曾生效的碼，不是移除功能**——已實測：

- 全 repo **沒有任何地方掛 `.dark` class**（無 theme toggle、無 `next-themes`、`<html>` 上也沒有）。
- `app/globals.css:5` 的 `@custom-variant dark (&:is(.dark *))` 是 **class-based**，不吃 `prefers-color-scheme`。

⇒ `app/globals.css:85-117` 那 33 行深色盤從未被觸發過。連同兩處僅有的 `dark:` 一併處理：

- `components/ui/button.tsx`：shadcn 原樣帶來的 `dark:` variant，不可達；無害，可留可清（**留著也不算 bug，別為它大改 button**）。
- `components/player-detail/upcoming.tsx:68`：`dark:text-emerald-400`——勝敗色改吃 `--up`／`--down` 後這條自然消失（實際改動在票 03）。

## 3. 全域外框

| 檔案 | 現況 | 改為 |
|---|---|---|
| `components/site-header.tsx` | `max-w-5xl`、`text-lg font-bold` 的 "Phobos" | 報頭樣式：`border-b-4 border-primary`、站名用襯線 `uppercase tracking-[0.3em]`、nav 用襯線 bold、active 為暖橘（參考 `Phobos-UI/components/magazine/magazine-nav.tsx`） |
| | | ⚠️ **保留現有漢堡選單**（`site-header.tsx:44-73`）。設計的 nav 是桌機 flex、**沒有** mobile 收合，四個連結在窄螢幕會擠 |
| `components/site-footer.tsx` | 純文字 | kicker 樣式（`font-mono text-[11px] uppercase tracking-[0.3em]`）＋上邊框；**保留資料新鮮度那句與 `lastSyncedAt` 串接不動** |
| 容器寬度 | `max-w-5xl px-4`（首頁／名冊）、`max-w-3xl px-4`（個人頁／名詞頁） | 統一 `max-w-6xl px-6` |

## 4. 共用樣板元件（新建，後續票直接用）

放 `components/ui/` 或新開 `components/magazine/`，命名由實作決定，但**必須是單一落點**——不要讓 02–06 各自複製一份。

| 元件 | 樣板出處 | 說明 |
|---|---|---|
| `SectionTitle` | `styleguide-page.tsx:61` | kicker（`font-mono text-[11px] uppercase tracking-[0.3em] text-accent`）＋襯線大標 |
| `LevelBadge` | `styleguide-page.tsx:202` | 吃 `TeamLevel`（六階全支援），輸出對應色的 chip；文字用既有的 `levelLabel()`（`lib/services/player-status.ts`），**不要做第二份層級字樣對照** |
| `StatBlock` | `styleguide-page.tsx:254` | `border-l-2 border-accent` ＋大寫 mono 指標名＋大字數值＋hint 小字 |
| `EmptyState` | `styleguide-page.tsx:416` | 圖示圓框＋襯線大標＋說明＋行動按鈕 |
| `TagButton` | `questions-page.tsx:77` | 選中暖橘實心／未選描邊的 chip（票 02、06 都要用） |

## 5. 直接複製的檔案

| 來源 | 目的地 | 備註 |
|---|---|---|
| `Phobos-UI/components/magazine/baseball-icons.tsx` | `components/` | 球棒／棒球／手套／本壘板，lucide 同規格（24×24、currentColor、圓角）。票 06 的名詞分類要用 |

## Checklist

- [ ] 三字體掛上 `<html>`，`font-serif` / `font-sans` / `font-mono` 三個角色可用
- [ ] 8 個語意 token ＋ `@theme inline` 註冊
- [ ] **補 `--a-plus` / `--a` / `--rookie` 三階**（設計沒有）
- [ ] 刪 `globals.css:85-117` 深色盤；`upcoming.tsx:68` 的 `dark:` 留給票 03 一併處理
- [ ] header 報頭樣式，**漢堡選單保留可用**
- [ ] footer kicker 樣式，`lastSyncedAt` 串接不動
- [ ] 容器統一 `max-w-6xl px-6`
- [ ] 五個共用樣板元件，單一落點
- [ ] `baseball-icons.tsx` 移植
- [ ] `pnpm typecheck` 綠、`pnpm test` 綠（現有測試不應因本票失敗——若失敗多半是測試在斷言舊 class，需一併更新）

## Comments

- **不搬設計的 `next.config.mjs` 設定**：它開了 `typescript.ignoreBuildErrors: true` 與 `images.unoptimized: true`，是 v0 產出的權宜設定。
- 本票刻意不動任何 `lib/services/*`——地基與資料層無關。
