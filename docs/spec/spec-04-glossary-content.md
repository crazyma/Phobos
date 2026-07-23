# Spec 04 — 名詞庫內容規格

<!--badges: 形式=MDX + frontmatter; 級距=MLB/3A/2A 三組; 規則=名詞頁先行; 撰寫=AI 草擬+人工校訂-->

> 名詞庫（F2）的內容合約：起手名詞清單、每則的 frontmatter schema、級距×層級、**指標↔名詞頁對應（名詞頁先行的強制機制）**、範例球員回連規則。頁面渲染見 spec-02 §2.4~2.5。內容為靜態 MDX、build time 產出（ADR §5(2)）。

---

## A. 起手清單（v1，26 則）

**打投共用指標一則一頁**（頁內分「打者視角／投手視角」兩段級距）。

| category | 名詞 |
|---|---|
| `batting_adv`（5） | wRC+、wOBA、ISO、（BB%、K% →共用）、（WAR、BABIP →共用） |
| `pitching_adv`（3） | FIP、HR/9、LOB% |
| `shared_adv`（4） | BB%、K%、WAR、BABIP（皆打投雙段） |
| `standard`（8） | AVG、OBP、SLG、OPS、ERA、WHIP、IP（局數表示法）、SV/HLD（救援與中繼，一頁） |
| `roster`（6） | IL（傷兵名單）、DFA、waiver（讓渡）、option（下放選項）、40-man roster、Rule 5 draft |

進階 12 頁完整覆蓋球員頁打/投各 7 項指標（**必做核心**）；第二批（基本規則：好球帶、盜壘、犧牲打…）不在 v1。

## B. 每則 frontmatter schema

```yaml
slug: wrc-plus            # 路由 /glossary/[slug]
name_zh: 加權得分創造值
name_en: wRC+
category: batting_adv     # A 表 enum
applies_to: [batter]      # [batter] | [pitcher] | 兩者
metric_keys: [wrc_plus]   # 對應 spec-01 數據欄位鍵；roster 類為空
higher_is_better: true
bands:                    # 級距，僅 mlb/aaa/aa 三組（低階不做，顯示警語）
  mlb:  [{max: 80, label: 低於平均}, {max: 100, label: 及格},
         {max: 125, label: 不錯}, {max: 145, label: 厲害}, {label: MVP 等級}]
  aaa:  [...]
  aa:   [...]
sources:                  # 延伸層的權威連結
  - {label: MLB Glossary, url: ...}
```

正文（MDX body）依三層結構撰寫：判讀白話與分布 →（模板自動渲染級距表）→ 定義算法小字。撰寫流程：AI 輔助草擬 → 人工校訂後才 merge。

## C. 級距編制原則

- 三組級距各自以**該聯盟近年環境**編：MLB 用公開慣例值；3A/2A 以近季聯盟平均±分布手動編（來源在正文註明）。小聯盟環境膨脹，**禁止**直接沿用 MLB 值。
- 已聯盟校正的指標（wRC+ 這類 100=平均）三組可相同，但仍逐組明列（讀者不需要知道哪些指標免校正）。
- 級距屬**人工維護內容**，隨環境變動每季檢視一次即可。

## D. 指標 ↔ 名詞頁對應（名詞頁先行的強制機制）

- build time 由全部 MDX frontmatter 產生 **registry**（`metric_key → slug`）。
- 球員頁的「顯示指標清單」（打/投各 7 項設定）中的每個 `metric_key` **必須**能在 registry 命中，否則 **build fail**——這就是「換指標前名詞頁先行」的機械性保證，不靠人記得。
- 反向：球員頁每個指標名渲染為連向 `/glossary/[slug]` 的連結（F2-3 去程）。
- 汰換指標時舊名詞頁**保留不下架**（SEO 與外部連結不斷）。

## E. 範例球員回連（F2-3 回程，自動挑選）

規則（純函式，對 curated 資料查詢）：

1. 候選＝`lifecycle='tracked'` 且本季該 `metric_key` 有值；
2. 樣本門檻：打者 PA≥50、投手 IP≥20（本季該層級）；
3. 依層級優先（MLB > 3A > 2A；1A 以下不當範例——級距不適用）；
4. 取 1~2 位，顯示「範例：{球員} 本季 {值}（{層級}，{級距標籤}）」；
5. **無人符合 → 整塊隱藏**（不硬塞、不用非台灣球員）。

roster 類名詞（無 metric_keys）改連「最近有此類異動的球員時間軸」，同樣挑不到就隱藏。

## F. 測試決策

- registry 完整性即測試：build 內建檢查（D）；另加單元測試——球員頁指標設定與 frontmatter fixture 對照，缺頁必須 fail。
- frontmatter 以 Zod（或等價 schema）驗證：欄位齊全、bands 僅含 mlb/aaa/aa、band 區間遞增。
- 範例回連挑選函式：seed 資料表驅動（有人符合／門檻不足／只有低階 → 隱藏）。

## G. Open Items

- [ ] 3A/2A 各指標級距的首版數值（編制時附來源註記）
- [ ] 26 則的撰寫排程：先做 12 則進階（球員頁上線前置），standard/roster 隨後
