import { describe, expect, it } from "vitest";

import { META_LENS_LIMIT, META_LENS_MIN_LISTS, shareLabel, sinceLabel } from "./meta-lens";

describe("shareLabel", () => {
  it("carries the literal n-of-N beside the percent", () => {
    expect(shareLabel(58, 94)).toBe("62% · 58 of 94");
  });

  it("says 100% only for an exact total", () => {
    expect(shareLabel(94, 94)).toBe("100% · 94 of 94");
    // 1469/1474 = 99.66% would ROUND to 100 — an honest label never claims
    // 100% for a card missing from some list.
    expect(shareLabel(1469, 1474)).toBe("99% · 1469 of 1474");
  });

  it("never rounds a real share down to 0%", () => {
    expect(shareLabel(1, 1474)).toBe("<1% · 1 of 1474");
  });
});

describe("sinceLabel", () => {
  it("formats the ISO date pinned to UTC so the day never shifts", () => {
    expect(sinceLabel("2026-03-06")).toBe("Mar 6, 2026");
  });
});

describe("constants", () => {
  it("keeps the disclosed floor and cap the wording claims", () => {
    // Below 5 union lists shares are noise (the P3.8 low-confidence band) —
    // the section renders honest absence instead.
    expect(META_LENS_MIN_LISTS).toBe(5);
    expect(META_LENS_LIMIT).toBe(25);
  });
});
