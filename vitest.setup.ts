import { config } from "dotenv";

// Tests must never connect to the development database.  This runs before
// test modules import lib/db/client.ts, which reads DATABASE_URL eagerly.
config({ path: ".env.test", override: true });
