# 02 — 初始 backfill：2020~今 逐場 + 收尾重投影/重算近況

**What to build:** 一次性回灌指令，把每位 tracked 球員 2020 起的 gameLog 補齊，讓 `career_high`/`season_high` 有正確的歷史基準（引擎拿最後一場比全歷史；沒有歷史，「生涯新高」是假的）。服務初期用、之後很少用。

**Blocked by:** 01（沿用 gameLog 抓取路徑）。

**Status:** ready-for-agent

- [ ] `backfill --from DATE`／`--season YYYY`（**預設回灌到 2020**，支援指定單季）逐球員抓 gameLog → `game_*_lines`（＋順手補 `games`）
- [ ] 冪等、**可中斷續跑**、保守 rate-limit；定位**手動 CLI**（非 cron，spec-03 §2 的兩批不含它）
- [ ] 收尾自動接 `reproject`（重放投影）＋ 近況重算
- [ ] 驗收：backfill 後抽驗一名有生涯單場亮點的球員，`career_high`/`season_high` 句子以 2020+ 歷史為基準且正確
- [ ] 註：`season_stats`（票 06）與 `transactions`（票 03）**本就已 2020+ 全量**，此 backfill 只補 `game_*_lines`（唯一 lookback-only 的表）
