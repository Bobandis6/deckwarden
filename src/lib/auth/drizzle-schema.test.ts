/**
 * @vitest-environment node
 *
 * Better Auth validates the Drizzle schema it is handed (since 1.7.3, on by
 * default in every environment): a column the table requires but the library
 * never writes fails every request with SchemaMismatchError, because every
 * insert into that table would fail. S0 (2026-10-18) met exactly that on the
 * 1.7.2 → 1.7.10 move: `accounts.issuer`, the 1.7.0–1.7.2 identity column
 * (migration 0005, NOT NULL), which 1.7.3 stopped writing. Migration 0019
 * relaxed it and moved the unique constraint to (provider_id, account_id).
 *
 * Pinned against the library and the app's real schema, with no database:
 * the pg-proxy driver answers every statement with no rows and records it,
 * so the pass case also proves a request reached the driver through the
 * adapter. The control is the 0005 shape of `accounts`: the same request
 * must fail with the mismatch, or the check would prove nothing.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getTableColumns, sql } from "drizzle-orm";
import {
  getTableConfig,
  pgTable,
  type PgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as appSchema from "@/db/schema";

import { USER_ADDITIONAL_FIELDS } from "./user-fields";

const BASE = "http://localhost:3000";

/** The four tables auth.ts hands the adapter; `PgTable`, so a variant of one can stand in. */
type AuthTables = Record<"users" | "sessions" | "accounts" | "verifications", PgTable>;

const APP_TABLES: AuthTables = {
  users: appSchema.users,
  sessions: appSchema.sessions,
  accounts: appSchema.accounts,
  verifications: appSchema.verifications,
};

/** `accounts` as migration 0005 created it: the 1.7.0–1.7.2 identity column, required. */
const ACCOUNTS_0005 = pgTable(
  "accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appSchema.users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("accounts_issuer_account").on(t.issuer, t.accountId)],
);

/** The app's Better Auth configuration (src/lib/auth.ts) over a driver that never connects. */
function instance(tables: AuthTables, statements: string[]) {
  const db = drizzle(
    async (query) => {
      statements.push(query);
      return { rows: [] };
    },
    { schema: tables },
  );
  return betterAuth({
    baseURL: BASE,
    secret: "test-secret-test-secret-test-secret-0123",
    database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema: tables }),
    socialProviders: { discord: { clientId: "test-client", clientSecret: "test-client-secret" } },
    user: { additionalFields: USER_ADDITIONAL_FIELDS },
    advanced: { database: { generateId: "uuid" } },
    telemetry: { enabled: false },
    logger: { disabled: true },
  });
}

describe("the app's auth tables against Better Auth's schema validation", () => {
  it("pass the check, and a request reaches the driver through the adapter", async () => {
    const statements: string[] = [];
    const auth = instance(APP_TABLES, statements);
    await expect(auth.api.getSession({ headers: new Headers() })).resolves.toBeNull();
    // The OAuth callback looks its state up in `verifications` before anything else.
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/callback/discord?code=test-code&state=test-state`),
    );
    expect(res.status).toBe(302);
    expect(statements.some((s) => /from "verifications"/.test(s))).toBe(true);
  });

  it("the control: the 0005 shape of accounts fails every request with the mismatch", async () => {
    const statements: string[] = [];
    const auth = instance({ ...APP_TABLES, accounts: ACCOUNTS_0005 }, statements);
    const failure = auth.api.getSession({ headers: new Headers() });
    await expect(failure).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
    await expect(failure).rejects.toThrow(/accounts\.issuer/);
    await expect(failure).rejects.toThrow(/1\.7\.0 through 1\.7\.2/);
    expect(statements).toEqual([]);
  });
});

describe("accounts after migration 0019", () => {
  it("keeps issuer nullable and keys the identity on (provider_id, account_id)", () => {
    expect(getTableColumns(appSchema.accounts).issuer.notNull).toBe(false);
    const { uniqueConstraints } = getTableConfig(appSchema.accounts);
    expect(uniqueConstraints.map((c) => [c.name, c.columns.map((col) => col.name)])).toEqual([
      ["accounts_provider_account", ["provider_id", "account_id"]],
    ]);
  });

  it("is exactly the three statements eyeballed on 2026-10-18", () => {
    const migration = readFileSync("drizzle/0019_accounts_provider_key.sql", "utf8");
    expect(migration.split("--> statement-breakpoint").map((s) => s.trim())).toEqual([
      'ALTER TABLE "accounts" DROP CONSTRAINT "accounts_issuer_account";',
      'ALTER TABLE "accounts" ALTER COLUMN "issuer" DROP NOT NULL;',
      'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_account" UNIQUE("provider_id","account_id");',
    ]);
  });
});
