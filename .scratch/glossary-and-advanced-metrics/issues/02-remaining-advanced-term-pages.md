# 02 — 其餘 11 則進階名詞頁（完成球員頁打/投各 7 覆蓋）

**What to build:** 補齊 v1 的 12 則進階名詞頁（除 01 已做的 wRC+），使球員頁打者 7 項＋投手 7 項進階指標**全部**能連到對應名詞頁（spec-04 §A「必做核心」、§D build-fail 前置）。每則沿用 01 的 MDX + frontmatter + 三層模板，內容 AI 草擬 → 人工校訂後 merge（spec-04 §B）。

**Blocked by:** 01（管線、frontmatter schema、三層模板、registry）。

**Status:** ready-for-agent

- [ ] 撰寫其餘 11 則：`batting_adv` wOBA、ISO；`pitching_adv` FIP、HR/9、LOB%；`shared_adv` BB%、K%、WAR、BABIP（打投雙段）——合 01 的 wRC+ 共 12 則，完整覆蓋球員頁打/投各 7（spec-04 §A）
- [ ] 打投共用指標**一則一頁**，頁內分「打者視角／投手視角」兩段各自級距（spec-04 §A）
- [ ] 每則三組級距：**MLB 用公開慣例值**；**3A/2A 先用 MLB 慣例值佔位、正文明確標註「待校訂」**（spec-04 §C／§G Open Item 首版數值待編）；已聯盟校正指標（wRC+ 這類 100=平均）三組可相同但仍逐組明列
- [ ] 每則 frontmatter 的 `metric_keys` 對齊 spec-01 數據欄位鍵，確保球員頁進階指標（票 03）build 時全部命中 registry
- [ ] 測試：新增各則 frontmatter 通過 01 的 Zod 驗證與 registry 生成；抽樣頁面 smoke
