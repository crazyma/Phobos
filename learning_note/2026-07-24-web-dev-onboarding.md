# Phobos Web 開發入門筆記（給 Android 工程師）

> 日期：2026-07-24
> 對象：熟悉 Android/Kotlin/Room，第一次接觸 Web 全端的工程師
> 範圍：以 Phobos 專案「票 01（資料層骨架）已完成」的現況為教材，按主題整理。
> 教學方式：由小零件（設定檔／語法）逐步勾勒出整張地圖。

---

## 目錄

1. [專案與技術棧總覽](#1-專案與技術棧總覽)
2. [進度現況：spec 與 ticket 的差別](#2-進度現況spec-與-ticket-的差別)
3. [環境與設定檔（對照 Gradle 生態）](#3-環境與設定檔對照-gradle-生態)
4. [環境變數與 .env（DATABASE_URL 從哪來）](#4-環境變數與-envdatabase_url-從哪來)
5. [資料庫怎麼存在、怎麼啟動（Docker vs 本機 brew）](#5-資料庫怎麼存在怎麼啟動docker-vs-本機-brew)
6. [資料存哪裡、怎麼持久化](#6-資料存哪裡怎麼持久化)
7. [連線層 client.ts（pool 與 db）](#7-連線層-clienttspool-與-db)
8. [模組 vs 腳本、模組即單例](#8-模組-vs-腳本模組即單例)
9. [Schema 與 Migration 機制](#9-schema-與-migration-機制)
10. [Android → Web 對照速查表](#10-android--web-對照速查表)

---

## 1. 專案與技術棧總覽

**Phobos** = 追蹤台灣球員在大聯盟（及 3A/2A）表現的**網站**。

與 Android app 的根本差異：Android app 是裝在使用者手機上的 client，資料靠打別人的 API 拿；這個網站要**同時做 client（頁面）＋ server（API）＋ 資料庫＋ 資料抓取（ETL）**，整條都是自己的。

技術棧：

- **Next.js**（前後端一包）＋ **TypeScript**
- **Drizzle ORM** ＋ **Postgres**（資料層）
- **Python**（ETL，去 MLB 官方 API 抓資料寫進 DB）
- 工具鏈：**pnpm**（套件管理）、**vitest**（測試）、**tsx**（直接跑 TS）

---

## 2. 進度現況：spec 與 ticket 的差別

這是最容易混淆的地方——「spec」和「票（ticket）」都有編號，但是兩件不同的東西：

| 名稱 | 是什麼 | 類比 | 狀態 |
|---|---|---|---|
| **spec-01**（文件） | `docs/spec/spec-01-*.md`，**設計圖**：要建哪些表、欄位長怎樣 | 設計文件 | ✅ 寫完（spec-00~04 都有） |
| **票 01 / ticket 01** | 實作單位：bootstrap 資料層骨架 | 施工 | ✅ 已完成（commit `d373ef3`） |
| **票 02 / ticket 02** | 照 spec-01 §C 把表真的建出來 + migration | 施工 | ⬜ 還沒做 |
| **票 03** | 台灣球員白名單 seed 資料 | 施工 | ⬜ 還沒做 |

**關鍵**：spec 是設計圖，票是施工。spec-01 文件早寫好了，但「照著蓋出來的程式碼」還沒動工（票 02）。

**票 01 實際做了什麼**：只立起「空骨架」——工具鏈 + 能連上 DB + migration 機制能跑（但空轉）。**目前 DB 裡連一張業務表都沒有**，`schema/index.ts` 是 `export {}`。

---

## 3. 環境與設定檔（對照 Gradle 生態）

| 檔案 | 用途 | Android 對照 |
|---|---|---|
| `package.json` | 依賴清單 + 可跑指令（`scripts`） | `build.gradle` |
| `pnpm-lock.yaml` | 鎖定精確版本 | `gradle.lockfile` |
| `pnpm-workspace.yaml` | 多模組設定 | `settings.gradle` |
| `tsconfig.json` | TypeScript 編譯選項 | Kotlin compiler options |
| `drizzle.config.ts` | 給 drizzle-kit 用的 ORM/migration 設定 | Room 設定 |
| `vitest.config.ts` | 測試設定 | test 相關 gradle 設定 |
| `docker-compose.yml` | 宣告要起一台 Postgres 容器 | （無直接對照，最像「本機跑一個後端服務」） |
| `.env` / `.env.example` | 環境變數（機密/設定） | `local.properties` / `BuildConfig` |

**`package.json` 重點**：

```jsonc
"scripts": { "db:migrate": "...", "test": "vitest run" }  // ≈ gradle tasks；pnpm test ≈ ./gradlew test
"dependencies":    { ... }   // ≈ implementation(...)
"devDependencies": { ... }   // ≈ testImplementation / 編譯期工具
"type": "module"             // 用現代 import 語法（非舊的 require）
```

`pnpm` ≈ Gradle：既管依賴、也跑任務。`pnpm <script名>` 就是跑 `scripts` 裡那一行。

---

## 4. 環境變數與 .env（DATABASE_URL 從哪來）

### `process.env` 是什麼

Node.js 執行時給你的「環境變數表」（一堆 `KEY=value`）。`process` = 現在正在跑的這支 Node 程式本身。

```ts
const connectionString = process.env.DATABASE_URL;  // 讀出 key 為 DATABASE_URL 的值
```

**Android 對照**：≈ `BuildConfig` 或讀 `local.properties`。動機一樣：把「會變、或機密」的設定抽離程式碼。差別：Android 編譯期烤進 `BuildConfig`；Node 是**執行期**才去 `process.env` 讀。

### `DATABASE_URL` 的名字與值

- **名字**（`DATABASE_URL`）：專案自己取的，這是 Node/Postgres 生態的慣例名。
- **值**：寫在專案根目錄的 `.env` 檔，由 `dotenv` 套件在啟動時載入 `process.env`（見 `migrate.ts` 第 1 行 `import "dotenv/config"`）。

```
.env 檔 → dotenv 載入 → process.env.DATABASE_URL → 程式讀到
```

連線字串拆解：

```
postgres://phobos:phobos@localhost:5432/phobos
   協定     使用者  密碼    主機      port  資料庫名
```

這些值必須跟 `docker-compose.yml`（或本機 Postgres 的實際設定）對得上。

### `.env` vs `.env.example`（重要慣例）

| 檔案 | 進 git？ | 角色 | Android 對照 |
|---|---|---|---|
| `.env` | ❌（在 .gitignore） | 本機真正在用的值（可能含真密碼） | `local.properties`（也 gitignore） |
| `.env.example` | ✅ | 範本，告訴隊友需要哪些 key（假值） | 附的說明/範本 |

新人流程：`cp .env.example .env` 再填自己的值。機密（真密碼、API key）**絕不進 git**。

---

## 5. 資料庫怎麼存在、怎麼啟動（Docker vs 本機 brew）

### 核心觀念差異：SQLite vs Postgres

Android 的 SQLite **內建在系統**，`Room.databaseBuilder` 一句就有，不用「安裝」。Postgres 是**獨立的資料庫伺服器軟體**（另一個 process，甚至可在另一台機器），所以需要「連線字串」去連。

### 本專案的兩條路

| | 本機 brew（目前實際在用） | Docker（備著沒用） |
|---|---|---|
| 怎麼裝 | `brew install postgresql@16` | Docker 抓官方 image |
| 怎麼起 | `brew services start postgresql@16`（透過 macOS 的 `launchd` 常駐、開機自動起） | `pnpm db:up`（`docker compose up -d`） |
| 裝在哪 | **真的裝進 Mac** | 隔離在容器裡 |
| 關掉 | `brew services stop postgresql@16` | `pnpm db:down` |

> **本機實測（2026-07-24）**：brew 裝了 `postgresql@16 16.14`，正在跑（PID 842），listen `localhost:5432`；`phobos` 帳號 + `phobos` 資料庫都存在、連得上（`select 1` 通）。**Docker 沒裝**。所以 `docker-compose.yml` 目前是「寫好備著的標準做法」狀態。

### Docker 的心智模型（若之後改用）

`docker-compose.yml` 用宣告式 YAML 描述「要跑哪些容器」。核心術語：

| Docker 術語 | 是什麼 | Android 類比 |
|---|---|---|
| **image** | 打包好的軟體範本（唯讀） | class / emulator 系統映像 |
| **container** | 從 image 跑起來的實體 | instance / 開起來的 emulator |
| **volume** | 容器外的持久化儲存 | app 持久資料（容器砍了資料還在） |

> **Docker container ≈ 一台隨開隨關的 Android emulator**：不是真的把軟體裝進 Mac，而是開隔離沙盒跑它。

`docker-compose.yml` 逐行重點：
- `image: postgres:16-alpine`：不用自己裝，Docker 抓官方打包好的 image（保證跟隊友同版本）。
- `environment: POSTGRES_USER/PASSWORD/DB`：Postgres image 啟動時會照這些**自動建好帳號和空 DB**。連線字串的值就從這來。
- `ports: "5432:5432"`：格式 `Mac的port : 容器內port`，把容器內 Postgres 轉接到 Mac 的 5432。≈ `adb forward`。
- `volumes: phobos-pgdata:/var/lib/postgresql/data`：把資料存到容器外，容器砍了資料還在。

### 關鍵：`.env` 指的是「地址」不是「某台 DB」

`.env` 只寫 `localhost:5432`，指的是**「此刻佔著這個 port 的那台，不管它是 brew 還是 docker」**。一個 port 同時只能一台佔用：
- 想從 brew 換 docker：先 `brew services stop` 讓出 5432，再 `pnpm db:up`。`.env` **不用改**（但那是一台全新的空 DB，brew 的資料不會跟過去）。
- 想兩台並存：docker 那台改用別的 host port（`"5433:5432"`），`.env` 改指 `localhost:5433`。

> **原則：基礎設施可替換，連線字串是唯一接縫。** 換底層 DB 不用動任何 `.ts`，頂多改 `.env` 一行。

---

## 6. 資料存哪裡、怎麼持久化

### 兩種「空」別混

| 層次 | 是什麼 | 誰建 | 現在狀態 |
|---|---|---|---|
| **Schema** | 表/欄位結構 | migration（票 02） | ⬜ 空 |
| **Data (rows)** | 一筆筆球員資料 | seed / ETL（票 03+） | ⬜ 空 |

先有結構，再有資料。（≈ Room 先有 `@Entity`，才能塞 row。）

### 持久化的真相（校正常見誤解）

❌ 誤解：「資料平常在記憶體，關機時寫回、開機時載入。」
✅ 正確：**一 commit 就直接落在硬碟**，不是重啟才同步。

- 每筆 INSERT/UPDATE 在 commit 那刻就持久化到硬碟資料檔，拔電源也還在。
- 重啟不是「寫回」，而是**重新打開那些硬碟檔案**繼續服務。
- 記憶體只是「常用資料頁的快取」（shared buffers），純為查詢快；硬碟才是唯一事實來源。
- 還有 **WAL（Write-Ahead Log，預寫式日誌）**：寫資料前先記「要改什麼」，確保寫到一半斷電也能復原。Room/SQLite 也有 WAL mode。

> **Android 對照最貼切**：Room 的 `.db` 檔躺在 internal storage，app 被殺、手機重開，資料還在——因為每次 `dao.insert()` 早就寫進檔了。Postgres 一樣，只是「.db 檔」換成一個資料目錄。

### 資料實際在哪

| 存法 | 實際在 Mac 的位置 | 能直接 `ls` 嗎 |
|---|---|---|
| **brew（現用）** | `/opt/homebrew/var/postgresql@16/` | ✅ 一般資料夾。裡面 `base/<編號>/` 每個編號 = 一個 database |
| **docker** | 封在 `~/Library/Containers/com.docker.docker/Data/` 底下的**虛擬硬碟大檔**（`Docker.raw` 之類，檔名依版本） | ❌ 只看得到那顆大檔，看不到內部 |

**為什麼 docker 看不到內部**：macOS 不能原生跑 Linux 容器 → Docker Desktop 開一台隱形 Linux VM → 那台 VM 用一顆 `Docker.raw` 當虛擬硬碟 → 所有容器/volume 都長在這顆大檔裡面。`docker volume inspect` 顯示的 `/var/lib/docker/volumes/...` 是 **VM 內部**路徑，不是 Mac 上摸得到的路徑。

> **Android 對照**：emulator 資料也是封在 `~/.android/avd/xxx.avd/userdata.img` 一整顆映像檔裡，看不到內部一個個檔案，要 `adb shell` 進去。`Docker.raw` 就是 Docker 版的 `userdata.img`。

看 docker 內部的方式（等裝了 docker）：
```bash
docker volume inspect phobos-pgdata                          # 看 volume（VM 內）路徑
docker compose exec postgres ls -la /var/lib/postgresql/data # 鑽進容器看
du -sh ~/Library/Containers/com.docker.docker/Data/*         # 看那顆大檔在 Mac 多大
```

---

## 7. 連線層 client.ts（pool 與 db）

⚠️ 別把 `client.ts` 和 `schema/index.ts` 搞混：

| 檔案 | 做什麼 | Android 對照 |
|---|---|---|
| `lib/db/client.ts` | **連線** DB、export `pool` 和 `db` | `Room.databaseBuilder(...).build()` |
| `lib/db/schema/index.ts` | **定義表結構**（現在空 `export {}`），不連線 | 一堆 `@Entity data class` |

`client.ts` 內容：

```ts
export const pool = new Pool({ connectionString });  // 低階：原始連線池
export const db   = drizzle(pool, { schema });        // 高階：ORM 握把（包在 pool 外）
```

**重要澄清**：`client.ts` 不是「宣告/建立資料庫」。資料庫（Postgres）早就在了。它做的是「撥電話連上已存在的 DB + 包一層好用的 ORM」。

三個角色：

| 這一行 | 在做什麼 | Android 對照 |
|---|---|---|
| `process.env.DATABASE_URL` | 讀「DB 在哪、帳密」 | 讀 `local.properties` |
| `new Pool({...})` | 建連線池、真正撥號連上 | ≈ OkHttp connection pool（**不是** SQLite） |
| `drizzle(pool, { schema })` | 包成 ORM 入口 `db` | **這個 `db` 才是你的 Room `AppDatabase`** |

### `db` 與 `pool` 的用途

- **`db`（高階，你 99% 用這個）**：型別安全的 ORM 握把。之後 `db.select()`、`db.insert(players).values(...)` 都從它出發。欄位/型別打錯，編譯期就報錯。≈ Room `AppDatabase`。
- **`pool`（低階，少用）**：`pg` 的原始連線池，直接管 TCP 連線。export 出來是為了：
  1. **生命週期管理**：程式結束要 `await pool.end()` 關連線，否則 process 不退出。
  2. 偶爾跑 ORM 包不住的原始 SQL。

  ≈ Room 底下的原始 connection / `SupportSQLiteOpenHelper`。

### 為什麼叫「池（Pool）」

不是一條連線，是一票連線的池子。網站同時處理很多請求，每個查詢要一條連線；每次重新握手很慢，所以預先開好一池**重複借還**。

> ≈ OkHttp 的 connection pool，**不是** SQLite——因為 Android 連的是本機檔案，沒有「多條網路連線」問題。這是「server 連遠端 DB」vs「app 連本機 SQLite」的本質差異。

---

## 8. 模組 vs 腳本、模組即單例

觀察：「`client.ts` 宣告完 `db` 就沒了，有人用嗎？」——這是把**模組**當成**腳本**在讀。

| 檔案 | 類型 | 有 `main()`？ | 怎麼被觸發 | Android 對照 |
|---|---|---|---|---|
| `scripts/db/migrate.ts` | **腳本** | 有（結尾 `main().catch()`） | `pnpm db:migrate` 直接跑，**跑完退出** | 有 `fun main()` 的可執行檔 |
| `lib/db/client.ts` | **模組** | 沒有，只有 export | **被 import 時**才載入，不會「跑完退出」 | `object Db { val db = ... }` 單例持有者 |

`client.ts` 沒有執行序，它是「放共用物件的架子」。「宣告完就結束」——**沒有結束這回事**，它是被「引用」的，不是被「執行」的。

**現在誰用 `db`**：`lib/db/health.ts:10` 的 `db.execute(sql\`select 1 as one\`)`，由 `health.test.ts`（票 01 的 smoke test）呼叫。**現在就在用**，只是業務還沒長出來所以少。

### 模組即單例（該學起來的模式）

ES module **只會被求值一次，export 出的東西全專案共享**（語言內建保證）。所以：

```ts
export const db = drizzle(pool, { schema });
```

不需要任何 DI 框架，就**天然得到全專案唯一的 `db` 單例**，每個 import 拿到同一個、共用同一池連線。

> **Android 對照**：Android 為「全 app 一個 `AppDatabase`」要寫 `object` 或用 Hilt/Dagger `@Singleton`、小心多執行緒 double-check locking。**Node 的模組系統免費送你這個單例語意**——這點比 Android 省事。

**未來**：`lib/services`（業務邏輯層）和 Next.js route handler 會大量 `import { db }`，它會是資料存取中樞。現在冷清只因業務還沒開始。

---

## 9. Schema 與 Migration 機制

### 兩個核心指令（別混）

```
改 schema/index.ts（定義表）
   │  ① pnpm db:generate（drizzle-kit generate）
   │     讀 schema → 跟歷史比對 diff → 「寫出」SQL 檔到 drizzle/
   ▼
drizzle/ 多出 0000_xxx.sql（進 git、可 code review）
   │  ② pnpm db:migrate（tsx scripts/db/migrate.ts）
   │     讀 drizzle/ 的 SQL → 「套用」到真實 DB → 記進記帳簿
   ▼
DB 裡真的多出那些表
```

| 步驟 | 做什麼 | Room 對照 |
|---|---|---|
| ① `generate` | 比對想要的 schema vs 歷史，**產生**遷移 SQL 檔 | Room 的 `exportSchema` + autoMigration diff |
| ② `migrate` | 把遷移 SQL **真的執行**到 DB，記錄套到第幾版 | app 開啟時 Room 執行 migration、更新版本 |

Room 把這兩步藏在「app 開啟時自動做」；Drizzle **刻意拆開、攤在你面前**——generate 產出的 SQL 進 git、可審查、可手改。這是 server 端慣例：**遷移是要被審查的產物，不能黑箱**。

### 五個角色（票 01 現況全空）

1. **`drizzle.config.ts`**：給 `drizzle-kit` 看的設定（表定義在哪讀 `schema`、SQL 產出放哪 `out`、DB 在哪）。注意它跟 `client.ts` 是**兩套連 DB 的東西**：`client.ts` 是 app 執行時連；`drizzle.config.ts` 是開發工具連。
   > `process.env.DATABASE_URL!` 的 `!` = TypeScript「保證不是 undefined」（≈ Kotlin `!!`）。
2. **`lib/db/schema/index.ts`**：`export {}`，generate 的**輸入**。空的 → 產不出 SQL（no-op 源頭一）。
3. **`drizzle/` 資料夾**：migration 產物 + 記帳。目前只有 `drizzle/meta/_journal.json`＝`{"version":"7","dialect":"postgresql","entries":[]}`（`entries:[]` = 至今產生過的 migration：空）。
4. **`scripts/db/migrate.ts`**：步驟 ② 執行者。`migrate(db, { migrationsFolder: "./drizzle" })` 套用所有未套的 migration。drizzle/ 空 → 沒事做（no-op 源頭二）。但它跑時會在 DB 建 `drizzle.__drizzle_migrations` 記帳表。
5. **`drizzle.__drizzle_migrations` 表**：記錄每個 migration 的 hash + 套用時間，保證**冪等**（跑一百次結果一樣）。≈ SQLite `PRAGMA user_version` / Room `room_master_table`。

### 為什麼現在是 no-op（本機實測鐵證）

```
phobos DB 的表:        找不到任何關聯   ← 0 張業務表（schema 空）
drizzle schema:        存在             ← migrate 跑過，建了記帳簿
__drizzle_migrations:  0 筆資料         ← 但套用過 0 個 migration = no-op 鐵證
```

因果鏈：
```
schema/index.ts = export {} → generate 產不出 SQL → drizzle/ 沒 migration 檔
                                                        → migrate 沒東西可套 → DB 0 張表
                              migrate 仍建了記帳簿 → __drizzle_migrations 存在但 0 筆
```

**一句話**：票 01 把「migration 這台機器」組好、通電、空轉證明能動（記帳簿都建好了），但還沒餵「要建的表」進去。餵料 = 票 02。

### 為什麼 migrate.ts 自己開 pool/db、不 import client.ts

```ts
const pool = new Pool({ connectionString });
const db = drizzle(pool);          // ← 注意：沒有 { schema }！
await migrate(db, { migrationsFolder: "./drizzle" });
await pool.end();                   // ← 用完立刻關
```

四個理由：
1. **它是一次性腳本**：開連線 → 做事 → `pool.end()` 關 → process 退出。不能去關 app 的共用單例 pool，所以要一個自己擁有、可放心關掉的專屬 pool。
2. **migrator 不需要 schema**：`migrate()` 只讀 `drizzle/` 的 SQL 檔，不需知道表在 TS 裡長怎樣。所以刻意用光禿禿的 `drizzle(pool)`。
3. **工具與執行時解耦**：import `client.ts` 會執行它頂層程式碼（建 app pool、跑它的檢查）。migration 工具希望自給自足、獨立。
4. **連線意圖不同**：app pool 是長命多連線；migration 要短命單次連線。

> 有一點點重複（開 pool 那幾行），但這是**刻意解耦**不是壞味道。要消除的話可抽 `createPool()` 共用「怎麼建」，但仍各自持有、各自關閉。現在規模直接各開各的更簡單。

---

## 10. Android → Web 對照速查表

| Android 世界 | 這個專案 | 一句話 |
|---|---|---|
| Kotlin | TypeScript | 靜態型別、編譯期抓錯 |
| Gradle | pnpm | 裝依賴、跑任務 |
| `build.gradle` | `package.json` | 依賴 + 任務 |
| `gradle.lockfile` | `pnpm-lock.yaml` | 鎖版本 |
| Kotlin compiler options | `tsconfig.json` | 編譯設定 |
| JUnit | vitest | 測試 |
| `BuildConfig` / `local.properties` | `.env` / `process.env` | 機密/設定抽離 |
| Room `@Entity` | `schema/index.ts` 的表定義 | 描述表結構（不連線） |
| `Room.databaseBuilder().build()` | `client.ts` 的 `db` | 連線 + ORM 握把 |
| Room `AppDatabase` | `db`（drizzle 實體） | 平常查詢用的高階握把 |
| Room migration | drizzle `generate` + `migrate` | schema 版本演進（web 這邊拆兩步、攤開可審查） |
| `PRAGMA user_version` / `room_master_table` | `drizzle.__drizzle_migrations` | 記「套到第幾版」，保證冪等 |
| SQLite（本機檔） | Postgres（獨立 server） | 資料存哪 |
| Room `.db` 檔位置 | `/opt/homebrew/var/postgresql@16/`（brew） | 資料在硬碟的實際位置 |
| emulator（隨開隨關的隔離 VM） | Docker container | 隔離沙盒跑軟體 |
| `userdata.img`（emulator 映像檔） | `Docker.raw`（Docker VM 虛擬硬碟） | 資料封裝在映像檔內、Mac 上看不到內部 |
| `adb forward` | docker `ports: "5432:5432"` | port 轉接 |
| OkHttp connection pool | pg `Pool` | 多條連線重複借還（**非** SQLite） |
| `object` / Hilt `@Singleton` | `export const db`（模組即單例） | 全 app 唯一實體（web 免費送） |
| 有 `fun main()` 的可執行檔 | `scripts/db/migrate.ts`（腳本） | 跑完退出 |
| `object Xxx { ... }` 持有者 | `lib/db/client.ts`（模組） | 被 import、不「執行退出」 |

---

## 下一步（票 02）

把 spec-01 §C 的表（`players`、`teams`、`transaction_events`…）寫進 `schema/index.ts` → `pnpm db:generate` 產出首版 migration SQL → `pnpm db:migrate` 套用 → 親眼看 DB 從「0 張表」變「有真表 + 1 筆 migration 紀錄」。這是把本筆記第 9 節的機制「填滿」最有感的一步，也最貼近 Room `@Entity` 的經驗。

參考：`docs/spec/spec-01-domain-and-data-model.md` §C、`.scratch/curated-schema-and-seed/issues/02-*.md`。
