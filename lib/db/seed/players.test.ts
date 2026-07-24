import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../client.ts";
import { players } from "../schema/index.ts";
import { seedPlayers, taiwanesePlayers } from "./players.ts";

/**
 * Seed behaviour tests. The whitelist (taiwanesePlayers) is the source of truth
 * (spec-01 A.1); these assert it lands in `players` correctly and idempotently.
 * Runs against the real migrated DB (the seam, spec-00 §3).
 */

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await pool.end();
});

describe("players whitelist seed (ticket 03)", () => {
  it("seeds every whitelisted player with lifecycle=tracked", async () => {
    await seedPlayers();
    const rows = await db.select().from(players);

    expect(rows.length).toBe(taiwanesePlayers.length);
    for (const row of rows) {
      expect(row.lifecycle).toBe("tracked");
    }

    const lin = rows.find((r) => r.mlbPlayerId === 801179);
    expect(lin?.nameEn).toBe("Yu-Min Lin");
    expect(lin?.primaryPosition).toBe("P");
    expect(lin?.throws).toBe("L");
  });

  it("is idempotent — re-running keeps the same row count", async () => {
    await seedPlayers();
    await seedPlayers();
    const rows = await db.select().from(players);
    expect(rows.length).toBe(taiwanesePlayers.length);
  });
});
