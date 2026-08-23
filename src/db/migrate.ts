/**
 * Apply pending SQL migrations from ./drizzle, then seed reference rows.
 *   pnpm db:migrate
 * Uses drizzle's migrator (tracks applied files in `drizzle.__drizzle_migrations`),
 * so it is safe against a fresh DB and a no-op when up to date.
 */
import { config as loadEnv } from "dotenv";

// Next.js convention: .env.local overrides .env (first file in the list wins).
loadEnv({ path: [".env.local", ".env"], quiet: true });

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDb } from "./index";
import { seed } from "./seed";

async function main() {
  const { client, db } = createDb();
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await seed(db);
    console.log("migrations applied, seeds present");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
