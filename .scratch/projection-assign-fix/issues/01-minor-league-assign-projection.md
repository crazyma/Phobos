# 01 — 小聯盟 Assign 事件納入狀態投影（修正下放球員顯示錯隊）

**What to build:** 讓「小聯盟指派」異動（StatsAPI「assigned to [隊]」／typeCode `ASG`）真正**移動球員的目前隊伍/層級**，修正「被下放到小聯盟的球員在 `/players` 卻顯示 MLB 隊」的錯誤。目前這類事件被歸為 `other`、投影不跟，導致費爾柴德（實際 Tacoma/3A、顯示 SEA/MLB）、林昱珉（實際 Reno/3A、顯示 AZ/MLB）等下放球員顯示錯誤——而台灣新秀多在小聯盟，正中核心情境。

**背景（診斷）:** 事件史完整（2020+），問題在分類：`ASG`→`other`，而 `other` 在投影狀態機（spec-01 B.3）不動隊。決策（2026-07-27，batu）：**採正解**——新增 `assign` 型別並在 B.3 加規則。spec-01 B.3／C.3 已更新。

**Blocked by:** None — can start immediately.

**Status:** done（2026-07-27）

- [x] 新增 `transaction_type` enum 值 `assign`（Drizzle `enums.ts` + migration `0002_aberrant_doorman.sql`：`ADD VALUE 'assign' BEFORE 'il_on'`，比照先前 `declare_fa`）
- [x] **分類**：以 description 的「assigned to [隊]」片語 → `assign`（typeDesc 恆為單字「Assigned」無法區辨，且刻意不用 typeDesc-前綴 haystack 以免「Assigned 」+「To…」如 Toledo 誤命中）；invited-non-roster（春訓邀請，to_team 常為 MLB、不設 rostered）、rehab（「assignment to」）、國家隊 activate（SC「Chinese Taipei activated」）均維持 `other`
- [x] **投影規則**（spec-01 B.3）：`assign` → `rostered` 取 `to_team` 的隊/層級；`to_team` 無法解析 → no-op、不清隊、不推進 `as_of`；health 不變；最後一筆可解析者勝
- [x] **重投影**後：費爾柴德(656413)→Tacoma(529/aaa)、林昱珉(801179)→Reno(2310/aaa) 修正；currentTeam 快照已與投影一致 → evening 對帳對這兩位不再告警
- [x] 測試：分類（assigned／invited-non-roster／rehab／國家隊／Toledo 迴歸）、投影表驅動（assign 設隊、無法解析→no-op、與 send_down/call_up 混合重放最後可解析者勝）。etl 122／node 41／typecheck 綠
- [x] 驗收：`player_current_status.level` 對兩位下放球員為 `aaa`（3A），`/players` 經 lib/format 顯示 3A
