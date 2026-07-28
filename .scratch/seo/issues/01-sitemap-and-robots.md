# 01 — sitemap.xml + robots.txt（爬取面）

**What to build:** 讓搜尋引擎能發現並索引全站——`/sitemap.xml` 列出所有可索引頁面，`/robots.txt` 開放爬取並指向 sitemap（spec-02 §7）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `/sitemap.xml`（Next 檔案路由）動態列出：全部球員頁 `/players/[id]`（**含 `archived`**，SEO 連結不斷）＋全部名詞頁 `/glossary/[slug]`＋靜態路由（`/`、`/players`、`/glossary`）；球員清單取自 curated DB、名詞清單取自名詞 frontmatter
- [ ] `/robots.txt`（Next 檔案路由）開放全站、宣告 sitemap 位置
- [ ] 設 `metadataBase`（站台絕對網址，來源＝環境變數、缺省給合理預設）供 sitemap 產生絕對 URL；票 02 沿用
- [ ] 測試：sitemap 產生器含全部球員（含 archived）與全部名詞、靜態路由；robots 開放且指向 sitemap；`pnpm build` 過
