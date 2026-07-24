# 04 — /players 總覽頁

**What to build:** 球員總覽頁，把白名單以卡片/列呈現。這是第一個真正「在瀏覽器看得到資料」的頁——使用者從頂欄進來，一眼看到所有台灣球員現在在哪隊、哪層、狀態如何（requirements F1-1）。

**Blocked by:** 02（全站 shell）、03（services + PlayerSummary）。

**Status:** done

- [x] `/players`（Server Component 經 `lib/services.getPlayerSummaries()`，不繞自家 API）：列出 `tracked` 球員——中英名、目前隊伍+層級、狀態一句、近況一句話
- [x] `archived` 球員收在「歷史球員」`<details>` 折疊區（有人才顯示）
- [x] 層級 篩選 + 姓名／層級 排序（client 端 `PlayersView`）
- [x] ISR `revalidate = 1800`（build 顯示 30m）
- [x] 瀏覽器能看到目前白名單（5 位）呈現於頁面（dev 煙測 HTTP 200，5 名皆在）
- [x] 頁面 smoke test：`renderToStaticMarkup(PlayersView)` 驗名冊列、球員名、狀態、近況 fallback、篩選/排序控制、archived 折疊區存在與否

**Notes:** 呈現拆為 `PlayerCard`（純、server/client 皆可用）＋ `PlayersView`（client，篩選/排序＋archived 折疊）。頁面本身 thin：fetch → 依 lifecycle 分組 → 交給 view。smoke 用零依賴 `react-dom/server`（不需 jsdom）。目前所有球員 `team=null`／狀態同步中（ETL 未跑），故層級篩選選項為空、卡片顯示 fallback——ETL 一旦供 `player_current_status` 即自動生效。
