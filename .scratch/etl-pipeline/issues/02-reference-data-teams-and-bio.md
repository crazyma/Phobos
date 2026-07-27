# 02 — 參考資料 ingest：teams（sportId→level）+ 球員 bio 補全

**What to build:** 灌好 `teams` 參考表（含各層級與 sportId→level 對照）並補齊球員非白名單 bio，讓後續切片有它們外鍵需要的球隊列。

**Blocked by:** 01（需 StatsAPI client／raw layer／sync_runs 骨架）。

**Status:** ready-for-agent

- [ ] StatsAPI teams（各 sportId）→ upsert `teams`，含 `parent_org_team_id`（母球團）與 `level`；sportId→level 常數表 `1=mlb, 11=aaa, 12=aa, 13=a_plus, 14=a, 16=rookie`（以 `/sports` 端點驗證後寫成常數）
- [ ] StatsAPI people → 補 `players` 非白名單 bio 欄（守位／慣用手／生日等）；**不覆寫白名單 lifecycle 與 created_at**
- [ ] 純 transform + fixture 測（含一組欄位缺漏）→ upsert 幂等
- [ ] 定位為低頻批次（每週／手動）；併入 evening 或獨立由實作決定
