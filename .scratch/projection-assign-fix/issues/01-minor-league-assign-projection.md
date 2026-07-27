# 01 — 小聯盟 Assign 事件納入狀態投影（修正下放球員顯示錯隊）

**What to build:** 讓「小聯盟指派」異動（StatsAPI「assigned to [隊]」／typeCode `ASG`）真正**移動球員的目前隊伍/層級**，修正「被下放到小聯盟的球員在 `/players` 卻顯示 MLB 隊」的錯誤。目前這類事件被歸為 `other`、投影不跟，導致費爾柴德（實際 Tacoma/3A、顯示 SEA/MLB）、林昱珉（實際 Reno/3A、顯示 AZ/MLB）等下放球員顯示錯誤——而台灣新秀多在小聯盟，正中核心情境。

**背景（診斷）:** 事件史完整（2020+），問題在分類：`ASG`→`other`，而 `other` 在投影狀態機（spec-01 B.3）不動隊。決策（2026-07-27，batu）：**採正解**——新增 `assign` 型別並在 B.3 加規則。spec-01 B.3／C.3 已更新。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 新增 `transaction_type` enum 值 `assign`（Drizzle schema + enum migration，比照先前 `declare_fa` 的做法）
- [ ] **分類**：描述含「assigned to [隊]」／typeCode `ASG` → `assign`；**務必與下列區分、維持 `other`**：「invited non-roster」（春訓邀請，非上 roster；注意 to_team 可能是 MLB 隊、不可誤設 rostered）、國家隊 activate（如「Chinese Taipei activated」）
- [ ] **投影規則**（spec-01 B.3）：`assign` → `rostered` 取 `to_team` 的隊/層級；**`to_team` 無法解析（非追蹤隊，如冬季/秋季聯盟）→ 不變、不清隊**；health 不變；更新 `as_of_event_id`。多筆 assign 依序重放、最後一筆可解析者勝
- [ ] **重投影**（`etl reproject`）後：費爾柴德→Tacoma(3A)、林昱珉→Reno(3A) 修正；evening 對帳對這兩位不再告警（或減少）
- [ ] 測試：分類（assigned vs invited-non-roster vs 國家隊 各一）、投影表驅動（assign 設隊、無法解析→no-op、與 send_down/call_up 混合重放最後者勝）
- [ ] 驗收：`/players` 對下放球員顯示正確層級（3A 而非大聯盟）
