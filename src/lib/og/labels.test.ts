import { describe, expect, it } from "vitest";

import { GAME_ID } from "@/db/seed-data";
import { deckOgLabels } from "./labels";

describe("deckOgLabels", () => {
  it("MTG unfurls keep the P2.6 vocabulary and fetch art", () => {
    expect(deckOgLabels(GAME_ID.mtg)).toEqual({
      kicker: "Commander deck",
      curveLabel: "Mana curve",
      fetchArt: true,
      accent: "#b5a2ff",
    });
  });

  it("OP unfurls are game-true and ARTLESS — the P4.1/P4.4 posture extends to decks", () => {
    expect(deckOgLabels(GAME_ID.optcg)).toEqual({
      kicker: "One Piece deck",
      curveLabel: "Cost curve",
      fetchArt: false,
      accent: "#62d6c5",
    });
  });

  it("an unmapped game gets neutral words and no assumed art source", () => {
    expect(deckOgLabels(GAME_ID.azuki)).toEqual({
      kicker: "Deck",
      curveLabel: "Cost curve",
      fetchArt: false,
      accent: "#a5b4fc",
    });
  });
});
