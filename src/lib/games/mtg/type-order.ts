/**
 * Magic's card-type display order (DECK-TOKENS, the owner's order of
 * 2026-10-24): Creatures, Sorceries, Instants, Artifacts, Enchantments, then
 * the two types the ask left out — Planeswalkers and Battles — ahead of
 * Lands, which stay last. The commander leads from its own zone above the
 * list, so it is not a type here. Rarer types (Conspiracy, Dungeon, …) follow
 * Lands by name, and cards with no type close the list (../type-order.ts).
 *
 * Display only. Which group a card is in is `primary_type`'s precedence,
 * fixed at ingest (scryfall-map.ts `primaryType`): an artifact land is an
 * Artifact here exactly as it is in the Lands stat (analyze.ts `isLand`).
 */
export const MTG_TYPE_ORDER = [
  "Creature",
  "Sorcery",
  "Instant",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Battle",
  "Land",
] as const;
