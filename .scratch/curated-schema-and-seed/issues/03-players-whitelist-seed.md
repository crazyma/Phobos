# 03 — players 白名單 seed

**What to build:** 一支可重跑的 seed，把十餘位追蹤中的台灣球員灌進 `players` 表，成為「誰算台灣球員」的事實來源（spec-01 A.1）。跑完後查詢 `players` 能撈回整份白名單、`lifecycle` 預設 `tracked`；重跑不產生重複。這是把 schema 從「空表」變成「有真實可追蹤對象」的一步。

**Blocked by:** 02（需 `players` 表與 enum 存在）。

**Status:** done（起手 5 人；完整白名單上線前補）

- [x] 白名單資料自 StatsAPI people 端點拉 id/英文名/生日/守位/慣用手；中文名人工補；清單 baked 進版控（`lib/db/seed/players.ts` 的 `taiwanesePlayers`）＝白名單事實來源
- [x] seed 以 upsert 灌 `players`，**幂等**：衝突時刷新 bio + `updated_at`，**保留** `lifecycle`（不復活手動封存者）與 `created_at`
- [x] 每位預設 `lifecycle=tracked`
- [x] `pnpm db:seed`（`scripts/db/seed.ts`，掛在 01 script 入口）
- [x] 測試（`lib/db/seed/players.test.ts`）：seed 後列數＝清單長度、關鍵欄位正確、連跑兩次列數不變（幂等）；全綠
- [x] DEVLOG 記初始人數與抓取日期

**實作註記：**
- 起手 5 人（2026-07-24 自 StatsAPI 抓）：Tsung-Che Cheng(691907)、Stuart Fairchild(656413)、Hao-Yu Lee(701678)、Yu-Min Lin(801179)、Kai-Wei Teng(678906)。
- **birthCountry 非準則**：Fairchild 生於美國但台裔血統、在白名單內——印證 spec-01 A.1「白名單人工事實來源、birthCountry 只當種子」。
- ⚠️ 待人工校對：Tsung-Che Cheng 中文名（暫填「鄭宗哲」）；Fairchild 中文名留 null。完整白名單上線前補齊。
