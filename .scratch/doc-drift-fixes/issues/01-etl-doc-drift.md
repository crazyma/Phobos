# 01 — ETL 文件漂移：死常數 `GAMELOG_LOOKBACK_DAYS` 與 Savant 取用方式

**What to build:** 2026-07-30 說明三個批次差異時查出兩處文件與實作不符。皆為文件／死碼清理，不動任何執行邏輯。

**Blocked by:** None。獨立小票。

**Status:** ready-for-agent

---

## 漂移 A — `GAMELOG_LOOKBACK_DAYS` 是死常數，但三處文件仍描述它

`etl/src/etl/config.py:24` 定義：

```python
# morning box-score sweep looks this many days back (spec-03 §3).
GAMELOG_LOOKBACK_DAYS = 10
```

**全 repo 沒有任何地方 import 或使用它**（唯一提及是 `cli.py:11` 的 docstring 文字，描述 `resync --gamelog` 的用途概念）。實際的批次逐場 ingest（`game_lines.py:409-422`）是：

```python
def run() -> None:
    tracked = _tracked_player_ids(conn)
    if not tracked: return
    ingest_player_gamelogs(client, conn, tracked, [current_season()])
```

—— **morning 與 evening 都抓「整個當季」的 gameLog，沒有回看窗口**，`kind` 只用來命名 source（`game_lines_morning`／`game_lines_evening`）。這是 2026-07-27 gamelog refactor 的必然結果：改成按球員抓自己的 gameLog 後，「掃幾天內的比賽」這個概念就不存在了（舊作法是從 `games` 表讀窗口內的 `game_pk` 再逐場抓 boxscore）。

- [ ] 移除 `config.py:24` 的 `GAMELOG_LOOKBACK_DAYS` 與其註解
- [ ] `cli.py:11` docstring 改寫：`resync --gamelog` 的定位是「回補早於當季的歷史逐場」，不再以 lookback 天數描述
- [ ] `docs/spec/spec-03-etl-pipeline.md:37` 逐場成績那列，批次欄改為「morning／evening 各抓整個當季 gameLog（冪等，evening 補 morning 時未結束的場次）；歷史球季一次性 `etl backfill`」
- [ ] `docs/spec/spec-00-overview.md:53` 移除 `GAMELOG_LOOKBACK_DAYS` 那列參數
- [ ] **不要改 `docs/DEVLOG.md:104`／`:83`**——那在「已完成」區，正確記載當時的實作狀態，是歷史紀錄

---

## 漂移 B — ADR 指定「經 pybaseball」取 Savant，但 `xwoba-savant` 票選了零依賴 CSV

現行文件：

| 位置 | 內容 |
|---|---|
| `docs/adr/decisions.md:132`（§6.4） | 「可用來源只剩兩個：**MLB Stats API** ＋ **pybaseball 的 Savant/Statcast 接口**」 |
| `docs/adr/decisions.md:139` | 「**Savant（經 pybaseball）為輔**：只補 Statcast 系進階數據（xwOBA 等）」 |
| `docs/spec/spec-03-etl-pipeline.md:39` | 「pybaseball Savant 可選補充（xwOBA 等 Statcast 系）」 |

但 `.scratch/xwoba-savant/issues/01` 選的是**直接讀 Savant 的官方 CSV endpoint**（標準庫 `urllib`+`csv`），理由：pybaseball 底層就是打同一個 endpoint，卻要拖進 pandas＋numpy＋matplotlib 只為一個欄位，與 `snapshot.py`／`build_docs.py` 的零依賴路線不一致。

**這是決策變更，不只是文件過時**，所以正解是在 ADR 補一則、而非默默改字：

- [ ] `docs/adr/decisions.md` §6.4 補一則決策：**Savant 改直接讀官方 CSV 匯出，不經 pybaseball**。記錄理由（依賴體積 vs 單一欄位；`csv=true` 是官方匯出參數、非 scraping；2026-07-29 實測 200／`text/csv`）與影響（ETL 不需 pybaseball 依賴）
- [ ] 同步更新 `decisions.md:132`／`:139` 與 `spec-03:39` 的措辭
- [ ] `decisions.md:37`（選 Python 的理由是「主要資料源 `pybaseball` 為 Python 套件」）補註：該前提已隨 §6.4 演變，但**選 Python 的結論不變**（psycopg + 標準庫已足夠，且 ETL 已成熟）

---

## 漂移 C — 我在 DEVLOG 對 FG/BR 403 的措辭有誤

`docs/DEVLOG.md` 的 `xwoba-savant` 條目把 pybaseball 的 FanGraphs／Baseball-Reference 403 寫成「順帶查證」的新發現，但 **`docs/adr/decisions.md:131`（§6.4）早在 2026-07-23 就記錄了**，還明寫「短期無解，不嘗試繞過」。2026-07-29 的實測是**六天後的再次驗證**，結論一致。

- [ ] 改寫該條目措辭為「再次驗證 ADR §6.4（2026-07-23）的結論仍成立」，並指向 ADR，避免日後誤以為是兩次獨立發現

---

## Comments

- **本票不含** `docs/spec/spec-02-ia-and-api.md:30` 的 digest 錨定漂移（wall-clock 之後未更新）——那已在 `.scratch/games-role-split/issues/01` 的 checklist 內，別重複修。
- 漂移 A 的成因值得記住：gamelog refactor 改掉了資料抓取的**形狀**（從 game-中心變 player-中心），但只更新了 spec-03 的敘述段落（§3 的「來源策略」註解），漏掉同一份文件的來源對照表與 spec-00 的參數表。**改變抓取形狀時，參數表是最容易漏的地方。**
