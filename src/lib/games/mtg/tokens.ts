/**
 * What tells one Magic token from another (DECK-TOKENS). Names identify
 * cards, but not tokens: 105 token names name several tokens (fifteen
 * Soldiers, thirty-one Elementals), so a token row carries its P/T, its
 * colors and its first keywords — "1/1 white, flying" (commas: the copy
 * policy allows one middle dot a line, and a row may hold its own) — and a
 * token that has none of the three (Treasure, The Monarch, an emblem) needs
 * nothing beside its name. The adapter's `display.tokenCaption`; the links a card
 * makes into the catalog are `tokenLinks` (attrs.tokens, written at ingest).
 *
 * The same facts are how a player FINDS a token (`tokenQuery`): they read
 * "Elemental 4/4 blue red" off the card in their hand, and the name alone
 * doesn't reach it: 39 Elementals in the catalog on 2026-10-24, and the box
 * showed twelve while the 4/4 blue-red one came thirtieth.
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

const COLOR_LETTER: Record<string, string> = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
};

/**
 * Keywords a token prints, longest first so "first strike" wins over a
 * stray "strike"; mapped to Scryfall's capitalization (attrs.keywords).
 */
const TOKEN_KEYWORDS = [
  "double strike",
  "first strike",
  "deathtouch",
  "indestructible",
  "changeling",
  "lifelink",
  "vigilance",
  "defender",
  "hexproof",
  "trample",
  "flying",
  "menace",
  "prowess",
  "haste",
  "reach",
  "flash",
  "ward",
] as const;

/**
 * The token search's words → GET /api/cards/search params over Magic's
 * searchFields: a P/T ("4/4"; a "*" side filters nothing, since "*" stores
 * as no number) → power and toughness; color words → colors including them
 * ("colorless" → exactly none); keywords → keywords (all of them); whatever
 * is left is the name. "Elemental 4/4 blue red" → name=elemental, power=4,
 * toughness=4, colors=including:UR.
 */
export function mtgTokenQuery(text: string): Record<string, string> {
  let rest = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const params: Record<string, string> = {};

  const pt = / (\*|\d{1,2}) ?\/ ?(\*|\d{1,2}) /.exec(rest);
  if (pt) {
    if (pt[1] !== "*") params.power = pt[1];
    if (pt[2] !== "*") params.toughness = pt[2];
    rest = rest.replace(pt[0], " ");
  }

  const keywords: string[] = [];
  for (const keyword of TOKEN_KEYWORDS) {
    const word = ` ${keyword} `;
    if (!rest.includes(word)) continue;
    keywords.push(keyword[0].toUpperCase() + keyword.slice(1));
    rest = rest.replace(word, " ");
  }
  if (keywords.length > 0) params.keywords = keywords.join(",");

  const words = rest.trim().split(" ").filter(Boolean);
  const letters = words.map((w) => COLOR_LETTER[w] ?? "").join("");
  const colorless = words.includes("colorless");
  if (letters) params.colors = `including:${letters}`;
  else if (colorless) params.colors = "exactly:";
  const colored = letters !== "" || colorless;
  const name = words
    .filter((w) => !(w in COLOR_LETTER) && w !== "colorless" && !(colored && w === "and"))
    .join(" ");
  if (name) params.name = name;
  return params;
}
