# 01 — 球隊中文名：30 支手寫 + 小聯盟推導

**What to build:** 讓中文網站上的球隊名是中文。`teams.name_zh` 欄位存在但**231 筆全是 NULL**，所以名冊、個人頁、首頁、時間軸上的球隊一律顯示英文（`Seattle Mariners`、`Worcester Red Sox`、`Sugar Land Space Cowboys`）。

**Blocked by:** None。

**Status:** ready-for-agent

## 現況量測（2026-08-07）

```
teams: 231 筆，name_zh 有值 0 筆
```

各介面實際會露出的不重複球隊數：

| 介面 | 球隊數 |
|---|---:|
| 現役所屬（名冊／個人頁 bio） | 5 |
| 季數據表（打／投） | 29 / 13 |
| 異動時間軸 | 44 |
| **以上合計不重複** | **44** |
| 賽程／對手（`games` 現況） | **201** |

## 決策（2026-08-07，batu）

**大聯盟 30 支手寫中文名；小聯盟不逐支翻譯，改用「母隊中文名 + 層級（原名）」推導。**

理由：小聯盟隊名在中文沒有既定譯法（「Sugar Land Space Cowboys」翻什麼都是自創），而且球隊會改名、增隊，逐支翻譯是追不完的長尾。台灣媒體本來就講「紅襪 3A」。schema 剛好完全支援——已驗證：

```
level       | total | 有 parent_org_team_id
mlb         |    30 |    0      ← 只有這 30 支需要人工中文名
aaa~rookie  |   201 |  201      ← 全部都有母隊，可推導
```

**顯示格式**（batu 選定）：

```
名冊頁
史都華·費爾柴德   大聯盟・水手
林昱珉            3A・響尾蛇 3A（Reno Aces）
鄭宗哲            3A・紅襪 3A（Worcester）

個人頁季數據表
2026  3A   紅襪 3A（Worcester）   .268
2025  2A   海盜 2A（Altoona）     .254
```

## ⚠️ 括號裡的原名要放什麼，需要定案

上面示意圖裡的原名寫法其實**不一致**（`Reno Aces` 是全名、`Worcester`／`Sugar Land` 是城市），這是示意時隨手寫的，實作要挑一種：

| 選項 | 樣子 | 評估 |
|---|---|---|
| **完整 `name_en`**（建議） | 紅襪 3A（Worcester Red Sox） | 零啟發式、231 筆都有值。缺點：字串長 |
| `abbrev` | 紅襪 3A（WOR） | 也是 231/231 有值、最短。缺點：三碼代號對讀者辨識度低 |
| 城市部分 | 紅襪 3A（Worcester） | 最接近示意圖，但**要從 `name_en` 砍掉暱稱**——沒有城市欄位，切法不可靠（`Sugar Land Space Cowboys` 要砍兩個字、`Reno Aces` 砍一個），會出錯 |

建議走**完整 `name_en`**；若嫌長，退而求其次用 `abbrev`。**不要**做城市切割。

## 實作要點（都已查證）

- **中文名放哪**：比照球員白名單（`lib/db/seed/players.ts`）走 seed，不要讓 ETL 產生。已驗證 `etl/src/etl/sources/teams.py:81-85` 的 upsert **不會覆蓋 `name_zh`**（只更新 `name_en`／`abbrev`／`level`／`parent_org_team_id`），所以 seed 進去的中文名批次跑再多次都不會掉。
- **推導寫在哪**：`lib/services/team-map.ts` 的 `loadTeamMap()` 已經在做 `name: nameZh ?? nameEn`，是天然的單一落點。但另外**兩處自己做了同樣的 fallback**，要一起收斂進同一個 helper：
  - `lib/services/players.ts:87` — `row.teamNameZh ?? row.teamNameEn ?? ""`
  - `lib/services/player-seasons.ts:163` — `nameZh ?? nameEn ?? ""`
- **推導需要母隊的中文名**：小聯盟列要 join 自己的 `parent_org_team_id` 再取母隊 `name_zh`。`loadTeamMap` 本來就整表載入（231 筆），母隊一定在同一份 map 裡，不需要多一次查詢。
- **層級字樣**：`team_level` enum → 顯示字樣（`mlb`→大聯盟、`aaa`→3A、`aa`→2A、`a_plus`→高階 1A、`a`→1A、`rookie`→新人聯盟）。站上可能已有類似對照，先找再新增，別做第二份。
- **母隊沒有中文名時**：理論上不會發生（30 支全手寫），但 fallback 要明確——退回母隊 `name_en` + 層級，不要顯示空字串。

## Checklist

- [ ] 30 支大聯盟球隊中文名 seed（沿用台灣慣用譯名；與現有 seed 檔同慣例，附來源或註記）
- [ ] `teamDisplayName()` 單一 helper：MLB → 中文名；小聯盟 → 母隊中文 + 層級 +（原名）
- [ ] `players.ts:87`、`player-seasons.ts:163` 兩處自製 fallback 收斂到該 helper
- [ ] 括號原名的格式定案（見上表，建議完整 `name_en`）
- [ ] 測試：MLB／小聯盟／母隊缺中文名 fallback 三條路徑；`loadTeamMap` 不因此多打 DB
- [ ] 驗收：名冊、個人頁（bio／季數據表／逐場／即將出賽）、首頁四區、異動時間軸全部改用中文隊名
- [ ] spec-01 C.2（`teams` 欄位語意）與 spec-02 顯示規則補上這條推導規則

## Comments

- **球員的 `name_zh` 沒有缺口，不在本票範圍**：5/5 都有值，而且白名單是人工維護的（新增球員時本來就得手寫），ETL 的 bio source 也刻意不碰（`players_bio.py:7`）。唯一算「策略」的是沒有中文名的台裔球員怎麼取名——已有前例：Stuart Fairchild → 「史都華·費爾柴德」，seed 檔註明「美國出生、台裔」。照前例即可。
- 那 201 支對手球隊之所以不用管，正是因為推導規則涵蓋了它們；**未來新增的球隊與對手也自動有中文顯示**，不需要回頭補資料。這是選推導而非逐支翻譯的主要理由。
