# 04 — 首頁改版

**What to build:** 打開首頁，看到的是一份雜誌封面——大標之下是「今日焦點」跨頁（球員的近況一句話以大字引言呈現，配四格數據，可點進球員頁），接著是近期賽果、異動快訊、即將出賽。休賽季沒有比賽時，看到的是本季／上季回顧與名詞推薦，而不是空白。

**Blocked by:** 01（字體／語意色／外框／共用樣板）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.1、§3、§5.1、§5.4。

---

## 大標

`Phobos-UI/components/magazine/magazine-page.tsx:23-36`：左側襯線特大標（暖橘點在後半），右側 muted 說明，`md:grid-cols-[1.5fr_1fr]`。文案沿用現況（`components/home/home-page.tsx:25-26`）。

## 今日焦點跨頁（取代設計的「封面人物」）

設計原本是半版大圖 ＋ 人物介紹（`magazine-page.tsx:38-87`）。**我們不放人物圖像、也沒有人工 `summary`**（plan §5.1／§5.4），改為**引言跨頁**：

- 深藍圓角跨頁，`md:grid-cols-2`
- **左半**：kicker「今日焦點」＋ `LevelBadge` ＋襯線大名 ＋ **近況一句話以斜體襯線引言呈現**（`border-l-4 border-accent pl-4 font-serif italic`，出處 `:64`）
- **右半**：四格數據（`:67-76`，mono 大數字＋大寫小標）
- 底部「閱讀完整檔案 →」連 `/players/[id]`（`:77-82`）

**挑誰**：`getHome()` 目前沒有「封面人物」概念。**取 `home.gameCards[0]`**（digest 已按規則排序）；當日無賽事則整區隱藏，交給空狀態。

> ⚠️ **不要為此新增 service 邏輯或新排序規則**——這是拉皮票，不是產品票。
>
> 近況一句話是**已有真值**的欄位（`player_recent_form.sentence_zh`，ETL 產生），不是示意值。

## 近期賽果

`magazine-page.tsx:89-147`：左側 mono 大日期、中間名字＋`LevelBadge`＋對手/結果 chip、右側箭頭；`sm:grid-cols-2`、每列 `border-b`。

資料用現有 `home.gameCards`。`GameLine`（`home-page.tsx:5-12`）已把打／投兩種 line 格式化好——**改成設計的「大數字＋小標」橫排**（`:129-138`），不要維持一整句。

## 異動快訊

`magazine-page.tsx:156-188`：`grid-cols-[auto_1fr]`，左 mono 日期、右主體；類型文字吃 `--up`／`--down`（`:149-154` 的 `toneColor`）。

> ⚠️ **我們的 `home.events` 只有 `typeLabel`，沒有 tone。** 需要「異動類型 → 色調」對照：升／登錄類 `up`、降／DFA／IL 類 `down`、其餘 neutral。
>
> **這與票 02 動態時間軸是同一件事——兩票擇一建立、另一票沿用，別做兩份。** 放呈現層即可，**不要動 service 或 schema**。誰先落地誰建立，後者在 Comments 註明沿用。

## 即將出賽 —— **設計沒有這一區**

自己做，tag 配色與票 02 出賽預告**一致**：確定先發＝`--accent` 實心、可能出賽＝描邊、傷兵中＝`--down`。版面沿用「賽果／動態列」雙欄樣板。既有邏輯（`home-page.tsx:99-119`，含 `il` 時不顯示對手／時間）不要重寫。

## 空狀態 —— **設計沒有**

`home.emptyState`（`home-page.tsx:49-76`）在休賽季出現，含「本季／上季回顧」卡與「棒球名詞」推薦三格。

- 整區開頭用 `EmptyState`（票 01 已建）
- 回顧卡沿用近期賽果的列樣式
- 名詞推薦三格用**名詞卡**樣板（`styleguide-page.tsx:344`）
- **三種 fallback 層級（有賽事／emptyState／都沒有）的判斷邏輯不變**

## 不要搬

`magazine-page.tsx:190-212` 的 `TestingEntry`（連到 styleguide 的「測試中」入口）是設計檢視用的。

## Checklist

- [ ] 大標區
- [ ] 今日焦點跨頁：近況一句話當引言、四格數據、連向球員頁；**無人物圖像、無 `summary`**
- [ ] 焦點取 `gameCards[0]`，無賽事時整區隱藏；**未新增 service 邏輯或排序規則**
- [ ] 近期賽果改雜誌列，數據改「大數字＋小標」橫排
- [ ] 異動快訊：類型→色調對照在呈現層，升降吃 `--up`／`--down`；**與票 02 共用同一份**
- [ ] 即將出賽自製，tag 配色與票 02 一致，`il` 既有行為不變
- [ ] 空狀態三塊都改樣式，三種 fallback 判斷不變
- [ ] `TestingEntry` 沒有被搬進來
- [ ] `components/home/home-page.test.tsx` 更新並綠
- [ ] `pnpm typecheck` 綠
- [ ] **`pnpm build` 綠**——typecheck 與 vitest 都不驗 RSC 的 client/server 邊界，只有 `next build` 會（見票 02 Comments 的教訓）

## Comments

- 首頁四區順序（賽果 → 動態 → 即將出賽）由 PRD §5 F1-0 定，**不要因為設計只有三區就調整順序或刪區**。
