# 01 — 首頁錨點 + 最新賽況卡（zone 1）+ /api/home 骨架 + 頁面外殼

**What to build:** 把 `/` 從靜態 placeholder 換成真的動態首頁頂區（spec-02 §2.1 第 1 區）。services 由 `games` 算出「**最新一個已結算的美國比賽日**」（digest date＝該日所有相關比賽皆 `final` 的最新一日），該日每位有出賽的 `tracked` 球員一張快訊卡：中文名、隊伍/層級徽章、依角色的**單場精簡 line**（打者：打席/安打/全壘打/打點/保送/三振；投手：局數/被安打/失分/自責/三振/保送）、**近況一句話**。同時建立 `/api/home` 對外合約與首頁頁面外殼（各區 section 骨架），供後續票掛入。

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] service 算 **digest date**：由 `games` 找最新一個「該日相關比賽皆已結算」的美國比賽日（`game_date_us` 錨定，spec-01 C.5／spec-02 §6）；無近期賽事 → 回 null（空狀態由票 04 承接）
- [x] service 回該日 **gameCards**：每位該日有出賽的 tracked 球員一張＝`playerId, nameZh, teamAbbrev, level, role('batting'|'pitching'), line(單場精簡), recentForm`；二刀流同人可兩張（打/投各一）；近況一句話取自 `player_recent_form`
- [x] `/api/home`（route handler）回 `{ digestDate, gameCards, dataUpdatedAt }`，Zod schema 即合約；`dataUpdatedAt` 沿用 footer 同源（最近成功批次）
- [x] `/`（ISR 1800s）Server Component 渲染頂區卡片＋**頁面外殼**（後續區塊的 section 佔位）；digest 為 null／無卡片時先顯示簡單「近期無賽事」佔位（rich 空狀態＝票 04）
- [x] 測試：service（seed DB，多場多球員選出正確 digest date、單場 line 依角色、二刀流兩卡、部分未結算不選該日）；`/api/home` Zod 形狀；首頁 smoke 卡片與近況出現

## Comments

- 2026-07-28：完成於 homepage-digest slice；共用 `HomeSchema` 作 `/api/home` 合約。
