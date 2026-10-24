/**
 * The token catalog's convention (DECK-TOKENS) and its census as a test:
 * every query that picks deck cards by anything but a known id ANDs in
 * `notTokenSql` — the sites the 2026-10-24 sweep found — and the one raw
 * postgres.js reader (Topdeck's name maps) writes the flag as a SQL literal,
 * because postgres.js JSON-encodes a string sent to a jsonb parameter and the
 * guard then excludes nothing (measured on the dev branch: 0 of 972 tokens).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isTokenCard, TOKEN_DOC } from "./tokens";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("the token flag", () => {
  it("is a sparse attrs key; only true counts", () => {
    expect(TOKEN_DOC).toBe('{"is_token":true}');
    expect(isTokenCard({ attrs: { is_token: true } })).toBe(true);
    expect(isTokenCard({ attrs: {} })).toBe(false);
    expect(isTokenCard({ attrs: { is_token: "true" } })).toBe(false);
  });
});

describe("the deck-card queries carry the guard (the census)", () => {
  it.each([
    "src/app/api/cards/search/route.ts",
    "src/lib/search/suggest.ts",
    "src/app/api/cards/resolve/route.ts",
    "src/app/(site)/cards/sitemap.ts",
    "src/app/robots.ts",
    "src/lib/sets/queries.ts",
    "src/app/api/cards/options/route.ts",
    "src/lib/collection/resolve.ts",
    "src/lib/recommend/queries.ts",
    "src/lib/og/data.ts",
  ])("%s", (file) => {
    expect(read(file)).toMatch(/notTokenSql\(/);
  });

  it("Topdeck's name maps: the literal in both statements, never a bound document", () => {
    const source = read("scripts/ingest/topdeck-aggregate.ts");
    expect(source.match(/NOT \(attrs @> '\{"is_token": true\}'\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/@> \$\{/);
  });
});
