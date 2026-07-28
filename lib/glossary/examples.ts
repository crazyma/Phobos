/**
 * Example-player backlink selection (spec-04 §E, F2-3 return trip). Pure and
 * table-testable; the DB loader (examples-db.ts) feeds it curated rows. Metric
 * terms pick 1–2 Taiwanese players who currently carry a graded value for the
 * metric; roster terms fall back to whoever most recently had that transaction.
 * No one qualifies → caller hides the whole block (never pad with non-TW).
 */
import { bandLabel, LEVEL_HEADERS } from "./bands.ts";
import { formatMetric, type MetricKey } from "./metrics.ts";
import { GRADED_LEVELS, type Frontmatter, type GradedLevel, type Perspective } from "./schema.ts";

/** Sample thresholds for a metric to be representative (spec-04 §E rule 2). */
export const MIN_BATTER_PA = 50;
export const MIN_PITCHER_IP_OUTS = 60; // 20 IP

const LEVEL_RANK: Record<GradedLevel, number> = { mlb: 0, aaa: 1, aa: 2 };

function isGraded(level: string): level is GradedLevel {
  return (GRADED_LEVELS as readonly string[]).includes(level);
}

export type MetricCandidate = {
  playerId: number;
  nameZh: string;
  lifecycle: "tracked" | "archived";
  perspective: Perspective;
  level: string;
  value: number | null;
  /** Sample size for the row: PA for a batter, ip_outs for a pitcher. */
  pa: number;
  ipOuts: number;
};

export type ExamplePick = {
  playerId: number;
  name: string;
  value: string;
  level: GradedLevel;
  levelHeader: string;
  bandLabel: string;
};

/** Pick up to `limit` example players for a metric term (spec-04 §E). */
export function selectMetricExamples(
  term: Frontmatter,
  candidates: MetricCandidate[],
  limit = 2,
): ExamplePick[] {
  const key = term.metric_keys[0] as MetricKey | undefined;
  if (!key || !term.bands) return [];

  const eligible = candidates.filter((c) => {
    if (c.lifecycle !== "tracked" || c.value === null) return false;
    if (!isGraded(c.level)) return false;
    if (!term.bands?.[c.perspective]) return false;
    return c.perspective === "batter" ? c.pa >= MIN_BATTER_PA : c.ipOuts >= MIN_PITCHER_IP_OUTS;
  });

  // Level priority first (spec-04 §E rule 3); then the more extreme value in
  // the metric's "good" direction, so the example reads as illustrative.
  const dir = term.higher_is_better ? -1 : 1;
  eligible.sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level as GradedLevel] - LEVEL_RANK[b.level as GradedLevel];
    if (byLevel !== 0) return byLevel;
    return (a.value! - b.value!) * dir;
  });

  const picks: ExamplePick[] = [];
  const seen = new Set<number>();
  for (const c of eligible) {
    if (seen.has(c.playerId)) continue;
    seen.add(c.playerId);
    const level = c.level as GradedLevel;
    const bands = term.bands[c.perspective]![level];
    picks.push({
      playerId: c.playerId,
      name: c.nameZh,
      value: formatMetric(key, c.value),
      level,
      levelHeader: LEVEL_HEADERS[level],
      bandLabel: bandLabel(bands, c.value!),
    });
    if (picks.length >= limit) break;
  }
  return picks;
}

export type RosterCandidate = {
  playerId: number;
  nameZh: string;
  lifecycle: "tracked" | "archived";
  /** Event date (YYYY-MM-DD); most recent first after selection. */
  date: string;
  typeLabel: string;
};

export type RosterPick = {
  playerId: number;
  name: string;
  date: string;
  typeLabel: string;
};

/**
 * Roster terms have no metric — link the players with the most recent matching
 * transaction instead (spec-04 §E). Caller pre-filters to the right event type.
 */
export function selectRosterExamples(
  candidates: RosterCandidate[],
  limit = 2,
): RosterPick[] {
  const picks: RosterPick[] = [];
  const seen = new Set<number>();
  for (const c of [...candidates].filter((c) => c.lifecycle === "tracked").sort((a, b) => b.date.localeCompare(a.date))) {
    if (seen.has(c.playerId)) continue;
    seen.add(c.playerId);
    picks.push({ playerId: c.playerId, name: c.nameZh, date: c.date, typeLabel: c.typeLabel });
    if (picks.length >= limit) break;
  }
  return picks;
}
