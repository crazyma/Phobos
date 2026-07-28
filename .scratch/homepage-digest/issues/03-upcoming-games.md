# 03 — 即將出賽（zone 3）

**What to build:** 首頁次要區塊，列出每位 `tracked` 球員的下一場：對手、**台灣時間**開賽、出賽預告標籤——「確定先發」僅投手（`games.probable_*_pitcher_id` 命中）；其他健康在隊者一律「可能出賽」；`health=il` 顯示「傷兵中」且不列預告（spec-02 §2.1 第 3 區，規則同 §2.3 zone 5）。

**Blocked by:** 01（頁面外殼 + `/api/home`）。可與 02 並行。

**Status:** ready-for-agent

- [ ] service 回 **upcoming**：每位 tracked 球員的下一場＝`playerId, nameZh, opponent, startTimeUtc, tag('probable_starter'|'possible'|'il')`；沿用票組 player-detail 的 upcoming 判定與 `gameDateUs >= today` 下界（不撈過期場）；無現隊/無排定→不列
- [ ] `il` 者標「傷兵中」不列預告；台灣時間顯示沿用 `formatDateTimeTaipei`
- [ ] `/api/home` 擴充 `upcoming` 欄位（併入既有 Zod 合約）
- [ ] 首頁即將出賽區渲染（對手、台灣時間、標籤徽章；球員名可連個人頁）
- [ ] 測試：service（seed DB，probable/possible/il 三分支、過期場排除、無賽事空）；首頁 smoke 預告列出現
