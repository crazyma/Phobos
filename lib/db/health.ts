import { sql } from "drizzle-orm";
import { db } from "./client.ts";

/**
 * Minimal connectivity check for the data-layer skeleton: proves the Drizzle
 * client can reach Postgres and round-trip a trivial query. Ticket 02 layers
 * the real curated schema on top of this same client.
 */
export async function checkDbConnection(): Promise<{ ok: boolean; one: number }> {
  const rows = await db.execute(sql`select 1 as one`);
  const one = Number((rows.rows[0] as { one: number }).one);
  return { ok: one === 1, one };
}
