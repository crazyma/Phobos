# 01 — `raw_payloads` 保留策略：唯一真正佔空間的表，且只增不減

**What to build:** `raw_payloads` 是 DB 裡唯一有體積問題的表——**6.0 MB，佔整個 DB（15 MB）的 40%**，而裡面只有 **4 天**的資料（2026-07-27 ~ 07-30）。寫入是集中式的（`etl/src/etl/statsapi.py:67`，每次 API 呼叫自動記一筆），append-only、無 FK、**沒有任何保留或清理機制**。

定位見 `docs/adr/decisions.md:164`：

> 上游格式可能隨時變動；有 raw layer，之後只要重寫轉換邏輯、reprocess 既有資料即可，不必重抓。

**現況組成**（2026-08-03 重新量測，339 筆；payload 文字量合計 4921 kB，表總計 6152 kB 含 TOAST 與索引）：

| endpoint | 筆數 | 合計 | 平均 | 佔比 | 說明 |
|---|---:|---:|---:|---:|---|
| `people/*/stats`（gameLog、季數據） | 240 | 3133 kB | 13 kB | 64% | 最大宗 |
| `schedule` | 18 | 644 kB | 36 kB | 13% | 比賽結算後價值大幅下降 |
| `teams` | 18 | 516 kB | 29 kB | 10% | 231 支球隊名冊，內容幾乎不變卻重複存 |
| `people`（bio） | 48 | 333 kB | 7 kB | 7% | 球員基本資料，近乎靜態 |
| `transactions` | 15 | 294 kB | 20 kB | 6% | 量小、reprocess 價值最高（投影的解讀基礎） |

成長量級：4 天 4921 kB ≈ **每天 1.2 MB**（5 名球員）→ 一年數百 MB；15 名球員時 `people/*/stats` 那 64% 會等比放大。**這是 `games` 那 1133 筆殘留的同類問題，但規模大一個數量級。**

**Blocked by:** None。獨立票。

**Status:** done（2026-08-06）

## reprocess 定位 —— 決策已定（2026-08-03，batu）

**採「分級 TTL，暫不實作 `etl reprocess`」。** 各 endpoint 依價值設不同保留天數（高價值的 `transactions` 留久、量最大的 `people/*/stats` 留短），體積問題當場解決；同時保住日後真要 reprocess 時的高價值素材。`etl reprocess` 指令**不在本票範圍**，等真有需求再另開票。

背景：全 repo 掃過，`raw_payloads` 有寫入端（`raw.py:29-37`）但**沒有任何 production 讀取端**——TS 只有 `lib/db/schema/operational.ts:26` 的 schema 定義、無查詢；ETL CLI 有 `resync`／`add-event`／`reproject`／`backfill`，**沒有 `reprocess`**。唯二會讀它的是 `scripts/db/snapshot.py:73-78` 的快照抽樣與 `etl/tests/test_integration_db.py` 的測試斷言，兩者都不是 reprocess 用途。也就是說 ADR §8.1 承諾的能力設計了但從未實作，今天真要 reprocess 仍得現寫腳本。

**這個決策讓本票變成純粹的「加 TTL + 清存量」，實作量落在原先估的輕量端。**

## 已排除的兩個方案（實測數據）

動工前不必再試這兩條路，我量過了：

- **內容雜湊去重** —— 對最大宗的 `people/*/stats` 幾乎無效：（07-29 量測）216 筆只有 60 筆相異，但去重後 2740 kB → **2701 kB（僅省 1.4%）**。因為重複的都是小 payload（球員未在該 sportId 出賽的空回應），真正佔空間的 gameLog 每次抓都多一場比賽、位元組必不相同。只有 `teams` 有效（516 → 172 kB，省 67%）
- **每個 `(endpoint, params)` 只留最新一份** —— 全表 256 → 234 筆、3817 → 3270 kB，**僅省 14%**。因為 `params` 內嵌日期（`endDate: 2026-07-29`、`startDate`…），每天抓都是新 key，天然不會重複

（上列兩項是 2026-07-29 的量測，樣本較小但結論與比例不隨規模改變，不必重測。）

**結論：唯一有效的槓桿是「按 endpoint 類型設保留天數」（TTL）。**

## Checklist

- [x] 保留策略以 endpoint 類型分級（天數 2026-08-06 由 batu 定案，`RETENTION_RULES`）：
  - `transactions` **365 天** — 量最小、價值最高（投影解讀的基礎）
  - `people`（bio）**90 天**、`teams` **60 天** — 60 是實測後上調的：`teams` 只在 evening／manual 抓、實測 8 天沒進新的一筆，30 天有清空風險
  - `schedule` **30 天** — 結算後由 `games` 取代
  - `people/*/stats` **14 天**、`savant` **14 天** — 佔 85% 的量，且新的完全涵蓋舊的
  - **未分類的 `(source, endpoint)` 保留不刪並告警**，不設 catch-all 預設天數
- [x] 清理實作放在批次收尾（`raw_retention` source，排在 `build_sources` 最後）。註：與 ingest **不是**同一 transaction——batch 的 per-source 隔離讓清理自己 commit，清理失敗只回滾清理本身，正好滿足「清理失敗不中斷批次」
- [x] 一次性清掉存量：刪除 id 1278~1284 那 7 筆全聯盟 CSV（1679 kB）＋ `vacuum full`
- [x] `docs/spec/spec-03-etl-pipeline.md` §7 與 `docs/adr/decisions.md` §8.1 補上保留策略
- [x] 測試：`etl/tests/test_raw_retention.py` 9 項（分級到期、`people` 不被 `people/*/stats` 誤掃、未分類保留並告警、當批寫入不自清、DB 端到端、每批最後一棒）
- [x] 體積驗證：`raw_payloads` 6200 kB → **1376 kB**、DB 16 MB → **11 MB**

## Comments

- 這張表**已經被減量過一次**：`DEVLOG:227` 的 gamelog refactor 決策明確寫「raw 停存 boxscore」，當初 120 份整場 boxscore 就是那樣砍掉的。所以「什麼該進 raw」一直是有意識管理的，**只是從來沒有時間維度的管理**。本票補的是後者。
- `etl reprocess` 指令**不做**（2026-08-03 決策），日後真有需求再另開票。但 TTL 的分級刻意讓高價值素材（`transactions`）留得久，就是為了不把那扇門關死。
- 清理實作時記得：`scripts/db/snapshot.py` 會抽樣顯示 `raw_payloads` 最新幾筆，TTL 上線後快照內容會跟著變短——這是預期行為，不是快照壞了。

### 新增 endpoint 類型：`savant`（2026-08-03，本票仍未動工）

`xwoba-savant` 票上線後多了一個 `source='savant'` 的 raw 類型，設 TTL 時要涵蓋它。兩件事要知道：

- **它一度讓本票的問題惡化一倍。** 初版每批把**整個聯盟**的 CSV 存進 raw——實測 7 筆／1679 kB，
  日增從約 1.2 MB 變成約 2.9 MB。已在該票的後續修正裡改成**只存 tracked 球員的列**
  （同一批 → 1 筆／約 1 kB），**日增回到原估**。本票的分級 TTL 設計不受影響。
- **存量待掃**：改法只影響往後寫入，既有那 **7 筆全聯盟 CSV（合計約 1.68 MB，id 1278~1284）**
  仍在表裡，屬本票「一次性清存量」的範圍。
- TTL 分級的定位建議：savant 是**每批可重抓、且新的完全涵蓋舊的**（同一年重抓即最新），
  性質接近 `people/*/stats`，可歸最短那一級。


### 完成紀錄（2026-08-06）

實作 `etl/src/etl/sources/raw_retention.py`：先把 `(id, source, endpoint, fetched_at)` 撈出來（**刻意不 select `payload`**），在 Python 端純函式 `plan_prune` 判定到期，再依 id 刪除。之所以不寫成一句 SQL DELETE，是為了讓「分級規則」只有一份實作、能不接 DB 純測，順帶讓「未分類 endpoint」自然浮出來。

**TTL 掃不到的東西才是存量的重點。** 上線當天 dry-run 的結果是 **would delete 0** —— 表裡最舊的一筆是 07-27（10 天），連最短的 14 天都還沒到。真正的存量問題不是「舊資料沒清」，是那 7 筆 bug 產物；TTL 對它們無效（08-03 才寫入）。所以「一次性清存量」是**獨立於 TTL 的一次手動刪除**，不是跑一次 sweep 就好——這點原票沒說清楚。

**體積驗證**：刪 7 筆（1679 kB 文字量）+ `vacuum full` 後，`raw_payloads` **6200 kB → 1376 kB**、DB **16 MB → 11 MB**。降幅遠大於刪掉的文字量，因為 ① jsonb 在磁碟上是 TOAST 壓縮的，`length(payload::text)` 量的是解壓後的大小；② 表本身累積了 dead tuple 膨脹，`vacuum full` 一併回收。**換句話說：本票量測用的「文字量」數字一路都高估了磁碟佔用**，raw 佔全庫 40% 有相當部分是膨脹而非資料。往後看體積要以 `pg_total_relation_size` 為準。

刪除前已把那 7 筆 dump 成 `savant_legacy_rows.sql`（1.6 MB，session scratchpad，非 repo）備查；內容是可從 Savant 重抓的全聯盟 CSV，不具保存價值。

`etl prune-raw [--dry-run]` 為手動觸發用；批次每次收尾都會自己掃。
