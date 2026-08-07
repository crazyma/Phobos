# 01 — 球隊中文名：30 支手寫 + 小聯盟推導

**What to build:** 讓中文網站上的球隊名是中文。`teams.name_zh` 欄位存在但**231 筆全是 NULL**，所以名冊、個人頁、首頁、時間軸上的球隊一律顯示英文（`Seattle Mariners`、`Worcester Red Sox`、`Sugar Land Space Cowboys`）。

**Blocked by:** None。

**Status:** done（2026-08-07）

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

## 括號裡的原名 —— 已定：完整 `name_en`（2026-08-07，batu）

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

- [x] 30 支大聯盟球隊中文名 seed（`lib/db/seed/teams.ts`，台灣慣用暱稱、不帶城市）
- [x] `teamDisplayName()` 單一 helper（`lib/services/team-map.ts`），`withLevel` 由呼叫端決定
- [x] `players.ts`、`player-seasons.ts` 兩處自製 fallback 收斂到該 helper；**另外抓到第三處**：`player-detail.ts`（個人頁 hero），原票沒列到
- [x] 括號原名＝完整 `name_en`（不做城市切割）
- [x] 測試：`lib/services/team-map.test.ts` 6 項（MLB／小聯盟推導／`withLevel: false`／母隊缺中文名 fallback／小聯盟自己的 `name_zh` 不參與推導／各層級字樣）；`loadTeamMap` 用同一次全表掃描在記憶體解析母隊，**未增加 DB 往返**
- [x] 驗收：名冊列與個人頁 hero 已顯示中文隊名（見完成紀錄）
- [x] spec-01 C.2、spec-02 §2.2 補上規則

## Comments

- **球員的 `name_zh` 沒有缺口，不在本票範圍**：5/5 都有值，而且白名單是人工維護的（新增球員時本來就得手寫），ETL 的 bio source 也刻意不碰（`players_bio.py:7`）。唯一算「策略」的是沒有中文名的台裔球員怎麼取名——已有前例：Stuart Fairchild → 「史都華·費爾柴德」，seed 檔註明「美國出生、台裔」。照前例即可。
- 那 201 支對手球隊之所以不用管，正是因為推導規則涵蓋了它們；**未來新增的球隊與對手也自動有中文顯示**，不需要回頭補資料。這是選推導而非逐支翻譯的主要理由。

## 完成紀錄（2026-08-07）

實際上線的樣子（dev server 實查）：

```
名冊頁
史都華·費爾柴德   大聯盟・水手
李灝宇            大聯盟・老虎
林昱珉            3A・響尾蛇（Reno Aces）
鄧愷威            3A・太空人（Sugar Land Space Cowboys）
鄭宗哲            3A・紅襪（Worcester Red Sox）

個人頁 hero
鄭宗哲  3A・紅襪（Worcester Red Sox）
```

`pnpm db:seed` → `Named 30/30 MLB teams in Chinese.`

### 三件與原票預期不同的事

1. **漏了一處**：原票只列 `players.ts` 與 `player-seasons.ts` 兩個自製 fallback，實際還有**第三處** `lib/services/player-detail.ts`（個人頁 hero）。已一併收斂。
2. **季數據表根本不顯示隊名**：`components/player-detail/season-stats.tsx:70-72` 的 `teamCell` 是 `abbrev ?? name`，密集表格刻意只印三碼（BOS／WOR）。原票說「季數據表一列跨多層級、層級必須留在隊名裡」——這個理由對**資料合約**成立（`/api/players/[id]` 的 `team.name` 現在帶層級），但對**當前 UI** 不成立，因為那格根本沒顯示 name。`withLevel: true` 仍是預設值，未來若把該欄改成全名就直接可用。
3. **仍是英文的兩處，不在本票範圍**：
   - **異動時間軸的敘述文字**：那是 StatsAPI 原始 `description`（如 `Boston Red Sox claimed SS Tsung-Che Cheng off waivers from …`），是上游散文不是隊名欄位。要中文化等於自己組句，是另一個題目。
   - **`abbrev` 介面**（首頁卡片、即將出賽「對 LHV」、季數據表隊伍欄）：`abbrev` 是語言中性的，但 `LHV`／`ELP`／`ABQ` 這類小聯盟三碼對中文讀者辨識度低。是否改成推導隊名是 UI 取捨，需另行決定。
