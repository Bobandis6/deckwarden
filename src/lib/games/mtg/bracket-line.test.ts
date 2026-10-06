/**
 * Y4a — the bracket line's words (WAVE4 D5): D5's table pinned word for word
 * from real reads (assessBracket over fixture lists), the lines Y4a adds
 * (a minimum of 2, a read that couldn't check everything, a card that isn't
 * legal, the shapes of a pending call), the sheet's links, and D0's copy
 * guard over every line the adapter can say.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { addMorePhrase, deckProgress } from "@/lib/decks/progress";

import type { BracketAnswers, BracketFreshness, BracketRead, CompleteCombo } from "../types";
import type { MtgAttrs } from "./attrs";
import { MTG_BRACKET_LINKS, mtgBracketLine } from "./bracket-line";
import { BRACKET_RULESET } from "./bracket-ruleset";
import { assessBracket, mtgBrackets } from "./brackets";
import { COMMANDER } from "./formats";
import { card, cardMap, commanderDeck, entry, fillers, type MtgCard } from "./test-fixtures";

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT, detail: "53 cards" },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT, detail: "bulk 7.1.4" },
  },
};

const named = (name: string, attrs: Partial<MtgAttrs> = {}, over: Partial<MtgCard> = {}) =>
  card({
    ...over,
    name,
    externalKey: `oracle:${name}`,
    attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs },
  });

const commander = named(
  "Test Commander",
  { type_line: "Legendary Creature — Test" },
  { isLeaderCandidate: true },
);
const rhystic = named("Rhystic Study", { game_changer: true });
const rift = named("Cyclonic Rift", { game_changer: true });
const tithe = named("Smothering Tithe", { game_changer: true });
const breach = named("Underworld Breach", { game_changer: true });
const liliana = named("Liliana of the Veil", { mld: "edge" });
const magus = named("Magus of the Balance", { mld: "edge" });
const timeWarp = named("Time Warp", { extra_turn: true });
const temporal = named("Temporal Manipulation", { extra_turn: true });
const dockside = named("Dockside Extortionist", {}, { legality: [{ status: "banned" }] });
const unglued = named("Unglued Oddity", {}, { legality: [{ status: "not_legal" }] });
const [pieceA, pieceB, pieceC] = ["A", "B", "C"].map((n) => named(`Piece ${n}`));

/** A Commander list: the commander, these cards, and filler up to `size`. */
function list(specials: MtgCard[], size = 100) {
  const fill = fillers(Math.max(0, size - 1 - specials.length));
  return {
    deck: commanderDeck(
      [commander],
      [...specials, ...fill].map((c) => entry(c)),
    ),
    cards: cardMap([commander, ...specials, ...fill]),
  };
}
type Spec = ReturnType<typeof list>;

function combo(key: string, pieces: MtgCard[], over: Partial<CompleteCombo> = {}): CompleteCombo {
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

interface ReadOptions {
  freshness?: BracketFreshness | null;
  answers?: BracketAnswers;
}

function read(
  spec: Spec,
  combos: CompleteCombo[] | null = [],
  over: ReadOptions = {},
): BracketRead {
  return assessBracket({
    deck: spec.deck,
    cards: spec.cards,
    combos,
    freshness: over.freshness === undefined ? FRESH : over.freshness,
    answers: over.answers,
  });
}

/** The line as the editor builds it: the read, the snapshot, core's progress phrase, the target. */
function line(spec: Spec, r: BracketRead, targetLevel: number | null = null): string {
  const entries = Object.entries(spec.deck.zones).flatMap(([zone, list]) =>
    list.map((e) => ({ ...e, zone })),
  );
  return mtgBracketLine(r, {
    deck: spec.deck,
    cards: spec.cards,
    progress: r.status === "draft" ? addMorePhrase(deckProgress(entries, COMMANDER).toGo) : null,
    targetLevel,
  });
}
const lineOf = (spec: Spec, combos?: CompleteCombo[] | null, over?: ReadOptions) =>
  line(spec, read(spec, combos, over));

describe("D5's line table, word for word", () => {
  it("nothing flagged", () => {
    expect(lineOf(list([]))).toBe("Bracket 1–2 · nothing here goes past Core");
  });

  it("a minimum of 3", () => {
    expect(lineOf(list([rhystic]))).toBe("At least Bracket 3 (Upgraded)");
  });

  it("a minimum of 4", () => {
    expect(lineOf(list([rhystic, rift, tithe, breach]))).toBe("At least Bracket 4 (Optimized)");
  });

  it("your call pending — a combo Commander Spellbook rates 3 or 4", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const s = combo("2552-3263", [pieceA, pieceB, pieceC], { tag: "S", relevant: false });
    const r = read(spec, [s]);
    expect(r.status).toBe("review");
    expect(line(spec, r)).toBe("Bracket 3 or 4 — one combo is your call");
  });

  it("with answers — the call answered yes", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const s = combo("2552-3263", [pieceA, pieceB, pieceC], { tag: "S", relevant: false });
    const r = read(spec, [s], {
      answers: { rulesetVersion: BRACKET_RULESET.version, calls: { "combo:2552-3263": "yes" } },
    });
    expect(r).toMatchObject({ status: "read", suggested: 4 });
    expect(line(spec, r)).toBe("Bracket 4 (Optimized) — from the cards and your answers");
  });

  it("draft — what the card data proves so far, with core's progress phrase", () => {
    const spec = list([rhystic], 66);
    const r = read(spec);
    expect(r.status).toBe("draft");
    expect(line(spec, r)).toBe("Bracket: add 34 more cards · 1 Game Changer so far");
  });

  it("a banned card", () => {
    const spec = list([dockside]);
    const r = read(spec);
    expect(r.status).toBe("blocked");
    expect(line(spec, r)).toBe("Bracket read needs a legal list · 1 banned card");
  });
});

describe("Y4b — the target beside the read, and answers with a call still open", () => {
  const v = BRACKET_RULESET.version;
  const s1 = combo("s1", [pieceA, pieceB, pieceC], { tag: "S", relevant: false });
  const [pieceD, pieceE, pieceF] = ["D", "E", "F"].map((n) => named(`Piece ${n}`));
  const s2 = combo("s2", [pieceD, pieceE, pieceF], { tag: "S", relevant: false });

  it("D5's 'Target below the cards' row, in plain words: the target first, then what the cards say", () => {
    const spec = list([rhystic]);
    expect(line(spec, read(spec), 2)).toBe("Your target: Bracket 2 · the cards say at least 3");
  });

  it("at or above what the cards prove it reads the same way — the target never hides the read", () => {
    const spec = list([rhystic]);
    expect(line(spec, read(spec), 3)).toBe("Your target: Bracket 3 · the cards say at least 3");
    expect(line(spec, read(spec), 4)).toBe("Your target: Bracket 4 · the cards say at least 3");
    const plain = list([]);
    expect(line(plain, read(plain), 2)).toBe(
      "Your target: Bracket 2 · nothing here goes past Core",
    );
    const one = list([timeWarp]);
    expect(line(one, read(one), 1)).toBe("Your target: Bracket 1 · the cards say at least 2");
  });

  it("a call still open is still named, every outcome listed", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    expect(line(spec, read(spec, [s1]), 2)).toBe(
      "Your target: Bracket 2 · the cards say 3 or 4 — one combo is your call",
    );
    const edge = list([liliana]);
    expect(line(edge, read(edge), 2)).toBe(
      "Your target: Bracket 2 · the cards say 1–2 or 4 — one card is your call",
    );
  });

  it("with answers: the cards and your answers say — settled, or with a call still open", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const yes = read(spec, [s1], { answers: { rulesetVersion: v, calls: { "combo:s1": "yes" } } });
    expect(line(spec, yes, 2)).toBe("Your target: Bracket 2 · the cards and your answers say 4");
    const two = list([pieceA, pieceB, pieceC, pieceD, pieceE, pieceF]);
    const half = read(two, [s1, s2], {
      answers: { rulesetVersion: v, calls: { "combo:s1": "no" } },
    });
    expect(line(two, half, 3)).toBe(
      "Your target: Bracket 3 · the cards and your answers say 3 or 4 — one combo is your call",
    );
  });

  it("a read that couldn't check everything names the gap beside the target", () => {
    const stale: BracketFreshness = {
      ...FRESH,
      feeds: { ...FRESH.feeds, extraTurns: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" } },
    };
    const spec = list([rhystic]);
    expect(line(spec, read(spec, [], { freshness: stale }), 2)).toBe(
      "Your target: Bracket 2 · the cards say at least 3 · Couldn't check extra turns",
    );
    const plain = list([]);
    expect(line(plain, read(plain, null), 3)).toBe(
      "Your target: Bracket 3 · Couldn't check combos",
    );
  });

  it("a draft's and a blocked list's lines don't change — the sheet shows the target there", () => {
    const draft = list([rhystic], 66);
    expect(line(draft, read(draft), 2)).toBe("Bracket: add 34 more cards · 1 Game Changer so far");
    const banned = list([dockside]);
    expect(line(banned, read(banned), 2)).toBe("Bracket read needs a legal list · 1 banned card");
  });

  it("no target: answers with a call still open say both", () => {
    const two = list([pieceA, pieceB, pieceC, pieceD, pieceE, pieceF]);
    const half = read(two, [s1, s2], {
      answers: { rulesetVersion: v, calls: { "combo:s1": "no" } },
    });
    expect(half).toMatchObject({ status: "review", minimum: 3, suggested: 3 });
    expect(line(two, half)).toBe(
      "Bracket 3 or 4 — from the cards and your answers · one combo is your call",
    );
    const edge = list([liliana]);
    const quality = read(edge, [], { answers: { rulesetVersion: v, play: { quality: "yes" } } });
    expect(line(edge, quality)).toBe(
      "Bracket 3 or 4 — from the cards and your answers · one card is your call",
    );
  });

  it("an answer of Not sure leaves the call open and says nothing about answers", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const unsure = read(spec, [s1], {
      answers: { rulesetVersion: v, calls: { "combo:s1": "unsure" } },
    });
    expect(unsure.suggested).toBeNull();
    expect(line(spec, unsure)).toBe("Bracket 3 or 4 — one combo is your call");
  });
});

describe("the lines D5 leaves out", () => {
  it("a minimum of 2 — one extra-turn card", () => {
    expect(lineOf(list([timeWarp]))).toBe("At least Bracket 2 (Core)");
  });

  it("a minimum of 2 — a combo Commander Spellbook rates 2", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const c = combo("c", [pieceA, pieceB, pieceC], { tag: "C", relevant: false });
    expect(lineOf(spec, [c])).toBe("At least Bracket 2 (Core)");
  });

  it("a read that couldn't check everything leads with its floor and names the gap", () => {
    const stale: BracketFreshness = {
      ...FRESH,
      feeds: { ...FRESH.feeds, extraTurns: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" } },
    };
    expect(lineOf(list([rhystic]), [], { freshness: stale })).toBe(
      "At least Bracket 3 (Upgraded) · Couldn't check extra turns",
    );
  });

  it("with nothing flagged it claims nothing — 'nothing here goes past Core' needs every check", () => {
    const r = read(list([]), null);
    expect(r.status).toBe("unavailable");
    expect(line(list([]), r)).toBe("Bracket read incomplete · Couldn't check combos");
  });

  it("names every gap: two feeds, a card whose data didn't load, a combo it couldn't rate", () => {
    const gaps: BracketFreshness = {
      ...FRESH,
      feeds: {
        ...FRESH.feeds,
        gameChangers: { state: "missing", asOf: null },
        landDenial: { state: "off", asOf: null },
      },
    };
    const spec = list([timeWarp]);
    expect(lineOf(spec, [], { freshness: gaps })).toBe(
      "At least Bracket 2 (Core) · Couldn't check Game Changers and mass land denial",
    );

    const missing = list([]);
    missing.deck.zones.main.push({ cardId: "never-loaded", qty: 1, tags: [] });
    expect(lineOf(missing)).toBe("Bracket read incomplete · Couldn't check 1 card");

    const unrated = list([pieceA, pieceB]);
    const c = combo("n", [pieceA, pieceB], { tag: null, relevant: false });
    expect(lineOf(unrated, [c])).toBe("Bracket read incomplete · Couldn't check one combo");
  });

  it("a card that isn't legal is never called banned", () => {
    expect(lineOf(list([unglued]))).toBe(
      "Bracket read needs a legal list · 1 card not legal in Commander",
    );
    expect(lineOf(list([dockside, unglued]))).toBe(
      "Bracket read needs a legal list · 1 banned card and 1 card not legal in Commander",
    );
  });

  it("a blocked read wins over a draft (the engine's precedence)", () => {
    expect(lineOf(list([dockside], 40))).toBe("Bracket read needs a legal list · 1 banned card");
  });
});

describe("the shapes of a pending call", () => {
  it("edge land denial with nothing else flagged: the unflagged pair, or 4", () => {
    expect(lineOf(list([liliana]))).toBe("Bracket 1–2 or 4 — one card is your call");
    expect(lineOf(list([liliana, magus]))).toBe("Bracket 1–2 or 4 — two cards are your call");
  });

  it("two extra-turn cards: chaining is the call", () => {
    expect(lineOf(list([timeWarp, temporal]))).toBe(
      "Bracket 2 or 4 — chaining extra turns is your call",
    );
  });

  it("every open outcome is listed, and mixed calls agree in number", () => {
    const spec = list([liliana, pieceA, pieceB, pieceC]);
    const o = combo("o", [pieceA, pieceB, pieceC], { tag: "O", relevant: false });
    // O: firm 2, "or 3"; Liliana: a yes means 4.
    expect(lineOf(spec, [o])).toBe("Bracket 2, 3 or 4 — one combo and one card are your call");
  });

  it("the unflagged pair splits when 2 is an outcome itself", () => {
    const spec = list([pieceA, pieceB, pieceC]);
    const tpl = combo("t", [pieceA, pieceB, pieceC], {
      tag: "C",
      relevant: false,
      templates: ["A creature with power 5 or greater"],
    });
    expect(lineOf(spec, [tpl])).toBe("Bracket 1 or 2 — one combo is your call");
  });
});

describe("drafts", () => {
  it("found nothing yet: the progress phrase alone", () => {
    expect(lineOf(list([], 1))).toBe("Bracket: add 99 more cards");
  });

  it("a combo-seeded draft shows its combo once the facts land", () => {
    const spec = list([pieceA], 2);
    const kiki = combo("618-1537", [commander, pieceA], { tag: "C" });
    expect(lineOf(spec, [kiki])).toBe("Bracket: add 98 more cards · 1 combo so far");
    expect(lineOf(spec, null)).toBe("Bracket: add 98 more cards");
  });

  it("counts copies the way the read does, and names every kind found", () => {
    const spec = list([rhystic, rift, timeWarp, pieceA, pieceB], 60);
    const c = combo("c2", [pieceA, pieceB], { tag: "P" });
    expect(lineOf(spec, [c])).toBe(
      "Bracket: add 40 more cards · 2 Game Changers, 1 combo and 1 extra-turn card so far",
    );
    expect(addMorePhrase(1)).toBe("add 1 more card");
  });
});

describe("the sheet's links (D0's attribution)", () => {
  it("Wizards for the rules and the Game Changers; Tagger's tag page for its flags; none for a combo", () => {
    expect(MTG_BRACKET_LINKS.rules).toEqual({
      label: "Wizards' Commander Brackets",
      href: "https://magic.wizards.com/en/formats/commander#brackets",
    });
    const gc = "https://magic.wizards.com/en/formats/commander#gamechangers";
    expect(MTG_BRACKET_LINKS.source("game-changers")).toBe(gc);
    expect(MTG_BRACKET_LINKS.source("unchecked:gameChangers")).toBe(gc);
    const ld = "https://tagger.scryfall.com/tags/card/mass-land-denial";
    expect(MTG_BRACKET_LINKS.source("land-denial")).toBe(ld);
    expect(MTG_BRACKET_LINKS.source(`land-denial:${liliana.externalKey}`)).toBe(ld);
    expect(MTG_BRACKET_LINKS.source("unchecked:landDenial")).toBe(ld);
    const et = "https://tagger.scryfall.com/tags/card/extra-turn";
    expect(MTG_BRACKET_LINKS.source("extra-turns")).toBe(et);
    expect(MTG_BRACKET_LINKS.source("extra-turns:a+b")).toBe(et);
    expect(MTG_BRACKET_LINKS.source("unchecked:extraTurns")).toBe(et);
    for (const id of [
      "combo:618-1537",
      "unchecked:combo:1-2",
      "unchecked:combos",
      "unchecked:cards",
    ])
      expect(MTG_BRACKET_LINKS.source(id)).toBeNull();
    expect(mtgBrackets.links).toBe(MTG_BRACKET_LINKS);
    expect(mtgBrackets.line).toBe(mtgBracketLine);
  });

  it("the Tagger links follow the slugs data/mtg/tagger-overrides.json pins", () => {
    const file = JSON.parse(
      readFileSync(join(process.cwd(), "data/mtg/tagger-overrides.json"), "utf8"),
    ) as { flags: Record<string, { tag: { slug: string } }> };
    expect(MTG_BRACKET_LINKS.source("land-denial")).toBe(
      `https://tagger.scryfall.com/tags/card/${file.flags.mld.tag.slug}`,
    );
    expect(MTG_BRACKET_LINKS.source("extra-turns")).toBe(
      `https://tagger.scryfall.com/tags/card/${file.flags.extra_turn.tag.slug}`,
    );
  });
});

describe("copy guard (WAVE4 D0) — every line the adapter can say", () => {
  function everyLine(): string[] {
    const reads: [Spec, BracketRead][] = [];
    const add = (spec: Spec, combos?: CompleteCombo[] | null, over?: ReadOptions) =>
      reads.push([spec, read(spec, combos, over)]);
    add(list([]));
    add(list([rhystic]));
    add(list([rhystic, rift, tithe, breach]));
    add(list([timeWarp]));
    add(list([timeWarp, temporal]));
    add(list([liliana]));
    add(list([liliana, magus]));
    add(list([dockside]));
    add(list([unglued]));
    add(list([dockside, unglued]));
    add(list([rhystic, timeWarp], 50));
    add(list([], 1));
    add(list([]), null);
    for (const tag of ["R", "S", "P", "O", "C", "E", null]) {
      add(list([pieceA, pieceB, pieceC]), [combo(`t-${tag}`, [pieceA, pieceB, pieceC], { tag })]);
    }
    const s = combo("s", [pieceA, pieceB, pieceC], { tag: "S", relevant: false });
    add(list([pieceA, pieceB, pieceC]), [s], {
      answers: { rulesetVersion: 1, calls: { "combo:s": "yes" } },
    });
    add(list([rhystic]), [], {
      freshness: {
        readAt: FRESH.readAt,
        feeds: {
          gameChangers: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" },
          landDenial: { state: "off", asOf: null },
          extraTurns: { state: "missing", asOf: null },
          combos: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" },
        },
      },
    });
    add(list([]), [], { freshness: null });
    // Y4b: every read again beside each target, and answers with a call still open.
    add(list([liliana]), [], { answers: { rulesetVersion: 1, play: { quality: "yes" } } });
    return reads.flatMap(([spec, r]) => [
      line(spec, r),
      ...[1, 2, 3, 4, 5].map((target) => line(spec, r, target)),
    ]);
  }

  it("reads real lines: every status the read has", () => {
    const lines = everyLine();
    for (const expected of [
      "nothing here goes past Core",
      "At least Bracket 4",
      "your call",
      "from the cards and your answers",
      "so far",
      "needs a legal list",
      "Couldn't check",
      "Your target: Bracket 2 · the cards say at least 3",
      "the cards and your answers say",
    ]) {
      expect(lines.some((l) => l.includes(expected))).toBe(true);
    }
  });

  it("no line says approve — the Warden's word is legality-only", () => {
    expect(everyLine().filter((l) => /approv/i.test(l))).toEqual([]);
  });

  it("Spellbook's tag names never appear — bracket numbers lead", () => {
    expect(
      everyLine().filter((l) =>
        /ruthless|spicy|powerful|oddball|precon appropriate|casual/i.test(l),
      ),
    ).toEqual([]);
  });

  it("plain words, never notation: no '+', no '(est.)'", () => {
    expect(everyLine().filter((l) => /\d\+|est\./i.test(l))).toEqual([]);
  });
});
