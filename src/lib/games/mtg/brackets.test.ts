/**
 * Y3b — the bracket read (WAVE4 D4): the ruleset as data, Spellbook's ported
 * patterns against the live result names, D4's evidence table row by row,
 * D11's fixtures, freshness → "Couldn't check", and D0's copy guard. Combo
 * fixtures quote real Commander Spellbook rows (key, tag, relevant, results,
 * templates as stored on 2026-10-02).
 */
import { describe, expect, it } from "vitest";

import type {
  BracketFreshness,
  BracketInput,
  BracketRead,
  CompleteCombo,
  IngestRunFacts,
} from "../types";
import { optcgAdapter } from "../optcg/adapter";
import { mtgAdapter } from "./adapter";
import type { MtgAttrs } from "./attrs";
import { BRACKET_RULESET } from "./bracket-ruleset";
import {
  CONTROL_ALL_OPPONENTS_PATTERN,
  EXTRA_TURN_FOR_OPPONENT_PATTERN,
  EXTRA_TURN_PATTERN,
  MASS_LAND_DENIAL_PATTERN,
  MTG_BRACKET_QUESTIONS,
  STALE_AFTER_DAYS,
  assessBracket,
  mtgBracketFreshness,
  mtgBrackets,
} from "./brackets";
import { card, cardMap, commanderDeck, entry, fillers, type MtgCard } from "./test-fixtures";
import { validateMtg } from "./validate";

// --- Freshness as the 2026-10-02 dispatch left it (Y3a's runs #253 / #255) ---------

const SCRYFALL_AT = "2026-10-02T04:54:15.655Z";
const SPELLBOOK_AT = "2026-10-02T04:55:53.189Z";
const READ_AT = "2026-10-02T12:00:00.000Z";

const scryfallRun = (
  over: Record<string, unknown> = {},
  startedAt = SCRYFALL_AT,
): IngestRunFacts => ({
  source: "scryfall",
  id: 253,
  startedAt,
  stats: {
    game_changers: { md5: "38ff92800a67529ee6b9fa81f4203033", count: 53 },
    tagger: {
      error: null,
      status: { mld: "fresh", extra_turn: "fresh" },
      tag_ids: {
        mld: "cd12a44c-1aee-4ece-b8ea-3eb118ef0230",
        extra_turn: "03b17ebf-f5d3-4063-bfd4-1ae156a16a8f",
      },
      stale_since: { mld: null, extra_turn: null },
      bulk_updated_at: "2026-10-01T21:00:32.065+00:00",
    },
    ...over,
  },
});
const spellbookRun = (
  over: Record<string, unknown> = {},
  startedAt = SPELLBOOK_AT,
): IngestRunFacts => ({
  source: "spellbook",
  id: 255,
  startedAt,
  stats: {
    kept: 66881,
    relevant: 50296,
    bracket_tags: { C: 194, E: 49369, O: 2161, P: 1624, R: 4288, S: 9245 },
    source_version: "7.1.3",
    source_timestamp: "2026-10-02T03:11:44.888977+00:00",
    bracket_tags_unknown: {},
    ...over,
  },
});

const FRESH: BracketFreshness = {
  readAt: READ_AT,
  feeds: {
    gameChangers: { state: "ok", asOf: SCRYFALL_AT, detail: "53 cards" },
    landDenial: { state: "ok", asOf: SCRYFALL_AT },
    extraTurns: { state: "ok", asOf: SCRYFALL_AT },
    combos: { state: "ok", asOf: SPELLBOOK_AT, detail: "bulk 7.1.3" },
  },
};

// --- Cards and lists ---------------------------------------------------------------------

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
const armageddon = named("Armageddon", { mld: "clear" });
const liliana = named("Liliana of the Veil", { mld: "edge" });
const timeWarp = named("Time Warp", { extra_turn: true });
const temporal = named("Temporal Manipulation", { extra_turn: true });
const diabolic = named("Diabolic Tutor");
const solRing = named("Sol Ring");
const manaVault = named("Mana Vault");

/** A Commander list: the commander(s), these cards, and filler up to `size`. */
function list(specials: MtgCard[], opts: { commanders?: MtgCard[]; size?: number } = {}) {
  const commanders = opts.commanders ?? [commander];
  const fill = fillers(Math.max(0, (opts.size ?? 100) - commanders.length - specials.length));
  return {
    deck: commanderDeck(
      commanders,
      [...specials, ...fill].map((c) => entry(c)),
    ),
    cards: cardMap([...commanders, ...specials, ...fill]),
  };
}

type Spec = ReturnType<typeof list>;

function assess(
  spec: Spec,
  combos: CompleteCombo[] | null = [],
  over: Partial<BracketInput<MtgAttrs>> = {},
): BracketRead {
  return assessBracket({ deck: spec.deck, cards: spec.cards, combos, freshness: FRESH, ...over });
}

/** A combo as loadCompleteCombos returns it. */
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

const factorIds = (r: BracketRead) => r.factors.map((f) => f.id);
const factor = (r: BracketRead, id: string) => r.factors.find((f) => f.id === id);

// --- The ruleset ---------------------------------------------------------------------------

describe("the ruleset (adapter data, WAVE4 B as read on 2026-10-02)", () => {
  it("holds Wizards' five brackets, their allowances and turns", () => {
    expect(
      BRACKET_RULESET.levels.map((l) => [
        l.level,
        l.name,
        l.gameChangers,
        l.landDenial,
        l.extraTurns,
        l.twoCardCombos,
        l.turns,
      ]),
    ).toEqual([
      [1, "Exhibition", 0, false, "none", "none", 9],
      [2, "Core", 0, false, "few", "none", 8],
      [3, "Upgraded", 3, false, "few", "late", 6],
      [4, "Optimized", null, true, "any", "any", 4],
      [5, "cEDH", null, true, "any", "any", null],
    ]);
    expect(BRACKET_RULESET.asOf).toBe("2025-11-05");
    expect(BRACKET_RULESET.gameChangers.asOf).toBe("2026-02-09");
  });

  it("reads as version 1 as of the newer of its two dates", () => {
    expect(mtgBrackets.ruleset).toEqual({ version: 1, asOf: "2026-02-09" });
    expect(assess(list([])).ruleset).toEqual({ version: 1, asOf: "2026-02-09" });
  });

  it("declares the noun, the levels and How it plays for the core", () => {
    expect(mtgBrackets.noun).toBe("bracket");
    expect(mtgBrackets.levels).toEqual([
      { level: 1, name: "Exhibition" },
      { level: 2, name: "Core" },
      { level: 3, name: "Upgraded" },
      { level: 4, name: "Optimized" },
      { level: 5, name: "cEDH" },
    ]);
    expect(mtgBrackets.questions).toEqual([
      { key: "theme", question: "Theme first, over power?" },
      { key: "quality", question: "Staples and high card quality?" },
      { key: "fast", question: "Can it usually win or lock the table before turn 6?" },
      { key: "cedh", question: "Tuned for the cEDH metagame?" },
    ]);
    expect(mtgBrackets.freshnessSources).toEqual(["scryfall", "spellbook"]);
  });
});

// --- Spellbook's patterns -----------------------------------------------------------------

describe("Spellbook's result patterns, ported verbatim (variant.py at 190735d9abe0)", () => {
  it("match exactly the live result names they should (measured 2026-10-02)", () => {
    expect(MASS_LAND_DENIAL_PATTERN.test("Mass Land Denial")).toBe(true);
    for (const name of [
      "Infinite turns",
      "Near-infinite turns",
      "Infinite turns after one turn cycle",
    ]) {
      expect(EXTRA_TURN_PATTERN.test(name)).toBe(true);
      expect(EXTRA_TURN_FOR_OPPONENT_PATTERN.test(name)).toBe(false);
    }
    expect(EXTRA_TURN_PATTERN.test("Infinite turns for each opponent")).toBe(true);
    expect(EXTRA_TURN_FOR_OPPONENT_PATTERN.test("Infinite turns for each opponent")).toBe(true);
    for (const name of [
      "You control your opponents on each of their turns",
      "You control up to three opponents on each of their turns",
    ]) {
      expect(CONTROL_ALL_OPPONENTS_PATTERN.test(name)).toBe(true);
    }
    for (const name of [
      "Lock",
      "Win the game",
      "Near-infinite damage",
      "Skip all your future turns",
      "Destroy all permanents opponents control",
    ]) {
      expect(MASS_LAND_DENIAL_PATTERN.test(name)).toBe(false);
      expect(EXTRA_TURN_PATTERN.test(name)).toBe(false);
      expect(CONTROL_ALL_OPPONENTS_PATTERN.test(name)).toBe(false);
    }
  });
});

// --- D4's evidence table, row by row --------------------------------------------------------

describe("D4: Game Changers (Wizards' list via Scryfall)", () => {
  it("4 or more → at least Bracket 4", () => {
    const r = assess(list([rhystic, rift, tithe, breach]));
    expect(r.minimum).toBe(4);
    expect(r.status).toBe("read");
    expect(factor(r, "game-changers")).toEqual({
      id: "game-changers",
      sentence:
        "4 Game Changers: Cyclonic Rift, Rhystic Study, Smothering Tithe and Underworld Breach. Bracket 3 allows up to three.",
      cards: [rift.id, rhystic.id, tithe.id, breach.id],
      source: "Wizards' Game Changers list (via Scryfall)",
      atLeast: 4,
      change: "Remove 1 of them to fit Bracket 3.",
    });
  });

  it("1–3 → at least Bracket 3, and the change names them", () => {
    const two = assess(list([rhystic, rift]));
    expect(two.minimum).toBe(3);
    expect(factor(two, "game-changers")).toMatchObject({
      sentence: "2 Game Changers: Cyclonic Rift and Rhystic Study. Brackets 1 and 2 allow none.",
      atLeast: 3,
      change: "Remove Cyclonic Rift and Rhystic Study to fit Bracket 2.",
    });
    const one = assess(list([rhystic]));
    expect(one.minimum).toBe(3);
    expect(factor(one, "game-changers")?.sentence).toBe(
      "1 Game Changer: Rhystic Study. Brackets 1 and 2 allow none.",
    );
  });

  it("counts copies, as Spellbook does", () => {
    const spec = list([]);
    spec.deck.zones.main.push(entry(rhystic, 4));
    spec.cards.set(rhystic.id, rhystic);
    expect(assess(spec).minimum).toBe(4);
  });

  it("counts a Game Changer in the command zone", () => {
    const braids = named(
      "Braids, Cabal Minion",
      { game_changer: true, type_line: "Legendary Creature — Human Minion" },
      { isLeaderCandidate: true },
    );
    expect(assess(list([], { commanders: [braids] })).minimum).toBe(3);
  });
});

describe("D4: mass land denial", () => {
  it("a clear land-denial card → at least Bracket 4 (Scryfall Tagger)", () => {
    const r = assess(list([armageddon]));
    expect(r.minimum).toBe(4);
    expect(factor(r, "land-denial")).toEqual({
      id: "land-denial",
      sentence: "Mass land denial: Armageddon. Brackets 1–3 expect none.",
      cards: [armageddon.id],
      source: "Community-tagged on Scryfall Tagger",
      atLeast: 4,
      change: "Remove Armageddon to fit Bracket 3.",
    });
  });

  it("a complete combo whose results include mass land denial → at least Bracket 4 (Commander Spellbook)", () => {
    const lattice = named("Mycosynth Lattice");
    const vandalblast = named("Vandalblast");
    // 2552-3263 as stored: tag R, not relevant.
    const c = combo("2552-3263", [lattice, vandalblast], {
      tag: "R",
      relevant: false,
      results: ["Destroy all permanents opponents control", "Mass Land Denial"],
    });
    const r = assess(list([lattice, vandalblast]), [c]);
    expect(r.minimum).toBe(4);
    expect(factor(r, "combo:2552-3263")).toEqual({
      id: "combo:2552-3263",
      sentence:
        "Combo: Mycosynth Lattice + Vandalblast — mass land denial. Brackets 1–3 expect none.",
      cards: [lattice.id, vandalblast.id],
      source: "Commander Spellbook",
      atLeast: 4,
      change: "Remove Mycosynth Lattice or Vandalblast to fit Bracket 3.",
      combo: "2552-3263",
    });
  });

  it("an edge land-denial card → your call, never a firm 4", () => {
    const r = assess(list([liliana]));
    expect(r.minimum).toBe(1);
    expect(r.status).toBe("review");
    expect(r.review).toEqual([
      {
        id: "land-denial:oracle:Liliana of the Veil",
        question: "Does it deny lands the way Armageddon does?",
        because: "Liliana of the Veil is tagged land denial, but it depends on how it's played.",
        cards: [liliana.id],
        source: "Community-tagged on Scryfall Tagger",
        raisesTo: 4,
        answer: null,
      },
    ]);
  });
});

describe("D4: infinite turns and control of every opponent", () => {
  it("a combo whose results include infinite turns → at least Bracket 4", () => {
    const pilgrimage = named("Deeproot Pilgrimage");
    const prophets = named("Wanderwine Prophets");
    // 2120-5329 as stored.
    const c = combo("2120-5329", [pilgrimage, prophets], {
      tag: "R",
      results: ["Infinite turns", "Lock"],
    });
    const r = assess(list([pilgrimage, prophets]), [c]);
    expect(r.minimum).toBe(4);
    expect(factor(r, "combo:2120-5329")?.sentence).toBe(
      "Two-card combo: Deeproot Pilgrimage + Wanderwine Prophets — infinite turns. Brackets 1–3 expect no chained extra turns.",
    );
  });

  it("near-infinite turns count too; infinite turns for an opponent don't", () => {
    const a = named("Turn Piece A");
    const b = named("Turn Piece B");
    const c = named("Turn Piece C");
    const near = assess(list([a, b, c]), [
      combo("near", [a, b, c], { relevant: false, results: ["Near-infinite turns"] }),
    ]);
    expect(near.minimum).toBe(4);
    const theirs = assess(list([a, b, c]), [
      combo("theirs", [a, b, c], {
        relevant: false,
        results: ["Infinite turns for each opponent"],
      }),
    ]);
    expect(theirs.minimum).toBe(1);
    expect(factorIds(theirs)).toEqual([]);
  });

  it("a combo that controls every opponent → at least Bracket 4", () => {
    const duplicator = named("Esoteric Duplicator");
    const mindslaver = named("Mindslaver");
    // 1167-5483 as stored.
    const c = combo("1167-5483", [duplicator, mindslaver], {
      tag: "R",
      results: ["You control your opponents on each of their turns", "Lock"],
    });
    const r = assess(list([duplicator, mindslaver]), [c]);
    expect(r.minimum).toBe(4);
    expect(factor(r, "combo:1167-5483")?.sentence).toBe(
      "Two-card combo: Esoteric Duplicator + Mindslaver — control of every opponent. Commander Spellbook rates that Bracket 4.",
    );
  });
});

describe("D4: extra-turn cards (Scryfall Tagger)", () => {
  it("one extra-turn card → at least Bracket 2, nothing to ask", () => {
    const r = assess(list([timeWarp]));
    expect(r.minimum).toBe(2);
    expect(r.status).toBe("read");
    expect(r.review).toEqual([]);
    expect(factor(r, "extra-turns")).toEqual({
      id: "extra-turns",
      sentence: "1 extra-turn card: Time Warp. Bracket 1 expects none.",
      cards: [timeWarp.id],
      source: "Community-tagged on Scryfall Tagger",
      atLeast: 2,
      change: "Remove Time Warp to fit Bracket 1.",
    });
  });

  it("two or more → at least 2, and whether they chain is your call", () => {
    const r = assess(list([timeWarp, temporal]));
    expect(r.minimum).toBe(2);
    expect(r.status).toBe("review");
    expect(factor(r, "extra-turns")?.sentence).toBe(
      "2 extra-turn cards: Temporal Manipulation and Time Warp. Bracket 1 expects none.",
    );
    expect(r.review).toEqual([
      {
        id: "extra-turns:oracle:Temporal Manipulation+oracle:Time Warp",
        question: "Do these extra turns chain?",
        because: "Brackets 2 and 3 expect only a few extra turns, never chained or looped.",
        cards: [temporal.id, timeWarp.id],
        source: "Community-tagged on Scryfall Tagger",
        raisesTo: 4,
        answer: null,
      },
    ]);
  });
});

describe("D4: the relevant two-card combo (Wizards' text beats Spellbook's leniency)", () => {
  const act = named("Blasphemous Act");
  const repercussion = named("Repercussion");
  // 2484-4083 as stored: Spellbook rates it C — our read says at least 3.
  const twoCard = combo("2484-4083", [act, repercussion], {
    tag: "C",
    results: ["Near-infinite damage to all players"],
  });

  it("complete, two cards, no template, relevant → at least Bracket 3 whatever its tag", () => {
    const r = assess(list([act, repercussion]), [twoCard]);
    expect(r.minimum).toBe(3);
    expect(factor(r, "combo:2484-4083")).toEqual({
      id: "combo:2484-4083",
      sentence: "Two-card combo: Blasphemous Act + Repercussion. Brackets 1 and 2 expect none.",
      cards: [act.id, repercussion.id],
      source: "Commander Spellbook (the combo) and Wizards' brackets (the rule)",
      atLeast: 3,
      change: "Remove Blasphemous Act or Repercussion to fit Bracket 2.",
      combo: "2484-4083",
    });
  });

  it("not relevant → no two-card rule (Gravecrawler + Phyrexian Altar, E)", () => {
    const gravecrawler = named("Gravecrawler");
    const altar = named("Phyrexian Altar");
    const r = assess(list([gravecrawler, altar]), [
      combo("2577-4050", [gravecrawler, altar], {
        relevant: false,
        results: ["Infinite death triggers", "Infinite creature ETB"],
      }),
    ]);
    expect(r.minimum).toBe(1);
    expect(factorIds(r)).toEqual([]);
  });

  it("three cards besides the commander → its tag decides (P → at least 3)", () => {
    const freeze = named("Brain Freeze");
    const petal = named("Lotus Petal");
    const r = assess(list([freeze, petal, breach]), [
      combo("1368-1414-4856", [freeze, petal, breach], {
        tag: "P",
        results: ["Infinite self-mill", "Near-infinite magecraft triggers", "Near-infinite mill"],
      }),
    ]);
    expect(factor(r, "combo:1368-1414-4856")).toMatchObject({
      sentence:
        "Combo: Brain Freeze + Lotus Petal + Underworld Breach. Commander Spellbook rates it Bracket 3.",
      source: "Commander Spellbook",
      atLeast: 3,
      change: "Remove Brain Freeze, Lotus Petal or Underworld Breach to fit Bracket 2.",
    });
  });

  it("your commander doesn't count toward the two", () => {
    const sheoldred = named(
      "Sheoldred, the Apocalypse",
      { type_line: "Legendary Creature — Phyrexian Praetor" },
      { isLeaderCandidate: true },
    );
    const peer = named("Peer into the Abyss");
    const extra = named("Extra Piece");
    // A three-card combo with the commander is two cards besides it.
    const r = assess(list([peer, extra], { commanders: [sheoldred] }), [
      combo("cmd-three", [sheoldred, peer, extra], {
        tag: "P",
        results: ["Target opponent loses the game"],
      }),
    ]);
    expect(factor(r, "combo:cmd-three")).toMatchObject({
      sentence:
        "Two-card combo with your commander: Extra Piece + Peer into the Abyss + Sheoldred, the Apocalypse. Brackets 1 and 2 expect none.",
      atLeast: 3,
      change: "Remove Extra Piece or Peer into the Abyss to fit Bracket 2.",
    });
  });
});

describe("D4: a complete combo's Spellbook tag", () => {
  const a = named("Piece A");
  const b = named("Piece B");
  const c = named("Piece C");
  // Three cards and not relevant, so only the tag speaks.
  const tagged = (tag: string) =>
    assess(list([a, b, c]), [
      combo(`tag-${tag}`, [a, b, c], { tag, relevant: false, results: ["Lock"] }),
    ]);

  it("R → at least 4", () => {
    const r = tagged("R");
    expect(r.minimum).toBe(4);
    expect(factor(r, "combo:tag-R")?.sentence).toBe(
      "Combo: Piece A + Piece B + Piece C. Commander Spellbook rates it Bracket 4.",
    );
    expect(r.review).toEqual([]);
  });

  it("S → at least 3, and 4 is your call", () => {
    const r = tagged("S");
    expect(r.minimum).toBe(3);
    expect(r.status).toBe("review");
    expect(factor(r, "combo:tag-S")?.sentence).toBe(
      "Combo: Piece A + Piece B + Piece C. Commander Spellbook rates it Bracket 3 or 4.",
    );
    expect(r.review).toEqual([
      {
        id: "combo:tag-S",
        question: "Can this combo win or lock the game before turn 6?",
        because: "Piece A + Piece B + Piece C: Commander Spellbook rates it Bracket 3 or 4.",
        cards: [a.id, b.id, c.id],
        source: "Commander Spellbook",
        raisesTo: 4,
        answer: null,
        combo: "tag-S",
      },
    ]);
  });

  it("P → at least 3", () => {
    expect(tagged("P")).toMatchObject({ minimum: 3, status: "read", review: [] });
  });

  it("O → at least 2, and 3 is your call", () => {
    const r = tagged("O");
    expect(r.minimum).toBe(2);
    expect(r.review).toMatchObject([
      {
        id: "combo:tag-O",
        question: "Does this combo win or lock the game in your deck?",
        because: "Piece A + Piece B + Piece C: Commander Spellbook rates it Bracket 2 or 3.",
        raisesTo: 3,
      },
    ]);
  });

  it("C → at least 2", () => {
    expect(tagged("C")).toMatchObject({ minimum: 2, status: "read", review: [] });
  });

  it("E → nothing", () => {
    const r = tagged("E");
    expect(r).toMatchObject({ minimum: 1, status: "read", review: [] });
    expect(factorIds(r)).toEqual([]);
  });

  it("a tag the read doesn't know (stored NULL) → Couldn't check, never nothing", () => {
    const r = assess(list([a, b, c]), [
      combo("tag-null", [a, b, c], { tag: null, relevant: false }),
    ]);
    expect(r.status).toBe("unavailable");
    expect(factor(r, "unchecked:combo:tag-null")).toEqual({
      id: "unchecked:combo:tag-null",
      sentence: "Couldn't check how Commander Spellbook rates Piece A + Piece B + Piece C.",
      cards: [a.id, b.id, c.id],
      source: "Commander Spellbook",
      atLeast: null,
      change: null,
      combo: "tag-null",
    });
  });

  it("the highest rule wins: a fast two-card combo reads 4", () => {
    const oracle = named("Thassa's Oracle", { game_changer: true });
    const consult = named("Demonic Consultation");
    // 742-1295 as stored.
    const r = assess(list([oracle, consult]), [
      combo("742-1295", [oracle, consult], {
        tag: "R",
        results: ["Exile your library", "Win the game"],
      }),
    ]);
    expect(r.minimum).toBe(4);
    expect(factorIds(r)).toEqual(["combo:742-1295", "game-changers"]);
    expect(factor(r, "combo:742-1295")?.sentence).toBe(
      "Two-card combo: Demonic Consultation + Thassa's Oracle. A fast one — Commander Spellbook rates it Bracket 4.",
    );
  });
});

describe("D4: a combo that uses your commander", () => {
  const niv = named(
    "Niv-Mizzet, Parun",
    { type_line: "Legendary Creature — Dragon Wizard" },
    { isLeaderCandidate: true },
  );
  const curiosity = named("Curiosity");
  // 1089-2353 as stored: S, relevant.
  const loop = (tag: string) =>
    combo("1089-2353", [niv, curiosity], {
      tag,
      results: ["Infinite draw triggers", "Infinite card draw", "Near-infinite damage"],
    });

  it("D11: a commander plus a one-card loop — at least 3, and it may be faster with your commander", () => {
    const r = assess(list([curiosity], { commanders: [niv] }), [loop("S")]);
    expect(r.minimum).toBe(3);
    expect(r.status).toBe("review");
    expect(factor(r, "combo:1089-2353")).toMatchObject({
      sentence:
        "Two-card combo with your commander: Curiosity + Niv-Mizzet, Parun. Brackets 1 and 2 expect none.",
      change: "Remove Curiosity to fit Bracket 2.",
    });
    expect(r.review).toEqual([
      {
        id: "combo:1089-2353",
        question: "Can this combo win or lock the game before turn 6?",
        because:
          "Curiosity + Niv-Mizzet, Parun: Commander Spellbook rates it Bracket 3 or 4. It rates combos without knowing your commander — with yours always there, it may be faster.",
        cards: [curiosity.id, niv.id],
        source: "Commander Spellbook",
        raisesTo: 4,
        answer: null,
        combo: "1089-2353",
      },
    ]);
  });

  it("an E-tagged combo with your commander is a question too", () => {
    const r = assess(list([curiosity], { commanders: [niv] }), [loop("E")]);
    expect(r.minimum).toBe(3);
    expect(r.review[0]?.because).toBe(
      "Curiosity + Niv-Mizzet, Parun: Commander Spellbook rates combos without knowing your commander — with yours always there, it may be faster.",
    );
  });

  it("C, P and R already count it as two-card: nothing to ask", () => {
    for (const tag of ["C", "P", "R"]) {
      expect(assess(list([curiosity], { commanders: [niv] }), [loop(tag)]).review).toEqual([]);
    }
  });

  it("the same pair with Niv-Mizzet in the 99 asks nothing about a commander", () => {
    const r = assess(list([niv, curiosity]), [loop("E")]);
    expect(r).toMatchObject({ minimum: 3, review: [] });
    expect(factor(r, "combo:1089-2353")?.sentence).toBe(
      "Two-card combo: Curiosity + Niv-Mizzet, Parun. Brackets 1 and 2 expect none.",
    );
  });
});

describe("D4: a combo that needs a template", () => {
  const altar = named("Ashnod's Altar");
  const mikaeus = named("Mikaeus, the Unhallowed");
  // 628-2034--5 as stored: S, relevant, needs a persist creature.
  const persist = combo("628-2034--5", [altar, mikaeus], {
    tag: "S",
    templates: ["Persist Creature"],
    results: ["Infinite colorless mana", "Infinite creature ETB", "Infinite death triggers"],
  });

  it("D11: a loop that needs an unnamed extra permanent — your call, never counted", () => {
    const r = assess(list([altar, mikaeus]), [persist]);
    expect(r.minimum).toBe(1);
    expect(factorIds(r)).toEqual([]);
    expect(r.status).toBe("review");
    expect(r.review).toEqual([
      {
        id: "combo:628-2034--5",
        question: "Does your deck have the rest of this combo?",
        because: "Ashnod's Altar + Mikaeus, the Unhallowed also needs Persist Creature.",
        cards: [altar.id, mikaeus.id],
        source: "Commander Spellbook",
        raisesTo: 4,
        answer: null,
        combo: "628-2034--5",
      },
    ]);
  });

  it("a template that could prove nothing asks nothing (Hullbreaker Horror + Sol Ring is three pieces)", () => {
    const hullbreaker = named("Hullbreaker Horror");
    // 513-5034--46 as stored: E, relevant, needs "Permanent Castable for {C}".
    const r = assess(list([hullbreaker, solRing]), [
      combo("513-5034--46", [hullbreaker, solRing], {
        templates: ["Permanent Castable for {C}"],
        results: ["Infinite colorless mana", "Infinite storm count"],
      }),
    ]);
    expect(r).toMatchObject({ minimum: 1, status: "read", review: [] });
    // Its P-tagged sibling with Mana Vault asks up to 3.
    const vault = assess(list([hullbreaker, manaVault]), [
      combo("513-2364--47", [hullbreaker, manaVault], {
        tag: "P",
        templates: ["Permanent Castable for {C}{C}"],
        results: ["Infinite colorless mana", "Infinite storm count"],
      }),
    ]);
    expect(vault.review).toMatchObject([{ raisesTo: 3 }]);
  });
});

describe("D4: nothing flagged, legality, drafts, freshness, tutors", () => {
  it("nothing flagged → 1, read: Exhibition or Core is your intent", () => {
    const r = assess(list([]));
    expect(r).toMatchObject({ status: "read", minimum: 1, suggested: null, review: [] });
    expect(r.factors).toEqual([]);
  });

  it("a banned card → blocked, whatever else", () => {
    const banned = named("Banned Card", {}, { legality: [{ status: "banned" }] });
    const r = assess(list([banned, rhystic]));
    expect(r.status).toBe("blocked");
    expect(r.blockedBy).toEqual([banned.id]);
    expect(r.minimum).toBe(3); // what the cards show still stays listed
  });

  it("a banned card blocks a draft too — blocked comes first", () => {
    const banned = named("Banned Card", {}, { legality: [{ status: "banned" }] });
    expect(assess(list([banned], { size: 30 })).status).toBe("blocked");
  });

  it("a card not legal in Commander blocks; a preview card doesn't", () => {
    const silver = named("Un-Card", {}, { legality: [{ status: "not_legal" }] });
    expect(assess(list([silver])).status).toBe("blocked");
    const preview = named(
      "Spoiled Card",
      {},
      { isPreview: true, legality: [{ status: "not_legal" }] },
    );
    expect(assess(list([preview])).status).toBe("read");
  });

  it("fewer cards than the minimum → draft; what's found so far stays listed", () => {
    const r = assess(list([rhystic], { size: 40 }));
    expect(r.status).toBe("draft");
    expect(r.minimum).toBe(3);
    expect(factorIds(r)).toEqual(["game-changers"]);
  });

  it("tutors and fast mana → nothing", () => {
    const r = assess(list([diabolic, solRing, manaVault]));
    expect(r).toMatchObject({ status: "read", minimum: 1 });
    expect(r.factors).toEqual([]);
  });

  it("a stale, missing or switched-off source reads Couldn't check — never a lower number", () => {
    const stale: BracketFreshness = {
      readAt: READ_AT,
      feeds: {
        ...FRESH.feeds,
        gameChangers: { state: "stale", asOf: "2026-09-20T16:30:00.000Z", detail: "53 cards" },
        landDenial: { state: "off", asOf: null },
        extraTurns: { state: "missing", asOf: null },
      },
    };
    const r = assess(list([rhystic, rift]), [], { freshness: stale });
    expect(r.status).toBe("unavailable");
    expect(r.minimum).toBe(3); // the Game Changers it still sees keep counting
    expect(r.factors.filter((f) => f.atLeast === null).map((f) => f.sentence)).toEqual([
      "Couldn't check Game Changers: the card data hasn't refreshed since Sep 20, 2026.",
      "Couldn't check mass land denial: Scryfall Tagger's list is switched off.",
      "Couldn't check extra turns: Scryfall Tagger's list hasn't been read yet.",
    ]);
    expect(r.assumptions.at(-1)).toBe("Game Changers: Wizards' list as of Sep 20, 2026.");
  });

  it("no freshness at all → every feed reads Couldn't check", () => {
    const r = assess(list([]), [], { freshness: null });
    expect(r.status).toBe("unavailable");
    expect(r.factors.map((f) => f.sentence)).toEqual([
      "Couldn't check Game Changers: its freshness didn't load.",
      "Couldn't check mass land denial: its freshness didn't load.",
      "Couldn't check extra turns: its freshness didn't load.",
      "Couldn't check combos: its freshness didn't load.",
    ]);
  });

  it("a card whose data didn't load → unavailable", () => {
    const spec = list([]);
    spec.deck.zones.main.push({ cardId: "missing-card", qty: 1, tags: [] });
    const r = assess(spec);
    expect(r.status).toBe("unavailable");
    expect(factor(r, "unchecked:cards")?.sentence).toBe(
      "Couldn't check 1 card: its card data didn't load.",
    );
  });
});

describe("D4: each change names what would lower it", () => {
  it("never suggests removing your commander", () => {
    const partnerA = named("Partner A", {}, { isLeaderCandidate: true });
    const partnerB = named("Partner B", {}, { isLeaderCandidate: true });
    const r = assess(list([], { commanders: [partnerA, partnerB] }), [
      combo("partners", [partnerA, partnerB], { tag: "R" }),
    ]);
    expect(factor(r, "combo:partners")).toMatchObject({
      sentence:
        "Two-card combo with your commander: Partner A + Partner B. A fast one — Commander Spellbook rates it Bracket 4.",
      change: null,
    });
  });
});

// --- Answers ----------------------------------------------------------------------------------

describe("answers only raise the read", () => {
  const answers = (play: Record<string, string>, calls: Record<string, string> = {}) =>
    ({ rulesetVersion: 1, play, calls }) as BracketInput<MtgAttrs>["answers"];

  it("How it plays: theme first → 1, not theme first → 2, quality → 3, fast → 4, cEDH → 5", () => {
    const spec = list([]);
    expect(assess(spec, [], { answers: answers({ theme: "yes" }) }).suggested).toBe(1);
    expect(assess(spec, [], { answers: answers({ theme: "no" }) }).suggested).toBe(2);
    expect(assess(spec, [], { answers: answers({ quality: "yes" }) }).suggested).toBe(3);
    expect(assess(spec, [], { answers: answers({ fast: "yes" }) }).suggested).toBe(4);
    expect(assess(spec, [], { answers: answers({ cedh: "yes", theme: "yes" }) }).suggested).toBe(5);
    expect(assess(spec, [], { answers: answers({ fast: "unsure", cedh: "no" }) }).suggested).toBe(
      null,
    );
  });

  it("theme first never lowers what the cards prove", () => {
    const r = assess(list([rhystic]), [], { answers: answers({ theme: "yes" }) });
    expect(r).toMatchObject({ minimum: 3, suggested: 3 });
  });

  it("a your-call question: yes raises to its level, no settles it", () => {
    const spec = list([timeWarp, temporal]);
    const id = "extra-turns:oracle:Temporal Manipulation+oracle:Time Warp";
    const yes = assess(spec, [], { answers: answers({}, { [id]: "yes" }) });
    expect(yes).toMatchObject({ minimum: 2, suggested: 4, status: "read" });
    expect(yes.review[0].answer).toBe("yes");
    const no = assess(spec, [], { answers: answers({}, { [id]: "no" }) });
    expect(no).toMatchObject({ minimum: 2, suggested: 2, status: "read" });
    const unsure = assess(spec, [], { answers: answers({}, { [id]: "unsure" }) });
    expect(unsure).toMatchObject({ suggested: null, status: "review" });
  });

  it("an answer that already reaches a question's level settles it", () => {
    const r = assess(list([liliana]), [], { answers: answers({ fast: "yes" }) });
    expect(r).toMatchObject({ minimum: 1, suggested: 4, status: "read" });
  });

  it("D11: a new rules version flags the answers and still applies them", () => {
    const r = assess(list([]), [], {
      answers: { rulesetVersion: 0, play: { quality: "yes" } },
    });
    expect(r).toMatchObject({ answersStale: true, suggested: 3 });
    expect(assess(list([]), [], { answers: answers({ quality: "yes" }) }).answersStale).toBe(false);
  });
});

// --- D11's fixtures ------------------------------------------------------------------------

describe("D11: the review's test cases, in our words", () => {
  it("a one-card shell never looks fully assessed", () => {
    const shell = { deck: commanderDeck([commander], []), cards: cardMap([commander]) };
    const r = assess(shell);
    expect(r.status).toBe("draft");
    expect(r.minimum).toBe(1);
    const empty = { deck: commanderDeck([], []), cards: cardMap([]) };
    expect(assess(empty).status).toBe("draft");
  });

  it("a full 100-card list reads", () => {
    const spec = list([rhystic]);
    expect(
      Object.values(spec.deck.zones)
        .flat()
        .reduce((s, e) => s + e.qty, 0),
    ).toBe(100);
    expect(assess(spec)).toMatchObject({ status: "read", minimum: 3 });
  });

  it("the same list in premium printings reads the same", () => {
    const spec = list([rhystic, timeWarp]);
    const plain = assess(spec);
    const premium = {
      deck: {
        ...spec.deck,
        zones: Object.fromEntries(
          Object.entries(spec.deck.zones).map(([z, es]) => [
            z,
            es.map((e, i) => ({
              ...e,
              printingId: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
            })),
          ]),
        ),
      },
      cards: spec.cards,
    };
    expect(assess(premium)).toEqual(plain);
  });

  it("a fourth Game Changer moves 3 to 4", () => {
    expect(assess(list([rhystic, rift, tithe])).minimum).toBe(3);
    expect(assess(list([rhystic, rift, tithe, breach])).minimum).toBe(4);
  });

  it("a tuned list with no Game Changers reads 1–2, never Core by count alone, and How it plays can raise it", () => {
    const r = assess(list([diabolic, solRing, manaVault]));
    expect(r).toMatchObject({ status: "read", minimum: 1, suggested: null });
    expect(MTG_BRACKET_QUESTIONS.map((q) => q.key)).toEqual(["theme", "quality", "fast", "cedh"]);
    const tuned = assess(list([diabolic, solRing, manaVault]), [], {
      answers: { rulesetVersion: 1, play: { quality: "yes", fast: "yes" } },
    });
    expect(tuned.suggested).toBe(4);
  });

  it("a Rule Zero exhibition list: the target never hides the evidence, legality unchanged", () => {
    const citadel = named("Bolas's Citadel", { game_changer: true });
    const spec = list([citadel]);
    const r = assess(spec, [], { targetLevel: 1 });
    expect(r).toMatchObject({ minimum: 3, status: "read", conflicts: ["game-changers"] });
    expect(assess(spec, [], { targetLevel: 3 }).conflicts).toEqual([]);
    expect(validateMtg(spec.deck, spec.cards)).toEqual([]);
  });

  it("combo data unavailable → unavailable, the cards' minimum stays", () => {
    const r = assess(list([rhystic]), null);
    expect(r).toMatchObject({ status: "unavailable", minimum: 3 });
    expect(factor(r, "unchecked:combos")?.sentence).toBe("Couldn't check combos.");
  });

  it("a One Piece deck has no bracket", () => {
    expect(optcgAdapter.brackets).toBeUndefined();
    expect(mtgAdapter.brackets).toBe(mtgBrackets);
  });
});

describe("combo facts are re-checked against the list", () => {
  it("a combo whose pieces left the list doesn't count, and a repeated key counts once", () => {
    const oracle = named("Thassa's Oracle", { game_changer: true });
    const consult = named("Demonic Consultation");
    const c = combo("742-1295", [oracle, consult], { tag: "R" });
    const gone = assess(list([oracle]), [c]);
    expect(factorIds(gone)).toEqual(["game-changers"]);
    const twice = assess(list([oracle, consult]), [c, c]);
    expect(factorIds(twice).filter((id) => id.startsWith("combo:"))).toEqual(["combo:742-1295"]);
  });
});

// --- Freshness ---------------------------------------------------------------------------

describe("mtgBracketFreshness", () => {
  it("reads the 2026-10-02 dispatch's runs as all ok", () => {
    expect(mtgBracketFreshness([scryfallRun(), spellbookRun()], READ_AT)).toEqual(FRESH);
  });

  it("a feed older than seven days is stale; exactly seven is not", () => {
    const at = (iso: string) =>
      mtgBracketFreshness([scryfallRun({}, iso), spellbookRun({}, iso)], READ_AT);
    const seven = new Date(Date.parse(READ_AT) - STALE_AFTER_DAYS * 86_400_000).toISOString();
    const older = new Date(Date.parse(seven) - 1).toISOString();
    expect(Object.values(at(seven).feeds).map((f) => f.state)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(Object.values(at(older).feeds).map((f) => f.state)).toEqual([
      "stale",
      "stale",
      "stale",
      "stale",
    ]);
  });

  it("a kept Tagger flag reads its stale_since; disabled reads off", () => {
    const kept = (since: string) =>
      scryfallRun({
        tagger: {
          status: { mld: "kept", extra_turn: "disabled" },
          stale_since: { mld: since, extra_turn: null },
        },
      });
    const recent = mtgBracketFreshness([kept("2026-09-30T16:30:00.000Z")], READ_AT).feeds;
    expect(recent.landDenial).toEqual({ state: "ok", asOf: "2026-09-30T16:30:00.000Z" });
    expect(recent.extraTurns).toEqual({ state: "off", asOf: null });
    const old = mtgBracketFreshness([kept("2026-09-20T16:30:00.000Z")], READ_AT).feeds;
    expect(old.landDenial).toEqual({ state: "stale", asOf: "2026-09-20T16:30:00.000Z" });
  });

  it("runs from before Y3a, or none at all, read missing", () => {
    const before = mtgBracketFreshness(
      [
        { source: "scryfall", id: 240, startedAt: SCRYFALL_AT, stats: { sets: 1053 } },
        { source: "spellbook", id: 242, startedAt: SPELLBOOK_AT, stats: { kept: 66592 } },
      ],
      READ_AT,
    );
    expect(Object.values(before.feeds).map((f) => f.state)).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
    ]);
    expect(Object.values(mtgBracketFreshness([], READ_AT).feeds).map((f) => f.state)).toEqual([
      "missing",
      "missing",
      "missing",
      "missing",
    ]);
  });
});

// --- What the read assumes -------------------------------------------------------------------

describe("assumptions (WAVE4 D5's fixed text, the date from ingest)", () => {
  it("say what the read can't see", () => {
    expect(assess(list([])).assumptions).toEqual([
      "Reads the card list only — it can't see how fast your deck wins. Wizards expects games to last at least 9, 8, 6 and 4 turns at Brackets 1–4.",
      "A combo counts as fast when it needs 4 mana or less to assemble (Commander Spellbook).",
      "Your commander counts as always available.",
      "Tutors and fast mana don't change the read — Wizards dropped tutor limits in October 2025.",
      "Land-denial and extra-turn lists are Scryfall community tags, not Wizards lists.",
      "Combos no EDHREC deck has played aren't checked.",
      "Game Changers: Wizards' list as of Oct 2, 2026.",
    ]);
  });
});

// --- D0's copy guard ------------------------------------------------------------------------

describe("copy guard (WAVE4 D0)", () => {
  /**
   * Every string a read can produce: one small read per rule (a read at
   * Bracket 4 rightly hides every question below it), plus every gap.
   */
  function everyString(): string[] {
    const niv = named("Niv-Mizzet, Parun", {}, { isLeaderCandidate: true });
    const [a, b, c] = ["A", "B", "C"].map((n) => named(`Piece ${n}`));
    const withNiv = (cards: MtgCard[]) => list(cards, { commanders: [niv] });
    const reads: BracketRead[] = [
      assess(withNiv([rhystic])),
      assess(withNiv([rhystic, rift, tithe, breach])),
      assess(withNiv([armageddon])),
      assess(withNiv([liliana])),
      assess(withNiv([timeWarp])),
      assess(withNiv([timeWarp, temporal])),
    ];
    const combos = [
      combo("ld", [a, b], { results: ["Mass Land Denial"] }),
      combo("turns", [a, b], { results: ["Infinite turns"] }),
      combo("control", [a, b], { results: ["You control your opponents on each of their turns"] }),
      ...["R", "S", "P", "O", "C", "E"].map((tag) =>
        combo(`t-${tag}`, [a, b, c], { tag, relevant: false }),
      ),
      combo("two", [a, b], { tag: "R" }),
      combo("cmd", [niv, a], { tag: "E" }),
      combo("tpl", [a, b], { tag: "S", templates: ["Persist Creature"] }),
      combo("null", [a, b], { tag: null }),
    ];
    for (const one of combos) reads.push(assess(withNiv([a, b, c]), [one]));
    const gaps: BracketFreshness = {
      readAt: READ_AT,
      feeds: {
        gameChangers: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" },
        landDenial: { state: "off", asOf: null },
        extraTurns: { state: "missing", asOf: null },
        combos: { state: "stale", asOf: "2026-09-01T00:00:00.000Z" },
      },
    };
    reads.push(assess(withNiv([a, b, c]), null, { freshness: null }));
    reads.push(assess(withNiv([a, b, c]), combos, { freshness: gaps }));
    const missingCard = withNiv([]);
    missingCard.deck.zones.main.push({ cardId: "missing-card", qty: 1, tags: [] });
    reads.push(assess(missingCard));

    const strings: string[] = [
      mtgBrackets.noun,
      ...mtgBrackets.levels.map((l) => l.name),
      ...mtgBrackets.questions.map((q) => q.question),
    ];
    for (const r of reads) {
      strings.push(...r.assumptions);
      for (const f of r.factors) strings.push(f.sentence, f.source, f.change ?? "");
      for (const q of r.review) strings.push(q.question, q.because, q.source);
    }
    return strings.filter((str) => str.length > 0);
  }

  it("fires every rule (the guard reads real output, not an empty list)", () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(100);
    for (const expected of [
      "Couldn't check",
      "Do these extra turns chain?",
      "Does it deny lands the way Armageddon does?",
      "Does your deck have the rest of this combo?",
      "Does this combo win or lock the game in your deck?",
      "Can this combo win or lock the game before turn 6?",
      "Two-card combo with your commander",
      "control of every opponent",
    ]) {
      expect(strings.some((str) => str.includes(expected))).toBe(true);
    }
  });

  it("no bracket string says approve — the Warden's word is legality-only", () => {
    expect(everyString().filter((s) => /approv/i.test(s))).toEqual([]);
  });

  it("Spellbook's tag names never appear — bracket numbers lead", () => {
    expect(everyString().filter((s) => /ruthless|spicy|powerful|oddball/i.test(s))).toEqual([]);
  });
});
