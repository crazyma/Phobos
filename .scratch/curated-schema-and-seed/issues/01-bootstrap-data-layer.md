# 01 — Bootstrap 資料層骨架

**What to build:** 一個可跑的專案骨架，讓後續 schema／seed 有地方落。開發者 clone 後能一行指令起本地 Postgres、跑 migration、跑測試——即使此刻還沒有任何資料表。這是解鎖 02／03 的 prefactor。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 專案初始化：pnpm + TypeScript，套件管理與 script 入口就緒（沿用 ADR 的 Next.js 全包方向，但本票只需能編譯 TS 與跑 script／測試，不必先立頁面）
- [ ] Drizzle ORM + drizzle-kit 安裝並設定：schema 目錄、migration 輸出目錄、`db:generate` / `db:migrate` script 可執行
- [ ] 本地 Postgres 以 docker-compose 提供：`docker compose up` 起一個乾淨 DB；連線參數走 `DATABASE_URL` 環境變數（附 `.env.example`）
- [ ] 分層雛形：`lib/db`（Drizzle client + schema 匯出點）依 ADR §4 就位，供 02 接手
- [ ] 測試框架就緒，且有一支**連線 smoke test**：能連上 docker Postgres 並執行一次 trivial query（驗證骨架真的通）
- [ ] `db:migrate` 對全新 DB 可乾淨執行（零表也算通過）
- [ ] README 或 DEVLOG 記一行本地啟動步驟
