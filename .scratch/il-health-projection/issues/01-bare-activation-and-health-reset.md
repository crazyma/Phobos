# 01 — 傷兵狀態的出口：裸 activated 與 health 重設

**What to build:** 讓 `player_current_status.health` 有可靠的離開 `il` 的路徑。目前投影一旦把球員設成傷兵，只有 `il_off`／`release`／`declare_fa`／`depart` 四種事件能打回 `active`；上游只要漏送一次 IL 復出、或用「裸 activated」句型announce，狀態就會一路錯到下一次真的有 `il_off` 為止。實測最長錯 **759 天**。

**Blocked by:** None。

**Status:** done

---

## 一、原題目已失效：typeDesc 字串全集已測完

本票取代 DEVLOG 待決問題「實測 MLB Stats API 的 `transactions` 端點回傳格式，確認 enum 對照是否齊全」與 spec-03 §9 的同一條。原題假設「上游字串集未知、未匹配的會默默掉進 `other`」——**實測不成立**。

把 `raw_payloads` 裡 32 份 transactions payload 展開（5 位球員、2020-01-01 起、**238 筆**不重複上游異動），`(typeCode, typeDesc)` 組合只有 **12 種**，且 12 種全部命中 `_TYPEDESC_RULES`／`_TYPECODE_RULES`：

| typeCode / typeDesc | 上游筆數 | `classify()` 結果 |
|---|---:|---|
| SC / Status Change | 81 | il_on 20、il_off 17、**other 44** |
| ASG / Assigned | 67 | assign 48、**other 19** |
| OPT / Optioned | 23 | send_down 23 |
| CU / Recalled | 19 | call_up 19 |
| DES / Designated for Assignment | 13 | dfa 13 |
| TR / Trade | 7 | trade 7 |
| SE / Selected | 7 | call_up 7 |
| NUM / Number Change | 7 | **other 7** |
| CLW / Claimed Off Waivers | 5 | waiver_claim 5 |
| SFA / Signed as Free Agent | 5 | sign 5 |
| DFA / Declared Free Agency | 3 | declare_fa 3 |
| OUT / Outrighted | 1 | send_down 1 |

`other` 共 70 筆（238 的 29%），拆開來看：

- **NUM 改背號 7 筆** — 真的沒有狀態語意，`other` 正確。
- **ASG 的復健移地與春訓邀請 19 筆** — `transactions.py:148-163` 明寫要留 `other`，正確。
- **SC「裸 activated」44 筆** — 問題全在這裡。

重現指令（本票的量測都可照跑）：

```sql
select tx->>'typeCode', tx->>'typeDesc', count(distinct tx->>'id')
from raw_payloads r, lateral jsonb_array_elements(r.payload->'transactions') tx
where r.endpoint='transactions' group by 1,2 order by 3 desc;
```

---

## 二、缺陷本體

### 2.1 「裸 activated」三種語意共用一個句型

那 44 筆的 description 都是「**[球隊] activated [守位] [球員].**」，句中沒有 `injured list`。但它其實混了三件事：

```
Clearwater Threshers activated 2B Hao Yu Lee.          ← 小聯盟傷兵名單復出（真的要改 health）
Sugar Land Space Cowboys activated RHP Kai-Wei Teng.   ← 被下放後小聯盟隊的例行登錄（no-op 正確）
Chinese Taipei activated SS Tsung-Che Cheng.           ← 中華隊徵召（no-op 正確）
```

**字串上無法區分。** `_is_il_activation()`（`transactions.py:129-131`）要求句中有 `injured list`／`disabled list`／`from the`，三種一律落 `other`。

→ **這代表不能靠「加字串進 `_TYPEDESC_RULES`」解決。** 判準只能來自上下文：球員當下是不是 `il`。

### 2.2 `health` 沒有任何 roster 事件會清掉（放大器）

`project_status()`（`projection.py:96-144`）裡能把 `health` 從 `il` 打回 `active` 的只有 `il_off`／`release`／`declare_fa`／`depart`。`call_up`／`send_down`／`trade`／`dfa`／`waiver_claim`／`assign` **全都不碰 `health`**。

所以漏一次復出不是錯幾天，是錯到下一次真的有 `il_off`。把每位球員的 IL 區間重播出來（15 段）：

```
李灝宇      2022-06-06 → 2023-06-13   372 天   ← 異常
費爾柴德    2021-07-30 → 2023-08-28   759 天   ← 異常
其餘 13 段                          9~77 天   ← 合理
```

**李灝宇那段**：真實復出是 `2022-07-17 Clearwater Threshers activated 2B Hao Yu Lee.`（被判 `other`）。實際傷停 41 天，投影說 372 天——中間 331 天他被指派到 Jersey Shore、打完整季，網站會一路顯示「傷兵」。這是 §2.1 造成的。

**費爾柴德那段**：根因不同，見下節。

### 2.3 上游自己會漏送事件（本票不修，但要記錄）

- **只有進沒有出**：費爾柴德 `2021-07-30` 放入 10 天 IL，上游此後**沒有任何**復出 announce（連裸 activated 都沒有），下一筆是 `2021-08-16` 復健移地、`2021-08-18` 下放 Reno。759 天的成因是這個，不是 §2.1。
- **只有出沒有進**：鄧愷威 `2026-07-17 Houston Astros activated RHP Kai-Wei Teng from the 15-day injured list.`（我們正確判成 `il_off`），但**整個 2026 年上游沒有任何一筆放入 IL 的異動**（全年只有 TR／NUM×2／ASG／SC／OPT／SC 共 7 筆）。他真的在 15 天傷兵名單上，網站卻顯示健康——**這是已經發生過的線上錯誤**，方向與 §2.1 相反。

classify 改再多都救不了這類；正規解是 roster/IL 對帳（spec-03 §6），已存在。本票的 §3.1 會把「只有進沒有出」的傷害從 759 天壓到下一次上下場為止。

---

## 三、修法

### 3.1 `call_up` 重設 `health`（不需 migration）

被 recall／selected／purchased 上大聯盟的球員，**定義上不可能還在傷兵名單上**。在 `_ROSTER_TYPES` 的處理分支裡，僅對 `call_up` 額外做 `health = "active"; il_detail = None`。

⚠️ **不要對整個 `_ROSTER_TYPES` 做**（這點與最初的口頭建議不同，實測後收窄）：

| 型別 | 能不能在 IL 上發生 | 可否重設 health |
|---|---|---|
| `call_up` | 不能 | ✅ 可以 |
| `trade` | **能**（60 天 IL 上被交易很常見） | ❌ 不行 |
| `sign` | **能**（帶傷簽約） | ❌ 不行 |
| `send_down` | **能**（outright／option 掉小聯盟傷兵名單） | ❌ 不行 |
| `waiver_claim` | 能（罕見） | ❌ 不行 |
| `dfa` | **能** | ❌ 不行（且它本來就不在 `_ROSTER_TYPES`） |

實測佐證 `dfa` 必須維持不動：費爾柴德 `2025-08-21` 轉 60 天 IL → `2025-11-03` 被 DFA → `2025-11-06` 宣告自由球員。若 `dfa` 重設 health，11-03 那天就會錯誤地說他康復了。現行 `dfa` 分支（`projection.py:117-119`）本來就只改 affiliation，**維持原樣**。

效果：費爾柴德 2021 那段 759 天 → 在 `2021-09-01`（recalled from Reno）結束，**33 天**，貼近真實（他 8/18 就被下放，實際復出約在 8/17）。

### 3.2 新增 `transaction_type` 值 `activate`（需 migration `0005`）

`classify()` 對「裸 activated」回傳新型別 `activate`（而非 `other`）；`project_status()` 對它的處理是**條件式**：

```
health == "il"  → health = "active"、il_detail = None、as_of = e.id
health == "active" → no-op（不動 affiliation／team／level）
```

為什麼走新 enum 而不是「把 description 傳進 projection 做字串比對」：

- 與本 repo 三次前例一致——`declare_fa`（migration `0001`）、`assign`（`0002`）、`waiver_claim`（`0004`）都是「本來掉進 `other`、需要自己的型別」的同一種題目。
- `EventInput`（`projection.py:33-42`）目前**不帶 `description`**，投影是純型別驅動的重播、沒有任何字串比對。為了這題把散文塞進去會弄髒那條邊界。
- 附帶好處：這 44 筆在異動時間軸上目前掛「其他」標籤，有了型別就有像樣的中文標籤。

**`activate` 絕不改 affiliation／team／level。** 同日常見 `send_down` + `activate` 配對（如鄧愷威 `2026-07-26`：Houston optioned → Sugar Land activated），隊伍由 `send_down` 決定；`activate` 若也去解析 `to_team` 會打架。

**中文標籤建議「登錄」**（`lib/services/player-status.ts:33` 一帶）。三種語意都說得通：小聯盟復出登錄、下放後登錄、中華隊徵召登錄。若 batu 偏好「啟用」也可，擇一即可。

### 3.3 分類判準

`_is_il_activation()` 維持不動（它處理明說 IL 的句子）。在它之後、`assigned to` 判斷之後，新增裸 activated 的判準：

- description 含 `activated`
- 且不含 `injured list`／`disabled list`（否則已被 `_is_il_activation` 接走）
- typeCode 為 `SC`

→ `activate`。

注意 `2025-03-06` 有兩筆 description 是 `activated 2B Hao-Yu  Lee.`（**沒有球隊名、開頭就是動詞**），判準不要假設句首是球隊。

---

## 四、Checklist

- [x] `projection.py`：`call_up` 重設 `health`／`il_detail`（**只有 `call_up`**，理由見 §3.1 表）
- [x] migration `0005`：`transaction_type` 新增 `activate`
- [x] `lib/db/schema/enums.ts`（值 + 註解）、`lib/db/schema/schema.test.ts:95` 一帶的 enum 斷言、`lib/glossary/schema.ts:26` 一帶
- [x] `lib/services/player-status.ts` 中文標籤
- [x] `transactions.py`：`classify()` 產生 `activate`（§3.3 判準）
- [x] `projection.py`：`activate` 條件式分支（§3.2）
- [x] 重跑 transactions + reproject；票面列出的 15 段均符合預期（759→33、372→41，其餘 13 段不變）。另發現 2 段票面未列的既有區間（39、6 天），皆不受本修正影響
- [x] 確認 5 人現況仍全為 `active`（本票不該改變當前狀態，只該改變歷史正確性與未來正確性）
- [x] ETL 測試：裸 activated 分類、`activate` 在 il 時清狀態／在 active 時 no-op、`activate` 不動 affiliation、`call_up` 清 IL、**`trade`／`sign`／`send_down`／`dfa` 在 IL 上不清 health**（回歸鎖，防止日後有人「順手」擴大 §3.1）
- [x] spec-01 B.3／C.3：新型別與投影規則
- [x] spec-03 §9：把 §1 的 12 列對照表寫進去，原「實測 typeDesc 全集」項標為完成
- [x] DEVLOG 待決問題該條收斂

## 五、驗收

現況沒有線上錯誤（5 人 `player_current_status.health` 全為 `active`），所以驗收看的是**歷史重播**：

```
修正前                          修正後（預期）
費爾柴德 2021-07-30  759 天  →  33 天（止於 2021-09-01 call_up）
李灝宇   2022-06-06  372 天  →  41 天（止於 2022-07-17 activate）
其餘 13 段 9~77 天           →  完全不變
```

§2.3 的兩類上游漏送**不在驗收範圍**——鄧愷威 2026 缺 `il_on` 修完仍然缺，那是對帳的責任。

## Comments

- 2026-08-10：完成實作與實際資料驗收。`sync_run #429`（transactions + projection + recent_form）成功；費爾柴德 2021-07-30 區間為 33 天，李灝宇 2022-06-06 區間為 41 天，五名 tracked 球員皆 active。票面列出的 15 段皆符合預期；完整狀態轉換重播另帶出兩段票面未列的既有區間（費爾柴德 2021-05-18→06-26 為 39 天、2023-08-22→08-28 為 6 天），因此實際合計為 17 段，且兩段皆未受本修正影響。

- 這張票是 2026-08-10 盤點未完成項時，從「typeDesc 全集實測」這條待決問題查下去挖出來的。原題目問的是「有沒有不認得的字串」，答案是沒有；真正的問題是**有一個字串認得、但它同時代表三件事**，而投影對它的預設處理（no-op）在其中一種情境下會造成長達兩年的錯誤狀態。
- 與 `waiver_claim`（2026-08-07）如出一轍：都是「被歸進 `other` 的東西其實有狀態語意」。差別是 waiver_claim 錯在 affiliation（顯示錯球隊），這張錯在 health（顯示錯傷兵）。**`other` 是 no-op 這件事本身沒問題，問題是什麼東西該進 `other`。**
