# 02 — Open Graph / 分享卡片（跨頁 metadata）

**What to build:** 讓各頁被分享到社群時有正確的預覽卡片——補齊 Open Graph（＋Twitter card）metadata（spec-02 §7）。目前每頁有 `<title>` 與 `lang="zh-Hant"`，但 OG 全缺。

**Blocked by:** None — can start immediately（與票 01 獨立、可並行；`metadataBase` 由先落地者建、另一張沿用）。

**Status:** ready-for-agent

- [ ] **球員頁** `/players/[id]`：og:title＝名字＋目前隊伍、og:description＝**近況一句話**、og:image＝**球隊 logo（MLB 靜態 logo URL by team id）**；無隊/查無 logo → 退站台預設 OG 圖（v1 不做動態合成）
- [ ] **名詞頁** `/glossary/[slug]`：og:description＝該則一句白話（blurb）；og:title＝名詞中英文名＋站名
- [ ] **首頁／index**：補站台級 OG（首頁補 `generateMetadata` 或 metadata；`/players`、`/glossary` index 沿用站台預設）
- [ ] 設 `metadataBase`（若票 01 未先建）；OG 圖與 URL 皆為絕對網址
- [ ] 測試：球員頁 metadata 含 og:title/description(近況)/image(logo)＋無隊退預設分支；名詞頁 og:description＝blurb；`pnpm build` 過
