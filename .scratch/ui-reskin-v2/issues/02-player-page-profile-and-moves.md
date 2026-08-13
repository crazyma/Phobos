# 02 — 球員個人頁：檔案與動態（含媒體集錦）

**What to build:** 點進任一位球員，看到的是雜誌風格的球員檔案——深藍橫幅上有**所屬球隊隊徽**、姓氏浮水印、層級徽章、中英文名與基本資料，狀態一句話以引言方式呈現；往下是近期比賽紀錄（大數字列表而非密集表格）、媒體與新聞集錦、動態時間軸、出賽預告。已離開美職體系的球員看到的是精簡版。**數據區（本季／逐季／進階）不在本票**，仍是舊版面，由 03 接手。

**Blocked by:** 01（字體／語意色／外框／共用樣板）。**Blocks:** 03。

> **📌 2026-08-13 batu 追加兩項**（原分屬票 07 與票 01 的遺留）：
> 1. **票 07「球隊隊徽」整張併入本票**——隊徽同時出現在名冊卡與球員頁 hero，兩處都在 `PlayerCard`／hero，一起做最省。票 07 已標記為併入、不再單獨執行。詳見下方「隊徽」一節。
> 2. **封存卡片不要有橘色 hover 邊框**——見下方「封存卡片的 hover」一節。

**Status:** done

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.3、§3、§5.1、§5.4。

---

## Hero（`components/player-detail/player-hero.tsx`）

參考 `Phobos-UI/components/magazine/magazine-player-detail.tsx:222-290`。

- 深藍圓角橫幅 ＋ **姓氏浮水印**（`:227`，`text-[12rem] font-black text-primary-foreground/[0.06]`）
- **中央圓形框放隊徽，不放頭像**（plan §5.1）——隊徽本票一併做，見下方「隊徽」一節
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

## 隊徽（原票 07，2026-08-13 併入）

站上**唯一被允許的圖像素材**——`docs/requirements.md:233`：只放球隊 logo、不放球員照片。plan §5.1 決議不放人物圖像後，隊徽是名冊卡與 hero 的視覺補位。

### 素材

**30 支大聯盟隊徽下載進 `public/logos/`，不 hotlink 第三方 CDN。**

`teams.mlbTeamId` 是 PK（`lib/db/schema/identity.ts:20`），檔名直接用 team id 最省事。目前 `public/` 只有 `og-default.png`，這是新目錄。

> 素材來源與授權由 batu 確認後再下載。`requirements.md:233` 已批准使用球隊 logo，但檔案從哪取得不在本票的技術範圍——**若素材尚未到位，先把 helper 與版位做完、fallback 走「回 null 就省略元素」的路徑，不要卡住其他工作**。

### 推導：小聯盟一律用母隊隊徽

**不逐支處理小聯盟**——與 2026-08-07「中文隊名」那題**同構**：201 支 affiliate **全都有** `parent_org_team_id`（DEVLOG 2026-08-07 已實測）、母隊一定在同一份 team map 裡、**未來新增的球隊與對手自動涵蓋**。

新增 `teamLogo(teamId)` helper。

> ⚠️ **放 `lib/services/team-map.ts`**——那裡已有 `loadTeamMap()` 與 `teamDisplayName()` 在做母隊推導，是天然的單一落點。DEVLOG 2026-08-07 那票的教訓正是「同樣的 fallback 在三個地方各寫一份」，不要重蹈。
>
> `loadTeamMap` 已整表載入（231 筆）並在記憶體解析母隊，**不需要增加 DB 往返**。
>
> 這是本票唯一准許碰 `lib/services/*` 的地方。

### 兩處版位

- **球員頁 hero**：中央圓形框（深藍底、暖橘外圈）
- **名冊卡**（`components/players/player-card.tsx`，票 01 已預留位置）：縮成小尺寸掛在隊名旁

### Fallback

母隊 id 解不出來、或檔案不存在 → **回 null，呼叫端省略該元素**，不出現破圖。

## 封存卡片的 hover（票 01 遺留，2026-08-13 batu 指定修掉）

`components/players/player-card.tsx` 目前不分現役／封存，一律套用共用的 `MAGAZINE_CARD_HOVER`（`components/magazine/card-styles.ts`），其中含 `hover:border-accent`。**結果封存卡片 hover 時仍會亮起橘色邊框**，與它「已去彩度」的靜態外觀矛盾。

**batu 指定：封存卡片 hover 不要出現橘色。**

修法自行判斷，但要滿足：

- 封存卡片**仍要有可點擊的互動回饋**（上浮／陰影／邊框變化擇一即可），只是不用暖橘——它整張卡已經是去彩度的語彙，hover 用 `border-muted-foreground` 之類會一致得多
- **不要用 descendant selector 從外面覆寫**——比照票 01 的做法，讓 `PlayerCard` 依自己的 `archived` prop 決定，或讓 `MAGAZINE_CARD_HOVER` 可帶參數
- 現役卡片的行為**不變**
- `MAGAZINE_CARD_HOVER` 若改成可帶參數，記得它是票 01 建立的共用樣板、後續票也會用，**改動要往後相容**

## archived 模式

`app/players/[id]/page.tsx:58-62` 的「已離開美職體系」提示條換成設計語彙（建議虛線框＋kicker）。zones 3–5 對 archived 隱藏的規則（`:70`）**不變**。

## Checklist

- [x] Hero：姓氏浮水印、`LevelBadge`、四格基本資料、狀態句引言化、近況句
- [ ] 30 支 MLB 隊徽素材放入 `public/logos/`（素材來源／授權尚待 batu 提供；fallback 路徑已完成）
- [x] **隊徽**：`teamLogo(teamId)` 在 `lib/services/team-map.ts` 走 `parentOrgTeamId` 推導且**未增加 DB 往返**、hero 與名冊卡兩處版位都接上（素材待授權後放入 `public/logos/`）
- [x] 隊徽 fallback 回 null、呼叫端省略元素，**不出現破圖**；素材未到位時版面仍成立
- [x] `lib/services/team-map.test.ts` 補測：MLB 直取、小聯盟推母隊、母隊解不出時回 null
- [x] **封存卡片 hover 不出現橘色**，但仍有可點擊回饋；現役卡片行為不變；未用 descendant selector 從外覆寫
- [x] 近期比賽改 `StatList`，二刀流兩份都出，`shortDate()`／`vs()` 沿用
- [x] 媒體集錦可捲動；`media.mock.ts` 含 `MOCK` 命名與檔頭警語，**不進 barrel**
- [x] 時間軸改動態列，升降吃 `--up`／`--down`，英文 description 維持原樣
- [x] 「異動類型 → 色調」對照在呈現層，未動 service／schema
- [x] 出賽預告自製、三 tag 配色如上、既有邏輯未重寫
- [x] `upcoming.tsx:68` 的 `dark:` 已清
- [x] archived 提示條換樣式，隱藏規則不變
- [x] `player-hero.test.tsx`、`recent.test.tsx`、`upcoming.test.tsx` 更新並綠
- [x] `pnpm typecheck` 綠

## Comments

- 本票對 `lib/services/*` **只有一個准許的例外**：隊徽的 `teamLogo()` 放進既有的 `team-map.ts`（見「隊徽」一節）。其餘一律不動。媒體 mock 是唯一新增資料檔且刻意隔離。
- 容器由票 01 統一成 `max-w-6xl px-6`（個人頁原為 `max-w-3xl`）——**注意行長**：純文字段落建議自行收在 `max-w-prose`，別讓近況句拉滿 6xl。
- 完成後本頁會是「新檔案區＋舊數據表」的混搭，**這是預期的**，由 03 收斂。

- 2026-08-13：隊徽素材尚未由 batu 提供／確認授權，故未新增 `public/logos/` 圖檔；helper 與兩個版位已完成，預設 allowlist 為空、fallback 省略元素，待素材到位後只需填入 allowlist 與檔案。
