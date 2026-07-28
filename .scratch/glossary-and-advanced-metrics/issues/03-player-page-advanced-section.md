# 03 — 個人頁進階數據區（打/投各 7，可展開、缺值不顯示）+ 名詞雙向連結

**What to build:** 把球員頁球季數據區補上**進階數據**（打者 7 項＋投手 7 項）：放次要位置/可展開，缺值不顯示，每個指標名可點入對應名詞頁（雙向連結去程，spec-02 §2.3 第 2 區／spec-04 §D）。已存但尚未讀出的進階欄（`woba/wrc_plus/war` 打、`fip/lob_pct/war` 投，ETL 已灌 MLB 層級）經 service+Zod 攤出，併入已算的衍生進階（ISO/BB%/K%/BABIP、HR/9）。

**Blocked by:** 02（顯示的 14 個 metric_key 都須有名詞頁，否則 spec-04 §D build fail）。

**Status:** ready-for-agent

- [ ] `getPlayerSeasons`／`buildSeasons` 讀出並回傳已存進階欄（woba/wrc_plus/war、fip/lob_pct）；併入既有衍生進階（ISO/BB%/K%/BABIP、HR/9、K%、BB%）湊齊打/投各 7；形狀入 Zod 合約
- [ ] 個人頁球季數據區新增**進階區塊**：次要位置或可展開；**缺值不顯示**（進階多為 MLB-only，小聯盟自然缺）；每個指標名渲染為連向 `/glossary/[slug]` 的連結（對應表＝票 01 registry）
- [ ] 低階（1A 以下）數據旁維持「低階層級數據僅供參考」；`archived` 球員維持只顯示生涯總成績（沿用個人頁既有規則）
- [ ] build-fail 驗證：球員頁顯示的每個進階 `metric_key` 都在 registry 命中（否則 build 失敗）
- [ ] 測試：service 讀出進階欄＋缺值→不顯示；比率推導對照已知官方值；頁面 smoke 進階區塊與名詞連結存在
