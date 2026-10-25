/**
 * A deck started from a precon (PRECON-OWNED): which precon its list came
 * from and whether the owner owns it. One pure, client-safe module for the
 * owner's wire shape, the answer's PATCH body and what a Yes counts as
 * owned; the query is precons.ts' (`loadDeckPrecon`), the price math
 * ownership.ts' (`deckOwnership`'s `ownedCopies`).
 *
 * - **The lineage** is `decks.precon_deck_id`, set once by the server: the
 *   create's `fromPrecon` slug (the precon draft's first save, whatever
 *   edit mints it) or a fork of a precon. A fork of a user's deck inherits
 *   nothing, and nothing changes it after.
 * - **The answer** is `decks.owns_precon`: true, false, or NULL (not asked
 *   yet). A setting like the goals: its own PATCH body `{ownsPrecon}`,
 *   which never moves updated_at and answers 400 on a deck without a
 *   lineage; a draft answered before it mints carries it in the create.
 * - **The owner's wire alone** carries either: GET /api/decks/[id]'s
 *   `deck.precon`, with the precon's slug and name, the answer and its
 *   cards (one row per identity, its copies over the counted zones). Every
 *   other wire (the share page, link previews, /mine, the create, the
 *   fork, the PATCH's answer) is deckMetaJson's, which never names them.
 * - **The copies** are what a Yes owns: per identity, whatever the zone,
 *   copies up to the precon's own quantity. So 14 Forests from a 12-Forest
 *   precon cost two Forests, the commander counts like any other card, and
 *   a card cut and added back is owned again (the box still holds it).
 */
import { z } from "zod";

import type { FormatDef } from "@/lib/games/types";

/** One identity of the precon's list: its copies over the format's counted zones. */
export interface PreconCard {
  cardId: string;
  qty: number;
}

/** The owner's wire (GET /api/decks/[id]'s `deck.precon`), and a draft's, from its seed. */
export interface DeckPrecon {
  /** precon_products.slug: what a draft's create sends as `fromPrecon`. */
  slug: string;
  /** The product's name. */
  name: string;
  /** The owner's answer; null = not asked yet. */
  owns: boolean | null;
  /** The precon's own list, one row per identity (`preconCards`). */
  cards: PreconCard[];
}

/** The PATCH body's `ownsPrecon` and the create's: true, false, or null (not asked yet). */
export const ownsPreconSchema = z.boolean().nullable();

/** The canonical PATCH body: the editor's baseline compares these as strings. */
export function ownsPreconPatchBody(owns: boolean | null): string {
  return JSON.stringify({ ownsPrecon: owns });
}

/**
 * The precon's list as the price math counts it: the entries in the
 * format's counted zones (the zones the deck size and every price sum
 * count), one row per identity with its copies summed, sorted by id so the
 * wire is stable.
 */
export function preconCards(
  rows: readonly { cardId: string; zone: string; qty: number }[],
  format: Pick<FormatDef, "zones">,
): PreconCard[] {
  const counted = new Set(format.zones.filter((z) => z.countsTowardSize).map((z) => z.id));
  const copies = new Map<string, number>();
  for (const r of rows) {
    if (!counted.has(r.zone) || r.qty <= 0) continue;
    copies.set(r.cardId, (copies.get(r.cardId) ?? 0) + r.qty);
  }
  return [...copies]
    .map(([cardId, qty]) => ({ cardId, qty }))
    .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
}

/** What a Yes owns: identity → the precon's copies. Null unless the owner said yes. */
export function ownedPreconCopies(
  precon: Pick<DeckPrecon, "owns" | "cards"> | null,
): ReadonlyMap<string, number> | null {
  if (precon?.owns !== true) return null;
  const copies = new Map<string, number>();
  for (const c of precon.cards) copies.set(c.cardId, (copies.get(c.cardId) ?? 0) + c.qty);
  return copies;
}

/**
 * The identity-level owned set the editor hands every price sheet (the Fit
 * sheet's `owned`, and any sheet that prices cards in or out the same way):
 * the collection's identities (null = no collection) and the owned
 * precon's. Null when nothing is owned, the sheets' "nothing is owned".
 * Exact for single copies, which is what those sheets swap; the copies a
 * list holds beyond the precon's are deckOwnership's to count.
 */
export function ownedForPricing(
  collection: ReadonlySet<string> | null,
  copies: ReadonlyMap<string, number> | null,
): ReadonlySet<string> | null {
  if (!copies) return collection;
  const owned = new Set(collection ?? []);
  for (const id of copies.keys()) owned.add(id);
  return owned;
}
