// @vitest-environment node
/**
 * No Node builtin in the browser's module graph (LATER.md row 287). Next
 * aliases `node:crypto` and its kin to browserified copies for client
 * bundles (next/dist/compiled/crypto-browserify, buffer, util,
 * vm-browserify…), so one builtin import reached from a `"use client"` file
 * ships the whole family: a ~510 KB chunk on every page that loaded it until
 * 2026-10-24, when `punk-map.ts`'s `createHash` rode in behind
 * `OPTCG_COLOR_BIT` (the constant moved to `optcg/colors.ts`). This test
 * walks `src`, builds the runtime import graph of the non-test modules
 * (`import`/`export … from`, side-effect imports and `import()`; `import
 * type` and all-`type` specifier lists are erased by the compiler and
 * skipped), starts from every file whose first statement is `"use client"`,
 * and fails with the chain when a reachable module imports a builtin. A
 * server component's imports render on the server and put nothing in the
 * bundle, so only the client entries are roots.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");

/** The builtins a module may not import when the browser can reach it (bare or `node:`-prefixed). */
const NODE_BUILTINS = new Set([
  "fs",
  "fs/promises",
  "path",
  "crypto",
  "os",
  "child_process",
  "stream",
  "util",
  "buffer",
  "zlib",
  "http",
  "https",
  "net",
  "tls",
  "url",
  "events",
  "worker_threads",
]);

/** Client-reachable modules allowed a builtin anyway, with the reason. Empty, and meant to stay so. */
const ALLOWED: ReadonlyMap<string, string> = new Map();

const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (EXTENSIONS.some((e) => name.endsWith(e)) && !/\.test\.tsx?$/.test(name)) {
      if (!name.endsWith(".d.ts")) out.push(path);
    }
  }
  return out;
}

/**
 * The source with comments blanked, so an example import in a doc comment is
 * no edge. Strings and template literals are skipped over whole, so a `//`
 * inside a URL or a glob's `/*` never starts a comment.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      out += " ";
    } else if (ch === '"' || ch === "'" || ch === "`") {
      const start = i++;
      while (i < source.length && source[i] !== ch) i += source[i] === "\\" ? 2 : 1;
      out += source.slice(start, ++i);
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** True when the file's first statement, past its leading comments, is the `"use client"` directive. */
function isClientEntry(source: string): boolean {
  return /^\s*["']use client["']/.test(stripComments(source));
}

/** True for a `{ … }` specifier list whose every entry carries `type` (the compiler erases the import). */
function allTypeSpecifiers(clause: string): boolean {
  const braces = clause.match(/\{([^}]*)\}/);
  if (!braces || clause.replace(braces[0], "").replace(/[\s,]/g, "") !== "") return false;
  const names = braces[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return names.length > 0 && names.every((s) => /^type\s/.test(s));
}

/** The runtime module specifiers a source imports or re-exports. */
function runtimeSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specs: string[] = [];
  const fromRe =
    /(?:^|[;}\s])(import|export)(\s+type)?\s+([\w$*{},\s]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(fromRe)) {
    if (m[2] || allTypeSpecifiers(m[3])) continue;
    specs.push(m[4]);
  }
  for (const m of code.matchAll(/(?:^|[;}\s])import\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs;
}

/** `@/x` and relative specifiers → a file under src, or null (a package, an asset, a stylesheet). */
function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(from, "..", spec);
  else return null;
  for (const candidate of [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => join(base, "index" + e)),
  ]) {
    if (EXTENSIONS.some((e) => candidate.endsWith(e)) && existsSync(candidate)) {
      if (statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

function builtinName(spec: string): string | null {
  if (spec.startsWith("node:")) return spec;
  return NODE_BUILTINS.has(spec) ? spec : null;
}

interface Graph {
  entries: string[];
  /** Module → the module it was first reached from (entries map to null). */
  parent: Map<string, string | null>;
  /** Module → the builtins it imports. */
  builtins: Map<string, string[]>;
}

function clientGraph(): Graph {
  const files = walk(ROOT);
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const edges = new Map<string, string[]>();
  const builtins = new Map<string, string[]>();
  for (const [file, source] of sources) {
    const specs = runtimeSpecifiers(source);
    edges.set(
      file,
      specs.flatMap((s) => {
        const target = resolveSpecifier(file, s);
        return target && sources.has(target) ? [target] : [];
      }),
    );
    const named = specs.flatMap((s) => builtinName(s) ?? []);
    if (named.length > 0) builtins.set(file, named);
  }
  const entries = files.filter((f) => isClientEntry(sources.get(f)!));
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]));
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const target of edges.get(file) ?? []) {
      if (parent.has(target)) continue;
      parent.set(target, file);
      queue.push(target);
    }
  }
  return { entries, parent, builtins };
}

function chain(parent: Map<string, string | null>, file: string): string {
  const links: string[] = [];
  for (let at: string | null | undefined = file; at; at = parent.get(at)) {
    links.unshift(relative(process.cwd(), at));
  }
  return links.join(" → ");
}

describe("the client module graph (LATER.md row 287)", () => {
  const graph = clientGraph();

  it("is walked (a resolver that finds nothing would pass for the wrong reason)", () => {
    expect(graph.entries.length).toBeGreaterThanOrEqual(100);
    expect(graph.parent.size).toBeGreaterThanOrEqual(200);
    expect(graph.parent.has(join(ROOT, "lib", "games", "registry.ts"))).toBe(true);
    expect(graph.parent.has(join(ROOT, "lib", "games", "optcg", "colors.ts"))).toBe(true);
  });

  it("reaches no module that imports a Node builtin", () => {
    const offenders = [...graph.parent.keys()]
      .filter((file) => graph.builtins.has(file) && !ALLOWED.has(relative(process.cwd(), file)))
      .map((file) => `${graph.builtins.get(file)!.join(", ")} via ${chain(graph.parent, file)}`)
      .sort();
    expect(offenders).toEqual([]);
  });
});
