import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { FORMATS, GAME_ID, GAMES } from "./seed-data";

describe("seed data", () => {
  it("has unique, stable game ids and codes", () => {
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map((g) => g.code)).size).toBe(GAMES.length);
    expect(GAMES.find((g) => g.code === "mtg")?.id).toBe(GAME_ID.mtg);
  });

  it("every format points at a seeded game and ships commander", () => {
    const gameIds = new Set(GAMES.map((g) => g.id));
    for (const f of FORMATS) expect(gameIds.has(f.gameId)).toBe(true);
    expect(FORMATS.some((f) => f.code === "commander" && f.gameId === GAME_ID.mtg)).toBe(true);
  });
});

describe("schema_v1 migration", () => {
  it("creates pg_trgm before the trigram index (hand-added line survives regeneration)", () => {
    const sql = readFileSync("drizzle/0000_schema_v1.sql", "utf8");
    expect(sql.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm")).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm")).toBeLessThan(
      sql.indexOf("gin_trgm_ops"),
    );
  });
});
