/**
 * Pure editor-state operations for the deck editor (P1.2).
 *
 * The client's in-memory list is authoritative: these functions produce the
 * next list for every edit, the component autosaves the result, and the server
 * (PUT /api/decks/[id]/cards) re-checks the same structural rules. Everything
 * is game-ignorant: zone knowledge comes off the adapter's FormatDef, card
 * flavor lives in CardData. Full rules validation (singleton, color identity,
 * bans) is the adapter's `validate` and lands in P1.4 — here only the
 * structure the server would reject is enforced (known zones, zone maximums).
 */
import type { CardData, FormatDef } from "@/lib/games/types";

/** Wire shape both /api/cards/search and GET /api/decks/[id] return per card:
 *  full CardData (incl. legality exceptions, P1.4) plus the display image URL.
 *  Search results only carry real legality when the query included `format`. */
export type CardWire = Omit<CardData, "legality"> & {
  image: string | null;
  legality?: CardData["legality"];
};

/** What the editor holds per card — CardWire hydrated to a full CardData so
 *  adapter display/validate/analyze calls need no further shaping. */
export type EditorCard = CardData & { image: string | null };

export function toEditorCard(wire: CardWire): EditorCard {
  return { ...wire, legality: wire.legality ?? [] };
}

export interface EditorEntry {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId?: string;
}

/** Matches the PUT route's zod bound. */
export const MAX_QTY = 99;

/**
 * The `4 Sol Ring` quantity-prefix syntax (build plan §7): a 1–2 digit count,
 * optional "x", then the search query. Anything else is a plain query at qty 1
 * — 3+ digit prefixes stay literal so names like "1996 World Champion" search.
 */
export function parseQuickAdd(input: string): { qty: number; query: string } {
  const m = /^\s*(\d{1,2})\s*[xX]?\s+(.*\S)[\s]*$/.exec(input);
  if (m) return { qty: Math.min(Math.max(Number(m[1]), 1), MAX_QTY), query: m[2] };
  return { qty: 1, query: input.trim() };
}

/** Total quantity in one zone. */
export function zoneQty(entries: readonly EditorEntry[], zoneId: string): number {
  return entries.reduce((sum, e) => (e.zone === zoneId ? sum + e.qty : sum), 0);
}

/** Deck size = total across countsTowardSize zones (Commander: 100 incl. commander). */
export function deckSizeCount(entries: readonly EditorEntry[], format: FormatDef): number {
  const counted = new Set(format.zones.filter((z) => z.countsTowardSize).map((z) => z.id));
  return entries.reduce((sum, e) => (counted.has(e.zone) ? sum + e.qty : sum), 0);
}

export type EditResult = { entries: EditorEntry[]; error?: string };

/**
 * Add `qty` copies to a zone; an existing (zone, card) entry increments
 * instead of duplicating (the PUT route rejects duplicate keys). Zone
 * card-count maximums are enforced here so the commander zone can't
 * overfill client-side and bounce on save.
 */
export function addCard(
  entries: readonly EditorEntry[],
  format: FormatDef,
  zoneId: string,
  cardId: string,
  qty: number,
): EditResult {
  const zone = format.zones.find((z) => z.id === zoneId);
  if (!zone) return { entries: [...entries], error: `Unknown zone "${zoneId}"` };

  const add = Math.min(Math.max(qty, 1), MAX_QTY);
  if (zone.max !== null && zoneQty(entries, zoneId) + add > zone.max) {
    return {
      entries: [...entries],
      error: `${zone.label} is full (max ${zone.max} card${zone.max === 1 ? "" : "s"})`,
    };
  }

  const existing = entries.find((e) => e.zone === zoneId && e.cardId === cardId);
  if (existing) {
    return {
      entries: entries.map((e) =>
        e === existing ? { ...e, qty: Math.min(e.qty + add, MAX_QTY) } : e,
      ),
    };
  }
  return { entries: [...entries, { cardId, zone: zoneId, qty: add, tags: [] }] };
}

export function removeCard(
  entries: readonly EditorEntry[],
  zoneId: string,
  cardId: string,
): EditorEntry[] {
  return entries.filter((e) => !(e.zone === zoneId && e.cardId === cardId));
}

/** Set an entry's quantity; 0 or less removes it. Zone maximums re-checked on increase. */
export function setQty(
  entries: readonly EditorEntry[],
  format: FormatDef,
  zoneId: string,
  cardId: string,
  qty: number,
): EditResult {
  const entry = entries.find((e) => e.zone === zoneId && e.cardId === cardId);
  if (!entry) return { entries: [...entries] };
  if (qty <= 0) return { entries: removeCard(entries, zoneId, cardId) };

  const next = Math.min(qty, MAX_QTY);
  const zone = format.zones.find((z) => z.id === zoneId);
  if (zone && zone.max !== null && zoneQty(entries, zoneId) - entry.qty + next > zone.max) {
    return {
      entries: [...entries],
      error: `${zone.label} is full (max ${zone.max} card${zone.max === 1 ? "" : "s"})`,
    };
  }
  return { entries: entries.map((e) => (e === entry ? { ...e, qty: next } : e)) };
}

/** The PUT /api/decks/[id]/cards body ({ cards: [...] } around this). */
export function toSavePayload(
  entries: readonly EditorEntry[],
): { cardId: string; zone: string; qty: number; tags: string[]; printingId?: string }[] {
  return entries.map((e) => ({
    cardId: e.cardId,
    zone: e.zone,
    qty: e.qty,
    tags: e.tags,
    ...(e.printingId ? { printingId: e.printingId } : {}),
  }));
}
