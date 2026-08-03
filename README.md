# Phobos — 台灣球員大聯盟網站

台灣球員在美職（MLB/3A/2A…）表現與動態的中文戰情室 + 棒球名詞入口。
產品需求見 `docs/requirements.md`；技術決策見 `docs/adr/decisions.md`；規格見 `docs/spec/`。

## 本地開發

需求：Node 24+、pnpm、以及一個 Postgres 16。

開發用 `phobos`、測試用 `phobos_test` **兩個資料庫**：`pnpm test` 走 `.env.test`，避免測試清掉開發資料（`sync_runs` 曾因此被清空）。

```bash
pnpm install
cp .env.example .env          # 預設連 localhost:5432 的 phobos/phobos/phobos
cp .env.example .env.test     # 再把 .env.test 的資料庫名改成 phobos_test

# 起 Postgres：A) docker 用下面這行；B) 本機 Postgres 見下一節（建 DB 的方式不同）
docker compose up -d          # phobos 與 phobos_test 兩個 DB 都會自動建好

pnpm db:migrate               # 套用 migration 到 phobos（全新 DB 為乾淨 no-op）
pnpm db:seed                  # 灌台灣球員白名單（幂等）
pnpm test                     # vitest；連 phobos_test，測試自行 migrate、不需 seed
pnpm dev                      # 起前端，開 http://localhost:3000
```

### 本機 Postgres（Homebrew 等，不用 docker）

**`createdb -U phobos …` 會失敗**（`ERROR: permission denied to create database`）——本機安裝的 `phobos` 是普通 role，沒有 `CREATEDB` 權限。docker 那條路之所以可行，是因為容器裡的 `POSTGRES_USER: phobos` 在該實例內本來就是 superuser；本機安裝沒有這回事。所以要用**安裝時的 superuser**（Homebrew 預設是你的登入帳號）來建：

```bash
psql -d postgres -c "create role phobos login password 'phobos'"  # 若尚未建
createdb -O phobos phobos          # 以 superuser 身分執行（省略 -U）
createdb -O phobos phobos_test
```

之後 `pnpm db:migrate` / `db:seed` / `test` / `dev` 與上面相同。

> **docker 補建**：init script 只在 volume 全新時跑一次。若你的 volume 是舊的、沒有 `phobos_test`，補一行即可：
> `docker compose exec postgres createdb -U phobos -O phobos phobos_test`

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
