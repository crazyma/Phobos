# 01 — 逐場改走 player gameLog（退役 boxscore 全掃）

**What to build:** 把逐場成績的來源從「掃窗口內全賽程 boxscore、再翻找 tracked 球員」改成「每位 tracked 球員的 **people gameLog**」，只抓關注球員自己的比賽。整場 boxscore 不再落庫、raw 層停存 boxscore。schedule 前瞻來源（先發預告/今日/即將）**保留不動**。

**背景（為何重寫）:** 現行 boxscore 全掃：一次抓進 120 場（橫跨所有層級）、5 名球員只真正出現在 ~2 場（~1.6% 命中），還會把「掛名先發預告」誤判成出賽。整季 × 6 層級會放大成上萬次無謂呼叫。gameLog 直接回傳該球員自己的逐場，命中近 100%、成本 5 人 × 季。詳見 spec-03 §3「逐場來源策略（2026-07-27 定案）」。

**Blocked by:** None（在既有 ETL slice 分支 `feat/spec-03-etl-skeleton` 上修）。

**Status:** ready-for-agent

- [ ] 逐場 source 改用 `people/{id}/stats?stats=gameLog`（按季、hitting/pitching 群組）→ `game_batting_lines`／`game_pitching_lines`；grain `(player_id, game_pk)` 不變、二刀流兩表並存、只收 `lifecycle='tracked'`
- [ ] **必須逐一掃球員實際打過的所有層級 sportId（1/11/12/13/14/16），不可只照 current status 的層級**——gameLog 帶 sportId 只回該層級；省略 sportId 只回 MLB。實測：鄧愷威 status=AAA 但實際在 **MLB 投 25 場、AAA 0 場**，只查 AAA 會抓到 0、fallback 照樣不消
- [ ] `games` 表頭改由 gameLog 每筆**順手 upsert**（`game_date_us`／對戰/主客/level 等 gameLog 有的欄）以滿足外鍵與逐場 context；缺欄留 NULL
- [ ] **schedule 前瞻來源保留**（`schedule` + `hydrate=probablePitcher`，供先發預告/今日/即將出賽與「最新已結算比賽日」錨點）——僅退役「為餵 game_lines 而掃全場 boxscore」那條路徑
- [ ] raw 層：存 gameLog 原檔、**停止存 boxscore**（`raw_payloads` 不再寫 `game/{pk}/boxscore`）
- [ ] 純 transform fixture 測（gameLog 正常＋缺欄；打者/投手/二刀流各一）→ upsert 幂等；退掉/改寫原 boxscore transform 測
- [ ] 驗收：morning 跑完，5 名球員近 `GAMELOG_LOOKBACK_DAYS` 天真實出賽進 `game_*_lines`；`/players` 近況對有出賽者由 fallback 轉為數據句
- [ ] **近況引擎不需改**（`recent_form.py` 已讀全 `game_*_lines` 歷史、無日期窗，2026-07-27 驗證）
