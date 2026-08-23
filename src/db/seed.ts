/**
 * Idempotent seed: games + formats. Safe to re-run on every deploy/migrate.
 *   pnpm db:seed
 */
import { config as loadEnv } from "dotenv";

// Next.js convention: .env.local overrides .env (first file in the list wins).
loadEnv({ path: [".env.local", ".env"], quiet: true });

import { sql } from "drizzle-orm";

import { createDb } from "./index";
import { formats, games } from "./schema";
import { FORMATS, GAMES } from "./seed-data";

export async function seed(db: ReturnType<typeof createDb>["db"]) {
  await db
    .insert(games)
    .values(GAMES.map((g) => ({ ...g })))
    .onConflictDoUpdate({
      target: games.id,
      set: { code: sql`excluded.code`, name: sql`excluded.name` },
    });

  await db
    .insert(formats)
    .values(FORMATS.map((f) => ({ ...f })))
    .onConflictDoUpdate({
      target: formats.id,
      set: {
        gameId: sql`excluded.game_id`,
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        defaultLegality: sql`excluded.default_legality`,
      },
    });
}

async function main() {
  const { client, db } = createDb();
  try {
    await seed(db);
    console.log(`seeded ${GAMES.length} games, ${FORMATS.length} formats`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
