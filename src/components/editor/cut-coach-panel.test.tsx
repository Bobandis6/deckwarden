/**
 * The Cut Coach and the Tokens zone (DECK-TOKENS): over the maximum, the
 * ranked cuts come from the playable list only — cutting a token never
 * brings the 100 down, so a deck holding tokens is never offered one. The
 * pure ranking runs with no deck id, so no request is involved.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { basicLands, card, fillers } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

import { CutCoachPanel } from "./cut-coach-panel";

const mtg = getAdapter("mtg");
const editorCard = (c: ReturnType<typeof card>): EditorCard => ({ ...c, image: null });

describe("CutCoachPanel — the Tokens zone (DECK-TOKENS)", () => {
  it("over by one, the ranked cuts never include a token", () => {
    const commander = editorCard(card({ name: "Brago, King Eternal", isLeaderCandidate: true }));
    const spells = fillers(63).map(editorCard);
    const lands = basicLands(37).map(editorCard);
    const treasure = editorCard(
      card({
        name: "Treasure",
        primaryType: "Artifact",
        costValue: 0,
        attrs: { type_line: "Token Artifact — Treasure", oracle_text: "", is_token: true },
      }),
    );
    const entries: EditorEntry[] = [
      { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
      ...[...spells, ...lands].map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
      { cardId: treasure.id, zone: "tokens", qty: 9, tags: [] },
    ];
    const cards = new Map([commander, ...spells, ...lands, treasure].map((c) => [c.id, c]));
    render(
      <CutCoachPanel
        adapter={mtg}
        format={COMMANDER}
        deckId={null}
        entries={entries}
        cards={cards}
        saveStatus="saved"
        active
        onSetQty={() => undefined}
      />,
    );
    // 101 cards: over by one, the nine Treasures beside them counting for nothing.
    const cuts = screen.getAllByRole("button", { name: /^Cut one copy of / });
    expect(cuts.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Cut one copy of Treasure" })).toBeNull();
  });
});
