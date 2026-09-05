/**
 * Regression: corpus trigger_text values (all 504, verified 2026-09-04)
 * already start with "[Trigger] " — punk-map stores source text verbatim —
 * and bodyText used to prepend the keyword again, rendering
 * "[Trigger] [Trigger] Draw 1 card." on card/hub pages and the editor
 * detail pane (reproduced on ST01-002 Usopp's card page, 2026-09-04).
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "../types";
import { optcgAdapter, type OptcgAttrs } from "./adapter";

type OptcgCard = CardData<OptcgAttrs>;

function card(attrs: Partial<OptcgAttrs>): OptcgCard {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    externalKey: "ST01-002",
    name: "Usopp",
    primaryType: "Character",
    costValue: 2,
    colorsMask: 8, // Red
    ciMask: 8,
    isLeaderCandidate: false,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    legality: [],
    attrs: { category: "character", type_line: "Character — Test", oracle_text: "", ...attrs },
  };
}

const bodyText = optcgAdapter.display.bodyText;

describe("display.bodyText trigger rendering", () => {
  it("renders a corpus-shaped trigger_text's [Trigger] keyword exactly once", () => {
    const text = bodyText(
      card({ oracle_text: "[On Play] Do the thing.", trigger_text: "[Trigger] Draw 1 card." }),
    );
    expect(text).toBe("[On Play] Do the thing.\n[Trigger] Draw 1 card.");
    expect(text.match(/\[Trigger\]/g)).toHaveLength(1);
  });

  it("still adds the keyword for a trigger_text that lacks the prefix", () => {
    expect(bodyText(card({ oracle_text: "", trigger_text: "Draw 1 card." }))).toBe(
      "[Trigger] Draw 1 card.",
    );
  });

  it("renders effect text alone when there is no trigger", () => {
    expect(bodyText(card({ oracle_text: "[Blocker]" }))).toBe("[Blocker]");
  });

  it("does not lead with a newline when the card has only a trigger", () => {
    expect(bodyText(card({ oracle_text: "", trigger_text: "[Trigger] Draw 1 card." }))).toBe(
      "[Trigger] Draw 1 card.",
    );
  });
});
