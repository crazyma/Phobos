# 01 — 別讓測試清空 `sync_runs`（批次歷史留不住）

**What to build:** `lib/services/sync.test.ts:16,20` 對共用的開發 DB 做**無 `where` 的整表刪除**：

```ts
beforeEach(async () => { await migrate(...); await db.delete(syncRuns); });
afterAll(async () => { await db.delete(syncRuns); await pool.end(); });
```

`lib/db/client.ts` 讀的是同一個 `DATABASE_URL`，所以**每跑一次 `pnpm test`，`sync_runs` 就被清空一次**。這就是快照裡「`id` 已跑到 382、表裡只剩 1 筆」的真正原因（先前推測的「DB 重建過」是錯的）。

影響的是 `sync_runs` 的另外兩個用途（spec-01 C.9 / spec-03 §3、§6）：**批次結果稽核**（哪些 source 失敗、partial 出現過幾次）與**對帳告警落點**（roster/IL 與投影不一致時寫進 `detail`，不自動改投影）。footer 的「資料更新於」只要最近一筆，不受影響。

**背景決策（2026-07-29，batu）**：目前無法判斷是否需要長期保留批次歷史，**先暫時保留、過一陣子再檢討**。但「什麼都不做」達不到保留——有這個主動清除者在，屆時回頭看手上仍只有 1 筆、沒有素材可判斷。本票只是讓歷史**留得住**，不預設要留多久。

**Blocked by:** None。獨立小票，與其他 slice 無相依。

**Status:** ready-for-agent

## ⚠️ 只把 delete 加上 `where` 是不夠的

全 repo 的整表刪除**只有這一處**（其他 34 個 `db.delete()` 都用 fixture id 範圍圈住自己，如 `player-recent.test.ts:34` 的 `inArray(games.gamePk, GAME_PKS)`）。但這個檔不能照抄那個作法，因為：

1. `getLastSyncedAt()`（`sync.ts:14-20`）**是全表查詢**，沒有、也不該有 fixture 過濾條件——它就是要回「整個系統最新的一筆」
2. 第一個測試 `returns null when no run has ever finished` 斷言 `toBeNull()`，**本質上要求空表**。只要 DB 裡有任何一筆真實批次紀錄就必然失敗
3. 其餘三個測試斷言確切時間戳，真實資料若比 fixture 新也會失敗

| 選項 | 作法 | 評價 |
|---|---|---|
| **(a) 獨立測試 DB**（建議） | 測試連 `phobos_test`，與開發 DB 分離 | 治本。測試檔 `beforeEach` **本來就跑 `migrate()`**，天生支援從空 DB bootstrap。順帶讓其餘 34 個 DB 測試不再寫進開發 DB |
| (b) fixture 時間戳改未來 + scoped delete | 讓測試 2–4 恆為最新 | 治標，且**救不了測試 1**（仍需空表），得改寫或刪掉那個測試——等於為了遷就環境弱化覆蓋 |
| (c) 每個測試包 transaction 再 rollback | — | 同樣救不了測試 1：真實列在交易外仍可見 |

**建議採 (a)**，動工前跟 batu 確認——它比「改兩行」大一些，但是唯一能同時保住四個測試與批次歷史的作法。

## Checklist（以選項 (a) 為前提）

- [ ] 測試指向獨立資料庫：新增 `.env.test`（`DATABASE_URL=…/phobos_test`），`vitest.config.ts` 的 `setupFiles` 改載入它而非 `.env`（現為 `["dotenv/config"]`）。`.env.test` 進 `.gitignore`，並在 `.env.example` 補一行說明
- [ ] `docker-compose.yml` 或 README 補「建立 `phobos_test` 資料庫」的一步；測試已自帶 `migrate()`，不需另外 seed
- [ ] 確認 `lib/db/client.ts` 在測試環境讀到的是測試 DB（它在 import 時讀 `process.env`，`setupFiles` 的載入順序要早於測試模組——現有註解已點出這個約束）
- [ ] `sync.test.ts` 的兩個整表 delete 保留即可（在獨立 DB 上是正確作法），但補一行註解說明前提已從「共用 DB、沒別人碰」改為「獨立測試 DB」
- [ ] 跑 `pnpm test` 全綠（現為 140 綠），並確認**跑完後開發 DB 的 `sync_runs` 筆數不變**（這是本票的驗收條件）
- [ ] `docs/DEVLOG.md` 記錄：批次歷史從此留得住，保留期限待日後檢討

## Comments

- 本票**不**引入任何保留／清理策略。`sync_runs` 一天兩批約 730 列/年、`detail` 才幾百 bytes，五年三千多列，`sync.ts` 那個 `order by finished_at desc limit 1` 連索引都不需要。留著不花錢。
- `id` 跑到 382 的斷號是 sequence 不回收的正常現象，沒有邏輯依賴 id 連續，**不需處理**。
- 順帶好處：其餘 34 個 DB 測試目前雖然刪得乾淨，但過程中仍會把 fixture 球員/比賽寫進開發 DB。移到獨立 DB 後開發資料完全不受測試干擾。
