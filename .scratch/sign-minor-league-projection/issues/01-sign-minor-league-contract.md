# 01 — `sign` 沒有區分小聯盟約，把球員投影上大聯盟名單

**What to build:** 簽小聯盟約的球員，狀態不再被誤投影成「大聯盟・母隊」。以費爾柴德為例，站上目前顯示「大聯盟・水手」，但 MLB 實際名單是 Tacoma Rainiers（3A）——修好之後兩者要一致，且 `evening`／`manual` 批次的對帳不再對他發 mismatch 警告。

**Blocked by:** None — can start immediately。

**Status:** ready-for-agent

---

## 怎麼發現的

2026-08-13 跑 `manual`（`sync_run #430`）與 `evening`（`#432`）時，對帳來源連兩次發出：

```
reconciliation mismatch: player 656413（史都華·費爾柴德）
  team projected=136（水手・mlb）   observed=529（Tacoma Rainiers・aaa）
  suggested_manual_event: depart/trade
```

**這不是上游漏給事件。** 判斷依據：

- `#426`／`#427`／`#428`／`#429` 的 `sources_warnings` 都沒有 reconciliation 項，只有 `#430` 之後才有 ⇒ 變的是**上游名單快照**。
- 但在跑完**完整的** `morning`＋`evening`（含 transactions 來源）之後，`transaction_events` 仍是 **242 筆未變**、該球員最新事件仍停在 **2026-08-08** ⇒ 上游**沒有**新事件要給我們。

⇒ 是我們的投影規則沒接住。

## 成因（兩個獨立的，都已查證）

### 成因 A：`sign` 一律取 `to_team` 的隊/層級，而 `to_team` 是母隊

`etl/src/etl/sources/projection.py:63` 的 `_ROSTER_TYPES` 含 `sign`，於是走「`affiliation = rostered`、`team_id = to_team_id`、`level = team_levels[to_team_id]`」。spec-01 §B.3 的表格也是這樣寫的：

> `sign` / `trade` / `waiver_claim` / `send_down` → `rostered`（取 `to_team` 的隊/層級）

**但小聯盟約的 `to_team` 是母球團（MLB 層級），球員並不在大聯盟名單上。**

**實測：這條規則對我們的資料從來沒有正確過。**

```
transaction_events 裡的 sign 事件            6 筆
  其中 description 含 "minor league contract"  6 筆（100%）
  其中 to_team 解析出的 level 為 mlb           6 筆（100%）
```

六筆全貌：

| id | 球員 | 日期 | to_team | 投影出的層級 |
|---|---|---|---|---|
| 223 | 李灝宇 | 2021-06-15 | 143 費城人 | mlb |
| 268 | 林昱珉 | 2021-12-15 | 109 響尾蛇 | mlb |
| 170 | 鄧愷威 | 2024-11-29 | 137 巨人 | mlb |
| 136 | 史都華·費爾柴德 | 2025-12-20 | 114 守護者 | mlb |
| 145 | 史都華·費爾柴德 | 2026-07-05 | 136 水手 | mlb |
| 5281 | 史都華·費爾柴德 | 2026-08-08 | 136 水手 | mlb |

**只有費爾柴德這次露出來**，是因為多數情況下後續事件（`call_up`／`assign`／`send_down`）會蓋掉錯誤的中間狀態；他的 `sign` 剛好是最後一筆決定性事件。

### 成因 B：同日事件的排序退化成 `id`

排序鍵是 `(effective_date, announced_at, id)`（`projection.py` 的 `_sort_key`）。該球員 08-08 那兩筆：

```
id   | effective_date | announced_at            | type   | to_team
5280 | 2026-08-08     | 2026-08-08 00:00:00+08  | assign | 529（Tacoma・aaa）
5281 | 2026-08-08     | 2026-08-08 00:00:00+08  | sign   | 136（水手・mlb）
```

**`effective_date` 與 `announced_at` 完全相同**（`announced_at` 是當日午夜，等於沒有時間資訊）⇒ 排序落到 `id` ⇒ `sign`（5281）最後套用、蓋掉 `assign`。

**實測：這不是特例。**

```
同日多筆事件的 (球員, 日期) 組合            38 組
  其中 announced_at 也相同、排序退化成 id     38 組（100%）
```

⇒ **`announced_at` 對同日排序提供零資訊**，每一個多事件日的結果都由 ingest 順序決定。

> ⚠️ **兩個成因各自都足以造成這次的錯誤，也各自都能單獨修好這一例**——但它們是獨立的問題。請不要因為「改完 A 之後這個 case 對了」就認為 B 不存在。

## 要做的決定（本票的核心）

小聯盟約的 `sign` 應該怎麼投影？三個方向：

| | 做法 | 評估 |
|---|---|---|
| **A**（建議） | 小聯盟約的 `sign` 對**隊伍與層級 no-op**，只當時間軸事件——實際落點由同時期的 `assign` 決定 | 與 repo 既有的兩個先例一致：`assign` 的「`to_team` 無法解析 → 不變、不清隊」、以及裸 `activate` 的「**絕不以文字猜測隊伍**」。且**順帶讓這個 case 不再受成因 B 影響**（不論誰先誰後，結果都由 `assign` 決定） |
| **B** | 保留 `rostered` 與母隊參考，但 `level` 不設（留 null 或沿用前值） | 語意上「他在這個體系內」是對的，但 `level` 為 null 時前端要能顯示；且 `player_current_status` 的欄位約束要確認 |
| **C** | 不分小聯盟約，改為修排序（讓 `assign` 永遠贏過同日的 `sign`） | **不建議**——那是把語意硬編進排序，而 38 組同日事件裡還有其他型別組合，治不了根 |

**A 的待確認點**：若某球員簽了小聯盟約、但**沒有**後續 `assign`，他的歸屬會停在前一個狀態（以費爾柴德為例是 `declare_fa` 造成的 `free_agent`）。這是否可接受？六筆實測資料裡有沒有這種情況，請查證後在 Comments 記下。

**成因 B 的建議**：**不要試圖修排序**。上游沒有給同日的語意順序，任何猜測都是硬編。正解是讓投影規則**盡量與順序無關**（做法 A 正好達成這點）。請把「`announced_at` 全為當日午夜、38/38 的同日組合排序退化成 `id`」這個事實記進 spec-03 §9 或 spec-01 §B.3 當已知限制。

## 判定「小聯盟約」的方式

上游用 **description** 表達（`… signed free agent CF Stuart Fairchild to a minor league contract.`），typeCode 與 typeDesc 分不出來。

⚠️ 這與前兩次投影修正是**同一個模式**——上游用散文表達語意、我們的 enum 對照沒接住：

- 2026-07-27 `assign`：小聯盟指派被歸 `other`、投影不動隊（spec-01 B.3／C.3）
- 2026-08-10 裸 `activate`：`typeCode=SC` 且 description 含 `activated`、不含 injured/disabled list

請比照那兩次的做法：**片語比對寫在 transactions 來源或投影規則裡、要有測試釘住、且對 description 缺失時有明確行為**。

## Checklist

- [ ] 決定採 A／B／C 並在 Comments 寫下理由
- [ ] 小聯盟約的判定有實作、有測試釘住（含 description 為 null／不含該片語的 fallback 行為）
- [ ] 六筆既有 `sign` 事件重放後的結果逐筆列出（改前 vs 改後），確認沒有把原本正確的狀態改壞
- [ ] `uv run etl reproject` 後，**費爾柴德的投影為 Tacoma（529）／aaa**
- [ ] 重跑 `evening` 或 `manual`，**對帳不再對 656413 發 mismatch**
- [ ] 其餘四名 tracked 球員的狀態**不變**（改前先存一份快照對照）
- [ ] `spec-01 §B.3` 的投影規則表更新（`sign` 那列）
- [ ] 成因 B 的已知限制寫進 spec（`announced_at` 無同日鑑別力、38/38 退化成 `id`）
- [ ] `uv run pytest` 全綠
- [ ] Node 側 `pnpm test`／`pnpm typecheck` 綠（投影結果會流進 `lib/services`）

## ⚠️ 已補一筆 manual event 治標（2026-08-13）——修根因時必須處理它

站上先正確，但**根因未修**。已依 spec-01 §B.1 補錄：

```
manual event #6153  player 656413  type=assign
  effective_date=2026-08-08  announced_at=2026-08-08  to_team_id=529（Tacoma Rainiers）
  description: 人工補錄：對齊上游名單（Tacoma Rainiers）。事件重放因 sign 未區分
               小聯盟約而誤投影至水手大聯盟；治本見 sign-minor-league-projection 票。
```

補錄後投影為 `rostered / active / aaa / Tacoma Rainiers`，其餘四名 tracked 球員不變；重跑 `manual`（`sync_run #433`）**對帳已無 reconciliation 警告**。

**它為什麼能生效**：`assign` 與既有的兩筆 08-08 事件同 `effective_date`、同 `announced_at`，排序落到 `id`，而 #6153 是最大的 ⇒ 最後套用、蓋掉 `sign`。**注意這正是成因 B**——這筆補錄本身就是靠「排序退化成 `id`」才成立的，並不穩固。

**修根因時要做的**：

- 改完規則後，**先在不刪這筆的情況下重放**，確認結果仍是 Tacoma（做法 A 會讓上游那筆 `assign` 自己勝出，這筆補錄變成冗餘但無害的重複）。
- 然後**評估是否刪除 #6153**。它記載的事實（他被指派到 Tacoma）上游本來就有一筆同義的 `assign`（id 5280），**留著會讓時間軸出現兩筆語意重複的指派**。建議規則修好後刪掉，並重放驗證。
- ⚠️ **這是本票唯一准許動資料的地方**，而且只准刪這一筆補錄；其餘一律靠規則修正。

## Comments

- **`etl/src/etl/cli.py` 的 `TRANSACTION_TYPES` 少了 `waiver_claim`**（2026-08-13 補事件時發現）。註解寫著「Mirrors the Drizzle `transaction_type` enum」，但 2026-08-07 新增 `waiver_claim` 時沒同步 ⇒ **目前無法用 CLI 補一筆 manual `waiver_claim` 事件**。與本票同源（enum 擴充、鏡像沒跟上），順手修掉即可，不必另開票。
- **不要直接改 `player_current_status`**。spec-01 §B.1 明訂：投影表由事件流重放產生，**禁止**直接改；上游漏事件時才人工補 `source='manual'` 事件。本票要修的是規則本身，不是資料。
- 對帳是**只發訊號、絕不自動修正**（spec-03 §6），這次它正確地做了它該做的事——本票不要改動這個行為。
