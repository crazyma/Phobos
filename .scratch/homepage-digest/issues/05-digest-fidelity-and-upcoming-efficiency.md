# 05 — 首頁 polish：digest 依 games 判定 + 即將出賽效率

**What to build:** 兩個 code-review 觀察的收尾（皆在首頁 service）：**①** 讓「最新賽況」錨定的美國比賽日真正遵守 spec-02 §2.1「該日所有相關比賽皆 `final`」——目前由 game line 反推，但有 line 的 game 一律被 gamelog 強制 `final`，導致 guard 實質失效：同日某位 tracked 球員賽事已結算、另一位仍在進行（尚無 line）時，會選到「今天」只顯示已結束者、漏掉進行中者。**②** 首頁「即將出賽」區目前對每位 tracked 球員各呼叫一次 `getPlayerUpcoming`，每次都全表掃 `teams` 並算出首頁用不到的近期戰績，N 位球員造成多餘查詢。

**Blocked by:** None（首頁 slice 票 01–04 已完成、在 main）。

**Status:** ready-for-agent

- [ ] **① digest 依 `games` 判定**：digest date＝最新一個「該日所有**相關比賽**（tracked 球員所屬球隊當日的賽事，含 `scheduled`/`live`，不只有 line 的）皆 `final`」的美國比賽日；仍只錨定到有 tracked 球員實際出賽（有 line）的日子，但**只要該日尚有相關賽事未結算就不選該日**（改由 `games` 表判定，不再從 line 反推 status）
- [ ] **② 即將出賽效率**：首頁 upcoming 以**單次載入 team map 往下傳**、且**不計算首頁用不到的近期戰績**，產生與現在相同的結果但大幅減少查詢（不再每位球員全表掃 `teams`）
- [ ] 對外 `/api/home` 形狀與現有 Zod 合約不變（純內部修正）
- [ ] 測試：① 新增回歸——某 tracked 球員當日有一場 `live`/`scheduled` 且**無 line** 的相關賽事 → 該日不被選為 digest（正式情境，非靠人工在 live 場塞 line）；② upcoming 結果不變（三分支/過期排除既有斷言續綠），可另證查詢次數下降
- [ ] Node 全綠、`pnpm typecheck` 過、`pnpm build` 過
