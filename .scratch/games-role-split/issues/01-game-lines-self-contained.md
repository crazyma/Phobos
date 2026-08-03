# 01 — 逐場自給自足：比賽日／對手／主客場反正規化進 `game_*_lines`，拆掉 `games` FK

**What to build:** 讓 `game_batting_lines`／`game_pitching_lines` 不再依賴 `games` 就能顯示與排序。目前逐場表只有 `player_id / game_pk / team_id / level` 加數據欄，**沒有日期、沒有對手**，所以 `player-recent.ts:89-113` 與 `home.ts:96-158` 都必須 `innerJoin games`——而這個 join 實際只取三欄：`game_date_us`、`home_team_id`、`away_team_id`（比分／球場／狀態／系列賽一欄都沒用到）。這個 FK 也是 `games` 存著歷史比賽表頭的唯一理由（`DEVLOG:69`：gameLog 每筆「順手 upsert `games` 表頭…**以滿足外鍵**」）。

**決策（2026-07-29，batu）**：`games` 現在同時扮演「未來賽程表」與「歷史比賽維度表」，兩者生命週期完全相反（一個過期就該丟、一個要永久保留），混在同一張表是那批無人參照殘留的根因（2026-08-03 實測已達 **1133 筆**，07-29 時是 929）。拆開兩個角色。**理由是語意誠實，不是省空間**——15 人規模下 `games` 也才約 7,500 筆／1 MB。

資料來源已現成：`game_lines.py:147-154` 的 gameLog split 本來就取得 `date`／`opponent.id`／`isHome`，目前只是拿去組成 `games` 表頭。

**Blocked by:** None（frontier）。本票是 02 的 blocker——`games` 要能刪列，得先沒有 FK 指著它。

**Status:** ready-for-agent

- [ ] **Migration**（Drizzle，`lib/db/schema/games.ts`）：`game_batting_lines` 與 `game_pitching_lines` 各加三欄
  - `game_date_us date not null` — 先可空、回填後再上 NOT NULL
  - `opponent_team_id integer references teams(mlb_team_id)` — **可為 NULL**（沿用 `sanitize_team_refs` 精神：對手不在納入 sportId 內時設 NULL、保留該列）
  - `is_home boolean` — **可為 NULL**（`team_id` 本身可空，無法判定時留 NULL）
- [ ] **回填既有逐場列**（2026-08-03 實測 **1790 列**＝1519 打擊＋271 投球；07-29 時是 1782，會隨批次成長，實作時以當下筆數為準）：由 `games` join `game_pk` 取 `game_date_us`；`opponent_team_id` = 主客兩隊中不等於 `team_id` 的那支；`is_home` = `team_id = home_team_id`。`team_id IS NULL` 者 opponent／is_home 留 NULL。回填後對 `game_date_us` 上 NOT NULL
- [ ] **拆掉 `game_pk` 的 FK**（兩張表）。`game_pk` 保留為 PK 的一部分與 StatsAPI 的天然識別（含雙重賽），只是不再指向 `games`
- [ ] **ETL**（`etl/src/etl/sources/game_lines.py`）：`BattingLineRow`／`PitchingLineRow` 加上三欄並在 upsert 寫入，值直接取自 gameLog split 的 `date`／`opponent.id`／`isHome`（現成，不需額外 API 呼叫）。對手 id 不在 `teams` 內時比照既有 sanitize 設 NULL
- [ ] **改查詢，移除對 `games` 的 join**（共 **8 處**，**TS 6 處 + Python 2 處**——已於 2026-08-03 用 `grep -rn "innerJoin(games\|join games"` 重新清點確認）
  - `lib/services/player-recent.ts:97`／`:110`（打／投各一）：日期、對手、主客場改讀逐場表自己的欄位；`opponentOf()` 的呼叫改為直接吃 `opponent_team_id` / `is_home`
  - `lib/services/home.ts:99`／`:105`（`getDigestDate` 打／投各一）：`game_date_us` 改讀逐場表
  - `lib/services/home.ts:136`（digest 當日**打者** line）**與 `:158`（digest 當日投手 line）**：兩者都以 `eq(games.gameDateUs, digestDate)` 過濾，**必須一起改**。⚠️ `:158` 是初版清點時漏掉的一處——若只改 `:136`，票 01 之後程式仍能跑（join 還在、不報錯），但**等票 02 清掉 `games` 過期列，首頁 digest 的投手卡會整個消失**且無錯誤訊息。務必兩處都改、測試都要覆蓋
  - **`etl/src/etl/sources/recent_form.py:310-327`（打／投各一）**：`from game_batting_lines b join games g on g.game_pk = b.game_pk` 取 `g.game_date_us` → 改讀 `b.game_date_us`，join 整個拿掉。**這處最關鍵**——近況引擎讀**全歷史**（`career_high`／`season_high` 的依據，spec-03 §3 明載「引擎讀全 `game_*_lines` 歷史、無日期窗」），是票 02 清理策略下唯一會被打爆的讀取端
- [ ] **不動的**：`player-upcoming.ts` 全部維持現狀（它查的是還沒打的比賽，本來就該讀 `games`）
- [ ] `docs/spec/spec-01-domain-and-data-model.md` C.6 補上三個新欄與「逐場不依賴 `games`」的說明；C.5 註明 `games` 的角色將於票 02 收斂
- [ ] **順修既有文件漂移**：`docs/spec/spec-02-ia-and-api.md:30` 仍寫首頁最新賽況「該日所有相關比賽 `status=final`；判定由 services 依 `games` 計算」，但 `homepage-digest/05`（2026-07-28）已改為 wall-clock 錨定、`getDigestDate` 不再查 `games`。改寫成「該美國比賽日**整天已依美西時鐘結束**」，與實作一致
- [ ] 測試：回填正確性（含 `team_id IS NULL` 與對手不在 `teams` 兩個邊界）；ETL 寫入三欄（打者／投手／二刀流同場兩列／客場）；`player-recent` 對手與主客場顯示不變；`home` digest 錨定日不變、**且當日打者卡與投手卡都仍顯示得出來**（對應上面 `:136` 與 `:158` 兩處，投手卡是漏改時唯一會靜默消失的地方）；**近況引擎五種 pattern 續綠**（`etl/tests/test_recent_form.py:180` 的 fixture 目前 `insert into games` 取日期，需改為直接在 line 上帶日期）。`cd etl && uv run pytest -q` 全綠、Node 全綠、`pnpm typecheck`、`pnpm build` 過
- [ ] **測試 fixture 連帶調整**：`player-recent.test.ts:52`、`home.test.ts:70`、`etl/tests/test_recent_form.py:180` 都以 `insert into games` 供給日期，改由逐場表自帶。`player-upcoming.test.ts:69` 不動
- [ ] 跑一次 `python3 scripts/db/snapshot.py` 更新 `admin_private/current_table.md`

## Comments

- 明確接受的代價：日後若要在逐場顯示比分／球場／勝敗，將沒有 `games` 可 join（目前個人頁與首頁都沒顯示）。真要做時的正解是把該欄位也帶進逐場表，而不是把歷史比賽表頭養回來。
- 延賽改期時日期變成兩處，但 gameLog 每次重抓都會帶新 `date`，upsert 時一併更新即可。
