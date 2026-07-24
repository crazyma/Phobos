import { sql } from "drizzle-orm";
import { db as defaultDb } from "../client.ts";
import { players } from "../schema/index.ts";

type Handed = "L" | "R" | "S";

interface WhitelistPlayer {
  mlbPlayerId: number;
  nameEn: string;
  /** 中文名，人工維護；缺者留 null（spec-01 C.1 允許空）。 */
  nameZh: string | null;
  primaryPosition: string;
  bats: Handed;
  throws: Handed;
  birthdate: string; // YYYY-MM-DD
}

/**
 * 台灣球員白名單——「誰算台灣球員」的事實來源（spec-01 A.1）。
 *
 * 資料欄（id/英文名/生日/守位/慣用手）自 StatsAPI people 端點抓取；`nameZh` 人工補。
 * birthCountry 只是種子提示、非準則：Stuart Fairchild 生於美國但具台裔血統，屬白名單。
 *
 * ⚠️ 目前為上線前的少量起手清單；完整白名單於上線前補齊。
 * ⚠️ `nameZh` 待人工校對——Tsung-Che Cheng 的中文名需確認。
 */
export const taiwanesePlayers: WhitelistPlayer[] = [
  {
    mlbPlayerId: 691907,
    nameEn: "Tsung-Che Cheng",
    nameZh: "鄭宗哲", // TODO: 待確認
    primaryPosition: "SS",
    bats: "L",
    throws: "R",
    birthdate: "2001-07-26",
  },
  {
    mlbPlayerId: 656413,
    nameEn: "Stuart Fairchild",
    nameZh: null, // 美國出生、台裔；無通用中文名
    primaryPosition: "CF",
    bats: "R",
    throws: "R",
    birthdate: "1996-03-17",
  },
  {
    mlbPlayerId: 701678,
    nameEn: "Hao-Yu Lee",
    nameZh: "李灝宇",
    primaryPosition: "2B",
    bats: "R",
    throws: "R",
    birthdate: "2003-02-03",
  },
  {
    mlbPlayerId: 801179,
    nameEn: "Yu-Min Lin",
    nameZh: "林昱珉",
    primaryPosition: "P",
    bats: "L",
    throws: "L",
    birthdate: "2003-07-12",
  },
  {
    mlbPlayerId: 678906,
    nameEn: "Kai-Wei Teng",
    nameZh: "鄧愷威",
    primaryPosition: "P",
    bats: "R",
    throws: "R",
    birthdate: "1998-12-01",
  },
];

/**
 * Upsert 白名單進 `players`。幂等：重跑不新增重複列；衝突時刷新 bio 欄與 `updated_at`，
 * 但**保留** `lifecycle`（不復活手動封存者，spec-01 A.2）與 `created_at`。
 * 回傳處理的球員數。
 */
export async function seedPlayers(db = defaultDb): Promise<number> {
  for (const p of taiwanesePlayers) {
    await db
      .insert(players)
      .values({
        mlbPlayerId: p.mlbPlayerId,
        nameEn: p.nameEn,
        nameZh: p.nameZh,
        primaryPosition: p.primaryPosition,
        bats: p.bats,
        throws: p.throws,
        birthdate: p.birthdate,
      })
      .onConflictDoUpdate({
        target: players.mlbPlayerId,
        set: {
          nameEn: p.nameEn,
          nameZh: p.nameZh,
          primaryPosition: p.primaryPosition,
          bats: p.bats,
          throws: p.throws,
          birthdate: p.birthdate,
          updatedAt: sql`now()`,
        },
      });
  }
  return taiwanesePlayers.length;
}
