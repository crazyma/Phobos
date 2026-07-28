# 01 — ETL 走路骨架：Python 專案 + StatsAPI client + raw layer + sync_runs

**What to build:** 一支能跑起來的 Python ETL 走路骨架——能打 StatsAPI、把原始回應存進 raw layer、開一筆同步批次帳，並讓網站 footer 在跑完一次 sync 後顯示真實「資料更新於」時間。Python 只當純資料層，經 Postgres 與 Web 解耦；**把 Drizzle 擁有的 curated schema 當固定合約，絕不自行定義或 migrate**。

**Blocked by:** None — can start immediately.

**Status:** done（2026-07-27，spec-03 ETL slice 併回 main；補標）

- [ ] `uv` 管理的 Python 專案（`etl/` 套件）與既有 Node/資料層共存於同 repo，不破壞既有 `pnpm test`／`db:*`／`typecheck`
- [ ] 共用 `.env` 的 `DATABASE_URL`；以 **psycopg** 讀寫既有 curated 表（不定義/不 migrate schema——Drizzle 單一擁有）
- [ ] StatsAPI HTTP client：保守 delay、重試 2 次、本地快取；抓取的原始回應存入 `raw_payloads`（source／endpoint／params／payload）
- [ ] `sync_runs` 開帳→收帳，狀態 success／**partial**／failed；**單一來源失敗只跳過該來源並記 `detail`、不中斷整批**（→ partial）；整批失敗→ failed，網站繼續供舊資料
- [ ] `python -m etl.sync <morning|evening|manual>` CLI 跑一個批次（此票批次內容可暫空）並落一筆 `sync_runs`
- [ ] Node 端：`lib/services` 讀「最近一筆非-failed 的 `finished_at`」，`SiteFooter` 由占位「—」改顯示真實台灣時間
- [ ] 測試：fixture 驅動、不打真網路——raw_payload 落庫、sync_runs 狀態轉移、來源失敗→partial 不中斷
