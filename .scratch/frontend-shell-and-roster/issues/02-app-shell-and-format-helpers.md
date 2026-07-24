# 02 — 全站骨架 shell + 顯示格式 helper

**What to build:** 全站共用外殼與顯示格式工具。每一頁都包在「頂欄導覽 + footer」的 shell 裡；數據與時間有一致的中文化/台灣時間格式。使用者不論在哪一頁都能從頂欄進名冊或名詞，並看到「資料更新於」的新鮮度標示。

**Blocked by:** 01（需 Next.js app 就位）。

**Status:** done

- [x] Root layout：頂欄導覽（球員名冊 `/players`、名詞 `/glossary` 入口）、**手機收合選單**；footer 顯示「資料更新於 {台灣時間}」（先占位，真值待 sync_runs 有資料）
- [x] `lang="zh-Hant"`；響應式**手機優先**（`SiteHeader` sm 斷點：桌機橫排 nav／手機 hamburger 收合）
- [x] `lib/format` 純函式：`ip_outs`→「5.2 局」、比率位數（AVG/OBP/SLG/OPS 三位、ERA/FIP 兩位、百分比一位）、UTC→Asia/Taipei 格式化（spec-02 §6）
- [x] `lib/format` 單元測試：對照已知值（純函式、不需 DB）— 13 例綠燈（TDD red→green）
- [x] 名冊/名詞入口只放全域導覽，不佔內容主體

**Notes:** `formatDateTimeTaipei` 用零依賴 `Intl.DateTimeFormat(en-CA, Asia/Taipei)`；`formatRate3` 依棒球慣例對 <1 去前導零（.273 / 1.052）。nullish/NaN 一律回 `DASH`（—）。`SiteFooter` 收 `lastSyncedAt` prop，現為 null（占位），待 ETL 的 `sync_runs` 供真值。
