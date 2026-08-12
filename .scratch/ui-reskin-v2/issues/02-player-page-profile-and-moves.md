# 02 — 球員個人頁：檔案與動態（含媒體集錦）

**What to build:** 點進任一位球員，看到的是雜誌風格的球員檔案——深藍橫幅上有姓氏浮水印、層級徽章、中英文名與基本資料，狀態一句話以引言方式呈現；往下是近期比賽紀錄（大數字列表而非密集表格）、媒體與新聞集錦、動態時間軸、出賽預告。已離開美職體系的球員看到的是精簡版。**數據區（本季／逐季／進階）不在本票**，仍是舊版面，由 03 接手。

**Blocked by:** 01（字體／語意色／外框／共用樣板）。**Blocks:** 03。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.3、§3、§5.1、§5.4。

---

## Hero（`components/player-detail/player-hero.tsx`）

參考 `Phobos-UI/components/magazine/magazine-player-detail.tsx:222-290`。

- 深藍圓角橫幅 ＋ **姓氏浮水印**（`:227`，`text-[12rem] font-black text-primary-foreground/[0.06]`）
- **中央圓形框放隊徽，不放頭像**（plan §5.1）。隊徽（票 07）未上線前先留白或省略——**版面靠姓氏浮水印撐得住**
- `LevelBadge` ＋襯線大名 ＋ mono 英文名
- 基本資料四格 `<dl>`（守位／隊伍／年齡／投打）。現況 `player-hero.tsx:28-32` 已把這些組成 `facts` 陣列，改成設計的四格版式（`:272-288`）
- **狀態一句話**用斜體襯線引言（`border-l-4 border-accent pl-4 font-serif italic`，出處 `magazine-page.tsx:64`）；**近況一句話**放其下 muted 小字

> 設計 hero 放的是人工 `summary`，我們沒有也不做（plan §5.4）——那個位置就是給這兩句的。

- 返回列（`:211-219`）：`ArrowLeft` ＋ mono 大寫小標，連回 `/players`

## 近期比賽紀錄（`components/player-detail/game-log.tsx`）

現況是兩張密集表格（打擊 11 欄／投球 9 欄）。改用設計的 **`StatList`**（`magazine-player-detail.tsx:70-118`）：無外框、左側 mono 日期＋對手＋結果、右側橫向大數字。

- 二刀流球員兩份都要出（現況 `hasBatting`／`hasPitching` 各自判斷，維持）
- **沿用**現有 `shortDate()`（`:8`）與 `vs()`（`:13`），主客場 `@`／`vs` 的判斷不要重寫

## 媒體與新聞集錦（**假資料**）

plan §5.4 已決議先用 mock。移植 `Phobos-UI/components/magazine/media-carousel.tsx`（168 行，可直接複製）。

**三條紀律（務必照做）：**

1. 假資料放 `lib/services/media.mock.ts`，**export 名稱含 `MOCK`**，檔頭註明「等待真實資料源，勿當真值引用」。
2. **不要**加進 `lib/services/index.ts` 的公開 barrel——避免日後被誤當一般 service 接走。
3. 這一區**不納入任何對帳或驗收數字**。

`items.length === 0` 時整區隱藏（`media-carousel.tsx:61`）的行為保留——真來源上線前若想關掉整區，清空 mock 即可。

## 動態時間軸（`components/player-detail/timeline.tsx`）

改用「賽果／動態列」樣板（`styleguide-page.tsx:287`）：`grid-cols-[auto_1fr]`，左 mono 日期、右主體。升／降類事件文字色吃 `--up`／`--down`（參考 `magazine-page.tsx:149-154` 的 `toneColor`）。

> ⚠️ **「異動類型 → 色調」對照是跨票共用物**（本票與 04 首頁異動快訊都要）。放呈現層即可，**不要動 service 或 schema**。誰先落地誰建立，另一票沿用並在 Comments 註明。

⚠️ `description` 是 StatsAPI 原始英文散文（DEVLOG 2026-08-07 已記），不是隊名欄位。本票不做中文化。

## 出賽預告（`components/player-detail/upcoming.tsx`）—— **設計完全沒有樣板**

自己做，用設計語彙拼：

- 三個 tag 沿用 `LevelBadge` 形狀但換色：確定先發＝`--accent` 實心、可能出賽＝描邊、傷兵中＝`--down`
- 下一場的主客場／對手／系列賽第 N/M 戰／台灣時間／球場——既有邏輯（`:36-56`）不要重寫，只換外觀
- 近期戰績勝敗色改吃 `--up`／`--down`，**順手清掉 `:68` 的 `dark:text-emerald-400`**（票 01 已刪深色盤，這條是遺留）

## archived 模式

`app/players/[id]/page.tsx:58-62` 的「已離開美職體系」提示條換成設計語彙（建議虛線框＋kicker）。zones 3–5 對 archived 隱藏的規則（`:70`）**不變**。

## Checklist

- [ ] Hero：姓氏浮水印、`LevelBadge`、四格基本資料、狀態句引言化、近況句
- [ ] 隊徽位置為可選 slot，**沒有隊徽時版面仍成立**
- [ ] 近期比賽改 `StatList`，二刀流兩份都出，`shortDate()`／`vs()` 沿用
- [ ] 媒體集錦可捲動；`media.mock.ts` 含 `MOCK` 命名與檔頭警語，**不進 barrel**
- [ ] 時間軸改動態列，升降吃 `--up`／`--down`，英文 description 維持原樣
- [ ] 「異動類型 → 色調」對照在呈現層，未動 service／schema
- [ ] 出賽預告自製、三 tag 配色如上、既有邏輯未重寫
- [ ] `upcoming.tsx:68` 的 `dark:` 已清
- [ ] archived 提示條換樣式，隱藏規則不變
- [ ] `player-hero.test.tsx`、`recent.test.tsx`、`upcoming.test.tsx` 更新並綠
- [ ] `pnpm typecheck` 綠

## Comments

- 本票不動 `lib/services/*`；媒體 mock 是唯一新增資料檔且刻意隔離。
- 容器由票 01 統一成 `max-w-6xl px-6`（個人頁原為 `max-w-3xl`）——**注意行長**：純文字段落建議自行收在 `max-w-prose`，別讓近況句拉滿 6xl。
- 完成後本頁會是「新檔案區＋舊數據表」的混搭，**這是預期的**，由 03 收斂。
