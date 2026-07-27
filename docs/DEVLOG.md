# 開發日誌 — 台灣球員大聯盟網站（Phobos）

> 記錄進度：已完成（含日期）、進行中/下一步、待決問題、未來 phase。
> 文件位置慣例（皆在 `docs/` 下）：`plan/` = 發想脈絡；`adr/` = 技術決策記錄；`spec/` = 照著能建的規格。路徑引用以 `docs/` 為根。

---

## ✅ 已完成

### 2026-07-27

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
  - **typeDesc→enum 對照（實測 2024 資料確認，回填 spec-01 §F / spec-03 §9）**：`Signed as Free Agent`/`Signed`→`sign`；`Recalled`/`Selected`/`Purchased`→`call_up`；`Optioned`/`Outrighted`→`send_down`；`Trade`/`Traded`→`trade`；`Designated for Assignment`→`dfa`；`Released`→`release`；`Retired`→`depart`；含 `injured list` 的 placed/transferred→`il_on`（並解析 `il_10/il_15/il_60/il_7`）、activated/reinstated→`il_off`。**未知一律→`other`**：`Assigned`(ASG)、`Status Change`(SC，非 IL 者)、`Claimed Off Waivers`(CLW，waiver claim 依票歸 other)、`Declared Free Agency`(DFA)、`Number Change`(NUM)、`Returned`(RTN)。
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

- [x] ~~**frontend-shell-and-roster slice**（spec-02 切片 1+2，4 票）~~（2026-07-24 完成，見已完成區）。名詞庫（spec-02 §2.4-5）延到 spec-04 slice。
- [x] ~~**ETL slice（spec-03）全 7 票完成**~~（2026-07-27，分支 `feat/spec-03-etl-skeleton`）——01 骨架+StatsAPI+raw+sync_runs（footer 轉真值）→ 02 參考資料 teams/bio → {03 狀態投影★、04 逐場、06 季數據 並行} → 05 近況★ → 07 兩批編排+CLI。★＝點亮 `/players`。語言 Python（uv）、psycopg、把 Drizzle schema 當合約不自行 migrate。三批（morning/evening/manual）真連線跑通、`/players` 狀態＋近況上真值。詳見已完成區各票。
  - [x] ~~**票 01 ETL 骨架**~~（2026-07-27 完成，見已完成區；分支 `feat/spec-03-etl-skeleton`）。
  - [x] ~~**票 02 參考資料 teams/bio**~~（2026-07-27 完成，見已完成區）。
  - [x] ~~**票 03/04/06 並行 vertical + 整合**~~（2026-07-27 完成，見已完成區；含兩個跨票 FK 整合修正）。
  - [x] ~~**票 05 近況一句話 `player_recent_form`★**~~（2026-07-27 完成，見已完成區）。
  - [x] ~~**票 07 兩批編排 + CLI 工具**~~（2026-07-27 完成，見已完成區）。**spec-03 ETL slice 全 7 票完成** 🎉

> spec 已於 2026-07-23 重建完成（入口 `spec/spec-00-overview.md`）；舊 spec 封存於 `archive/spec/`。

- [x] ~~重建 spec~~（2026-07-23 完成，見已完成區）
- [x] ~~**schema + seed slice**（3 票）~~（2026-07-24 完成，見已完成區）
- [x] ~~Next.js 端把 `lib/services` → Route Handler → 頁面串起來~~（2026-07-24 完成；用**真實 seed 資料**而非假資料——白名單已入 DB，故直接串真資料）
- [x] ~~導入 shadcn/ui + Tailwind，建立基礎「笨元件」~~（2026-07-24 完成，票 01/04）
- [ ] spec-04 §A 的 12 則進階名詞開寫（球員頁上線前置）

---

## ❓ 待決問題（原自舊 Spec 01；2026-07-23 spec 重建後盤點）

- [x] ~~進階數據要顯示到多細~~ → 已定：打/投各 7 項、只落不可推導欄（spec-01 C.7）
- [x] ~~時區怎麼統一~~ → 已定：存 UTC＋顯示 Asia/Taipei＋`game_date_us` 錨定比賽日（spec-01 C.5、spec-02 §6）
- [x] ~~白名單維護方式~~ → 已定：seed 腳本、不做後台（spec-01 A.1）
- [ ] 小聯盟成績資料源細節：StatsAPI `sportId=11/12` 端點回傳欄位與 pybaseball 欄位對齊表（→ spec-03 §9）
- [ ] 實測 MLB Stats API 的 `transactions` / `roster` 端點回傳格式，確認 enum 對照是否齊全（→ spec-01 §F、spec-03 §9）。**部分回填（2026-07-27 票 03 實作）**：typeDesc/typeCode→enum 對照已依 2024 實測資料建立（見票 03 完成區）。
- [x] ~~實測 StatsAPI `stats=sabermetrics` 端點~~ → 已實測（2026-07-23）：**命中、維持原清單、預案封存**（結果見 spec-03 §9）
- [x] ~~**（2026-07-27 ETL 整合浮現）`affiliation` enum 的 `free_agent` 不可達**~~ → **已定：補對照**（2026-07-27，batu）。新增 `transaction_type` enum 值 `declare_fa`（migration `0001`），StatsAPI「Declared Free Agency」/typeCode `DFA` → `declare_fa` → 投影 `free_agent`（清隊、重設 active）。spec-01 §B.3/§C.3 已更新。
- [x] ~~**（2026-07-27 ETL 整合浮現）`season_pitching_stats.lob_pct` 的層級範圍**~~ → **已定：所有層級皆算**（2026-07-27，batu）。移除 MLB-only（sabermetrics）閘門；LOB% 由計數欄自算、每層級皆有輸入，且投手表無 `hbp` 欄故 services 無法事後重算 → 必須 ETL 落庫。

---

## 🔮 未來 Phase（先記著，這版不做）

- [ ] backfill 2020 年以前的歷史球季數據
- [ ] Statcast 逐球（pitch-level）數據
- [ ] 功能 3：爬取官網 / 社群新聞（DB 已預留 `news` domain 邊界）
- [ ] 功能 4：專欄 / 寫手（DB 已預留 `articles` + `authors` domain 邊界）
- [ ] 視需要把 `lib/services` 抽成獨立後端服務

---

## 🗂️ 雜項 / 待整理

- [x] `plan/baseball-tracker-plan-rust.md` / `.html` 已被 Node.js 方案取代 → 已封存至 `archive/plan/`（2026-07-23）
