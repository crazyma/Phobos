# 08 — 隊徽：30 支下載進 `public/`，小聯盟走母隊推導

**What to build:** 站上唯一被允許的圖像素材（`docs/requirements.md:233`：只放球隊 logo）。§5.1 決議不放人物圖像後，隊徽是球員頁 hero 與名冊卡的視覺補位。

**Blocked by:** None（獨立）。**Blocks:** None。

**Status:** ready-for-agent — ⏳ **時機未定**

決策依據：`docs/plan/ui-reskin-2026-08-12.md` §5.1。

---

## ⚠️ 這張票不阻斷任何人

票 02（名冊卡）與票 03（球員頁 hero）的版面**在沒有隊徽時完全成立**——名冊卡是純字排、hero 靠姓氏浮水印撐版面。兩票只需把隊徽位置預留成可選 slot。

所以本票可以**排在拉皮之前、之中、之後任一時點**，由 batu 決定。

## 實作

### 素材

**30 支大聯盟隊徽下載進 `public/logos/`，不 hotlink 第三方 CDN。**

`teams.mlbTeamId` 是 PK（`lib/db/schema/identity.ts:20`），檔名直接用 team id 最省事（`public/logos/111.svg`）。目前 `public/` 只有 `og-default.png`，這是新目錄。

### 推導：小聯盟一律用母隊隊徽

**不逐支處理小聯盟**——與 2026-08-07「中文隊名」那題**同構**：

- 201 支 affiliate **全都有** `parent_org_team_id`（DEVLOG 2026-08-07 已實測）
- 母隊一定在同一份 team map 裡
- **未來新增的球隊與對手自動涵蓋**，不必回頭補素材

新增 `teamLogo(teamId)` helper。⚠️ **放在 `lib/services/team-map.ts`**——那裡已經有 `loadTeamMap()` 與 `teamDisplayName()` 在做母隊推導，是天然的單一落點。DEVLOG 2026-08-07 那票的教訓正是「同樣的 fallback 在三個地方各寫一份」，不要重蹈。

`loadTeamMap` 已經整表載入（231 筆）並在記憶體解析母隊，**不需要增加 DB 往返**。

### Fallback

母隊 id 解不出來、或檔案不存在時 → **不顯示破圖**，回傳 null 讓呼叫端省略該元素。理論上 30 支齊全就不會發生，但要明確。

## Checklist

- [ ] 30 支大聯盟隊徽進 `public/logos/`，檔名對 `mlb_team_id`
- [ ] `teamLogo(teamId)` 放 `lib/services/team-map.ts`，走 `parentOrgTeamId` 推導，**不新增 DB 往返**
- [ ] Fallback 回 null、呼叫端省略元素，**不出現破圖**
- [ ] 票 02 名冊卡、票 03 hero 的可選 slot 接上（若那兩票已完成）
- [ ] `lib/services/team-map.test.ts` 補測：MLB 直取、小聯盟推母隊、母隊解不出時回 null
- [ ] `pnpm typecheck` 綠

## Comments

- **不改 schema**：隊徽由檔名對 id 推導，`teams` 不需要新增 logo 欄位。
- 素材來源與授權由 batu 確認後再下載——`requirements.md:233` 已批准使用球隊 logo，但實際檔案從哪取得不在本票的技術範圍內。
