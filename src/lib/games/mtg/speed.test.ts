/**
 * BRACKET-SPEED — the three speed facts (DECKCHECK-STUDY §2.2 and §2.3):
 * the calibration's definitions, copy for copy, the commander left out; the
 * cuts at their edges; the words the sheet and "At the table" say; and the
 * read's indifference — `assess` is the same object with and without roles
 * on the cards (the prompt's mutation check: a read that took roles would
 * fail it).
 */
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness } from "@/lib/games/types";

import type { MtgAttrs } from "./attrs";
import { mtgBrackets, MTG_BRACKET_FLAG_PATHS, MTG_BRACKET_QUESTIONS } from "./brackets";
import { COMMANDER } from "./formats";
import {
  FAST_MANA_MAX_MANA_VALUE,
  FAST_MANA_ROLES,
  MTG_SPEED_ASKS,
  MTG_SPEED_CUTS,
  MTG_SPEED_LABEL,
  mtgBracketSpeed,
  mtgIsLand,
  mtgSpeedFacts,
  mtgSpeedLine,
  mtgSpeedLooksTuned,
  mtgSpeedNudge,
  mtgSpeedRows,
  mtgSpeedSaid,
  type MtgSpeedFacts,
} from "./speed";
import {
  atraxa,
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "./test-fixtures";

const named = (
  name: string,
  over: Omit<Partial<MtgCard>, "attrs"> & { attrs?: Partial<MtgAttrs> } = {},
): MtgCard =>
  card({
    ...over,
    name,
    attrs: { type_line: "Sorcery", oracle_text: "", ...over.attrs },
  });

// --- The cards the definitions turn on -----------------------------------------------------

/** Sol Ring: a mana rock at 1. */
const solRing = named("Sol Ring", {
  primaryType: "Artifact",
  costValue: 1,
  attrs: { type_line: "Artifact", roles: ["mana-rock"] },
});
/** Mana Crypt: at 0. */
const crypt = named("Mana Crypt", {
  primaryType: "Artifact",
  costValue: 0,
  attrs: { type_line: "Artifact", roles: ["mana-rock", "ramp"] },
});
/** Birds of Paradise: a dork at 1. */
const birds = named("Birds of Paradise", {
  costValue: 1,
  attrs: { type_line: "Creature — Bird", roles: ["mana-dork"] },
});
/** Arcane Signet: a rock at 2 — ramp, not fast. */
const signet = named("Arcane Signet", {
  primaryType: "Artifact",
  costValue: 2,
  attrs: { type_line: "Artifact", roles: ["mana-rock", "ramp"] },
});
/** Demonic Tutor: tutor, no other role. */
const demonic = named("Demonic Tutor", {
  costValue: 2,
  attrs: { type_line: "Sorcery", roles: ["tutor"] },
});
/** Vampiric Tutor: tutor at 1 — a tutor, never fast mana. */
const vampiric = named("Vampiric Tutor", {
  costValue: 1,
  attrs: { type_line: "Instant", roles: ["tutor"] },
});
/** Seat of the Synod: an artifact land — primaryType Artifact, a land all the same. */
const seat = named("Seat of the Synod", {
  primaryType: "Artifact",
  costValue: 0,
  attrs: { type_line: "Artifact Land", roles: ["ramp"] },
});
/** Dryad Arbor: a creature land — primaryType Creature, a land all the same. */
const arbor = named("Dryad Arbor", {
  primaryType: "Creature",
  costValue: 0,
  attrs: { type_line: "Land Creature — Forest Dryad", roles: ["mana-dork"] },
});
/** Valakut Awakening // Valakut Stoneforge: a spell front, a land back — a spell. */
const awakening = named("Valakut Awakening // Valakut Stoneforge", {
  primaryType: "Instant",
  costValue: 3,
  attrs: { type_line: "Instant // Land" },
});
/** Turntimber Symbiosis // Turntimber, Serpentine Wood: the same shape, counted as a spell at 7. */
const symbiosis = named("Turntimber Symbiosis // Turntimber, Serpentine Wood", {
  primaryType: "Sorcery",
  costValue: 7,
  attrs: { type_line: "Sorcery // Land" },
});
/** Ondu Inversion's cousin with a land FRONT: a land. */
const landFront = named("Branchloft Pathway // Boulderloft Pathway", {
  primaryType: "Land",
  costValue: 0,
  attrs: { type_line: "Land // Land" },
});
/** A card with no roles at all. */
const plain = named("Plain Spell", { costValue: 4 });
/** An X spell: its mana value is what ingest wrote (Scryfall counts X as 0). */
const xSpell = named("Torment of Hailfire", {
  costValue: 2,
  attrs: { type_line: "Sorcery", mana_cost: "{X}{B}{B}" },
});
/** A land that tutors (Tagger's tutor role, not its land-tutor tag) — a land AND a tutor. */
const tutoringLand = named("Inventors' Fair", {
  primaryType: "Land",
  costValue: 0,
  attrs: { type_line: "Legendary Land", roles: ["tutor"] },
});

function deck(main: { card: MtgCard; qty?: number }[], commanders: MtgCard[] = [atraxa]) {
  const cards = cardMap([...commanders, ...main.map((m) => m.card)]);
  const snapshot = commanderDeck(
    commanders,
    main.map((m) => entry(m.card, m.qty ?? 1)),
  );
  return { snapshot, cards };
}

const facts = (main: { card: MtgCard; qty?: number }[], commanders?: MtgCard[]) => {
  const d = deck(main, commanders);
  return mtgSpeedFacts(d.snapshot, d.cards);
};

describe("mtgIsLand — the front face of the type line, never primaryType", () => {
  it.each([
    ["Basic Land — Forest", true],
    ["Land", true],
    ["Legendary Land", true],
    ["Artifact Land", true],
    ["Land Creature — Forest Dryad", true],
    ["Land // Land", true],
    ["Instant // Land", false],
    ["Sorcery // Land", false],
    ["Legendary Creature — Elf Druid", false],
    ["Artifact", false],
    ["", false],
  ])("%s → %s", (typeLine, land) => {
    expect(mtgIsLand({ type_line: typeLine })).toBe(land);
  });

  it("an artifact land and Dryad Arbor are lands though their primaryType ranks another type first", () => {
    expect(seat.primaryType).toBe("Artifact");
    expect(arbor.primaryType).toBe("Creature");
    expect(facts([{ card: seat }, { card: arbor }, { card: plain }])).toEqual({
      fastMana: 0,
      tutors: 0,
      averageManaValue: 4,
      lands: 2,
    });
  });
});

describe("mtgSpeedFacts — the calibration's definitions", () => {
  it("counts by copy, the commander left out", () => {
    const f = facts([
      { card: solRing, qty: 1 },
      { card: demonic, qty: 2 },
      { card: basicLands(1)[0], qty: 30 },
      { card: plain, qty: 3 },
    ]);
    // 30 lands; spells: Sol Ring 1, two Demonic at 2, three plains at 4 = 1 + 4 + 12 = 17 over 6.
    expect(f).toEqual({ fastMana: 1, tutors: 2, averageManaValue: 2.83, lands: 30 });
  });

  it("the commander is never counted — not as a land, a spell, fast mana or a tutor", () => {
    // Dryad Arbor as the commander (a land), beside a Sol Ring commander (fast mana) and a tutor.
    const withLeaders = facts([{ card: plain }], [arbor, solRing, demonic]);
    expect(withLeaders).toEqual({ fastMana: 0, tutors: 0, averageManaValue: 4, lands: 0 });
    // The same cards in the main zone count.
    expect(facts([{ card: plain }, { card: arbor }, { card: solRing }, { card: demonic }])).toEqual(
      { fastMana: 1, tutors: 1, averageManaValue: 2.33, lands: 1 },
    );
  });

  it("fast mana: nonland, mana value 1 or less, any of ramp / mana rock / mana dork", () => {
    expect(FAST_MANA_MAX_MANA_VALUE).toBe(1);
    expect([...FAST_MANA_ROLES].sort()).toEqual(["mana-dork", "mana-rock", "ramp"]);
    const f = facts([
      { card: solRing }, // rock at 1
      { card: crypt }, // rock + ramp at 0
      { card: birds }, // dork at 1
      { card: signet }, // rock at 2: not fast
      { card: vampiric }, // tutor at 1: not fast
      { card: seat }, // a land with a ramp role: a land, not fast mana
      { card: arbor }, // a land with a dork role: a land
      { card: plain }, // no roles
    ]);
    expect(f!.fastMana).toBe(3);
    expect(f!.tutors).toBe(1);
    expect(f!.lands).toBe(2);
  });

  it("a ramp card at mana value 2 is not fast mana; one at 1 is", () => {
    expect(facts([{ card: signet }])!.fastMana).toBe(0);
    expect(facts([{ card: { ...signet, costValue: 1 } }])!.fastMana).toBe(1);
  });

  it("tutors: the tutor role alone, on any main-zone card — a land that tutors is both", () => {
    expect(facts([{ card: demonic }, { card: vampiric }, { card: plain }])!.tutors).toBe(2);
    const f = facts([{ card: tutoringLand }, { card: plain }]);
    expect(f).toEqual({ fastMana: 0, tutors: 1, averageManaValue: 4, lands: 1 });
  });

  it("a card with no roles counts for the curve only", () => {
    expect(plain.attrs.roles).toBeUndefined();
    expect(facts([{ card: plain }])).toEqual({
      fastMana: 0,
      tutors: 0,
      averageManaValue: 4,
      lands: 0,
    });
  });

  it("modal double-faced cards: a spell front is a spell (at its mana value), a land front is a land", () => {
    const f = facts([{ card: awakening }, { card: symbiosis }, { card: landFront }]);
    expect(f).toEqual({ fastMana: 0, tutors: 0, averageManaValue: 5, lands: 1 });
  });

  it("an X spell counts at the mana value ingest wrote; a null mana value counts as 0", () => {
    expect(facts([{ card: xSpell }])!.averageManaValue).toBe(2);
    const nullMv = { ...plain, id: "null-mana-value", costValue: null };
    expect(facts([{ card: nullMv }, { card: plain }])!.averageManaValue).toBe(2);
  });

  it("the average is over nonland copies, two decimals; 0 with no spells", () => {
    const f = facts([
      { card: { ...plain, costValue: 3 }, qty: 1 },
      { card: { ...plain, id: "p2", costValue: 4 }, qty: 2 },
    ]);
    // (3 + 8) / 3 = 3.666…
    expect(f!.averageManaValue).toBe(3.67);
    expect(facts([{ card: basicLands(1)[0], qty: 40 }])).toEqual({
      fastMana: 0,
      tutors: 0,
      averageManaValue: 0,
      lands: 40,
    });
  });

  it("an empty list, a commander alone, and main-zone ids the map lacks → null", () => {
    expect(facts([])).toBeNull();
    const d = deck([{ card: plain }]);
    d.cards.delete(plain.id);
    expect(mtgSpeedFacts(d.snapshot, d.cards)).toBeNull();
  });

  it("every zone but the format's leader zone is the main zone; an unknown format falls back to 'commander'", () => {
    const leader = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
    expect(leader).toBe("commander");
    const d = deck([{ card: plain }]);
    const other = { ...d.snapshot, formatCode: "no-such-format" };
    expect(mtgSpeedFacts(other, d.cards)).toEqual(mtgSpeedFacts(d.snapshot, d.cards));
  });

  it("a real-shaped list: 36 lands, 4 fast mana, 2 tutors over 100 cards", () => {
    const lands = basicLands(36);
    const fill = fillers(100 - 1 - 36 - 6);
    const f = facts([
      ...lands.map((c) => ({ card: c })),
      { card: solRing },
      { card: crypt },
      { card: birds },
      { card: signet },
      { card: demonic },
      { card: vampiric },
      ...fill.map((c) => ({ card: c })),
    ]);
    expect(f!.lands).toBe(36);
    expect(f!.fastMana).toBe(3);
    expect(f!.tutors).toBe(2);
    expect(mtgSpeedLooksTuned(f!)).toBe(false);
  });
});

describe("mtgSpeedLooksTuned — the two cuts, at their edges", () => {
  const at = (over: Partial<MtgSpeedFacts>): MtgSpeedFacts => ({
    fastMana: 2,
    tutors: 0,
    averageManaValue: 3.5,
    lands: 38,
    ...over,
  });

  it("the cuts are the calibration's: fast mana 6 or more, lands 33 or fewer", () => {
    expect(MTG_SPEED_CUTS).toEqual({ fastMana: 6, lands: 33 });
  });

  it("fast mana: 5 is not tuned, 6 is", () => {
    expect(mtgSpeedLooksTuned(at({ fastMana: 5 }))).toBe(false);
    expect(mtgSpeedLooksTuned(at({ fastMana: 6 }))).toBe(true);
    expect(mtgSpeedLooksTuned(at({ fastMana: 14 }))).toBe(true);
  });

  it("lands: 34 is not tuned, 33 is", () => {
    expect(mtgSpeedLooksTuned(at({ lands: 34 }))).toBe(false);
    expect(mtgSpeedLooksTuned(at({ lands: 33 }))).toBe(true);
    expect(mtgSpeedLooksTuned(at({ lands: 26 }))).toBe(true);
  });

  it("the curve and the tutors never ask — the Marchesa false positive", () => {
    expect(mtgSpeedLooksTuned(at({ averageManaValue: 2.95, tutors: 10 }))).toBe(false);
    expect(mtgSpeedLooksTuned(at({ averageManaValue: 1.5, tutors: 20 }))).toBe(false);
  });

  it("the precon extremes stay below both cuts (fast mana 5 and lands 34, the calibration's closest)", () => {
    expect(mtgSpeedLooksTuned(at({ fastMana: 5, lands: 34 }))).toBe(false);
  });
});

describe("the words — the sheet's rows, the table's line, the nudge", () => {
  const cedh: MtgSpeedFacts = { fastMana: 12, tutors: 10, averageManaValue: 2.07, lands: 26 };
  const precon: MtgSpeedFacts = { fastMana: 2, tutors: 0, averageManaValue: 3.68, lands: 38 };
  const ones: MtgSpeedFacts = { fastMana: 1, tutors: 1, averageManaValue: 3.8, lands: 1 };

  it("the rows: fast mana and tutors with their plain meaning, the curve with the lands", () => {
    expect(mtgSpeedRows(cedh)).toEqual([
      {
        id: "fast-mana",
        label: "Fast mana",
        value: "12",
        meaning: "mana sources costing 1 or less",
      },
      {
        id: "tutors",
        label: "Tutors",
        value: "10",
        meaning: "cards that search for other cards, land tutors aside",
      },
      { id: "curve", label: "Curve", value: "average mana value 2.07, 26 lands" },
    ]);
  });

  it("the line: the four numbers, two decimals on the curve, one or many", () => {
    expect(mtgSpeedLine(cedh)).toBe("12 fast mana, 10 tutors, average mana value 2.07, 26 lands");
    expect(mtgSpeedLine(precon)).toBe("2 fast mana, 0 tutors, average mana value 3.68, 38 lands");
    expect(mtgSpeedLine(ones)).toBe("1 fast mana, 1 tutor, average mana value 3.80, 1 land");
  });

  it("the nudge names only what crossed a cut; null when nothing did", () => {
    expect(mtgSpeedNudge(cedh)).toBe(
      "12 fast mana and 26 lands look like a cEDH list. If it is, say so below.",
    );
    expect(mtgSpeedNudge({ ...precon, fastMana: 6 })).toBe(
      "6 fast mana look like a cEDH list. If it is, say so below.",
    );
    expect(mtgSpeedNudge({ ...precon, lands: 33 })).toBe(
      "33 lands look like a cEDH list. If it is, say so below.",
    );
    expect(mtgSpeedNudge(precon)).toBeNull();
    expect(mtgSpeedNudge({ ...precon, fastMana: 5, lands: 34 })).toBeNull();
  });

  it("said: rows, line, tuned and nudge together", () => {
    expect(mtgSpeedSaid(precon)).toEqual({
      rows: mtgSpeedRows(precon),
      line: mtgSpeedLine(precon),
      tuned: false,
      nudge: null,
    });
    expect(mtgSpeedSaid(cedh).tuned).toBe(true);
    expect(mtgSpeedSaid(cedh).nudge).toBe(mtgSpeedNudge(cedh));
  });

  it("copy rules: no em or en dash, at most one middle dot, no '+', no 'est.'", () => {
    const words = [cedh, precon, ones].flatMap((f) => [
      mtgSpeedLine(f),
      mtgSpeedNudge(f) ?? "",
      ...mtgSpeedRows(f).flatMap((r) => [r.label, r.value, r.meaning ?? ""]),
      MTG_SPEED_LABEL,
    ]);
    expect(words.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(words.filter((w) => w.split(" · ").length > 2)).toEqual([]);
    expect(words.filter((w) => /\d\+|est\./i.test(w))).toEqual([]);
    expect(words.filter((w) => /approv/i.test(w))).toEqual([]);
  });
});

describe("the adapter's declaration", () => {
  it("mtgBrackets.speed is the module's; its label names the source; it asks the cEDH question", () => {
    expect(mtgBrackets.speed).toBe(mtgBracketSpeed);
    expect(getAdapter("mtg").brackets!.speed).toBe(mtgBracketSpeed);
    expect(MTG_SPEED_LABEL).toBe("Speed (Scryfall Tagger roles)");
    expect(mtgBracketSpeed.label).toBe(MTG_SPEED_LABEL);
    expect(MTG_SPEED_ASKS).toBe("cedh");
    expect(MTG_BRACKET_QUESTIONS.map((q) => q.key)).toContain(mtgBracketSpeed.asks);
    expect(MTG_BRACKET_QUESTIONS.find((q) => q.key === mtgBracketSpeed.asks)!.question).toBe(
      "Tuned for the cEDH metagame?",
    );
  });

  it("facts: the words for a list, null for a list with no main-zone cards", () => {
    const d = deck([{ card: solRing }, { card: demonic }, { card: basicLands(1)[0], qty: 30 }]);
    expect(mtgBracketSpeed.facts(d.snapshot, d.cards)).toEqual(
      mtgSpeedSaid({ fastMana: 1, tutors: 1, averageManaValue: 1.5, lands: 30 }),
    );
    const empty = deck([]);
    expect(mtgBracketSpeed.facts(empty.snapshot, empty.cards)).toBeNull();
  });

  it("One Piece declares no brackets, so no speed", () => {
    expect(getAdapter("optcg").brackets).toBeUndefined();
  });

  it("the read's assumption line still holds, word for word", () => {
    const d = deck([{ card: plain }]);
    const read = mtgBrackets.assess({
      deck: d.snapshot,
      cards: d.cards,
      combos: [],
      freshness: null,
    });
    expect(read.assumptions).toContain(
      "Tutors and fast mana don't change the read. Wizards dropped tutor limits in October 2025.",
    );
  });
});

describe("the read never takes roles — assess is the same object with and without them", () => {
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
  const rhystic = named("Rhystic Study", {
    costValue: 3,
    attrs: { type_line: "Enchantment", game_changer: true, roles: ["card-draw"] },
  });
  const strip = (c: MtgCard): MtgCard => {
    const attrs: MtgAttrs = { ...c.attrs };
    delete attrs.roles;
    return { ...c, attrs };
  };

  it("a cEDH-shaped list reads the same with every role present and with none", () => {
    const lands = basicLands(26);
    const fast = [solRing, crypt, birds, seat, arbor];
    const rest = fillers(100 - 1 - 26 - fast.length - 4);
    const main = [...lands, ...fast, demonic, vampiric, rhystic, signet, ...rest];
    const withRoles = deck(main.map((c) => ({ card: c })));
    const without = {
      snapshot: withRoles.snapshot,
      cards: new Map([...withRoles.cards].map(([id, c]) => [id, strip(c)])),
    };
    expect([...without.cards.values()].every((c) => c.attrs.roles === undefined)).toBe(true);
    const input = (cards: ReadonlyMap<string, MtgCard>) => ({
      deck: withRoles.snapshot,
      cards,
      combos: [],
      freshness: FRESH,
      targetLevel: 2,
      answers: { rulesetVersion: mtgBrackets.ruleset.version, play: { fast: "yes" as const } },
    });
    const a = mtgBrackets.assess(input(withRoles.cards));
    const b = mtgBrackets.assess(input(without.cards));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // One Game Changer: a firm 3 — from the flag, with or without the roles beside it.
    expect(a.minimum).toBe(3);
    expect(a.factors.map((f) => f.id)).toContain("game-changers");
    // While the facts differ completely between the two maps.
    expect(mtgSpeedFacts(withRoles.snapshot, withRoles.cards)).toEqual({
      fastMana: 3,
      tutors: 2,
      averageManaValue: expect.any(Number) as number,
      lands: 28,
    });
    expect(mtgSpeedFacts(without.snapshot, without.cards)).toEqual({
      fastMana: 0,
      tutors: 0,
      averageManaValue: expect.any(Number) as number,
      lands: 28,
    });
  });

  it("the declared flags are still all a read takes — roles is not among them", () => {
    expect(MTG_BRACKET_FLAG_PATHS).toEqual([["game_changer"], ["mld"], ["extra_turn"]]);
    const keys: readonly string[] = MTG_BRACKET_FLAG_PATHS.map(([k]) => k);
    expect(keys).not.toContain("roles");
  });
});
