import { describe, expect, it } from "vitest";

import type { FrozenCard } from "./diff";
import {
  frozenToInputs,
  MAX_VERSIONS_PER_DECK,
  parseFrozenCards,
  resolveFrozenCards,
  toFrozenCards,
} from "./versions";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("version cap (decision 6)", () => {
  it("is 50 per deck — the disclosed Neon bound, surfaced in the UI when hit", () => {
    expect(MAX_VERSIONS_PER_DECK).toBe(50);
  });
});

describe("frozen shape", () => {
  it("round-trips deck_cards rows into the schema's frozen shape and back to inputs", () => {
    const frozen = toFrozenCards([
      { cardIdentityId: U(1), zone: "commander", quantity: 1, tags: [], printingId: null },
      { cardIdentityId: U(2), zone: "main", quantity: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
    expect(frozen).toEqual([
      { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
      { cardId: U(2), zone: "main", qty: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
    expect(frozenToInputs(frozen)).toEqual([
      { cardId: U(1), zone: "commander", qty: 1, tags: [] },
      { cardId: U(2), zone: "main", qty: 3, tags: ["Ramp"], printingId: U(9) },
    ]);
  });

  it("parses stored JSONB, filling optional fields, and rejects garbage", () => {
    expect(parseFrozenCards([{ cardId: U(1), zone: "main", qty: 1 }])).toEqual([
      { cardId: U(1), zone: "main", qty: 1, tags: [], printingId: null },
    ]);
    expect(() => parseFrozenCards([{ cardId: "nope", zone: "main", qty: 1 }])).toThrow();
    expect(() => parseFrozenCards({ cards: [] })).toThrow();
  });
});

describe("resolveFrozenCards (restore guard)", () => {
  const frozen: FrozenCard[] = [
    { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: U(11) },
    { cardId: U(2), zone: "main", qty: 1, tags: ["Draw"], printingId: U(12) },
    { cardId: U(3), zone: "main", qty: 2, tags: [], printingId: null },
    { cardId: U(4), zone: "main", qty: 1, tags: [], printingId: U(14) },
  ];

  it("keeps resolvable entries verbatim, printings included", () => {
    const known = new Set([U(1), U(2), U(3), U(4)]);
    const owner = new Map([
      [U(11), U(1)],
      [U(12), U(2)],
      [U(14), U(4)],
    ]);
    const out = resolveFrozenCards(frozen, known, owner);
    expect(out.printingsReset).toBe(0);
    expect(out.cardsDropped).toBe(0);
    expect(out.entries).toEqual(frozenToInputs(frozen));
  });

  it("falls back to the default printing when the chosen one is gone or belongs to another card", () => {
    const known = new Set([U(1), U(2), U(3), U(4)]);
    // U(12) vanished; U(14) now points at a different identity.
    const owner = new Map([
      [U(11), U(1)],
      [U(14), U(2)],
    ]);
    const out = resolveFrozenCards(frozen, known, owner);
    expect(out.printingsReset).toBe(2);
    expect(out.cardsDropped).toBe(0);
    expect(out.entries.find((e) => e.cardId === U(2))).toEqual({
      cardId: U(2),
      zone: "main",
      qty: 1,
      tags: ["Draw"],
    });
    expect(out.entries.find((e) => e.cardId === U(4))?.printingId).toBeUndefined();
    expect(out.entries.find((e) => e.cardId === U(1))?.printingId).toBe(U(11));
  });

  it("drops entries whose identity no longer resolves and counts them", () => {
    const known = new Set([U(1), U(3)]);
    const out = resolveFrozenCards(frozen, known, new Map([[U(11), U(1)]]));
    expect(out.cardsDropped).toBe(2);
    expect(out.entries.map((e) => e.cardId)).toEqual([U(1), U(3)]);
  });
});
