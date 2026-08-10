import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "../client.ts";

/**
 * Curated-schema invariant tests. Assertions come from spec-01 §C (the source of
 * truth), not from re-reading the Drizzle schema — so they can genuinely disagree
 * with the code. Runs against the real migrated DB (the main seam, spec-00 §3).
 */

async function primaryKeyColumns(table: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = ${table}::regclass AND i.indisprimary
    ORDER BY array_position(i.indkey, a.attnum)
  `);
  return rows.rows.map((r) => (r as { col: string }).col);
}

async function columnNames(table: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT column_name AS col
    FROM information_schema.columns
    WHERE table_name = ${table}
  `);
  return rows.rows.map((r) => (r as { col: string }).col);
}

async function enumValues(typeName: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = ${typeName}
    ORDER BY e.enumsortorder
  `);
  return rows.rows.map((r) => (r as { label: string }).label);
}

async function foreignKeyTargets(table: string): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT confrelid::regclass::text AS ref
    FROM pg_constraint
    WHERE conrelid = ${table}::regclass AND contype = 'f'
  `);
  return rows.rows.map((r) => (r as { ref: string }).ref);
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await pool.end();
});

describe("curated schema (spec-01 §C)", () => {
  it("season stats key on (player, season, level, team) — spec C.7", async () => {
    expect(await primaryKeyColumns("season_batting_stats")).toEqual([
      "player_id",
      "season",
      "level",
      "team_id",
    ]);
    expect(await primaryKeyColumns("season_pitching_stats")).toEqual([
      "player_id",
      "season",
      "level",
      "team_id",
    ]);
  });

  it("game lines key on (player, game) — spec C.6", async () => {
    expect(await primaryKeyColumns("game_batting_lines")).toEqual(["player_id", "game_pk"]);
    expect(await primaryKeyColumns("game_pitching_lines")).toEqual(["player_id", "game_pk"]);
  });

  it("transaction_events references players — spec C.3", async () => {
    expect(await foreignKeyTargets("transaction_events")).toContain("players");
  });

  it("team_level enum carries the spec values — spec C.2", async () => {
    expect(await enumValues("team_level")).toEqual(["mlb", "aaa", "aa", "a_plus", "a", "rookie"]);
  });

  it("transaction_type enum carries the spec values — spec C.3", async () => {
    expect(await enumValues("transaction_type")).toEqual([
      "sign",
      "call_up",
      "send_down",
      "trade",
      "waiver_claim",
      "dfa",
      "release",
      "declare_fa",
      "assign",
      "il_on",
      "il_off",
      "activate",
      "depart",
      "other",
    ]);
  });

  it("stores no derivable ratio columns — spec §C convention", async () => {
    const batting = await columnNames("season_batting_stats");
    for (const forbidden of ["avg", "obp", "slg", "ops", "iso", "babip"]) {
      expect(batting).not.toContain(forbidden);
    }
    const pitching = await columnNames("season_pitching_stats");
    for (const forbidden of ["era", "whip", "hr9", "k_pct", "bb_pct"]) {
      expect(pitching).not.toContain(forbidden);
    }
  });
});
