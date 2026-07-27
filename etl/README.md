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

`DATABASE_URL` 共用 repo 根的 `.env`（`postgres://phobos:phobos@localhost:5432/phobos`）。

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
