# 03 — 球員個人頁 A：hero、近期比賽、媒體集錦（mock）、時間軸、出賽預告

**What to build:** 球員頁除了數據區以外的所有區塊。數據區（本季／逐季／進階）在票 04，兩票拆開是因為同一頁但檔案不同、且數據區有獨立的設計難題。

**Blocked by:** 01。**Blocks:** 04（同一頁，序列化避免衝突）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.3、§3、§5.1、§5.4。

---

## 1. Hero（`components/player-detail/player-hero.tsx`）

參考 `Phobos-UI/components/magazine/magazine-player-detail.tsx:222-290`。

- 深藍圓角橫幅 ＋ **姓氏浮水印**（`:227`，`text-[12rem] font-black text-primary-foreground/[0.06]`）
- **中央圓形框放隊徽，不放頭像**（§5.1）——隊徽（票 08）未上線前，這個框先留白或整個省略，**版面靠姓氏浮水印撐得住**
- `LevelBadge` ＋襯線大名 ＋ mono 英文名
- 基本資料 `<dl>`（守位／隊伍／年齡／投打）——現況 `player-hero.tsx:28-32` 已把這些組成 `facts` 陣列，改成設計的四格 dl（`:272-288`）
- **狀態一句話**用斜體襯線引言樣式（`border-l-4 border-accent pl-4 font-serif italic`，出處 `magazine-page.tsx:64`），**近況一句話**放其下 muted 小字

> 設計 hero 放的是人工 `summary`，我們沒有也不做（§5.4）——那個位置就是給這兩句的。

- 返回列（`:211-219`）：`ArrowLeft` ＋ mono 大寫小標，連回 `/players`

## 2. 近期比賽紀錄（`components/player-detail/game-log.tsx`）

現況是兩張密集表格（打擊 11 欄／投球 9 欄）。改用設計的 **`StatList`**（`magazine-player-detail.tsx:70-118`）：無外框、左側 mono 日期＋對手＋結果、右側橫向大數字。

- 二刀流球員兩份都要出（現況 `hasBatting` / `hasPitching` 各自判斷，維持）
- 日期沿用現有 `shortDate()`（`game-log.tsx:8`）
- 對手沿用現有 `vs()`（`:13`），主客場 `@` / `vs` 的判斷不要重寫

## 3. 媒體與新聞集錦（**mock data**）

§5.4 已決議先用 mock。移植 `Phobos-UI/components/magazine/media-carousel.tsx`（168 行，可直接複製）。

**三條紀律（§5.4，務必照做）：**

1. mock 放 `lib/services/media.mock.ts`，**export 名稱含 `MOCK`**，檔頭註明「等待真實資料源，勿當真值引用」。
2. **不要**加進 `lib/services/index.ts` 的公開 barrel——避免日後被誤當一般 service 接走。
3. 這一區**不納入任何對帳或驗收數字**。

`items.length === 0` 時整區隱藏（`media-carousel.tsx:61`），這個行為保留——真資料源上線前若想關掉整區，把 mock 清空即可。

## 4. 動態時間軸（`components/player-detail/timeline.tsx`）

改用「賽果／動態列」樣板（`styleguide-page.tsx:287`）：`grid-cols-[auto_1fr]`，左 mono 日期、右主體。

- `typeLabel` 用 `LevelBadge` 以外的中性 chip
- 升／降類事件的文字色吃 `--up` / `--down`（參考 `magazine-page.tsx:149-154` 的 `toneColor`）
- ⚠️ **`description` 是 StatsAPI 原始英文散文**（DEVLOG 2026-08-07 已記），不是隊名欄位。本票不做中文化，維持原樣顯示。

## 5. 出賽預告（`components/player-detail/upcoming.tsx`）—— **設計完全沒有樣板**

自己做，用設計語彙拼：

- 三個 tag 沿用 `LevelBadge` 的形狀但換色：確定先發＝`--accent` 實心、可能出賽＝描邊、傷兵中＝`--down`
- 下一場：主客場、對手、系列賽第 N/M 戰、台灣時間、球場——現有邏輯（`upcoming.tsx:36-56`）不要重寫，只換外觀
- 近期戰績勝敗色改吃 `--up` / `--down`，**順手清掉 `upcoming.tsx:68` 的 `dark:text-emerald-400`**（票 01 已刪深色盤，這條是遺留）

## 6. archived 模式

`app/players/[id]/page.tsx:58-62` 的「已離開美職體系」提示條，換成設計語彙（建議：虛線框＋kicker）。zones 3–5 對 archived 隱藏的規則（`:70`）不變。

## Checklist

- [ ] Hero：姓氏浮水印、`LevelBadge`、四格 dl、狀態句斜體引言、近況句
- [ ] 隊徽位置預留為可選 slot，**沒有隊徽時版面仍成立**
- [ ] 近期比賽改 `StatList`，二刀流兩份都出，`shortDate()` / `vs()` 沿用
- [ ] 媒體集錦：carousel 移植 ＋ `media.mock.ts`（含 `MOCK` 命名、檔頭警語、**不進 barrel**）
- [ ] 時間軸改動態列樣板，升降吃 `--up`/`--down`，英文 description 維持原樣
- [ ] 出賽預告自製，三個 tag 配色如上，既有邏輯不重寫
- [ ] `upcoming.tsx:68` 的 `dark:` 清掉
- [ ] archived 提示條換樣式，隱藏規則不變
- [ ] 四支既有測試更新並綠：`player-hero.test.tsx`、`recent.test.tsx`、`upcoming.test.tsx`（`season-stats.test.tsx` 屬票 04）
- [ ] `pnpm typecheck` 綠

## Comments

- 本票不動 `lib/services/*`，媒體 mock 是唯一新增的資料檔且刻意隔離。
- 頁面容器由票 01 統一成 `max-w-6xl px-6`（個人頁原為 `max-w-3xl`）——**注意內文行長**：純文字段落建議自行收在 `max-w-prose`，別讓近況句拉滿 6xl。
