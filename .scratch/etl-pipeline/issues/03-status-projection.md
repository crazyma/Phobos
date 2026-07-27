# 03 — 狀態 vertical：transactions → transaction_events → 投影 → player_current_status

**What to build:** 抓球員異動、記成事件流，並以重放事件流投影出目前狀態——讓 `/players` 顯示每位球員真實的隊伍、層級與狀態一句。這是點亮頁面狀態的最高價值切片。

**Blocked by:** 01（骨架）、02（team 外鍵需要 `teams` 列）。

**Status:** ready-for-agent

- [ ] StatsAPI transactions（tracked 球員）→ transform → `transaction_events`，upsert by `source_tx_id`；typeDesc → `type` enum 對照（waiver claim 等歸類，未知→ `other`）
- [ ] 每批收尾：事件流依 `(effective_date, announced_at, id)` **全量重放**（spec-01 B.3 規則）為**純函式**，寫 `player_current_status`（歸屬×健康、team／level／il_detail、`as_of_event_id`）
- [ ] roster/IL 快照**對帳**：與投影結果比對，不一致→ 記 `sync_runs.detail` 告警並提示補錄 manual 事件，**不自動改投影**（維持事件為真相來源）
- [ ] 測試：投影純函式表驅動（同 spec-01 §E 概念）；transform fixture 測
- [ ] 驗收：`/players` 對有事件的球員顯示真實 隊伍／層級／狀態一句（含 IL 細節）
