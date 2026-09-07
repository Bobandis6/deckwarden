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

// P4.5: the /l/ finishes shelf renders this credit + link with every row —
// the plan's hard attribution rule for tournament data. Pinned so a
// capability rename or URL drift fails loudly, like MTG's Topdeck meta.
describe("capabilities.tournaments (Limitless, P4.5)", () => {
  it("declares the Limitless credit", () => {
    expect(optcgAdapter.capabilities.tournaments).toMatchObject({
      sourceLabel: "Limitless",
      sourceHref: "https://play.limitlesstcg.com",
    });
  });

  it("builds the public event permalink from the stored external key", () => {
    expect(optcgAdapter.capabilities.tournaments!.eventUrl("6a8f06390580a332c84204b0")).toBe(
      "https://play.limitlesstcg.com/tournament/6a8f06390580a332c84204b0",
    );
  });
});

// P4.6 funnel-walk pins: the guest journey (hub CTA → paste import) exposed
// every one of these — each is a recorded design decision, not decoration.
describe("OP funnel vocabulary + routing (P4.6)", () => {
  it("opening hand is 5 — the widget drew MTG's 7 for OP decks before this", () => {
    expect(optcgAdapter.formats[0].openingHandSize).toBe(5);
  });

  it("idBadge is the printed card id — names identify nothing (two Enel leaders)", () => {
    expect(optcgAdapter.display.idBadge!(card({}))).toBe("ST01-002");
  });

  it("importZoneFor routes leader-category cards to the leader zone, nothing else", () => {
    const leader = card({ category: "leader" });
    expect(optcgAdapter.importZoneFor!(leader)).toBe("leader");
    expect(optcgAdapter.importZoneFor!(card({ category: "character" }))).toBeNull();
    expect(optcgAdapter.importZoneFor!(card({ category: "event" }))).toBeNull();
  });

  it("placeholders speak One Piece, not Sol Ring", () => {
    expect(optcgAdapter.display.searchPlaceholder).toContain("OP01-025");
    expect(optcgAdapter.display.importPlaceholder).toContain("OP15-058");
    expect(optcgAdapter.display.importPlaceholder).toContain("Limitless");
  });
});
