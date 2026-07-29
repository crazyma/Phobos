# 01 — `raw_payloads` 保留策略：唯一真正佔空間的表，且只增不減

**What to build:** `raw_payloads` 是 DB 裡唯一有體積問題的表——**6.1 MB，佔整個 DB 的 40%**，而裡面只有 **3 天**的資料（2026-07-27 ~ 07-29）。寫入是集中式的（`etl/src/etl/statsapi.py:67`，每次 API 呼叫自動記一筆），append-only、無 FK、**沒有任何保留或清理機制**。

定位見 `docs/adr/decisions.md:164`：

> 上游格式可能隨時變動；有 raw layer，之後只要重寫轉換邏輯、reprocess 既有資料即可，不必重抓。

**現況組成**（payload 文字量合計 3.8 MB；表總計 6.1 MB 含 TOAST 與索引）：

| endpoint | 筆數 | 合計 | 平均 | 說明 |
|---|---:|---:|---:|---|
| `people/*/stats`（gameLog、季數據） | 216 | 2740 kB | 13 kB | 72%，最大宗 |
| `teams` | 18 | 516 kB | 29 kB | 231 支球隊名冊，內容幾乎不變卻每批重存 |
| `schedule` | 12 | 365 kB | 30 kB | 比賽結算後價值大幅下降 |
| `transactions` | 10 | 196 kB | 20 kB | 量小、reprocess 價值最高（投影的解讀基礎） |

成長量級：3 天約 3.8 MB → 5 名球員下年約數百 MB；15 名球員時 `people` 那 72% 會等比放大。**這是 `games` 那 929 筆殘留的同類問題，但規模大一個數量級。**

**Blocked by:** None。獨立票。

**Status:** ready-for-agent

## ⚠️ 動工前必須先決策：reprocess 到底會不會做？

全 repo 掃過：**`raw_payloads` 有寫入端（`raw.py:29-37`），零讀取端**。TS 只有 `lib/db/schema/operational.ts:26` 的 schema 定義、無任何查詢；ETL CLI 有 `resync`／`add-event`／`reproject`／`backfill`，**沒有 `reprocess`**。也就是說 ADR 承諾的能力設計了但從未實作，今天真要 reprocess 仍得現寫腳本。

保留策略該多激進，完全取決於這題的答案：

| 若… | 保留策略應該是 |
|---|---|
| **會做 reprocess** | 保守：對高價值 endpoint（`transactions`、`people/*/stats`）留長一點，並補上 `etl reprocess` 指令讓 raw 真的有用 |
| **不會做 reprocess** | 激進：raw 只剩「除錯時回看上游回了什麼」的價值，全部留 7–14 天即可，體積問題當場消失 |

**先跟 batu 確認再動工。** 兩者的實作量差很多。

## 已排除的兩個方案（實測數據）

動工前不必再試這兩條路，我量過了：

- **內容雜湊去重** —— 對最大宗的 `people` 幾乎無效：216 筆只有 60 筆相異，但去重後 2740 kB → **2701 kB（僅省 1.4%）**。因為重複的都是小 payload（球員未在該 sportId 出賽的空回應），真正佔空間的 gameLog 每次抓都多一場比賽、位元組必不相同。只有 `teams` 有效（516 → 172 kB，省 67%）
- **每個 `(endpoint, params)` 只留最新一份** —— 全表 256 → 234 筆、3817 → 3270 kB，**僅省 14%**。因為 `params` 內嵌日期（`endDate: 2026-07-29`、`startDate`…），每天抓都是新 key，天然不會重複

**結論：唯一有效的槓桿是「按 endpoint 類型設保留天數」（TTL）。**

## Checklist

- [ ] 先取得上面的 reprocess 決策，再定各 endpoint 的保留天數
- [ ] 保留策略以 endpoint 類型分級（建議草案，待決策後定案）：
  - `transactions` — 量最小、價值最高（投影解讀的基礎），留最久
  - `people/*/stats` — 量最大；gameLog 每次回傳完整球季內容，**舊的一份被新的一份完全涵蓋**，可留最短
  - `schedule` — 比賽結算後由 `games` 取代，價值最低
  - `teams` — 近乎靜態卻每批重存，是四者中最沒必要逐批留的
- [ ] 清理實作放在批次收尾（比照 `games-role-split` 票 02 的位置），與 ingest 同一 transaction；**單純刪列，不做歸檔**
- [ ] 一次性清掉存量
- [ ] `docs/spec/spec-03-etl-pipeline.md` 與 `docs/adr/decisions.md` §8.1 補上保留策略——ADR 目前只說「有 raw layer 可 reprocess」，沒說留多久，是這個坑的源頭
- [ ] 測試：各 endpoint 依自己的天數被清、未過期者不動、清理失敗不中斷批次
- [ ] 跑一次批次後 `python3 scripts/db/snapshot.py` 確認體積下降

## Comments

- 這張表**已經被減量過一次**：`DEVLOG:227` 的 gamelog refactor 決策明確寫「raw 停存 boxscore」，當初 120 份整場 boxscore 就是那樣砍掉的。所以「什麼該進 raw」一直是有意識管理的，**只是從來沒有時間維度的管理**。本票補的是後者。
- 若決策為「會做 reprocess」，`etl reprocess` 指令本身應另開票，不塞進這張。
