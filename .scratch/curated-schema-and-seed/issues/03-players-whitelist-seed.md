# 03 — players 白名單 seed

**What to build:** 一支可重跑的 seed，把十餘位追蹤中的台灣球員灌進 `players` 表，成為「誰算台灣球員」的事實來源（spec-01 A.1）。跑完後查詢 `players` 能撈回整份白名單、`lifecycle` 預設 `tracked`；重跑不產生重複。這是把 schema 從「空表」變成「有真實可追蹤對象」的一步。

**Blocked by:** 02（需 `players` 表與 enum 存在）。

**Status:** ready-for-agent

- [ ] 白名單資料以 StatsAPI `people/search` 拉出每位球員的 `mlb_player_id`、英文名、生日、守備位置；中文名人工補（seed 清單本身進版控，作為白名單事實來源）
- [ ] seed script 以 upsert 灌入 `players`，**幂等**：重跑不新增重複列、不覆蓋人工欄位（如中文名）
- [ ] 每位 seed 球員 `lifecycle` 預設 `tracked`
- [ ] 提供一支 script/指令一鍵執行 seed（掛在 01 的 script 入口）
- [ ] 測試：seed 後查詢回傳的球員數等於白名單長度、關鍵欄位（id/名/lifecycle）正確、且連跑兩次列數不變（驗幂等）
- [ ] DEVLOG 記白名單初始人數與資料抓取日期
