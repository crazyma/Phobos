# 02 — 球季數據表（zone 2，標準）

**What to build:** 個人頁的球季數據區：自 2020 起，依球季分組、層級分節，把每個「球季×層級×球隊」列出來並附**層級合計列**；標準比率由計數欄即時推導。低階層級數據旁固定提醒「僅供參考」。**進階數據（打/投各 7 項＋名詞連結）不在本票**，留待名詞庫那批（順位 2）。

**Blocked by:** 01（個人頁骨架 + service/API 基礎）。

**Status:** ready-for-agent

- [ ] `getPlayerDetail` 加 `seasons[]`：自 2020，依球季分組、層級分節；`(season × level × team)` **分列 ＋ 層級合計列**（合計重算規則 spec-01 C.7）
- [ ] 標準比率由計數欄**即時推導**為純函式（AVG/OBP/SLG/OPS/ISO/BB%/K%/BABIP；ERA/WHIP/HR9…）——TDD 接縫（先 red 後 green）；顯示位數用既有 `lib/format`
- [ ] 低階（1A 以下）數據旁固定顯示「低階層級數據僅供參考」
- [ ] `archived` 球員：此區呈現為「生涯總成績表」（補齊 spec-02 §2.3 archived 的第二塊）
- [ ] `seasons[]` 形狀入 Zod 合約；`/api/players/:id` 一併回傳
- [ ] 測試：層級合計列重算、比率推導純函式對照已知值、無季數據空狀態
- [ ] **不含**進階數據（打/投各 7）與名詞頁連結——那受 spec-04 §D「名詞頁先行、缺頁 build fail」約束，屬順位 2
