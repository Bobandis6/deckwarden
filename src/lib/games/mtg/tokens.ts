/**
 * What tells one Magic token from another (DECK-TOKENS). Names identify
 * cards, but not tokens: 105 token names name several tokens (fifteen
 * Soldiers, thirty-one Elementals), so a token row carries its P/T, its
 * colors and its first keywords — "1/1 white, flying" (commas: the copy
 * policy allows one middle dot a line, and a row may hold its own) — and a
 * token that has none of the three (Treasure, The Monarch, an emblem) needs
 * nothing beside its name. The adapter's `display.tokenCaption`; the links a card
 * makes into the catalog are `tokenLinks` (attrs.tokens, written at ingest).
 */
import { COLOR_BIT, maskToLetters } from "../colors";
import type { CardData } from "../types";
import type { MtgAttrs } from "./attrs";

type MtgTokenCard = Omit<CardData<MtgAttrs>, "legality">;

const COLOR_WORDS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

/** "1/1 white, flying", "4/4 red green, haste, trample", "1/1 colorless"; null for a card or a bare token. */
export function mtgTokenCaption(card: MtgTokenCard): string | null {
  if (card.attrs.is_token !== true) return null;
  const { power, toughness, keywords } = card.attrs;
  const pt = power != null && toughness != null ? `${power}/${toughness}` : null;
  const colors = maskToLetters(card.colorsMask & ~COLOR_BIT.C).map((c) => COLOR_WORDS[c]);
  // A colorless creature token says so: its colored namesakes are why the caption exists.
  const color = colors.length > 0 ? colors.join(" ") : pt ? "colorless" : null;
  const head = [pt, color].filter(Boolean).join(" ");
  const words = (keywords ?? [])
    .slice(0, 2)
    .map((k) => k.toLowerCase())
    .join(", ");
  return [head, words].filter(Boolean).join(", ") || null;
}

/** The token-catalog oracle ids a card links to (`attrs.tokens`); [] for none. */
export function mtgTokenLinks(card: MtgTokenCard): readonly string[] {
  return card.attrs.tokens ?? [];
}
