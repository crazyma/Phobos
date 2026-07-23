# Domain Docs

engineering skills 探索 codebase 時，該怎麼消費本 repo 的領域文件。

## 探索前，先讀這些（本 repo 實際位置）

本 repo **沒有**根目錄 `CONTEXT.md`；領域知識分散在既有文件結構（見 `CLAUDE.md` 的目錄慣例）：

- **通用語言 / Ubiquitous Language**：`docs/plan/domain-regrill-2026-07-23.md` §9（動態/狀態/比賽日/確定先發/近況一句話/級距/存檔頁… 的專案語意）。輸出命名（票標題、假設、測試名）用這裡定義的詞，別漂移到同義詞。
- **產品需求詞彙**：`docs/requirements.md`。
- **規格（欄位/合約級）**：`docs/spec/`（入口 `spec-00-overview.md`）。
- **技術決策（ADR）**：`docs/adr/decisions.md`——動到相關領域前，先讀觸及該區的決策。

若上述某些概念尚未在通用語言表中，那是個訊號：要嘛在發明專案不用的語言（重新考慮），要嘛是真的缺口（記給 `/domain-modeling` 或回寫 regrill/glossary）。

## 資訊流向（本 repo）

```
plan（發想）→ requirements（產品面要什麼）→ adr（技術怎麼選）→ spec（照著怎麼建）
```

判斷新文件放哪：還在權衡 → `docs/plan/`；產品面需求 → `docs/requirements.md`；已拍板決策理由 → `docs/adr/`；能照著建的細節 → `docs/spec/`；已作廢 → `docs/archive/`。

## Flag ADR conflicts

若輸出與既有 ADR（`docs/adr/decisions.md`）矛盾，**明講**、別默默覆蓋：

> _與 adr §X（…）衝突——但值得重開，因為…_

## 備註

- 本 repo 每份 `docs/**/*.md` 由 PostToolUse hook 自動同步 `.html`（`scripts/build_docs.py`），本目錄的設定檔亦然；設定檔的 HTML companion 無實際用途，可忽略。
