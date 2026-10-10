/**
 * Y6a — what one more card does to the read (WAVE4 D7): Magic's `impact`,
 * the goals check behind Suggestions. Three claims:
 *
 * 1. It agrees with the read itself: for every rule, `impact` with no target
 *    says what `assessBracket` over the list plus the card says — the new
 *    minimum, and every question the card would open (so no rule is
 *    derived twice, and none can drift from the engine).
 * 2. With a target it names exactly the reasons a card sits above it —
 *    D7's lines, reworded without notation (D0), each naming its source.
 * 3. The declared `flagPaths` are all a read takes from `attrs`: the server
 *    builds its cards from them alone.
 */
import { describe, expect, it } from "vitest";

import type {
  BracketAnswers,
  BracketConflict,
  BracketFreshness,
  BracketRead,
  CompleteCombo,
} from "../types";
import type { MtgAttrs } from "./attrs";
import { MTG_BRACKET_FLAG_PATHS, assessBracket, mtgBracketImpact, mtgBrackets } from "./brackets";
import { card, cardMap, commanderDeck, entry, fillers, type MtgCard } from "./test-fixtures";

const FRESH: BracketFreshness = {
  readAt: "2026-10-09T12:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: "2026-10-09T04:54:15.655Z" },
    landDenial: { state: "ok", asOf: "2026-10-09T04:54:15.655Z" },
    extraTurns: { state: "ok", asOf: "2026-10-09T04:54:15.655Z" },
    combos: { state: "ok", asOf: "2026-10-09T04:55:53.189Z" },
  },
};

const named = (name: string, attrs: Partial<MtgAttrs> = {}, over: Partial<MtgCard> = {}) =>
  card({
    ...over,
    name,
    externalKey: `oracle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    attrs: { type_line: "Creature — Test", oracle_text: "Some rules text.", ...attrs },
  });

const commander = named(
  "Test Commander",
  { type_line: "Legendary Creature — Test" },
  { isLeaderCandidate: true },
);
const gc = ["Rhystic Study", "Cyclonic Rift", "Smothering Tithe", "Underworld Breach"].map((n) =>
  named(n, { game_changer: true }),
);
const fifthGc = named("Demonic Tutor", { game_changer: true });
const armageddon = named("Armageddon", { mld: "clear" });
const liliana = named("Liliana of the Veil", { mld: "edge" });
const turns = ["Time Warp", "Temporal Manipulation", "Capture of Jingzhou"].map((n) =>
  named(n, { extra_turn: true }),
);
const plain = named("Arcane Signet");
const [pieceA, pieceB, pieceC] = ["Piece A", "Piece B", "Piece C"].map((n) => named(n));

/** A finished Commander list: the commander, these cards, filler to 99 — so the read isn't a draft. */
function list(specials: MtgCard[], commanders: MtgCard[] = [commander]) {
  const fill = fillers(100 - commanders.length - specials.length);
  return {
    deck: commanderDeck(
      commanders,
      [...specials, ...fill].map((c) => entry(c)),
    ),
    cards: cardMap([...commanders, ...specials, ...fill]),
  };
}
type Spec = ReturnType<typeof list>;

function combo(
  key: string,
  pieces: MtgCard[],
  over: Partial<Omit<CompleteCombo, "key" | "cardPieces">> = {},
): CompleteCombo {
  return {
    key,
    cardPieces: pieces.map((c) => c.id).sort(),
    templates: [],
    tag: "E",
    relevant: true,
    results: ["Win the game"],
    popularity: 1000,
    ...over,
  };
}

interface Case {
  spec: Spec;
  add: MtgCard;
  combos?: CompleteCombo[];
  completes?: CompleteCombo[];
  answers?: BracketAnswers | null;
}

function impact(c: Case, targetLevel: number | null = null): BracketConflict[] {
  const input = {
    deck: c.spec.deck,
    cards: c.spec.cards,
    combos: c.combos ?? [],
    freshness: FRESH,
    targetLevel,
    answers: c.answers ?? null,
  };
  return mtgBracketImpact({
    ...input,
    read: assessBracket(input),
    card: c.add,
    completes: c.completes ?? [],
  });
}

/** The read of the list with the card in it — the swap the card's main-deck slot takes from a filler. */
function readWith(c: Case): { before: BracketRead; after: BracketRead } {
  const base = {
    combos: c.combos ?? [],
    freshness: FRESH,
    targetLevel: null,
    answers: c.answers ?? null,
  };
  const before = assessBracket({ deck: c.spec.deck, cards: c.spec.cards, ...base });
  const main = [...c.spec.deck.zones.main];
  main[main.length - 1] = entry(c.add); // keep the list at 100 (never a draft)
  const deck = { ...c.spec.deck, zones: { ...c.spec.deck.zones, main } };
  const cards = new Map(c.spec.cards).set(c.add.id, c.add);
  const after = assessBracket({
    deck,
    cards,
    ...base,
    combos: [...(c.combos ?? []), ...(c.completes ?? [])],
  });
  return { before, after };
}

const ruleOf = (questionId: string) => questionId.slice(0, questionId.indexOf(":"));

// --- The cases: every rule, at the counts that move it ---------------------------------------

const twoCard = combo("two", [pieceA, plain], { tag: "E" });
const withCommander = combo("cmd", [commander, plain], { tag: "E" });
const ruthless = combo("r", [pieceA, pieceB, plain], { tag: "R", relevant: false });
const spicy = combo("s", [pieceA, pieceB, plain], { tag: "S", relevant: false });
const oddball = combo("o", [pieceA, pieceB, plain], { tag: "O", relevant: false });
const casual = combo("c", [pieceA, pieceB, plain], { tag: "C", relevant: false });
const exhibition = combo("e", [pieceA, pieceB, plain], { tag: "E", relevant: false });
const template = combo("tpl", [pieceA, plain], {
  tag: "S",
  relevant: true,
  templates: ["Persist Creature"],
});
const landCombo = combo("ld", [pieceA, pieceB, plain], {
  tag: "C",
  relevant: false,
  results: ["Mass Land Denial"],
});

const CASES: [string, Case][] = [
  ["a card with no flag and no combo", { spec: list([pieceA]), add: plain }],
  ["a first Game Changer", { spec: list([]), add: gc[0] }],
  ["a second Game Changer", { spec: list(gc.slice(0, 1)), add: gc[1] }],
  ["a fourth Game Changer", { spec: list(gc.slice(0, 3)), add: gc[3] }],
  ["a fifth Game Changer", { spec: list(gc), add: fifthGc }],
  ["clear land denial", { spec: list([]), add: armageddon }],
  ["edge land denial", { spec: list([]), add: liliana }],
  ["edge land denial in a list already at 4", { spec: list(gc), add: liliana }],
  ["a first extra-turn card", { spec: list([]), add: turns[0] }],
  ["a second extra-turn card", { spec: list(turns.slice(0, 1)), add: turns[1] }],
  ["a third extra-turn card", { spec: list(turns.slice(0, 2)), add: turns[2] }],
  ["a two-card combo", { spec: list([pieceA, pieceB]), add: plain, completes: [twoCard] }],
  [
    "a combo with the commander (E)",
    { spec: list([pieceA, pieceB]), add: plain, completes: [withCommander] },
  ],
  ["a Spellbook-4 combo (R)", { spec: list([pieceA, pieceB]), add: plain, completes: [ruthless] }],
  ["an S combo", { spec: list([pieceA, pieceB]), add: plain, completes: [spicy] }],
  ["an O combo", { spec: list([pieceA, pieceB]), add: plain, completes: [oddball] }],
  ["a C combo", { spec: list([pieceA, pieceB]), add: plain, completes: [casual] }],
  [
    "an E combo of three (nothing)",
    { spec: list([pieceA, pieceB]), add: plain, completes: [exhibition] },
  ],
  [
    "a combo that needs a template",
    { spec: list([pieceA, pieceB]), add: plain, completes: [template] },
  ],
  [
    "a combo whose result is mass land denial",
    { spec: list([pieceA, pieceB]), add: plain, completes: [landCombo] },
  ],
  [
    "a Game Changer that also completes a two-card combo",
    {
      spec: list([pieceA, pieceB]),
      add: gc[0],
      completes: [combo("gc-two", [pieceA, gc[0]], { tag: "E" })],
    },
  ],
  [
    "a combo in a list a combo already holds at 3",
    {
      spec: list([pieceA, pieceB, pieceC]),
      add: plain,
      combos: [combo("held", [pieceB, pieceC], { tag: "E" })],
      completes: [twoCard],
    },
  ],
];

describe("impact agrees with the read of the list plus the card (no target)", () => {
  it.each(CASES)("%s", (_label, c) => {
    const { before, after } = readWith(c);
    const out = impact(c);
    const firm = out.filter((x) => x.why.startsWith("Would "));
    const calls = out.filter((x) => x.why.startsWith("Could "));
    expect(firm.length + calls.length).toBe(out.length);

    // The minimum it would prove is the read's.
    expect(after.minimum).toBe(Math.max(before.minimum, ...firm.map((x) => x.level)));
    // Each "would" is a level the read reaches, above the line as it reads now.
    for (const x of firm) expect(x.level).toBeGreaterThan(before.minimum);

    // Every question the card would open has its rule named …
    const before_ = new Set(before.review.map((q) => q.id));
    const opened = after.review.filter((q) => !before_.has(q.id));
    for (const q of opened) expect(out.map((x) => x.rule)).toContain(ruleOf(q.id));
    // … and every "could" is one of them, at what a yes would mean.
    for (const x of calls) {
      expect(opened.some((q) => ruleOf(q.id) === x.rule && q.raisesTo === x.level)).toBe(true);
    }
  });

  it("a card already in the list changes nothing — even against a target it's over", () => {
    expect(impact({ spec: list(gc.slice(0, 1)), add: gc[0] })).toEqual([]);
    expect(impact({ spec: list(gc.slice(0, 1)), add: gc[0] }, 2)).toEqual([]);
  });

  it("the line as it reads now is the yardstick: a Game Changer adds nothing to a list the answers already put at 4", () => {
    const c: Case = {
      spec: list([]),
      add: gc[0],
      answers: { rulesetVersion: 1, play: { fast: "yes" } },
    };
    expect(impact(c)).toEqual([]);
    expect(impact({ ...c, answers: null }).map((x) => x.level)).toEqual([3]);
  });
});

// --- With a target: the reasons it sits above it (WAVE4 D7, E's acceptance) ------------------

const whys = (c: Case, target: number) => impact(c, target).map((x) => x.why);

describe("against a target — D7's lines, in plain words", () => {
  it("a Game Changer: none at 1 and 2; a fourth at 3; nothing from 4", () => {
    expect(whys({ spec: list([]), add: gc[0] }, 2)).toEqual([
      "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
    ]);
    expect(whys({ spec: list([]), add: gc[0] }, 1)).toEqual([
      "A Game Changer (Wizards' list) — your Bracket 1 target allows none",
    ]);
    expect(whys({ spec: list(gc.slice(0, 2)), add: gc[2] }, 3)).toEqual([]);
    expect(whys({ spec: list(gc.slice(0, 3)), add: gc[3] }, 3)).toEqual([
      "A fourth Game Changer (Wizards' list) — your Bracket 3 target allows up to three",
    ]);
    expect(whys({ spec: list(gc), add: fifthGc }, 4)).toEqual([]);
  });

  it("mass land denial at 1–3, a possible one as the player's call", () => {
    expect(whys({ spec: list([]), add: armageddon }, 3)).toEqual([
      "Mass land denial — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
    ]);
    expect(whys({ spec: list([]), add: liliana }, 2)).toEqual([
      "Possible mass land denial, your call — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
    ]);
    // Judged on the card, not the list: a list already over its target still hides it.
    expect(whys({ spec: list(gc), add: liliana }, 2)).toHaveLength(1);
    expect(whys({ spec: list([]), add: armageddon }, 4)).toEqual([]);
  });

  it("extra turns: none at 1; a second card at 2–3 (chaining is the call); any at 4", () => {
    expect(whys({ spec: list([]), add: turns[0] }, 1)).toEqual([
      "An extra-turn card — Bracket 1 expects none (Scryfall Tagger)",
    ]);
    expect(whys({ spec: list([]), add: turns[0] }, 2)).toEqual([]);
    expect(whys({ spec: list(turns.slice(0, 1)), add: turns[1] }, 2)).toEqual([
      "A second extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
    ]);
    expect(whys({ spec: list(turns.slice(0, 2)), add: turns[2] }, 3)).toEqual([
      "A third extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
    ]);
    // At 1 the firm reason leads: the cards prove it.
    expect(whys({ spec: list(turns.slice(0, 1)), add: turns[1] }, 1)).toEqual([
      "An extra-turn card — Bracket 1 expects none (Scryfall Tagger)",
    ]);
    expect(whys({ spec: list(turns.slice(0, 2)), add: turns[2] }, 4)).toEqual([]);
  });

  it("combo completions above the target — two-card, a combo's own rating, a call, a template", () => {
    const at = (completes: CompleteCombo[], target: number) =>
      whys({ spec: list([pieceA, pieceB]), add: plain, completes }, target);
    expect(at([twoCard], 2)).toEqual([
      "Completes a two-card combo — Wizards expects none at Brackets 1 and 2 (Commander Spellbook)",
    ]);
    expect(at([twoCard], 3)).toEqual([]);
    expect(at([ruthless], 3)).toEqual([
      "Completes a combo that alone makes a deck at least Bracket 4 (Commander Spellbook)",
    ]);
    // S reads "3 or 4": at 3 the open 4 is the call; at 2 the firm 3 leads.
    expect(at([spicy], 3)).toEqual([
      "Completes a combo that may make a deck Bracket 4 — your call (Commander Spellbook)",
    ]);
    expect(at([spicy], 2)).toEqual([
      "Completes a combo that alone makes a deck at least Bracket 3 (Commander Spellbook)",
    ]);
    expect(at([withCommander], 3)).toEqual([
      "Completes a combo that may make a deck Bracket 4 — your call (Commander Spellbook)",
    ]);
    expect(at([template], 2)).toEqual([
      "Completes a combo that may make a deck Bracket 4 — your call (Commander Spellbook)",
    ]);
    expect(at([exhibition], 1)).toEqual([]);
    expect(at([landCombo], 3)).toEqual([
      "Completes a combo that alone makes a deck at least Bracket 4 (Commander Spellbook)",
    ]);
  });

  it("firm before a question within a rule, whichever combo comes first", () => {
    const c: Case = { spec: list([pieceA, pieceB]), add: plain, completes: [template, twoCard] };
    expect(whys(c, 2)).toEqual([
      "Completes a two-card combo — Wizards expects none at Brackets 1 and 2 (Commander Spellbook)",
    ]);
    expect(whys({ ...c, completes: [twoCard, template] }, 2)).toEqual(whys(c, 2));
  });

  it("one line per rule: a Game Changer that completes a two-card combo names both", () => {
    const c: Case = {
      spec: list([pieceA, pieceB]),
      add: gc[0],
      completes: [combo("gc-two", [pieceA, gc[0]], { tag: "E" })],
    };
    expect(impact(c, 2).map((x) => [x.rule, x.level])).toEqual([
      ["game-changers", 3],
      ["combo", 3],
    ]);
  });

  it("a question the player answered counts as answered: no settles it, yes makes it firm", () => {
    const edge: Case = { spec: list([]), add: liliana };
    const id = `land-denial:${liliana.externalKey}`;
    expect(whys({ ...edge, answers: { rulesetVersion: 1, calls: { [id]: "no" } } }, 2)).toEqual([]);
    expect(whys({ ...edge, answers: { rulesetVersion: 1, calls: { [id]: "yes" } } }, 2)).toEqual([
      "Mass land denial — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
    ]);
    const chain = `extra-turns:${[turns[0].externalKey, turns[1].externalKey].sort().join("+")}`;
    expect(
      whys(
        {
          spec: list(turns.slice(0, 1)),
          add: turns[1],
          answers: { rulesetVersion: 1, calls: { [chain]: "no" } },
        },
        2,
      ),
    ).toEqual([]);
  });
});

describe("without a target — only what would raise the line", () => {
  it("names the level it would make the deck, and the call when it's the player's", () => {
    expect(impact({ spec: list([]), add: gc[0] }).map((x) => x.why)).toEqual([
      "Would make this deck at least Bracket 3 — a Game Changer (Wizards' list)",
    ]);
    expect(impact({ spec: list(gc.slice(0, 1)), add: gc[1] })).toEqual([]);
    expect(impact({ spec: list(gc.slice(0, 3)), add: gc[3] }).map((x) => x.why)).toEqual([
      "Would make this deck at least Bracket 4 — a fourth Game Changer (Wizards' list)",
    ]);
    expect(impact({ spec: list(turns.slice(0, 1)), add: turns[1] }).map((x) => x.why)).toEqual([
      "Could make this deck Bracket 4 — a second extra-turn card, if these turns chain (Scryfall Tagger)",
    ]);
    expect(
      impact({ spec: list([pieceA, pieceB]), add: plain, completes: [twoCard] }).map((x) => x.why),
    ).toEqual([
      "Would make this deck at least Bracket 3 — completes a two-card combo (Commander Spellbook)",
    ]);
    expect(impact({ spec: list([]), add: liliana }).map((x) => x.why)).toEqual([
      "Could make this deck Bracket 4 — possible mass land denial, your call (Scryfall Tagger)",
    ]);
  });
});

// --- The declared flags are all a read takes ----------------------------------------------------

describe("flagPaths — all a read takes from attrs", () => {
  const keep = new Set<string>(MTG_BRACKET_FLAG_PATHS.map(([key]) => key));
  const strip = (c: MtgCard): MtgCard => ({
    ...c,
    attrs: Object.fromEntries(
      Object.entries(c.attrs).filter(([k]) => keep.has(k)),
    ) as unknown as MtgAttrs,
  });

  it("is the adapter's declaration", () => {
    expect(mtgBrackets.flagPaths).toEqual([["game_changer"], ["mld"], ["extra_turn"]]);
  });

  it.each(CASES)("the read and the impact are the same over flags alone: %s", (_label, c) => {
    const lean: Case = {
      ...c,
      spec: {
        deck: c.spec.deck,
        cards: new Map([...c.spec.cards].map(([id, x]) => [id, strip(x)])),
      },
      add: strip(c.add),
    };
    const full = readWith(c);
    const flagsOnly = readWith(lean);
    expect(JSON.stringify(flagsOnly.after)).toBe(JSON.stringify(full.after));
    expect(impact(lean, 2)).toEqual(impact(c, 2));
    expect(impact(lean)).toEqual(impact(c));
  });
});

// --- D0's copy guard over every line impact can say ---------------------------------------------

describe("copy guard (WAVE4 D0) — every goals line", () => {
  function everyLine(): string[] {
    const lines: string[] = [];
    for (const [, c] of CASES) {
      for (const target of [null, 1, 2, 3, 4, 5]) {
        for (const x of impact(c, target)) lines.push(x.why, x.source);
      }
    }
    return lines;
  }

  it("fires every rule in both voices (the guard reads real output)", () => {
    const lines = everyLine();
    for (const expected of [
      "Game Changer",
      "Mass land denial",
      "Possible mass land denial",
      "extra-turn card",
      "two-card combo",
      "your call",
      "Would make this deck",
      "Could make this deck",
    ]) {
      expect(lines.some((l) => l.includes(expected))).toBe(true);
    }
  });

  it("no line says approve; no Spellbook tag name; no notation", () => {
    const lines = everyLine();
    expect(lines.filter((l) => /approv/i.test(l))).toEqual([]);
    expect(lines.filter((l) => /ruthless|spicy|powerful|oddball|casual/i.test(l))).toEqual([]);
    expect(lines.filter((l) => /\d\+|est\./i.test(l))).toEqual([]);
  });
});
