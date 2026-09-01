import { describe, expect, it } from "vitest";

import type { FormatDef } from "@/lib/games/types";
import type { RecommendationEvidence } from "./types";
import { hasLeader, orderEvidence, recsFetchKey } from "./view";

const FORMAT: FormatDef = {
  code: "commander",
  label: "Commander",
  deckSize: { min: 100, max: 100 },
  zones: [
    {
      id: "commander",
      label: "Commander",
      min: 1,
      max: 2,
      countsTowardSize: true,
      defaultCopyLimit: 1,
      isLeaderZone: true,
    },
    {
      id: "main",
      label: "Main deck",
      min: 0,
      max: null,
      countsTowardSize: true,
      defaultCopyLimit: null,
    },
  ],
};

describe("recsFetchKey — the refetch policy, encoded", () => {
  it("is stable across entry order (the engine ignores it)", () => {
    const a = [
      { cardId: "c1", zone: "main", qty: 1 },
      { cardId: "c2", zone: "commander", qty: 1 },
    ];
    const b = [a[1], a[0]];
    expect(recsFetchKey(a)).toBe(recsFetchKey(b));
  });

  it("changes when a card, zone, or qty changes", () => {
    const base = [{ cardId: "c1", zone: "main", qty: 1 }];
    const key = recsFetchKey(base);
    expect(recsFetchKey([{ ...base[0], qty: 2 }])).not.toBe(key);
    expect(recsFetchKey([{ ...base[0], zone: "commander" }])).not.toBe(key);
    expect(recsFetchKey([{ ...base[0], cardId: "c2" }])).not.toBe(key);
    expect(recsFetchKey([])).not.toBe(key);
  });

  it("ignores tags and printings — editing them must never refetch", () => {
    const entry = { cardId: "c1", zone: "main", qty: 1 };
    const tagged = { ...entry, tags: ["ramp"], printingId: "p9" };
    expect(recsFetchKey([tagged])).toBe(recsFetchKey([entry]));
  });
});

describe("hasLeader — the panel's fetch gate", () => {
  it("is false for an empty deck and a deck with only main-zone cards", () => {
    expect(hasLeader([], FORMAT)).toBe(false);
    expect(hasLeader([{ zone: "main" }], FORMAT)).toBe(false);
  });

  it("is true once a leader-zone entry exists", () => {
    expect(hasLeader([{ zone: "main" }, { zone: "commander" }], FORMAT)).toBe(true);
  });
});

describe("orderEvidence — strongest first, engine order within a tier", () => {
  const ev = (confidence: RecommendationEvidence["confidence"], why: string) => ({
    source: "s",
    why,
    with: [],
    howOften: null,
    confidence,
  });

  it("sorts by confidence desc, stable within", () => {
    const input = [ev("low", "curve"), ev("high", "pop"), ev("high", "combo"), ev("medium", "m")];
    expect(orderEvidence(input).map((e) => e.why)).toEqual(["pop", "combo", "m", "curve"]);
  });

  it("does not mutate its input", () => {
    const input = [ev("low", "a"), ev("high", "b")];
    orderEvidence(input);
    expect(input.map((e) => e.why)).toEqual(["a", "b"]);
  });
});
