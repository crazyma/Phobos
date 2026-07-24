import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import {
  players,
  playerCurrentStatus,
  playerRecentForm,
  teams,
} from "../db/schema/index.ts";
import { playerLifecycle, teamLevel } from "../db/schema/enums.ts";
import { buildStatusSentence, levelLabel } from "./player-status.ts";

/**
 * 球員總覽的對外合約（spec-02 §2.2 / §4）。頁面（票 04）與 `/api/players` 共用
 * 同一組資料，這個 Zod schema 既是型別來源、也是回應形狀的執行期斷言器。
 */
export const PlayerSummarySchema = z.object({
  playerId: z.number().int(),
  nameEn: z.string(),
  nameZh: z.string().nullable(),
  primaryPosition: z.string().nullable(),
  lifecycle: z.enum(playerLifecycle.enumValues),
  team: z
    .object({
      id: z.number().int(),
      name: z.string(),
      abbrev: z.string().nullable(),
      level: z.enum(teamLevel.enumValues),
      levelLabel: z.string(),
    })
    .nullable(),
  /** 歸屬 × 健康 組成的一句（spec-01 B.2）；無投影時為「狀態同步中」。 */
  statusSentence: z.string(),
  /** 近況一句話；ETL 尚未產出時為 null，由呈現層決定 fallback。 */
  recentForm: z.string().nullable(),
});

export type PlayerSummary = z.infer<typeof PlayerSummarySchema>;

/**
 * 組出所有球員的總覽列（tracked 與 archived 皆回，`lifecycle` 標明供分區）。
 *
 * 以 LEFT JOIN 帶入目前狀態、所屬球隊、近況——這三者由 ETL 產生，現階段多半為空，
 * 缺列時不炸：`statusSentence` fallback「狀態同步中」、`team`／`recentForm` 為 null。
 * `db` 可注入（測試以 seed 好的 DB fixture 驗證）。
 */
export async function getPlayerSummaries(db = defaultDb): Promise<PlayerSummary[]> {
  const rows = await db
    .select({
      playerId: players.mlbPlayerId,
      nameEn: players.nameEn,
      nameZh: players.nameZh,
      primaryPosition: players.primaryPosition,
      lifecycle: players.lifecycle,
      affiliation: playerCurrentStatus.affiliation,
      health: playerCurrentStatus.health,
      statusIlDetail: playerCurrentStatus.ilDetail,
      statusLevel: playerCurrentStatus.level,
      teamId: teams.mlbTeamId,
      teamNameEn: teams.nameEn,
      teamNameZh: teams.nameZh,
      teamAbbrev: teams.abbrev,
      teamLevel: teams.level,
      recentForm: playerRecentForm.sentenceZh,
    })
    .from(players)
    .leftJoin(playerCurrentStatus, eq(playerCurrentStatus.playerId, players.mlbPlayerId))
    .leftJoin(teams, eq(teams.mlbTeamId, playerCurrentStatus.teamId))
    .leftJoin(playerRecentForm, eq(playerRecentForm.playerId, players.mlbPlayerId))
    // tracked 先於 archived（enum 定義序），同組再依英文名
    .orderBy(players.lifecycle, players.nameEn);

  const summaries: PlayerSummary[] = rows.map((row) => {
    const level = row.statusLevel ?? row.teamLevel;
    return {
      playerId: row.playerId,
      nameEn: row.nameEn,
      nameZh: row.nameZh,
      primaryPosition: row.primaryPosition,
      lifecycle: row.lifecycle,
      team:
        row.teamId !== null && row.teamLevel !== null
          ? {
              id: row.teamId,
              // teamNameEn is NOT NULL once a team row matched; ?? "" only
              // satisfies the nullable leftJoin type, never fires at runtime.
              name: row.teamNameZh ?? row.teamNameEn ?? "",
              abbrev: row.teamAbbrev,
              level: row.teamLevel,
              levelLabel: levelLabel(row.teamLevel) ?? "",
            }
          : null,
      statusSentence: buildStatusSentence({
        affiliation: row.affiliation,
        health: row.health,
        ilDetail: row.statusIlDetail,
        level,
      }),
      recentForm: row.recentForm ?? null,
    };
  });

  // 對外合約的執行期保證：回應形狀不符即早爆（spec-02 §8）。
  return z.array(PlayerSummarySchema).parse(summaries);
}
