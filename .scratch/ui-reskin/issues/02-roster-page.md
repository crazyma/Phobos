# 02 — 球員名冊 `/players`：層級分區＋純字排卡片

**What to build:** 把名冊改成設計的層級分區版面，卡片走**純字排**（§5.1 已決議不放人物圖像）。保留我們現有而設計沒有的三件事：篩選、排序、archived 折疊區。

**Blocked by:** 01（字體／token／共用樣板）。

**Status:** ready-for-agent

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §2.2、§3、§5.1。

---

## 版面

參考 `Phobos-UI/components/magazine/roster-page.tsx`。

### 層級分區

依層級由高到低分區，每區一個標題列：`LevelBadge` ＋襯線中文副標 ＋ mono 英文 ＋右側「N 位」（`roster-page.tsx:96-113`）。

⚠️ 設計寫死三區（MLB / AAA / AA，`roster-page.tsx:14-18`）。**我們有六階**——分區要由 `LEVEL_ORDER`（`components/players/players-view.tsx:11`）產生，且沿用現有的 `availableLevels` 邏輯：**沒有球員的層級不出現空區**。英文副標與中文說明六階都要有。

### 卡片（純字排，**不放頭像**）

現況 `components/players/player-card.tsx`（38 行）。改為：

- 區內編號浮水印，右上淡色襯線（`roster-page.tsx:27`，`text-foreground/[0.06]`）
- 暖橘短線 `h-0.5 w-8 bg-accent`（`roster-page.tsx:44`）
- 襯線大名 ＋ mono 英文名（`player.nameEn`）
- 守位 · 隊名（`player.team.levelLabel` 已含層級，注意別重複印——見 DEVLOG 2026-08-07 `withLevel` 那個坑）
- **狀態一句話**（`player.statusSentence`）與**近況一句話**（`player.recentForm ?? "近況同步中"`）——設計卡片沒有這兩句的位置，要自己安排；建議狀態句用略強的字重、近況句 muted 小字
- hover：`-translate-y-1` ＋ `shadow-lg` ＋暖橘邊框（`styleguide-page.tsx:684`）

> **隊徽（票 08）尚未定時機**：卡片在沒有隊徽時完全成立。實作時把隊徽位置預留成一個可選 slot 即可，**不要**因為它 block 本票。

## 設計沒有、必須自己做的三件

### 1. 篩選：`<select>` → chip

`players-view.tsx:55-82` 現在是兩個原生 `<select>`。層級篩選改用票 01 的 `TagButton`（「全部」＋各層級），**排序保留下拉**（chip 表達不了排序語意）。

### 2. archived 折疊區

`players-view.tsx:96-109`。設計無 disclosure 樣板 → 沿用層級分區的標題列樣式包住 `<details>`，卡片降對比表示已封存。標題維持「歷史球員（N）」。

### 3. 空狀態

`shown.length === 0` 時現在是一行 muted 文字。改用票 01 的 `EmptyState`。

## Checklist

- [ ] 層級分區由 `LEVEL_ORDER` 產生、**六階皆有中英文字樣**、空層級不出現
- [ ] 卡片純字排（編號浮水印／暖橘短線／襯線名／mono 英文名），**無頭像框**
- [ ] 狀態句與近況句都在卡片上，且沒有被截斷
- [ ] 隊名不重複印層級（比照 `withLevel: false` 那個坑）
- [ ] 篩選改 chip、排序保留下拉、archived 折疊區維持可用
- [ ] 空狀態走 `EmptyState`
- [ ] `components/players/players-view.test.tsx` 更新並綠（現有 68 行測試多半在斷言舊結構）
- [ ] `pnpm typecheck` 綠

## Comments

- 名冊是 client component（篩選/排序在 client，spec-02 §5「資料量小」）。本票不改這個決定。
- 設計的卡片整張是 `<Link>`（`roster-page.tsx:22`），與我們現況一致，維持。
