# 02 — Curated schema + 首版 migration

**What to build:** 把 spec-01 §C 的整組 curated 資料模型定義成 Drizzle schema，並產出能乾淨套用到全新 DB 的首版 migration。完成後，DB 裡就有球員追蹤所需的全部表與 enum，供 seed（03）與日後 ETL／services 掛載。

**Blocked by:** 01（需 Drizzle/drizzle-kit/Postgres 骨架就位）。

**Status:** ready-for-agent

- [ ] spec-01 §C 全部 curated 表以 Drizzle 定義：`players`、`teams`、`transaction_events`、`player_current_status`、`games`、`game_batting_lines`、`game_pitching_lines`、`season_batting_stats`、`season_pitching_stats`、`player_recent_form`、`sync_runs`、`raw_payloads`
- [ ] enum 值集依 spec-01 落定：`bats/throws`(L,R,S)、`lifecycle`(tracked,archived)、`teams.level`(mlb,aaa,aa,a_plus,a,rookie)、`transaction_events.type`、`affiliation`、`health`、`games.status`、`sync_runs.kind/status` 等
- [ ] 複合主鍵正確：季數據表 `(player, season, level, team)`、逐場表 `(player, game_pk)`（打／投分兩表）
- [ ] 關聯完整：`transaction_events → players` FK、`teams.parent_org_team_id` 自我 FK、`player_current_status.as_of_event_id` 等
- [ ] 遵守「只存不可推導比率」：schema 中**不含** avg/era/ops 等可由計數重算的欄（spec-01 §C 慣例）
- [ ] drizzle-kit 產出首版 migration，且對全新 DB 乾淨套用成功
- [ ] schema 測試斷言關鍵不變式：至少涵蓋一張季數據表的複合主鍵、`transaction_events → players` FK、一組 enum 的值集、以及「無 avg/era 欄」的負向斷言
- [ ] 未來 domain 邊界（news／articles／authors）**不建**、僅照 spec-01 §D 精神留白
