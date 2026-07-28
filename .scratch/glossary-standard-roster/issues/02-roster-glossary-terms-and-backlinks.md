# 02 — Roster 名單與規則名詞（6 則）+ roster 範例回連上線

**What to build:** 補齊名詞庫的**名單與規則**分類（spec-04 §A `roster` 6 則），並把已寫好但尚未接線的 roster 範例回連（`selectRosterExamples`）接進名詞頁——讓使用者在 roster 名詞頁看到「最近有此類異動的球員」，無對應則整塊隱藏（spec-04 §E／spec-02 §2.5 第 4 區）。

**Blocked by:** 01（共用 schema 放寬先落地，避免並改 schema 衝突）。

**Status:** done

- [x] 撰寫 6 則 roster MDX：**IL（傷兵名單）、DFA、waiver（讓渡）、option（下放選項）、40-man roster、Rule 5 draft**（`roster` 類：無 metric_keys／bands，判讀＝白話規則說明＋延伸連結）
- [x] `/glossary` 出現「名單與規則」分組、每則列中英文名＋一句白話
- [x] **接上 roster 範例回連**：roster term 於 frontmatter 宣告關聯異動類型（如 IL→`il_on`/`il_off`、DFA→`dfa`、option→`send_down`/`assign`）；新增 DB loader 撈近期該類異動的 `tracked` 球員 → 餵 `selectRosterExamples` → 名詞頁渲染「最近有此類異動的球員（日期）」；**無對應事件類型或查無球員（如 40-man/Rule 5/waiver）→ 整塊隱藏**
- [x] 測試：schema 接受 roster frontmatter（含關聯異動類型欄）；roster 範例 DB loader（seed：有近期 IL/DFA 球員→顯示、無→隱藏）；`/glossary` 分組與抽樣頁 smoke；`pnpm build` 過

## Comments

- 2026-07-28：完成 roster 名詞與 `getRosterExamples` loader；無關聯事件類型的 waiver／40-man／Rule 5 保持隱藏。
