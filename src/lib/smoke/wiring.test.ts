// @vitest-environment node
/**
 * The smoke scripts are wired to the host guard and the shared session
 * minting (S9, SECURITY-AUDIT-report.md L19, I8). The pure decision is
 * tested in host-guard.test.ts; this pins the wiring that makes it count:
 * every `BASE_URL`-taking script imports `scripts/smoke/guard.ts` as its
 * first import and builds its URLs on the `BASE` it exports, nothing but the
 * guard reads `process.env.BASE_URL`, the six scripts that need a signed-in
 * user mint through `scripts/smoke/session.ts` and nothing else signs a
 * cookie or inserts a session row, every script that opens `DATABASE_URL`
 * for a local run calls the database guard (`scripts/smoke/db.ts`, LATER row
 * 295) right after its env load while the nightly's scripts do not, and
 * `.env.example` documents the switches.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPTS = join(ROOT, "scripts");
const read = (file: string) => readFileSync(join(SCRIPTS, file), "utf8");

/** The scripts in `scripts/`, `scripts/ingest/` and `scripts/smoke/` — never the gitignored `.tmp/`. */
const scriptFiles = (dir = ""): string[] =>
  readdirSync(join(SCRIPTS, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mts|mjs|js)$/.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort();
const topLevel = scriptFiles();
const everyScript = [...topLevel, ...scriptFiles("ingest"), ...scriptFiles("smoke")];

/** The sixteen `pnpm smoke:*` harnesses and `pnpm search:canned`. */
const GUARDED = [
  "account-delete-smoke.ts",
  "alternatives-smoke.ts",
  "autofill-smoke.ts",
  "canned-searches.ts",
  "collection-smoke.ts",
  "combos-smoke.ts",
  "deck-api-smoke.ts",
  "engagement-smoke.ts",
  "games-smoke.ts",
  "hubs-smoke.ts",
  "optcg-deck-smoke.ts",
  "optcg-smoke.ts",
  "profile-folders-smoke.ts",
  "recommend-smoke.ts",
  "seo-smoke.ts",
  "sets-smoke.ts",
  "versions-forks-smoke.ts",
];

/** The six that sign a user in. */
const MINTING = [
  "account-delete-smoke.ts",
  "collection-smoke.ts",
  "engagement-smoke.ts",
  "games-smoke.ts",
  "profile-folders-smoke.ts",
  "versions-forks-smoke.ts",
];

/**
 * Every top-level script that opens `DATABASE_URL` for a local run: the six
 * minting smokes, the four smokes that read fixtures from the database, and
 * `pnpm counters:reset`.
 */
const DB_GUARDED = [
  "account-delete-smoke.ts",
  "collection-smoke.ts",
  "combos-smoke.ts",
  "engagement-smoke.ts",
  "games-smoke.ts",
  "hubs-smoke.ts",
  "profile-folders-smoke.ts",
  "reset-dev-counters.ts",
  "seo-smoke.ts",
  "sets-smoke.ts",
  "versions-forks-smoke.ts",
];

/** The nightly's scripts: they run against production by design and never see the variable. */
const NIGHTLY = [
  "db-size.ts",
  "optcg-image-manifest.ts",
  "prune-backups.ts",
  "purge-anon-decks.ts",
  "ruleset-watch.ts",
];

const LOAD_ENV = 'loadEnv({ path: [".env.local", ".env"], quiet: true });';

const firstImport = (text: string) => text.split("\n").find((line) => line.startsWith("import "));

describe("the host guard wiring", () => {
  it("the seventeen BASE_URL-taking scripts import the guard first and build on its BASE", () => {
    expect(GUARDED).toHaveLength(17);
    for (const file of GUARDED) {
      const text = read(file);
      expect(firstImport(text), file).toMatch(/^import \{ BASE \} from "\.\/smoke\/guard";/);
      expect(text, file).toMatch(/`\$\{BASE\}/);
    }
  });

  it("exactly those seventeen import the guard, and they are the package.json smoke entries", () => {
    const guarded = topLevel.filter((file) => read(file).includes('from "./smoke/guard"'));
    expect(guarded).toEqual(GUARDED);
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const run = Object.entries(scripts)
      .filter(([name]) => name.startsWith("smoke:") || name === "search:canned")
      .map(([, command]) => command.replace(/^tsx scripts\//, ""))
      .sort();
    expect(run).toEqual(GUARDED);
  });

  it("nothing but the guard reads process.env.BASE_URL or the opt-in", () => {
    for (const file of everyScript) {
      if (file === "smoke/guard.ts") continue;
      const text = read(file);
      expect(text, file).not.toContain("process.env.BASE_URL");
      // the database guard reads the same opt-in, after the env load (LATER row 295)
      if (file !== "smoke/db.ts") {
        expect(text, file).not.toContain("process.env.SMOKE_ALLOW_REMOTE");
      }
    }
    const guard = read("smoke/guard.ts");
    expect(guard).toContain(
      "checkSmokeTarget(process.env.BASE_URL, process.env.SMOKE_ALLOW_REMOTE)",
    );
    expect(guard).toContain('from "../../src/lib/smoke/host-guard"');
    expect(guard).toContain("process.exit(1)");
    expect(guard).toMatch(/^export const BASE: string = target\.base;$/m);
  });
});

describe("the shared session minting", () => {
  it("the six scripts that sign a user in mint through session.ts, and no other script does", () => {
    const minting = topLevel.filter((file) => read(file).includes('from "./smoke/session"'));
    expect(minting).toEqual(MINTING);
    for (const file of MINTING) {
      expect(read(file), file).toMatch(
        /mintSession\(sql, \{ label: "[A-Za-z0-9]+", tag, run, userIds: cleanup\.userIds \}\)/,
      );
    }
  });

  it("no script carries its own copy: the secret, the HMAC, the cookie name and the session insert live in one place", () => {
    for (const file of everyScript) {
      if (file === "smoke/session.ts") continue;
      const text = read(file);
      expect(text, file).not.toContain("BETTER_AUTH_SECRET");
      expect(text, file).not.toContain("createHmac");
      expect(text, file).not.toMatch(/insert into sessions/);
      // sentry-probe.ts sends the cookie NAME with a marker value to prove Sentry drops it (S2); it mints nothing.
      if (file !== "sentry-probe.ts") expect(text, file).not.toContain("session_token");
    }
  });

  it("session.ts imports the guard first, reads the secret inside the call and never prints", () => {
    const text = read("smoke/session.ts");
    expect(firstImport(text)).toBe('import "./guard";');
    expect(text).toContain('from "../../src/lib/smoke/session-cookie"');
    expect(text).not.toContain("console.");
    expect(text).not.toContain("process.exit");
    // the secret is read by a function, not at module level (module level runs before dotenv)
    const moduleLevel = text
      .split("\n")
      .filter((line) => !line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("*"));
    expect(moduleLevel.join("\n")).not.toContain("process.env");
    expect(text).toContain("const secret = smokeSecret();");
    // the user id reaches the cleanup list before the session row is written
    expect(text.indexOf("opts.userIds.push(id)")).toBeLessThan(
      text.indexOf("insert into sessions"),
    );
  });
});

describe("the database guard wiring", () => {
  it("every top-level script that reads DATABASE_URL, the nightly's aside, calls the guard right after its env load", () => {
    const opening = topLevel.filter((file) => read(file).includes("process.env.DATABASE_URL"));
    expect(opening.filter((file) => !NIGHTLY.includes(file))).toEqual(DB_GUARDED);
    for (const file of DB_GUARDED) {
      const text = read(file);
      expect(text, file).toContain('import { guardDatabaseUrl } from "./smoke/db";');
      expect(text, file).toContain(`${LOAD_ENV}\nguardDatabaseUrl();`);
      // one env load, one call, and the call before the first database open
      expect(text.split(LOAD_ENV), file).toHaveLength(2);
      expect(text.split("guardDatabaseUrl();"), file).toHaveLength(2);
      const open = text.search(/\b(postgres|createDb)\(/);
      expect(open, file).toBeGreaterThan(-1);
      expect(text.indexOf("guardDatabaseUrl();"), file).toBeLessThan(open);
    }
  });

  it("the nightly's scripts are the ones its workflow runs, and neither they nor the ingest scripts call it", () => {
    const nightly = readFileSync(join(ROOT, ".github/workflows/nightly-ingest.yml"), "utf8");
    const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const file of NIGHTLY) {
      const entry = Object.entries(scripts).find(
        ([, command]) => command === `tsx scripts/${file}`,
      );
      expect(entry, file).toBeDefined();
      expect(nightly, file).toContain(`pnpm ${entry?.[0]}`);
    }
    for (const file of [...NIGHTLY, ...scriptFiles("ingest")]) {
      expect(read(file), file).not.toContain("guardDatabaseUrl");
    }
    const importing = topLevel.filter((file) => read(file).includes('from "./smoke/db"'));
    expect(importing).toEqual(DB_GUARDED);
  });

  it("session.ts calls the guard inside mintSession, before its first insert", () => {
    const text = read("smoke/session.ts");
    expect(text).toContain('import { guardDatabaseUrl } from "./db";');
    const call = text.indexOf("guardDatabaseUrl();");
    expect(call).toBeGreaterThan(text.indexOf("export async function mintSession"));
    expect(call).toBeLessThan(text.indexOf("insert into users"));
  });

  it("nothing but db.ts reads PRODUCTION_DB_ENDPOINT, and db.ts reads the three variables inside the call", () => {
    for (const file of everyScript) {
      if (file === "smoke/db.ts") continue;
      expect(read(file), file).not.toContain("process.env.PRODUCTION_DB_ENDPOINT");
    }
    const db = read("smoke/db.ts");
    expect(db).toContain('from "../../src/lib/smoke/db-guard"');
    expect(db).toContain("process.exit(1)");
    expect(db).toMatch(
      /checkSmokeDatabase\(\s*process\.env\.DATABASE_URL,\s*process\.env\.PRODUCTION_DB_ENDPOINT,\s*process\.env\.SMOKE_ALLOW_REMOTE,?\s*\)/,
    );
    expect(db).not.toContain("process.env.BASE_URL");
    const moduleLevel = db
      .split("\n")
      .filter((line) => !line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("*"));
    expect(moduleLevel.join("\n")).not.toContain("process.env");
  });
});

describe("the documented switches", () => {
  const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");

  it(".env.example names the development branch as the local default and the two smoke switches", () => {
    expect(envExample).toMatch(/development branch/i);
    expect(envExample).toMatch(/^# BASE_URL="http:\/\/localhost:3000"$/m);
    expect(envExample).toMatch(/^# SMOKE_ALLOW_REMOTE=1$/m);
  });

  it(".env.example documents the production endpoint id beside the connection string", () => {
    expect(envExample).toMatch(/^# PRODUCTION_DB_ENDPOINT="ep-xxx"$/m);
    expect(envExample).toMatch(/first label of its host up to `-pooler`/);
    expect(envExample.indexOf("PRODUCTION_DB_ENDPOINT")).toBeLessThan(
      envExample.indexOf("# Sentry"),
    );
  });
});
