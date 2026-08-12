# 07 — sparkline：季內累積走勢（投手 ERA／打者 AVG）

**What to build:** 球員頁「近期比賽紀錄」下方的小折線圖。**不畫設計原本那個編造的 0-100「狀態分數」**，改畫**季內累積走勢**——語意誠實、資料現成。

**Blocked by:** 04（掛在數據區下方）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §5.5（決議 B）。

---

## ⚠️ 開工前先讀：兩個坑與一個修正

### 坑 1：設計餵給它的數字不存在

`Phobos-UI/lib/players-data.ts` 的 `form: number[]`（如林昱珉 `[58, 62, 55, 70, 66, 74, 80]`）是 0-100 的「狀態分數」——**不是任何棒球數據**，StatsAPI 沒有、我們 DB 也推不出來，是設計為了填圖自行編造的。**不要照搬，也不要 mock 一份**（媒體集錦可以 mock 是因為它在「等資料源」；這個在「等定義」，mock 等於把待決問題畫進 UI）。

### 坑 2：sparkline 自我正規化

`Phobos-UI/components/sparkline.tsx` 的 `range = max - min || 1` 取自資料本身 ⇒ **只表達形狀、不表達幅度**。從 .250 爬到 .300 的球員，跟在 .290–.295 之間抖動的球員，畫出來一模一樣。

**⇒ 圖上必須標指標名與起訖值**，不可無標示。這是本票的硬要求，不是 nice-to-have。

### 修正：打者畫 AVG，不是 OPS

plan §5.5 原本建議「season-to-date OPS」。**開票前查證後不成立**——`game_batting_lines`（`lib/db/schema/games.ts:28-52`）**沒有 `hbp`、沒有 `sf`**：

```
pa, ab, h, doubles, triples, hr, rbi, r, bb, so, sb   ← 就這些
```

- `OBP = (H + BB + HBP) / (AB + BB + HBP + SF)` → **算不出來**
- 因此 `OPS = OBP + SLG` 也**算不出來**
- `SLG = TB / AB` → 可算（`TB = H + 2B + 2×3B + 3×HR`）
- `AVG = H / AB` → 可算

**決議：打者畫 `AVG`。** 把 HBP/SF 當 0 去近似 OBP 是**不可以**的——會系統性低估，等於在圖上放一個沒有出處的數字。

| 角色 | 畫什麼 | 算法 |
|---|---|---|
| 投手 | season-to-date **ERA** | `累積 ER × 27 ÷ 累積 ipOuts` |
| 打者 | season-to-date **AVG** | `累積 H ÷ 累積 AB` |

> 若日後想要 OPS，得補 ETL 把 `hbp` / `sf` 寫進 `game_batting_lines`（schema 變更＋ETL 改動）——**那是另一張票，不在本票範圍**。

---

## 實作

### Service

新增 `lib/services/player-trend.ts`（命名可調），輸出每個層級一組時間序列。

- 資料源：`game_batting_lines` / `game_pitching_lines`，依 `game_date_us` 由舊到新累積
- **需要整季的逐場，不是最近 N 場**。`getPlayerGameLog`（`lib/services/player-recent.ts:81`）預設 `limit = RECENT_GAMES_N = 10` 但**有 `limit` 參數**，查詢形狀可沿用，只是不要套那個上限
- **依層級分開**（球員同季可能在 MLB/3A 往返，累積不能跨層級混算）——比照 `season-stats` 既有的層級分組
- 樣本太少時整區隱藏：建議打者 `累積 AB < 20`、投手 `累積 ipOuts < 30`（＝10 局）就不畫。門檻寫成具名常數並在 Comments 說明理由
- `db` 可注入（比照 `lib/services/*` 既有慣例，測試吃 fixture）

### 元件

移植 `Phobos-UI/components/sparkline.tsx`（57 行，可直接複製），外框比照 `magazine-player-detail.tsx:298-321`：`LevelBadge` ＋ 標題 ＋ 圖。

**標題與標示（本票硬要求）：**

- 標題改「**本季累積 ERA 走勢**」／「**本季累積打擊率走勢**」——**不要**沿用設計的「近七場狀態走勢」（那是另一個東西）
- 圖的起點值與終點值要標出來（至少終點）
- 線色：投手 ERA **越低越好**、打者 AVG 越高越好——若要用 `--up`/`--down` 上色，**方向要分開判斷**，別兩者都用「上升＝好」

## Checklist

- [ ] `player-trend.ts`：整季逐場、依層級分開累積、`db` 可注入
- [ ] 投手 ERA（`er × 27 ÷ ipOuts`）、打者 **AVG**（`h ÷ ab`）；**沒有近似 OBP／OPS**
- [ ] 樣本門檻為具名常數，不足時整區隱藏
- [ ] `sparkline.tsx` 移植
- [ ] **圖上有指標名與終點值**（自我正規化的坑已被標示補償）
- [ ] 標題是「本季累積…走勢」，不是「近七場狀態走勢」
- [ ] 好壞方向：ERA 低為佳、AVG 高為佳，上色不共用同一條規則
- [ ] 新增 `lib/services/player-trend.test.ts`：跨層級不混算、樣本不足回空、ERA/AVG 各一組已知輸入的期望值、只有一場時不炸（`step = width / (data.length - 1)` 在單點會除以 0）
- [ ] `pnpm test` 綠、`pnpm typecheck` 綠

## Comments

- ⚠️ `sparkline.tsx:20` 的 `const step = width / (data.length - 1)`：**`data.length === 1` 會 `Infinity`**。樣本門檻通常擋掉了，但仍要在元件或 service 明確處理。
- 這是本次拉皮唯一**新增資料衍生邏輯**的一票，其餘都是換皮。因此測試要求比其他票高。
