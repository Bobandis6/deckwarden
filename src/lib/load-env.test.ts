// @vitest-environment node
/**
 * The scripts' shared env load (`src/lib/load-env.ts`, LATER row 293): the
 * precedence dotenv gave — the environment over `.env.local` over `.env`, a
 * missing file skipped — kept on Node's own parser, and the `dotenv` package
 * gone from every entry point and from package.json, so nothing loads the
 * files a second way.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ENV_FILES, loadEnv } from "./load-env";

const VARS = ["DW_LOAD_ENV_SHELL", "DW_LOAD_ENV_LOCAL", "DW_LOAD_ENV_BASE", "DW_LOAD_ENV_EMPTY"];

describe("loadEnv", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dw-load-env-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const name of VARS) delete process.env[name];
  });

  it("reads .env.local, then .env — the two files, highest precedence first", () => {
    expect(ENV_FILES).toEqual([".env.local", ".env"]);
  });

  it("lets .env.local win over .env and never overwrites the environment", () => {
    writeFileSync(join(dir, ".env.local"), 'DW_LOAD_ENV_SHELL=local\nDW_LOAD_ENV_LOCAL="local"\n');
    writeFileSync(
      join(dir, ".env"),
      "DW_LOAD_ENV_SHELL=base\nDW_LOAD_ENV_LOCAL=base\nDW_LOAD_ENV_BASE=base\n",
    );
    process.env.DW_LOAD_ENV_SHELL = "shell";

    loadEnv(dir);

    expect(process.env.DW_LOAD_ENV_SHELL).toBe("shell");
    expect(process.env.DW_LOAD_ENV_LOCAL).toBe("local");
    expect(process.env.DW_LOAD_ENV_BASE).toBe("base");
  });

  it("keeps a variable the environment set to the empty string", () => {
    writeFileSync(join(dir, ".env.local"), "DW_LOAD_ENV_EMPTY=from-file\n");
    process.env.DW_LOAD_ENV_EMPTY = "";

    loadEnv(dir);

    expect(process.env.DW_LOAD_ENV_EMPTY).toBe("");
  });

  it("skips a missing file, as the nightly runs with neither", () => {
    expect(() => loadEnv(dir)).not.toThrow();

    writeFileSync(join(dir, ".env"), "DW_LOAD_ENV_BASE=base\n");
    loadEnv(dir);
    expect(process.env.DW_LOAD_ENV_BASE).toBe("base");
  });
});

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** The TypeScript the repository runs: src, scripts (never the gitignored .tmp/) and the root configs. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir)).sort()) {
      const path = join(dir, name);
      if (statSync(join(ROOT, path)).isDirectory()) {
        if (path !== join("scripts", ".tmp")) walk(path);
      } else if ([".ts", ".tsx", ".mts", ".mjs"].includes(extname(name))) out.push(path);
    }
  };
  walk("src");
  walk("scripts");
  for (const name of readdirSync(ROOT).sort()) {
    if ([".ts", ".mts", ".mjs"].includes(extname(name)) && statSync(join(ROOT, name)).isFile()) {
      out.push(name);
    }
  }
  return out;
}

/** The statement, on a line of its own — the comments that name `loadEnv()` don't count. */
const CALL = /^\s*loadEnv\(\);$/gm;
const DOTENV_IMPORT = /from\s+["']dotenv(?:\/[\w-]+)?["']|(?:import|require)\(\s*["']dotenv/;

describe("the entry points (LATER row 293)", () => {
  const files = sources();
  const loading = files.filter((file) => (read(file).match(CALL) ?? []).length > 0);

  it("are walked (a pin that checks nothing would pass for the wrong reason)", () => {
    expect(files.length).toBeGreaterThan(700);
    expect(files).toContain("drizzle.config.ts");
    expect(files).toContain(join("scripts", "ingest", "scryfall.ts"));
  });

  it("load .env.local through loadEnv(), once each: the scripts, the ingest, the db CLIs, drizzle's config", () => {
    expect(loading).toHaveLength(29);
    expect(loading).toEqual(
      expect.arrayContaining([
        "drizzle.config.ts",
        join("src", "db", "migrate.ts"),
        join("src", "db", "seed.ts"),
        join("scripts", "db-size.ts"),
        join("scripts", "ingest", "assign-leader-slugs.ts"),
      ]),
    );
    for (const file of loading) {
      const text = read(file);
      expect(text, file).toMatch(
        /(?:import \{ loadEnv \} from |const \{ loadEnv \} = await import\()"(?:\.\.?\/)+(?:src\/)?lib\/load-env"/,
      );
      expect(text.match(CALL), file).toHaveLength(1);
    }
  });

  it("never import dotenv, and package.json no longer lists it", () => {
    for (const file of files) expect(read(file), file).not.toMatch(DOTENV_IMPORT);
    const { dependencies, devDependencies } = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.keys({ ...dependencies, ...devDependencies })).not.toContain("dotenv");
  });
});
