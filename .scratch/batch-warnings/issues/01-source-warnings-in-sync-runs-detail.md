# 01 — 讓 source 能回報 warning，落進 `sync_runs.detail`

**What to build:** 批次的 per-source 結果目前是**二元**的——`etl/src/etl/syncrun.py:24-29`：

```python
@dataclass
class SourceResult:
    name: str
    ok: bool
    error: Optional[str] = None
```

`etl/src/etl/batch.py:53-59` 只有兩種結局：`run()` 正常返回 → `commit()` ＋ `ok=True`；拋例外 → `rollback()` ＋ `ok=False`。**沒有「成功但有話要說」這個狀態。**

於是所有 source 級的告警只能走 `logger.warning`，事後在 `sync_runs` 裡完全查不到。本票補上 warning 通道。

**Blocked by:** None。純 ETL 內部改動，與其他票無相依。

**Status:** done（2026-08-06）

---

## 這不是「加個功能」，是規格債

`docs/spec/spec-03-etl-pipeline.md:77`（§6 狀態投影與對帳）明文指定告警落點：

> **對帳**：evening 批抓的 roster/IL 快照與投影結果比對；不一致 → log 告警（**`sync_runs.detail`**），提示補錄 manual 事件——**不自動改投影**（維持事件為真相）。

而 `etl/src/etl/sources/projection.py:393` 現在只是 `logger.warning(...)`，**進不了 `detail`**。spec-01 C.9 也把 `sync_runs` 定位成批次稽核的落點。**規格指定的東西從來沒接上。**

## 現有的六個 warning 產生者（全部落空）

| 位置 | 內容 | 性質 |
|---|---|---|
| `sources/projection.py:393` | roster/IL 對帳不一致（`player_id`／`field`／`projected`／`observed`） | **spec-03 §6 指名要進 detail** |
| `sources/transactions.py:383` | team ref 不在 `teams` 內、設 NULL | 例行 |
| `sources/season_stats.py:500` | 丟掉非納入 sportId 的球隊列 | 例行 |
| `sources/games.py:258` | schedule 的 team ref sanitize | 例行 |
| `sources/savant.py:262` | 某年份抓取失敗、已跳過 | 偶發 |
| `statsapi.py:102` | 上游呼叫重試 | 偶發 |

2026-07-30 的批次紀錄寫「兩個 WARNING 皆既有 sanitize 規則正常運作」——那是當下看終端機才知道的，事後翻 `sync_runs` 查不到。

## ⚠️ 關鍵約束：`derive_status` 不能動

**warning 必須是純資訊性的，絕不可影響 `success`／`partial`／`failed` 判定。**

理由：上表六個裡有四個是**例行**告警（sanitize 每批都會發生）。若 warning 會讓批次落成 `partial`，那每一批都是 partial，這個欄位就失去意義——反而比現在更糟。

`syncrun.py:32-46` 的 `derive_status` 只看 `r.ok`，維持原樣即可。

## 觸發本票的具體案例

`xwoba-savant` 票驗收時，savant 的多年份抓取遇到「一年失敗要不要拖垮全部」的問題。因為 `batch.py` 是「拋例外就 rollback 整個 source」，要保住已成功年份的資料就**不能拋**——結果部分失敗的批次會顯示成 `success`，失敗年份只留在 log。

這是拿可見度換資料，而且它撞的正是本票要補的那面牆。本票完成後，savant 應改回報 warning（見下方 checklist）。

## 範圍很小：前端沒有讀 `detail`

- `grep -rn "detail" lib/ --include="*.ts"` 對 `sync_runs.detail` **零命中**（唯一結果是 `player-detail.test.ts` 的無關字串）。網站只讀 `getLastSyncedAt()` 的時間戳
- `sync_runs.detail` 是 **jsonb**，加欄位**不需要 migration**
- 所以這是純 ETL Python 內部改動，沒有對外合約要顧

## Checklist

- [x] `etl/src/etl/syncrun.py`：`SourceResult` 加結構化 `warnings` 欄位（預設空）。
- [x] `syncrun.py`：`build_detail` 以 `sources_warnings` 依 source 輸出；無 warning 時維持舊 detail 形狀。
- [x] `syncrun.py`：`derive_status` 保持不動，並註明 warning 不影響 status 的理由。
- [x] `etl/src/etl/batch.py`：source 可回傳 warning；`run_batch` 寫入 `SourceResult`。
- [x] `sources/projection.py`：對帳 mismatch 以結構化 warning 回報，補完 spec-03 §6。
- [x] 其餘五處：transactions、season_stats、games、savant 與 StatsAPI retry 全數接上。
- [x] `docs/spec/spec-03-etl-pipeline.md`：§6／§7 記錄 warning 落點與不影響 status 的語意。
- [x] 測試：warning 不改變 `derive_status`，`build_detail` 形狀與 StatsAPI retry 已覆蓋。
- [x] `docs/DEVLOG.md`：完成紀錄已回寫。

## Comments

- 本票**不做**告警的通知／推播，只是讓它有地方落。要不要在網站或別處呈現是另一件事。
- `sync_runs` 一天兩批、`detail` 才幾百 bytes，加 warning 後仍然微不足道（`sync-runs-test-isolation` 票已算過：五年三千多列）。不需要擔心體積。
- 順帶效益：`sync-runs-test-isolation` 票保住批次歷史，圖的就是「哪個 source 常掛、partial 出現過幾次」的稽核能力。本票讓那份歷史真正**有東西可稽核**——目前就算留住了，例行 sanitize 與對帳結果一樣看不到。
- 2026-08-06：完成；`detail.sources_warnings` 採新增 top-level key，warning-free run 保留舊 detail 形狀。
