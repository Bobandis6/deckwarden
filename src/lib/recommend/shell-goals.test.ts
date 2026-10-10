/**
 * Y6b — the deck's target held while a starter shell grows (shell-goals.ts),
 * over the REAL Magic adapter: the caps count the kept cards and every pick
 * so far, two picks that complete a combo together are caught when the
 * second is asked about, answers count, and `skippedByGoals` counts only
 * what a cap kept out.
 */
import { describe, expect, it } from "vitest";

import type { MtgAttrs } from "@/lib/games/mtg/attrs";
import { getAdapter } from "@/lib/games/registry";
import { card, cardMap, entry, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import type { BracketAnswers, CardData, CompleteCombo } from "@/lib/games/types";
import { shellGoals, skippedByGoals } from "./shell-goals";

const brackets = getAdapter("mtg").brackets!;

const named = (name: string, attrs: Partial<MtgAttrs> = {}) =>
  card({
    name,
    externalKey: `oracle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs },
  });

const commander = card({ name: "Test Commander", isLeaderCandidate: true });
const gcs = [
  "Rhystic Study",
  "Cyclonic Rift",
  "Smothering Tithe",
  "Demonic Tutor",
  "Mana Vault",
].map((n) => named(n, { game_changer: true }));
const armageddon = named("Armageddon", { mld: "clear" });
const liliana = named("Liliana of the Veil", { mld: "edge" });
const turns = ["Time Warp", "Temporal Manipulation", "Capture of Jingzhou"].map((n) =>
  named(n, { extra_turn: true }),
);
const [pieceA, pieceB] = ["Piece A", "Piece B"].map((n) => named(n));
const plain = named("Arcane Signet");
const all = [...gcs, armageddon, liliana, ...turns, pieceA, pieceB, plain];

/** A two-card combo Spellbook calls relevant — Wizards: at least Bracket 3. */
const twoCard: CompleteCombo = {
  key: "a-b",
  cardPieces: [pieceA.id, pieceB.id].sort(),
  templates: [],
  tag: "E",
  relevant: true,
  results: ["Infinite mana"],
  popularity: 500,
};

function gate(
  targetLevel: number,
  keep: MtgCard[] = [],
  opts: { combos?: CompleteCombo[]; answers?: BracketAnswers | null } = {},
) {
  return shellGoals({
    meta: brackets,
    deck: {
      gameId: "mtg",
      formatCode: "commander",
      zones: { commander: [entry(commander)], main: keep.map((c) => entry(c)) },
    },
    cards: cardMap([commander, ...keep]) as ReadonlyMap<string, CardData>,
    candidates: cardMap(all.filter((c) => !keep.includes(c))) as ReadonlyMap<string, CardData>,
    combos: opts.combos ?? [twoCard],
    zone: "main",
    targetLevel,
    answers: opts.answers ?? null,
  });
}
const why = (g: ReturnType<typeof gate>, c: MtgCard, picks: MtgCard[] = []) =>
  g
    .conflicts(
      c.id,
      picks.map((p) => p.id),
    )
    .map((x) => x.why);

describe("shellGoals — each card against the kept list and the picks so far", () => {
  it("Game Changers at a target of 3: three fit in all — the kept ones count, the picks so far count", () => {
    const g = gate(3);
    expect(why(g, gcs[0])).toEqual([]);
    expect(why(g, gcs[2], gcs.slice(0, 2))).toEqual([]);
    expect(why(g, gcs[3], gcs.slice(0, 3))).toEqual([
      "A fourth Game Changer (Wizards' list) — your Bracket 3 target allows up to three",
    ]);
    // Two kept: one more fits, a second doesn't.
    const kept = gate(3, gcs.slice(0, 2));
    expect(why(kept, gcs[2])).toEqual([]);
    expect(why(kept, gcs[3], [gcs[2]])).toEqual([
      "A fourth Game Changer (Wizards' list) — your Bracket 3 target allows up to three",
    ]);
  });

  it("Game Changers at targets 1 and 2: none", () => {
    for (const t of [1, 2]) {
      expect(why(gate(t), gcs[0])).toEqual([
        `A Game Changer (Wizards' list) — your Bracket ${t} target allows none`,
      ]);
    }
  });

  it("extra turns: none at 1; one at 2 and 3 — a kept one counts", () => {
    expect(why(gate(1), turns[0])).toEqual([
      "An extra-turn card — Bracket 1 expects none (Scryfall Tagger)",
    ]);
    for (const t of [2, 3]) {
      expect(why(gate(t), turns[0])).toEqual([]);
      expect(why(gate(t), turns[1], [turns[0]])).toEqual([
        "A second extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
      ]);
      expect(why(gate(t, [turns[0]]), turns[1])).toEqual([
        "A second extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)",
      ]);
    }
  });

  it("mass land denial at targets 1–3, clear or edge; nothing at 4", () => {
    for (const t of [1, 2, 3]) {
      expect(why(gate(t), armageddon)).toEqual([
        "Mass land denial — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
      ]);
      expect(why(gate(t), liliana)).toEqual([
        "Possible mass land denial, your call — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
      ]);
    }
    expect(why(gate(4), armageddon)).toEqual([]);
    expect(why(gate(4), gcs[3], gcs.slice(0, 3))).toEqual([]);
  });

  it("two picks that complete a combo together: the second is caught, whichever comes first", () => {
    const g = gate(2);
    const line =
      "Completes a two-card combo — Wizards expects none at Brackets 1 and 2 (Commander Spellbook)";
    expect(why(g, pieceB)).toEqual([]);
    expect(why(g, pieceB, [pieceA])).toEqual([line]);
    expect(why(g, pieceA, [pieceB])).toEqual([line]);
    // A kept piece: the first pick completes it.
    expect(why(gate(2, [pieceA]), pieceB)).toEqual([line]);
    // At a target of 3 a two-card combo fits.
    expect(why(gate(3), pieceB, [pieceA])).toEqual([]);
  });

  it("answers count: an edge land-denial card answered no fits; a chain answered no admits that second card", () => {
    const calls = {
      [`land-denial:${liliana.externalKey}`]: "no",
      [`extra-turns:${[turns[0], turns[1]]
        .map((c) => c.externalKey)
        .sort()
        .join("+")}`]: "no",
    } as const;
    const g = gate(3, [], { answers: { rulesetVersion: 1, calls } });
    expect(why(g, liliana)).toEqual([]);
    expect(why(g, turns[1], [turns[0]])).toEqual([]);
    // A third makes another chain — unanswered.
    expect(why(g, turns[2], [turns[0], turns[1]])).toHaveLength(1);
  });

  it("a card it knows nothing of fits; the verdict never depends on what was asked before", () => {
    const g = gate(2);
    expect(g.conflicts("ffffffff-ffff-4fff-8fff-ffffffffffff", [])).toEqual([]);
    expect(why(g, pieceB, [pieceA])).toHaveLength(1);
    expect(why(g, pieceB)).toEqual([]);
    expect(why(g, pieceB, [pieceA])).toHaveLength(1);
    expect(why(g, plain, [pieceA, pieceB])).toEqual([]);
  });
});

describe("skippedByGoals — what a target kept out, by rule", () => {
  const picks = (cards: MtgCard[]) => cards.map((c) => ({ cardId: c.id }));

  it("a cap counts only what passed it: five Game Changers at a target of 3 skip two; at 2, all five", () => {
    expect(skippedByGoals(gate(3), picks([...gcs, plain]))).toEqual({ "game-changers": 2 });
    expect(skippedByGoals(gate(2), picks([...gcs, plain]))).toEqual({ "game-changers": 5 });
    // With two kept, three of the five are over.
    expect(skippedByGoals(gate(3, gcs.slice(3)), picks(gcs.slice(0, 3)))).toEqual({
      "game-changers": 2,
    });
  });

  it("every rule a pick breaks counts it; a skipped piece never completes the next one's combo", () => {
    const both = named("Jokulhaups Changer", { game_changer: true, mld: "clear" });
    const g = shellGoals({
      meta: brackets,
      deck: { gameId: "mtg", formatCode: "commander", zones: { commander: [entry(commander)] } },
      cards: cardMap([commander]) as ReadonlyMap<string, CardData>,
      candidates: cardMap([...all, both]) as ReadonlyMap<string, CardData>,
      combos: [twoCard],
      zone: "main",
      targetLevel: 2,
      answers: null,
    });
    expect(
      skippedByGoals(g, picks([both, armageddon, pieceA, pieceB, turns[0], turns[1]])),
    ).toEqual({
      "game-changers": 1,
      "land-denial": 2,
      combo: 1,
      "extra-turns": 1,
    });
    // A piece held back by a cap of its own is never "in": the next piece then completes nothing.
    const gcPiece = named("Game Changer Piece", { game_changer: true });
    const capped = shellGoals({
      meta: brackets,
      deck: { gameId: "mtg", formatCode: "commander", zones: { commander: [entry(commander)] } },
      cards: cardMap([commander]) as ReadonlyMap<string, CardData>,
      candidates: cardMap([gcPiece, pieceB]) as ReadonlyMap<string, CardData>,
      combos: [{ ...twoCard, key: "gc-b", cardPieces: [gcPiece.id, pieceB.id].sort() }],
      zone: "main",
      targetLevel: 2,
      answers: null,
    });
    expect(skippedByGoals(capped, picks([gcPiece, pieceB]))).toEqual({ "game-changers": 1 });
    // At a target of 3 a two-card combo fits: nothing skipped.
    expect(skippedByGoals(gate(3), picks([pieceA, pieceB]))).toEqual({});
  });
});
