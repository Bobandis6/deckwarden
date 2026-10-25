/**
 * BRACKET-FIT — the planner: which cards can go, their options, the
 * fewest cover (checked against brute force on generated instances and on
 * fixture lists), the picks (no incoming card twice), the player's calls,
 * the asks and the ask limit, and the reasons for what stays. The end of
 * the file runs the whole loop on Magic fixture lists against the real
 * read: every fix the plan meets is gone from the list after its swaps.
 */
import { describe, expect, it } from "vitest";

import { fitList } from "@/lib/recommend/fit";
import type { EditorEntry } from "@/lib/decks/editor-state";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { basicLands, card, cardMap, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFix, BracketFreshness, CompleteCombo } from "@/lib/games/types";

import {
  fewestCover,
  NO_OVERRIDES,
  planTargetFit,
  targetFitCards,
  targetFitDoor,
  targetFitFixes,
  targetFitOptions,
  type CoverDemand,
  type TargetFitAnswer,
  type TargetFitCard,
  type TargetFitOverrides,
  type TargetFitRow,
} from "./target-fit";

const mtg = getAdapter("mtg");
const swap = mtg.recommend!.swap!;

// --- Small helpers ----------------------------------------------------------------------

/** A plan card that can go (or not), by id = name. */
const pc = (id: string, block: TargetFitCard["block"] = null): TargetFitCard => ({
  id,
  name: id,
  zone: "main",
  qty: 1,
  block,
});
const cardsOf = (...list: TargetFitCard[]) => new Map(list.map((c) => [c.id, c]));
const fix = (factor: string, remove: number, from: string[]): BracketFix => ({
  factor,
  remove,
  from,
});
let rowSeq = 0;
const row = (over: Partial<TargetFitRow> = {}): TargetFitRow => ({
  cardId: `alt-${++rowSeq}`,
  name: `Alt ${rowSeq}`,
  cheapestUsd: "1.00",
  shared: ["ramp"],
  conflicts: [],
  ...over,
});
const done = (...rows: TargetFitRow[]): TargetFitAnswer<TargetFitRow> => ({ status: "done", rows });
const answersOf = (entries: [string, TargetFitAnswer<TargetFitRow>][]) => new Map(entries);
const overrides = (o: Partial<TargetFitOverrides>): TargetFitOverrides => ({
  ...NO_OVERRIDES,
  ...o,
});

/** The fewest cards meeting every demand, over every subset (bitmasks: up to 20 cards). */
function bruteMin(
  demands: readonly CoverDemand[],
  forced: ReadonlySet<string> = new Set(),
): number {
  const ids = [...new Set(demands.flatMap((d) => d.cards))];
  if (ids.length > 20) throw new Error(`bruteMin: ${ids.length} cards is too many`);
  const bit = new Map(ids.map((id, i) => [id, 1 << i]));
  const masks = demands.map((d) => [...new Set(d.cards)].reduce((m, id) => m | bit.get(id)!, 0));
  const need = masks.map((m, i) => Math.min(demands[i].need, popcount(m)));
  const must = [...forced].reduce((m, id) => m | (bit.get(id) ?? 0), 0);
  let best = Infinity;
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    if ((mask & must) !== must) continue;
    const size = popcount(mask);
    if (size >= best) continue;
    if (masks.every((m, i) => popcount(mask & m) >= need[i])) best = size;
  }
  return best;
}
function popcount(n: number): number {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
}
const meets = (demands: readonly CoverDemand[], chosen: readonly string[]) =>
  demands.every(
    (d) =>
      new Set(d.cards.filter((c) => chosen.includes(c))).size >=
      Math.min(d.need, new Set(d.cards).size),
  );

/** A seeded generator (mulberry32), so a failing instance can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Which cards can go -----------------------------------------------------------------

describe("targetFitCards — which of a fix's cards can go out", () => {
  const roled = (name: string, over: Partial<MtgCard> = {}) =>
    card({
      name,
      ...over,
      attrs: { type_line: "Artifact", oracle_text: "", roles: ["ramp"] as never },
    });
  const vault = roled("Mana Vault", { primaryType: "Artifact" });
  const cradle = roled("Gaea's Cradle", { primaryType: "Land" });
  const bare = card({ name: "Rhystic Study", primaryType: "Enchantment" });
  const retired = card({
    name: "Old Roles",
    primaryType: "Enchantment",
    attrs: { type_line: "Enchantment", oracle_text: "", roles: ["no-such-role"] as never },
  });
  const twice = roled("Twice Card");
  const entries = [
    { cardId: vault.id, zone: "main", qty: 1 },
    { cardId: cradle.id, zone: "main", qty: 1 },
    { cardId: bare.id, zone: "main", qty: 1 },
    { cardId: retired.id, zone: "main", qty: 1 },
    { cardId: twice.id, zone: "main", qty: 2 },
  ];
  const cards = cardMap([vault, cradle, bare, retired, twice]);
  const all = [vault, cradle, bare, retired, twice].map((c) => c.id);

  it("a main-list card the adapter offers, one copy, a declared role: it can go; the rest say why not", () => {
    const got = targetFitCards({
      fixes: [fix("game-changers", 5, all)],
      entries,
      cards,
      format: COMMANDER,
      swap,
    });
    expect(Object.fromEntries([...got.values()].map((c) => [c.name, c.block]))).toEqual({
      "Mana Vault": null,
      "Gaea's Cradle": "not-offered",
      "Rhystic Study": "no-roles",
      // A retired or unknown key is no role.
      "Old Roles": "no-roles",
      "Twice Card": "copies",
    });
    expect(got.get(vault.id)).toEqual({
      id: vault.id,
      name: "Mana Vault",
      zone: "main",
      qty: 1,
      block: null,
    });
  });

  it("a card with no entry in a counted non-leader zone can't go (the tokens zone, a commander)", () => {
    const got = targetFitCards({
      fixes: [fix("land-denial", 1, [vault.id])],
      entries: [{ cardId: vault.id, zone: "tokens", qty: 1 }],
      cards,
      format: COMMANDER,
      swap,
    });
    expect(got.get(vault.id)?.block).toBe("not-offered");
    expect(got.get(vault.id)?.zone).toBeNull();
  });
});

describe("targetFitOptions — the route's rows, none hidden, none over the budget", () => {
  it("keeps the route's order and the first three; a hidden or over-budget row is never an option", () => {
    const [a, b, c, d] = [row(), row(), row(), row()];
    const hidden = row({ conflicts: [{ rule: "game-changers", severity: "hide" }] });
    const pricey = row({ conflicts: [{ rule: "budget", severity: "flag" }] });
    expect(targetFitOptions([hidden, a, pricey, b, c, d])).toEqual([a, b, c]);
    // The price itself is no rule: a dearer card than the one going out is fine.
    const dear = row({ cheapestUsd: "80.00" });
    expect(targetFitOptions([dear])).toEqual([dear]);
  });
});

// --- The cover --------------------------------------------------------------------------

describe("fewestCover — the fewest cards meeting every fix", () => {
  it("every card a fix can't do without goes first, then the most unmet need: one card serving two fixes counts twice", () => {
    const got = fewestCover({
      demands: [
        { need: 2, cards: ["A", "B"] }, // all of them
        { need: 1, cards: ["C", "D"] },
        { need: 1, cards: ["D", "E"] },
      ],
      order: ["A", "B", "C", "D", "E"],
    });
    expect(got).toEqual({ cards: ["A", "B", "D"], exact: true });
  });

  it("ties go to the earlier card in the order", () => {
    const demands = [{ need: 1, cards: ["X", "Y"] }];
    expect(fewestCover({ demands, order: ["X", "Y"] }).cards).toEqual(["X"]);
    expect(fewestCover({ demands, order: ["Y", "X"] }).cards).toEqual(["Y"]);
  });

  it("the greedy alone isn't always the fewest: one card in four combos against two cards in three each", () => {
    // A serves 1, 2, 4 and 5; B serves 1 to 3; C serves 4 to 6. The greedy takes A, then two more.
    const demands = [
      { need: 1, cards: ["A", "B"] },
      { need: 1, cards: ["A", "B"] },
      { need: 1, cards: ["B", "D"] },
      { need: 1, cards: ["A", "C"] },
      { need: 1, cards: ["A", "C"] },
      { need: 1, cards: ["C", "E"] },
    ];
    const got = fewestCover({ demands, order: ["A", "B", "C", "D", "E"] });
    expect(got).toEqual({ cards: ["B", "C"], exact: true });
    expect(bruteMin(demands)).toBe(2);
  });

  it("forced cards stay in, whatever they serve; a demand bigger than its cards takes them all", () => {
    expect(
      fewestCover({
        demands: [{ need: 1, cards: ["A", "B"] }],
        forced: new Set(["B"]),
        order: ["A", "B"],
      }).cards,
    ).toEqual(["B"]);
    expect(
      fewestCover({ demands: [{ need: 5, cards: ["A", "B"] }], order: ["A", "B"] }).cards,
    ).toEqual(["A", "B"]);
    // A card outside the order is never taken.
    expect(fewestCover({ demands: [{ need: 1, cards: ["Z"] }], order: [] }).cards).toEqual([]);
  });

  it("brute force: on 4,000 generated instances the count is the exact minimum and the cover meets every fix", () => {
    const next = rng(20261024);
    const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
    let checked = 0;
    let greedyMissed = 0;
    for (let n = 0; n < 4000; n++) {
      const size = int(3, 12);
      const ids = Array.from({ length: size }, (_, i) => `c${i}`);
      const pickSome = (k: number) => [...ids].sort(() => next() - 0.5).slice(0, k);
      const demands: CoverDemand[] = Array.from({ length: int(1, 7) }, () => {
        const kind = next();
        if (kind < 0.55) return { need: 1, cards: pickSome(int(1, 4)) };
        if (kind < 0.85) {
          const cards = pickSome(int(1, 6));
          return { need: int(1, cards.length + 1), cards };
        }
        const cards = pickSome(int(1, 3));
        return { need: cards.length, cards };
      });
      const forced = new Set(next() < 0.3 ? pickSome(int(1, 2)) : []);
      const order = [...ids].sort(() => next() - 0.5);
      const got = fewestCover({ demands, forced, order });
      expect(got.exact).toBe(true);
      expect(meets(demands, got.cards)).toBe(true);
      for (const id of forced) {
        if (demands.some((d) => d.cards.includes(id))) expect(got.cards).toContain(id);
      }
      const min = bruteMin(demands, forced);
      expect(got.cards.length, JSON.stringify({ demands, forced: [...forced], order })).toBe(min);
      // How often the exact step mattered: the greedy with a budget of one node.
      if (fewestCover({ demands, forced, order, budget: 0 }).cards.length > min) greedyMissed++;
      checked++;
    }
    expect(checked).toBe(4000);
    // The branch and bound earns its keep: the greedy alone misses some.
    expect(greedyMissed).toBeGreaterThan(0);
  });

  it("past its node bound it says so and keeps the greedy's cover", () => {
    const demands = [
      { need: 1, cards: ["A", "B"] },
      { need: 1, cards: ["A", "B"] },
      { need: 1, cards: ["B", "D"] },
      { need: 1, cards: ["A", "C"] },
      { need: 1, cards: ["A", "C"] },
      { need: 1, cards: ["C", "E"] },
    ];
    const got = fewestCover({ demands, order: ["A", "B", "C", "D", "E"], budget: 0 });
    expect(got.exact).toBe(false);
    expect(meets(demands, got.cards)).toBe(true);
    expect(got.cards).toHaveLength(3);
  });
});

// --- The plan ---------------------------------------------------------------------------

describe("planTargetFit — the plan before any answer", () => {
  const cards = cardsOf(
    pc("Cyclonic Rift"),
    pc("Rhystic Study"),
    pc("Gaea's Cradle", "not-offered"),
    pc("Zealous Conscripts"),
  );
  const fixes = [
    fix("game-changers", 3, ["Cyclonic Rift", "Gaea's Cradle", "Rhystic Study"]),
    fix("combo:kiki", 1, ["Zealous Conscripts"]),
  ];

  it("the cards going out in plan order, all of them to ask; what can't go is named per fix", () => {
    const plan = planTargetFit({
      fixes,
      cards,
      answers: new Map(),
      asked: new Set(),
      canAsk: true,
    });
    expect(plan.outs.map((o) => o.id)).toEqual([
      "Cyclonic Rift",
      "Rhystic Study",
      "Zealous Conscripts",
    ]);
    expect(plan.outs.map((o) => o.fixes)).toEqual([
      ["game-changers"],
      ["game-changers"],
      ["combo:kiki"],
    ]);
    expect(plan.ask).toEqual(["Cyclonic Rift", "Rhystic Study", "Zealous Conscripts"]);
    expect(plan.waiting).toEqual([]);
    expect(plan.swaps).toBe(0);
    expect(plan.short).toEqual([
      {
        factor: "game-changers",
        short: 1,
        commander: 0,
        stays: [{ reason: "not-offered", ids: ["Gaea's Cradle"] }],
      },
    ]);
    expect(plan.exact).toBe(true);
  });

  it("asked cards wait; answers bring their options and picks", () => {
    const [a, b] = [row(), row()];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["Cyclonic Rift", done(a, b)],
        ["Rhystic Study", { status: "error", limited: true }],
      ]),
      asked: new Set(["Cyclonic Rift", "Rhystic Study", "Zealous Conscripts"]),
      canAsk: true,
    });
    expect(plan.ask).toEqual([]);
    expect(plan.waiting).toEqual(["Rhystic Study", "Zealous Conscripts"]);
    expect(plan.outs[0]).toMatchObject({
      id: "Cyclonic Rift",
      options: [a, b],
      pick: a,
      zone: "main",
    });
    expect(plan.swaps).toBe(1);
  });
});

describe("planTargetFit — the fewest, and which", () => {
  it("a Game Changer that is also a combo piece goes once for both", () => {
    const cards = cardsOf(pc("Rhystic Study"), pc("Thassa's Oracle"), pc("Demonic Consultation"));
    const fixes = [
      fix("game-changers", 1, ["Rhystic Study", "Thassa's Oracle"]),
      fix("combo:oracle", 1, ["Demonic Consultation", "Thassa's Oracle"]),
    ];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: new Map(),
      asked: new Set(),
      canAsk: true,
    });
    expect(plan.outs.map((o) => [o.id, o.fixes])).toEqual([
      ["Thassa's Oracle", ["game-changers", "combo:oracle"]],
    ]);
  });

  it("Remove A or B: A asked with none, so B goes and is asked next", () => {
    const cards = cardsOf(pc("A"), pc("B"));
    const fixes = [fix("combo:x", 1, ["A", "B"])];
    const first = planTargetFit({
      fixes,
      cards,
      answers: new Map(),
      asked: new Set(),
      canAsk: true,
    });
    expect(first.ask).toEqual(["A"]);
    const after = planTargetFit({
      fixes,
      cards,
      answers: answersOf([["A", done()]]),
      asked: new Set(["A"]),
      canAsk: true,
    });
    expect(after.outs.map((o) => o.id)).toEqual(["B"]);
    expect(after.ask).toEqual(["B"]);
    expect(after.short).toEqual([]);
    // Both with none: the fix is short, both named.
    const neither = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["A", done()],
        ["B", done(row({ conflicts: [{ rule: "combo", severity: "hide" }] }))],
      ]),
      asked: new Set(["A", "B"]),
      canAsk: true,
    });
    expect(neither.outs).toEqual([]);
    expect(neither.short).toEqual([
      { factor: "combo:x", short: 1, commander: 0, stays: [{ reason: "none", ids: ["A", "B"] }] },
    ]);
  });

  it("ties: a card known to have options, then one asked, then one not asked; then the most shared roles; then the name", () => {
    const cards = cardsOf(pc("Alpha"), pc("Bravo"), pc("Charlie"), pc("Delta"));
    const fixes = [fix("game-changers", 1, ["Alpha", "Bravo", "Charlie", "Delta"])];
    const pickOf = (answers: [string, TargetFitAnswer<TargetFitRow>][], asked: string[]) =>
      planTargetFit({
        fixes,
        cards,
        answers: answersOf(answers),
        asked: new Set(asked),
        canAsk: true,
      }).outs.map((o) => o.id);
    // Nothing known: the name.
    expect(pickOf([], [])).toEqual(["Alpha"]);
    // Asked (in flight) beats not asked.
    expect(pickOf([], ["Charlie"])).toEqual(["Charlie"]);
    // Known options beat both.
    expect(pickOf([["Delta", done(row())]], ["Charlie", "Delta"])).toEqual(["Delta"]);
    // Two known: the first option sharing more roles.
    expect(
      pickOf(
        [
          ["Bravo", done(row({ shared: ["ramp"] }))],
          ["Delta", done(row({ shared: ["ramp", "mana-rock"] }))],
        ],
        ["Bravo", "Delta"],
      ),
    ).toEqual(["Delta"]);
  });
});

describe("planTargetFit — the picks", () => {
  const cards = cardsOf(pc("A"), pc("B"));
  const fixes = [fix("game-changers", 2, ["A", "B"])];
  const asked = new Set(["A", "B"]);

  it("each takes its best-ranked option not coming in for another: never one card twice", () => {
    const [x, y] = [row(), row()];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["A", done(x, y)],
        ["B", done(x, y)],
      ]),
      asked,
      canAsk: true,
    });
    expect(plan.outs.map((o) => [o.id, o.pick?.cardId])).toEqual([
      ["A", x.cardId],
      ["B", y.cardId],
    ]);
  });

  it("a re-route gives every card one when any arrangement can: A moves to its second so B gets its only", () => {
    const [x, y] = [row(), row()];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["A", done(x, y)],
        ["B", done(x)],
      ]),
      asked,
      canAsk: true,
    });
    expect(plan.outs.map((o) => [o.id, o.pick?.cardId])).toEqual([
      ["A", y.cardId],
      ["B", x.cardId],
    ]);
  });

  it("the player's choice holds; a card whose only option it took is planned around like none", () => {
    const [x, y] = [row(), row()];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["A", done(x, y)],
        ["B", done(x)],
      ]),
      asked,
      canAsk: true,
      overrides: overrides({ picks: new Map([["A", x.cardId]]) }),
    });
    expect(plan.outs.map((o) => [o.id, o.pick?.cardId])).toEqual([["A", x.cardId]]);
    expect(plan.short).toEqual([
      { factor: "game-changers", short: 1, commander: 0, stays: [{ reason: "none", ids: ["B"] }] },
    ]);
  });
});

describe("planTargetFit — the player's calls", () => {
  const cards = cardsOf(pc("A"), pc("B"), pc("C"));
  const answers = answersOf([
    ["A", done(row())],
    ["B", done(row())],
    ["C", done(row())],
  ]);
  const asked = new Set(["A", "B", "C"]);

  it("keep: the card stays and another takes its place; keep them all and the fix says who kept what", () => {
    const fixes = [fix("game-changers", 1, ["A", "B", "C"])];
    const kept = planTargetFit({
      fixes,
      cards,
      answers,
      asked,
      canAsk: true,
      overrides: overrides({ keep: new Set(["A"]) }),
    });
    expect(kept.outs.map((o) => o.id)).toEqual(["B"]);
    expect(kept.kept).toEqual(["A"]);
    const all = planTargetFit({
      fixes,
      cards,
      answers,
      asked,
      canAsk: true,
      overrides: overrides({ keep: new Set(["A", "B", "C"]) }),
    });
    expect(all.outs).toEqual([]);
    expect(all.short[0].stays).toEqual([{ reason: "kept", ids: ["A", "B", "C"] }]);
  });

  it("swap another instead: a one-card fix offers its other pieces; the player's pick goes out instead", () => {
    const fixes = [fix("combo:x", 1, ["A", "B", "C"])];
    const plan = planTargetFit({ fixes, cards, answers, asked, canAsk: true });
    expect(plan.outs.map((o) => o.id)).toEqual(["A"]);
    expect(plan.instead.get("combo:x")).toEqual(["B", "C"]);
    const instead = planTargetFit({
      fixes,
      cards,
      answers,
      asked,
      canAsk: true,
      overrides: overrides({ keep: new Set(["A"]), swap: new Set(["C"]) }),
    });
    expect(instead.outs.map((o) => o.id)).toEqual(["C"]);
    expect(instead.instead.get("combo:x")).toEqual(["B"]);
  });

  it("no other piece is offered when the card going out serves another fix too", () => {
    const fixes = [fix("game-changers", 1, ["A"]), fix("combo:x", 1, ["A", "B"])];
    const plan = planTargetFit({ fixes, cards, answers, asked, canAsk: true });
    expect(plan.outs.map((o) => o.id)).toEqual(["A"]);
    expect(plan.instead.size).toBe(0);
  });
});

describe("planTargetFit — the ask limit", () => {
  it("past it, a card never asked about is planned around, named, and counted", () => {
    const cards = cardsOf(pc("A"), pc("B"), pc("C"), pc("D"));
    const fixes = [fix("combo:x", 1, ["A", "B"]), fix("combo:y", 1, ["C", "D"])];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([
        ["A", done()],
        ["C", done(row())],
      ]),
      asked: new Set(["A", "C"]),
      canAsk: false,
    });
    expect(plan.outs.map((o) => o.id)).toEqual(["C"]);
    expect(plan.ask).toEqual([]);
    expect(plan.short).toEqual([
      {
        factor: "combo:x",
        short: 1,
        commander: 0,
        stays: [
          { reason: "none", ids: ["A"] },
          { reason: "not-asked", ids: ["B"] },
        ],
      },
    ]);
    expect(plan.notAsked).toBe(1);
  });
});

describe("planTargetFit — every reason a card stays", () => {
  it("the commander's part, not offered, copies, no roles, none, kept, not asked", () => {
    const cards = cardsOf(
      pc("Land", "not-offered"),
      pc("Twice", "copies"),
      pc("Bare", "no-roles"),
      pc("Nothing"),
      pc("Mine"),
      pc("Later"),
    );
    const fixes = [fix("game-changers", 7, ["Land", "Twice", "Bare", "Nothing", "Mine", "Later"])];
    const plan = planTargetFit({
      fixes,
      cards,
      answers: answersOf([["Nothing", done()]]),
      asked: new Set(["Nothing"]),
      canAsk: false,
      overrides: overrides({ keep: new Set(["Mine"]) }),
    });
    expect(plan.outs).toEqual([]);
    expect(plan.short).toEqual([
      {
        factor: "game-changers",
        short: 7,
        commander: 1,
        stays: [
          { reason: "not-offered", ids: ["Land"] },
          { reason: "copies", ids: ["Twice"] },
          { reason: "no-roles", ids: ["Bare"] },
          { reason: "none", ids: ["Nothing"] },
          { reason: "kept", ids: ["Mine"] },
          { reason: "not-asked", ids: ["Later"] },
        ],
      },
    ]);
    // A kept card the plan never could take isn't a row.
    expect(plan.kept).toEqual(["Mine"]);
  });
});

// --- The whole loop on Magic lists, against the real read ---------------------------------

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: Object.fromEntries(
    ["gameChangers", "landDenial", "extraTurns", "combos"].map((f) => [
      f,
      { state: "ok", asOf: AT },
    ]),
  ),
};
const roles = ["card-draw"] as never;
const spell = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({
    primaryType: "Sorcery",
    ...over,
    name,
    attrs: { type_line: "Sorcery", oracle_text: "", roles, ...attrs },
  });
const kiki = spell(
  "Kiki-Jiki, Mirror Breaker",
  {},
  { isLeaderCandidate: true, primaryType: "Creature" },
);
const urza = spell(
  "Urza, Lord High Artificer",
  { game_changer: true },
  { isLeaderCandidate: true },
);
const conscripts = spell("Zealous Conscripts");
const rhystic = spell("Rhystic Study", { game_changer: true });
const rift = spell("Cyclonic Rift", { game_changer: true });
const tutor = spell("Demonic Tutor", { game_changer: true });
const tithe = spell("Smothering Tithe", { game_changer: true });
const thoracle = spell("Thassa's Oracle", { game_changer: true });
const consultation = spell("Demonic Consultation");
const armageddon = spell("Armageddon", { mld: "clear" });
const cradle = spell("Gaea's Cradle", { game_changer: true }, { primaryType: "Land" });
const noRoles = spell("Mystic Remora", { game_changer: true, roles: undefined });
const timeWarp = spell("Time Warp", { extra_turn: true });
const combo = (
  key: string,
  pieces: MtgCard[],
  over: Partial<CompleteCombo> = {},
): CompleteCombo => ({
  key,
  cardPieces: pieces.map((c) => c.id).sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite damage"],
  popularity: 1,
  ...over,
});

interface Fixture {
  label: string;
  commanders: MtgCard[];
  specials: MtgCard[];
  combos: CompleteCombo[];
}
const FIXTURES: Fixture[] = [
  {
    label: "Game Changers, a combo with the commander, land denial, an extra turn",
    commanders: [kiki],
    specials: [conscripts, rhystic, rift, tutor, tithe, armageddon, timeWarp],
    combos: [combo("kiki", [kiki, conscripts])],
  },
  {
    label: "a Game Changer combo piece, a land Game Changer, one with no roles",
    commanders: [kiki],
    specials: [rhystic, thoracle, consultation, cradle, noRoles, rift],
    combos: [combo("oracle", [thoracle, consultation])],
  },
  {
    label: "a Game Changer commander",
    commanders: [urza],
    specials: [rhystic, rift, tutor, tithe],
    combos: [],
  },
];

function fixtureList(f: Fixture) {
  const main = [...f.specials, ...basicLands(36), ...fillers(99 - f.specials.length - 36)];
  const entries: EditorEntry[] = [
    ...f.commanders.map((c) => ({ cardId: c.id, zone: "commander", qty: 1, tags: [] })),
    ...main.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: ["kept tag"] })),
  ];
  return { entries, cards: cardMap([...f.commanders, ...main]) };
}

describe("the whole loop on Magic lists, against the real read", () => {
  it.each(FIXTURES.flatMap((f) => [1, 2, 3].map((t) => [f.label, t, f] as const)))(
    "%s, target %i: the fewest swaps (brute force), and after them only what the plan named stays above",
    (_label, target, f) => {
      const { entries, cards } = fixtureList(f);
      const goals = { v: 1 as const, targetLevel: target };
      const read = mtg.brackets!.assess({
        deck: toDeckSnapshot("mtg", COMMANDER, entries),
        cards,
        combos: f.combos,
        freshness: FRESH,
        targetLevel: target,
      });
      const input = {
        adapter: mtg,
        format: COMMANDER,
        entries,
        cards,
        read,
        combos: f.combos,
        freshness: FRESH,
        goals,
      };
      const fixes = targetFitFixes(input);
      expect(fixes.map((x) => x.factor)).toEqual(read.conflicts);
      const fitCards = targetFitCards({ fixes, entries, cards, format: COMMANDER, swap });
      // Every card that can go answers with one stand-in: a card with no flag and no combo.
      const stand = new Map(
        [...fitCards.values()]
          .filter((c) => c.block === null)
          .map((c) => {
            const s = card({ name: `Stand-in for ${c.name}` });
            return [c.id, s] as const;
          }),
      );
      const answers = new Map(
        [...stand].map(([id, s]) => [
          id,
          done({
            cardId: s.id,
            name: s.name,
            cheapestUsd: "0.25",
            shared: ["card-draw"],
            conflicts: [],
          }),
        ]),
      );
      const plan = planTargetFit({
        fixes,
        cards: fitCards,
        answers,
        asked: new Set(answers.keys()),
        canAsk: true,
      });
      // The fewest: brute force over every subset of the cards that can go.
      const demands = fixes.map((x) => ({
        need: x.remove,
        cards: x.from.filter((id) => stand.has(id)),
      }));
      expect(plan.swaps).toBe(bruteMin(demands));
      expect(plan.exact).toBe(true);
      expect(targetFitDoor(input)).toBe(stand.size > 0);

      // After the swaps, in place: the size, the commander, the lands and the untouched rows hold.
      const after = fitList(
        entries,
        COMMANDER,
        plan.outs.map((o) => ({ outId: o.id, inId: o.pick!.cardId, zone: o.zone })),
      );
      expect(after).toHaveLength(entries.length);
      const out = new Set(plan.outs.map((o) => o.id));
      after.forEach((e, i) => {
        if (out.has(entries[i].cardId)) {
          expect(e).toEqual({
            cardId: stand.get(entries[i].cardId)!.id,
            zone: "main",
            qty: 1,
            tags: [],
          });
        } else {
          expect(e).toBe(entries[i]);
        }
      });
      const afterCards = new Map([...cards, ...[...stand.values()].map((s) => [s.id, s] as const)]);
      const afterRead = mtg.brackets!.assess({
        deck: toDeckSnapshot("mtg", COMMANDER, after),
        cards: afterCards,
        combos: f.combos,
        freshness: FRESH,
        targetLevel: target,
      });
      expect(afterRead.conflicts.sort()).toEqual(plan.short.map((s) => s.factor).sort());
    },
  );

  it("no target, or One Piece: no fixes and no door", () => {
    const { entries, cards } = fixtureList(FIXTURES[0]);
    const read = mtg.brackets!.assess({
      deck: toDeckSnapshot("mtg", COMMANDER, entries),
      cards,
      combos: [],
      freshness: FRESH,
    });
    const base = {
      adapter: mtg,
      format: COMMANDER,
      entries,
      cards,
      read,
      combos: [],
      freshness: FRESH,
    };
    expect(targetFitFixes({ ...base, goals: null })).toEqual([]);
    expect(targetFitDoor({ ...base, goals: null })).toBe(false);
    const op = getAdapter("optcg");
    expect(op.brackets).toBeUndefined();
    expect(targetFitDoor({ ...base, adapter: op, goals: { v: 1, targetLevel: 2 } })).toBe(false);
  });

  it("nothing that can go: no door", () => {
    const { entries, cards } = fixtureList({
      label: "",
      commanders: [kiki],
      specials: [cradle, noRoles],
      combos: [],
    });
    const read = mtg.brackets!.assess({
      deck: toDeckSnapshot("mtg", COMMANDER, entries),
      cards,
      combos: [],
      freshness: FRESH,
      targetLevel: 2,
    });
    expect(read.conflicts).toEqual(["game-changers"]);
    expect(
      targetFitDoor({
        adapter: mtg,
        format: COMMANDER,
        entries,
        cards,
        read,
        combos: [],
        freshness: FRESH,
        goals: { v: 1, targetLevel: 2 },
      }),
    ).toBe(false);
  });
});
