# 05 — 近況 vertical：規則引擎 → player_recent_form

**What to build:** 從每位 tracked 球員的逐場 line、目前狀態與歷史極值，生成一句「近況一句話」——永不為空——讓 `/players` 顯示真實近況（或休賽／無出賽 fallback）。

**Blocked by:** 04（近況需逐場資料）、03（`status_fallback` 需目前狀態）。

**Status:** ready-for-agent

- [ ] 純規則引擎：優先序 `career_high`／`season_high` → `streak` → `single_game` → `recent_agg` → `status_fallback`，取第一個命中；**fallback 必中、句子永不為空**；≤20 字裁切
- [ ] 連續紀錄**跨層級延續**；生涯新高以 2020 起為基準（接受誤差、照樣稱「生涯」）
- [ ] 每批全量重算寫 `player_recent_form`（`sentence_zh`／`pattern`）
- [ ] 表驅動測試：覆蓋 §5 每個 pattern＋fallback 必中；門檻與句式常數維護在程式，新增 pattern 時回填 spec-03 §5 表
- [ ] 驗收：`/players` 顯示真實近況一句話
