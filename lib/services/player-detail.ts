import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
import { getPlayerUpcoming, UpcomingSchema } from "./player-upcoming.ts";
import { loadTeamMap, teamDisplayName } from "./team-map.ts";

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
  /** 出賽預告 + 下一系列賽（ticket 04）；無現隊時為 null。 */
  upcoming: UpcomingSchema,
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
  // 小聯盟顯示名要用母隊中文名推導（spec-01 C.2）。
  const parentTeams = alias(teams, "parent_teams");
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
      parentNameZh: parentTeams.nameZh,
      recentForm: playerRecentForm.sentenceZh,
    })
    .from(players)
    .leftJoin(playerCurrentStatus, eq(playerCurrentStatus.playerId, players.mlbPlayerId))
    .leftJoin(teams, eq(teams.mlbTeamId, playerCurrentStatus.teamId))
    .leftJoin(parentTeams, eq(parentTeams.mlbTeamId, teams.parentOrgTeamId))
    .leftJoin(playerRecentForm, eq(playerRecentForm.playerId, players.mlbPlayerId))
    .where(eq(players.mlbPlayerId, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Load the team map once and share it with the game-log + upcoming resolvers
  // instead of each scanning the (small) teams table on its own.
  const teamMap = await loadTeamMap(db);
  const [seasons, gameLog, timeline, upcoming] = await Promise.all([
    getPlayerSeasons(id, db),
    getPlayerGameLog(id, db, undefined, teamMap),
    getPlayerTimeline(id, db),
    getPlayerUpcoming(id, db, undefined, teamMap),
  ]);
  const level = row.statusLevel ?? row.teamLevel;
  // Archived players have no projected status row; surface「已離開美職」rather
  // than the empty-state「狀態同步中」so the hero matches the archived banner.
  const affiliation =
    row.affiliation ?? (row.lifecycle === "archived" ? "departed" : row.affiliation);
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
            // hero 自己印 levelLabel 徽章（player-hero.tsx），隊名不重複帶層級。
            name: teamDisplayName(
              {
                nameZh: row.teamNameZh,
                nameEn: row.teamNameEn ?? "",
                level: row.teamLevel,
                parentNameZh: row.parentNameZh,
              },
              { withLevel: false },
            ),
            abbrev: row.teamAbbrev,
            level: row.teamLevel,
            levelLabel: levelLabel(row.teamLevel) ?? "",
          }
        : null,
    statusSentence: buildStatusSentence({
      affiliation,
      health: row.health,
      ilDetail: row.statusIlDetail,
      level,
    }),
    recentForm: row.recentForm ?? null,
    seasons,
    gameLog,
    timeline,
    upcoming,
  };

  return PlayerDetailSchema.parse(detail);
}
