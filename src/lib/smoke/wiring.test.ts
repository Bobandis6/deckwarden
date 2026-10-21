// @vitest-environment node
/**
 * The smoke scripts are wired to the host guard and the shared session
 * minting (S9, SECURITY-AUDIT-report.md L19, I8). The pure decision is
 * tested in host-guard.test.ts; this pins the wiring that makes it count:
 * every `BASE_URL`-taking script imports `scripts/smoke/guard.ts` as its
 * first import and builds its URLs on the `BASE` it exports, nothing but the
 * guard reads `process.env.BASE_URL`, the six scripts that need a signed-in
 * user mint through `scripts/smoke/session.ts` and nothing else signs a
 * cookie or inserts a session row, and `.env.example` documents the switches.
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
      expect(text, file).not.toContain("process.env.SMOKE_ALLOW_REMOTE");
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

describe("the documented switches", () => {
  const envExample = readFileSync(join(ROOT, ".env.example"), "utf8");

  it(".env.example names the development branch as the local default and the two smoke switches", () => {
    expect(envExample).toMatch(/development branch/i);
    expect(envExample).toMatch(/^# BASE_URL="http:\/\/localhost:3000"$/m);
    expect(envExample).toMatch(/^# SMOKE_ALLOW_REMOTE=1$/m);
  });
});
