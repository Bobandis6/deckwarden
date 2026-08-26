/**
 * Pure glue for decklist import (P1.6): parsed lines + server resolutions →
 * review items → editor entries. Game-ignorant — zone knowledge comes off the
 * adapter's FormatDef, card flavor rides in CardWire. The component owns only
 * fetch + selection state; everything here is testable shaping.
 */
import type { CardWire, EditorEntry } from "@/lib/decks/editor-state";
import { MAX_QTY } from "@/lib/decks/editor-state";
import type { FormatDef } from "@/lib/games/types";

/** adapter.parseDecklist line (structural match with the contract's type). */
export interface ParsedLine {
  rawName: string;
  qty: number;
  zoneHint?: string;
  setHint?: string;
}

/** One name's resolution from POST /api/cards/resolve. */
export interface Resolution {
  input: string;
  match: CardWire | null;
  suggestions: CardWire[];
}

export interface ImportItem {
  line: ParsedLine;
  /** Mapped zone id; null = the line's section has no zone in this format. */
  zone: string | null;
  /** Resolved (or user-picked) card; null = needs review. */
  card: CardWire | null;
  suggestions: CardWire[];
}

/** The zone unhinted lines land in: first countable non-leader zone. */
export function defaultZoneId(format: FormatDef): string {
  const zone = format.zones.find((z) => z.countsTowardSize && !z.isLeaderZone);
  return (zone ?? format.zones[0]).id;
}

/**
 * Pair each parsed line with its resolution and map its zone hint. Hints that
 * name a real ZoneDef id map to it; no hint → the default zone; a hint the
 * format lacks (Commander has no sideboard) → zone null, and the line is
 * reported rather than silently dumped into the deck.
 */
export function buildImportItems(
  format: FormatDef,
  lines: readonly ParsedLine[],
  resolutions: readonly Resolution[],
): ImportItem[] {
  const zoneIds = new Set(format.zones.map((z) => z.id));
  const byInput = new Map(resolutions.map((r) => [r.input, r]));
  return lines.map((line) => {
    const resolution = byInput.get(line.rawName);
    return {
      line,
      zone: line.zoneHint
        ? zoneIds.has(line.zoneHint)
          ? line.zoneHint
          : null
        : defaultZoneId(format),
      card: resolution?.match ?? null,
      suggestions: resolution?.suggestions ?? [],
    };
  });
}

export interface ImportOutcome {
  entries: EditorEntry[];
  /** Cards referenced by the imported entries (for the editor's card map). */
  cards: CardWire[];
  warnings: string[];
  /** Lines that were dropped: unresolved names or zoneless sections. */
  skipped: ImportItem[];
}

/**
 * Apply reviewed items to the deck. mode "replace" starts from an empty list;
 * "add" folds into the existing entries. Duplicate (zone, card) pairs merge
 * quantities (capped at MAX_QTY, matching the PUT route's bound). Overflow in
 * a zone with a card-count maximum (the commander zone) spills into the
 * default zone with a warning — the PUT route would reject the list otherwise.
 */
export function applyImport(
  existing: readonly EditorEntry[],
  items: readonly ImportItem[],
  format: FormatDef,
  mode: "add" | "replace",
): ImportOutcome {
  const warnings: string[] = [];
  const skipped: ImportItem[] = [];
  const fallback = defaultZoneId(format);
  const zoneMax = new Map(format.zones.map((z) => [z.id, z.max]));
  const zoneLabel = new Map(format.zones.map((z) => [z.id, z.label]));

  const entries: EditorEntry[] = mode === "replace" ? [] : existing.map((e) => ({ ...e }));
  const zoneQty = new Map<string, number>();
  for (const e of entries) zoneQty.set(e.zone, (zoneQty.get(e.zone) ?? 0) + e.qty);

  const cards = new Map<string, CardWire>();
  const merge = (zone: string, card: CardWire, qty: number) => {
    cards.set(card.id, card);
    const entry = entries.find((e) => e.zone === zone && e.cardId === card.id);
    const added = entry ? Math.min(entry.qty + qty, MAX_QTY) - entry.qty : Math.min(qty, MAX_QTY);
    if (entry) entry.qty += added;
    else entries.push({ cardId: card.id, zone, qty: added, tags: [] });
    zoneQty.set(zone, (zoneQty.get(zone) ?? 0) + added);
  };

  for (const item of items) {
    if (!item.card || !item.zone) {
      skipped.push(item);
      continue;
    }
    const max = zoneMax.get(item.zone) ?? null;
    if (max !== null && (zoneQty.get(item.zone) ?? 0) + item.line.qty > max) {
      warnings.push(
        `${zoneLabel.get(item.zone) ?? item.zone} is full — moved ${item.card.name} to ${
          zoneLabel.get(fallback) ?? fallback
        }`,
      );
      merge(fallback, item.card, item.line.qty);
      continue;
    }
    merge(item.zone, item.card, item.line.qty);
  }

  for (const item of skipped) {
    warnings.push(
      item.card
        ? `No "${item.line.zoneHint}" zone in ${format.label} — skipped ${item.card.name}`
        : `Not found: "${item.line.rawName}" — skipped`,
    );
  }

  return { entries, cards: [...cards.values()], warnings, skipped };
}
