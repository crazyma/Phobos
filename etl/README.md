# Phobos ETL

Python 資料層：把 MLB StatsAPI 的原始回應存進 raw 層、轉換後 upsert 進
**Drizzle 擁有的 curated Postgres schema**。ETL 只當純資料層，經 Postgres 與 Web 解耦
（ADR §3）；**絕不自行定義或 migrate schema**——schema 由 Node/Drizzle 單一擁有。

規格見 `docs/spec/spec-03-etl-pipeline.md`。

## 開發

用 [uv](https://docs.astral.sh/uv/) 管理，與 repo 根的 Node 工具鏈共存於同一 repo。

```bash
cd etl
uv sync            # 建 .venv、裝相依
uv run pytest      # 跑測試（純測試不需 DB；-m db 需 Postgres）
```

**跑批次**用的 `DATABASE_URL` 共用 repo 根的 `.env`（開發庫 `postgres://phobos:phobos@localhost:5432/phobos`）。

### 測試連的是 `phobos_test`，不是開發庫

`@pytest.mark.db` 的測試會真的 insert／commit（中斷過一次，測試球員 `Test Two-Way`
一路留到正式名冊頁上），所以 `etl/tests/conftest.py` 的 `db_conn` **只讀 repo 根
`.env.test` 的 `DATABASE_URL`**（`…/phobos_test`），與 Node 那側 `pnpm test` 同一個庫。
找不到 `.env.test`、它指向的庫等同 `.env`、庫不存在、或庫裡沒有 curated schema 時，
db 測試會**帶著指示 skip**——**不會**退回開發庫。命令列上 export 的 `DATABASE_URL`
對測試無效（比照 `vitest.setup.ts` 的 `override: true`，檔案為準）；CI 要跑 db 測試就寫一份 `.env.test`。

`phobos_test` 的 **schema 由 Drizzle 提供，Python 這側不跑 migration**。第一次要先讓
Node 那側建好表——跑一次 `pnpm test`（vitest 每次 `beforeEach` 都 `migrate()`），或
`DATABASE_URL="postgres://phobos:phobos@localhost:5432/phobos_test" pnpm db:migrate`。
建庫本身見根 `README.md`（docker 首次啟動自動建；本機 Postgres 要 superuser `createdb`）。

## 跑一個批次

```bash
cd etl
uv run python -m etl.sync morning     # 或 evening / manual
```

會開一筆 `sync_runs` 帳、跑該批各來源模組、收帳（success / partial / failed），
並把抓到的上游原始回應存進 `raw_payloads`。目前各批來源清單為空（票 01 走路骨架），
之後的票（02~07）把各來源模組接上。

## 韌性語意（spec-03 §7）

- 單一來源失敗 → 只跳過該來源、其餘照跑、批次記 `partial`，錯誤寫進 `sync_runs.detail`。
- 批次層致命錯 → `failed`，網站繼續供舊資料。
- `sync_runs` 開帳時先寫 `failed`（悲觀），乾淨收尾才改 `success`/`partial`——
  行程中途死掉的殘帳自然被「最近一筆非-failed」的讀取略過。
