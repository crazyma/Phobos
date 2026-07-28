# 01 — Standard 數據名詞（8 則）+ schema 放寬解說型

**What to build:** 補齊名詞庫的**標準數據**分類（spec-04 §A `standard` 8 則），讓使用者在 `/glossary` 看到「標準數據」分組並點入每則的三層名詞頁。標準名詞有兩種型態：級距解說（AVG/OBP/SLG/OPS/ERA/WHIP，含級距表）與純解說（IP 局數表示法、SV/HLD 救援與中繼一頁，無級距）——故需先放寬 schema 允許非-roster 名詞省略 metric_keys／bands。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] **schema 放寬**：`standard` 名詞可（a）帶 bands 但無 metric_keys（級距解說）或（b）兩者皆無（純解說）；`advanced`/`shared` **維持**需 metric_keys+bands，registry 缺頁 build-fail 不變（spec-04 §D）；仍保留既有規則（有 bands 則 perspectives 對齊 applies_to、band 區間遞增）
- [x] 撰寫 8 則 standard MDX：**AVG、OBP、SLG、OPS、ERA、WHIP**（帶 MLB/3A/2A 三組級距，3A/2A 佔位「待校訂」比照進階批）＋ **IP（局數表示法）、SV/HLD（救援與中繼，一頁）**（純解說、無級距）
- [x] `/glossary` 出現「標準數據」分組、每則列中英文名＋一句白話；`/glossary/[slug]` 三層模板正確渲染（有 bands 顯示級距表、無則略過；WHIP 歸標準層，requirements §7）
- [x] **v1 不做** standard 的範例球員回連（不擴充 `MetricKey`／`METRIC_FIELD`）
- [x] 測試：schema 接受 standard 級距解說／純解說、仍拒 advanced 缺 metric_keys；新頁 frontmatter 通過驗證與 registry 生成；`/glossary` 分組與抽樣頁 smoke；`pnpm build` 過（含既有 build-fail check）

## Comments

- 2026-07-28：完成 8 則標準名詞；3A／2A 級距均明示為待校訂佔位，且不擴充指標 registry。
