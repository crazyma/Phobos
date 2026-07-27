import { and, desc, isNotNull, ne } from "drizzle-orm";
import { db as defaultDb } from "../db/client.ts";
import { syncRuns } from "../db/schema/index.ts";

/**
 * The freshness stamp shown in the footer (spec-01 C.9 / spec-03 §7).
 *
 * Reads the most recent **non-failed** run that actually finished: a `failed`
 * run (or one still open, `finished_at IS NULL`) never advances the stamp, so a
 * crashed or aborted batch can't make stale data look fresh. Returns null when
 * the ETL has never completed a run — the footer then renders its placeholder.
 * `db` is injectable so tests can drive it against a seeded fixture.
 */
export async function getLastSyncedAt(db = defaultDb): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(ne(syncRuns.status, "failed"), isNotNull(syncRuns.finishedAt)))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  return row?.finishedAt ?? null;
}
