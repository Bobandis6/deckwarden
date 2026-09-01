import { describe, expect, it } from "vitest";

import type { FormatDef } from "@/lib/games/types";
import { deckStateKey, hasLeader } from "./panel-view";

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

describe("deckStateKey — the panels' refetch policy, encoded", () => {
  it("is stable across entry order (the server computations ignore it)", () => {
    const a = [
      { cardId: "c1", zone: "main", qty: 1 },
      { cardId: "c2", zone: "commander", qty: 1 },
    ];
    const b = [a[1], a[0]];
    expect(deckStateKey(a)).toBe(deckStateKey(b));
  });

  it("changes when a card, zone, or qty changes", () => {
    const base = [{ cardId: "c1", zone: "main", qty: 1 }];
    const key = deckStateKey(base);
    expect(deckStateKey([{ ...base[0], qty: 2 }])).not.toBe(key);
    expect(deckStateKey([{ ...base[0], zone: "commander" }])).not.toBe(key);
    expect(deckStateKey([{ ...base[0], cardId: "c2" }])).not.toBe(key);
    expect(deckStateKey([])).not.toBe(key);
  });

  it("ignores tags and printings — editing them must never refetch", () => {
    const entry = { cardId: "c1", zone: "main", qty: 1 };
    const tagged = { ...entry, tags: ["ramp"], printingId: "p9" };
    expect(deckStateKey([tagged])).toBe(deckStateKey([entry]));
  });
});

describe("hasLeader — the panels' fetch gate", () => {
  it("is false for an empty deck and a deck with only main-zone cards", () => {
    expect(hasLeader([], FORMAT)).toBe(false);
    expect(hasLeader([{ zone: "main" }], FORMAT)).toBe(false);
  });

  it("is true once a leader-zone entry exists", () => {
    expect(hasLeader([{ zone: "main" }, { zone: "commander" }], FORMAT)).toBe(true);
  });
});
