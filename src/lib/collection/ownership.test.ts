import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { deckOwnership, formatUsd, ownershipLine } from "./ownership";

const cards = new Map<string, { cheapestUsd: number | null }>([
  ["cmdr", { cheapestUsd: 3 }],
  ["sol", { cheapestUsd: 1.5 }],
  ["rhystic", { cheapestUsd: 40 }],
  ["forest", { cheapestUsd: 0.1 }],
  ["mystery", { cheapestUsd: null }],
]);
const entries = [
  { cardId: "cmdr", zone: "commander", qty: 1 },
  { cardId: "sol", zone: "main", qty: 1 },
  { cardId: "rhystic", zone: "main", qty: 1 },
  { cardId: "forest", zone: "main", qty: 10 },
  { cardId: "mystery", zone: "main", qty: 2 },
];

describe("deckOwnership", () => {
  it("counts copies over countsTowardSize zones, owned by identity regardless of quantity", () => {
    const s = deckOwnership(entries, cards, new Set(["cmdr", "forest"]), COMMANDER);
    expect(s.totalQty).toBe(15);
    expect(s.ownedQty).toBe(11); // commander + all ten Forests (one Forest owned = all counted)
    expect(s.missingCards).toBe(3);
    expect(s.missingUsd).toBe(41.5); // sol 1.5 + rhystic 40; mystery has no price
    expect(s.unpricedMissing).toBe(1);
  });

  it("an empty owned set means nothing owned, not an error; a full one means nothing missing", () => {
    expect(deckOwnership(entries, cards, new Set(), COMMANDER)).toMatchObject({
      ownedQty: 0,
      missingCards: 5,
    });
    expect(deckOwnership(entries, cards, new Set(cards.keys()), COMMANDER)).toMatchObject({
      ownedQty: 15,
      missingCards: 0,
      missingUsd: 0,
      unpricedMissing: 0,
    });
  });

  it("ignores zones that don't count toward deck size", () => {
    const s = deckOwnership(
      [...entries, { cardId: "sol", zone: "sideboard", qty: 4 }],
      cards,
      new Set(),
      COMMANDER,
    );
    expect(s.totalQty).toBe(15);
  });
});

describe("ownershipLine", () => {
  it("states the estimate honestly in every price state", () => {
    expect(
      ownershipLine({
        ownedQty: 63,
        totalQty: 100,
        missingCards: 30,
        missingUsd: 412.4,
        unpricedMissing: 0,
      }),
    ).toBe("You own 63/100 · missing ≈ $412");
    expect(
      ownershipLine({
        ownedQty: 63,
        totalQty: 100,
        missingCards: 30,
        missingUsd: 412.4,
        unpricedMissing: 2,
      }),
    ).toBe("You own 63/100 · missing ≈ $412 (+2 unpriced)");
    expect(
      ownershipLine({
        ownedQty: 98,
        totalQty: 100,
        missingCards: 2,
        missingUsd: 0,
        unpricedMissing: 2,
      }),
    ).toBe("You own 98/100 · missing 2 (no price data)");
    expect(
      ownershipLine({
        ownedQty: 100,
        totalQty: 100,
        missingCards: 0,
        missingUsd: 0,
        unpricedMissing: 0,
      }),
    ).toBe("You own 100/100 · nothing missing");
    expect(
      ownershipLine({
        ownedQty: 0,
        totalQty: 0,
        missingCards: 0,
        missingUsd: 0,
        unpricedMissing: 0,
      }),
    ).toBe("You own 0/0");
    expect(formatUsd(1234.56)).toBe("$1,235");
  });
});
