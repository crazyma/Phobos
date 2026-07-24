# Phobos — 台灣球員大聯盟網站

台灣球員在美職（MLB/3A/2A…）表現與動態的中文戰情室 + 棒球名詞入口。
產品需求見 `docs/requirements.md`；技術決策見 `docs/adr/decisions.md`；規格見 `docs/spec/`。

## 本地開發（資料層）

需求：Node 24+、pnpm、以及一個 Postgres 16。

```bash
pnpm install
cp .env.example .env          # 預設連 localhost:5432 的 phobos/phobos/phobos
docker compose up -d          # 起本地 Postgres（或用你自己的 Postgres，改 .env 即可）
pnpm db:migrate               # 套用 migration（全新 DB 為乾淨 no-op）
pnpm db:seed                  # 灌台灣球員白名單（幂等）
pnpm test                     # 連線 smoke test（需 DB 在跑）
```

> 沒有 Docker 也行：起任一本機 Postgres、建好 `phobos` role/db，讓 `.env` 的 `DATABASE_URL` 指過去即可——連線字串兩邊共用。

## Scripts

| 指令 | 作用 |
|---|---|
| `pnpm db:generate` | 依 `lib/db/schema` 產生 migration |
| `pnpm db:migrate` | 套用 `drizzle/` 下的 migration |
| `pnpm db:seed` | 灌台灣球員白名單（幂等） |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | vitest（部分測試需連 DB） |

## 結構

```
lib/db/           Drizzle client + curated schema（schema 由 ticket 02 填）
scripts/db/       migration runner
drizzle/          產生的 migration（納版控）
docker-compose.yml 本地 Postgres
docs/             需求 / ADR / 規格 / 開發日誌（見 CLAUDE.md 目錄慣例）
```
