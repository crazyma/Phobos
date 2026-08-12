# 04 — 球員個人頁 B：數據區（本季重點＋完整表＋進階＋逐季歷史）

**What to build:** 球員頁的數據區。**這是整個拉皮資訊量差距最大的一塊**——設計每個層級只放 4 個大數字，我們有 20 欄＋合計列＋進階展開，不能直接照搬。

**Blocked by:** 03（同一頁，序列化）。**Blocks:** 07（sparkline 掛在這一區下方）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.3、§3。

---

## 核心設計問題：4 格 vs 20 欄

設計的 `StatCards`（`Phobos-UI/components/magazine/magazine-player-detail.tsx:121-179`）一個層級只放 4 個大數字。我們現況（`components/player-detail/season-stats.tsx`）：

- 打擊 **20 欄**（`:24-45`）、投球 **20 欄**（`:47-68`）
- per-team 分列 ＋ **重算的合計列**（`:108-117`）
- 低階層級的「僅供參考」註記（`:200`）
- 每組一個 `<details>` **進階數據**展開（`:132-162`），每項連回名詞頁

**這不是樣式差異，是差一個量級。** 決議做法：**「4 格重點 ＋ 可展開完整表」兩層。**

### 第一層：重點 4 格

用票 01 的 `StatBlock`（`border-l-2 border-accent` ＋大寫 mono 指標名＋大字數值＋hint 小字）。每層級一張卡（`StatCards` 的外框），卡頭是 `LevelBadge` ＋「N 場」＋「目前所在」標記（`:153`）。

挑哪 4 個：

| 角色 | 建議 4 格 |
|---|---|
| 打者 | AVG / OPS / HR / RBI |
| 投手 | ERA / WHIP / SO / IP |

`StatBlock` 的 hint 位置放**級距標籤**（「優異」等）——這正是 `lib/glossary/bands.ts` 已經在做的事，先找現成的 band lookup，**不要做第二份**。

### 第二層：完整表（`<details>` 展開）

展開後就是現有的 20 欄表格，外觀改用設計的**逐季歷史表**樣式（`magazine-player-detail.tsx:345-405`）：

- `overflow-x-auto` ＋ `min-w-[52rem]`
- **sticky 左欄**（`:349`、`:379`，`sticky left-0 z-10 bg-background`）
- 「← 左右滑動查看更多欄位 →」提示，`lg:hidden`（`:342`）
- 合計列用 `border-y-2 border-foreground` 加粗區隔

**20 欄一欄都不能少**，per-team 分列與合計列的既有邏輯（`teamCell()`、`total`）不要重寫。

## 進階數據區

現況 `AdvancedStats`（`season-stats.tsx:132-162`）是個 `<details>`，展開後是一排連回名詞頁的指標。改用 `StatBlock` 排版，**每個指標名仍是連回 `/glossary/${metricSlug(key)}` 的連結**。

⚠️ **這個連結是 spec-04 §D 雙向連結的一半，且 `getRegistry()` 的 build-fail 護欄靠它**（見 plan §5.3）。**不可改成純文字或 modal。**

缺值隱藏的規則（`:143` 的 `.filter((m) => m.value !== null)`）不變——小聯盟本來就大多沒有進階值（DEVLOG 2026-08-07：小聯盟不顯示 wOBA/xwOBA/wRC+/WAR/FIP）。

## 逐季歷史

現況 `SeasonStats` 是「依球季分組 → 依層級分區 → per-team 列」。設計的逐季表（`:345`）是「一列一個(球季×層級)」，同季第二列以後球季欄留白形成分組（`:380`），同層級換隊併列雙隊名（`:384`，`s.teams.join(' → ')`）。

兩者資料結構不同——**以我們的 `Season` 型別為準**（`lib/services/player-seasons.ts`），只借外觀。同季多列的「球季欄留白」與虛線分隔（`:372-376`）是好的視覺，值得照做。

## 低階層級註記

「低階層級數據僅供參考」（`season-stats.tsx:200`、`:215`）保留，改成 kicker 樣式的小字。

## archived 的「生涯總成績」

`app/players/[id]/page.tsx:64-67` 用 `heading` 參數改標題，這個機制不變。

## Checklist

- [ ] 本季數據：每層級一張卡，重點 4 格用 `StatBlock`，卡頭有 `LevelBadge`／場次／「目前所在」
- [ ] 4 格的 hint 走**現有** band lookup（`lib/glossary/bands.ts`），不新建第二份
- [ ] 完整 20 欄表在 `<details>` 內，sticky 左欄 ＋ 橫滑提示 ＋ 合計列加粗；**欄位一欄不少**
- [ ] per-team 分列與合計列既有邏輯不重寫
- [ ] 進階數據改 `StatBlock` 排版，**指標名仍連回 `/glossary/[slug]`**，缺值仍隱藏
- [ ] 逐季歷史：同季分組留白＋虛線、同層級換隊併列雙隊名
- [ ] 低階註記保留
- [ ] archived 的 `heading` 機制不變
- [ ] `components/player-detail/season-stats.test.tsx` 更新並綠
- [ ] `pnpm build` 綠——**特別確認 `getRegistry()` 的 build-fail 護欄仍會觸發**（可暫時把某個 metric 的 MDX 移走驗一次，驗完還原）
- [ ] `pnpm typecheck` 綠

## Comments

- 4 格挑選是**產品判斷**，若實作時覺得某項不合適可換，但要在 Comments 記下理由。
- 「4 格 ＋ 展開全表」是本票唯一有設計自由度的地方；其餘都是把既有邏輯換皮，不要順手改資料層。
