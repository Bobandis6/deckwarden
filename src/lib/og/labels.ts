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
import { ogAccent } from "@/lib/theme/tokens";

export interface DeckOgLabels {
  kicker: string;
  curveLabel: string;
  /** Only MTG fetches art (Scryfall, attributed); everything else is artless. */
  fetchArt: boolean;
  /** The game accent the kicker, curve bars and wordmark paint (R1a, tokens.ts). */
  accent: string;
}

export function deckOgLabels(gameId: number): DeckOgLabels {
  const accent = ogAccent(gameId);
  if (gameId === GAME_ID.mtg) {
    return { kicker: "Commander deck", curveLabel: "Mana curve", fetchArt: true, accent };
  }
  if (gameId === GAME_ID.optcg) {
    return { kicker: "One Piece deck", curveLabel: "Cost curve", fetchArt: false, accent };
  }
  // A game this file hasn't met yet: neutral words, no art source assumed.
  return { kicker: "Deck", curveLabel: "Cost curve", fetchArt: false, accent };
}
