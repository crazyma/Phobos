import "dotenv/config";
import { pool } from "../../lib/db/client.ts";
import { seedPlayers } from "../../lib/db/seed/players.ts";

/** CLI: 灌台灣球員白名單進 `players`（幂等）。 */
async function main() {
  const count = await seedPlayers();
  await pool.end();
  console.log(`Seeded ${count} whitelisted players.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
