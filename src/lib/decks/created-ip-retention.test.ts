// @vitest-environment node
/**
 * created_ip retention (S6, L16): the real drizzle builder over a fake
 * postgres.js client that records the statement — one UPDATE that touches
 * only rows still holding an address and older than the window, counted
 * from RETURNING — and the counts-only log line.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

import {
  clearStaleCreatedIps,
  CREATED_IP_RETENTION,
  createdIpReportLine,
} from "./created-ip-retention";

type Call = { sql: string; params: unknown[] };
let calls: Call[] = [];
let returned: string[][] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    return { values: async () => returned, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

beforeEach(() => {
  calls = [];
  returned = [];
});

describe("clearStaleCreatedIps", () => {
  it("runs one UPDATE bounded to rows with an address older than 30 days and returns the count", async () => {
    returned = [["11111111-1111-4111-8111-111111111111"], ["22222222-2222-4222-8222-222222222222"]];
    expect(await clearStaleCreatedIps(fakeDb)).toBe(2);
    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0];
    expect(sql).toMatch(/^update "decks" set "created_ip" = /);
    expect(sql).toContain(
      `"decks"."created_ip" is not null and "decks"."created_at" < now() - interval '30 days'`,
    );
    expect(sql).toMatch(/returning "id"$/);
    // Nothing but the null is bound: no address, no id, no date from outside.
    expect(params.every((p) => p === null)).toBe(true);
    expect(CREATED_IP_RETENTION).toBe("30 days");
  });

  it("answers zero when nothing was old enough", async () => {
    expect(await clearStaleCreatedIps(fakeDb)).toBe(0);
    expect(calls).toHaveLength(1);
  });
});

describe("createdIpReportLine", () => {
  it("is a count and the window, nothing else", () => {
    expect(createdIpReportLine(3)).toBe(
      "created_ip: cleared on 3 deck(s) created more than 30 days ago.",
    );
    expect(createdIpReportLine(0)).toBe(
      "created_ip: cleared on 0 deck(s) created more than 30 days ago.",
    );
  });
});
