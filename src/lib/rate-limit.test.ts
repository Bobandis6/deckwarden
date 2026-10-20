import { describe, expect, it } from "vitest";

import { RATE_LIMITS, windowStartFor, type GatedWriteLimits, type RateLimit } from "./rate-limit";

/** Every policy's buckets for one principal and one resource — gated ones flattened (S4). */
function buckets(policy: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS]): RateLimit[] {
  if (typeof policy === "function") return (policy as (p: string) => RateLimit[])("principal");
  const gated = policy as GatedWriteLimits;
  return [...gated.ip("principal"), ...gated.resource("resource")];
}

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
      ...RATE_LIMITS.deckCardsPut.ip("1.2.3.4"),
      ...RATE_LIMITS.deckCardsPut.resource("deck-a"),
      ...RATE_LIMITS.deckMetaWrite.ip("1.2.3.4"),
      ...RATE_LIMITS.deckMetaWrite.resource("deck-a"),
      ...RATE_LIMITS.cardResolve("1.2.3.4"),
      ...RATE_LIMITS.cardSearch("1.2.3.4"),
      ...RATE_LIMITS.cardSuggest("1.2.3.4"),
      ...RATE_LIMITS.deckPreview("1.2.3.4"),
      ...RATE_LIMITS.decksMine("1.2.3.4"),
    ].map((l) => l.key);
    expect(new Set(all).size).toBe(all.length);
  });

  it("no two policies share a key — every route has its own buckets", () => {
    const seen = new Map<string, string>();
    for (const [name, policy] of Object.entries(RATE_LIMITS)) {
      for (const { key } of buckets(policy)) {
        expect(seen.get(key), `${key} is ${name}'s and ${seen.get(key)}'s`).toBeUndefined();
        seen.set(key, name);
      }
    }
  });

  it("null ip falls back to a shared bucket instead of throwing", () => {
    for (const limit of RATE_LIMITS.deckCreate(null)) {
      expect(limit.key).toContain(":ip");
      expect(limit.key).toContain("unknown");
    }
  });

  it("autosave headroom: per-deck cards cap exceeds 1 request/s", () => {
    const perDeck = RATE_LIMITS.deckCardsPut.resource("d")[0];
    expect(perDeck.max / perDeck.windowSeconds).toBeGreaterThan(1);
  });

  it("the gated write policies (S4, M1) keep the IP half and the resource half apart", () => {
    for (const policy of [
      RATE_LIMITS.deckCardsPut,
      RATE_LIMITS.deckMetaWrite,
      RATE_LIMITS.deckVersionWrite,
      RATE_LIMITS.folderMetaWrite,
    ]) {
      for (const limit of policy.ip("1.2.3.4")) expect(limit.key).toContain(":ip:1.2.3.4");
      for (const limit of policy.resource("r")) expect(limit.key).toMatch(/:(deck|folder):r$/);
    }
  });

  it("every window is at most a day — the nightly purge sweeps counters older than two", () => {
    for (const policy of Object.values(RATE_LIMITS)) {
      for (const limit of buckets(policy)) {
        expect(limit.windowSeconds).toBeLessThanOrEqual(86400);
      }
    }
  });

  it("the search, suggest and deck-preview reads (S4, M6) have their own minute + hour buckets", () => {
    expect(RATE_LIMITS.cardSearch("1.2.3.4").map((l) => [l.key, l.max, l.windowSeconds])).toEqual([
      ["card-search:ip:1.2.3.4", 120, 60],
      ["card-search:ip-hour:1.2.3.4", 2000, 3600],
    ]);
    expect(RATE_LIMITS.cardSuggest("1.2.3.4").map((l) => [l.key, l.max, l.windowSeconds])).toEqual([
      ["card-suggest:ip:1.2.3.4", 120, 60],
      ["card-suggest:ip-hour:1.2.3.4", 2000, 3600],
    ]);
    expect(RATE_LIMITS.deckPreview("1.2.3.4").map((l) => [l.key, l.max, l.windowSeconds])).toEqual([
      ["deck-preview:ip:1.2.3.4", 60, 60],
      ["deck-preview:ip-hour:1.2.3.4", 600, 3600],
    ]);
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
      const keys = buckets(policy).map((l) => l.key);
      expect(keys.some((key) => own.includes(key))).toBe(false);
    }
    expect(RATE_LIMITS.alternatives("1.2.3.4").map((l) => [l.max, l.windowSeconds])).toEqual([
      [30, 60],
      [200, 3600],
    ]);
  });
});
