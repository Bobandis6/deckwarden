/**
 * Y8 — Budget Twin's planner (WAVE4 D9): which cards the Fit sheet asks
 * about, which alternative each one gets, and what the deck costs after —
 * over Magic's real swap declaration and Commander format, with fixture
 * cards. The acceptance: a $300 fixture deck at a $150 total lands at or
 * under $150, or says how close it gets; unpriced cards are disclosed and
 * never counted as $0.
 */
import { describe, expect, it } from "vitest";

import type { EditorEntry } from "@/lib/decks/editor-state";
import { getAdapter } from "@/lib/games/registry";
import { mtgSwap } from "@/lib/games/mtg/swap";
import { card } from "@/lib/games/mtg/test-fixtures";
import type { CardData } from "@/lib/games/types";
import {
  afterPhrase,
  deckEstimate,
  FIT_OPTIONS,
  fitConsidered,
  fitList,
  fitOptions,
  planFit,
  skippedLine,
  totalPhrase,
  type FitCard,
  type FitOptionInput,
} from "./fit";

const commander = getAdapter("mtg").formats.find((f) => f.code === "commander")!;

type Fixture = CardData & { name: string };
const cardsOf = (list: readonly Fixture[]) => new Map(list.map((c) => [c.id, c]));
const priced = (name: string, usd: number | null, roles: string[] = ["ramp"], extra = {}) =>
  // Any string: a retired or unknown role key must read as none.
  card({
    name,
    cheapestUsd: usd,
    primaryType: "Artifact",
    attrs: { roles } as never,
    ...extra,
  });

// The $300 fixture deck: a $20 commander, ten pricey role-holding cards
// ($171), 37 lands at $0.50 ($18.50) and 52 fillers ($90.50) = $300.00.
// The commander holds a role and a price: it is still never swapped.
const leader = card({
  name: "Odric",
  cheapestUsd: 20,
  isLeaderCandidate: true,
  attrs: { roles: ["card-draw"] } as never,
});
const PRICEY = [40, 30, 25, 20, 15, 12, 10, 8, 6, 5].map((usd, i) =>
  priced(`Pricey ${String.fromCharCode(65 + i)}`, usd),
);
const plains = card({ name: "Plains", cheapestUsd: 0.5, primaryType: "Land", costValue: null });
const fillers = Array.from({ length: 52 }, (_, i) =>
  priced(`Filler ${i}`, i === 0 ? 1.25 : 1.75, []),
);
const DECK: EditorEntry[] = [
  { cardId: leader.id, zone: "commander", qty: 1, tags: [] },
  ...PRICEY.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: ["Ramp"] })),
  { cardId: plains.id, zone: "main", qty: 37, tags: [] },
  ...fillers.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
];
const CARDS = cardsOf([leader, ...PRICEY, plains, ...fillers]);

let altSeq = 0;
/** A route row: an alternative at a price, the route's order. */
const alt = (usd: string | null, conflicts: FitOptionInput["conflicts"] = []) => {
  altSeq += 1;
  return { cardId: `alt-${altSeq}`, name: `Alt ${altSeq}`, cheapestUsd: usd, conflicts };
};

describe("deckEstimate — the deck at its cheapest printings", () => {
  it("sums every counted copy, the commander included: the fixture is $300", () => {
    expect(deckEstimate(DECK, CARDS, null, commander)).toEqual({ usd: 300, unpriced: 0 });
  });

  it("a card with no price is left out and counted beside the sum — never as $0", () => {
    const mystery = priced("Mystery", null);
    const deck = [...DECK, { cardId: mystery.id, zone: "main", qty: 1, tags: [] }];
    const est = deckEstimate(deck, cardsOf([...CARDS.values(), mystery]), null, commander);
    expect(est).toEqual({ usd: 300, unpriced: 1 });
  });

  it("owned copies count $0 only when an owned set (a collection) is given", () => {
    const owned = new Set([PRICEY[0].id]);
    expect(deckEstimate(DECK, CARDS, owned, commander).usd).toBe(260);
    expect(deckEstimate(DECK, CARDS, null, commander).usd).toBe(300);
  });

  it("PRECON-OWNED: an owned precon's copies pass through — the box at $0, what it lacks priced", () => {
    // The precon: the whole fixture deck but 30 of the 37 Plains.
    const box = new Map(
      DECK.map((e) => [e.cardId, e.cardId === plains.id ? 30 : e.qty] as [string, number]),
    );
    // Seven Plains past the box's 30, at $0.50.
    expect(deckEstimate(DECK, CARDS, null, commander, box)).toEqual({ usd: 3.5, unpriced: 0 });
    // A collection that holds a Plains covers every copy; the box covers the rest.
    expect(deckEstimate(DECK, CARDS, new Set([plains.id]), commander, box).usd).toBe(0);
    // No copies: byte-identical to before.
    expect(deckEstimate(DECK, CARDS, null, commander, undefined)).toEqual(
      deckEstimate(DECK, CARDS, null, commander),
    );
  });
});

describe("totalPhrase / afterPhrase — the goals line's and the footer's words", () => {
  it("D9's running total, whole dollars, the unpriced said aloud", () => {
    expect(totalPhrase(150, { usd: 212.4, unpriced: 0 })).toBe("est. $212 of your $150");
    expect(totalPhrase(150, { usd: 212.4, unpriced: 3 })).toBe(
      "est. $212 of your $150 (+3 unpriced)",
    );
    expect(totalPhrase(150, null)).toBe("$150 total");
  });

  it("a near miss shows its cents — $150.40 never reads as $150 of your $150", () => {
    expect(totalPhrase(150, { usd: 150.4, unpriced: 0 })).toBe("est. $150.40 of your $150");
    expect(totalPhrase(150, { usd: 150, unpriced: 0 })).toBe("est. $150 of your $150");
    expect(afterPhrase(150.4, 150, false)).toBe("Gets you to $150.40 of your $150");
    expect(afterPhrase(172.2, 150, false)).toBe("Gets you to $172 of your $150");
    expect(afterPhrase(148.9, 150, true)).toBe("est. $149 of your $150");
  });
});

describe("fitConsidered — which cards are worth asking about", () => {
  it("the priciest non-leader cards that hold a role, priciest first; lands and the commander never", () => {
    const { considered } = fitConsidered({
      entries: DECK,
      cards: CARDS,
      format: commander,
      swap: mtgSwap,
      owned: null,
      comboPieceIds: new Set(),
    });
    expect(considered.map((c) => c.usd)).toEqual([40, 30, 25, 20, 15, 12, 10, 8, 6, 5]);
    expect(considered[0]).toEqual({ id: PRICEY[0].id, name: "Pricey A", zone: "main", usd: 40 });
  });

  it("skips — and says why — cards without a role, combo pieces, the unpriced and the owned; several copies quietly", () => {
    const noRole = priced("No Role", 50, []);
    const retired = priced("Retired Role", 45, ["not-a-declared-role"]);
    const piece = priced("Combo Piece", 35);
    const unpriced = priced("Unpriced", null);
    const owned = priced("Owned", 33);
    const rats = priced("Relentless Rats", 9, ["token-maker"]);
    // A land holding a role (Tagger tags some as ramp) is never offered — nor named as skipped.
    const bounceLand = card({
      name: "Bounce Land",
      cheapestUsd: 60,
      primaryType: "Land",
      costValue: null,
      attrs: { roles: ["land-ramp"] } as never,
    });
    const entries: EditorEntry[] = [
      ...DECK,
      ...[noRole, retired, piece, unpriced, owned, bounceLand].map((c) => ({
        cardId: c.id,
        zone: "main",
        qty: 1,
        tags: [],
      })),
      { cardId: rats.id, zone: "main", qty: 12, tags: [] },
    ];
    const { considered, skipped } = fitConsidered({
      entries,
      cards: cardsOf([
        ...CARDS.values(),
        noRole,
        retired,
        piece,
        unpriced,
        owned,
        rats,
        bounceLand,
      ]),
      format: commander,
      swap: mtgSwap,
      owned: new Set([owned.id]),
      comboPieceIds: new Set([piece.id]),
    });
    expect(considered.map((c) => c.name)).toEqual(PRICEY.map((c) => c.name));
    expect(skipped.map((s) => [s.name, s.reason])).toEqual(
      expect.arrayContaining([
        ["No Role", "no-roles"],
        ["Retired Role", "no-roles"],
        ["Combo Piece", "combo"],
        ["Unpriced", "unpriced"],
        ["Owned", "owned"],
      ]),
    );
    // Priciest first, the unpriced last; fillers without a role are skipped too.
    expect(skipped[0].name).toBe("No Role");
    expect(skipped.at(-1)!.name).toBe("Unpriced");
    expect(skipped.some((s) => s.name === "Relentless Rats")).toBe(false);
    expect(skipped.some((s) => s.name === "Bounce Land" || s.name === "Odric")).toBe(false);
  });

  it("without facts (null), combo pieces aren't known — every role holder is considered", () => {
    const { considered } = fitConsidered({
      entries: DECK,
      cards: CARDS,
      format: commander,
      swap: mtgSwap,
      owned: null,
      comboPieceIds: null,
    });
    expect(considered).toHaveLength(10);
  });

  it("names the pricey cards it didn't look at, the reasons in plain words", () => {
    const skips = [
      { id: "a", name: "Serra Ascendant", usd: 28, reason: "no-roles" as const },
      { id: "b", name: "Thassa's Oracle", usd: 12, reason: "combo" as const },
      { id: "c", name: "Mystery", usd: null, reason: "unpriced" as const },
    ];
    expect(skippedLine(skips)).toBe(
      "Not looked at: Serra Ascendant (no community roles yet), Thassa's Oracle (a combo piece).",
    );
    expect(skippedLine(skips, 1)).toBe(
      "Not looked at: Serra Ascendant (no community roles yet) and 1 more.",
    );
    expect(skippedLine([skips[2]])).toBeNull();
  });
});

describe("fitOptions — one to three of the route's rows", () => {
  it("priced, cheaper than the card, inside the per-card budget, never hidden — the route's order, three at most", () => {
    const rows = [
      alt("12.00"), // pricier than the card
      alt(null), // no price: no claim to save anything
      alt("3.00", [{ rule: "budget", severity: "flag" }]), // over the per-card budget
      alt("2.00", [{ rule: "game-changers", severity: "hide" }]),
      alt("10.00"), // the same price saves nothing
      alt("4.00", [{ rule: "game-changers", severity: "flag" }]), // a flag only (no target)
      alt("1.00"),
      alt("0.50"),
      alt("0.25"),
    ];
    const kept = fitOptions(10, rows);
    expect(kept.map((r) => r.cheapestUsd)).toEqual(["4.00", "1.00", "0.50"]);
    expect(kept).toHaveLength(FIT_OPTIONS);
  });
});

describe("planFit — the picks and the running total", () => {
  const considered: FitCard[] = PRICEY.map((c) => ({
    id: c.id,
    name: c.name,
    zone: "main",
    usd: c.cheapestUsd!,
  }));
  /** Every pricey card answered with three rows: the best-ranked at $1.00, two cheaper after it. */
  const answers = new Map(PRICEY.map((c) => [c.id, [alt("1.00"), alt("0.50"), alt("0.10")]]));

  it("the $300 fixture at $150: the fewest swaps of the priciest cards, best-ranked — at or under $150", () => {
    const plan = planFit({
      considered,
      answers,
      estimateUsd: 300,
      totalUsd: 150,
      overrides: new Map(),
    });
    expect(plan.fits).toBe(true);
    expect(plan.prefer).toBe("rank");
    expect(plan.afterUsd).toBeLessThanOrEqual(150);
    // Each swap saves the card's price less $1: 39 + 29 + 24 + 19 + 14 + 11 + 9 = 145 leaves
    // $155; the eighth (Pricey H, $8 → $1) reaches $148, and the plan stops there.
    expect(plan.afterUsd).toBe(148);
    const checked = plan.rows.filter((r) => r.chosen !== null);
    expect(checked).toHaveLength(8);
    expect(checked.map((r) => r.card.name)).toEqual(
      PRICEY.slice(0, checked.length).map((c) => c.name),
    );
    expect(plan.rows.slice(checked.length).every((r) => r.chosen === null && r.auto)).toBe(true);
    for (const row of checked) expect(row.chosen).toBe(answers.get(row.card.id)![0].cardId);
    expect(plan.swaps).toBe(checked.length);
    expect(plan.afterUsd).toBeCloseTo(300 - checked.reduce((n, r) => n + r.savingUsd, 0), 2);
  });

  it("says how close it gets when the alternatives can't reach the total", () => {
    const few = new Map([...answers].slice(0, 2));
    const plan = planFit({
      considered,
      answers: few,
      estimateUsd: 300,
      totalUsd: 150,
      overrides: new Map(),
    });
    expect(plan.fits).toBe(false);
    // Neither reaches it, so each card takes its cheapest option: 40 → 0.10, 30 → 0.10.
    expect(plan.prefer).toBe("price");
    expect(plan.afterUsd).toBe(230.2);
    expect(afterPhrase(plan.afterUsd, 150, plan.fits)).toBe("Gets you to $230 of your $150");
  });

  it("exactly at the total fits — at or under, D9's words", () => {
    const plan = planFit({
      considered,
      answers: new Map([[PRICEY[0].id, [alt("10.00")]]]),
      estimateUsd: 300,
      totalUsd: 270,
      overrides: new Map(),
    });
    expect(plan).toMatchObject({ afterUsd: 270, fits: true, swaps: 1 });
  });

  it("the cheapest fallback only when it gets closer: equal estimates keep the best-ranked", () => {
    const one = new Map([[PRICEY[0].id, [alt("1.00"), alt("1.00")]]]);
    const plan = planFit({
      considered,
      answers: one,
      estimateUsd: 300,
      totalUsd: 150,
      overrides: new Map(),
    });
    expect(plan.prefer).toBe("rank");
    expect(plan.rows[0].chosen).toBe(one.get(PRICEY[0].id)![0].cardId);
  });

  it("an alternative is never picked twice — the next card takes its next option", () => {
    const shared = alt("1.00");
    const twice = new Map([
      [PRICEY[0].id, [shared, alt("2.00")]],
      [PRICEY[1].id, [shared, alt("3.00")]],
    ]);
    const plan = planFit({
      considered,
      answers: twice,
      estimateUsd: 300,
      totalUsd: 100,
      overrides: new Map(),
    });
    expect(plan.rows[0].chosen).toBe(shared.cardId);
    expect(plan.rows[1].chosen).toBe(twice.get(PRICEY[1].id)![1].cardId);
  });

  it("the player's choices win: a kept card stays, a chosen option holds, and the sheet fills around them", () => {
    const plan = planFit({
      considered,
      answers,
      estimateUsd: 300,
      totalUsd: 250,
      overrides: new Map<string, string | null>([
        [PRICEY[0].id, null],
        [PRICEY[2].id, answers.get(PRICEY[2].id)![2].cardId],
      ]),
    });
    const row = (i: number) => plan.rows[i];
    expect(row(0)).toMatchObject({ chosen: null, auto: false, savingUsd: 0 });
    expect(row(2)).toMatchObject({ chosen: answers.get(PRICEY[2].id)![2].cardId, auto: false });
    expect(row(2).savingUsd).toBe(24.9);
    // 300 − 24.90 = 275.10, still over 250: the sheet checks Pricey B ($30 → $1) and stops.
    expect(row(1)).toMatchObject({ chosen: answers.get(PRICEY[1].id)![0].cardId, auto: true });
    expect(row(3)).toMatchObject({ chosen: null, auto: true });
    expect(plan.afterUsd).toBe(246.1);
    expect(plan.fits).toBe(true);
  });

  it("a player's pick that another player's pick already holds is dropped, never doubled", () => {
    const shared = alt("1.00");
    const both = new Map([
      [PRICEY[0].id, [shared]],
      [PRICEY[1].id, [shared]],
    ]);
    const plan = planFit({
      considered,
      answers: both,
      estimateUsd: 300,
      totalUsd: 290,
      overrides: new Map([
        [PRICEY[0].id, shared.cardId],
        [PRICEY[1].id, shared.cardId],
      ]),
    });
    expect(plan.rows.map((r) => r.chosen)).toEqual([shared.cardId, null]);
  });

  it("only answered cards are rows; a card answered with nothing cheaper is a row without options", () => {
    const plan = planFit({
      considered,
      answers: new Map([[PRICEY[0].id, [alt("99.00")]]]),
      estimateUsd: 300,
      totalUsd: 150,
      overrides: new Map(),
    });
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].options).toEqual([]);
    expect(plan).toMatchObject({ swaps: 0, fits: false, afterUsd: 300 });
  });
});

describe("fitList — one whole-list edit", () => {
  it("each card out and its pick in, in place: the row keeps its position, the new card comes bare", () => {
    const entries: EditorEntry[] = [
      { cardId: leader.id, zone: "commander", qty: 1, tags: [] },
      { cardId: PRICEY[0].id, zone: "main", qty: 1, tags: ["Ramp"], printingId: "p-1" },
      { cardId: plains.id, zone: "main", qty: 37, tags: [] },
      { cardId: PRICEY[1].id, zone: "main", qty: 1, tags: [] },
    ];
    const next = fitList(entries, commander, [
      { outId: PRICEY[0].id, inId: "in-a", zone: "main" },
      { outId: PRICEY[1].id, inId: "in-b", zone: "main" },
    ]);
    expect(next).toEqual([
      entries[0],
      { cardId: "in-a", zone: "main", qty: 1, tags: [] },
      entries[2],
      { cardId: "in-b", zone: "main", qty: 1, tags: [] },
    ]);
    // The input is untouched (the Undo restores it as it was).
    expect(entries[1].cardId).toBe(PRICEY[0].id);
  });
});
