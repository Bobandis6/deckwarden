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
  /**
   * The leader-zone routing came from the adapter's positional guess
   * (P2.8b), not from the paste's own text: the review step discloses it,
   * and in "add" mode it yields to a deck whose leader zone is occupied.
   */
  guessed?: true;
}

/** The zone unhinted lines land in: first countable non-leader zone. */
export function defaultZoneId(format: FormatDef): string {
  const zone = format.zones.find((z) => z.countsTowardSize && !z.isLeaderZone);
  return (zone ?? format.zones[0]).id;
}

/**
 * Pair each parsed line with its resolution and map its zone hint. Hints that
 * name a real ZoneDef id map to it; no hint → the adapter's card-based
 * routing (P4.6 — OP leader-category cards can only be leaders) or the
 * default zone; a hint the format lacks (Commander has no sideboard) → zone
 * null, and the line is reported rather than silently dumped into the deck.
 * When NO line hints the leader zone, the adapter's positional shape guess
 * (P2.8b — Moxfield's unmarked first-line commander) may reroute resolved
 * lines there, flagged `guessed`; any explicit leader hint disables it.
 */
export function buildImportItems(
  format: FormatDef,
  lines: readonly ParsedLine[],
  resolutions: readonly Resolution[],
  zoneFor?: (card: CardWire) => string | null,
  leaderGuess?: (lines: readonly ParsedLine[], cards: readonly (CardWire | null)[]) => number[],
): ImportItem[] {
  const zoneIds = new Set(format.zones.map((z) => z.id));
  const byInput = new Map(resolutions.map((r) => [r.input, r]));
  const items: ImportItem[] = lines.map((line) => {
    const resolution = byInput.get(line.rawName);
    const card = resolution?.match ?? null;
    const routed = card && !line.zoneHint ? (zoneFor?.(card) ?? null) : null;
    return {
      line,
      zone: line.zoneHint
        ? zoneIds.has(line.zoneHint)
          ? line.zoneHint
          : null
        : routed && zoneIds.has(routed)
          ? routed
          : defaultZoneId(format),
      card,
      suggestions: resolution?.suggestions ?? [],
    };
  });
  const leaderZone = format.zones.find((z) => z.isLeaderZone);
  if (leaderGuess && leaderZone && !lines.some((l) => l.zoneHint === leaderZone.id)) {
    for (const index of leaderGuess(
      lines,
      items.map((i) => i.card),
    )) {
      const item = items[index];
      if (item?.card) {
        item.zone = leaderZone.id;
        item.guessed = true;
      }
    }
  }
  return items;
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
 * default zone with a warning, grouped per zone when several lines spill
 * (P2.8b) — the PUT route would reject the list otherwise.
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

  // Pre-import occupants per zone: a guessed leader yields to the DECK's own
  // choice, never to a line merged earlier in this same import (a guessed
  // partner pair into an empty deck must land whole).
  const heldBefore = new Map<string, Set<string>>();
  if (mode === "add")
    for (const e of existing) {
      const held = heldBefore.get(e.zone) ?? new Set<string>();
      held.add(e.cardId);
      heldBefore.set(e.zone, held);
    }

  // Spilled names per over-full zone, grouped so 78 moved lines read as ONE
  // warning, not a wall (P2.8b); a single move keeps the exact old wording.
  const spills = new Map<string, string[]>();

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
    // A guessed leader in "add" mode yields to the deck's own choice
    // (P2.8b): the same card already leading = the idempotent silent skip;
    // a different occupant sends the line to the default zone with no
    // warning — the guess was a reading of the paste, not an instruction.
    if (item.guessed && mode === "add") {
      const held = heldBefore.get(item.zone);
      if (held?.has(item.card.id)) continue;
      if (held && held.size > 0) {
        merge(fallback, item.card, item.line.qty);
        continue;
      }
    }
    const max = zoneMax.get(item.zone) ?? null;
    if (max !== null && (zoneQty.get(item.zone) ?? 0) + item.line.qty > max) {
      // Idempotent re-import (P4.6): the exact card already filling a capped
      // zone is the same line landing twice — a latched hub leader plus a
      // pasted Limitless export both name the leader. Skip it silently.
      const already = entries.some(
        (e) => e.zone === item.zone && e.cardId === item.card!.id && e.qty >= item.line.qty,
      );
      if (already) continue;
      if (fallback === item.zone) {
        // No different zone to spill into — add anyway and say so honestly;
        // validation renders the over-size verdict with reasons.
        warnings.push(
          `${zoneLabel.get(item.zone) ?? item.zone} is full — ${item.card.name} puts it over`,
        );
        merge(item.zone, item.card, item.line.qty);
        continue;
      }
      const moved = spills.get(item.zone) ?? [];
      moved.push(item.card.name);
      spills.set(item.zone, moved);
      merge(fallback, item.card, item.line.qty);
      continue;
    }
    merge(item.zone, item.card, item.line.qty);
  }

  for (const [zone, moved] of spills) {
    const from = zoneLabel.get(zone) ?? zone;
    const to = zoneLabel.get(fallback) ?? fallback;
    warnings.push(
      moved.length === 1
        ? `${from} is full — moved ${moved[0]} to ${to}`
        : `${from} is full — moved ${moved.length} cards to ${to} (${moved
            .slice(0, 3)
            .join(", ")}${moved.length > 3 ? ", …" : ""})`,
    );
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
