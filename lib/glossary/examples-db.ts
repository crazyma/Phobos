/**
 * DB side of the example-player backlinks (spec-04 §E): fetch this season's
 * curated candidate rows for a metric term and hand them to the pure selector.
 * "This season" = the latest season present in the data. Server-only.
 */
import { and, eq, inArray, max } from "drizzle-orm";
import { db as defaultDb } from "../db/client.ts";
import { players, seasonBattingStats, seasonPitchingStats } from "../db/schema/index.ts";
import { deriveBatting, derivePitching } from "../services/stats.ts";
import { selectMetricExamples, type ExamplePick, type MetricCandidate } from "./examples.ts";
import { metricValue, type MetricKey } from "./metrics.ts";
import { GRADED_LEVELS, type Frontmatter } from "./schema.ts";

// Mutable copy for drizzle's inArray (it wants the enum union, not readonly).
const GRADED = [...GRADED_LEVELS];

/** Latest season across both stat tables (the "current" season for examples). */
async function currentSeason(db: typeof defaultDb): Promise<number | null> {
  const [b] = await db.select({ s: max(seasonBattingStats.season) }).from(seasonBattingStats);
  const [p] = await db.select({ s: max(seasonPitchingStats.season) }).from(seasonPitchingStats);
  const seasons = [b?.s, p?.s].filter((s): s is number => typeof s === "number");
  return seasons.length ? Math.max(...seasons) : null;
}

/**
 * Keep one row per player×level — their primary team (max sample). Stored
 * advanced (wOBA/WAR/…) can't aggregate, so a single representative row keeps
 * them meaningful.
 */
function primaryRows<T extends { playerId: number; level: string }>(
  rows: T[],
  sample: (r: T) => number,
): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.playerId}:${r.level}`;
    const cur = best.get(k);
    if (!cur || sample(r) > sample(cur)) best.set(k, r);
  }
  return [...best.values()];
}

export async function getMetricExamples(
  term: Frontmatter,
  db = defaultDb,
): Promise<ExamplePick[]> {
  const key = term.metric_keys[0] as MetricKey | undefined;
  if (!key) return [];
  const season = await currentSeason(db);
  if (season === null) return [];

  const candidates: MetricCandidate[] = [];

  if (term.applies_to.includes("batter")) {
    const b = seasonBattingStats;
    const rows = await db
      .select({
        playerId: b.playerId, level: b.level, nameZh: players.nameZh, nameEn: players.nameEn,
        lifecycle: players.lifecycle,
        g: b.g, pa: b.pa, ab: b.ab, h: b.h, doubles: b.doubles, triples: b.triples, hr: b.hr,
        rbi: b.rbi, r: b.r, sb: b.sb, cs: b.cs, bb: b.bb, so: b.so, hbp: b.hbp, sf: b.sf,
        woba: b.woba, wrcPlus: b.wrcPlus, war: b.war,
      })
      .from(b)
      .innerJoin(players, eq(players.mlbPlayerId, b.playerId))
      .where(and(eq(b.season, season), inArray(b.level, GRADED)));

    for (const r of primaryRows(rows, (x) => x.pa)) {
      const line = { ...r, ...deriveBatting(r) };
      candidates.push({
        playerId: r.playerId, nameZh: r.nameZh ?? r.nameEn, lifecycle: r.lifecycle,
        perspective: "batter", level: r.level, value: metricValue(line, key),
        pa: r.pa, ipOuts: 0,
      });
    }
  }

  if (term.applies_to.includes("pitcher")) {
    const p = seasonPitchingStats;
    const rows = await db
      .select({
        playerId: p.playerId, level: p.level, nameZh: players.nameZh, nameEn: players.nameEn,
        lifecycle: players.lifecycle,
        g: p.g, gs: p.gs, ipOuts: p.ipOuts, bf: p.bf, h: p.h, r: p.r, er: p.er, hr: p.hr,
        bb: p.bb, so: p.so, w: p.w, l: p.l, sv: p.sv, hld: p.hld,
        fip: p.fip, lobPct: p.lobPct, war: p.war,
      })
      .from(p)
      .innerJoin(players, eq(players.mlbPlayerId, p.playerId))
      .where(and(eq(p.season, season), inArray(p.level, GRADED)));

    for (const r of primaryRows(rows, (x) => x.ipOuts)) {
      const line = { ...r, ...derivePitching(r) };
      candidates.push({
        playerId: r.playerId, nameZh: r.nameZh ?? r.nameEn, lifecycle: r.lifecycle,
        perspective: "pitcher", level: r.level, value: metricValue(line, key),
        pa: 0, ipOuts: r.ipOuts,
      });
    }
  }

  return selectMetricExamples(term, candidates);
}
