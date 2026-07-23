import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Applies all generated migrations under ./drizzle to the DATABASE_URL target.
 * Safe on a fresh database (a zero-migration run is a no-op).
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();

  console.log("Migrations applied cleanly.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
