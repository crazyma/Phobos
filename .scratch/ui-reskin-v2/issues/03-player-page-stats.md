# 03 — 球員個人頁：數據區

**What to build:** 球員頁的數據看起來像雜誌而不是報表——本季成績先給每個層級四個重點大數字（附級距標籤如「優異」），想看細節再展開完整的二十欄表；逐季歷史一列一個「球季×層級」、同季分組、欄位多時可橫向滑動；進階數據仍可展開，且每個指標名都連得回名詞頁。

**Blocked by:** 02（同一頁，序列化避免編輯衝突）。**Blocks:** 06。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.3、§3。

---

## 核心問題：四格 vs 二十欄

設計的 `StatCards`（`Phobos-UI/components/magazine/magazine-player-detail.tsx:121-179`）一個層級只放 4 個大數字。我們現況（`components/player-detail/season-stats.tsx`）是：

- 打擊 **20 欄**（`:24-45`）、投球 **20 欄**（`:47-68`）
- per-team 分列 ＋ **重算的合計列**（`:108-117`）
- 低階層級「僅供參考」註記（`:200`）
- 每組一個 `<details>` 進階數據（`:132-162`），每項連回名詞頁

**這不是樣式差異，是差一個量級。** 決議：**「重點四格 ＋ 可展開完整表」兩層。**

### 第一層：重點四格

用 `StatBlock` 樣板（`styleguide-page.tsx:254`：`border-l-2 border-accent` ＋大寫 mono 指標名 ＋大字數值 ＋ hint 小字）——**本票新建，票 01 未帶**。每層級一張卡，卡頭是 `LevelBadge` ＋「N 場」＋「目前所在」標記（`magazine-player-detail.tsx:153`）。

| 角色 | 建議四格 |
|---|---|
| 打者 | AVG / OPS / HR / RBI |
| 投手 | ERA / WHIP / SO / IP |

`StatBlock` 的 hint 位置放**級距標籤**——這正是 `lib/glossary/bands.ts` 已在做的事，**先找現成的 band lookup，不要做第二份**。

### 第二層：完整表（`<details>` 展開）

展開後是現有 20 欄表格，外觀改用設計的逐季表樣式（`magazine-player-detail.tsx:345-405`）：`overflow-x-auto` ＋ `min-w-[52rem]` ＋ **sticky 左欄**（`:349`、`:379`）＋「← 左右滑動查看更多欄位 →」提示（`:342`，`lg:hidden`）；合計列以 `border-y-2 border-foreground` 加粗區隔。

**20 欄一欄都不能少**；`teamCell()`、`total` 等既有邏輯不要重寫。

## 進階數據

現況 `AdvancedStats`（`season-stats.tsx:132-162`）是 `<details>` ＋一排連回名詞頁的指標。改用 `StatBlock` 排版。

> ⚠️ **每個指標名必須維持連回 `/glossary/${metricSlug(key)}` 的連結。** 這是 spec-04 §D 雙向連結的一半，且 `getRegistry()` 的 build-fail 護欄靠它（plan §5.3）。**不可改成純文字或 modal。**

缺值隱藏規則（`:143` 的 `.filter((m) => m.value !== null)`）不變——小聯盟本來就大多沒有進階值（DEVLOG 2026-08-07：小聯盟不顯示 wOBA/xwOBA/wRC+/WAR/FIP）。

## 逐季歷史

現況是「依球季分組 → 依層級分區 → per-team 列」。設計的逐季表是「一列一個(球季×層級)」，同季第二列以後球季欄留白形成分組（`:380`），同層級換隊併列雙隊名（`:384`）。

**以我們的 `Season` 型別為準**（`lib/services/player-seasons.ts`），只借外觀。同季分組留白 ＋ 虛線分隔（`:372-376`）值得照做。

## 其他保留

- 低階層級「僅供參考」註記（`season-stats.tsx:200`、`:215`）保留，改 kicker 小字
- archived 用 `heading` 參數改標題為「生涯總成績」（`app/players/[id]/page.tsx:64-67`），機制不變

## Checklist

- [ ] 本季數據每層級一張卡：重點四格 ＋ 卡頭（`LevelBadge`／場次／「目前所在」）
- [ ] 四格 hint 走**現有** `lib/glossary/bands.ts` 的 band lookup，未新建第二份
- [ ] 完整 20 欄表在 `<details>` 內：sticky 左欄、橫滑提示、合計列加粗；**欄位一欄不少**
- [ ] per-team 分列與合計列既有邏輯未重寫
- [ ] 進階數據改 `StatBlock`，**指標名仍連回 `/glossary/[slug]`**，缺值仍隱藏
- [ ] 逐季歷史：同季分組留白＋虛線、同層級換隊併列雙隊名
- [ ] 低階註記保留；archived 的 `heading` 機制不變
- [ ] `components/player-detail/season-stats.test.tsx` 更新並綠
- [ ] `pnpm build` 綠，且**實際驗證 `getRegistry()` 護欄仍會觸發**（暫時移走某則 metric 的 MDX 驗一次，驗完還原）
- [ ] `pnpm typecheck` 綠

## Comments

- 四格挑選是**產品判斷**；實作時若覺得某項不合適可換，但要在 Comments 記下理由。
- 「四格 ＋ 展開全表」是本票唯一有設計自由度的地方；其餘是把既有邏輯換皮，**不要順手改資料層**。
