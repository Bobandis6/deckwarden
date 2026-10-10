import { describe, expect, it } from "vitest";

import { RATE_LIMITS, windowStartFor, type RateLimit } from "./rate-limit";

describe("windowStartFor", () => {
  it("floors to the window boundary", () => {
    // 2026-08-25T12:34:56Z with a 60s window → 12:34:00Z
    const now = Date.parse("2026-08-25T12:34:56Z");
    expect(windowStartFor(now, 60).toISOString()).toBe("2026-08-25T12:34:00.000Z");
    expect(windowStartFor(now, 3600).toISOString()).toBe("2026-08-25T12:00:00.000Z");
    expect(windowStartFor(now, 86400).toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });

  it("is stable within a window and advances across it", () => {
    const base = Date.parse("2026-08-25T12:34:00Z");
    expect(windowStartFor(base, 60).getTime()).toBe(windowStartFor(base + 59_000, 60).getTime());
    expect(windowStartFor(base + 60_000, 60).getTime()).toBe(base + 60_000);
  });
});

describe("RATE_LIMITS policies", () => {
  it("keys are distinct per principal and scope", () => {
    const all = [
      ...RATE_LIMITS.deckCreate("1.2.3.4"),
      ...RATE_LIMITS.deckCardsPut("1.2.3.4", "deck-a"),
      ...RATE_LIMITS.deckMetaWrite("1.2.3.4", "deck-a"),
      ...RATE_LIMITS.cardResolve("1.2.3.4"),
      ...RATE_LIMITS.decksMine("1.2.3.4"),
    ].map((l) => l.key);
    expect(new Set(all).size).toBe(all.length);
  });

  it("null ip falls back to a shared bucket instead of throwing", () => {
    for (const limit of RATE_LIMITS.deckCreate(null)) {
      expect(limit.key).toContain(":ip");
      expect(limit.key).toContain("unknown");
    }
  });

  it("autosave headroom: per-deck cards cap exceeds 1 request/s", () => {
    const perDeck = RATE_LIMITS.deckCardsPut(null, "d")[0];
    expect(perDeck.max / perDeck.windowSeconds).toBeGreaterThan(1);
  });

  it("every window is at most a day — the nightly purge sweeps counters older than two", () => {
    // Every policy takes a principal (ip or user id) and at most a deck id.
    const policies = Object.values(RATE_LIMITS) as ((p: string, d: string) => RateLimit[])[];
    for (const policy of policies) {
      for (const limit of policy("principal", "deck")) {
        expect(limit.windowSeconds).toBeLessThanOrEqual(86400);
      }
    }
  });

  it("the draft snapshot route (Y2b) has its own bucket, never the deck GET's", () => {
    const snapshot = RATE_LIMITS.recommendSnapshot("1.2.3.4").map((l) => l.key);
    const deckGet = RATE_LIMITS.recommendations("1.2.3.4").map((l) => l.key);
    expect(snapshot.some((key) => deckGet.includes(key))).toBe(false);
    expect(RATE_LIMITS.recommendSnapshot("1.2.3.4").map((l) => [l.max, l.windowSeconds])).toEqual([
      [30, 60],
      [200, 3600],
    ]);
  });

  it("Swap Lab's route (Y7a) has its own bucket too, shared with no other route", () => {
    const own = RATE_LIMITS.alternatives("1.2.3.4").map((l) => l.key);
    expect(own).toEqual(["alternatives:ip:1.2.3.4", "alternatives:ip-hour:1.2.3.4"]);
    for (const [name, policy] of Object.entries(RATE_LIMITS)) {
      if (name === "alternatives") continue;
      const keys = (policy as (p: string, d: string) => RateLimit[])("1.2.3.4", "deck").map(
        (l) => l.key,
      );
      expect(keys.some((key) => own.includes(key))).toBe(false);
    }
    expect(RATE_LIMITS.alternatives("1.2.3.4").map((l) => [l.max, l.windowSeconds])).toEqual([
      [30, 60],
      [200, 3600],
    ]);
  });
});
