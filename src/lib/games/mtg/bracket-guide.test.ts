/**
 * BRACKETS-PAGE — the /brackets guide's words, as the Magic adapter
 * declares them (`mtgBrackets.guide`): each level's rows straight off the
 * reviewed table (and following it when the table changes), the Game
 * Changers' allowance and declaration, the note under the levels, the
 * read's own assumption lines, what puts a read past Core, the sheet's
 * guide link, and D0's copy guard over every word here.
 */
import { describe, expect, it } from "vitest";

import type { BracketFreshness, CompleteCombo } from "../types";
import type { MtgAttrs } from "./attrs";
import { mtgGameChangerAllowance, mtgGuideLevels, MTG_BRACKET_GUIDE } from "./bracket-guide";
import { MTG_BRACKET_LINKS } from "./bracket-line";
import { BRACKET_RULESET, type BracketLevel } from "./bracket-ruleset";
import {
  assessBracket,
  BRACKET_FEEDS,
  mtgBracketGuide,
  mtgBracketReasons,
  mtgBrackets,
} from "./brackets";
import { card, cardMap, commanderDeck, entry, fillers, type MtgCard } from "./test-fixtures";

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT, detail: "53 cards" },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
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
  "Guide Commander",
  { type_line: "Legendary Creature — Test" },
  { isLeaderCandidate: true },
);
const rhystic = named("Rhystic Study", { game_changer: true });
const armageddon = named("Armageddon", { mld: "clear" });
const timeWarp = named("Time Warp", { extra_turn: true });
const [pieceA, pieceB, pieceC] = ["A", "B", "C"].map((n) => named(`Piece ${n}`));

const combo = (
  key: string,
  pieces: MtgCard[],
  over: Partial<CompleteCombo> = {},
): CompleteCombo => ({
  key,
  cardPieces: pieces.map((c) => c.id).sort(),
  templates: [],
  tag: "E",
  relevant: false,
  results: ["Infinite damage"],
  popularity: 100,
  ...over,
});

/** A full Commander list: the commander, these cards, fillers to 100. */
function spec(specials: MtgCard[]) {
  const main = [...specials, ...fillers(99 - specials.length)];
  return {
    deck: commanderDeck(
      [commander],
      main.map((c) => entry(c)),
    ),
    cards: cardMap([commander, ...main]),
  };
}
const read = (specials: MtgCard[], combos: CompleteCombo[] = []) =>
  assessBracket({ ...spec(specials), combos, freshness: FRESH });

describe("the five levels, off the reviewed table", () => {
  it("each level's rows, word for word, in one order", () => {
    const rows = MTG_BRACKET_GUIDE.levels.map((l) => [
      l.level,
      Object.fromEntries(l.rows.map((r) => [r.label, r.value])),
    ]);
    expect(rows).toEqual([
      [
        1,
        {
          "Game Changers": "None",
          "Mass land denial": "None",
          "Extra turns": "None",
          "Two-card combos": "None",
          "Games last": "At least 9 turns",
        },
      ],
      [
        2,
        {
          "Game Changers": "None",
          "Mass land denial": "None",
          "Extra turns": "A few, never chained or looped",
          "Two-card combos": "None",
          "Games last": "At least 8 turns",
        },
      ],
      [
        3,
        {
          "Game Changers": "Up to three",
          "Mass land denial": "None",
          "Extra turns": "A few, never chained or looped",
          "Two-card combos": "None before turn 6",
          "Games last": "At least 6 turns",
        },
      ],
      [
        4,
        {
          "Game Changers": "No limit",
          "Mass land denial": "Allowed",
          "Extra turns": "No limit",
          "Two-card combos": "No limit",
          "Games last": "At least 4 turns",
        },
      ],
      [
        5,
        {
          "Game Changers": "No limit",
          "Mass land denial": "Allowed",
          "Extra turns": "No limit",
          "Two-card combos": "No limit",
          "Games last": "Any number of turns",
        },
      ],
    ]);
    expect(MTG_BRACKET_GUIDE.levels.map((l) => l.level)).toEqual(
      mtgBrackets.levels.map((l) => l.level),
    );
    for (const l of MTG_BRACKET_GUIDE.levels) {
      expect(l.rows.map((r) => r.label)).toEqual([
        "Game Changers",
        "Mass land denial",
        "Extra turns",
        "Two-card combos",
        "Games last",
      ]);
    }
  });

  it("a reviewed change to the table moves the words with it", () => {
    const changed: BracketLevel[] = BRACKET_RULESET.levels.map((l) =>
      l.level === 3 ? { ...l, gameChangers: 4, twoCardCombos: "any", turns: 7 } : { ...l },
    );
    const three = mtgGuideLevels(changed).find((l) => l.level === 3)!;
    expect(Object.fromEntries(three.rows.map((r) => [r.label, r.value]))).toMatchObject({
      "Game Changers": "Up to four",
      "Two-card combos": "No limit",
      "Games last": "At least 7 turns",
    });
    expect(mtgGameChangerAllowance(changed)).toBe(
      "Brackets 1 and 2 allow none, Bracket 3 up to four, Brackets 4 and 5 any number.",
    );
    const late = mtgGuideLevels(
      BRACKET_RULESET.levels.map((l) => (l.level === 3 ? { ...l, turns: null } : { ...l })),
    ).find((l) => l.level === 3)!;
    expect(late.rows.find((r) => r.label === "Two-card combos")?.value).toBe(
      "None early in the game",
    );
  });

  it("the note under them: what a list with none of those cards reads", () => {
    expect(MTG_BRACKET_GUIDE.levelsNote).toBe(
      "With none of these cards, a list reads Bracket 1 to 2: Exhibition and Core then differ only by intent, which the cards can't show.",
    );
    // The line's own words for such a list.
    expect(mtgBrackets.line(read([]), { ...spec([]), progress: null })).toBe(
      "Bracket 1 to 2 · nothing here goes past Core",
    );
    expect(MTG_BRACKET_GUIDE.rulesAsOf).toBe(BRACKET_RULESET.asOf);
  });
});

describe("the Game Changers, as the guide declares them", () => {
  it("the allowance, grouped by what each level allows", () => {
    expect(MTG_BRACKET_GUIDE.list.allowance).toBe(
      "Brackets 1 and 2 allow none, Bracket 3 up to three, Brackets 4 and 5 any number.",
    );
    // A single first level takes the singular verb.
    expect(
      mtgGameChangerAllowance(
        BRACKET_RULESET.levels.map((l) => (l.level === 2 ? { ...l, gameChangers: 1 } : { ...l })),
      ),
    ).toBe(
      "Bracket 1 allows none, Bracket 2 up to one, Bracket 3 up to three, Brackets 4 and 5 any number.",
    );
  });

  it("the read's own flag, a real feed, the reviewed revision and Wizards' page", () => {
    const list = MTG_BRACKET_GUIDE.list;
    expect(list.label).toBe("Game Changers");
    expect(mtgBrackets.flagPaths).toContainEqual(list.path);
    expect(list.path).toEqual(["game_changer"]);
    expect(BRACKET_FEEDS).toContain(list.feed);
    expect(list.asOf).toBe(BRACKET_RULESET.gameChangers.asOf);
    expect(list.count).toBe(BRACKET_RULESET.gameChangers.count);
    expect(list.href).toBe("https://magic.wizards.com/en/formats/commander#gamechangers");
  });

  it("the declaration rides the adapter, with the sheet's guide link", () => {
    expect(mtgBrackets.guide).toBe(mtgBracketGuide);
    expect(mtgBracketGuide.levels).toBe(MTG_BRACKET_GUIDE.levels);
    expect(MTG_BRACKET_LINKS.guide).toEqual({ label: "How brackets work", href: "/brackets" });
  });
});

describe("the read's own assumption lines", () => {
  it("the same lines a read says at the same freshness, and without one", () => {
    expect(mtgBracketGuide.assumptions(FRESH)).toEqual(read([]).assumptions);
    expect(mtgBracketGuide.assumptions(FRESH).at(-1)).toBe(
      "Game Changers: Wizards' list as of Oct 4, 2026.",
    );
    expect(mtgBracketGuide.assumptions(null).at(-1)).toBe("Game Changers: Wizards' list.");
    expect(mtgBracketGuide.assumptions(null)).toHaveLength(7);
  });
});

describe("what puts a read past Core (the guide's precon reasons)", () => {
  it("each kind of evidence above Core, once, in one order", () => {
    expect(mtgBracketReasons(read([]))).toEqual([]);
    expect(mtgBracketReasons(read([rhystic]))).toEqual(["A Game Changer"]);
    expect(mtgBracketReasons(read([armageddon]))).toEqual(["Mass land denial"]);
    // Wizards' two-card rule (a relevant combo of two cards).
    const two = combo("1-2", [pieceA, pieceB], { relevant: true });
    expect(mtgBracketReasons(read([pieceA, pieceB], [two]))).toEqual(["A two-card combo"]);
    // Rated past Core by Commander Spellbook (a three-card "3 or 4").
    const rated = combo("3-4-5", [pieceA, pieceB, pieceC], { tag: "S" });
    expect(mtgBracketReasons(read([pieceA, pieceB, pieceC], [rated]))).toEqual([
      "A combo Commander Spellbook rates Bracket 3 or higher",
    ]);
    // Everything at once: the fixed order, each kind once.
    expect(
      mtgBracketReasons(read([armageddon, pieceA, pieceB, pieceC, rhystic], [two, rated])),
    ).toEqual([
      "A Game Changer",
      "A two-card combo",
      "A combo Commander Spellbook rates Bracket 3 or higher",
      "Mass land denial",
    ]);
  });

  it("nothing at Core or below is a reason: an extra-turn card, a combo rated 2", () => {
    expect(read([timeWarp]).minimum).toBe(2);
    expect(mtgBracketReasons(read([timeWarp]))).toEqual([]);
    const two = combo("6-7", [pieceA, pieceB], { tag: "C" });
    expect(read([pieceA, pieceB], [two]).minimum).toBe(2);
    expect(mtgBracketReasons(read([pieceA, pieceB], [two]))).toEqual([]);
    expect(mtgBracketGuide.reasons).toBe(mtgBracketReasons);
  });
});

describe("copy guard (WAVE4 D0, WAVE5 D0): every word the guide says", () => {
  function words(): string[] {
    const two = combo("1-2", [pieceA, pieceB], { relevant: true });
    const rated = combo("3-4-5", [pieceA, pieceB, pieceC], { tag: "S" });
    return [
      ...MTG_BRACKET_GUIDE.levels.flatMap((l) => l.rows.flatMap((r) => [r.label, r.value])),
      MTG_BRACKET_GUIDE.levelsNote,
      MTG_BRACKET_GUIDE.list.label,
      MTG_BRACKET_GUIDE.list.allowance,
      ...mtgBracketGuide.assumptions(FRESH),
      ...mtgBracketGuide.assumptions(null),
      ...mtgBracketReasons(
        read([armageddon, pieceA, pieceB, pieceC, rhystic, timeWarp], [two, rated]),
      ),
      MTG_BRACKET_LINKS.guide!.label,
    ];
  }

  it("reads real words", () => {
    expect(words().length).toBeGreaterThan(30);
  });

  it("no em or en dash, no digit range; at most one middle dot a line", () => {
    expect(words().filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(words().filter((w) => w.split(" · ").length > 2)).toEqual([]);
  });

  it("plain words, never notation; no approve; no Spellbook tag names", () => {
    expect(words().filter((w) => /\d\+|est\./i.test(w))).toEqual([]);
    expect(words().filter((w) => /approv/i.test(w))).toEqual([]);
    expect(
      words().filter((w) => /ruthless|spicy|powerful|oddball|precon appropriate|casual/i.test(w)),
    ).toEqual([]);
  });
});
