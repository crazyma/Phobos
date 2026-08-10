# 開發日誌 — 台灣球員大聯盟網站（Phobos）

> 記錄進度：已完成（含日期）、進行中/下一步、待決問題、未來 phase。
> 文件位置慣例（皆在 `docs/` 下）：`plan/` = 發想脈絡；`adr/` = 技術決策記錄；`spec/` = 照著能建的規格。路徑引用以 `docs/` 為根。

---

## ✅ 已完成

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
- [ ] **`il-health-projection`（1 票，`.scratch/il-health-projection/issues/`）——傷兵狀態沒有可靠的出口**（2026-08-10 開票）。盤點未完成項時，從待決問題「typeDesc 全集實測」查下去挖到的。**原題目失效**：上游 `(typeCode, typeDesc)` 實測只有 12 種、全部命中現有對照表，沒有「不認得的字串」。真正的問題是**有一個句型認得、但它同時代表三件事**——`[球隊] activated [球員].`（SC，44 筆）混了「小聯盟傷兵復出」「下放後例行登錄」「中華隊徵召」，字串上無法區分，一律落 `other`（no-op）。加上 `project_status` 裡沒有任何 roster 事件會把 `health` 從 `il` 打回 `active`，漏一次復出就錯到下一次 `il_off` 為止：實測 15 段 IL 區間有兩段異常，**費爾柴德 759 天、李灝宇 372 天**（其餘 13 段 9~77 天合理）。修法：① 只讓 `call_up` 重設 `health`（`trade`／`sign`／`send_down`／`dfa` 都可能發生在 IL 上，**不能**一起放進來）；② 新增 enum `activate`，投影對它做條件式處理（在 `il` 才清、否則 no-op，且不動 affiliation）。現況無線上錯誤（5 人皆 `active`），驗收看歷史重播。另記錄兩類**上游自己漏送**的事件（鄧愷威 2026 的 15 天 IL 只有出沒有進、費爾柴德 2021 只有進沒有出），classify 救不了、歸對帳（spec-03 §6）。

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

- [x] ~~進階數據要顯示到多細~~ → 已定：打/投各 7 項、只落不可推導欄（spec-01 C.7）
- [x] ~~時區怎麼統一~~ → 已定：存 UTC＋顯示 Asia/Taipei＋`game_date_us` 錨定比賽日（spec-01 C.5、spec-02 §6）
- [x] ~~白名單維護方式~~ → 已定：seed 腳本、不做後台（spec-01 A.1）
- [x] ~~小聯盟成績資料源細節：StatsAPI `sportId=11/12` 端點回傳欄位與 pybaseball 欄位對齊表~~ → **已決策（2026-08-07，batu）：小聯盟不顯示 wOBA／xwOBA／wRC+／WAR／FIP，缺值不顯示**（→ spec-03 §9 有完整實測）。原題目失效——**pybaseball 從未被使用**（全 repo 無 import，ADR §6.4 於 07-23 實測 FanGraphs／B-R 全 403），沒有第二來源要對齊。實測結論：計數欄（`hbp`／`sf`／`cs`／`bf`／`hld`）在 3A/2A 以下**全部有值**，可推導指標（AVG／OBP／SLG／OPS／ISO／K%／BB%／BABIP／WHIP／ERA／HR9）全層級成立；`lob_pct` 也全層級有值。缺的只有那四個 MLB-only 的（`stats=sabermetrics` 對 sportId≠1 回空、xwOBA 只有 Savant MLB）。不自算：MiLB 無公開權威的線性權重／league constants，FIP 又需 HBP 而投手表無此欄。**連帶**：`woba`／`wrc-plus`／`fip`／`war` 四則名詞頁的 `aaa`／`aa` 級距永遠對不到人，spec-04 §G 校訂時一併處理。
- [ ] 實測 MLB Stats API 的 `transactions` / `roster` 端點回傳格式，確認 enum 對照是否齊全（→ spec-01 §F、spec-03 §9）。**部分回填（2026-07-27 票 03 實作）**：typeDesc/typeCode→enum 對照已依 2024 實測資料建立（見票 03 完成區）。**waiver claim 已於 2026-08-07 收斂**。**typeDesc 全集已於 2026-08-10 測完——原題目失效**：238 筆上游異動只有 12 種 `(typeCode, typeDesc)` 組合，全部命中現有對照表，不存在「不認得的字串默默落 `other`」。查證過程反而挖出真正的缺陷（一個句型三種語意 ＋ `health` 沒有出口），已開票 `il-health-projection/01`，對照表與結案一併在該票寫進 spec-03 §9。本條待該票完成後關閉。
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

---

## 🗂️ 雜項 / 待整理

- [x] `plan/baseball-tracker-plan-rust.md` / `.html` 已被 Node.js 方案取代 → 已封存至 `archive/plan/`（2026-07-23）
