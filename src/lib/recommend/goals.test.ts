/**
 * Y6a — goals in Suggestions (WAVE4 D7): `applyGoals`, the one pure step
 * after ranking. Pinned here:
 * - the order: rank all → goals → slice — a list whose top 25 are all above
 *   the target still comes back 25 long, the 25 hidden and counted;
 * - conflicts never score: every row keeps its rank, score and evidence
 *   exactly as ranked, and a conflict never enters the evidence;
 * - only the cards that ranked above the list's last row count as hidden;
 * - the budget line (inclusive; unpriced never fits) is a flag, never a hide;
 * - with no target, nothing is hidden — the adapter's lines are flags;
 * - WAVE4 E's acceptance through the real Magic adapter: at budget All and
 *   target 2, every Game Changer, land-denial card, second extra-turn card
 *   and above-target combo completion is hidden and counted; with no
 *   target, impact flags only.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  BracketConflict,
  BracketImpactInput,
  BracketInput,
  CardData,
  CompleteCombo,
} from "@/lib/games/types";
import { mtgBrackets } from "@/lib/games/mtg/brackets";
import type { MtgAttrs } from "@/lib/games/mtg/attrs";
import {
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "@/lib/games/mtg/test-fixtures";
import { applyGoals, budgetConflict, type GoalsRead } from "./goals";
import type { Recommendation } from "./types";

let n = 0;
function rec(over: Partial<Recommendation> = {}): Recommendation {
  n++;
  return {
    cardId: `card-${String(n).padStart(3, "0")}`,
    name: `Card ${n}`,
    primaryType: "Artifact",
    costValue: 2,
    ciMask: 0,
    cheapestUsd: "1.00",
    popularity: n,
    score: 1 - n / 1000,
    confidence: "high",
    evidence: [
      { source: "edhrec_rank", why: `Rank ${n}`, with: [], howOften: `#${n}`, confidence: "high" },
    ],
    ...over,
  };
}

/** A stub adapter: `over` cards sit above any target; with none they'd raise the line. */
function stub(over: ReadonlySet<string>) {
  const impact = vi.fn((input: BracketImpactInput): BracketConflict[] =>
    over.has(input.card.id)
      ? [
          {
            rule: "stub",
            level: 4,
            source: "Stub source",
            why: input.targetLevel !== null ? "Above your target" : "Would raise the line",
          },
        ]
      : [],
  );
  return { impact };
}

/** A GoalsRead whose candidates are every ranked card (the stub reads only their ids). */
function readOf(ranked: readonly Recommendation[]): GoalsRead {
  const input = {} as BracketInput;
  return {
    input,
    read: {
      status: "read",
      minimum: 1,
      suggested: null,
      factors: [],
      assumptions: [],
      review: [],
      blockedBy: [],
      conflicts: [],
      ruleset: { version: 1, asOf: "2026-02-09" },
      answersStale: false,
    },
    candidates: new Map(
      ranked.map((r) => [r.cardId, { card: { id: r.cardId } as CardData, completes: [] }]),
    ),
  };
}

describe("applyGoals — the order: rank all → goals → slice", () => {
  it("the top 25 all above the target: they're hidden and counted, and 25 others still come back, in rank order", () => {
    const ranked = Array.from({ length: 50 }, () => rec());
    const over = new Set(ranked.slice(0, 25).map((r) => r.cardId));
    const out = applyGoals(ranked, { targetLevel: 2 }, readOf(ranked), stub(over), 25);
    expect(out.kept.map((r) => r.cardId)).toEqual(ranked.slice(25).map((r) => r.cardId));
    expect(out.hidden.map((r) => r.cardId)).toEqual(ranked.slice(0, 25).map((r) => r.cardId));
    expect(out.hidden.every((r) => r.conflicts.every((c) => c.severity === "hide"))).toBe(true);
    expect(out.flagged).toBe(0);
  });

  it("only the cards that ranked above the list's last row are hidden — the walk stops once the list is full", () => {
    const [a, b, c, d, e, f] = Array.from({ length: 6 }, () => rec());
    const meta = stub(new Set([a.cardId, c.cardId, e.cardId]));
    const out = applyGoals(
      [a, b, c, d, e, f],
      { targetLevel: 1 },
      readOf([a, b, c, d, e, f]),
      meta,
      2,
    );
    expect(out.kept.map((r) => r.cardId)).toEqual([b.cardId, d.cardId]);
    expect(out.hidden.map((r) => r.cardId)).toEqual([a.cardId, c.cardId]);
    // e and f were never needed, so never checked.
    expect(meta.impact).toHaveBeenCalledTimes(4);
  });

  it("no goals and no read: the ranked list cut to the limit, every row with no conflict", () => {
    const ranked = Array.from({ length: 30 }, () => rec());
    const out = applyGoals(ranked, null, null, undefined, 25);
    expect(out.kept.map((r) => r.cardId)).toEqual(ranked.slice(0, 25).map((r) => r.cardId));
    expect(out.kept.every((r) => r.conflicts.length === 0)).toBe(true);
    expect(out.hidden).toEqual([]);
  });

  it("the adapter hears the goals' target, the read, the card and its combos", () => {
    const ranked = [rec()];
    const read = readOf(ranked);
    const meta = stub(new Set());
    applyGoals(ranked, { targetLevel: 3 }, read, meta, 25);
    const [input] = meta.impact.mock.calls[0];
    expect(input.targetLevel).toBe(3);
    expect(input.read).toBe(read.read);
    expect(input.card.id).toBe(ranked[0].cardId);
    expect(input.completes).toEqual([]);
  });
});

describe("applyGoals — conflicts never score", () => {
  it("every row keeps its score, confidence and evidence exactly as ranked — with goals, without, and hidden alike", () => {
    const ranked = Array.from({ length: 12 }, () => rec());
    const over = new Set([ranked[1].cardId, ranked[4].cardId]);
    const plain = applyGoals(ranked, null, null, undefined, 10);
    const goaled = applyGoals(ranked, { targetLevel: 2 }, readOf(ranked), stub(over), 10);
    const byId = new Map(ranked.map((r) => [r.cardId, r]));
    for (const row of [...plain.kept, ...goaled.kept, ...goaled.hidden]) {
      const { conflicts, ...rest } = row;
      expect(rest).toEqual(byId.get(row.cardId));
      expect(JSON.stringify(rest.evidence)).toBe(JSON.stringify(byId.get(row.cardId)!.evidence));
      // A conflict is never evidence.
      for (const c of conflicts) {
        expect(rest.evidence.some((e) => e.why === c.why || e.source === c.source)).toBe(false);
      }
    }
    // The kept rows are the plain list minus the hidden ones, in the same order.
    expect(goaled.kept.map((r) => r.cardId)).toEqual(
      ranked
        .filter((r) => !over.has(r.cardId))
        .slice(0, 10)
        .map((r) => r.cardId),
    );
  });
});

describe("applyGoals — no target: flags, nothing hidden", () => {
  it("the adapter's lines ride the row as flags and are counted", () => {
    const ranked = Array.from({ length: 5 }, () => rec());
    const over = new Set([ranked[0].cardId, ranked[2].cardId]);
    const out = applyGoals(ranked, {}, readOf(ranked), stub(over), 25);
    expect(out.hidden).toEqual([]);
    expect(out.kept).toHaveLength(5);
    expect(out.flagged).toBe(2);
    expect(out.kept[0].conflicts).toEqual([
      { rule: "stub", source: "Stub source", why: "Would raise the line", severity: "flag" },
    ]);
  });
});

describe("the budget (the deck's own per-card tier)", () => {
  it("over it: one flag line, the price and the tier in it; at it, nothing (inclusive); unpriced never fits", () => {
    expect(budgetConflict({ cheapestUsd: "45.10" }, 5)).toEqual({
      rule: "budget",
      source: "Card price",
      severity: "flag",
      why: "Costs $45.10 — over your ≤ $5 a card budget",
    });
    expect(budgetConflict({ cheapestUsd: "5.00" }, 5)).toBeNull();
    expect(budgetConflict({ cheapestUsd: "1.01" }, 1)?.why).toBe(
      "Costs $1.01 — over your ≤ $1 a card budget",
    );
    expect(budgetConflict({ cheapestUsd: null }, 5)?.why).toBe(
      "No known price — your budget is ≤ $5 a card",
    );
    expect(budgetConflict({ cheapestUsd: "45.10" }, undefined)).toBeNull();
  });

  it("a flag even beside a target — the budget never hides a card", () => {
    const pricey = rec({ cheapestUsd: "20.00" });
    const out = applyGoals(
      [pricey],
      { targetLevel: 2, budget: { perCardUsd: 5 } },
      null,
      undefined,
      25,
    );
    expect(out.kept.map((r) => r.conflicts.map((c) => c.severity))).toEqual([["flag"]]);
    expect(out.flagged).toBe(1);
  });
});

// --- WAVE4 E's acceptance, through the real Magic adapter -------------------------------------

describe("WAVE4 E's acceptance — budget All, target 2 (the Magic adapter)", () => {
  const named = (name: string, attrs: Partial<MtgAttrs> = {}, over: Partial<MtgCard> = {}) =>
    card({
      ...over,
      name,
      externalKey: `oracle-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs },
    });
  const commander = named("Test Commander", {}, { isLeaderCandidate: true });
  const timeWarp = named("Time Warp", { extra_turn: true });
  const partner = named("Combo Partner");
  const [p1, p2] = [named("Engine Piece"), named("Second Piece")];
  const fill = fillers(100 - 1 - 4);
  const deck = commanderDeck(
    [commander],
    [timeWarp, partner, p1, p2, ...fill].map((c) => entry(c)),
  );
  const cards = cardMap([commander, timeWarp, partner, p1, p2, ...fill]);

  // The candidates, best first: everything the acceptance names, then plain staples.
  const rhystic = named("Rhystic Study", { game_changer: true });
  const rift = named("Cyclonic Rift", { game_changer: true });
  const armageddon = named("Armageddon", { mld: "clear" });
  const liliana = named("Liliana of the Veil", { mld: "edge" });
  const temporal = named("Temporal Manipulation", { extra_turn: true });
  const twoCardPiece = named("Two-Card Finisher");
  const ruthlessPiece = named("Fast Combo Piece");
  const staples = ["Arcane Signet", "Sol Ring", "Command Tower", "Mind Stone"].map((x) => named(x));
  const candidates = [
    rhystic,
    armageddon,
    temporal,
    rift,
    twoCardPiece,
    liliana,
    ruthlessPiece,
    ...staples,
  ];
  const completes = new Map<string, CompleteCombo[]>([
    [
      twoCardPiece.id,
      [
        {
          key: "two",
          cardPieces: [partner.id, twoCardPiece.id].sort(),
          templates: [],
          tag: "E",
          relevant: true,
          results: ["Infinite damage"],
          popularity: 900,
        },
      ],
    ],
    [
      ruthlessPiece.id,
      [
        {
          key: "ruthless",
          cardPieces: [p1.id, p2.id, ruthlessPiece.id].sort(),
          templates: [],
          tag: "R",
          relevant: false,
          results: ["Win the game"],
          popularity: 400,
        },
      ],
    ],
  ]);

  function run(targetLevel: number | null) {
    const input: BracketInput = {
      deck,
      cards,
      combos: [],
      freshness: null,
      targetLevel,
      answers: null,
    };
    const read: GoalsRead = {
      input,
      read: mtgBrackets.assess(input as BracketInput<MtgAttrs>),
      candidates: new Map(
        candidates.map((c) => [c.id, { card: c, completes: completes.get(c.id) ?? [] }]),
      ),
    };
    const ranked = candidates.map((c, i) =>
      rec({ cardId: c.id, name: c.name, score: 1 - i / 100 }),
    );
    return applyGoals(
      ranked,
      { targetLevel: targetLevel ?? undefined },
      read,
      mtgBrackets as Pick<typeof mtgBrackets, "impact"> as never,
      25,
    );
  }

  it("every Game Changer, land-denial card, second extra-turn card and above-target combo completion is hidden and counted", () => {
    const out = run(2);
    expect(out.hidden.map((r) => r.name)).toEqual([
      "Rhystic Study",
      "Armageddon",
      "Temporal Manipulation",
      "Cyclonic Rift",
      "Two-Card Finisher",
      "Liliana of the Veil",
      "Fast Combo Piece",
    ]);
    expect(out.kept.map((r) => r.name)).toEqual(staples.map((s) => s.name));
    expect(out.hidden.map((r) => r.conflicts.map((c) => c.why))).toEqual([
      ["A Game Changer (Wizards' list) — your Bracket 2 target allows none"],
      ["Mass land denial — Wizards expects none at Brackets 1–3 (Scryfall Tagger)"],
      ["A second extra-turn card — Brackets 2 and 3 avoid chaining extra turns (Scryfall Tagger)"],
      ["A Game Changer (Wizards' list) — your Bracket 2 target allows none"],
      [
        "Completes a two-card combo — Wizards expects none at Brackets 1 and 2 (Commander Spellbook)",
      ],
      [
        "Possible mass land denial, your call — Wizards expects none at Brackets 1–3 (Scryfall Tagger)",
      ],
      ["Completes a combo that alone makes a deck at least Bracket 4 (Commander Spellbook)"],
    ]);
  });

  it("with no target: impact flags only — nothing hidden, the same cards flagged with what they'd make the deck", () => {
    const out = run(null);
    expect(out.hidden).toEqual([]);
    expect(out.kept.map((r) => r.name)).toEqual(candidates.map((c) => c.name));
    expect(out.flagged).toBe(7);
    expect(out.kept[0].conflicts).toEqual([
      {
        rule: "game-changers",
        source: "Wizards' Game Changers list (via Scryfall)",
        why: "Would make this deck at least Bracket 3 — a Game Changer (Wizards' list)",
        severity: "flag",
      },
    ]);
    expect(out.kept.slice(7).every((r) => r.conflicts.length === 0)).toBe(true);
  });

  it("at target 4 only what's above 4 hides — here nothing", () => {
    const out = run(4);
    expect(out.hidden).toEqual([]);
    expect(out.flagged).toBe(0);
  });
});
