# Phobos — 台灣球員大聯盟網站

記錄並呈現台灣球員在大聯盟（及 3A/2A）的表現與動態，另介紹棒球規則/名詞。
技術棧與選型理由見 `docs/adr/decisions.md`；欄位級規格見 `docs/spec/`。

---

## 目錄與文件慣例

所有文件放在 `docs/` 下，依「思考的成熟度」分層，路徑引用一律以 `docs/` 為根：

| 位置 | 用途 |
|---|---|
| `docs/plan/` | **發想脈絡** — 初期選型討論、比較、規劃草稿。可能過時，保留當背景。 |
| `docs/requirements.md` | **產品需求（PRD）** — 從產品／服務面描述「要解決什麼、為誰做、有哪些功能」。是 adr/spec 的上游。 |
| `docs/adr/` | **技術決策記錄（ADR）** — 「選了什麼、為什麼」的定案，例如 `decisions.md`。 |
| `docs/spec/` | **規格** — 照著就能實作的欄位級/合約級文件，例如 `spec-01-scope-and-data-model.md`。 |
| `docs/DEVLOG.md` | **開發日誌** — 待辦、已完成（含日期）、待決問題、未來 phase。 |
| `docs/archive/` | **封存區** — 已作廢/被取代的文件（如 2026-07-23 封存的舊 spec、rust 方案），保留原目錄結構（`archive/spec/`、`archive/plan/`），僅供查閱、不再維護。 |

資訊流向：`plan`（發想）→ `requirements`（產品面要什麼）→ `adr`（技術怎麼選）→ `spec`（照著怎麼建）。判斷新文件該放哪：還在權衡 → `plan/`；產品面需求 → `requirements`；已拍板的決策理由 → `adr/`；能照著建的細節 → `spec/`。

---

## 工作流程

1. **待辦事項記在 `docs/DEVLOG.md`。** 開新工作前先在 DEVLOG 記下要做的事；**完成後務必回來把該項標記 `[x]`**，並在「已完成」區補上日期（`YYYY-MM-DD`）。DEVLOG 是進度的單一事實來源。

2. **HTML 版本自動同步（免手動）。** 每份 `docs/**/*.md` 都有對應的 `.html`。存檔 `.md` 後，PostToolUse hook（`.claude/settings.json`）會呼叫 `scripts/build_docs.py` 自動重建該 `.html`，套用共用樣式模板。**不要手刻 HTML**；要改版面/樣式就改 `scripts/build_docs.py` 裡的 `STYLE` 模板，再跑 `python3 scripts/build_docs.py` 全量重建。標題副標來自檔案開頭的第一段 `>` 引言；徽章用 `<!--badges: 標籤=值; ...-->`。

3. **保持交叉引用一致。** 移動/改名文件後，檢查其他文件裡的相對路徑引用（以 `docs/` 為根）與各檔的 `<title>`、footer 自我引用，一併更新。

---

## Agent skills

（由 `setup-matt-pocock-skills` 建立；engineering skills 會讀下列設定檔）

### Issue tracker

實作切片票走 **local markdown**（`.scratch/<feature>/issues/NN-*.md`）；spec 仍在 `docs/spec/`、進度單一事實來源仍是 `docs/DEVLOG.md`。詳見 `docs/agents/issue-tracker.md`。

### Domain docs

單一 context；無根目錄 `CONTEXT.md`——通用語言在 `docs/plan/domain-regrill-2026-07-23.md` §9、ADR 在 `docs/adr/`。詳見 `docs/agents/domain.md`。

---

## 備註

- md→html 產生器為零依賴 Python 3（尚未安裝 Node，屬工具鏈不影響 app）。日後若統一到 Node 工具鏈，可平移改寫。
