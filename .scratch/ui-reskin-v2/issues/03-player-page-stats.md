# 03 — 球員個人頁：數據區

**What to build:** 球員頁的數據看起來像雜誌而不是報表——本季成績先給每個層級四個重點大數字（附級距標籤如「優異」），想看細節再展開完整的二十欄表；逐季歷史一列一個「球季×層級」、同季分組、欄位多時可橫向滑動；進階數據仍可展開，且每個指標名都連得回名詞頁。

**Blocked by:** 02（同一頁，序列化避免編輯衝突）。**Blocks:** 06。

**Status:** done

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

- [x] 本季數據每層級一張卡：重點四格 ＋ 卡頭（`LevelBadge`／場次／「目前所在」）
- [x] 四格 hint 走**現有** `lib/glossary/bands.ts` 的 band lookup，未新建第二份
- [x] 完整 20 欄表在 `<details>` 內：sticky 左欄、橫滑提示、合計列加粗；**欄位一欄不少**
- [x] per-team 分列與合計列既有邏輯未重寫
- [x] 進階數據改 `StatBlock`，**指標名仍連回 `/glossary/[slug]`**，缺值仍隱藏
- [x] 逐季歷史：同季分組留白＋虛線、同層級換隊併列雙隊名
- [x] 低階註記保留；archived 的 `heading` 機制不變
- [x] `components/player-detail/season-stats.test.tsx` 更新並綠
- [x] `pnpm typecheck` 綠
- [x] **`pnpm build` 綠**——typecheck 與 vitest 都不驗 RSC 的 client/server 邊界，只有 `next build` 會（見票 02 Comments 的教訓）；並在 build 時**實際驗證 `getRegistry()` 護欄仍會觸發**（暫時移走某則 metric 的 MDX 驗一次，驗完還原）

## Comments

- 四格採打者 `AVG / OPS / HR / RBI`、投手 `ERA / WHIP / SO / IP`。`AVG / OPS / ERA / WHIP` 的 hint 僅從既有 glossary bands 讀取；`HR / RBI / SO / IP` 沒有已編寫的 bands，因此刻意留白，不編造評價。低於 `AA` 的層級同樣不顯示未授權的級距。
- 完整表保留原有 20 欄、per-team 分列、合計列與缺值規則；`<details>` 使用原生 HTML，維持 `season-stats.tsx` 為 server component。進階指標仍經 `metricSlug()` 連回名詞頁。
- 驗收時暫時移走 `wrc-plus.mdx`，`pnpm build` 依預期因 `getRegistry()` 護欄失敗，隨後已還原檔案並重新通過正式 build。

### Review 記錄（2026-08-13）— 兩項知情保留、不修

以下兩點在 review 時提出，batu 判斷**維持現狀**，記在此避免日後被當成缺陷重新「修正」：

1. **`battingFocus` / `pitchingFocus` 的命名**：這兩個函式回傳的是 `FocusStat[]`（資料），不是 JSX，卻曾以 PascalCase 命名而看起來像 component、並被直接呼叫而非以 JSX 使用。**已於後續修正改為小寫開頭**，此點僅供追溯。

2. **`STANDARD_SLUG` 是第二處「指標名 → 名詞頁 slug」的知識**（另一處是 `lib/glossary/registry.ts` 的 metric registry）。**這是無可避免的**：standard 類名詞依 `lib/glossary/schema.ts` 的 superRefine **明文禁止帶 `metric_keys`**，因此 registry 天生涵蓋不到 AVG／OPS／ERA／WHIP 這四則，只能以 slug 直接 `loadFrontmatter()`。
   - **不要為此把 standard 名詞塞進 metric registry**——那會違反 schema 的驗證規則，而該規則是刻意的（standard 在 v1 只做解釋、不參與球員頁的指標註冊與範例挑選）。
   - 若日後這份對照長大到難以維護，正解是在 glossary 側提供一個「以 slug 取 bands」的公開 helper，而不是繞過 schema。
