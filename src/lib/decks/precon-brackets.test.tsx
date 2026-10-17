/**
 * LATER row 151 — a precon's bracket read for its /precons tile: the share
 * page's words (the owner's voice, no goals, the facts ready), the bands
 * the filter reads, the share page's own BracketLine saying the same text,
 * and no read where the share page shows none.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BracketLine } from "@/components/deck/bracket-line";
import { tableBracket } from "@/lib/brackets/table";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";

import { preconBracket } from "./precon-brackets";

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

describe("preconBracket", () => {
  it("says each read in the share page's words, with the bands the filter reads", () => {
    expect(read(precon([]))).toEqual({
      line: "Bracket 1 to 2 · nothing here goes past Core",
      bands: [{ level: 1, label: "1 to 2" }],
    });
    expect(read(precon([rhystic]))).toEqual({
      line: "At least Bracket 3 (Upgraded)",
      bands: [{ level: 3, label: "3" }],
    });
    // A precon has no owner: the reader is the one who'd play it ("your call").
    expect(read(precon([pieceA, pieceB, pieceC]), [spicy])).toEqual({
      line: "Bracket 3 or 4 · one combo is your call",
      bands: [
        { level: 3, label: "3" },
        { level: 4, label: "4" },
      ],
    });
    expect(read(precon([dockside]))).toEqual({
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
