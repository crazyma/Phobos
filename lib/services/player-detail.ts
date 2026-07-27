import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import {
  players,
  playerCurrentStatus,
  playerRecentForm,
  teams,
} from "../db/schema/index.ts";
import { handedness, playerLifecycle, teamLevel } from "../db/schema/enums.ts";
import { buildStatusSentence, levelLabel } from "./player-status.ts";
import { getPlayerSeasons, SeasonSchema } from "./player-seasons.ts";
import {
  getPlayerGameLog,
  getPlayerTimeline,
  GameLogSchema,
  TimelineSchema,
} from "./player-recent.ts";

/** Current team block, shared with the roster summary shape. */
const TeamSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    abbrev: z.string().nullable(),
    level: z.enum(teamLevel.enumValues),
    levelLabel: z.string(),
  })
  .nullable();

/**
 * The player individual page's contract (spec-02 §2.3 / §3). Grows by ticket:
 * ticket 01 is the base (bio + status + recent form); 02 adds `seasons`, 03
 * adds `gameLog`/`timeline`, 04 adds `upcoming`. Page and `/api/players/:id`
 * share this one shape; the Zod schema is both the type source and the
 * runtime response assertion.
 */
export const PlayerDetailSchema = z.object({
  playerId: z.number().int(),
  nameEn: z.string(),
  nameZh: z.string().nullable(),
  primaryPosition: z.string().nullable(),
  bats: z.enum(handedness.enumValues).nullable(),
  throws: z.enum(handedness.enumValues).nullable(),
  birthdate: z.string().nullable(),
  lifecycle: z.enum(playerLifecycle.enumValues),
  team: TeamSchema,
  /** 歸屬 × 健康 一句（spec-01 B.2）；無投影時為「狀態同步中」。 */
  statusSentence: z.string(),
  /** 近況一句話；ETL 尚未產出時為 null。 */
  recentForm: z.string().nullable(),
  /** 球季數據，自 2020 起、依球季分組（spec-02 §2.3；ticket 02）。 */
  seasons: z.array(SeasonSchema),
  /** 逐場成績（打/投分表，各 ≤10，最近優先；ticket 03）。 */
  gameLog: GameLogSchema,
  /** 異動時間軸，時間倒序（ticket 03）。 */
  timeline: TimelineSchema,
});

export type PlayerDetail = z.infer<typeof PlayerDetailSchema>;

/**
 * One player's detail, or null when the id isn't in the whitelist (→ 404).
 * LEFT JOINs the projected status / team / recent form (any may be absent
 * before the ETL fills them, and the page still renders). `db` is injectable
 * for tests.
 */
export async function getPlayerDetail(
  id: number,
  db = defaultDb,
): Promise<PlayerDetail | null> {
  const rows = await db
    .select({
      playerId: players.mlbPlayerId,
      nameEn: players.nameEn,
      nameZh: players.nameZh,
      primaryPosition: players.primaryPosition,
      bats: players.bats,
      throws: players.throws,
      birthdate: players.birthdate,
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
    .where(eq(players.mlbPlayerId, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [seasons, gameLog, timeline] = await Promise.all([
    getPlayerSeasons(id, db),
    getPlayerGameLog(id, db),
    getPlayerTimeline(id, db),
  ]);
  const level = row.statusLevel ?? row.teamLevel;
  const detail: PlayerDetail = {
    playerId: row.playerId,
    nameEn: row.nameEn,
    nameZh: row.nameZh,
    primaryPosition: row.primaryPosition,
    bats: row.bats,
    throws: row.throws,
    birthdate: row.birthdate,
    lifecycle: row.lifecycle,
    team:
      row.teamId !== null && row.teamLevel !== null
        ? {
            id: row.teamId,
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
    seasons,
    gameLog,
    timeline,
  };

  return PlayerDetailSchema.parse(detail);
}
