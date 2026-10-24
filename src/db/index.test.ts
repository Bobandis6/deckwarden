// @vitest-environment node
/**
 * The pool size (EXIT-RUNBOOK.md): one connection unless `DB_POOL_MAX` says
 * otherwise, and only a whole number from 1 to 50 says otherwise — Vercel
 * never sets it, so the serverless default cannot move by accident.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const postgresCalls = vi.hoisted(() => [] as Array<{ url: string; options: { max?: number } }>);

vi.mock("postgres", () => ({
  default: (url: string, options: { max?: number }) => {
    postgresCalls.push({ url, options });
    return {};
  },
}));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => ({}) }));

import { createDb, poolMax } from "./index";

describe("poolMax", () => {
  it("is one connection when the variable is unset or empty", () => {
    expect(poolMax(undefined)).toBe(1);
    expect(poolMax("")).toBe(1);
  });

  it("takes a whole number from 1 to 50", () => {
    expect(poolMax("1")).toBe(1);
    expect(poolMax("10")).toBe(10);
    expect(poolMax("50")).toBe(50);
  });

  it("keeps the default for anything else", () => {
    for (const value of ["0", "-3", "51", "1.5", "ten", "1e1x", " "]) {
      expect(poolMax(value), value).toBe(1);
    }
  });
});

describe("createDb", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    postgresCalls.length = 0;
  });

  it("opens one connection by default", () => {
    vi.stubEnv("DB_POOL_MAX", "");
    createDb("postgres://u:p@localhost:5432/db");
    expect(postgresCalls.at(-1)?.options.max).toBe(1);
  });

  it("sizes the pool from DB_POOL_MAX", () => {
    vi.stubEnv("DB_POOL_MAX", "10");
    createDb("postgres://u:p@localhost:5432/db");
    expect(postgresCalls.at(-1)?.options.max).toBe(10);
  });
});
