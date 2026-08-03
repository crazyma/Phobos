import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../db/client.ts";
import { syncRuns } from "../db/schema/index.ts";
import { getLastSyncedAt } from "./sync.ts";

// Fixed timestamps so ordering is deterministic and assertions are exact. Each
// test starts from an empty sync_runs so the "latest" is unambiguous. vitest
// loads .env.test before this module, so this is an isolated test database.
const T1 = new Date("2026-07-27T01:00:00Z");
const T2 = new Date("2026-07-27T02:00:00Z");
const T3 = new Date("2026-07-27T03:00:00Z");

beforeEach(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.delete(syncRuns);
});

afterAll(async () => {
  await db.delete(syncRuns);
  await pool.end();
});

describe("getLastSyncedAt", () => {
  it("returns null when no run has ever finished", async () => {
    expect(await getLastSyncedAt()).toBeNull();
  });

  it("returns the latest finished_at among non-failed runs", async () => {
    await db.insert(syncRuns).values([
      { kind: "morning", startedAt: T1, finishedAt: T1, status: "success" },
      { kind: "evening", startedAt: T2, finishedAt: T2, status: "partial" },
    ]);

    expect(await getLastSyncedAt()).toEqual(T2);
  });

  it("ignores failed runs even if they finished more recently", async () => {
    await db.insert(syncRuns).values([
      { kind: "morning", startedAt: T2, finishedAt: T2, status: "success" },
      { kind: "evening", startedAt: T3, finishedAt: T3, status: "failed" },
    ]);

    // The newer, failed run must not advance the stamp past the success run.
    expect(await getLastSyncedAt()).toEqual(T2);
  });

  it("ignores open runs whose finished_at is still null", async () => {
    await db.insert(syncRuns).values([
      { kind: "morning", startedAt: T1, finishedAt: T1, status: "success" },
      // in-progress / crashed run: opened pessimistically as failed, not closed
      { kind: "manual", startedAt: T3, finishedAt: null, status: "failed" },
    ]);

    expect(await getLastSyncedAt()).toEqual(T1);
  });
});
