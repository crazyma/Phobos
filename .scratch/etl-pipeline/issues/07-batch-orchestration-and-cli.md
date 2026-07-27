# 07 — 兩批編排 + CLI 工具（收尾）

**What to build:** 把各來源模組編成 morning／evening 兩批職責跑通端到端，並提供 resync 與手動補錄事件的 CLI 工具。

**Blocked by:** 03、04、05、06（所有來源模組就位後才編排）。

**Status:** ready-for-agent

- [ ] `morning` 批：昨日（美國比賽日）結算（逐場／賽果）＋球季整季重拉＋投影＋近況重算（spec-03 §2）
- [ ] `evening` 批：前瞻（當日賽程／先發預告）＋掃尾結算＋transactions＋roster/IL 對帳
- [ ] CLI 工具：`resync --season`、`resync --gamelog --from DATE`、`add-event`（補錄 manual 事件）、`reproject`（重放投影）
- [ ] 端到端跑通兩批；薄殼只測「來源失敗不中斷整批、`sync_runs` 正確落帳」
- [ ] cron 時刻先用 §2 建議值（morning 09:00／evening 17:30 台灣時間），上線後依實際結算延遲微調
