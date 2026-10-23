/**
 * LATER row 151 — a precon's bracket read for its /precons tile: the share
 * page's words (the owner's voice, no goals, the facts ready), the bands
 * the filter reads, the share page's own BracketLine saying the same text,
 * and no read where the share page shows none. BRACKETS-PAGE: the read
 * itself rides along, and `preconSpread` counts the same reads for the
 * /brackets guide (each line as the tiles say it, the adapter's reasons).
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BracketLine } from "@/components/deck/bracket-line";
import { tableBracket } from "@/lib/brackets/table";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { PreconBracketFacts } from "@/lib/decks/precons";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";

import { preconBracket, preconSpread, type PreconBracket } from "./precon-brackets";

const mtg = getAdapter("mtg");
const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
  },
};

const commander = card({
  name: "Precon Commander",
  isLeaderCandidate: true,
  attrs: { type_line: "Legendary Creature — Test", oracle_text: "" },
});
const rhystic = card({
  name: "Rhystic Study",
  attrs: { type_line: "Enchantment", oracle_text: "", game_changer: true },
});
const dockside = card({ name: "Dockside Extortionist", legality: [{ status: "banned" }] });
const [pieceA, pieceB, pieceC] = ["A", "B", "C"].map((n) => card({ name: `Piece ${n}` }));
const spicy: CompleteCombo = {
  key: "2552-3263",
  cardPieces: [pieceA.id, pieceB.id, pieceC.id].sort(),
  templates: [],
  tag: "S",
  relevant: false,
  results: ["Infinite mana"],
  popularity: 1000,
};

/** A precon as the page's facts hold it: its entries and its cards (no image). */
function precon(specials: MtgCard[], size = 100) {
  const main = [...specials, ...fillers(Math.max(0, size - 1 - specials.length))];
  const entries: EditorEntry[] = [
    { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
    ...main.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
  ];
  const cards = new Map<string, EditorCard>(
    [commander, ...main].map((c) => [c.id, { ...c, image: null }]),
  );
  return { entries, cards };
}

const read = (
  list: ReturnType<typeof precon>,
  combos: CompleteCombo[] = [],
  freshness: BracketFreshness | null = FRESH,
) => preconBracket({ adapter: mtg, format: COMMANDER, ...list, combos, freshness });

/** The tile's two fields (BRACKETS-PAGE added `read` beside them). */
const said = (b: PreconBracket | null) => b && { line: b.line, bands: b.bands };

describe("preconBracket", () => {
  it("says each read in the share page's words, with the bands the filter reads", () => {
    expect(said(read(precon([])))).toEqual({
      line: "Bracket 1 to 2 · nothing here goes past Core",
      bands: [{ level: 1, label: "1 to 2" }],
    });
    expect(said(read(precon([rhystic])))).toEqual({
      line: "At least Bracket 3 (Upgraded)",
      bands: [{ level: 3, label: "3" }],
    });
    // A precon has no owner: the reader is the one who'd play it ("your call").
    expect(said(read(precon([pieceA, pieceB, pieceC]), [spicy]))).toEqual({
      line: "Bracket 3 or 4 · one combo is your call",
      bands: [
        { level: 3, label: "3" },
        { level: 4, label: "4" },
      ],
    });
    expect(said(read(precon([dockside])))).toEqual({
      line: "Bracket read needs a legal list · 1 banned card",
      bands: [],
    });
    expect(read(precon([]), [], null)?.line).toBe(
      "Bracket read incomplete · Couldn't check Game Changers, mass land denial, extra turns and combos",
    );
  });

  it("the share page's BracketLine says the same words over the same read", () => {
    const cases: [ReturnType<typeof precon>, CompleteCombo[]][] = [
      [precon([]), []],
      [precon([rhystic]), []],
      [precon([pieceA, pieceB, pieceC]), [spicy]],
      [precon([dockside]), []],
    ];
    for (const [list, combos] of cases) {
      // The share page's precon read: tableBracket in the owner's voice, no goals, facts ready.
      const table = tableBracket({
        adapter: mtg,
        format: COMMANDER,
        ...list,
        combos,
        freshness: FRESH,
        goals: null,
        voice: "owner",
      })!;
      const { container, unmount } = render(
        <BracketLine
          adapter={mtg}
          read={table.read}
          ctx={table.ctx}
          facts="ready"
          onRetry={() => {}}
          onWhy={() => {}}
        />,
      );
      const shown = container
        .querySelector("[data-slot=bracket-line]")!
        .textContent!.replace(/\s*Why\?$/, "");
      expect(read(list, combos)?.line).toBe(shown);
      // BRACKETS-PAGE: the read itself is the share page's.
      expect(read(list, combos)?.read).toEqual(table.read);
      unmount();
    }
  });

  it("no read where the share page shows none: no commander, or a game without brackets", () => {
    const list = precon([rhystic]);
    const noCommander = { ...list, entries: list.entries.filter((e) => e.zone !== "commander") };
    expect(read(noCommander)).toBeNull();
    const optcg = getAdapter("optcg");
    expect(
      preconBracket({
        adapter: optcg,
        format: optcg.formats[0],
        ...list,
        combos: [],
        freshness: FRESH,
      }),
    ).toBeNull();
  });

  it("past the facts' id cap the combos aren't read, as the share page asks for none", () => {
    const big = precon([pieceA, pieceB, pieceC], 210);
    expect(read(big, [spicy])?.line).toBe("Bracket read incomplete · Couldn't check combos");
    expect(read(precon([pieceA, pieceB, pieceC]), [spicy])?.line).toContain("your call");
  });
});

describe("preconSpread (BRACKETS-PAGE): every precon's read, counted for the guide", () => {
  const [twoA, twoB] = ["Two A", "Two B"].map((n) => card({ name: `Piece ${n}` }));
  // Relevant, two cards, nothing else rated: Wizards' two-card rule alone puts it at 3.
  const twoCard: CompleteCombo = {
    key: "1-2",
    cardPieces: [twoA.id, twoB.id].sort(),
    templates: [],
    tag: "E",
    relevant: true,
    results: ["Infinite damage"],
    popularity: 500,
  };
  /** The page's facts for these precons, keyed by an id per precon. */
  function facts(lists: { specials: MtgCard[]; combos?: CompleteCombo[] }[]): PreconBracketFacts {
    const entries = new Map<string, EditorEntry[]>();
    const cards = new Map<string, EditorCard>();
    const combos = new Map<string, CompleteCombo[]>();
    lists.forEach(({ specials, combos: held }, i) => {
      const list = precon(specials);
      const id = `precon-${i}`;
      entries.set(id, list.entries);
      for (const [cardId, c] of list.cards) cards.set(cardId, c);
      if (held) combos.set(id, held);
    });
    return { entries, cards, combos, freshness: FRESH };
  }

  it("each line as the tiles say it, lowest band first, then the most precons; a blocked list last", () => {
    const spread = preconSpread({
      adapter: mtg,
      format: COMMANDER,
      facts: facts([
        { specials: [dockside] },
        { specials: [rhystic] },
        { specials: [] },
        { specials: [pieceA, pieceB, pieceC], combos: [spicy] },
        { specials: [] },
      ]),
    })!;
    expect(spread.total).toBe(5);
    expect(spread.lines).toEqual([
      { line: "Bracket 1 to 2 · nothing here goes past Core", count: 2 },
      { line: "At least Bracket 3 (Upgraded)", count: 1 },
      { line: "Bracket 3 or 4 · one combo is your call", count: 1 },
      { line: "Bracket read needs a legal list · 1 banned card", count: 1 },
    ]);
    expect(spread.base).toEqual({ level: 1, label: "1 to 2" });
  });

  it("the adapter's reasons, a precon counted once per reason, the most first; a blocked list's cards never count", () => {
    const spread = preconSpread({
      adapter: mtg,
      format: COMMANDER,
      facts: facts([
        { specials: [rhystic] },
        { specials: [rhystic, twoA, twoB], combos: [twoCard] },
        { specials: [twoA, twoB], combos: [twoCard] },
        { specials: [rhystic, dockside] },
        { specials: [] },
      ]),
    })!;
    // Rhystic + the combo holds both; the banned list's Rhystic Study is no reason.
    expect(spread.past).toBe(3);
    expect(spread.reasons).toEqual([
      { reason: "A Game Changer", count: 2 },
      { reason: "A two-card combo", count: 2 },
    ]);
    // A three-card combo Spellbook rates "3 or 4" is firm at 3 (the 4 is the open question): its rating is the reason.
    const open = preconSpread({
      adapter: mtg,
      format: COMMANDER,
      facts: facts([{ specials: [pieceA, pieceB, pieceC], combos: [spicy] }]),
    })!;
    expect(open.past).toBe(1);
    expect(open.reasons).toEqual([
      { reason: "A combo Commander Spellbook rates Bracket 3 or higher", count: 1 },
    ]);
  });

  it("no precons, no lines; a game without brackets, no spread", () => {
    expect(preconSpread({ adapter: mtg, format: COMMANDER, facts: facts([]) })).toEqual({
      total: 0,
      lines: [],
      base: null,
      past: 0,
      reasons: [],
    });
    const optcg = getAdapter("optcg");
    expect(preconSpread({ adapter: optcg, format: optcg.formats[0], facts: facts([]) })).toBeNull();
  });
});
