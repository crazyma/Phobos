# Phobos — 台灣球員大聯盟網站

台灣球員在美職（MLB/3A/2A…）表現與動態的中文戰情室 + 棒球名詞入口。
產品需求見 `docs/requirements.md`；技術決策見 `docs/adr/decisions.md`；規格見 `docs/spec/`。

## 本地開發

需求：Node 24+、pnpm、以及一個 Postgres 16。

```bash
pnpm install
cp .env.example .env          # 預設連 localhost:5432 的 phobos/phobos/phobos
docker compose up -d          # 起本地 Postgres（或用你自己的 Postgres，改 .env 即可）
createdb -h localhost -U phobos phobos_test  # 只需一次；供 pnpm test 使用的隔離 DB
cp .env.example .env.test     # 再把 .env.test 的資料庫名改成 phobos_test
pnpm db:migrate               # 套用 migration（全新 DB 為乾淨 no-op）
pnpm db:seed                  # 灌台灣球員白名單（幂等）
pnpm test                     # 連線 smoke test（需 DB 在跑）
pnpm dev                      # 起前端，開 http://localhost:3000
```

> 沒有 Docker 也行：起任一本機 Postgres、建好 `phobos` 與 `phobos_test` 兩個資料庫，讓 `.env`／`.env.test` 各自指向它們。測試會自行 migrate，不需 seed。

## Scripts

| 指令 | 作用 |
|---|---|
| `pnpm dev` | 起 Next.js 開發伺服器（`http://localhost:3000`） |
| `pnpm build` | 產生 production build |
| `pnpm start` | 跑 production build |
| `pnpm db:generate` | 依 `lib/db/schema` 產生 migration |
| `pnpm db:migrate` | 套用 `drizzle/` 下的 migration |
| `pnpm db:seed` | 灌台灣球員白名單（幂等） |
| `pnpm typecheck` | `tsc --noEmit`（TypeScript 7 / tsgo；型別的唯一 gate，`next build` 不重複檢查） |
| `pnpm test` | vitest（部分測試需連 DB） |

## 結構

```
app/              Next.js App Router（頁面、layout、globals.css）
components/ui/     shadcn/ui 元件
lib/utils.ts       shadcn cn() helper
lib/db/           Drizzle client + curated schema
scripts/db/       migration runner
drizzle/          產生的 migration（納版控）
docker-compose.yml 本地 Postgres
docs/             需求 / ADR / 規格 / 開發日誌（見 CLAUDE.md 目錄慣例）
```
