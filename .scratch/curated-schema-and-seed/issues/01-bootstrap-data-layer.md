# 01 — Bootstrap 資料層骨架

**What to build:** 一個可跑的專案骨架，讓後續 schema／seed 有地方落。開發者 clone 後能一行指令起本地 Postgres、跑 migration、跑測試——即使此刻還沒有任何資料表。這是解鎖 02／03 的 prefactor。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] 專案初始化：pnpm + TypeScript（`type: module`、`packageManager` 釘 pnpm 11.15），script 入口就緒；本票不建 Next.js 頁面
- [x] Drizzle ORM + drizzle-kit 安裝並設定：`drizzle.config.ts`、schema 目錄 `lib/db/schema`、輸出 `drizzle/`、`db:generate`/`db:migrate` 可執行
- [x] 本地 Postgres：`docker-compose.yml`（postgres:16-alpine、phobos/phobos/phobos、healthcheck）；連線走 `DATABASE_URL`，附 `.env.example`
- [x] 分層雛形：`lib/db/client.ts`（drizzle client + pool）+ `lib/db/schema/index.ts`（空 barrel，供 02 填）
- [x] 測試框架 vitest 就緒，連線 smoke test（`lib/db/health.test.ts` → `checkDbConnection` 跑 `select 1`）**通過**
- [x] `db:migrate` 對全新 DB 乾淨執行（"Migrations applied cleanly."；空 journal no-op）
- [x] README 記本地啟動步驟

**實作註記：**
- 本機無 Docker；改用本機既有 homebrew postgresql@16 跑 smoke test，`DATABASE_URL` 與 docker-compose 共用同一組（clone 者用 docker 即可）。
- pnpm 11.15 的 build 核准設定在 `pnpm-workspace.yaml` 的 `allowBuilds`（非 package.json），已放行 esbuild。
- `pnpm test` 需 DB 在跑（連線 smoke test 的本質）；純無 DB 環境（如 CI 無 DB）會 fail，屬預期。
