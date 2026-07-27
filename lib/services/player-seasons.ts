import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "../db/client.ts";
import {
  seasonBattingStats,
  seasonPitchingStats,
  teams,
} from "../db/schema/index.ts";
import { teamLevel } from "../db/schema/enums.ts";
import { levelLabel } from "./player-status.ts";
import {
  deriveBatting,
  derivePitching,
  sumBatting,
  sumPitching,
  type BattingCounting,
  type PitchingCounting,
} from "./stats.ts";

// Highest → lowest; also the display order within a season.
const LEVEL_ORDER = teamLevel.enumValues;
// "低階（1A 以下）" gets the advisory note (spec-02 §2.3).
const LOW_LEVELS = new Set<string>(["a", "rookie"]);

const TeamRefSchema = z
  .object({ id: z.number().int(), name: z.string(), abbrev: z.string().nullable() })
  .nullable();

const battingCounting = {
  g: z.number().int(), pa: z.number().int(), ab: z.number().int(), h: z.number().int(),
  doubles: z.number().int(), triples: z.number().int(), hr: z.number().int(),
  rbi: z.number().int(), r: z.number().int(), sb: z.number().int(), cs: z.number().int(),
  bb: z.number().int(), so: z.number().int(), hbp: z.number().int(), sf: z.number().int(),
};
const battingRates = {
  avg: z.number().nullable(), obp: z.number().nullable(), slg: z.number().nullable(),
  ops: z.number().nullable(), iso: z.number().nullable(), bbPct: z.number().nullable(),
  kPct: z.number().nullable(), babip: z.number().nullable(),
};
const BattingLineSchema = z.object({ team: TeamRefSchema, ...battingCounting, ...battingRates });

const pitchingCounting = {
  g: z.number().int(), gs: z.number().int(), ipOuts: z.number().int(), bf: z.number().int(),
  h: z.number().int(), r: z.number().int(), er: z.number().int(), hr: z.number().int(),
  bb: z.number().int(), so: z.number().int(), w: z.number().int(), l: z.number().int(),
  sv: z.number().int(), hld: z.number().int(),
};
const pitchingRates = {
  era: z.number().nullable(), whip: z.number().nullable(), hr9: z.number().nullable(),
  k9: z.number().nullable(), bb9: z.number().nullable(), kPct: z.number().nullable(),
  bbPct: z.number().nullable(),
};
const PitchingLineSchema = z.object({ team: TeamRefSchema, ...pitchingCounting, ...pitchingRates });

const LevelGroupSchema = <T extends z.ZodTypeAny>(line: T) =>
  z.object({
    level: z.enum(teamLevel.enumValues),
    levelLabel: z.string(),
    isLowLevel: z.boolean(),
    rows: z.array(line),
    // Recomputed aggregate across teams in this level; null when a single team.
    total: line.nullable(),
  });

export const SeasonSchema = z.object({
  season: z.number().int(),
  batting: z.array(LevelGroupSchema(BattingLineSchema)),
  pitching: z.array(LevelGroupSchema(PitchingLineSchema)),
});
export type Season = z.infer<typeof SeasonSchema>;

type Team = { id: number; name: string; abbrev: string | null };
type BattingDbRow = BattingCounting & { season: number; level: string; team: Team | null };
type PitchingDbRow = PitchingCounting & { season: number; level: string; team: Team | null };

function battingLine(c: BattingCounting, team: Team | null) {
  return { team, ...c, ...deriveBatting(c) };
}
function pitchingLine(c: PitchingCounting, team: Team | null) {
  return { team, ...c, ...derivePitching(c) };
}

/**
 * Group rows into ordered {level → per-team rows + recomputed total}. The total
 * is present only when a level spans >1 team (else it'd duplicate the row); it
 * is derived from *summed counting*, never averaged rates (spec-01 C.7).
 */
function groupLevels<C, L>(
  rows: Array<{ level: string; team: Team | null } & C>,
  line: (c: C, team: Team | null) => L,
  sum: (rows: C[]) => C,
) {
  const byLevel = new Map<string, Array<{ team: Team | null } & C>>();
  for (const row of rows) {
    if (!byLevel.has(row.level)) byLevel.set(row.level, []);
    byLevel.get(row.level)!.push(row);
  }
  return LEVEL_ORDER.filter((lv) => byLevel.has(lv)).map((level) => {
    const teamRows = byLevel.get(level)!;
    return {
      level,
      levelLabel: levelLabel(level as (typeof LEVEL_ORDER)[number]) ?? level,
      isLowLevel: LOW_LEVELS.has(level),
      rows: teamRows.map((r) => line(r as unknown as C, r.team)),
      total: teamRows.length > 1 ? line(sum(teamRows as unknown as C[]), null) : null,
    };
  });
}

/** Pure: assemble season groups (desc) from batting + pitching rows. */
export function buildSeasons(
  batting: BattingDbRow[],
  pitching: PitchingDbRow[],
): Season[] {
  const seasons = [...new Set([...batting, ...pitching].map((r) => r.season))].sort(
    (a, b) => b - a,
  );
  return seasons.map((season) => ({
    season,
    batting: groupLevels(
      batting.filter((r) => r.season === season),
      battingLine,
      sumBatting,
    ),
    pitching: groupLevels(
      pitching.filter((r) => r.season === season),
      pitchingLine,
      sumPitching,
    ),
  }));
}

function teamOf(id: number | null, nameZh: string | null, nameEn: string | null, abbrev: string | null): Team | null {
  return id !== null ? { id, name: nameZh ?? nameEn ?? "", abbrev } : null;
}

/** Load a player's season stats (2020+, per season × level × team) grouped. */
export async function getPlayerSeasons(id: number, db = defaultDb): Promise<Season[]> {
  const b = seasonBattingStats;
  const p = seasonPitchingStats;

  const battingRows = await db
    .select({
      season: b.season, level: b.level,
      teamId: b.teamId, teamNameEn: teams.nameEn, teamNameZh: teams.nameZh, teamAbbrev: teams.abbrev,
      g: b.g, pa: b.pa, ab: b.ab, h: b.h, doubles: b.doubles, triples: b.triples, hr: b.hr,
      rbi: b.rbi, r: b.r, sb: b.sb, cs: b.cs, bb: b.bb, so: b.so, hbp: b.hbp, sf: b.sf,
    })
    .from(b)
    .leftJoin(teams, eq(teams.mlbTeamId, b.teamId))
    .where(eq(b.playerId, id))
    .orderBy(desc(b.season));

  const pitchingRows = await db
    .select({
      season: p.season, level: p.level,
      teamId: p.teamId, teamNameEn: teams.nameEn, teamNameZh: teams.nameZh, teamAbbrev: teams.abbrev,
      g: p.g, gs: p.gs, ipOuts: p.ipOuts, bf: p.bf, h: p.h, r: p.r, er: p.er, hr: p.hr,
      bb: p.bb, so: p.so, w: p.w, l: p.l, sv: p.sv, hld: p.hld,
    })
    .from(p)
    .leftJoin(teams, eq(teams.mlbTeamId, p.teamId))
    .where(eq(p.playerId, id))
    .orderBy(desc(p.season));

  const batting: BattingDbRow[] = battingRows.map(({ teamId, teamNameEn, teamNameZh, teamAbbrev, ...c }) => ({
    ...c,
    team: teamOf(teamId, teamNameZh, teamNameEn, teamAbbrev),
  }));
  const pitching: PitchingDbRow[] = pitchingRows.map(({ teamId, teamNameEn, teamNameZh, teamAbbrev, ...c }) => ({
    ...c,
    team: teamOf(teamId, teamNameZh, teamNameEn, teamAbbrev),
  }));

  return z.array(SeasonSchema).parse(buildSeasons(batting, pitching));
}
