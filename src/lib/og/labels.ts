/**
 * Game vocabulary for the deck OG unfurl (P4.6). The deck OG route predates
 * the second game and hardcoded "Commander deck" / "Mana curve" — an OP deck
 * unfurling as a Commander deck is the kind of first impression the beta
 * can't afford. Pure lookup so the choice is test-pinned.
 *
 * Art posture rides on the same gameId: MTG fetches commander art from
 * Scryfall (P2.6); OP unfurls stay ARTLESS — the deliberate P4.1/P4.4 call
 * (never Bandai art in generated images while the permission posture is
 * unanswered) extends to deck OGs unchanged.
 */
import { GAME_ID } from "@/db/seed-data";

export interface DeckOgLabels {
  kicker: string;
  curveLabel: string;
  /** Only MTG fetches art (Scryfall, attributed); everything else is artless. */
  fetchArt: boolean;
}

export function deckOgLabels(gameId: number): DeckOgLabels {
  if (gameId === GAME_ID.mtg) {
    return { kicker: "Commander deck", curveLabel: "Mana curve", fetchArt: true };
  }
  if (gameId === GAME_ID.optcg) {
    return { kicker: "One Piece deck", curveLabel: "Cost curve", fetchArt: false };
  }
  // A game this file hasn't met yet: neutral words, no art source assumed.
  return { kicker: "Deck", curveLabel: "Cost curve", fetchArt: false };
}
