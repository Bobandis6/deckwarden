/**
 * MTGJSON deck file → precon deck mapping (W8a).
 *
 * Pure functions consumed by scripts/ingest/precons.ts (same division of
 * labor as scryfall-map.ts / spellbook-map.ts). Zod-parses ONLY the subset
 * the ingest reads — MTGJSON deck rows are full card objects, and pinning
 * fields we never touch would turn every upstream addition into a break.
 *
 * Live-file facts (verified 2026-09-20 against api/v5 deck files):
 *   - `commander[]` carries 1 entry, or 2 for partner-style products
 *     (TimeyWimey_WHO: Tenth Doctor + Rose Tyler). No >2 case exists today;
 *     extras beyond the zone max still map to main with a warning.
 *   - Multi-face cards are ONE row with the full "A // B" name and
 *     `side: "a"` (split/aftermath/adventure observed). Dedupe by oracle id
 *     stays as defense for any two-row DFC shape.
 *   - The SAME oracle id can span rows with DIFFERENT scryfallIds — real
 *     decks ship two printings of a basic (TimeyWimey: Plains #196 ×2 +
 *     #197 ×1). Those merge into one entry (qty summed, first printing
 *     kept) because deck_cards' PK is (deck, zone, card identity).
 *   - `planes[]`/`schemes[]`/`tokens[]`/`sideBoard[]` are extras outside
 *     the playable list (WHO decks ship planechase cards) — ignored with a
 *     warning so the ingest stats stay honest.
 */
import { z } from "zod";

import { maskToLetters } from "../colors";

// --- The slice of a deck file this job reads ---------------------------------

const rowSchema = z.object({
  name: z.string(),
  count: z.number().int().min(1),
  side: z.string().optional(),
  identifiers: z.object({
    scryfallId: z.string().optional(),
    scryfallOracleId: z.string().optional(),
  }),
});

const deckFileSchema = z.object({
  code: z.string(),
  name: z.string(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.string(),
  commander: z.array(rowSchema).default([]),
  mainBoard: z.array(rowSchema).default([]),
  sideBoard: z.array(z.unknown()).default([]),
  tokens: z.array(z.unknown()).default([]),
  planes: z.array(z.unknown()).default([]),
  schemes: z.array(z.unknown()).default([]),
});

export type MtgjsonDeckFile = z.input<typeof deckFileSchema>;

// --- Mapping ------------------------------------------------------------------

export interface PreconEntry {
  zone: "commander" | "main";
  /** Scryfall oracle id — resolves to card_identities.external_key. */
  oracleId: string;
  /** Scryfall card id — becomes printing_id only when that printing exists locally. */
  scryfallId: string | null;
  qty: number;
  /** Source row name, for skip logs and the generated description. */
  name: string;
}

export interface MappedPrecon {
  setCode: string;
  name: string;
  releaseDate: string;
  entries: PreconEntry[];
  warnings: string[];
}

export type PreconSkip = "parse" | "not_commander_deck" | "missing_oracle_id" | "no_commander";

export type PreconMapResult =
  { ok: true; precon: MappedPrecon } | { ok: false; skip: PreconSkip; detail?: string };

/** The exact DeckList/deck-file `type` this ingest keeps ("MTGO Commander Deck" is not it). */
export const COMMANDER_DECK_TYPE = "Commander Deck";

/**
 * Collector's Editions are the same product list in premium foiling —
 * skipped when the same set carries the regular sibling (all 16 do today).
 * The phrase can sit mid-name: "Limit Break Collector's Edition (FINAL
 * FANTASY VII)".
 */
export function isCollectorsEdition(name: string): boolean {
  return name.includes("Collector's Edition");
}

/** The sibling key a Collector's Edition falls back to: same set, name minus the CE phrase. */
export function collectorsEditionBaseName(name: string): string {
  return name.replace(/\s*Collector's Edition/, "");
}

interface MergedEntry {
  zone: "commander" | "main";
  oracleId: string;
  scryfallId: string | null;
  qty: number;
  name: string;
  seenPrintings: Set<string>;
  /** Count behind the kept printing — the choice must not depend on row order. */
  keptPrintingQty: number;
}

/** Merge a row into the per-zone map: same printing = a DFC-side duplicate (keep max), different printing = more copies (sum, higher-count printing represents the entry). */
function mergeRow(
  byOracle: Map<string, MergedEntry>,
  zone: "commander" | "main",
  row: z.output<typeof rowSchema>,
): void {
  const oracleId = row.identifiers.scryfallOracleId as string;
  const scryfallId = row.identifiers.scryfallId ?? null;
  const existing = byOracle.get(oracleId);
  if (!existing) {
    byOracle.set(oracleId, {
      zone,
      oracleId,
      scryfallId,
      qty: row.count,
      name: row.name,
      seenPrintings: new Set(scryfallId ? [scryfallId] : []),
      keptPrintingQty: row.count,
    });
    return;
  }
  if (scryfallId !== null && existing.seenPrintings.has(scryfallId)) {
    // The same physical printing again — a two-row DFC-side shape. One card.
    existing.qty = Math.max(existing.qty, row.count);
    return;
  }
  if (scryfallId !== null) existing.seenPrintings.add(scryfallId);
  existing.qty += row.count;
  const wins =
    row.count > existing.keptPrintingQty ||
    (row.count === existing.keptPrintingQty &&
      scryfallId !== null &&
      (existing.scryfallId === null || scryfallId < existing.scryfallId));
  if (wins) {
    existing.scryfallId = scryfallId;
    existing.keptPrintingQty = row.count;
  }
}

export function mapPrecon(raw: unknown): PreconMapResult {
  const parsed = deckFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, skip: "parse", detail: parsed.error.issues[0]?.message };
  }
  const file = parsed.data;
  if (file.type !== COMMANDER_DECK_TYPE) {
    return { ok: false, skip: "not_commander_deck", detail: file.type };
  }

  for (const row of [...file.commander, ...file.mainBoard]) {
    if (!row.identifiers.scryfallOracleId) {
      return { ok: false, skip: "missing_oracle_id", detail: row.name };
    }
  }

  const warnings: string[] = [];

  const commanderByOracle = new Map<string, MergedEntry>();
  for (const row of file.commander) mergeRow(commanderByOracle, "commander", row);

  const mainByOracle = new Map<string, MergedEntry>();
  // Commander zone max is 2 (formats.ts); overflow rides in the 99 instead of
  // being dropped — the product's card count must survive the mapping.
  const commanders = [...commanderByOracle.values()];
  for (const extra of commanders.slice(2)) {
    warnings.push(`commander overflow: "${extra.name}" moved to main (zone max 2)`);
  }
  for (const row of file.mainBoard) mergeRow(mainByOracle, "main", row);
  for (const extra of commanders.slice(2)) {
    const existing = mainByOracle.get(extra.oracleId);
    if (existing) existing.qty += extra.qty;
    else mainByOracle.set(extra.oracleId, { ...extra, zone: "main" });
  }

  if (commanderByOracle.size === 0) return { ok: false, skip: "no_commander" };

  for (const [label, arr] of [
    ["sideBoard", file.sideBoard],
    ["tokens", file.tokens],
    ["planes", file.planes],
    ["schemes", file.schemes],
  ] as const) {
    if (arr.length > 0) warnings.push(`${label}: ${arr.length} row(s) ignored`);
  }

  const entries: PreconEntry[] = [...commanders.slice(0, 2), ...mainByOracle.values()].map((e) => ({
    zone: e.zone,
    oracleId: e.oracleId,
    scryfallId: e.scryfallId,
    qty: e.qty,
    name: e.name,
  }));

  return {
    ok: true,
    precon: {
      setCode: file.code,
      name: file.name,
      releaseDate: file.releaseDate,
      entries,
      warnings,
    },
  };
}

// --- Slug / public id ----------------------------------------------------------

/**
 * public_id = 'p_' + slug must fit route-helpers' /^[a-z0-9_]{4,32}$/, so the
 * slug budget is 30. Set code is always the suffix — anthologies reprint deck
 * names verbatim (CMA "Evasive Maneuvers" vs C13's). Parentheticals are
 * franchise decoration ("Counter Blitz (FINAL FANTASY X)") and dropped before
 * slugifying; the base is truncated when a name still overflows.
 */
export function preconSlug(name: string, setCode: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const set = clean(setCode);
  let base = clean(name.replace(/\s*\([^)]*\)/g, ""));
  const budget = 30 - set.length - 1;
  if (base.length > budget) base = base.slice(0, budget).replace(/_+$/, "");
  return `${base}_${set}`;
}

// --- Change detection -----------------------------------------------------------

/**
 * The canonical string source_hash is computed over. Deliberately NOT the raw
 * file: MTGJSON stamps meta.date into every build, so raw-byte hashes never
 * match twice. Entries are sorted for row-order independence.
 */
export function preconHashPayload(precon: MappedPrecon): string {
  const entries = [...precon.entries]
    .sort((a, b) =>
      a.zone === b.zone ? a.oracleId.localeCompare(b.oracleId) : a.zone.localeCompare(b.zone),
    )
    .map((e) => [e.zone, e.oracleId, e.scryfallId ?? "", e.qty] as const);
  return JSON.stringify({
    setCode: precon.setCode,
    name: precon.name,
    releaseDate: precon.releaseDate,
    entries,
  });
}

// --- Generated description -------------------------------------------------------

const COLOR_NAME: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

/** "White-Blue", "Five-color", "Colorless" — from the deck ci mask (C bit ignored). */
export function colorPhrase(ciMask: number): string {
  const letters = maskToLetters(ciMask).filter((c) => c !== "C");
  if (letters.length === 0) return "Colorless";
  if (letters.length === 5) return "Five-color";
  return letters.map((c) => COLOR_NAME[c]).join("-");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The factual blurb stored on decks.description (feeds og:description +
 * JSON-LD like every deck). Colors, commander(s), source set, release, card
 * count — never WotC marketing copy.
 */
export function preconDescription(input: {
  ciMask: number;
  commanderNames: string[];
  setName: string;
  setCode: string;
  releaseDate: string;
  cardCount: number;
}): string {
  const [y, m] = input.releaseDate.split("-").map(Number);
  const released = m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : String(y);
  const led = input.commanderNames.join(" and ");
  return (
    `${colorPhrase(input.ciMask)} Commander precon led by ${led}. ` +
    `Official ${input.setName} (${input.setCode}) product list, released ${released}. ` +
    `${input.cardCount} cards.`
  );
}
