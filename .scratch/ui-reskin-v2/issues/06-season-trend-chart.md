# 06 — 球員頁季內走勢圖

**What to build:** 球員頁的數據區下方多一張本季走勢圖——投手看累積自責分率、打者看累積打擊率，隨比賽日推移。同季在不同層級出賽的球員，各層級一張圖分開累積。樣本太少時整區不出現。圖上標明畫的是什麼指標與最新數值。

**Blocked by:** 03（掛在數據區下方）。

**Status:** done

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §5.5（決議 B，含打者指標修正）。

---

## ⚠️ 開工前必讀：兩個坑與一項修正

### 坑 1：設計餵給它的數字不存在

`Phobos-UI/lib/players-data.ts` 的 `form: number[]`（如 `[58, 62, 55, 70, 66, 74, 80]`）是 0-100 的「狀態分數」——**不是任何棒球數據**，StatsAPI 沒有、我們 DB 也推不出來，是設計為了填圖自行編造的。

**不要照搬，也不要 mock 一份。** 媒體集錦可以用假資料是因為它在「等資料源」；這個在「等定義」，mock 等於把待決問題畫進 UI。

### 坑 2：走勢圖自我正規化

`Phobos-UI/components/sparkline.tsx` 的 `range = max - min || 1` 取自資料本身 ⇒ **只表達形狀、不表達幅度**。從 .250 爬到 .300 的球員，跟在 .290–.295 之間抖動的球員，畫出來一模一樣。

**⇒ 圖上必須標指標名與最新值。** 這是硬要求，不是 nice-to-have。

### 修正：打者畫打擊率，不是 OPS

plan §5.5 原建議「season-to-date OPS」，**開票前查證後不成立**——`game_batting_lines`（`lib/db/schema/games.ts:28-52`）**沒有 `hbp`、沒有 `sf`**，欄位只有：

```
pa, ab, h, doubles, triples, hr, rbi, r, bb, so, sb
```

- `OBP = (H + BB + HBP) / (AB + BB + HBP + SF)` → **算不出來**
- 因此 `OPS = OBP + SLG` 也**算不出來**
- `SLG = TB / AB` 可算（`TB = H + 2B + 2×3B + 3×HR`）；`AVG = H / AB` 可算

| 角色 | 畫什麼 | 算法 |
|---|---|---|
| 投手 | 本季累積 **ERA** | 累積 `er` × 27 ÷ 累積 `ip_outs` |
| 打者 | 本季累積 **AVG** | 累積 `h` ÷ 累積 `ab` |

> **把 HBP/SF 當 0 去近似 OBP 是不可以的**——會系統性低估，等於在圖上放一個沒有出處的數字，與拒絕「狀態分數」是同一條理由。
>
> 日後若要 OPS，須補 ETL 把 `hbp`／`sf` 寫進 `game_batting_lines`（schema ＋ ETL 變更）——**另一張票，不在本票範圍**。

---

## 實作

### Service

新增 `lib/services/player-trend.ts`（命名可調），輸出每層級一組時間序列。

- 資料源：`game_batting_lines`／`game_pitching_lines`，依 `game_date_us` 由舊到新累積
- **需要整季逐場，不是最近 N 場**。`getPlayerGameLog`（`lib/services/player-recent.ts:81`）預設 `limit = RECENT_GAMES_N = 10`，但**有 `limit` 參數**——查詢形狀可沿用，只是不要套那個上限
- **依層級分開累積**（球員同季可能在 MLB／3A 往返，跨層級混算沒有意義）——比照 `season-stats` 既有的層級分組
- 樣本不足整區隱藏：建議打者累積 `ab < 20`、投手累積 `ip_outs < 30`（＝10 局）。門檻寫成**具名常數**並在 Comments 說明理由
- `db` 可注入（比照 `lib/services/*` 既有慣例，測試吃 fixture）

### 元件

移植 `Phobos-UI/components/sparkline.tsx`（57 行，可直接複製），外框比照 `magazine-player-detail.tsx:298-321`：`LevelBadge` ＋標題 ＋圖。

- 標題為「**本季累積自責分率走勢**」／「**本季累積打擊率走勢**」——**不要**沿用設計的「近七場狀態走勢」，那是另一個東西
- **最新值要標出來**（補償自我正規化的坑）
- 線色：ERA **越低越好**、AVG 越高越好——若用 `--up`／`--down` 上色，**兩者方向要分開判斷**，別共用「上升＝好」

## Checklist

- [x] `player-trend.ts`：整季逐場、依層級分開累積、`db` 可注入
- [x] 投手 ERA、打者 **AVG**；**沒有近似 OBP／OPS**
- [x] 樣本門檻為具名常數，不足時整區隱藏
- [x] 走勢圖元件已移植，**圖上有指標名與最新值**
- [x] 標題是「本季累積…走勢」
- [x] 好壞方向：ERA 低為佳、AVG 高為佳，上色未共用同一條規則
- [x] 新增 `lib/services/player-trend.test.ts`：跨層級不混算、樣本不足回空、ERA/AVG 各一組已知輸入的期望值、**只有一場時不炸**
- [x] `pnpm test` 綠、`pnpm typecheck` 綠
- [x] **`pnpm build` 綠**——typecheck 與 vitest 都不驗 RSC 的 client/server 邊界，只有 `next build` 會（見票 02 Comments 的教訓）

## Comments

- ⚠️ `sparkline.tsx:20` 的 `const step = width / (data.length - 1)`：**`data.length === 1` 會得到 `Infinity`**。樣本門檻通常擋掉了，但仍要在元件或 service 明確處理。
- 這是本次拉皮**唯一新增資料衍生邏輯**的一票，因此測試要求高於其他票。
- 門檻採建議值並具名化：打者至少 20 AB、投手至少 30 outs（10 局）。前者避免極少打席的 AVG 被單場扭曲，後者避免短局數的 ERA 呈現為走勢；實測費爾柴德 MLB 的 19 AB 因此正確隱藏。
- SVG 的單點保護：`points.length === 1` 時 `step = 0`，不會做 `width / 0` 或產生 `Infinity`；合格的一場 20 AB fixture 已由測試覆蓋。
