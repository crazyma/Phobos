# 04 — 空狀態（zone 4）：本季回顧卡 + 名詞入口

**What to build:** 當 digest 當日無 `tracked` 球員賽事或休賽期（票 01 的 digest date 為 null／gameCards 空）時，首頁頂區改顯示**本季/上季回顧卡**（每位球員的季數據摘要＋近況一句話）＋**名詞知識入口**（自名詞庫挑幾則導流）。取代票 01 的簡單「近期無賽事」佔位（spec-02 §2.1 第 4 區）。

**Blocked by:** 01（空/有賽事判斷與頁面外殼來自 01）。可與 02/03 並行。

**Status:** ready-for-agent

- [ ] service 回 **emptyState**（僅在無賽事時非 null）：`seasonReviewCards`＝每位 tracked 球員本季（無則上季）季數據摘要＋近況一句話；`glossaryPicks`＝自名詞庫 frontmatter 挑幾則（**v1 靜態隨機挑選、非跑馬燈動畫**）＝中英文名＋一句白話＋連結
- [ ] `/api/home` 擴充 `emptyState` 欄位（有賽事時為 null，併入既有 Zod 合約）
- [ ] 首頁在 gameCards 空時渲染回顧卡＋名詞入口，取代佔位；有賽事時維持票 01 頂區
- [ ] 測試：service（seed DB，無賽事→回顧卡取本季/上季 fallback、glossaryPicks 非空；有賽事→emptyState null）；首頁 smoke 空狀態切換
