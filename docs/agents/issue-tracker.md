# Issue tracker：Local Markdown

本 repo 的**實作切片票**以 markdown 檔存在 `.scratch/` 下。（spec/PRD 不放這裡——見下方「與本 repo 慣例的關係」。）

## 慣例

- 一個 feature 一個目錄：`.scratch/<feature-slug>/`
- 實作票一票一檔：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，從 `01` 起依相依順序編號（blocker 在前）——**不要**把多票塞進單一檔。
- Triage 狀態寫在檔案開頭附近的 `Status:` 行（本 repo 未裝 `triage` skill，狀態字串沿用 `ready-for-agent` 即可）。
- 討論／留言 append 到檔尾 `## Comments` 段。

## 與本 repo 慣例的關係（重要）

- **spec/PRD 不進 `.scratch/`**：本 repo 的規格在 `docs/spec/`、需求在 `docs/requirements.md`（皆已納版控、有 HTML 同步）。`.scratch/` 僅承載「照 spec 拆出來的實作切片票」，屬短期工作檔。
- **進度單一事實來源仍是 `docs/DEVLOG.md`**：`.scratch/` 記單次切片的細票；里程碑、已完成（含日期）、待決問題回寫 DEVLOG。兩者分工，勿讓待辦變成兩套打架的來源。
- `.scratch/` 可考慮加入 `.gitignore`（工作票非長期資產）或選擇性提交，由你決定。

## 當 skill 說「publish to the issue tracker」

在 `.scratch/<feature-slug>/` 下新建檔案（必要時建目錄）。

## 當 skill 說「fetch the relevant ticket」

讀取所引用路徑的檔案；使用者通常會直接給路徑或票號。

## Pull requests as a triage surface

**PRs as a request surface: no.**（本 repo 個人專案，不把外部 PR 當功能請求。）
