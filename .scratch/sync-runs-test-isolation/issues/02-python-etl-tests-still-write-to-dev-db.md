# 02 — Python ETL 測試仍寫在開發 DB 上（票 01 只隔離了 TS 那側）

**What to build:** 讓 `uv run pytest` 連 `phobos_test`，而不是開發用的 `phobos`。

票 01 把 **TS 那側**（`pnpm test` → `.env.test` → `phobos_test`）隔離了，`README.md:10` 於是寫下「開發用 `phobos`、測試用 `phobos_test` 兩個資料庫」。**但這句話對 Python 這側不成立**——`etl/README.md:19` 自己就寫著：

> `DATABASE_URL` 共用 repo 根的 `.env`（`postgres://phobos:phobos@localhost:5432/phobos`）

`etl/tests/conftest.py:21` 的 `db_conn` fixture 走 `get_database_url()`，而 `etl/src/etl/config.py:29-40` 的 `load_env()` 只讀 repo 根的 `.env`。所以 **21 個 `@pytest.mark.db` 測試全部在開發 DB 上 insert／commit／delete**。

**Blocked by:** None。獨立小票。

**Status:** ready-for-agent

## 這不是理論風險，已經漏出來過一次

2026-08-06 開 dev server 看網站時，`/players` 名冊上出現第 6 位球員 **`Test Two-Way`（`mlb_player_id=1041627`，`lifecycle='tracked'`）**，顯示成「狀態同步中／近兩週無出賽紀錄」。

來源是 `etl/tests/test_sources_game_lines.py:169`：

```python
cur.execute(
    "insert into players (mlb_player_id, name_en, lifecycle) values (%s, 'Test Two-Way', 'tracked')",
    (player_id,),          # 970200 + uuid % 100000 → 涵蓋 1041627
)
db_conn.commit()           # ← 真的寫進 phobos
```

測試在 `finally` 會刪掉它，正常跑完不留痕跡；那筆是 08-03 某次中斷留下的。**代價不只是名冊上多一個人**：

- 它 `lifecycle='tracked'`，於是**每一批 ETL 都會為它打 StatsAPI** —— 清理時 `raw_payloads` 裡已累積 12 筆 `people/1041627/stats`
- 它進了 `player_recent_form`（1 筆），也就是進了首頁／名冊的真實查詢路徑
- 它**出現在正式頁面上**，等於測試資料流到了使用者看得到的地方

已於 2026-08-06 手動清除（players 1 筆＋`player_recent_form` 1 筆＋`raw_payloads` 12 筆），名冊回到 5 位。**但清掉的是結果，不是原因。**

## 嚴重度：比票 01 低，形狀不同

票 01 的 `sync.test.ts` 是**無 `where` 的整表刪除**，每跑一次測試就清空 `sync_runs`。Python 這側沒有那種東西——掃過 `etl/tests/`，**沒有任何無 `where` 的 delete、沒有 truncate**，21 個 db 測試全部用隨機 fixture id 圈住自己、在 `finally` 收拾。

所以這裡的風險是**中斷時的殘留**與**測試資料混進開發資料**，不是大規模破壞。但 `Test Two-Way` 證明了殘留會一路流到頁面上，而且會持續消耗上游 API 配額。

## 可行性已實測：改動很小

2026-08-06 直接用環境變數指過去跑了一次：

```
DATABASE_URL="postgres://phobos:phobos@localhost:5432/phobos_test" uv run pytest -q
→ 149 passed in 0.49s
```

**全綠，不需要改任何測試**。原因是 Python 測試本來就不依賴開發資料：每個都自建 fixture、自己收拾。（`load_dotenv` 預設不覆蓋既有環境變數，所以上面那行今天就能當臨時解。）

一個前提要處理：**Python 這側不跑 migration**（Drizzle 擁有 schema，ETL 只把它當合約）。`phobos_test` 今天有 schema 是因為 vitest 每次 `beforeEach` 都 `migrate()`。若有人 clone 下來只跑 `pytest`，會撞到沒有表。

## Checklist

- [ ] `etl/tests/conftest.py`：`db_conn` 改讀 `.env.test` 的 `DATABASE_URL`（或等效機制），確保 `uv run pytest` 預設**永遠不會**連上開發 DB
- [ ] 找不到 `.env.test`／該 DB 不存在時，**skip 並給出可照做的指示**（比照 conftest 現有的 skip 風格），不要靜默 fallback 回 `phobos`——靜默 fallback 正是這張票要消滅的行為
- [ ] `phobos_test` 的 schema 來源要講清楚：文件寫明「先跑一次 `pnpm test` 或 `DATABASE_URL=…phobos_test pnpm db:migrate`」，別讓 pytest 隱性依賴 vitest 跑過
- [ ] `etl/README.md:19` 更新（目前明寫共用根 `.env`，改完就過時了）；`README.md:10` 那句「測試用 `phobos_test`」屆時才對兩側都成立
- [ ] 驗收：`uv run pytest` 全綠，且跑完後 `select count(*) from players` 在 `phobos` 維持 5 筆不變

## Comments

- 本票只搬測試連線目標，**不動任何測試邏輯**——實測已證明不需要動。
- 順帶效益：ETL 測試不再寫開發 DB 之後，`scripts/db/snapshot.py` 的快照才真的只反映開發資料。今天的快照裡就混過 `Test Two-Way`。
- 與 [`01`](01-stop-tests-wiping-sync-runs.md) 同一個病灶的兩側，故編在同一 slice 底下。01 的選項表（(a) 獨立測試 DB 治本）在這裡同樣適用，且成本更低。
