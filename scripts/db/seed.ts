import "dotenv/config";
import { pool } from "../../lib/db/client.ts";
import { seedPlayers } from "../../lib/db/seed/players.ts";
import { MLB_TEAM_NAMES_ZH, seedTeamNamesZh } from "../../lib/db/seed/teams.ts";

/** CLI: 灌台灣球員白名單進 `players`、球隊中文名進 `teams`（皆幂等）。 */
async function main() {
  const count = await seedPlayers();
  const teamsUpdated = await seedTeamNamesZh();
  await pool.end();

  console.log(`Seeded ${count} whitelisted players.`);
  console.log(`Named ${teamsUpdated}/${MLB_TEAM_NAMES_ZH.length} MLB teams in Chinese.`);
  if (teamsUpdated < MLB_TEAM_NAMES_ZH.length) {
    // Only updates existing rows — the team rows themselves come from the ETL.
    // Say so loudly: a silent 0 here would leave the site in English.
    console.warn(
      "⚠️  部分球隊列還不存在，中文名未寫入。球隊列由 ETL 建立，" +
        "請先跑一次批次（`cd etl && uv run python -m etl.sync evening`）再重跑 seed。",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
