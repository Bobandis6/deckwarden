import { describe, expect, it } from "vitest";

import type { FormatDef } from "@/lib/games/types";
import { deckStateKey, hasLeader, snapshotBody } from "./panel-view";

const FORMAT: FormatDef = {
  code: "commander",
  label: "Commander",
  deckSize: { min: 100, max: 100 },
  openingHandSize: 7,
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

describe("snapshotBody — a draft's Suggestions request (Y2b)", () => {
  const entries = [
    { cardId: "rats", zone: "main", qty: 20 },
    { cardId: "thrasios", zone: "commander", qty: 1, tags: ["partner"] },
    { cardId: "sol", zone: "main", qty: 1, printingId: "p1" },
    { cardId: "tymna", zone: "commander", qty: 1 },
  ];

  it("leaders in entry order apart; every other entry with its copies; tags and printings never sent", () => {
    expect(snapshotBody("mtg", FORMAT, entries)).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: ["thrasios", "tymna"],
      entries: [
        { cardId: "rats", qty: 20 },
        { cardId: "sol", qty: 1 },
      ],
    });
  });

  it("a budget rides as USD; none means no field at all", () => {
    expect(snapshotBody("mtg", FORMAT, entries, 5).budget).toBe(5);
    expect("budget" in snapshotBody("mtg", FORMAT, entries)).toBe(false);
  });
});
