# 開發日誌 — 台灣球員大聯盟網站（Phobos）

> 記錄進度：已完成（含日期）、進行中/下一步、待決問題、未來 phase。
> 文件位置慣例（皆在 `docs/` 下）：`plan/` = 發想脈絡；`adr/` = 技術決策記錄；`spec/` = 照著能建的規格。路徑引用以 `docs/` 為根。

---

## ✅ 已完成

### 2026-08-13

- [x] **UI 拉皮票 01 完成——`/players` 換上雜誌風名冊，全站設計地基一併落地**（票 `.scratch/ui-reskin-v2/issues/01-roster-with-design-foundation.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - **地基（純加法，故折進第一個垂直切片、不另開水平票）**：`next/font/google` 三角色分工（`Noto_Serif_TC` 標題／人名、`Noto_Sans_TC` 內文、`Geist_Mono` 所有數據與標籤）；`globals.css` 換深藍暖橘亮色盤並註冊 8 個新語意 token（`--mlb`／`--aaa`／`--aa`＋`-foreground`、`--up`／`--down`），另**自行補齊設計沒有的 `--a-plus`／`--a`／`--rookie`**——設計只有三階、我們有六階，漏掉的話低階徽章會是**沒有顏色**而不是 fallback。刪掉 `globals.css:85-117` 那 33 行**從未被觸發過**的深色盤（全 repo 無 `.dark` 掛載點，`@custom-variant dark` 是 class-based、不吃 `prefers-color-scheme`）。共用樣板 `SectionTitle`／`LevelBadge`／`TagButton`／`EmptyState`／卡片 hover 集中在 `components/magazine/`，單一落點供後續票沿用。
  - **名冊頁**：`/players` 改為依 `LEVEL_ORDER` 六階**動態分區**（六階皆有中英文字樣、空層級不出現）、層級篩選由原生 `<select>` 改 `TagButton` chip、卡片維持**純字排無頭像**（編號浮水印＋暖橘短線＋襯線大名＋mono 英文名＋守位·隊名，另安排狀態句與近況句）、歷史球員收進 `<details>`、篩不到人走 `EmptyState`；報頭／頁尾 kicker 化、容器 `max-w-5xl px-4` → `max-w-6xl px-6`。隊名沿用 `withLevel: false` 不重複印層級。**未動任何 `lib/services/*`**；以 dev server ＋ 本機 Chrome 實際檢視桌機與 390px 手機版。完成後其他頁面是「新報頭＋舊內文」的混搭狀態，如票面預期，由 02／04／05 收斂。
  - **事後 review 抓到並已在同分支修掉三件**：
    1. **頁尾的 `mt-16` 從來沒有生效。** `components/site-footer.tsx` 同時掛 `mt-auto` 與 `mt-16`，兩者都是 `margin-top`、同 specificity，編譯後 `mt-auto` 排在後面而勝出，`mt-16` 被**靜默丟掉**。修法是**單純移除 `mt-16`、不補其他間距**——頁面 section 本身已有 `pb-16`（`app/players/page.tsx:15`），而且既然它從未生效，實作時用 dev server 檢視並確認過的版面**就是「沒有這 4rem」的樣子**，補上反而會改變已驗收的外觀。已就地留註解說明日後不要在此用 `mt-*` 加間距（要留白就加在 `<main>` 或頁面自己的 section）。
    2. **歷史球員卡片的「降對比」永遠看不到。** `<ul>` 上是 `opacity-60 transition-opacity group-open:opacity-100`——`<details>` 收合時子節點根本不顯示（`opacity-60` 空轉），展開時 `group-open` 又把它拉回全不透明，**兩種狀態都沒有降對比**。改法不是調整透明度，而是**改成 `PlayerCard` 的 `archived` prop**：呼叫端只表達語意，由元件內部「壓底色 ＋ 去掉橘色重點」（`bg-muted`，短線與引言直線換 `bg-muted-foreground`／`border-muted-foreground`）。理由是整張卡片是可點的 `<a>`、**不適用 WCAG「非作用中元件」豁免**，而整體透明度會把次要文字壓到 AA 以下——**實測對比（headless Chrome 截圖逐像素算出）：不降 5.99:1、透明度 0.75 只剩 3.47:1、0.6 約 2.6:1；改壓底色後回到 5.04:1**，所有文字皆過 AA 4.5:1（姓名與狀態句 13.85:1）。
    3. **「排序」下拉在改版後完全沒有作用，已移除。** 改版後名冊依 `LEVEL_ORDER` 固定順序分區渲染，**區內成員層級必然相同 ⇒ `levelRank` 差恆為 0 ⇒「依姓名」與「依層級」輸出完全一致**。**拿掉的是控制項、不是排序本身**——區內仍固定以 `localeCompare(…, "zh-Hant")` 依姓名排序，避免退化成 DB 回傳順序（已補測試：DB 順序刻意反過來，輸出仍為姓名序）。連帶移除 `sort` state、`SortKey` type 與 `levelRank()`。
       - **成因值得記一筆**：這是**開票時**「排序保留下拉」（票面理由「chip 表達不了排序語意」）與「層級分區」兩條要求相撞，實作照票做但沒察覺兩者衝突。
  - **實作過程發現的一個坑**：**測試檔裡寫出完整的 Tailwind class 字串（例如斷言某個 class 不存在）會被 Tailwind 掃成候選字，把那個已死的 utility 重新編回 CSS bundle**——斷言「它不存在」反而讓它存在。已改用不會構成合法候選的 regex 比對（如 `/opacity-\d/`、`/bg-muted(?![-\w])/`，後者順帶避開誤中 `bg-muted-foreground`），並在 `players-view.test.tsx` 與 `player-card.tsx` 原處留註解說明。
  - `pnpm typecheck` 綠、`pnpm test` 綠。

- [x] **UI 拉皮票 02 完成——球員個人頁檔案與動態改為雜誌風**（票 `.scratch/ui-reskin-v2/issues/02-player-page-profile-and-moves.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - `/players/[id]` 非數據區更新為深藍 hero（姓氏浮水印、LevelBadge、四格資料、狀態引言、近況句）、StatList 近期比賽、媒體 mock carousel、動態時間軸、出賽預告與 archived 提示；本季／逐季／進階數據刻意保留給票 03。
  - `teamLogo()` 落在既有 `lib/services/team-map.ts`，用已載入的 TeamMap 記憶體推導小聯盟母隊，無新增 DB 往返；hero／名冊卡均接上可選 slot。素材尚未授權提供，fallback 為 null 並省略元素。封存卡片 hover 改為灰色邊框仍保留互動回饋。**（⚠️ 此段已被同日的事後修正取代——見下一則：那個放法會把 `pg` 拉進 client bundle 而讓 `pnpm build` 失敗，解析已改為 server 端的 `team.logoSrc`。）**
  - 媒體資料放 `lib/services/media.mock.ts`（含 MOCK 警語、不進 barrel、不納入驗收數字）；異動色調與出賽 tag 均在呈現層實作，未改 schema 或既有商業邏輯。以 dev server＋Chrome 實際檢視桌機與 390px 手機球員頁。
  - 相關測試與 typecheck 綠；完整 `pnpm test` 結果記於本次交付回報。

- [x] **票 02 事後修正——`pnpm build` 被隊徽的 client/server 邊界打掛，順帶清掉一個會靜默答錯的可變全域**（同分支 `feat/ui-reskin-v2`；`docs/DEVLOG.html` 一併重建）。
  1. **`pnpm build` 完全失敗（blocker）。** 票 02 讓 `components/players/player-card.tsx` 去 import `teamLogo`，而它住在會 `import { db } from "lib/db/client.ts"` 的 `lib/services/team-map.ts`；`PlayerCard` 由 `"use client"` 的 `players-view.tsx` 使用，於是 `app/players/page.tsx → players-view → player-card → team-map → db/client → pg` 整條被拉進瀏覽器 bundle，`next build` 死在 `Module not found: 'dns' / 'fs' / 'util/types'`。**`pnpm typecheck` 與 `pnpm test` 都是綠的**——tsc 只看型別，vitest 在 Node 下跑、`pg` import 得到，**只有 `next build` 會驗 RSC 的 client/server 邊界**。已在票 02–06 的 checklist 全部補上「`pnpm build` 綠」，教訓記在票 02 的 Comments。
  2. **修法：logo 解析回到 server，元件只收算好的值。** `PlayerSummary.team` / `PlayerDetail.team` 兩個 Zod schema 各加一個 `logoSrc: string | null`，由 `getPlayerSummaries()` / `getPlayerDetail()` 在既有的母隊 self-join 上**多取一個母隊 id**後解析（**未新增查詢**）；規則本身搬到新的純模組 `lib/services/team-logo.ts`（**只有 type-only import，零 DB 依賴**）。`PlayerCard` 與 `PlayerHero` 兩處都改吃 `player.team?.logoSrc`，不再有任何呈現層模組碰得到解析器。
  3. **移除 `team-map.ts` 的 module 層級可變全域 `latestTeamMap`。** 它不只是「跨請求共用可變狀態」的體質問題，而是**已經答錯**：名冊頁的資料來源 `getPlayerSummaries()` 從來沒呼叫過 `loadTeamMap()`，`/players` 渲染時那個全域可能是空的 → `rootId` 退回球員自己的 `teamId` → **小聯盟球員永遠推不到母隊隊徽、大聯盟球員剛好會對**，而且相依於哪個頁面先被請求。授權清單目前為空所以還看不出來，**素材一放進去就會爆**。連帶把只服務於它的 `TeamRef.parentTeamId` 也拿掉。
  4. **測試改測實際會走的路。** 原本 `team-map.test.ts` 的三個 `teamLogo` 測試**每次都明確傳 `map` 進去**，而真實呼叫端是 `teamLogo(player.team?.id)`（不傳、走全域）——測試是綠的卻保護不到上線那條路。改為在 `players.test.ts` / `player-detail.test.ts` 以 DB fixture 從 service 輸出斷言：小聯盟解析到母隊、大聯盟直取自己的 id、母隊推不出時為 null（**不退回球隊自己的 id**）、素材未到位時為 null；`players.test.ts` 為此新增大聯盟球員與「無母隊的 3A 隊」兩組 fixture。元件端則在 `players-view.test.tsx` / `player-hero.test.tsx` 各補一則：`logoSrc` 為 null 時不出現 `<img>`、有值時畫出對應 `src`。
  - `pnpm build` 綠（修正前 `Module not found`，修正後 33 頁全數產出）、`pnpm typecheck` 綠、`pnpm test` **30 檔 / 160 測試**全綠（原 154，新增 9、移除 3 個走全域的舊 `teamLogo` 測試）；另起 dev server 實測 `/players`、`/players/[id]`、`/` 與 `/api/players` 皆 200，小聯盟球員的 `team.logoSrc` 如預期為 null（素材未到位）。

- [x] **UI 拉皮票 03 完成——球員個人頁數據區改為重點四格＋可展開完整表**（票 `.scratch/ui-reskin-v2/issues/03-player-page-stats.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - 每個球季×層級保留原有分組、per-team 列與合計列，新增 `LevelBadge`、場次、目前所在標記，以及打者 `AVG / OPS / HR / RBI`、投手 `ERA / WHIP / SO / IP` 四格；級距 hint 僅讀既有 glossary bands，沒有出處的計數／`IP` 刻意留白。
  - 完整打擊／投球 20 欄表收進原生 `<details>`，保留 `teamCell()`、缺值規則與 archived heading，加入 sticky 左欄、窄螢幕橫滑提示與合計列視覺層次；進階指標改 StatBlock 排版但維持 `metricSlug()` 名詞頁連結。
  - `season-stats.tsx` 維持 server component，未改 `lib/services/*`；以 dev server＋Chrome 實際檢視桌機與 390px 手機球員頁。`pnpm test`、`pnpm typecheck`、`pnpm build` 綠，並實測移走 `wrc-plus.mdx` 時 registry 護欄會讓 build 失敗後還原。

- [x] **UI 拉皮票 04 完成——首頁改為雜誌封面式動態首頁**（票 `.scratch/ui-reskin-v2/issues/04-home-page.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - 首頁改為大標、今日焦點跨頁、近期賽果、異動快訊、即將出賽四區；焦點取既有 `gameCards[0]`，四格使用單場資料，沒有新增 service 邏輯或人物圖像。
  - `EVENT_TONE` 提到 `components/magazine/` 由首頁與球員時間軸共用；即將出賽沿用票 02 的三種 tag 語意與 IL 隱藏對手／時間規則；休賽季保留回顧與名詞推薦空狀態。
  - `home-page.tsx` 維持 server component，未改 `lib/services/*`；以 dev server 檢視首頁 active state，空狀態則以既有 fixture 測試完整 render。`pnpm test`、`pnpm typecheck`、`pnpm build` 綠。

- [x] **UI 拉皮票 05 完成——名詞索引搜尋與獨立名詞頁改版**（票 `.scratch/ui-reskin-v2/issues/05-glossary.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - `/glossary` 維持 `force-static`，server 傳 frontmatter 給 client 搜尋／卡片牆；分類沿用既有 registry，卡片是真 `<Link>`，standard 類另配圖示與標題，無結果使用 `EmptyState`。
  - `/glossary/[slug]` 保留 24 個 SSG URL、metadata、sitemap 與 `getRegistry()` build-fail 護欄，套用導讀／級距／定義算法／延伸參考／範例球員五段骨架；`BandsTable` 改為每層級一條垂直尺標並依兩種 higher-is-better 欄位著色。
  - `baseball-icons.tsx` 自設計 repo 移植；未修改任何 MDX 或 `lib/services/*`。`pnpm test`、`pnpm typecheck`、`pnpm build` 與 SEO 測試綠，實際檢視 `/glossary` 搜尋結果／空結果及 `k-pct` 雙視角尺標。

- [x] **票 04 事後修正——`EVENT_TONE` 搬家弄丟窮盡型別保護、空狀態吃掉二刀流的投球那份**（同分支 `feat/ui-reskin-v2`；code review 抓到）。
  1. **`EVENT_TONE` 從窮盡 `Record` 退化成 `Record<string, …>`。** 搬到 `components/magazine/event-tone.ts` 共用時，key 的型別由 transaction type union 放寬成 `string`，並補了 `?? "neutral"` fallback ⇒ **新增 `transaction_type` enum 值卻沒替它分類時不再有任何提醒，會靜默變成中性色**。這個 repo 六週內就新增了四個 enum 值（`declare_fa`／`assign`／`waiver_claim`／`activate`），每次都需要人為決定它是升是降。已改回 `Record<TransactionType, Tone>`（`TransactionType` 取自 `Timeline[number]["type"]`，**`import type` 取得、編譯後完全抹除**——票 02 的教訓：`components/` 下用值 import 碰到 `lib/services` 會把 `pg` 拉進瀏覽器 bundle 而讓 `next build` 死掉），窮盡後 `?? "neutral"` 不可達已一併移除。**反向驗證**：刪掉 `waiver_claim` 後 `pnpm typecheck` 如預期報 `TS2741: Property 'waiver_claim' is missing …`，補回後回綠。
  2. **空狀態的回顧卡用單一三元運算子，二刀流球員會少一半數據。** `EmptyFallback` 寫成 `card.batting ? … : card.pitching ? … : "—"`，但 `lib/services/home.ts:222-223` 的 `battingLine`／`pitchingLine` 是**各自算的**、schema 兩欄各自 nullable ⇒ 兩者皆非 null 的二刀流球員**只會出打擊那份**。改回打擊／投球各自判斷、都有就都顯示，兩者皆無才留 `—` 佔位；維持新版面的 mono 小字語彙（單行時輸出與修正前逐字元相同，只是多一層 `<div>` 容器）。
  3. **補測試（163 → 168）**：`home-page.test.tsx` 新增「二刀流兩份都出現」（本次的護欄，實測還原成三元寫法會失敗）、「兩份皆無留佔位」、「今日焦點有賽事才出現」、「賽果 → 本季回顧 → 全空佔位三層 fallback」、「異動三種語氣色彩互不相同」。最後一則刻意**不寫出 Tailwind class 字串**（票 01 的坑：測試檔會被 Tailwind 掃成候選字），改為比對三個連結的 class 互不相同，順帶取代原本脆弱的 `toContain("text-up")`。
  4. **排版**：`home-page.tsx` 上一輪幾乎整檔寫成單行（`EmptyFallback` 一行超過 1400 字元），此 repo 沒有 formatter 關卡（已記在「未來 Phase」），已排回與其他元件一致的多行 JSX。**純排版、零渲染差異**——以「新舊版本同時渲染同一組 fixture 逐字元比對」驗證：active／全空兩組 HTML **byte-identical**，唯一差異就是上述二刀流那格。
  - `pnpm typecheck` 綠、`pnpm test` **30 檔 / 168 測試**全綠、`pnpm build` 綠（33 頁）；dev server 首頁 200，四區與今日焦點如常。

- [x] **票 05 事後修正——級距尺標的數值整排左移一格（讀起來會是錯的），配色改回設計稿的暖橘漸層**（同分支 `feat/ui-reskin-v2`；code review 抓到）。
  1. **接縫數值全部落在它所標界線的左邊一整格（資料視覺化的座標錯誤）。** `band.max` 是該段的**右緣**，但數值列用 flex 排、每個 `<span>` 寬度等於自己那段的寬度 ⇒ 標籤永遠停在自己那段的**左緣**；`border-l` 還在錯的位置畫了刻度線強化誤讀。從建置產物量到的實際幾何：`k-pct` 五段各 20%，`0.15` 畫在 x=0%、`0.2` 在 20%、`0.25` 在 40%、`0.3` 在 60%——**每個數字都比它真正的界線早一格**。改採設計稿 `ScaleBar` 的結構：區間標籤在色帶**上方**、色帶收成 `h-3 rounded-full`、接縫數值改**絕對定位**（`-translate-x-1/2` + `left: X%`）。⚠️ 設計稿的 `left%` 是用 `((b - min) / span) * 100` 從數值算的，**我們兩端都是開放區間、沒有真正的 min/max**，所以接縫位置改用**累積區段寬度**（第 i 個接縫 = 前 i 段寬度總和 ÷ 總寬），沿用既有的 `segmentWidths()`。修正後量到 `k-pct` 的接縫為 **20% / 40% / 60% / 80%**，與色帶交界完全重合；`wrc-plus`（中間那段較寬）為 **19.0476 / 38.0952 / 61.9048 / 80.9524%**，同樣等於累積寬度。
  2. **色帶配色從綠／紅改回設計稿的暖橘漸層。** 原本 `bg-up`／`bg-down`／`bg-muted`（只有頭尾上色、中間全灰）；綠／紅在站上已經是**升降與勝敗**的語彙（異動時間軸、首頁異動快訊、近期戰績），挪來表示級距好壞會混淆，設計原則也明列「深藍為主、暖橘為輔」。改用設計稿的 `{low: bg-muted, mid: bg-accent/40, high: bg-accent}`。⚠️ **我們的 `Band` 沒有 `tone` 欄位**（設計的假資料才有），所以由**位置＋方向**推導：**最差端 → `low`、最好端 → `high`、中間全部 → `mid`；哪端是最好取決於 `higherIsBetter`（投手視角吃 `higher_is_better_pitcher` 覆蓋）；只有一段時不構成端點，給 `mid`。** 建置產物實測 `k-pct`：打者側 `accent → muted`（低 K% 好）、投手側 `muted → accent`（高 K% 好），方向確實相反。
  3. **補測試把幾何釘住（座標錯誤 typecheck 與 build 都抓不到）。** 把幾何抽成純函式 `scaleGeometry()`／`bandTones()` 並加三則測試：① 用**刻意不等寬**的 bands（等寬會蓋掉差一格的錯誤）斷言每個接縫的位置等於**它左邊所有區段寬度的累積和**；② 從實際 render 的 HTML 抓出所有 `left:X%`，確認是絕對定位而非 flex 欄；③ `k-pct` 的五段對齊 20% 網格。tone 測試也由原本比對 `bg-up`／`bg-down` 改為斷言 `bandTones()` 的 ramp 與「不得出現 up/down 色盤」。
  4. **兩個分類共用同一個圖示。** `CATEGORY_ICONS` 把 `shared_adv` 與 `standard` 都指向 `DiamondIcon`（兩區標題長得一樣），且 `GloveIcon` 有 import 沒使用。`shared_adv` 改用 lucide `Trophy`（設計稿的「綜合評估數據」就是它），`standard` 留 `DiamondIcon`，五類已各有辨識度（建置產物驗過五個 `<svg>` 互不相同）；未使用的 import 清掉。`GloveIcon` 的**定義**保留在圖示集裡（設計稿的「防守數據」我們還沒有這個分類）。`satisfies` 的型別由 `typeof BatIcon` 放寬成 `ComponentType<SVGProps<SVGSVGElement>>`——lucide 的 forwardRef 元件回傳 `ReactNode`，套原本的型別會 `TS2322`。
  5. **排版**：`glossary-index-client.tsx`（單行超過 1500 字元）、`bands-table.tsx`、`baseball-icons.tsx` 三檔排回多行 JSX，密度對齊 `players-view.tsx`／`season-stats.tsx`。**票 04 才剛因為同樣的事被退回一次**——此 repo 沒有 formatter 關卡（已記在「未來 Phase」）。色帶以外**零渲染差異**。
  - 另修票檔 `.scratch/ui-reskin-v2/issues/05-glossary.md` 有兩個 `## Comments` 標題，已合併成一個、內容全留。
  - `pnpm typecheck` 綠、`pnpm test` **30 檔 / 174 測試**全綠（原 170，新增 4）、`pnpm build` 綠（33 頁）、`app/seo.test.ts` 綠且 sitemap 仍含 **24** 條名詞 URL；幾何與配色皆從 `.next/server/app/glossary/*.html` 量實際輸出驗證，不只目視。

- [x] **UI 拉皮票 06 完成——球員頁新增依層級的季內累積走勢圖**（票 `.scratch/ui-reskin-v2/issues/06-season-trend-chart.md`，切片整合分支 `feat/ui-reskin-v2`）。
  - 新增 `player-trend` service，以本季全部逐場資料按 `game_date_us`／`game_pk` 排序，按層級各自累積；打者精算 AVG（`H / AB`），投手精算 ERA（`ER × 27 / outs`），不近似 OBP／OPS。門檻具名為 20 AB／30 outs，未達則整張卡隱藏。
  - 球員頁數據區下方新增純 server SVG 卡片；每張標示「本季累積打擊率／自責分率走勢」與最新值，單點以 `step = 0` 防止 `Infinity`。線色依進步方向判斷：AVG 越高越好、ERA 越低越好。
  - 新增 service／元件測試覆蓋跨層級不混算、門檻、AVG／ERA 手算與單點；真實 2026 資料驗證費爾柴德只出 3A（MLB 19 AB 隱藏）、李灝宇 MLB／3A 分卡、林昱珉 3A ERA 圖。現有資料沒有二刀流，打投同頁雙卡僅由 fixture 測試驗證。`pnpm test`、`pnpm typecheck`、`pnpm build` 綠。

- [x] **票 01／06 事後修正——三個「看畫面才發現」的呈現層問題**（同分支 `feat/ui-reskin-v2`；`docs/DEVLOG.html` 一併重建）。三者**測試與 build 都抓不到**，因為都是視覺／語意層面而非邏輯錯誤：
  1. **報頭被壓成內容寬度並置中（全站，票 01 留下的）。** `components/site-header.tsx` 把 `mx-auto max-w-6xl` 直接掛在 `<header>` 上，而 `<header>` 是 `app/layout.tsx:46` 那個 `flex min-h-dvh flex-col` body 的**直接子元素** ⇒ `margin-inline: auto` 取消了 flex 預設的 `align-items: stretch`，整個報頭縮成內容寬度置中，`border-b-4 border-primary` 的分隔線只有「PHOBOS｜球員名冊｜名詞」那麼寬。**修法比照 `components/site-footer.tsx`**：`<header>` 外層不設寬度，寬度容器 `mx-auto max-w-6xl px-6 pt-6 sm:pt-10` 移到**內層** div。桌機那列與下方的行動版收合選單（`sm:hidden`）**共用同一個寬度容器**，所以兩者自動左右對齊。已就地留註解說明為什麼寬度不能掛在 `<header>` 上。
  2. **走勢圖的方向配色實務上會誤導，已拿掉。** `trendTone` 拿 `points[0]`（**第一場的累積值**）跟最新值比來決定線是綠是紅，但第一個累積點只根據一場（打者約 4 個 AB）算出來，數值極端。**實際畫面**：鄭宗哲首戰累積打擊率偏高，於是 3A `.246` 與大聯盟 `.256` **兩張圖整季都是紅的**——一個大聯盟打 .256 的球員全紅，會被誤讀成「狀況很差」。batu 決定**統一用 `--accent`**，讓線本身說話。連帶清掉死碼：移除 `trendTone` 與 `Sparkline` 的 `higherIsBetter` prop。
     - **但「AVG 越高越好、ERA 越低越好」這個資訊有價值、不該憑空消失**，改用**文字**承擔：走勢卡的線下方加一行小字「數字越高／越低越好」，用語與樣式**沿用 `components/glossary/bands-table.tsx` 尺標底下那行**（`font-mono text-[10px] uppercase tracking-wide text-muted-foreground`），全站同一種講法。`TrendCard` 的 `higherIsBetter` 因此**留著、但只服務這行字**（已就地註解說明它不再影響顏色），呼叫端也維持 `higherIsBetter` / `higherIsBetter={false}`。
     - **測試同步換掉而非註解掉**：`season-trend.test.tsx` 的 `evaluates AVG and ERA directions independently` 隨 `trendTone` 移除，改為一則打者＋投手同時渲染、斷言兩行方向小字都在且 HTML 不含 `text-up`／`text-down` 的測試。`text-up`／`text-down` 兩個 token 在首頁異動快訊、時間軸、出賽預告仍在用，**不是死 CSS**、保留。
  3. **球員頁「所屬球隊」從單字中間斷行。** `components/player-detail/player-hero.tsx` 四欄 `<dl>` 的 `<dd>` 用 `break-all`，長隊名會斷成「紅襪（Worcester Red So / x）」。改為 **`break-words`**（`overflow-wrap`）：優先在空白處換行，只有單一長字整個塞不下時才切開；中文本來就逐字換行，其餘三格（守備位置／年齡／投打）輸出不變。實測最長的「太空人（Sugar Land Space Cowboys）」現在斷成「太空人（Sugar Land / Space Cowboys）」，無字中斷點。
  - **驗收方式是實際看畫面**（headless Chrome 截圖，不只跑測試）：`/`、`/players`、`/glossary` 三頁報頭分隔線皆跨滿 `max-w-6xl`；390px 窄螢幕以 CDP 點開漢堡選單，收合選單與報頭同邊界、開合正常；`/players/691907` 兩張走勢圖皆為暖橘且各帶「數字越高越好」；`/players/678906`（本機 DB 中最長隊名）「所屬球隊」不再從字中間斷開。
  - `pnpm build` 綠（33 頁）、`pnpm typecheck` 綠、`pnpm test` **32 檔 / 181 測試**全綠（移除 1 則、補回 1 則，總數不變）。

### 2026-08-10

- [x] **`il-health-projection/01` 完成——傷兵狀態有可靠出口**（票 `.scratch/il-health-projection/issues/01-bare-activation-and-health-reset.md`）。修正兩個獨立來源的長期錯誤：
  - **裸 activated**：新增 enum `activate`（migration `0005_bare-activation.sql`），StatsAPI `typeCode=SC` 且 description 含 `activated`、不含 injured/disabled list 時分類為它；投影只在現況為 `il` 時才清為 `active`，否則 no-op，且絕不動 affiliation／team／level。時間軸中文標籤為「登錄」。
  - **漏送 IL 復出**：僅 `call_up`（recalled／selected／purchased）會重設 health／`il_detail`；`trade`／`sign`／`send_down`／`dfa` 的 IL 行為以回歸測試鎖住不變。
  - **真實資料驗收**：套 migration 後重跑 transactions + reproject（`sync_run #429` success），費爾柴德 2021-07-30→2021-09-01 為 **33 天**（原 759），李灝宇 2022-06-06→2022-07-17 為 **41 天**（原 372）；票面列出的其餘 13 段維持原值，5 名 tracked 球員現況均為 `active`。完整重播為 **17 段**而非票面的 15 段——多出來的兩段正是**修正的產物**：舊量測邏輯下，落在已經是 `il` 狀態上的 `il_on` 不會另起一段，於是 759 天那段吞掉了費爾柴德 `2023-08-22→08-28`（6 天）、372 天那段吞掉了李灝宇 `2023-05-18→06-13`（26 天），修好出口後兩段才各自浮現。
  - **上游字串拆分更正**：SC 那 44 筆並非全是裸 activated，實際為 **38 筆裸 activated ＋ 6 筆無狀態語意**（`roster status changed by` 5 筆、`placed on the reserve list` 1 筆，維持 `other` 正確）。開票時的 44 筆誤述已在票面 §1、§2.1 與 spec-03 §9 更正。
  - 文件同步 spec-01 B.3／C.3 與 spec-03 §9 的 12 組 `(typeCode, typeDesc)` 實測表；ETL 相關 39 tests、Node 相關 27 tests、typecheck 均綠。

### 2026-08-07

- [x] **`team-names-zh/01` 完成——球隊名終於是中文**（票 `.scratch/team-names-zh/issues/01-team-names-in-chinese.md`）。`teams` 231 筆 `name_zh` 原本**全是 NULL**，中文站上球隊名一律英文。
  - **30 支手寫 + 201 支推導**：`lib/db/seed/teams.ts` 放大聯盟 30 支台灣慣用暱稱（不帶城市——同城兩隊靠暱稱在中文就分得開）；小聯盟不逐支翻譯，由 `teamDisplayName()` 用「母隊中文名（原名）」推導。**未來新增的球隊與對手自動涵蓋**，不必回頭補資料。
  - **`withLevel` 由呼叫端決定**：名冊列與個人頁 hero 自己印層級徽章，隊名再帶一次會變成「3A・紅襪 3A（…）」，故傳 `withLevel: false`；單獨出現隊名處才帶層級。這是實作前討論時才發現的坑（`player-card.tsx:28` 的 `{levelLabel}・{name}`）。
  - **seed 只 update 不 insert**：球隊列由 ETL 建立且 `name_en` NOT NULL，seed 插半列只會變成第二份英文名來源。改為只更新既有列並**回報筆數**，不足 30 時明確提示「先跑一次批次」——比照 conftest 那條「不要靜默 fallback」。實跑：`Named 30/30 MLB teams in Chinese.`
  - **收斂了三處自製 fallback**（原票只點名兩處）：`players.ts`、`player-seasons.ts`，加上實作時才抓到的 `player-detail.ts`（個人頁 hero）。`loadTeamMap` 用同一次全表掃描在記憶體解析母隊，**未增加 DB 往返**。
  - 測試：新增 `lib/services/team-map.test.ts` 6 項；另修掉兩個測試 fixture 裡的「里諾王牌」——那是舊的「逐支翻譯小聯盟」模型留下的示範，與本次決策相反。vitest 146 passed、typecheck 綠。
  - **仍是英文的兩處**（不在本票範圍，見票面）：異動時間軸的敘述是 StatsAPI 原始 `description`（上游散文，非隊名欄位）；`abbrev` 介面（首頁卡片、即將出賽「對 LHV」）沿用三碼代號。

- [x] **待決問題收斂兩題**（見「待決問題」區）。
  - **小聯盟成績資料源**：原題（StatsAPI 與 pybaseball 欄位對齊表）失效——pybaseball 從未被使用。實測各層級非空計數後決策：**小聯盟不顯示 wOBA／xwOBA／wRC+／WAR／FIP**，計數欄與可推導指標全層級成立。順手清掉 spec-03 三處把 pybaseball 當現役來源的說法。
  - **waiver claim** → 新增 enum `waiver_claim`（migration `0004_clammy_inhumans.sql`）。這題原本被歸為「分類美感」，實測後發現是投影 bug：`other` no-op ＋ `dfa` 保留原隊 ⇒ 鄭宗哲 2026 冬天連四次 claim 都把 DFA 記在**前一支**球隊頭上。落地：typeCode `CLW`／typeDesc `Claimed Off Waivers` 對照、`_ROSTER_TYPES` 納入、標籤「讓渡挑選」、`waiver.mdx` 掛 `roster_event_types` 讓名詞頁自動有實例回連。重跑 transactions（`sync_run #426`）後 5 筆既有事件已重新歸類，五名球員的投影結果不變（後續事件本就蓋掉了錯誤），驗證這是**歷史正確性**與**未來正確性**的修正。ETL 151 passed、vitest 140 passed、typecheck 綠。

### 2026-08-06

- [x] **`sync-runs-test-isolation/02` 完成——Python ETL 測試不再寫開發 DB**（票 `.scratch/sync-runs-test-isolation/issues/02-python-etl-tests-still-write-to-dev-db.md`，分支 `fix/etl-test-db-isolation`）。
  - **病灶**：票 01 只隔離了 TS 那側；`etl/tests/conftest.py` 的 `db_conn` 走 `get_database_url()` → repo 根 `.env` → **開發庫 `phobos`**，**23 個** `@pytest.mark.db` 測試（票面寫 21，開票後 `raw_retention` 又加了 2 個）全部在開發資料上 insert／commit／delete。已經漏出來過一次：`Test Two-Way`（`mlb_player_id=1041627`，來自 `test_sources_game_lines.py:169` 一次中斷的殘留）帶著 `lifecycle='tracked'` 站上正式名冊頁，每批 ETL 還替它打 StatsAPI（累積 12 筆 raw）。08-06 已手動清掉結果，本票清掉原因。
  - **落地**：`db_conn` 不再呼叫 `get_database_url()`，改自己讀 repo 根 `.env.test` 的 `DATABASE_URL`（`…/phobos_test`，與 `pnpm test` 同一個庫）。**檔案為準、不吃環境變數**，比照 `vitest.setup.ts` 的 `override: true`；CI 要跑 db 測試就放一份 `.env.test`。
  - **四條 skip 路徑都給可照做的指示、絕不退回開發庫**：① 沒有 `.env.test`／裡面沒 `DATABASE_URL`；② `.env.test` 與 `.env` 指向同一個庫（＝開發庫，直接拒跑）；③ 庫不存在（psycopg 3.3 在連線失敗時**不帶 sqlstate**，`3D000` 只能從訊息認）；④ 庫在但沒有 curated schema（`to_regclass('public.players')` 為 NULL）。四條逐一實測過。
  - **schema 來源寫進文件**（本票的隱性依賴）：Python 這側不跑 migration，Drizzle 單一擁有 schema；`phobos_test` 有表是因為 vitest 每次 `beforeEach` 都 `migrate()`。`etl/README.md` 明寫「先跑一次 `pnpm test` 或 `DATABASE_URL=…phobos_test pnpm db:migrate`」，`config.py` docstring 也標明 `get_database_url()` 只供真批次。
  - **不動任何測試邏輯**（開票時已實測不需要）。驗收：`uv run pytest` **149 passed**（無 skip，代表 23 個 db 測試真的在 `phobos_test` 上跑完；`-m db` 單獨跑為 23 passed／126 deselected），跑完後開發庫 `phobos` 的 `players` 維持 **5 筆**不變。反向驗證：把 `.env.test` 暫時移走 → **23 skipped**、每筆都印出建庫與 migrate 指示，沒有任何一筆退回 `phobos`。

- [x] **執行 ETL `morning`＋`evening` 全量同步（`sync_run #424`／`#425`，皆 `success`）**——兩張票上線後的第一次真實批次，資料全部更新到今天。
  - **兩張票在真實批次裡同時驗證了**：`raw_retention` 以最後一棒跑在兩批的 `sources_ok` 尾端；warning 首次真的落進 `sync_runs.detail.sources_warnings`——`season_stats` 的 `team_rows_dropped`（5579、6038）與 `transactions` 的 `team_refs_sanitized`（15 個 team ref），批次狀態仍是 `success`。**這正是 07-30 那次「兩個 WARNING 只在終端機看得到、事後翻 sync_runs 查不到」的情境，現在查得到了。**
  - 對帳（`reconciliation`）無 mismatch；`raw_retention` 本次刪 0 筆（表裡最舊一筆仍在 14 天內），符合預期。
  - 資料現況：players 6／games 245／transaction_events 238／game_batting_lines 1530／season_batting_stats 42／player_recent_form 6；五名追蹤球員狀態皆 `active`，近況句全部有真值（如「連續 3 場有安打」「上一場優質先發」）。
  - 體積：兩批寫入 98 筆 raw 後 `raw_payloads` 1376 → **1736 kB**、DB 維持 **11 MB**（清理前是 6200 kB／16 MB）。

- [x] **`raw-payloads-retention/01` 完成——raw 從此有時間維度的管理**（票 `.scratch/raw-payloads-retention/issues/01-raw-retention-policy.md`）。
  - **分級 TTL**（天數 batu 定案）：`transactions` 365／`people`(bio) 90／`teams` 60／`schedule` 30／`people/*/stats` 14／`savant` 14。`teams` 從原提的 30 上調到 60，因為實測它只在 evening／manual 抓、已 8 天沒進新的一筆，30 天有把唯一一份清空的風險。**未分類的 `(source, endpoint)` 保留不刪並發 warning**（沒有 catch-all 預設天數）——新 endpoint 必須有意識分類，不能被預設值默默清掉。那個 warning 正好走 `batch-warnings` 剛做好的通道落進 `sync_runs.detail`。
  - 實作 `sources/raw_retention.py`：撈 `(id, source, endpoint, fetched_at)`（**不 select payload**）→ 純函式 `plan_prune` 判定 → 依 id 刪。規則只有一份實作、可不接 DB 純測。排在 `build_sources` **最後一棒**，靠 batch 的 per-source 隔離達成「清理失敗不影響當批 ingest」。另加 `etl prune-raw [--dry-run]`。
  - **一次性清存量與 TTL 是兩件事**：上線當天 dry-run 是 `would delete 0`（最舊一筆 07-27、才 10 天，連最短的 14 天都沒到）。真正的存量是 `xwoba-savant` 初版留下的 7 筆全聯盟 CSV（id 1278~1284），TTL 對它們無效（08-03 才寫入），需手動刪。
  - **體積**：`raw_payloads` **6200 kB → 1376 kB**、DB **16 MB → 11 MB**（刪 7 筆 + `vacuum full`）。降幅遠大於刪掉的文字量——jsonb 磁碟上是 TOAST 壓縮的，而 `length(payload::text)` 量的是解壓後大小，加上 dead tuple 膨脹一併回收。**本票一路引用的「文字量」高估了實際磁碟佔用**，往後改看 `pg_total_relation_size`。
  - 測試 9 項（`etl/tests/test_raw_retention.py`）：各級依自己的天數到期、`people` 不被 `people/*/stats` 誤掃、未分類保留並告警、當批寫入不會自清、DB 端到端、三種 batch kind 都以 sweep 收尾。ETL suite 149 passed。
  - 文件：`spec-03 §7` 新增「Raw 保留策略（TTL）」、`ADR §8.1` 補保留期限——ADR 原本只說「可 reprocess」沒說留多久，正是這個坑的源頭。

- [x] **`batch-warnings/01` 完成——source warning 已寫入 `sync_runs.detail`**（票 `.scratch/batch-warnings/issues/01-source-warnings-in-sync-runs-detail.md`）。
  - `SourceResult` 新增結構化 `warnings`；source 成功後 warning 以 `detail.sources_warnings` 依 source 歸檔。無 warning 的 detail 維持既有形狀，jsonb schema 不需 migration。
  - 接上 six warning producers：對帳 mismatch（含 player／欄位／投影值／觀測值／建議 manual event）、games／transactions team ref sanitize、season stats 丟棄未知球隊、Savant 跳過年份、StatsAPI 重試。後者由 batch-scoped collector 歸屬當前 source。
  - `derive_status` 不變：warning 一律資訊性，成功但帶 warning 仍是 `success`；來源拋例外才維持既有的 rollback／`partial`／`failed` 語意。
  - 測試：ETL 針對 warning detail、status、不同行為來源與 StatsAPI 重試的單測；完整 suite 見本次提交驗證。
  - **同日驗收後續修正兩項**：① **失敗的 source 不再丟掉 warning**——原本 collector 開在 `try` 內，走 except 分支就取不到，上游重試那幾筆（最能解釋失敗原因的線索）會消失；改成 collector 開在 `try` 外，失敗的 `SourceResult` 一併帶上已回報的 warning，spec-03 §7 補記此語意。② 驗收時補做**真 jsonb round-trip**（單測全走 FakeStore，沒人驗過真的寫得進 `sync_runs.detail`）：在 `phobos_test` 跑帶 warning 的批次，`detail.sources_warnings` 原樣存回、`None` 正常、status 仍是 `success`。ETL suite 138 passed。

### 2026-08-03

- [x] **`sync-runs-test-isolation/01` 完成——測試改連獨立 DB，批次歷史從此留得住**（票 `.scratch/sync-runs-test-isolation/issues/01`，commit `43ed9f2`）。
  - **背景與決策（自「進行中」區移入）**：`lib/services/sync.test.ts:16,20` 對共用開發 DB 做**無 `where` 的整表刪除**（`beforeEach` + `afterAll`），`lib/db/client.ts` 讀同一個 `DATABASE_URL` → **每跑一次 `pnpm test` 批次歷史就歸零**。這是快照裡「`id` 已到 382、表裡剩 1 筆」的真正原因（先前推測「DB 重建過」為誤）。全 repo 整表刪除僅此一處，其餘 34 個 `db.delete()` 都以 fixture id 圈住自己。
    - **影響範圍**：`sync_runs` 三個用途中，footer 的「資料更新於」（取最近一筆非 failed）**不受影響**；失效的是**批次結果稽核**（partial 出現過幾次、哪個 source 常掛）與**對帳告警落點**（roster/IL 與投影不一致寫入 `detail`，spec-03 §6）。
    - **決策（2026-07-29，batu）**：暫不判斷批次歷史是否需長期保留，**先留著、過一陣子再檢討**；本票只讓它**留得住**，不引入保留期限。成本近乎零（一天兩批約 730 列/年、`detail` 幾百 bytes、查詢連索引都不需要）。`id` 斷號是 sequence 不回收的正常現象，不處理。
    - **只加 `where` 是不夠的——決策已定：改用獨立測試 DB（2026-08-03，batu）**：`getLastSyncedAt()` 本就是全表查詢（要回「整個系統最新一筆」），且第一個測試斷言 `toBeNull()`、**本質上要求空表**，所以 scoped delete 與 transaction rollback 都救不了它。採 `.env.test` → `phobos_test`，順帶讓其餘 34 個 DB 測試不再寫進開發資料。
      - **可行性已複查（2026-08-03）**：全 repo **11 個測試檔會連 DB，且每一個都自帶 `migrate()`**——搬到空的 `phobos_test` 不需額外 bootstrap 或 seed，schema 由測試自己建。這是此方案成本低的關鍵前提，已確認成立。
      - 複查現況（診斷當下）：`sync_runs` 為 **2 筆、max id 383**（07-30 跑過一次批次、之後沒再跑測試），斷號與筆數落差的形狀完全吻合此診斷。
  - **落地**：`.env.test` → `phobos_test`，`vitest.setup.ts` 以 `override: true` 在測試模組 import 前載入（`lib/db/client.ts` 在 import 當下就讀 `DATABASE_URL`）；`sync.test.ts` 的兩個整表 delete 保留、改註解說明前提已是獨立 DB。**Node 140 綠，跑完後開發 DB `sync_runs` 維持 4 筆／max id 389 不變**（本票驗收條件）。
  - **後續修正（同日）**：README 的 `createdb -h localhost -U phobos phobos_test` **在本機 Postgres 上必然失敗**（`ERROR: permission denied to create database`——`phobos` role 沒有 `CREATEDB`；docker 的 `POSTGRES_USER: phobos` 在容器內本身是 superuser，本機安裝不是，**文件只寫了一種前提**）。實務後果：這個 commit 進版控時測試從沒綠過。已把 docker／本機兩條路分開寫清楚（本機那條明示用 superuser 並解釋為何 `-U phobos` 會失敗），並新增 `scripts/db/init-test-db.sql` 掛進 `docker-entrypoint-initdb.d`，docker 首次啟動即自動建好 `phobos_test`。

- [x] **`games-role-split/01 → 02` 完成——拆開 `games` 的兩個角色**（票 `.scratch/games-role-split/issues/`，commit `43ed9f2`，migration `drizzle/0003_absent_skin.sql`）。
  - **背景與決策（自「進行中」區移入）**：2026-07-29 由 DB 現況快照盤點出來：`games` 2691 筆同時扮演「未來賽程表」與「歷史比賽維度表」，兩者生命週期完全相反（一個過期就該丟、一個要永久保留），混在一張表是後述三個問題的共同根因。**決策理由是語意誠實，不是省空間**——15 人規模下 `games` 也才約 7,500 筆／1 MB（現況 384 kB；15 MB 的 DB 裡真正的大戶是 `raw_payloads` 6.1 MB）。
    - **盤點結果**：2691 筆中 1736（64%）是 tracked 球員打過的（`etl backfill` 2021→今，`career_high` 的依據，**必須保留**）、25 筆是現役球隊前瞻、**929 筆（35%）跟任何 tracked 球員都無關**——schedule 每批對六個 sportId 掃全聯盟的殘留，無人參照、只增不減。表上沒有欄位能區分這兩種來源，只能反查 `game_*_lines`。
    - **另查到的 bug**：schedule 窗口是 `today-1 .. today`（`games.py:226`）**從不抓未來**，41 筆 `scheduled` 全部日期 `2026-07-27`（早於當日），而 `player-upcoming.ts:85` 要求 `>= today` → **個人頁與首頁的「下一系列賽」目前實際上是空的**。票 02 一併修掉。
    - **票 01 逐場自給自足**（frontier）：`game_date_us`／`opponent_team_id`／`is_home` 反正規化進 `game_*_lines`、回填、拆掉 `game_pk` 的 FK、**8 處查詢**移除 join（TS 6：`player-recent` ×2、`home` ×4；**Python 2：`recent_form.py:310-327`**——近況引擎讀全歷史取 `game_date_us`，是清理策略下唯一會被打爆的讀取端）。這三欄是這些查詢從 `games` 取的**全部**內容（比分／球場／狀態／系列賽一欄都沒用到），且 gameLog payload 本來就有（`game_lines.py:147-154`），目前只是拿去組 `games` 表頭。
      - **2026-08-03 修正清點**：初版寫「7 處，TS 5」漏掉 `home.ts:158`（digest 當日**投手** line 的 join）。漏改不會報錯，但票 02 清掉 `games` 過期列後**首頁 digest 投手卡會靜默消失**。
    - **票 02 `games` 轉純前瞻**（blocked by 01）：schedule 只抓現役球隊、**窗口改 `today-7 .. today+7`**、gameLog 停止 upsert 表頭、每批清掉窗口外的列。預期收斂到兩百多筆。
      - **決策（2026-08-03，batu）**：往前留 7 天是為了保住個人頁的「球隊近期戰績」（最近 3 場 `final` 含比分）。原本列的替代方案「改由逐場表推導」**經查證做不到**——逐場表只有 tracked 球員自己出賽的場次（球隊比賽他沒上場就沒有列），且票 01 明確不帶比分欄。往後 7 天則是「下一系列賽」所需（一個系列 3–4 場，1–2 天會空掉）。ingest 與保留用同一個窗口值。
      - **2026-08-03 重測數字**（開票時 → 現在）：總筆數 2691 → **2877**；無人參照殘留 929 → **1133（39%）**，單一批次就 +204；`scheduled` 139 筆但**全表只有 2 筆日期 >= 今天**，「下一系列賽」仍實質全空。
  - **落地與實測**：兩張逐場表加 `game_date_us`／`opponent_team_id`／`is_home` 並回填、拆掉 `game_pk` 的 FK；**8 處 join 全數移除**（含初版漏清點的 `home.ts:158`——漏改不報錯，但票 02 清列後首頁 digest 投手卡會**靜默消失**，已補測試斷言）。`games` **2877 → 275 筆**（其中 30 筆日期 `>= 今天`），「下一系列賽」由實質全空恢復正常；gameLog 的 `upsert_game_headers`／`GameHeaderRow` 已移除。
  - 精確版本的「`player-upcoming.ts` 不動」：查詢語意完全沒變（照舊讀 `games`），但 `team-map.ts` 的 `opponentOf` 一分為二（逐場列自帶對手 → `opponentOf`；schedule 由主客兩隊推導 → `opponentFromTeams`），呼叫端跟著改名。

- [x] **`xwoba-savant/01` 完成——`season_batting_stats.xwoba` 終於有值**（票 `.scratch/xwoba-savant/issues/01`，commit `43ed9f2` ＋同日四項後續修正）。
  - **背景與決策（自「進行中」區移入）**：該欄自建表以來全為 NULL（StatsAPI `sabermetrics` 不給 xwOBA，那是 Statcast 的東西），而 schema 一開始就留好位置：`season_stats.py:288` 刻意把 `xwoba` 排除在 `ON CONFLICT DO UPDATE SET` 外、註解寫明留給未來的 Savant source。與 `games-role-split` 無相依，可並行。
    - **來源（2026-07-29 實測）**：`baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=<Y>&filterType=bip&min=1&csv=true` → 200 / `text/csv`；`player_id` 即 `mlb_player_id`、`est_woba` 即 xwOBA。**`min=1` 必須明設**（預設 `min=q` 會濾掉兼職球員；實測 2025 年 666 列，抓得到鄭宗哲 `pa=7`）。**不引 pybaseball**——它底層就是打這個 endpoint，卻要拖進 pandas/numpy/matplotlib 只為一欄；標準庫 `urllib`+`csv` 即可，與 `snapshot.py`／`build_docs.py` 零依賴路線一致。
    - **粒度不匹配——決策已定 (a)（2026-08-03，batu）**：我們的 PK 是 `(player_id, season, level, team_id)`，Savant 是「球員×球季」不分隊。**採 (a) 只在該 `(player_id, season, level='mlb')` 唯一一列時才寫、多隊留 NULL**（誠實、零誤導，9 個 MLB player-season 覆蓋 8 個，個人頁本來就缺值不顯示）；(b) 同值寫進多列＝假資料；(c) 加球季合計列違反 spec-01 C.7「層級合計不落表」。
      - **(b) 為何特別糟（實測佐證）**：同列的 `woba` 是**分隊**的（`season_stats.py` 的 `_index_saber_by_team` 按 `team.id` 索引，上游的「跨隊合計」split 被 ETL 刻意跳過）。Fairchild 2022 三列 woba 各為 0.389（113，99 PA）／0（136，3 PA）／0（137，8 PA）。若三列都填整季 est_woba 0.323，等於在 3 PA 與 8 PA 的樣本上憑空生出「運氣很差」的故事，而 xwOBA 的用途正是跟 wOBA 對照看運氣——**口徑不一致的對照比留白傷害更大**。
      - **`team=` 參數已實測、救不了這題（2026-08-03）**：`year=2022` 加 `team=113` 回的仍是整季 `pa=110`／`est_woba=0.323`（不是他在 113 隊的 99 PA），且每位球員只掛一支球隊（136／137 查無此人）。**`team=` 是名單篩選、不是數據口徑**，多隊球季的分隊 xwOBA 在這個 endpoint 上無解。
      - 順帶驗證：用我們的 per-team woba 做 PA 加權 `(0.389×99+0×3+0×8)/110 = 0.3501`，對上 Savant 整季 `woba=0.350`——ETL 的 per-team 值與上游一致。但**可合成 ≠ 可拆解**，已知整季值反推三隊是一式三未知數。
      - 日後若真要顯示多隊球季 xwOBA，正解是在 **services 的層級合計層**跟重算的合計 wOBA 並排（同口徑），**不是往 per-team 列裡塞**。
    - **來源選型結論（再次驗證 ADR §6.4，2026-07-23 的結論仍成立）**：pybaseball 的 Baseball-Reference 與 FanGraphs 路徑 **實測皆 403**（BR 回 Cloudflare「Just a moment...」挑戰頁，pybaseball 的 `IndexError` 是解析挑戰頁的症狀而非改版）。差別是結構性的：Savant 與 StatsAPI 同屬 MLB Advanced Media、`csv=true` 是官方匯出；BR／FG 是私人公司、資料即商品，擋 bot 是理性行為。**BR/FG 一律不進排程 ETL。** 連帶結論：**OPS+ 拿不到**（BR 原生指標，且需要 StatsAPI 沒有的球場因子，自算會得到跟任何公開來源都對不上的數字）——已有的 `wrc_plus` 是其上位替代且同樣 MLB-only，真正的缺口是**小聯盟層級沒有任何校正後打擊指標**（追蹤球員多數在 3A），那需要外部來源、非換欄位可解。
  - **落地**：零依賴 `urllib`＋`csv` 的 `etl/src/etl/sources/savant.py`，掛在 morning 的 `season_stats` 之後（要先有列才能 UPDATE）；只更新 `xwoba` 一欄，與 `upsert_season_batting` 刻意把 `xwoba` 排除在 `ON CONFLICT DO UPDATE SET` 外互為配套。實測決策 (a) 生效：Fairchild 2022 三列維持 NULL、鄭宗哲 2025 得到 wOBA 0.000 / xwOBA 0.170（正是這個欄位存在的意義）。
  - **驗收時發現並修掉的四個問題（2026-08-03，batu）**：
    1. **【正確性】0 打席的列誤觸「多隊球季」守門員。** `count(*) = 1` 把 `pa = 0` 的列也算進去。實例：Fairchild 2026 有兩列 MLB——team 114 `g=14, pa=27` 與 team 136 `g=1, pa=0`（出賽一場但沒輪到打擊）；Savant 2026 是 `pa=27, est_woba=0.28`，**與 team 114 的 27 PA 完全相等**，現實中零歧義、只有我們的列數有歧義，結果整季 xwOBA 從網站消失。交易、升降、代跑代守都會生出 `pa = 0` 的列，**不是罕見邊界**。修法：守門員與 UPDATE 目標**兩處都限制 `pa > 0`**；全部 MLB 列皆 `pa = 0` 時 count = 0、不寫。**實測驗證**：team 114 = `0.28`、team 136 維持 NULL。
    2. **【raw 體積】每批重存整個聯盟的 CSV。** 實測一批 **7 筆／1679 kB**（全聯盟 577~946 列），但只追 5 人、reprocess 也只會針對他們。改為 raw 只存過濾後的 tracked 列 → 同一批 **1 筆／1085 bytes（3 列）**。這件事原本直接惡化 `raw-payloads-retention` 要解的問題（日增 1.2 → 2.9 MB）。
    3. **【請求數】不再每天早上重抓 2020~去年。** 歷史球季在上游是凍結的。改為只抓**當季 ＋ 任何「寫得進去卻仍為 NULL」的過去球季**（`seasons_to_fetch`，與守門員共用同一條 `pa > 0` 唯一列判準，兩者不會漂移）。實測 `seasons_to_fetch → [2026]`，**7 個請求變 1 個**；白名單新增球員時缺口會自動出現、隔天自動補齊。強制全部重抓走 `etl resync --season`（已把 savant 掛上去）。
    4. **【穩健性＋可診斷性】** 原本任一年拋例外就整個 source 中止、`update_xwoba` 完全不執行，已抓到的年份一起丟掉（批次 388、389 兩次都掛在 2020，均為暫時性失敗）。改為**逐年容錯**：某年失敗記 warning 並跳過、成功的年份照樣寫入；**只有全部年份都失敗才拋**——因為 `batch.py` 是「拋例外就 rollback 整個 source」，部分失敗若拋，好資料會被回滾；全失敗才拋才能讓 `derive_status` 如實落成 partial／failed。另把 `repr(last_exc)` 併進 `SavantError` 訊息（`batch.py` 只存 `repr(exc)`，根因不進訊息就進不了 `sync_runs.detail`），retry 捕捉範圍從 `except Exception` 縮到 `(OSError, http.client.HTTPException)`，**程式錯誤直接冒出來**、不再被重試三次偽裝成網路問題。
    - 已知取捨：部分年份失敗只留 log warning、不落 `sync_runs.detail`（沿用對帳告警的 signal-only 慣例，要落帳得擴充 per-source batch API）；Savant 真的沒有值的球季會每天重查，上限就是原本固定的 7 個請求。
  - 測試：`etl` **132 綠**（+8：0 PA 不算歧義、全 0 PA 不寫、raw 只留 tracked 列、逐年容錯保住成功年份、全失敗才拋、缺口掃描、錯誤訊息帶根因、程式錯誤不重試）。

- [x] **`doc-drift-fixes/01` 完成——ETL 文件漂移 A／B／C 三段全清**（票 `.scratch/doc-drift-fixes/issues/01`，commit `43ed9f2`）。
  - **背景與決策（自「進行中」區移入）**——ETL 文件漂移兩處（2026-07-30 說明三批次差異時查出；純文件／死碼清理，不動執行邏輯）。
    - **A：`GAMELOG_LOOKBACK_DAYS` 是死常數。** `config.py:24` 有定義，**全 repo 無任何 import**（唯一提及是 `cli.py:11` docstring 文字）。實際 `game_lines.py:409-422` 兩批都抓**整個當季** gameLog、無回看窗口，`kind` 只用於命名 source。這是 2026-07-27 gamelog refactor 的必然結果——改成按球員抓自己的 gameLog 後「掃幾天內的比賽」就不存在了。待清：常數本身、`spec-03:37` 來源對照表、`spec-00:53` 參數表。**DEVLOG 已完成區的 `:83`／`:104` 不改**（歷史紀錄正確反映當時狀態）。
    - **B：ADR 指定「經 pybaseball」取 Savant，但 `xwoba-savant` 票選了零依賴 CSV。** `decisions.md:132`／`:139`、`spec-03:39` 都寫 Savant 經 pybaseball；票 01 改直接讀官方 `csv=true` 匯出。**這是決策變更、不只是文件過時**，正解是在 ADR §6.4 補一則決策記錄理由與影響，而非默默改字。一併記下 source 的固有限制：leaderboard 粒度是「球員×球季」、`team=` 只篩名單不改口徑，換隊球季拿不到分隊 xwOBA。
      - **⚠️ B 實質上 blocked by `xwoba-savant` 票（2026-08-03 更正）**：B 要補的 ADR 決策記的是該票**還沒實作**的選型；若先補而實作時改主意，會在 ADR 留下一則錯誤決策，比文件過時更糟。**與 xwoba 票一起做，或等它完成後再補。** A、C 不受影響，可立即動工。
    - **C（自我更正）**：DEVLOG 的 `xwoba-savant` 條目把 FG／BR 403 寫成「順帶查證」的新發現，但 **`decisions.md:131`（§6.4）早在 2026-07-23 就記錄了**並明寫「不嘗試繞過」。07-29 的實測是六天後的再次驗證，非新發現，措辭待改並指向 ADR。
    - 成因值得記住：gamelog refactor 改掉了資料抓取的**形狀**（game-中心 → player-中心），只更新了 spec-03 的敘述段落，漏掉同一份文件的**來源對照表**與 spec-00 的**參數表**。改變抓取形狀時，參數表最容易漏。
  - **A**：`config.py` 的 `GAMELOG_LOOKBACK_DAYS` 已刪、`cli.py` docstring 改為「回補早於當季的歷史逐場」、`spec-03` 來源對照表與 `spec-00` §4 參數表已更新；DEVLOG 已完成區與兩張已完成票裡的提及**刻意保留**（歷史紀錄）。
  - **B**：ADR §6.4「可用來源」改為 **MLB Stats API ＋ Savant 官方 CSV 匯出**，補上不引 pybaseball 的理由與 source 固有限制（leaderboard 粒度球員×球季、`team=` 只篩名單不改口徑）；`decisions.md:37` 補註「pybaseball 前提已演變、選 Python 的結論不變」。原本「B blocked by xwoba 票」的顧慮因兩者同批完成而解除——ADR 記的就是實際落地的選型。
  - **C**：DEVLOG 的 FG／BR 403 措辭改為「**再次驗證 ADR §6.4（2026-07-23）的結論仍成立**」並指向 ADR。
  - 同日後續：因 xwoba 票的四項修正，`spec-03` §3 補了 Savant 抓取範圍與 raw 存法、§7 補了 `resync --season` 也會強制重抓 Savant，`spec-01` C.7 補了 `pa > 0` 判準。

- [x] **順修 `lib/services/home.ts` 的 dead import**：票 01 移掉 8 處 join 後 `games` 已無使用處，但 `pnpm typecheck` 沒開 `noUnusedLocals` 所以擋不下來。已移除。

### 2026-07-30

- [x] **執行 ETL `morning` 同步批次**（2026-07-30）：`sync_run #383 → success`，約 2 分鐘。變化：`games` 2691→2877（**+186，其中僅 8 筆對應實際出賽**——印證 `games-role-split` 票 02 的殘留成長速率比原估更快，929→1107）、`raw_payloads` 256→339（**日增 83 筆**，印證 `raw-payloads-retention` 的緊迫性）、逐場 +8、`transaction_events` +1、`season_pitching_stats` +1。近況句全部重算出真值（林昱珉升級為 `single_game`「上一場優質先發」）。兩個 WARNING 皆既有 sanitize 規則正常運作（`season_stats` 丟 2 支非納入 sportId 球隊、`transactions` 15 個 team ref 設 NULL），與 07-29 同模式。

### 2026-07-29

- [x] **DB 現況快照工具 `scripts/db/snapshot.py`**（零依賴 Python 3 + `psql`，比照 `build_docs.py` 的路線）。把 12 張表的欄位表、筆數、示範資料、enum、索引寫進 `admin_private/current_table.md`（新增 `admin_private/` 到 `.gitignore`——內含實際資料，不進版控）。
  - **只覆寫 `<!-- snapshot:begin KEY -->` 標記區塊**，人寫的用途說明、資料流向、投影規則、查詢範例原封不動；目標檔不存在時產生含全部標記的骨架。
  - 筆數一律 `count(*)`：`pg_stat_user_tables.n_live_tup` 是 autovacuum 估計值，剛寫入未 ANALYZE 會失準（首版快照就被它誤報 `sync_runs`=0、實際 1 筆）。
  - `--check` 比對時抹掉快照時間戳（否則永遠報不同步），可當 CI gate；`--print` 輸出到 stdout。
  - 偵測到 `TABLE_ORDER` 未收錄的新表會警告並附加在最後，提醒補標記與用途說明。
- [x] 執行 ETL `manual` 同步批次：`sync_run #382 → success`。transactions 有 15 個不屬於納入 sportId 的 team ref，依既有 sanitize 規則設為 `NULL`，未影響批次完成。

### 2026-07-28

- [x] **首頁 polish 票 `homepage-digest/05` 完成——digest 錨定改 wall-clock + 即將出賽效率**（`.scratch/homepage-digest/issues/05`，分支 `feat/homepage-digest-05`；接 homepage slice code-review 兩項低嚴重度觀察）。皆為首頁 service 內部修正，`/api/home` 對外 Zod 合約不變：
  - **① digest 改 wall-clock**：`getDigestDate` 不再從 line 反推 `status`／不查 `games`／不偵測 live；digest date＝有 tracked 球員 line 且 `game_date_us` **早於當前美西（America/Los_Angeles）日期**（整天已過 → 保證該日賽事全數打完）的最新比賽日。美西「今天」以純函式算、`getHome` 的 `_today` 注入得到（重用 `player-upcoming` 導出的 `usToday`）。代價（設計上可接受）：首頁最新賽況常態落後約一天。
  - **② upcoming 效率**：首頁 upcoming 單次 `loadTeamMap` 往下傳給每次 `getPlayerUpcoming`（消掉每位球員全表掃 `teams`），並讓 `getPlayerUpcoming` 新增 `skipRecentResults` 略過首頁用不到的近期戰績查詢；維持 reuse `getPlayerUpcoming` 使 tag 判定與個人頁一致、結果不變。
  - **測試（TDD、注入 `today` 不用 live fixture）**：digest 選「早於美西今天」最新有-line 日、美西當日即使有 line 也不選、wall-clock 忽略 status、空資料→null；upcoming 新增 skip 分支斷言、既有三分支/過期排除續綠。Node 全 **140 綠**（+3），`pnpm typecheck`／`pnpm build` 均過。

- [x] **名詞庫 standard/roster slice（2 票）完成——v1 26 則名詞全數到位**（`.scratch/glossary-standard-roster/issues/`，spec-04 §A／§E）。
  - **票 01 Standard 8 則**：schema 將 `standard` 正式區分為「帶級距、無 `metric_keys`」與「純解說」兩型；進階類仍強制 `metric_keys`＋`bands`，registry build-fail 覆蓋不變。新增 AVG／OBP／SLG／OPS／ERA／WHIP 三層級距頁（3A／2A 均明示待校訂）與 IP、SV/HLD 純解說頁；不擴充個人頁指標或 standard 範例回連。
  - **票 02 Roster 6 則 + 回連**：新增 IL、DFA、waiver、option、40-man roster、Rule 5 draft；frontmatter 的 `roster_event_types` 宣告對應異動類型。名詞頁透過 `getRosterExamples` 取得最近的 tracked 球員事件，顯示日期與中文異動標籤；waiver／40-man／Rule 5 未宣告可對應事件時整塊隱藏。
  - **測試**：新增 schema、全部 14 則 content 分組、IL／DFA roster loader、空狀態與 UI smoke 覆蓋；`pnpm typecheck`、Node 全測試、`pnpm build` 均過。

- [x] **SEO slice（2 票）完成——sitemap/robots + 跨頁 Open Graph／Twitter 分享卡**（`.scratch/seo/issues/`，spec-02 §4）。
  - **票 01 爬取面**：Next metadata routes `sitemap.xml`／`robots.txt`；sitemap 包含首頁、名冊、名詞索引、全部球員（**含 archived**）與所有 MDX 名詞頁。站台 canonical origin 讀 `NEXT_PUBLIC_SITE_URL`（缺省 `https://phobos.tw`），同時作 root `metadataBase`。
  - **票 02 分享面**：站台預設 OG／Twitter 卡採新生成的 `public/og-default.png`；球員頁 title 含目前隊伍、description 用近況、圖片優先 MLB static team logo（無隊 fallback 預設圖）；名詞頁 title／description 取中英文名與 blurb。`/players`、`/glossary` index 繼承站台預設。
  - **測試**：Node 全 **128 綠**（+5：sitemap 靜態／tracked／archived／名詞、robots、球員 OG logo／fallback、名詞 OG）；`pnpm typecheck` 綠。

- [x] **首頁動態導向 slice `homepage-digest`（4 票）完成——`/` 改為四區動態首頁 + 單一 `/api/home` 合約**（`.scratch/homepage-digest/issues/`，spec-02 §2.1）。首頁以 ISR 1800 秒讀 curated DB，`HomeSchema` 同時是 service／頁面／API 的合約：
  - **票 01 最新賽況**：由 tracked 球員的 game line 找「所有相關賽事皆 final」的最新美國比賽日；打／投各自組單場精簡 line，二刀流可有兩張卡，近況取 `player_recent_form`，`dataUpdatedAt` 與 footer 共用最近完成同步批次。
  - **票 02 球員動態**：digest date 後的 tracked-player `transaction_events` 跨球員倒序顯示，沿用 `transactionTypeLabel` 中文徽章與個人頁連結。
  - **票 03 即將出賽**：首頁重用 `getPlayerUpcoming`，保證與個人頁一致的 probable／possible／IL 判定；IL 只顯「傷兵中」，其餘以台灣時間顯示下一戰。
  - **票 04 空狀態**：無快訊卡時回每位 tracked 球員的本季、無則上季摘要與近況；名詞入口採 content frontmatter 的穩定靜態三則，不做動畫。
  - **測試**：Node 全 **123 綠**（+7：digest date／角色 line／二刀流、異動倒序、預告三分支、空狀態本季/上季 fallback、`/api/home` Zod、首頁四區 smoke），`pnpm typecheck` 綠。
  - **`/code-review`（batu 觸發）：關卡全綠（typecheck／123 測試／build 皆過），2 項低嚴重度觀察 → 切 polish 票 `homepage-digest/05`（未修）**：① digest 的「該日全 final」guard 因「有 line ⟹ gamelog 強制 final」在正式資料下實質失效（同日某球員仍進行中、無 line 時會選到半日）——正解改依 `games` 表判定相關賽事是否全 final；② 首頁 upcoming 對每位球員各呼叫 `getPlayerUpcoming`，每次全表掃 `teams` 且算首頁用不到的近期戰績——改單次載 team map 往下傳、略過近期戰績。另記：agent 直接 commit 到 main（未開 feature branch）。

- [x] **名詞庫 + 進階數據 slice `glossary-and-advanced-metrics`（4 票）完成**（`.scratch/glossary-and-advanced-metrics/issues/`，分支 `feat/glossary-and-advanced-metrics`，spec-04 全，spec-02 §2.4-2.5）。名詞庫從無到有跑通：`/glossary` 主題分類索引 → `/glossary/[slug]` 三層模板（判讀＋級距表 → 定義算法小字 → 延伸連結 → 範例球員回連）；個人頁球季區補進階數據（打/投各 7、可展開、缺值不顯示、名詞雙向連結）。
  - **票 01 管線 + registry + build-fail**：接上 `@next/mdx`（Turbopack 需 remark plugin 以字串名指定）＋ `remark-frontmatter` 剝除 YAML；名詞內容 = `content/glossary/*.mdx`（frontmatter 單一事實來源，gray-matter 讀取、Zod 驗證：欄位齊全／bands 僅 mlb/aaa/aa／區間遞增／band 視角對齊 applies_to／roster 無 metric_keys 與 bands）。build-time **registry**（`metric_key→slug`）由全部 frontmatter 生成；`assertMetricsCovered` 對「球員頁顯示指標清單」缺頁即 throw——SSG 的 `/glossary/[slug]` 於 build 觸發 → **缺頁 build fail**（spec-04 §D）。wRC+ 打穿。
  - **票 02 其餘進階名詞**：共 **10 則** MDX（打 wRC+/wOBA/ISO、投 FIP/HR9/LOB%、打投共用 BB%/K%/WAR/BABIP 各含打者/投手兩段級距），完整覆蓋球員頁打/投各 7。MLB 用公開慣例值；**3A/2A 首版佔位、正文標「待校訂」**（spec-04 §C／§G）。
  - **票 03 個人頁進階區**：`player-seasons` service 讀出已存進階欄（打 `woba/wrc_plus/war`、投 `fip/lob_pct/war`）＋新增投手 BABIP 衍生（分母 `BF−BB−K−HR` 近似、缺 HBP/SF），併入既有衍生湊齊打/投各 7；形狀入 Zod 合約（合計列因加總無法還原 stored 進階 → 留 null，衍生進階照重算）。個人頁球季區加**可展開進階區塊**（`<details>`、缺值不顯示、每指標名連向 `/glossary/[slug]`，slug 取自 build-time registry → 同時是球員頁側的 build-fail 觸點）。
  - **票 04 範例球員回連**：純函式 `selectMetricExamples`（候選＝`tracked`＋本季該指標有值；門檻打者 PA≥50／投手 IP≥20；層級 MLB>3A>2A、1A 以下排除；取 1~2、依方向挑最具代表值；無人→隱藏）＋ `selectRosterExamples`（roster 類走最近異動分支）；DB loader 取本季（資料中最新季）候選餵入。名詞頁底渲染「範例：{球員} 本季 {值}（{層級}，{級距標籤}）」。
  - **測試**：Node 全 **114 綠**（+34：frontmatter Zod、registry 完整性/缺頁 fail、band 標籤查找、範例挑選表驅動、投手 BABIP 手算、service 讀出進階欄、進階 UI 區塊/名詞連結 smoke、bands-table/examples/index 元件 smoke、examples-db 自備 fixture 整合）、`pnpm typecheck` 過、`pnpm build` 過（10 則名詞頁 SSG + 30m ISR、build-fail check 通過、實測 wRC+ 頁渲染 body/級距/範例李灝宇連結）。
  - **`/code-review` 已跑（batu 觸發）＋修正 5 findings**（commit `6e0d285`）：#1 範例排序方向改**逐視角**（shared 指標打投好壞相反——新增 frontmatter `higher_is_better_pitcher`，設在 bb-pct/k-pct/babip，兩視角各自排序＋交錯挑選）；#2 `examples-db` 改**每 player×level 加總計數**（衍生指標值與樣本門檻＝球員頁層級合計，季中換隊者不再被單段門檻誤剔；stored 進階不可加總→保留最大樣本隊值）；#3 `loadAllFrontmatter` 對 live 目錄 memoize；#4 `Perspective` 型別單一來源（改 import schema）。#5（多隊季 stored 進階在合計列消失）判為刻意、維持「缺值不顯示」，未改；如需顯示主隊列值另切 UX 票。修正後 Node **116 綠**、typecheck 清、build 過。

- [x] **球員個人頁 slice `player-detail-page`（4 票）完成——`/players/[id]` 五區全上**（`.scratch/player-detail-page/issues/`，分支 `feat/player-detail-page`，spec-02 §2.3）。名冊卡片可點入；頁面與 `/api/players/:id` 共用 `lib/services` 一組資料，Zod schema 即對外合約；非白名單→404、錯誤→500。
  - **票 01 骨架 + zone 1**：`getPlayerDetail(id)` 回 base 形狀（基本資料含慣用手/生日、目前隊伍、狀態一句、近況一句話），`/players/[id]` Server Component（ISR 1800）＋ `/api/players/:id`。`archived` 只顯 zone 1＋標「已離開美職體系」。
  - **票 02 zone 2 球季數據**：`stats.ts` 純函式由計數欄推導標準比率（打 AVG/OBP/SLG/OPS/ISO/BB%/K%/BABIP、投 ERA/WHIP/K9/BB9/HR9/K%/BB%，分母 0→null）；`buildSeasons` 依球季→層級→（每隊列＋**層級合計列**，合計由**加總計數再推導**、非平均比率，spec-01 C.7）。低階（1A 以下）標「僅供參考」；archived 呈現為「生涯總成績」。進階數據（打/投各 7）依 spec-04 §D「名詞頁先行」留待名詞庫批。
  - **票 03 zone 3+4**：`getPlayerGameLog` 回最近 `RECENT_GAMES_N=10` 場打/投分表（二刀流兩表並列、對手/主客解析、單場 OPS/ERA/WHIP 沿用票 02 推導）；`getPlayerTimeline` 回 `transaction_events` 倒序＋中文類型徽章。archived 隱藏此二區。
  - **票 04 zone 5**：`getPlayerUpcoming` 回出賽預告標籤（`probable_starter`＝投手且命中 `probable_*_pitcher_id`／`possible`＝其他健康在隊者／`il`，規則同 spec-02 §2.1 第 3 區）＋下一系列賽（對手/`venue_name`/`series_game_number`/`games_in_series`）＋球隊近期戰績（比分/勝敗）；無現隊→null。archived 隱藏。
  - **測試**：Node 全 76 綠（純比率推導對照手算值＋分母 0→null、層級合計重算、gameLog 二刀流兩表/空狀態、timeline 倒序+標籤、upcoming 三分支+無隊 null、各 zone 元件 smoke；service 皆 seed DB）、`pnpm typecheck` 過。真連線驗證：`/players/[id]` 五區皆 render、`/api/players/:id` 回完整形狀、404 分支正確。
  - **未跑正式 `/code-review`**（使用者觸發、計費，我無法代跑）；以逐檔自審＋全測試＋真連線把關代之。

### 2026-07-27

- [x] **修正下放小聯盟球員顯示錯隊 — 新增 `assign` 事件型別 + B.3 投影規則**（2026-07-27，票 `.scratch/projection-assign-fix/issues/01`）。小聯盟「assigned to [隊]」異動（typeCode ASG）原被歸 `other`、投影不動隊，導致被下放者卡在上一個 MLB 事件。作法：(1) Drizzle enum 加 `assign`（migration `0002_aberrant_doorman.sql`，`ADD VALUE 'assign' BEFORE 'il_on'`）；(2) 分類以 **description 的「assigned to」片語** 判定（非 typeDesc-前綴 haystack——避免「Assigned 」+「To…」如 Toledo 誤命中），與 invited-non-roster（春訓邀請、to_team 常為 MLB，不設 rostered）、rehab（「assignment to」）、國家隊 activate（SC）區分；(3) 投影 `assign`→rostered 取 to_team 隊/層級，**to_team 無法解析（冬季/秋季聯盟、alt-site）→ no-op 不清隊**，最後一筆可解析者勝。重投影後費爾柴德(656413)→Tacoma(529/3A)、林昱珉(801179)→Reno(2310/3A) 修正，evening 對帳對這兩位不再告警。測試 etl 122／node 41／typecheck 綠。spec-01 B.3/C.3 早前已更新。
- [x] **spec-03 ETL slice 併回 `main`（merge `3aa1a08`, `--no-ff`）＋維運收尾**（2026-07-27，batu）。review 通過（pytest 118／node 41／typecheck 綠；`game_*_lines` 1513/269、近況全轉真值、`/players` 點亮）後合併，遠端分支 `feat/spec-03-etl-skeleton` 已刪。收尾兩件：
  - **footer 轉真值**：跑正規 `python -m etl.sync evening`（`sync_run #133 → success`）讓 `sync_runs` 落帳；`/players` footer 由占位「—」轉為「資料更新於 2026-07-27 21:16（台灣時間）」。
  - **清 raw boxscore**：刪除 `raw_payloads` 重構前殘留的 120 筆 boxscore（`DELETE 120`，363→243）；新 gameLog 路徑本就不再存 boxscore。
  - **對帳觀察（signal-only、待追）**：evening 對帳跳兩個 team mismatch（費爾柴德 656413 投影 136 vs 快照 529、林昱珉 801179 投影 109 vs 快照 2310）——事件流投影隊伍與 StatsAPI currentTeam 快照不一致（近期異動未被 transactions 抓到或需補 manual 事件）。詳見 §待決問題。

- [x] **修正 slice `etl-gamelog-refactor`（2 票）完成——逐場改走球員 gameLog、退役 boxscore 全掃 + 2020 backfill**（`.scratch/etl-gamelog-refactor/issues/`，同分支）。
  - **票 01（gameLog 取代 boxscore 全掃）**：逐場來源由「掃窗口內全賽程 boxscore、再翻找 tracked 球員（~1.6% 命中、且把先發預告誤判成出賽）」改成「每位 tracked 球員的 `people/{id}/stats?stats=gameLog`——只抓自己的比賽、~100% 命中」。**必須逐一掃六個層級 sportId**（gameLog 帶 sportId 只回該層級、省略只回 MLB；實測鄧愷威 status=AAA 但實際 MLB 投球）。gameLog 每筆順手 upsert `games` 表頭（`game_date_us`／主客/level，coalesce 保留 schedule 設的分數等欄）以滿足外鍵。**schedule 前瞻來源保留**（先發預告/今日/錨點）、raw 層**停存 boxscore**。近況引擎與 schema 皆不需改。順手把票 05 為餵舊 game_lines 而加寬的 morning schedule 窗口還原成昨天～今天。
  - **票 02（初始 backfill）**：`etl backfill [--from DATE | --season YYYY]`（預設 2020→今）逐球員抓 gameLog → `game_*_lines`（＋補 `games`），**冪等、逐球員 commit 可中斷續跑**、保守 rate-limit（沿用 client delay/重試）、收尾自動 `reproject`＋近況重算。定位手動 CLI（不進兩批）。
  - **實跑驗證**：evening（當季 gameLog、~30 呼叫）→ `game_batting_lines` 2→224、pitching 0→46，**`/players` 近況由全 fallback 轉為真數據句**（李灝宇「連續 11 場有安打」、費爾柴德「近 5 場打擊率 .412」、鄧愷威「近 5 場防禦率 4.91」…）。backfill（2020→2026）→ 1513 打擊＋269 投球逐場列入庫、跨 2021~2026（這批球員 2020 尚未登錄），career/season high 自此有正確歷史基準。
  - 測試：pytest 118 綠（game_lines 測改寫為 gameLog fixture：打者/投手客場/二刀流一場兩列/小聯盟缺欄→0＋`inningsPitched` 解析/缺 gamePk 跳過;DB：header upsert 保留 schedule 欄、lines 幂等）。

- [x] **ETL slice 票 07（兩批編排 + CLI 手動工具）完成 — spec-03 ETL slice 全 7 票收尾**（`.scratch/etl-pipeline/issues/07`，同分支）。
  - **兩批編排**：morning（昨日～10 天結算逐場＋球季整季重拉＋投影＋近況重算）／evening（前瞻當日賽程＋掃尾結算＋transactions＋roster/IL 對帳）＋ manual，已於 `sources/__init__.py` 依相依序編排（games→game_lines、transactions→projection→recent_form、reconciliation 收尾）。cron 建議 morning 09:00／evening 17:30 台灣時間（spec-03 §2，上線後微調）。
  - **CLI `etl <cmd>`（`cli.py`，argparse）**：`resync --season`（整季重拉）、`resync --gamelog --from DATE`（回補早於 lookback 的逐場，接著 reproject）、`add-event`（補錄 `source='manual'` 事件——投影與現實不符時的正解，不直接改投影，spec-03 §6/§7）、`reproject`（重放投影＋重算近況）。為複用，把 games/game_lines 的抓取抽成 `ingest_schedule`／`ingest_gamelog` 公用函式。console script `etl` 已註冊。
  - 測試：pytest +6（arg 解析 4：需 command／resync 目標互斥／type 白名單／完整參數;DB 2：`insert_manual_event` 為 source=manual、add-event→reproject 點亮 status＋寫近況）。etl **全 116 綠**。CLI 真跑驗證：`etl reproject` 重投影 5 名球員、usage 錯誤正確報錯。
  - 薄殼韌性（來源失敗不中斷整批、sync_runs 正確落帳）由 `test_batch.py` 既有 partial 語意測試涵蓋。

- [x] **ETL slice 票 05（近況一句話引擎 → `player_recent_form`）完成**（`.scratch/etl-pipeline/issues/05`，同分支）。純規則引擎 `recent_form.py`，優先序取第一個命中、fallback 必中、句子永不為空、≤20 字裁切（spec-03 §5）：
  - **五層 pattern**：① `career_high`/`season_high`（上一場單場計數欄創 2020 起新高，如「上一場敲生涯最多 3 轟」「投出生涯最多 9 次三振」）→ ② `streak`（連續有安打/連續無失分 ≥3，跨層級延續）→ ③ `single_game`（上一場亮點：3+ 安、開轟、優質先發、飆 K）→ ④ `recent_agg`（近 5 場打擊率/防禦率）→ ⑤ `status_fallback`（傷兵/休賽期/近兩週無出賽，接投影狀態）。門檻與句式常數維護在程式頂部、回填 spec-03 §5。
  - 角色（打/投）由最近一場行為決定;二刀流依先發與否。每批於**投影之後**全量重算（fallback 需最新狀態）。
  - **順帶整合修正（games 窗口 + 第三個同型 FK bug）**：morning 的 `games` schedule 窗口原本只抓「昨天～今天」，導致 game_lines 的 10 天回看（從 games 表讀 game_pk）在新 DB 上無資料可掃 → 近況全 fallback。改成 morning 也抓 `GAMELOG_LOOKBACK_DAYS` 窗口。此改動暴露第三個 team-FK bug：schedule 含 ingested sportId 外的表演賽/外隊(如 2190)→ `games.home/away_team_id` FK 炸;比照 transactions 以 `sanitize_team_refs` 把無法解析的 team ref 設 NULL、保留比賽列。
  - 測試：pytest +17（純 15：五層 pattern 各案＋優先序（career_high 壓過 streak）＋fallback 三態＋永不為空/裁切;DB 1：recompute 寫 `player_recent_form`;games sanitize 1）。etl 全 110 綠。evening 真連線跑通、五名球員都有非空近況句（目前資料稀疏多為 fallback，隨每日累積 game lines 後自動轉為數據句）。

- [x] **票 03/04/06 並行開發 + 整合（consolidation）完成**。03/04/06 三個獨立 vertical 以 subagent 於各自 git worktree 並行實作（off 票 02），再由主線合併：03（無獨立 commit，工作落在共用 checkout）+04 併為一個 commit、06 以 cherry-pick 併入，解 `sources/__init__.py`／DEVLOG 衝突。**跑真實批次做整合驗證，抓到並修好兩個單元測試（各票以 fixture 隔離）測不到的跨票 FK bug**：
  - **transactions**：球員生涯異動含**六個 ingested sportId 以外**的球隊（外/冬季/大學聯盟、春訓、已解散隊，5 人共 15 個 id 如 3296）→ `to/from_team_id` FK 炸掉整個 source。修法 `sanitize_team_refs`：把無法解析的 team ref 設 NULL（兩欄皆可空）、保留事件本身（type/date/il_detail 才是投影所需）。
  - **season_stats**：即使 hydrate 指定 sportId，StatsAPI 仍回傳 ingested 範圍外球隊的球季 split（5579、6038）→ `team_id` FK 炸。因 `team_id` 屬 NOT NULL grain 不能設 NULL，改用 `filter_known_teams` **整列丟棄**（那些聯盟本就在追蹤範疇外，spec-01）。
  - **驗證**：manual/evening/morning 三批皆跑通真連線→ `player_current_status` 五名球員全上真隊伍/層級/健康（Fairchild IL-60、Cheng BOS、Lee DET、Lin AZ、Teng SUG-AAA）、`games` 120、`season_*_stats` 跨 2020~2026 入庫；`/players` 狀態一句由「同步中」變真值。Node 41 測綠、typecheck 過。
  - **回報上游決策的兩個觀察（非本 slice 職責，待 spec owner 定）**：(1) `affiliation` enum 的 `free_agent` **目前不可達**——spec-01 B.3 無事件產生它（`Declared Free Agency` 現歸 `other`）；(2) 票 06 的 `lob_pct` 目前只在有 sabermetrics block（＝MLB）時算，是否應「所有層級都由計數自算」待確認。詳見 §待決問題。

- [x] **ETL slice 票 03（狀態 vertical：transactions → transaction_events → 投影 → player_current_status）完成**（`.scratch/etl-pipeline/issues/03`，同分支）。沿用票 02 來源模組慣例：
  - **transactions source**（`sources/transactions.py`）：每位 tracked 球員打 StatsAPI `transactions`（`playerId` + `startDate=2020-01-01`~今天）→ upsert `transaction_events` by `source_tx_id`（`ON CONFLICT DO UPDATE`）。`event source='statsapi'`；`effective_date` 取 `effectiveDate`（缺→`date`），`announced_at` 存公告 `date`（StatsAPI 無 wall-clock，當 `effective_date` 之後的穩定 tie-break）。
  - **typeDesc→enum 對照（實測 2024 資料確認，回填 spec-01 §F / spec-03 §9）**：`Signed as Free Agent`/`Signed`→`sign`；`Recalled`/`Selected`/`Purchased`→`call_up`；`Optioned`/`Outrighted`→`send_down`；`Trade`/`Traded`→`trade`；`Designated for Assignment`→`dfa`；`Released`→`release`；`Retired`→`depart`；含 `injured list` 的 placed/transferred→`il_on`（並解析 `il_10/il_15/il_60/il_7`）、activated/reinstated→`il_off`。`Assigned`(ASG)＝小聯盟指派：description 含「assigned to [隊]」→`assign`（2026-07-27 修正，見已完成區），春訓 invited-non-roster／rehab（「assignment to」）仍→`other`。**其餘未知一律→`other`**：`Status Change`(SC，非 IL 者)、`Claimed Off Waivers`(CLW，waiver claim 依票歸 other)、`Declared Free Agency`(DFA)、`Number Change`(NUM)、`Returned`(RTN)。
    - **兩個實測坑（已修）**：(1) 典型 IL 異動走 `typeCode=SC/typeDesc="Status Change"`，IL 細節只在 `description`——故分類同時吃 `typeDesc+description` 且 IL 判定優先；SC 不可對到 `sign`。(2) typeCode `DFA` 實為 *Declared Free Agency*（不是 designation！），designation 走 `DES`——已避免撞碼。typeDesc 比對採**詞邊界**（`\bsigned\b` 不誤中 "as·signed" 的 Assigned）。
  - **投影純函式**（`project_status`，spec-01 B.3）：事件依 `(effective_date, announced_at, id)` 排序重放→`(affiliation, health, team, level, il_detail, as_of_event_id)`；`dfa` 保留原隊參考、`release`/`depart` 清隊並重設 active、`other` 只上時間軸不動 as_of。收尾 `project_all_tracked` 全量重放所有 tracked 球員寫 `player_current_status`（PK upsert）。**無任何 affiliation 事件（如只有 IL toggle）→ 回 None 不寫**（`affiliation` NOT NULL，不捏造）。
  - **對帳（signal-only）**：`people?hydrate=currentTeam` 快照與投影比對，不一致→`logging.warning` 提示補錄 manual 事件，**不自動改投影**（事件為真相）。**限制**：`sync_runs.detail` 落帳超出 per-source batch API → 採 logged warning（票允許，見下「整合者注意」）；`/people` 不穩定供 IL 狀態，目前 IL 對帳為 best-effort（team 對帳完整），完整 IL 對帳建議日後改抓 team roster snapshot 的 per-entry status code。
  - **schema 合約缺口**：`affiliation` enum 有 `free_agent`，但 spec-01 B.3 無任何事件會產生它（`Declared Free Agency` 現歸 `other`）→ `free_agent` 目前**不可達**。非本票職責，留給整合者/spec 決定是否補一條事件對照或移除該 enum 值。
  - 測試：pytest +22（純 20：classify 各軸＋真實字串回歸＋詞邊界、transform 正常/缺欄、投影表驅動涵蓋 sign/call_up↔send_down/IL on-off/dfa/release/depart/other/亂序重放/同日 tie-break/無 affiliation→None、reconcile team+health mismatch/未知欄位跳過/snapshot 解析；DB 2：`source_tx_id` 幂等 upsert、`project_all_tracked` 寫 status 幂等，皆帶 fixture 球員/球隊、`finally` 清理）。`cd etl && uv run pytest -q` 全 75 綠（含 db，Postgres 已起）。
  - **整合者注意**：本票與票 04/06 並行改了 `sources/__init__.py`（新增 transactions/projection/reconciliation 註冊：transactions 進 morning/evening/manual、projection 續其後、reconciliation 進 evening/manual）與本 DEVLOG 本節——預期衝突，交由整合者合併。未動任何共用基礎檔。

- [x] **ETL slice 票 04（逐場 vertical：schedule + boxscore → games/game_\*_lines）完成**（`.scratch/etl-pipeline/issues/04`，同分支）。沿用票 02 的來源模組慣例：
  - **games source**（`sources/games.py`）：StatsAPI `schedule`（各 sportId、`hydrate=probablePitcher`、抓「昨天～今天」窗口）→ upsert `games`；`game_date_us` 以 StatsAPI 自己的 `officialDate` 錨定（本地時鐘只決定抓哪幾天，不寫入任何欄位）。**status 對照**：`detailedState` 命中 `postponed/suspended/cancelled` 關鍵字者優先對到對應 enum；否則 `abstractGameState=Final→final`、`Live→live`，其餘（`Scheduled/Pre-Game/Warmup`…）預設 `scheduled`。
  - **game_lines source**（`sources/game_lines.py`）：`game/{gamePk}/boxscore` → `game_batting_lines`／`game_pitching_lines`，grain `(player_id, game_pk)`；角色由 `stats.batting`/`stats.pitching` 各自的 `gamesPlayed>=1` 判定，二刀流可兩表並存；只收 `lifecycle='tracked'` 球員。morning 回看 `GAMELOG_LOOKBACK_DAYS=10` 天（上游會事後修正）、evening 掃「昨天～今天」窄窗（補西岸晚場殘餘）。`build_sources` 內 `games` 先於 `game_lines_*` 註冊，確保同批次內先看得到剛 upsert 的比賽。
  - **小聯盟缺欄**：兩張 lines 表的計數欄在 Drizzle schema 皆 `NOT NULL DEFAULT 0`（唯一可為 NULL 的是 `team_id`），故「缺欄留 NULL」落地為「缺欄→0」；`team_id` 解析不到時才真的留 NULL。無 schema 缺口需回報。
  - 測試：pytest +21（純 19：schedule 欄位映射／缺 pk-or-officialDate 跳過／status 對照表 10 組參數化／MLB 正常 boxscore 二刀流兩表並存＋濾除未追蹤球員／小聯盟缺欄 fixture 全落 0／`ip_outs` 优先 `outs` 欄、否則解析 `inningsPitched` 局數×3；DB 2：games upsert 幂等改狀態、lines upsert 幂等，皆帶 fixture 球員/比賽、`finally` 清理）。`cd etl && uv run pytest -q` 全綠（含 db 標記，Postgres 已起）。
  - 與票 03/06 並行，`sources/__init__.py`／DEVLOG 本節預期與其他票衝突，交由整合者合併。

- [x] **ETL slice 票 06（球季數據 season_\*_stats：標準計數＋進階）完成**（`.scratch/etl-pipeline/issues/06`，同分支）。新增 `etl/src/etl/sources/season_stats.py`，沿用票 02 建立的來源模組慣例。
  - **來源確認（實測，先前無 fixture 記錄）**：`GET /people?personIds=…&hydrate=stats(group=[hitting,pitching],type=[season,sabermetrics],season=Y,sportId=N)`——一次 call 拿到該 (season, sportId) 下所有 tracked 球員的打／投、計數／進階兩型別，call 數＝season 數 × sportId 數（與球員數無關）。
  - **grain 正確性**：payload 同季跨隊會多一列「跨隊聚合」split（無 `team` 欄）＋各隊一列；只取有 `team` 的列，符合 `(player_id, season, level, team_id)` grain、不做跨隊/跨層級合計。
  - **進階欄僅 MLB**：非 MLB sportId 查詢 `sabermetrics` 型別**直接回傳整個 block 不存在**（非空陣列、非報錯）——已用 sportId=11 實測驗證；因此 `woba/wrc_plus/war`（打）、`fip/war`（投）自然為 None，無需特判。`lob_pct` 由 ETL 自算（公式 `(H+BB+HBP-R)/(H+BB+HBP-1.4*HR)`），但比照票 06 說明「小聯盟進階留 NULL」的整組語意，只在該 (season,sportId) 有回傳 sabermetrics block 時才算——這是本票的解讀取捨，非上游限制，留給整合者確認。
  - **xwoba 本票不寫**：Savant 整個跳過（不加 pybaseball 依賴）；`upsert_season_batting` 的 `ON CONFLICT DO UPDATE` **刻意不含 `xwoba`**，只在 INSERT 分支帶 NULL，避免本來源每次重拉把未來 Savant 來源寫入的值蓋回 NULL。
  - **測試**：pytest +13（純 11：計數/進階欄位映射、跨隊聚合列剔除、缺 sabermetrics→None、`_lob_pct`／`_outs`（含 `inningsPitched` 字串回退）／`_season_range`；DB 2：batting/pitching upsert 幂等＋ xwoba 不被覆蓋，皆用越界 id＋`finally` 清理，含 players/teams 前置 fixture 列）。另跑一次**真連線 smoke**（Aaron Judge 2024 MLB、AAA 球員 2025）核對 transform 輸出。etl 全 45 綠。
  - 已註冊進 `sources/__init__.py` 的 **morning** 批次（spec-03 §2：球季數據整季重拉屬 morning 職責）。
  - **註冊**：進 `sources/__init__.py` 的 **morning** 批次（spec-03 §2：球季數據整季重拉屬 morning 職責）。

- [x] **ETL slice 票 02（參考資料 teams + 球員 bio）完成**（`.scratch/etl-pipeline/issues/02`，同分支）。建立**「來源模組」慣例**供後續票遵循：`etl/src/etl/sources/` 套件，每模組＝純 `transform_*(payload)→rows` ＋ `upsert_*(conn,rows)`（`ON CONFLICT DO UPDATE`、不 commit）＋ `make_*_source(client,conn)` 工廠。
  - **sportId→level 常數**（`constants.py`，spec-03 §4）：`1=mlb,11=aaa,12=aa,13=a_plus,14=a,16=rookie`；`level_rank` 供 teams 排序。
  - **teams source**：抓各 sportId → upsert `teams`，含 `parent_org_team_id`（母球團）；rows **MLB 先於 affiliate** 排序，讓 minor-league 的 parent FK 在同 transaction 內成立。
  - **players_bio source**：抓 tracked 球員 people → **只更新 bio 欄**（守位／慣用手／生日），**不碰白名單 lifecycle／created_at／name_en／人工 name_zh**、不 insert。
  - **實跑驗證（live StatsAPI）**：231 隊入庫（mlb/aaa/aa/a+/a 各 30、rookie 81），AAA affiliate 正確指向母球團、FK 無違反；raw_payloads 落 6 teams＋1 people；status success。sync.py 建 client（FileCache＋raw recorder），reference data 併入 evening／manual 批。
  - 測試：pytest +8（teams transform/level fallback/self-parent、DB upsert FK 排序+幂等；people transform、DB bio 更新保留白名單欄、未知球員 0 更新）。etl 全 32 綠。

- [x] **ETL slice 票 01（走路骨架）完成**（`.scratch/etl-pipeline/issues/01`，分支 `feat/spec-03-etl-skeleton`）。Python 資料層起步、footer 由占位改真值：
  - **uv 管理的 `etl/` 專案（src layout）** 與 Node/資料層共存於同 repo，不動既有 `pnpm test`／`typecheck`／`db:*`；`psycopg` 存取，**把 Drizzle 的 curated schema 當固定合約、絕不下 DDL**。
  - **StatsAPI client**（`statsapi.py`）：保守 delay、重試 2 次（3 次嘗試）、可選本地檔案快取（`cache.py`，含 TTL）、成功回應經注入的 recorder 落 `raw_payloads`。HTTP session／sleep／cache／recorder 全可注入 → 重試/快取/記錄邏輯離線可測、不打真網路。
  - **`sync_runs` 開帳→收帳**：開帳時**悲觀寫 `failed`**、乾淨收尾才改 `success`/`partial`——中途死掉的殘帳自然被「最近一筆非-failed finished_at」略過（crash-safe）。`run_batch` 逐來源獨立 transaction：成功 commit、失敗只 rollback 該來源並記 `detail`、**不中斷整批**（→ partial）；全來源失敗→ failed；框架級致命→ 強制 failed 後重拋。
  - **CLI `python -m etl.sync <morning|evening|manual>`**：跑一個批次（此票各批來源清單暫空）並落一筆 `sync_runs`。
  - **Node 端**：`lib/services/getLastSyncedAt()` 讀最近一筆非-failed 且已 `finished_at` 的 run；root layout 改 async 注入 `SiteFooter`，「資料更新於」由占位「—」變真實台灣時間。
  - **測試**：pytest 24（純：status 判定／batch partial 語意／StatsAPI 重試+快取+記錄／FileCache；DB 整合：raw 落庫、run 開→收、失敗來源只 rollback 自己）＋ vitest `getLastSyncedAt` 4 案；全綠（Node 41、Python 24），`pnpm typecheck` 過。
  - 收尾：`.gitignore` 補 Python 段；`docs/spec/spec-03` §9 的 transactions typeDesc／小聯盟 boxscore 兩個 open item 留給票 03/04 實作時實測回填。

### 2026-07-24

- [x] **frontend-shell-and-roster slice（spec-02 切片 1+2）全 4 票完成**（`.scratch/frontend-shell-and-roster/issues/`）。Next 端已與資料層同 repo 共存，`/players` 可在瀏覽器看到白名單 5 人：
  - **票 01 Next.js bootstrap**：Next 16（Turbopack）+ React 19 + Tailwind v4 + shadcn/ui（Base UI 底），與 `lib/db`／vitest 共存，`pnpm dev`/`build` 皆過、既有 9 測全綠。**TS7/tsgo 與 `next build` 內建型別檢查器不相容** → 型別 gate 交給 `pnpm typecheck`（覆蓋 app+lib），`next.config.ts` 設 `typescript.ignoreBuildErrors` 並註明。
  - **票 02 app shell + lib/format**：root layout 頂欄導覽（`/players`／`/glossary`，手機收合）+ footer「資料更新於（占位）」、`lang=zh-Hant` 手機優先；`lib/format` 純函式（`ip_outs`→「x.y 局」、比率/ERA/百分比位數、UTC→Asia/Taipei），TDD 13 測。
  - **票 03 services + /api/players**：`getPlayerSummaries()` LEFT JOIN 組 `PlayerSummary`（Zod 合約＋執行期斷言），純函式 `buildStatusSentence` 組歸屬×健康一句（spec-01 B.2）；空狀態 fallback「狀態同步中」不炸；thin route handler。TDD 8（純）+ 5（DB）測。
  - **票 04 /players 總覽頁**：Server Component 直讀 services（不繞 API）、`PlayersView`（client 篩選/排序）+「歷史球員」折疊區、ISR `revalidate=1800`；`renderToStaticMarkup` 煙測。
  - 全測 37 綠；`vitest.config` 加 `fileParallelism:false`（共用 Postgres 序列化）與 `@` alias。ETL 未跑 → 目前所有球員 `team=null`／狀態同步中，待 spec-03 slice 供 `player_current_status`/`player_recent_form` 後自動生效。

### 2026-07-23

- [x] **票 01（bootstrap 資料層骨架）實作完成**（`.scratch/curated-schema-and-seed/issues/01`）：pnpm+TS+Drizzle+drizzle-kit+vitest 骨架、`docker-compose.yml`（Postgres 16）、`lib/db`（client+空 schema barrel）、`scripts/db/migrate.ts`、連線 smoke test 通過、`db:migrate` 對全新 DB 乾淨 no-op、README 啟動步驟。本機無 Docker→smoke test 走 homebrew pg（連線字串與 docker 共用）；pnpm 11 build 核准移至 `pnpm-workspace.yaml`
- [x] **票 02（curated schema + 首版 migration）實作完成**：spec-01 §C 全 12 表 + 11 enum 以 Drizzle 定義（`lib/db/schema/` 分 6 檔）、20 FK、複合主鍵、只存不可推導比率；`drizzle/0000_*.sql` 對全新 DB 乾淨套用；schema introspection 測試 6 案例全綠（TDD：先 red 後 green，斷言取自 spec）
- [x] **票 03（players 白名單 seed）實作完成**：`lib/db/seed/players.ts` 的 `taiwanesePlayers` 為白名單事實來源，`pnpm db:seed` 幂等 upsert（保留 lifecycle/created_at）；seed 測試 2 案例綠。**白名單起手 5 人**（2026-07-24 自 StatsAPI 抓）：鄭宗哲/Tsung-Che Cheng、Stuart Fairchild、李灝宇/Hao-Yu Lee、林昱珉/Yu-Min Lin、鄧愷威/Kai-Wei Teng；Fairchild 台裔美生印證「birthCountry 非準則」。**完整白名單與部分中文名待上線前補**。schema+seed slice（3 票）全部完成。中文名經人工校對確認（鄭宗哲、史都華·費爾柴德）
- [x] **/grill-with-docs：僅以 `requirements.md` 為輸入重新做領域分析**（刻意不參考既有 spec/adr），四輪訪談拍板 14 項決策：
  - 模型骨架：名單狀態拆**歸屬×健康**兩軸、**事件為真相來源（狀態＝投影）**；季數據＝球季×層級×球隊＋層級合計列；逐場＝球員×比賽×**角色**（野手投球/二刀流可並存）
  - 語意收斂：先發預告（投手確定/野手一律「可能出賽」，F1-2 已修正）、首頁 24h＝最新已結算**美國比賽日**、生涯新高照稱（接受 2020 起算誤差）、近況一句話＝優先序＋狀態 fallback（永不為空）
  - 邊界：白名單退場＝**精簡存檔頁**；名詞級距只做 MLB/3A/2A（低階給警語）；換進階指標**名詞頁先行**；範例回連自動挑、挑不到隱藏；回填＝季累計整季重拉＋逐場回看 7~14 天
  - 空狀態定案：本季/上季回顧卡＋名詞知識入口輪播（**§9.2 待定清空**）
  - 產出：requirements §9.1 新增 2026-07-23 區塊＋F1-0/F1-2/§9.2 修正；模型全文 `plan/domain-regrill-2026-07-23.md`
- [x] **封存舊文件**：定調 spec 與既有內容脫鉤、依 requirements 從零重建——`spec/` 整組移至 `archive/spec/`、`plan/baseball-tracker-plan-rust.*` 移至 `archive/plan/`（各檔加已封存 banner），更新 requirements／plan／adr／CLAUDE.md 交叉引用
- [x] **重建 spec（/to-spec）**：以 requirements＋plan（domain-regrill）＋adr 為輸入，全新寫出 5 份——
  - `spec-00-overview`（切分/依賴/需求追溯表/測試策略：主接縫=Postgres curated schema、次接縫=`lib/services`、純函式=投影+一句話引擎；全域常數 N=10、lookback=10 天）
  - `spec-01-domain-and-data-model`（生命週期、事件溯源狀態機、欄位級 curated schema：兩張 game line 表、季數據含球隊維度、只存不可推導比率）
  - `spec-02-ia-and-api`（路由/五頁規格/Zod API 合約/OG/SEO/ISR 1800s/台灣時間）
  - `spec-03-etl-pipeline`（早晚批職責、來源→表、sportId 對照、一句話規則引擎表、roster 對帳不自動改投影、CLI 手動工具）
  - `spec-04-glossary-content`（26 則起手清單、frontmatter schema、三組級距編制、registry build-fail 強制名詞頁先行、範例回連規則）
  - regrill §10 檢查清單全數涵蓋核對完畢；requirements/adr/plan 交叉引用改指新 spec
- [x] **記錄資料源實測 issue 並修訂文件**：pybaseball 的 FanGraphs/Baseball-Reference 接口因 Cloudflare 一律 403（僅 Savant 接口可用）；MLB API 更新較快且直接提供累積數據 → 定案「**MLB Stats API 為主、Savant 為輔**」寫入 adr §6.4；spec-03 §3 來源對照與 spec-01 C.7 連動修訂；wRC+/WAR（FanGraphs 系）暫無來源列 open item（spec-03 §9）
- [x] **小 grilling：進階數據來源應變定案**（requirements §9.1 決策樹）——①先實測 StatsAPI `stats=sabermetrics`（命中全解）；②未命中預案：打者頭號欄**遞補鏈 wRC+→xwOBA→wOBA**（退至 wOBA 清單縮 6）、**WAR 移除不補**、口袋替補換血（K-BB%/xERA/WHIP，原 xFIP/SIERA 同為 403 系）；③名詞頁不連動：wRC+/WAR 照寫當純知識、xwOBA 進清單時名詞頁先行。spec-01（xwoba 預留欄）/spec-03（實測任務規格）/spec-04（連動注記）同步修訂
- [x] **實測 `stats=sabermetrics` → 命中，預案封存**：hitting 供 `woba/wRc/wRcPlus/war`、pitching 供 `fip/fipMinus/xfip/war/eraMinus`；**僅 MLB 層級**（三位台灣球員 2025 AAA 對照：season 有 split、sabermetrics 回空）；2020~ 可回查；抽樣 Judge 2024 與 FanGraphs 同量級（MLB 官方自算版本）。→ 維持進階清單、口袋 xFIP 復活（SIERA 仍除名）；requirements §7.3/§9.1、adr §6.4、spec-01 C.7/§F、spec-03 §3/§9 收斂為定案版

### 2026-07-22

- [x] `scripts/build_docs.py` 加上**側邊欄目錄（TOC）**：自動從 `##`/`###` 標題產生 sticky 左側導覽，可快速前往章節
  - 每個 `<h2>`/`<h3>` 加錨點 id（`sec-N` / `sec-N-M`），h3 以子清單巢狀呈現、h2 保留章節編號徽章
  - IntersectionObserver 標示目前章節；`scroll-behavior: smooth` 平滑捲動
  - 響應式：960px 以下側邊欄收合為頂部 `<details>`（手機預設收合），沿用既有明暗主題變數
  - 已全量重建現有 8 份文件的 `.html`
- [x] **（Spec 02 前置）重新檢討 requirements**——從使用者角度壓力測試，補強/收斂多項並寫進 PRD：
  - 新增：出賽預告（先發明顯標示 + 台灣時間）、**近況一句話**（≤20 字自動生成，球員頁+首頁快訊）、逐場成績 game log、社群分享（OG）、收藏我的球員（低優先）、首頁空狀態
  - 收斂：賽程 → 至少「下一個系列賽（對手/地點）」；進階數據定位為「重要但非 v1 首要，可延續下一 phase」（名詞解釋維持核心）
  - 深色模式留待設計階段；§9.2 新增待定：休賽期空狀態內容
- [x] 依調整後 requirements 重審 dev plan 技術：**語言/核心套件不用改**，真正變的是資料範疇——**新增 game-log（逐場）層**
  - spec-01 補：A.6 資料粒度層次、B.8 games 擴充（start_time_utc/venue/先發投手預告）、B.9 `game_batting_stats`、B.10 `game_pitching_stats`、B.11 `player_recent_form`（近況一句話）、raw 加 gamelog、更新 §E
  - game-log 資料源走 MLB Stats API `gameLog`；時區 Node 用 Intl/date-fns-tz、Python 用 zoneinfo
  - plan §6「season-level only」標記過時、指向 spec-01
- [x] 建立 spec 總覽 `docs/spec/spec-00-overview.md`——把規格切成 spec-01~04（範疇+資料模型／IA+API／ETL／名詞庫），含各自範圍、橫向項目歸屬、依賴關係、狀態
- [x] spec-01 一致性複查+修正：B.1 enum 註解過時（已全層級）、B.4 打者進階補 `war`、B.5 投手進階改 `fip/war`、§E 收斂；統一「只存無法由計數重算的」原則
- [x] 開 **spec-02（頁面/路由 IA + 對外 API 合約）初稿**：路由/sitemap、5 頁規格（顯示/資料源/渲染）、`/api/*` endpoint + 代表性 Zod 回傳形狀、時區/OG/ISR 橫向處理；6 項 open items（URL slug、revalidation 觸發、動態 OG、逐場 N…）
- [x] 開 **spec-03（ETL / 資料同步管線）初稿**：管線總覽、來源→表對照、pybaseball/StatsAPI 各模組、一天兩次排程（早/晚班）、upsert 原則、**近況一句話生成規則**、時區存 UTC、錯誤處理；6 項 open items（排程時刻、roster 推導、生涯基準…）

### 2026-07-21

- [x] 比對兩份規劃文件（`plan/棒球網站技術選型討論.md` vs `plan/baseball-tracker-plan.md`），整理相同 / 不同之處
- [x] 收斂三項分歧決策：
  - 後端走 **Next.js 全包**，但保留 `lib/services` 分層以利未來抽離（不另起 NestJS）
  - 功能範疇 **以 1、2 為主，設計上預留 3（新聞）、4（專欄）**
  - UI 採 **shadcn/ui + Tailwind**
- [x] 產出技術決策記錄 `adr/decisions.md` / `.html`（原 `final-spec` 改名，改為 ADR 定位）
- [x] 釘死 **Spec 01：台灣球員範疇 + 資料模型** `spec/spec-01-scope-and-data-model.md` / `.html`
  - 名單 = 手動白名單表（`players` 為 source of truth，birthCountry 只當種子）
  - 成績涵蓋 **MLB + 3A / 2A**；roster/異動涵蓋所有層級
  - 球季數據 **從 2020 起**（`SEASON_BACKFILL_START` 設定值，未來可 backfill）
  - 8 張 curated 表 + enums + upsert key + Drizzle 範本；正規主鍵 `mlb_player_id`
- [x] 建立 `spec/` 目錄，與 `plan/` 分開
- [x] 文件重整：全部收進 `docs/`，並拆出 `docs/adr/`（`decisions.*` 移入）；更新交叉引用路徑（以 `docs/` 為根）
- [x] 建立根目錄 `CLAUDE.md`，定義工作流程與目錄慣例（DEVLOG 更新規範、md↔html 同步、plan/adr/spec 用途）
- [x] 寫 md→html 產生器 `scripts/build_docs.py`（零依賴，保留 data-num 編號、響應式表格、arch-diagram、待辦清單）
- [x] 設定 PostToolUse hook（`scripts/sync_docs_hook.py` + `.claude/settings.json`）：存檔 `docs/**/*.md` 後自動同步 `.html`
- [x] 建立產品需求文件 `docs/requirements.md`（PRD，從產品／服務面描述，比 decisions 更具體）；含 7 項待你定調的產品決策
- [x] 調整層級範疇：成績從「MLB + 3A/2A」擴大為**能抓到資料的所有層級**（含 1A、新人聯盟，best-effort）；理由：多數台灣球員在低階層級。同步更新 spec-01、requirements
- [x] 收斂 3 項 PRD 產品決策（客群=關注型優先兼顧、圖像=只放球隊 logo、數據深度=分情境分層）；數據深度定案：今日快訊單場精簡、球員頁標準+6 打者/6 投手進階（可調整清單），WHIP 歸標準層。寫進 requirements §7、§9
- [x] 首頁形態定案：**動態導向**（最近 24h 賽果+動態為主、即將發生為次；名冊改放全域導覽入口）。順帶定了 IA 骨架。寫進 requirements §5 F1-0、§9.1
- [x] F2 名詞內容定案：數據名詞優先、逐步累積、AI 輔助+校訂；單頁**解讀優先**三層結構（判讀/級距為主 → 定義算法小字 → 權威原始連結）；與球員數據雙向連結。寫進 requirements §5 F2、§9.1
- [x] 收尾雙語（中文為主+英文名輔助）、通知訂閱（列 future）；**PRD §9 待定清空、requirements 定稿**

---

## ▶️ 進行中 / 下一步

- [ ] **`sign-minor-league-projection`（1 票，`.scratch/sign-minor-league-projection/issues/`）——`sign` 沒有區分小聯盟約，把球員投影上大聯盟名單**。2026-08-13 由 `sync_run #430`／`#432` 的對帳浮現：費爾柴德投影為「水手・mlb(136)」，上游名單快照是「Tacoma・aaa(529)」；站上顯示與實際名單不符。
  - **兩個獨立成因，各自都足以造成這次的錯誤**：**A** `_ROSTER_TYPES` 含 `sign` ⇒ 取 `to_team` 的隊/層級，而小聯盟約的 `to_team` 是**母球團（mlb）**——**實測六筆 `sign` 事件 100% 都是 minor league contract、100% 都投影成 mlb，這條規則對我們的資料從來沒有正確過**，只是多數情況被後續事件蓋掉；**B** 排序鍵 `(effective_date, announced_at, id)` 在同日退化成 `id`——**實測 38 組同日多事件的 `announced_at` 100% 相同**，等於每個多事件日的結果都由 ingest 順序決定。
  - **建議做法 A**：小聯盟約的 `sign` 對隊伍與層級 **no-op**，落點交給同時期的 `assign` 決定。與既有兩個先例一致（`assign` 的「無法解析→不變、不清隊」、裸 `activate` 的「**絕不以文字猜測隊伍**」），且**順帶讓結果與同日排序無關**。
  - **成因 B 不建議修排序**——上游沒給同日語意順序，任何猜測都是硬編；正解是讓規則盡量與順序無關，並把這個限制寫進 spec。
  - **這是同一個模式第三次出現**（2026-07-27 `assign`、2026-08-10 裸 `activate`）：上游用 description 散文表達語意、我們的 enum 對照沒接住。

- [x] **UI 拉皮：以 `Phobos-UI` 雜誌風設計改寫前端（原 7 票 → **6 票**，`.scratch/ui-reskin-v2/issues/`）**——研究見 `plan/ui-reskin-2026-08-12.md`，六張切片均已完成，詳見 2026-08-13 已完成區。
- [x] 票 02：球員個人頁檔案與動態（含隊徽、媒體 mock、出賽預告樣式）——已完成，詳見 2026-08-13 已完成區。
- [x] 票 03：球員個人頁數據區（四格重點、可展開完整表、進階數據樣式）——已完成，詳見 2026-08-13 已完成區。
- [x] 票 04：首頁改版——已完成，詳見 2026-08-13 已完成區。
- [x] 票 05：名詞索引與名詞頁——已完成，詳見 2026-08-13 已完成區。
- [x] 票 06：球員頁季內走勢圖（依層級累積 AVG／ERA）——已完成，詳見 2026-08-13 已完成區。
  - **相依順序**：**01 球員名冊改版（含設計地基）★**（blocks 全部）→ 02 個人頁：檔案與動態（含媒體集錦＋隊徽）、04 首頁、05 名詞 **三票可並行** → 03 個人頁：數據區（blocked by 02，同頁序列化）→ 06 季內走勢圖（blocked by 03）。★＝frontier。
  - **票 07「球隊隊徽」已併入票 02（2026-08-13，batu）**，`07-team-logos.md` 標 `superseded-by-02`、保留供查閱。理由：隊徽同時出現在名冊卡與球員頁 hero，兩處都落在 `PlayerCard` 與 hero，拆成獨立一票等於讓兩個 agent 前後動同一批檔案。隊徽走 `parentOrgTeamId` 推母隊（與 2026-08-07 中文隊名決策同構），是票 02 唯一准許碰 `lib/services/*` 的地方。**落點於 2026-08-13 事後修正**：不放在會 import DB client 的 `team-map.ts`（那會讓 client bundle 拉進 `pg`），改為純模組 `lib/services/team-logo.ts` ＋ server 端解析成 `team.logoSrc`。
  - **票 01 遺留一項併入票 02 修掉（2026-08-13，batu 指定）**：封存卡片 hover 時仍會亮起橘色邊框（來自共用的 `MAGAZINE_CARD_HOVER`），與它已去彩度的靜態外觀矛盾。要保留可點擊回饋但不用暖橘，且比照票 01 的做法由 `PlayerCard` 依自己的 `archived` prop 決定、**不從外面用 descendant selector 覆寫**。
  - **分支策略（2026-08-13，batu 定）：整批 7 票做完才 merge 進 main，用 `feat/ui-reskin-v2` 當切片整合分支。** 後續票**從該分支開子分支、做完併回它**，最後一次 `--no-ff` 進 main——**不要以 main 為基底**。理由：① 符合 repo 既有慣例，多票切片從來是一個分支扛完整批（`Merge spec-03 ETL pipeline` 7 票、`Merge feat/player-detail-page` 4 票、`Merge feat/glossary-and-advanced-metrics` 4 票），單票切片才單獨合；② 中間狀態是**刻意**的不一致（票 01 完成後其他頁面是「新報頭＋舊內文」，由 02／04／05 收斂），不該落在 main。
    - **要接受的代價**：這 7 票的完成紀錄會積在分支上，**期間 main 的 DEVLOG 是落後的**，看真實進度要看分支。`spec-03` 那 7 票也是同樣情況，屬既有取捨。
  - **⚠️ 舊的 8 票（`.scratch/ui-reskin/issues/`）已作廢**，標記見 `.scratch/ui-reskin/SUPERSEDED.md`。舊批是未經 `/to-tickets` 手寫的，兩處實質偏差：跳過「Quiz the user」、且 `01 設計基礎` 是**水平**切片（明寫「不改任何頁面內容」、無法獨立 demo）。v2 以 skill 重開並經 batu 確認：**地基折進第一張頁面票**（已確認地基變更是純加法、不破壞既有頁面，故不適用 wide-refactor 的 expand–contract 例外）、每票只帶自己要的樣板、媒體集錦併入球員頁票。**兩批的技術決策一致**，差別在切分與流程。
  - **開票時查證出的一項修正（已回寫 plan §5.5）**：原建議 sparkline 打者畫 season-to-date OPS，**不成立**——`game_batting_lines`（`lib/db/schema/games.ts:28-52`）**沒有 `hbp` 也沒有 `sf`**（欄位只有 `pa, ab, h, doubles, triples, hr, rbi, r, bb, so, sb`），OBP 算不出來、OPS 也就算不出來。**改為投手 ERA（`er × 27 ÷ ipOuts`）、打者 AVG（`h ÷ ab`）**，兩者皆可精算。把 HBP/SF 當 0 近似 OBP **不做**——會系統性低估，等於在圖上放沒有出處的數字，與拒絕設計那個編造的 0-100「狀態分數」是同一條理由。日後要 OPS 須補 ETL 把 `hbp`／`sf` 寫進 `game_batting_lines`（schema＋ETL 變更），另案。
  - **票 07 另記兩個坑**：sparkline **自我正規化**（`range = max - min || 1`）⇒ 只表達形狀不表達幅度，故圖上**必須**標指標名與終點值；且 `sparkline.tsx:20` 的 `step = width / (data.length - 1)` 在單點資料會 `Infinity`。
  - **技術面無阻礙**：兩邊同為 Next 16 / React 19 / Tailwind v4 / shadcn `base-nova` / `@base-ui/react` / lucide，且設計專案通篇手刻 Tailwind、`@/components/ui/*` import 數為 **0** ⇒ **不需新增任何 npm 依賴**。要動的只有三處：字體（`Noto_Serif_TC`／`Noto_Sans_TC`／`Geist_Mono`，走 `next/font/google`）、`globals.css` 的 8 個新語意 token（`--mlb/--aaa/--aa`、`--up/--down`）、以及設計沒畫到的區塊。
  - **設計覆蓋不到我們現有的**：出賽預告（PRD §9.1 已定）、首頁 `emptyState`、archived 球員、名冊篩選/排序、進階數據展開區、20 欄完整數據表（設計每層級只放 4 格）、資料新鮮度 footer、行動版漢堡選單。§3 已逐項給出「用設計的哪個樣板實作」對照。
  - **設計層級只有三階、我們有六階**（`players-view.tsx:11` 的 `a_plus/a/rookie` 無色）；設計亦**無深色模式**（`color-scheme: light`、無 `.dark` 區塊）。
  - **待決四題**：① ~~球員照片~~ **已收斂（2026-08-12，batu：一律不放人物圖像，改純字排＋隊徽）**——先更正初稿：設計用的**不是真人肖像**（`public/players/` 只有 `pitcher-portrait.png`／`batter-portrait.png` 兩檔、六名球員按 type 共用、alt 寫「示意插畫」），**未違反 `requirements.md:233`**，原本寫成「正面衝突」是講重了。真正的問題是密度——5 名 tracked 球員照設計原樣會是五張卡、四張投手圖一模一樣，80×80 的框比留白更糟。三個缺口改法：hero 換隊徽（姓氏浮水印本就在）、名冊卡拿掉圖框走純字排（保留編號浮水印）、首頁封面跨頁改**引言跨頁**（左半大字近況一句話＋層級 badge、右半四格數據）。連帶解掉 `headshot` 與 `summary` 兩項資料缺口。**隊徽本身另計**：30 支大聯盟隊徽下載進 `public/logos/`（不 hotlink）、小聯盟一律用母隊隊徽（與 2026-08-07 中文隊名決策同構、走 `parentOrgTeamId`），**時機未定但三個版面沒有隊徽也成立、不阻斷主線**；② ~~深色模式~~ **已收斂（2026-08-12，batu：不做）**——且這不是移除功能而是刪未曾生效的碼：全 repo **沒有任何地方掛 `.dark` class**（無 theme toggle、無 `next-themes`），而 `globals.css:5` 的 `@custom-variant dark (&:is(.dark *))` 是 class-based、不吃 `prefers-color-scheme` ⇒ `globals.css:85-117` 那 33 行深色盤**從未被觸發過**。連帶清理兩處不可達的 `dark:`（`ui/button.tsx` shadcn 原樣、`upcoming.tsx:68` 的 `dark:text-emerald-400`，後者改吃 `--up`／`--down` 後自然消失）；③ ~~名詞頁 modal vs 獨立頁~~ **已收斂（2026-08-12 討論，見 plan §5.3）：先 A（保留 `/glossary/[slug]` 全頁、只借 modal 的五段版面骨架，索引頁補搜尋＋卡片牆），B（intercepting routes `@modal/(.)glossary/[slug]`，兩全）留作後續 polish 且開票前需一次 spike**——modal-only 會讓 24 個可索引 URL 收斂成 1 個、sitemap 掉 24 條、per-term OG 全失，且 `season-stats.tsx:150` 的雙向連結與 `getRegistry()` 的 build-fail 護欄都掛在名詞頁上；`requirements.md` §8 該句是驗收條件；④ 資料缺口四項——`headshot`／`summary` 由 ① 解掉（不做）；**媒體與新聞集錦已決（2026-08-12，batu：先用 mock data）**，紀律三條見 plan §5.4（檔名自帶 `MOCK`、不進 `lib/services/index.ts` barrel、列技術債且不納入任何對帳驗收數字）。
  - **sparkline 走勢已決（2026-08-12，batu：選 B——季內累積走勢）**（plan §5.5、票 07）。不畫設計那個編造的 0-100「狀態分數」；**也不比照媒體用 mock**——媒體是「等資料源」，sparkline 是「等定義」，mock 一個編造分數等於把待決問題畫進 UI。打者指標的修正見上方「開票時查證出的一項修正」。
  - 「我想知道」問題牆為**全新頁**（需新內容模型 `FanQuestion`），可與拉皮脫鉤另議。

- [x] ~~**UI 拉皮票 01：球員名冊改版＋設計地基**（`.scratch/ui-reskin-v2/issues/01-roster-with-design-foundation.md`）~~（2026-08-13 完成，見已完成區；切片整合分支 `feat/ui-reskin-v2`）——`/players` 六階動態分區的雜誌風純字排名冊＋全站設計地基；含事後 review 修掉的頁尾 `mt-16` 失效、archived 降對比空轉、失效的排序下拉三項。

- [x] ~~**`team-names-zh`（1 票，`.scratch/team-names-zh/issues/`）**~~（2026-08-07 完成，見已完成區）——大聯盟 30 支手寫中文名、小聯盟由母隊推導。

- [x] ~~**`sync-runs-test-isolation/02`（`.scratch/sync-runs-test-isolation/issues/`）——Python ETL 測試仍寫在開發 DB 上**~~（2026-08-06 完成，見已完成區）——`uv run pytest` 改連 `phobos_test`，找不到就 skip、不退回開發庫。

- [x] ~~**`raw-payloads-retention`（1 票，`.scratch/raw-payloads-retention/issues/`）**~~（2026-08-06 完成，見已完成區）——分級 TTL 每批收尾清一次；`raw_payloads` 6200 kB → 1376 kB、DB 16 MB → 11 MB。

- [x] ~~**`batch-warnings`（1 票，`.scratch/batch-warnings/issues/`）**~~（2026-08-06 完成，見已完成區）——六個 warning 產生者全數接上 `sync_runs.detail.sources_warnings`，`derive_status` 未動。
- [x] ~~**`games-role-split` slice（2 票，`.scratch/games-role-split/issues/`）**~~（2026-08-03 完成，見已完成區）——`games` 2877→275 筆，逐場表自帶日期／對手／主客場。
- [x] ~~**`xwoba-savant`（1 票，`.scratch/xwoba-savant/issues/`）**~~（2026-08-03 完成，見已完成區）——含同日四項後續修正。
- [x] ~~**`sync-runs-test-isolation`（2 票，`.scratch/sync-runs-test-isolation/issues/`）**~~（01 於 2026-08-03、02 於 2026-08-06 完成，見已完成區）。
- [x] ~~**`doc-drift-fixes`（1 票，`.scratch/doc-drift-fixes/issues/`）**~~（2026-08-03 完成，見已完成區）。
- [x] ~~執行 ETL `morning` 同步批次~~（2026-07-30 完成，見已完成區）。
- [x] ~~執行 ETL `manual` 同步批次~~（2026-07-29 完成，見已完成區）。

- [x] ~~**frontend-shell-and-roster slice**（spec-02 切片 1+2，4 票）~~（2026-07-24 完成，見已完成區）。名詞庫（spec-02 §2.4-5）延到 spec-04 slice。
- [x] ~~**ETL slice（spec-03）全 7 票完成**~~（2026-07-27，分支 `feat/spec-03-etl-skeleton`）——01 骨架+StatsAPI+raw+sync_runs（footer 轉真值）→ 02 參考資料 teams/bio → {03 狀態投影★、04 逐場、06 季數據 並行} → 05 近況★ → 07 兩批編排+CLI。★＝點亮 `/players`。語言 Python（uv）、psycopg、把 Drizzle schema 當合約不自行 migrate。三批（morning/evening/manual）真連線跑通、`/players` 狀態＋近況上真值。詳見已完成區各票。
  - [x] ~~**票 01 ETL 骨架**~~（2026-07-27 完成，見已完成區；分支 `feat/spec-03-etl-skeleton`）。
  - [x] ~~**票 02 參考資料 teams/bio**~~（2026-07-27 完成，見已完成區）。
  - [x] ~~**票 03/04/06 並行 vertical + 整合**~~（2026-07-27 完成，見已完成區；含兩個跨票 FK 整合修正）。
  - [x] ~~**票 05 近況一句話 `player_recent_form`★**~~（2026-07-27 完成，見已完成區）。
  - [x] ~~**票 07 兩批編排 + CLI 工具**~~（2026-07-27 完成，見已完成區）。**spec-03 ETL slice 全 7 票完成** 🎉

- [x] **etl-gamelog-refactor slice（2026-07-27 完成、已 merge 進 main，2 票）**——ETL slice 驗收時抓到的來源策略修正：
  - **診斷**：`/players` 近況全 fallback，根因是 `game_*_lines` 幾乎空（2 筆）。查 `raw_payloads`（存了 120 份 boxscore）發現逐場走「掃全賽程 boxscore」——120 場橫跨全層級、5 名球員只真出現 ~2 場（掛名先發預告會誤判），整季會爆量。**狀態投影另查為正確**（transactions 已 2020+ 全量，Cheng 6/26 recall 到 BOS、Lee 6/13 到 DET 皆真事件）。近況引擎經驗證**已讀全歷史**、不需改。
  - **決策（球員中心）**：逐場改走**人員 gameLog**（只抓關注球員自己的比賽）；整場 boxscore 不落庫、raw 停存 boxscore；**schedule 前瞻（先發預告/今日/即將）保留**；`games` 只留 gameLog（打過的）＋schedule（即將）兩來源；game-中心查詢刻意取捨。已更新 spec-03 §3。
  - 票 01：逐場改 gameLog、退役 boxscore 全掃。票 02：初始 backfill 2020~今（補 `game_*_lines`，讓 career_high 誠實）＋收尾 reproject/重算近況。

- [x] ~~**player-detail-page slice（順位 1：球員個人頁第一階段，4 票）**~~（2026-07-28 完成、merge 回 main，見已完成區）。**進階數據（打/投各7）+名詞連結留順位 2**（受 spec-04 §D「名詞頁先行、缺頁 build fail」約束）。
- [x] ~~**順位 2：名詞庫 12 進階名詞 + 個人頁進階區（4 票，`.scratch/glossary-and-advanced-metrics/issues/`）**~~（2026-07-28 完成，見已完成區；實作為 10 則 MDX——打投共用 4 則各含雙段級距即覆蓋打/投各 7）——**01** 名詞庫管線 + registry + 缺頁 build-fail + `/glossary`、`/glossary/[slug]` 三層模板（wRC+ 打穿，frontier）→ **02** 其餘 11 則進階名詞頁（MLB 慣例值、3A/2A 佔位待校訂）→ **03** 個人頁進階區（讀出已存進階欄 + 衍生進階、可展開、缺值不顯示、名詞雙向連結；blocked by 02）；**04** 名詞頁範例球員回連（blocked by 01，可與 02/03 並行）。frontier＝票 01。**首頁動態導向 → SEO 屬後續 phase、本批不含。**
- [x] ~~**首頁動態導向 slice（4 票，`.scratch/homepage-digest/issues/`）**~~（2026-07-28 完成，見已完成區）——`/` 四區與單一 `/api/home` 合約已上線。
- [x] ~~**SEO slice（2 票，`.scratch/seo/issues/`）**~~（2026-07-28 完成，見已完成區）——sitemap／robots、metadataBase 與 Open Graph／Twitter 分享卡已上線。
- [x] ~~**名詞庫 standard/roster slice（2 票，`.scratch/glossary-standard-roster/issues/`）**~~（2026-07-28 完成，見已完成區）。
- [x] ~~**首頁 polish 票 `homepage-digest/05`**~~（2026-07-28 完成、merge 回 main，見已完成區）——digest 錨定改 wall-clock + upcoming 效率。
- [x] ~~**`il-health-projection`（1 票，`.scratch/il-health-projection/issues/`）——傷兵狀態沒有可靠的出口**~~（2026-08-10 完成，見「已完成」區）。

- [ ] **剩餘可做（非上線阻斷，已決策未動工）**：① spec-04 §G — 3A/2A 各指標**級距首版數值校訂**（目前 MLB 慣例值佔位、正文標「待校訂」）；② spec-03 §2/§9 — cron 時刻上線後依實際結算延遲**微調**（目前為建議值）。其餘 open items 見下方「待決問題」與「未來 Phase」。

> **v1 里程碑（2026-07-28）**：spec-02 頁面（首頁四區＋polish／名冊／個人頁五區＋進階／名詞索引＋名詞頁）、spec-04 名詞庫 26 則、SEO（sitemap/robots/OG）全數上線並 merge 進 main。剩餘皆為內容校訂債、上線後微調或未來 phase。

> spec 已於 2026-07-23 重建完成（入口 `spec/spec-00-overview.md`）；舊 spec 封存於 `archive/spec/`。

- [x] ~~重建 spec~~（2026-07-23 完成，見已完成區）
- [x] ~~**schema + seed slice**（3 票）~~（2026-07-24 完成，見已完成區）
- [x] ~~Next.js 端把 `lib/services` → Route Handler → 頁面串起來~~（2026-07-24 完成；用**真實 seed 資料**而非假資料——白名單已入 DB，故直接串真資料）
- [x] ~~導入 shadcn/ui + Tailwind，建立基礎「笨元件」~~（2026-07-24 完成，票 01/04）
- [x] ~~spec-04 §A 的 12 則進階名詞開寫（球員頁上線前置）~~（2026-07-28 完成，10 則 MDX；standard/roster 兩批留後續 phase）

---

## ❓ 待決問題（原自舊 Spec 01；2026-07-23 spec 重建後盤點）

- [x] ~~**（2026-08-13 `sync_run #430` 對帳浮現）費爾柴德的投影說「水手・大聯盟」，上游名單說「Tacoma・3A」——`sign` 是不是該區分小聯盟約？**~~ → **已決策（2026-08-13，batu）：治本，開票 `.scratch/sign-minor-league-projection/issues/01-sign-minor-league-contract.md`**（見「進行中／下一步」）。**排除了「等上游補事件」這個選項**——跑完完整的 `morning`＋`evening`（含 transactions 來源）之後 `transaction_events` 仍是 242 筆未變、該球員最新事件仍停在 08-08 ⇒ 上游沒有事件要給我們，確定是我們的規則沒接住。開票時另量出**兩個成因的實際規模**（見票面）：六筆 `sign` 事件 **100% 都是小聯盟約、100% 都投影成 mlb**；38 組同日多事件 **100% 的 `announced_at` 相同**、排序全部退化成 `id`。以下保留原始脈絡：

  ```
  reconciliation mismatch: player 656413（史都華·費爾柴德）
    team projected=136（水手・mlb）   observed=529（Tacoma Rainiers・aaa）
    suggested_manual_event: depart/trade
  ```

  - **是新出現的**：`#426`／`#427`／`#428`／`#429` 的 `sources_warnings` 都沒有 reconciliation 項，只有 `#430` 有。而**事件面沒有新東西**——該球員最新事件仍停在 `2026-08-08`、`transaction_events` 全表 242 筆 ⇒ **變的是上游名單快照**，不是我們漏抓事件。
  - **事件序列**（新→舊）：
    ```
    08-08  sign        Seattle Mariners signed free agent CF Stuart Fairchild to a minor league contract
    08-08  assign      CF Stuart Fairchild assigned to Tacoma Rainiers.
    08-07  send_down   Seattle Mariners sent CF Stuart Fairchild outright to Tacoma Rainiers.
    08-07  declare_fa  CF Stuart Fairchild elected free agency.
    ```
  - **推測成因**：兩筆 `08-08` 事件**同日**，最終投影落在水手／大聯盟 ⇒ 勝出的是 `sign`。但那份合約的 description 明寫 **minor league contract**，同日還有一筆 `assign` 到 Tacoma，合理終態應是 **Tacoma／3A**（與上游快照一致）。亦即 **`sign` 一律投影到簽約球團的大聯盟層級、沒有區分小聯盟約**，加上同日事件的先後決定了誰蓋過誰。
  - **與既有兩次投影修正同類**：2026-07-27 的 `assign`（小聯盟指派被歸 `other`、投影不動隊）、2026-08-10 的裸 `activate`（傷兵狀態沒有出口）。兩次都是「上游用 description 表達語意、我們的 enum 對照沒接住」。
  - **目前影響**：站上顯示他在「大聯盟・水手」，**與實際名單不符**。
  - **沒有自動修正是刻意的**——對帳依 spec-03 §6 只發訊號、絕不自動改資料（事件為真相）。
  - **三個選項**：① `uv run etl add-event` 補一筆 manual event 把他移到 Tacoma（治標，站上立刻正確）；② 開票查 `sign` 的投影規則、決定「小聯盟約」怎麼從 description 判定並處理同日排序（治本，比照 `assign` 那次）；③ 先不動，等上游後續事件自己補上。

- [ ] **（2026-08-13 UI 拉皮浮現）分享卡的球隊 logo 要不要跟站內隊徽一樣推母隊？** `lib/seo/open-graph.ts:41` 的 `teamLogoUrl(teamId)` 用的是**球隊自己的 id**（`https://midfield.mlbstatic.com/v1/team/{id}/spots/96`），小聯盟球員的 OG 圖因此是小聯盟隊的 spot 圖；而票 02 定的**站內隊徽規則是「小聯盟一律顯示母隊」**（`lib/services/team-logo.ts`）。兩者不一致。
  - **不是 bug**：midfield 端點涵蓋小聯盟 team id，不會破圖；且 OG 走外連、不吃我們的授權清單。
  - 要決定的是**語意**：分享卡要呈現「他實際效力的那支小聯盟隊」還是「所屬母球團」。前者資訊更精確，後者與站內一致、辨識度也高（多數讀者認得母隊隊徽）。
  - 改動很小（`playerShareMetadata` 改吃已解析的 id），但會影響既有分享連結的預覽圖。

- [x] ~~進階數據要顯示到多細~~ → 已定：打/投各 7 項、只落不可推導欄（spec-01 C.7）
- [x] ~~時區怎麼統一~~ → 已定：存 UTC＋顯示 Asia/Taipei＋`game_date_us` 錨定比賽日（spec-01 C.5、spec-02 §6）
- [x] ~~白名單維護方式~~ → 已定：seed 腳本、不做後台（spec-01 A.1）
- [x] ~~小聯盟成績資料源細節：StatsAPI `sportId=11/12` 端點回傳欄位與 pybaseball 欄位對齊表~~ → **已決策（2026-08-07，batu）：小聯盟不顯示 wOBA／xwOBA／wRC+／WAR／FIP，缺值不顯示**（→ spec-03 §9 有完整實測）。原題目失效——**pybaseball 從未被使用**（全 repo 無 import，ADR §6.4 於 07-23 實測 FanGraphs／B-R 全 403），沒有第二來源要對齊。實測結論：計數欄（`hbp`／`sf`／`cs`／`bf`／`hld`）在 3A/2A 以下**全部有值**，可推導指標（AVG／OBP／SLG／OPS／ISO／K%／BB%／BABIP／WHIP／ERA／HR9）全層級成立；`lob_pct` 也全層級有值。缺的只有那四個 MLB-only 的（`stats=sabermetrics` 對 sportId≠1 回空、xwOBA 只有 Savant MLB）。不自算：MiLB 無公開權威的線性權重／league constants，FIP 又需 HBP 而投手表無此欄。**連帶**：`woba`／`wrc-plus`／`fip`／`war` 四則名詞頁的 `aaa`／`aa` 級距永遠對不到人，spec-04 §G 校訂時一併處理。
- [x] ~~實測 MLB Stats API 的 `transactions` / `roster` 端點回傳格式，確認 enum 對照是否齊全（→ spec-01 §F、spec-03 §9）。~~ → **已於 2026-08-10 收斂**：32 份 transactions payload 的 238 筆不重複異動只有 12 種 `(typeCode, typeDesc)`，完整表已回填 spec-03 §9；查證同時發現並修正裸 activated／health 無出口問題（見 `il-health-projection/01`）。
- [x] ~~waiver claim 歸 `trade` 還是 `other`~~ → **已決策（2026-08-07，batu）：兩者皆不採，新增 enum `waiver_claim`**（migration `0004`，比照 `declare_fa`／`assign`）。`other` 在投影是 no-op，而 `dfa` 保留原隊參考——鄭宗哲 2026-01~02 連四次 claim＋DFA，網站曾兩個月顯示「Pittsburgh Pirates・指定讓渡」，實際是坦帕灣 DFA 他（3/19 的 `send_down` 蓋掉才看似正常）。`trade` 投影對但標籤會變成「交易」，而他一次都沒被交易過。詳見 spec-03 §9。
- [x] ~~`name_zh` 補齊方式（spec-01 §F）：目前手動 seed，無中文名球員顯示英文；系統性補齊策略待定。~~ → **已釐清並決策（2026-08-07，batu）**。**球員這邊沒有缺口**：5/5 都有 `name_zh`，白名單人工維護（新增球員時本來就得手寫）、ETL bio source 刻意不碰（`players_bio.py:7`）；沒有中文名的台裔球員照 Fairchild 前例音譯即可。**真正 0 覆蓋的是球隊**：`teams` 231 筆 `name_zh` 全 NULL，站上球隊名一律英文。決策：**大聯盟 30 支手寫中文名、小聯盟不逐支翻譯，改用「母隊中文名 + 層級（原名）」推導**（已驗證 201 支小聯盟隊全都有 `parent_org_team_id`，且 `teams.py` 的 upsert 不覆蓋 `name_zh`）。→ 開票 `team-names-zh/01`。
- [x] ~~實測 StatsAPI `stats=sabermetrics` 端點~~ → 已實測（2026-07-23）：**命中、維持原清單、預案封存**（結果見 spec-03 §9）
- [x] ~~**（2026-07-27 ETL 整合浮現）`affiliation` enum 的 `free_agent` 不可達**~~ → **已定：補對照**（2026-07-27，batu）。新增 `transaction_type` enum 值 `declare_fa`（migration `0001`），StatsAPI「Declared Free Agency」/typeCode `DFA` → `declare_fa` → 投影 `free_agent`（清隊、重設 active）。spec-01 §B.3/§C.3 已更新。
- [x] ~~**（2026-07-27 ETL 整合浮現）`season_pitching_stats.lob_pct` 的層級範圍**~~ → **已定：所有層級皆算**（2026-07-27，batu）。移除 MLB-only（sabermetrics）閘門；LOB% 由計數欄自算、每層級皆有輸入，且投手表無 `hbp` 欄故 services 無法事後重算 → 必須 ETL 落庫。
- [x] ~~**（2026-07-27 evening 對帳浮現）下放小聯盟球員顯示錯隊**~~ → **已修正**（2026-07-27，票 `.scratch/projection-assign-fix/issues/01` 完成，見 ✅ 已完成）。費爾柴德(656413) SEA/MLB→Tacoma(529/3A)、林昱珉(801179) AZ/MLB→Reno(2310/3A)。根因：小聯盟「assigned to [隊]」異動（typeCode ASG）被歸 `other`、投影不動隊。正解：新增 `assign` 型別（enum migration `0002`）+ B.3 規則（assign→rostered 於 to_team、無法解析則 no-op 不清隊；以 description 片語與 invited-non-roster/rehab/國家隊區分）。spec-01 B.3/C.3 已更新。

---

## 🔮 未來 Phase（先記著，這版不做）

- [ ] backfill 2020 年以前的歷史球季數據
- [ ] Statcast 逐球（pitch-level）數據
- [ ] 功能 3：爬取官網 / 社群新聞（DB 已預留 `news` domain 邊界）
- [ ] 功能 4：專欄 / 寫手（DB 已預留 `articles` + `authors` domain 邊界）
- [ ] 視需要把 `lib/services` 抽成獨立後端服務
- [ ] ISR 升級為 ETL 完成後 on-demand revalidate（spec-02 §8 v2；需 ETL 呼叫 revalidate endpoint）
- [ ] Open Graph 動態合成圖（spec-02 §8 v2；v1 用球隊 logo／站台預設圖）
- [ ] **加一道 lint／format 關卡**（2026-08-13 UI 拉皮浮現）。實測：`package.json` **沒有 `lint` script**、無 eslint／prettier／biome 設定檔，devDependencies 裡也沒有任何 lint 工具 ⇒ **純風格類問題目前沒有任何自動關卡**，只靠 `tsc --noEmit` 與 `next build` 順帶擋掉部分未使用 import。
  - **這不是理論問題**：UI 拉皮前三張票由人工 review 抓到的缺陷裡，有一部分正是這類——重複定義已存在的型別、PascalCase 命名了回傳資料的函式、測試檔寫出完整 Tailwind class 字串（反而讓死掉的 utility 被編回 CSS）。這些都不會讓 typecheck 或測試變紅。
  - 效益是**讓 review 專注在邏輯與正確性，而不是花在風格**。
  - ⚠️ 導入時注意：這個 repo 的 import 帶 `.ts` 副檔名、用 Tailwind v4、TypeScript 7（tsgo），選 linter 與規則集時要確認相容；且**不要**讓它變成大規模格式化 commit 把 git blame 洗掉。

- [ ] **`loadTeamMap()` 的請求級快取**（2026-08-13 UI 拉皮浮現）。`home.ts`／`player-recent.ts`／`player-upcoming.ts`／`player-detail.ts` 各自 `await loadTeamMap(db)`，每次都全表掃 `teams`（231 筆）。`React.cache()` 是正解，可讓同一個 request 內共用一次。
  - **這是原本就有的行為，不是本次造成的**——票 02 曾用 module 層級的可變全域 `latestTeamMap` 當 logo 來源，那從來不是快取（而且藏著 bug，已於 2026-08-13 移除，見已完成區）。
  - 231 筆的規模下不痛，故列未來 Phase 而非待決問題。真要動時**注意別再走回跨請求共用可變狀態**。

---

## 🗂️ 雜項 / 待整理

- [ ] **球員頁季內走勢圖的兩個判斷待議**（2026-08-13 票 06 review 浮現；`components/player-detail/season-trend.tsx`、`lib/services/player-trend.ts`）。**第 1 點已於 2026-08-13 解決，第 2 點仍待議**：
  1. ~~**線色是拿「第一場的累積值」跟最新值比**（`trendTone` 用 `points[0]` vs `points.at(-1)`）。但第一個累積點只根據一場（約 4 個 AB／少數出局數），數值極端——**某人首戰 4 打數無安打，之後整季的顏色幾乎注定是綠的**。顏色的資訊量比看起來低。若要更穩，可改跟某個基準比（前 N 場平均、球季中位數，或直接不上色只留單色）。~~ → **已解決**（2026-08-13，見 ✅ 已完成「票 01／06 事後修正」）。**採「直接不上色只留單色」**：實際畫面證實了這個疑慮——鄭宗哲首戰累積值偏高，3A `.246` 與大聯盟 `.256` **兩張圖整季都是紅的**，一個大聯盟打 .256 的球員全紅會被誤讀。線色統一為 `--accent`，`trendTone` 與 `Sparkline` 的 `higherIsBetter` prop 一併移除；「AVG 越高越好、ERA 越低越好」改由走勢卡下方的文字小字承擔（用語沿用名詞頁尺標的「數字越高／越低越好」），資訊沒有消失、只是換成不會誤導的載體。
  2. **`getPlayerTrend` 的 `season` 預設取 `new Date().getUTCFullYear()`**，把「本季」綁在牆上時鐘而不是資料。跨年後 ETL 尚未灌新球季時，**走勢圖會整區消失，但下方的球季數據仍顯示上一季**——兩處對「本季」的定義不同源。`season` 參數可注入，要修時從呼叫端傳入資料上的最新球季即可。

- [ ] **名詞頁級距尺標的兩個外觀待議**（2026-08-13 票 05 review 浮現；`components/glossary/bands-table.tsx`）。兩者都不是錯誤，是設計取捨，batu 已知情、暫時維持現狀：
  1. **三階 tone 套在多段級距上，中間會整片同色。** 目前照設計稿用 `{low: bg-muted, mid: bg-accent/40, high: bg-accent}`，tone 由位置＋方向推導（最差端 low、最好端 high、中間全部 mid）。以 `k-pct` 的五段為例，`普通`／`偏高`／`易被三振` 在色帶上看不出差別，資訊只剩「頭、尾、中間一片」三層。**可考慮改單調漸層**（如 `accent/20 → /40 → /60 → /80 → accent`）——設計稿自己的 `DemoScaleBar` 就有兩段同為 `high`，代表 tone 本來就不是「一段一階」，改漸層並不違背設計語彙，資料視覺化上也更好讀。
  2. **`bg-muted`（L≈0.94）在名詞頁背景（L≈0.98）上對比很低**，最差那段看起來像沒畫完。**脈絡不同所致**：設計稿的尺標在 modal 的 `bg-card`（純白）上，我們是直接放在頁面底上。補一圈 `border border-border` 即可界定。

- [x] `plan/baseball-tracker-plan-rust.md` / `.html` 已被 Node.js 方案取代 → 已封存至 `archive/plan/`（2026-07-23）
