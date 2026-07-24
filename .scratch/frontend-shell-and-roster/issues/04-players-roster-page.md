# 04 — /players 總覽頁

**What to build:** 球員總覽頁，把白名單以卡片/列呈現。這是第一個真正「在瀏覽器看得到資料」的頁——使用者從頂欄進來，一眼看到所有台灣球員現在在哪隊、哪層、狀態如何（requirements F1-1）。

**Blocked by:** 02（全站 shell）、03（services + PlayerSummary）。

**Status:** ready-for-agent

- [ ] `/players`（Server Component 經 `lib/services`，不繞自家 API）：列出 `tracked` 球員——中英名、目前隊伍+層級、狀態一句、近況一句話
- [ ] `archived` 球員收在「歷史球員」折疊區
- [ ] 層級／球隊 篩選排序（client 端即可，資料量小）
- [ ] ISR `revalidate = 1800`
- [ ] 瀏覽器能看到目前白名單（5 位）呈現於頁面
- [ ] 頁面 smoke test：能 render、關鍵區塊（名冊列、球員名）存在
