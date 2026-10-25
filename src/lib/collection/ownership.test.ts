import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { PRECON_COPY } from "./precon-copy";
import {
  deckOwnership,
  formatUsd,
  OWNERSHIP_METHOD,
  ownershipLine,
  ownershipMethod,
} from "./ownership";

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

describe("deckOwnership with an owned precon's copies (PRECON-OWNED)", () => {
  // A 100-card precon: its commander, 12 Forests, Sol Ring, 86 singles.
  const singles = Array.from({ length: 86 }, (_, i) => `single-${i}`);
  const prices = new Map<string, { cheapestUsd: number | null }>([
    ["cmdr", { cheapestUsd: 3 }],
    ["forest", { cheapestUsd: 0.1 }],
    ["sol", { cheapestUsd: 1.5 }],
    ["rhystic", { cheapestUsd: 40 }],
    ["mystery", { cheapestUsd: null }],
    ...singles.map((id) => [id, { cheapestUsd: 0.25 }] as const),
  ]);
  const precon = [
    { cardId: "cmdr", zone: "commander", qty: 1 },
    { cardId: "forest", zone: "main", qty: 12 },
    { cardId: "sol", zone: "main", qty: 1 },
    ...singles.map((cardId) => ({ cardId, zone: "main", qty: 1 })),
  ];
  const box = new Map(precon.map((e) => [e.cardId, e.qty]));
  const none = new Set<string>();

  it("the unchanged precon answered Yes: You own 100/100 · nothing missing", () => {
    const s = deckOwnership(precon, prices, none, COMMANDER, box);
    expect(s).toEqual({
      ownedQty: 100,
      totalQty: 100,
      missingCards: 0,
      missingUsd: 0,
      unpricedMissing: 0,
    });
    expect(ownershipLine(s)).toBe("You own 100/100 · nothing missing");
  });

  it("the quantities are the precon's: 14 Forests from a 12-Forest precon cost two Forests", () => {
    const list = precon.map((e) => (e.cardId === "forest" ? { ...e, qty: 14 } : e));
    const s = deckOwnership(list, prices, none, COMMANDER, box);
    expect(s.ownedQty).toBe(100);
    expect(s.totalQty).toBe(102);
    expect(s.missingCards).toBe(1);
    expect(s.missingUsd).toBe(0.2);
  });

  it("a card cut is a card the deck no longer needs; added back, it is owned again", () => {
    const cut = precon.filter((e) => e.cardId !== "sol");
    const withRhystic = [...cut, { cardId: "rhystic", zone: "main", qty: 1 }];
    expect(deckOwnership(withRhystic, prices, none, COMMANDER, box)).toMatchObject({
      ownedQty: 99,
      missingCards: 1,
      missingUsd: 40,
    });
    const back = [...withRhystic.filter((e) => e.cardId !== "rhystic"), precon[2]];
    expect(ownershipLine(deckOwnership(back, prices, none, COMMANDER, box))).toBe(
      "You own 100/100 · nothing missing",
    );
  });

  it("the commander counts like any precon card, in whichever counted zone it sits", () => {
    // The precon's commander moved into the 99, a new commander bought in.
    const list = [
      { cardId: "rhystic", zone: "commander", qty: 1 },
      { cardId: "cmdr", zone: "main", qty: 1 },
      ...precon.slice(1),
    ];
    const s = deckOwnership(list, prices, none, COMMANDER, box);
    expect(s).toMatchObject({ ownedQty: 100, totalQty: 101, missingCards: 1, missingUsd: 40 });
  });

  it("the box's copies are spent once across the list's entries of one identity", () => {
    const twoCopies = new Map([["forest", 2]]);
    const list = [
      { cardId: "forest", zone: "commander", qty: 1 },
      { cardId: "forest", zone: "main", qty: 2 },
    ];
    expect(deckOwnership(list, prices, none, COMMANDER, twoCopies)).toMatchObject({
      ownedQty: 2,
      totalQty: 3,
      missingCards: 1,
      missingUsd: 0.1,
    });
  });

  it("the collection's identity rule still covers every copy it holds, past the box's", () => {
    const list = precon.map((e) => (e.cardId === "forest" ? { ...e, qty: 14 } : e));
    const s = deckOwnership(list, prices, new Set(["forest"]), COMMANDER, box);
    expect(s).toMatchObject({ ownedQty: 102, missingCards: 0, missingUsd: 0 });
  });

  it("an unpriced card past the box is counted beside the sum, never as $0", () => {
    const list = [...precon, { cardId: "mystery", zone: "main", qty: 1 }];
    expect(deckOwnership(list, prices, none, COMMANDER, box)).toMatchObject({
      missingCards: 1,
      missingUsd: 0,
      unpricedMissing: 1,
    });
  });

  it("zones that don't count toward the size are never counted, owned or missing", () => {
    const list = [...precon, { cardId: "rhystic", zone: "tokens", qty: 2 }];
    expect(deckOwnership(list, prices, none, COMMANDER, box)).toMatchObject({
      ownedQty: 100,
      totalQty: 100,
    });
  });

  it("without copies (no precon, or a No) every sum is what it was", () => {
    for (const owned of [new Set<string>(), new Set(["cmdr", "forest"])]) {
      expect(deckOwnership(entries, cards, owned, COMMANDER, undefined)).toEqual(
        deckOwnership(entries, cards, owned, COMMANDER),
      );
      expect(deckOwnership(entries, cards, owned, COMMANDER, new Map())).toEqual(
        deckOwnership(entries, cards, owned, COMMANDER),
      );
    }
  });
});

describe("ownershipMethod — the line's method text (PRECON-OWNED)", () => {
  it("a collection alone states OWNERSHIP_METHOD, the share page's, word for word", () => {
    expect(ownershipMethod({ collection: true, precon: false })).toBe(OWNERSHIP_METHOD);
    expect(OWNERSHIP_METHOD).toBe(
      "Owned = any printing of the card is in your imported collection (quantities not checked). Missing cost = cheapest listed printing per card; cards without a price are excluded and counted.",
    );
  });

  it("an owned precon gains its rule in a sentence, beside the collection's or alone", () => {
    expect(ownershipMethod({ collection: false, precon: true })).toBe(
      `${PRECON_COPY.method} Missing cost = cheapest listed printing per card; cards without a price are excluded and counted.`,
    );
    expect(ownershipMethod({ collection: true, precon: true })).toBe(
      `Owned = any printing of the card is in your imported collection (quantities not checked). ${PRECON_COPY.method} Missing cost = cheapest listed printing per card; cards without a price are excluded and counted.`,
    );
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
