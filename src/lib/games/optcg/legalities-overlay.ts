/**
 * The data/optcg/legalities.json overlay (P4.2) — pure parse + diff, no IO.
 * The overlay file is THE authority for OP banlist rows (hand-maintained
 * against Bandai's official page because community scrapers lag); the applier
 * script (scripts/ingest/optcg-legalities.ts) wraps this with DB IO, the
 * scryfall.ts legality-differ pattern: close rows the overlay no longer
 * claims, open rows it newly claims, and never touch matching ones — so
 * effective_from/effective_to become honest ban history.
 */
import { LEGALITY_STATUSES, type LegalityStatus } from "@/db/schema";

export interface OverlayCondition {
  type: string;
  [k: string]: unknown;
}

export interface OverlayEntry {
  /** Card number, i.e. card_identities.external_key for game_id 2 ("OP01-025"). */
  cardId: string;
  status: LegalityStatus;
  /** ISO date the restriction took effect (Bandai's list revision date). */
  effectiveFrom: string;
  condition?: OverlayCondition;
  note?: string;
}

export interface Overlay {
  game: string;
  format: string;
  sourceUrl: string;
  retrieved: string;
  entries: OverlayEntry[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_ID = /^[A-Z]+\d*-\d+$/;

/** Parse + validate the overlay JSON. Throws with a pointed message — the file is hand-edited. */
export function parseOverlay(json: unknown): Overlay {
  if (typeof json !== "object" || json === null) throw new Error("overlay: not a JSON object");
  const o = json as Record<string, unknown>;
  if (o.game !== "optcg")
    throw new Error(`overlay: game must be "optcg", got ${JSON.stringify(o.game)}`);
  if (typeof o.format !== "string" || !o.format) throw new Error("overlay: missing format");
  if (typeof o.source_url !== "string" || !o.source_url.startsWith("https://"))
    throw new Error("overlay: source_url must be an https URL");
  if (typeof o.retrieved !== "string" || !ISO_DATE.test(o.retrieved))
    throw new Error("overlay: retrieved must be YYYY-MM-DD");
  if (!Array.isArray(o.entries)) throw new Error("overlay: entries must be an array");

  const entries = o.entries.map((raw, i) => {
    const at = `overlay entries[${i}]`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${at}: not an object`);
    const e = raw as Record<string, unknown>;
    if (typeof e.cardId !== "string" || !CARD_ID.test(e.cardId))
      throw new Error(`${at}: cardId ${JSON.stringify(e.cardId)} is not a card number`);
    if (!LEGALITY_STATUSES.includes(e.status as LegalityStatus))
      throw new Error(
        `${at}: status ${JSON.stringify(e.status)} not in ${LEGALITY_STATUSES.join("/")}`,
      );
    if (typeof e.effectiveFrom !== "string" || !ISO_DATE.test(e.effectiveFrom))
      throw new Error(`${at}: effectiveFrom must be YYYY-MM-DD`);
    let condition: OverlayCondition | undefined;
    if (e.condition !== undefined) {
      if (typeof e.condition !== "object" || e.condition === null)
        throw new Error(`${at}: condition must be an object`);
      const c = e.condition as Record<string, unknown>;
      if (typeof c.type !== "string" || !c.type) throw new Error(`${at}: condition.type missing`);
      if (c.type === "banned_with") {
        if (
          !Array.isArray(c.cardIds) ||
          c.cardIds.length === 0 ||
          !c.cardIds.every((k) => typeof k === "string" && CARD_ID.test(k))
        )
          throw new Error(`${at}: banned_with condition needs cardIds of card numbers`);
      }
      condition = c as OverlayCondition;
    }
    return {
      cardId: e.cardId,
      status: e.status as LegalityStatus,
      effectiveFrom: e.effectiveFrom,
      ...(condition ? { condition } : {}),
      ...(typeof e.note === "string" ? { note: e.note } : {}),
    };
  });

  // Mirrored-pair sanity: a banned_with partner must itself appear with the
  // reverse condition — half-edited overlays fail loudly, not silently.
  const byCard = new Map(entries.map((e) => [e.cardId, e] as const));
  for (const e of entries) {
    if (e.condition?.type !== "banned_with") continue;
    for (const partner of e.condition.cardIds as string[]) {
      const p = byCard.get(partner);
      const reverse =
        p?.condition?.type === "banned_with" &&
        (p.condition.cardIds as string[]).includes(e.cardId);
      if (!reverse)
        throw new Error(
          `overlay: pair ${e.cardId}+${partner} is one-sided — add the mirrored entry on ${partner}`,
        );
    }
  }

  return {
    game: o.game,
    format: o.format,
    sourceUrl: o.source_url,
    retrieved: o.retrieved,
    entries,
  };
}

/** Canonical text form of a condition (sorted keys, sorted cardIds) for row matching. */
export function normalizeCondition(condition: OverlayCondition | null | undefined): string {
  if (condition == null) return "";
  const entries = Object.entries(condition)
    .map(([k, v]): [string, unknown] =>
      k === "cardIds" && Array.isArray(v) ? [k, [...(v as string[])].sort()] : [k, v],
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(Object.fromEntries(entries));
}

export interface CurrentRow {
  rowId: number;
  cardId: string; // external_key
  status: string;
  condition: unknown;
}

/**
 * Diff the overlay against the current in-force rows: rows to close (gone or
 * changed), entries to open (new or changed). Matching rows are untouched so
 * their effective_from stays historical.
 */
export function diffOverlay(
  entries: readonly OverlayEntry[],
  current: readonly CurrentRow[],
): { closeRowIds: number[]; openEntries: OverlayEntry[] } {
  const keyOf = (cardId: string, status: string, condition: unknown) =>
    `${cardId.toUpperCase()}|${status}|${normalizeCondition(condition as OverlayCondition | null)}`;

  const desiredKeys = new Set(entries.map((e) => keyOf(e.cardId, e.status, e.condition)));
  const currentKeys = new Set(current.map((r) => keyOf(r.cardId, r.status, r.condition)));

  return {
    closeRowIds: current
      .filter((r) => !desiredKeys.has(keyOf(r.cardId, r.status, r.condition)))
      .map((r) => r.rowId),
    openEntries: entries.filter((e) => !currentKeys.has(keyOf(e.cardId, e.status, e.condition))),
  };
}
