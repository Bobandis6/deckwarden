import { describe, expect, it } from "vitest";

import { RATE_LIMITS, windowStartFor } from "./rate-limit";

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
});
