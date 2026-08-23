import { config as loadEnv } from "dotenv";

// Next.js convention: .env.local overrides .env (first file in the list wins).
loadEnv({ path: [".env.local", ".env"], quiet: true });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
