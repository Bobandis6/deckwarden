/**
 * Y6b — Magic's words for goals in Autofill and the Combo Radar (WAVE4 D7):
 *
 * 1. `shellNotes`: one line per rule with its count, exact text, every line
 *    naming its source.
 * 2. `comboBadge`: one combo on its own, read exactly as the list's read
 *    reads it — pinned against `assessBracket` over a finished list holding
 *    the combo (its factor's level, its question's level) — in plain words.
 * 3. D0's copy guard over both: no "approve", no Spellbook tag names, no
 *    notation.
 */
import { describe, expect, it } from "vitest";

import type { BracketFreshness, CompleteCombo } from "../types";
import { assessBracket, mtgComboBadge, mtgShellNotes } from "./brackets";
import { card, cardMap, commanderDeck, entry, fillers, type MtgCard } from "./test-fixtures";

const FRESH: BracketFreshness = {
  readAt: "2026-10-10T12:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
    landDenial: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
    extraTurns: { state: "ok", asOf: "2026-10-10T04:54:15.655Z" },
    combos: { state: "ok", asOf: "2026-10-10T04:55:53.189Z" },
  },
};

describe("mtgShellNotes — what the target kept out, one line per rule", () => {
  it("each rule's line, exact, at the targets it can fire", () => {
    expect(mtgShellNotes({ "game-changers": 4 }, 2)).toEqual([
      "Skipped 4 Game Changers — your Bracket 2 target allows none (Wizards' list)",
    ]);
    expect(mtgShellNotes({ "game-changers": 1 }, 1)).toEqual([
      "Skipped 1 Game Changer — your Bracket 1 target allows none (Wizards' list)",
    ]);
    expect(mtgShellNotes({ "game-changers": 2 }, 3)).toEqual([
      "Skipped 2 Game Changers — your Bracket 3 target allows up to three (Wizards' list)",
    ]);
    expect(mtgShellNotes({ "land-denial": 1 }, 3)).toEqual([
      "Skipped 1 land-denial card — Wizards expects no mass land denial at Brackets 1–3 (Scryfall Tagger)",
    ]);
    expect(mtgShellNotes({ "extra-turns": 2 }, 1)).toEqual([
      "Skipped 2 extra-turn cards — Bracket 1 expects none (Scryfall Tagger)",
    ]);
    expect(mtgShellNotes({ "extra-turns": 1 }, 2)).toEqual([
      "Skipped 1 more extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
    ]);
    expect(mtgShellNotes({ combo: 3 }, 2)).toEqual([
      "Skipped 3 cards that would complete a combo above your Bracket 2 target (Commander Spellbook)",
    ]);
  });

  it("the read's order whatever the keys' order; a rule without a count says nothing", () => {
    expect(
      mtgShellNotes({ combo: 1, "extra-turns": 1, "land-denial": 2, "game-changers": 3 }, 2),
    ).toEqual([
      "Skipped 3 Game Changers — your Bracket 2 target allows none (Wizards' list)",
      "Skipped 2 land-denial cards — Wizards expects no mass land denial at Brackets 1–3 (Scryfall Tagger)",
      "Skipped 1 more extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
      "Skipped 1 card that would complete a combo above your Bracket 2 target (Commander Spellbook)",
    ]);
    expect(mtgShellNotes({}, 2)).toEqual([]);
    expect(mtgShellNotes({ "game-changers": 0 }, 2)).toEqual([]);
  });
});

const commander = card({ name: "Test Commander", isLeaderCandidate: true });
const [a, b, c] = ["Piece A", "Piece B", "Piece C"].map((name) => card({ name }));

function combo(
  key: string,
  pieces: MtgCard[],
  over: Partial<Omit<CompleteCombo, "key" | "cardPieces">> = {},
): CompleteCombo {
  return {
    key,
    cardPieces: pieces.map((p) => p.id).sort(),
    templates: [],
    tag: "E",
    relevant: true,
    results: ["Win the game"],
    popularity: 1000,
    ...over,
  };
}

/** The engine's read of a finished list holding the combo's pieces: its level and its question's. */
function engineRead(k: CompleteCombo) {
  const pieces = [a, b, c].filter((p) => k.cardPieces.includes(p.id));
  const fill = fillers(99 - pieces.length);
  const read = assessBracket({
    deck: commanderDeck(
      [commander],
      [...pieces, ...fill].map((p) => entry(p)),
    ),
    cards: cardMap([commander, ...pieces, ...fill]),
    combos: [k],
    freshness: FRESH,
  });
  const factor = read.factors.find((f) => f.combo === k.key && f.atLeast !== null);
  const question = read.review.find((q) => q.combo === k.key);
  return { level: factor?.atLeast ?? 1, callLevel: question?.raisesTo ?? null };
}

const COMMANDER = new Set([commander.id]);
const CASES: { name: string; combo: CompleteCombo; words: string | null }[] = [
  {
    name: "R — at least 4",
    combo: combo("r", [a, b, c], { tag: "R", relevant: false }),
    words: "This combo alone makes a deck at least Bracket 4",
  },
  {
    name: "a relevant two-card combo tagged E — Wizards' rule, at least 3",
    combo: combo("two", [a, b]),
    words: "A two-card combo alone makes a deck at least Bracket 3",
  },
  {
    name: "S — 3, and 4 is your call",
    combo: combo("s", [a, b, c], { tag: "S", relevant: false }),
    words: "This combo alone makes a deck Bracket 3 or 4 — your call",
  },
  {
    name: "O — 2, and 3 is your call",
    combo: combo("o", [a, b, c], { tag: "O", relevant: false }),
    words: "This combo alone makes a deck Bracket 2 or 3 — your call",
  },
  {
    name: "C — at least 2",
    combo: combo("c", [a, b, c], { tag: "C", relevant: false }),
    words: "This combo alone makes a deck at least Bracket 2",
  },
  {
    name: "infinite turns — at least 4, whatever the tag",
    combo: combo("t", [a, b, c], { relevant: false, results: ["Infinite turns"] }),
    words: "This combo alone makes a deck at least Bracket 4",
  },
  {
    name: "a template combo — only a call",
    combo: combo("tpl", [a, b], { tag: "P", templates: ["A creature with power 5+"] }),
    words: "This combo could make a deck Bracket 3 — your call",
  },
  {
    name: "E, not relevant — nothing to say",
    combo: combo("e", [a, b, c], { relevant: false }),
    words: null,
  },
  {
    name: "a rating that wasn't ingested — couldn't check, never a low badge",
    combo: combo("null", [a, b, c], { tag: null, relevant: null }),
    words: "Couldn't check how this combo is rated",
  },
];

describe("mtgComboBadge — one combo on its own, as the list's read reads it", () => {
  it.each(CASES)("$name", ({ combo: k, words }) => {
    const badge = mtgComboBadge(k, new Set());
    expect(badge?.words ?? null).toBe(words);
    if (badge) {
      expect(badge.source).toBe("Commander Spellbook");
      // The engine agrees: the same level, the same question.
      const read = engineRead(k);
      expect(badge.level).toBe(read.level);
      expect(badge.callLevel).toBe(read.callLevel);
    }
  });

  it("with your commander: a two-card combo, and a rating the commander may raise is your call", () => {
    const k = combo("cmd", [commander, a, b]);
    expect(mtgComboBadge(k, COMMANDER)).toEqual({
      level: 3,
      callLevel: 4,
      words: "A two-card combo with your commander alone makes a deck Bracket 3 or 4 — your call",
      source: "Commander Spellbook",
    });
    // Without knowing the commander it's a three-card combo rated E: nothing.
    expect(mtgComboBadge(k, new Set())).toBeNull();
  });

  it("an answered question counts as answered: no drops the call, yes makes it firm", () => {
    const k = combo("s", [a, b, c], { tag: "S", relevant: false });
    const answers = (answer: "yes" | "no" | "unsure") => ({
      rulesetVersion: 1,
      calls: { "combo:s": answer },
    });
    expect(mtgComboBadge(k, new Set(), answers("no"))?.words).toBe(
      "This combo alone makes a deck at least Bracket 3",
    );
    expect(mtgComboBadge(k, new Set(), answers("yes"))?.words).toBe(
      "This combo alone makes a deck at least Bracket 4",
    );
    expect(mtgComboBadge(k, new Set(), answers("unsure"))?.words).toBe(
      "This combo alone makes a deck Bracket 3 or 4 — your call",
    );
    const tpl = combo("tpl", [a, b], { tag: "P", templates: ["A creature with power 5+"] });
    expect(mtgComboBadge(tpl, new Set(), { rulesetVersion: 1, calls: { "combo:tpl": "no" } })).toBe(
      null,
    );
  });
});

describe("D0's copy guard over the notes and the badges", () => {
  const every = [
    ...[1, 2, 3].flatMap((t) =>
      mtgShellNotes({ "game-changers": 2, "land-denial": 1, "extra-turns": 1, combo: 2 }, t),
    ),
    ...[1, 2, 3].flatMap((t) => mtgShellNotes({ "game-changers": 1, combo: 1 }, t)),
    ...CASES.flatMap((k) => mtgComboBadge(k.combo, new Set())?.words ?? []),
    mtgComboBadge(combo("cmd", [commander, a, b]), COMMANDER)!.words,
  ];

  it("reads every string", () => {
    expect(every.length).toBeGreaterThan(20);
  });

  it("no 'approve', no Spellbook tag names, no notation", () => {
    expect(every.filter((s) => /approv/i.test(s))).toEqual([]);
    expect(
      every.filter((s) => /ruthless|spicy|powerful|oddball|precon appropriate|casual/i.test(s)),
    ).toEqual([]);
    expect(every.filter((s) => /\d\+|est\./i.test(s))).toEqual([]);
  });
});
