import { eq, sql } from "drizzle-orm";
import { db as defaultDb } from "../client.ts";
import { teams } from "../schema/index.ts";

/**
 * 大聯盟 30 支球隊的中文隊名（spec-01 C.2）。
 *
 * 只有這 30 支需要人工命名：小聯盟球隊的中文顯示由「母隊中文名 + 層級」推導
 * （`lib/services/team-map.ts`），因為小聯盟隊名在中文沒有既定譯法、且會改名
 * 增隊，逐支翻譯是追不完的長尾。
 *
 * 採台灣媒體慣用的**暱稱**譯名、不帶城市：同城的兩隊（道奇／天使、洋基／
 * 大都會、小熊／白襪）光靠暱稱在中文裡就分得開，短名也貼近口語。
 */
export const MLB_TEAM_NAMES_ZH: ReadonlyArray<{ id: number; nameEn: string; nameZh: string }> = [
  { id: 108, nameEn: "Los Angeles Angels", nameZh: "天使" },
  { id: 109, nameEn: "Arizona Diamondbacks", nameZh: "響尾蛇" },
  { id: 110, nameEn: "Baltimore Orioles", nameZh: "金鶯" },
  { id: 111, nameEn: "Boston Red Sox", nameZh: "紅襪" },
  { id: 112, nameEn: "Chicago Cubs", nameZh: "小熊" },
  { id: 113, nameEn: "Cincinnati Reds", nameZh: "紅人" },
  { id: 114, nameEn: "Cleveland Guardians", nameZh: "守護者" },
  { id: 115, nameEn: "Colorado Rockies", nameZh: "落磯" },
  { id: 116, nameEn: "Detroit Tigers", nameZh: "老虎" },
  { id: 117, nameEn: "Houston Astros", nameZh: "太空人" },
  { id: 118, nameEn: "Kansas City Royals", nameZh: "皇家" },
  { id: 119, nameEn: "Los Angeles Dodgers", nameZh: "道奇" },
  { id: 120, nameEn: "Washington Nationals", nameZh: "國民" },
  { id: 121, nameEn: "New York Mets", nameZh: "大都會" },
  { id: 133, nameEn: "Athletics", nameZh: "運動家" },
  { id: 134, nameEn: "Pittsburgh Pirates", nameZh: "海盜" },
  { id: 135, nameEn: "San Diego Padres", nameZh: "教士" },
  { id: 136, nameEn: "Seattle Mariners", nameZh: "水手" },
  { id: 137, nameEn: "San Francisco Giants", nameZh: "巨人" },
  { id: 138, nameEn: "St. Louis Cardinals", nameZh: "紅雀" },
  { id: 139, nameEn: "Tampa Bay Rays", nameZh: "光芒" },
  { id: 140, nameEn: "Texas Rangers", nameZh: "遊騎兵" },
  { id: 141, nameEn: "Toronto Blue Jays", nameZh: "藍鳥" },
  { id: 142, nameEn: "Minnesota Twins", nameZh: "雙城" },
  { id: 143, nameEn: "Philadelphia Phillies", nameZh: "費城人" },
  { id: 144, nameEn: "Atlanta Braves", nameZh: "勇士" },
  { id: 145, nameEn: "Chicago White Sox", nameZh: "白襪" },
  { id: 146, nameEn: "Miami Marlins", nameZh: "馬林魚" },
  { id: 147, nameEn: "New York Yankees", nameZh: "洋基" },
  { id: 158, nameEn: "Milwaukee Brewers", nameZh: "釀酒人" },
];

/**
 * 把中文隊名寫進既有的 `teams` 列。
 *
 * **只 update、不 insert**：球隊列由 ETL 建立（`etl/src/etl/sources/teams.py`），
 * 而 `name_en` 是 NOT NULL——這裡插入半列只會讓 seed 檔變成第二份英文名來源。
 * ETL 的 upsert 不會覆蓋 `name_zh`，所以寫進去的中文名批次跑再多次也不會掉。
 *
 * 回傳實際更新的筆數；呼叫端負責在 0 筆時提醒「先跑一次 ETL」，不要靜默通過。
 */
export async function seedTeamNamesZh(db = defaultDb): Promise<number> {
  let updated = 0;
  for (const team of MLB_TEAM_NAMES_ZH) {
    const rows = await db
      .update(teams)
      .set({ nameZh: team.nameZh })
      .where(eq(teams.mlbTeamId, team.id))
      .returning({ id: teams.mlbTeamId });
    updated += rows.length;
  }
  return updated;
}

/** 幾支大聯盟球隊還沒有中文名（seed 後應為 0）。 */
export async function missingMlbNamesZh(db = defaultDb): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teams)
    .where(sql`${teams.level} = 'mlb' and ${teams.nameZh} is null`);
  return row?.n ?? 0;
}
