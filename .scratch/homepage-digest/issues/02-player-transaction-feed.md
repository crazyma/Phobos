# 02 — 球員動態（zone 2）

**What to build:** 首頁最新賽況卡下方，列出 digest date **之後**發生的球員動態（`transaction_events`：升降/交易/DFA/釋出/IL 進出），一則一行＋日期＋類型徽章（中文化）＋描述，時間倒序（spec-02 §2.1 第 2 區）。

**Blocked by:** 01（頁面外殼 + `/api/home` + digest date 錨點）。

**Status:** ready-for-agent

- [ ] service 回 **events**：所有 tracked 球員在 digest date 之後的 `transaction_events`，跨球員合併、時間倒序；每則＝`playerId, nameZh, type, date, description`（沿用 `transactionTypeLabel` 中文徽章）
- [ ] 空集合（該日後無動態）→ 該區隱藏或顯示簡短空句
- [ ] `/api/home` 擴充 `events` 欄位（併入既有 Zod 合約）
- [ ] 首頁動態區渲染每則（球員名可連個人頁）
- [ ] 測試：service（seed DB，只取 digest date 之後、跨球員倒序、無動態→空）；首頁 smoke 動態列出現
