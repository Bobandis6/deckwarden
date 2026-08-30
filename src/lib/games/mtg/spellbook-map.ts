/**
 * Commander Spellbook variant → combo-row mapping (P2.5).
 *
 * Pure functions consumed by scripts/ingest/spellbook.ts (same division of
 * labor as scryfall-map.ts). A Spellbook *variant* is one concrete card set
 * that combos; its id is stable for that card set (card ids + template ids
 * joined with '-'), which is why combo_pieces never need diffing — a changed
 * card set is a different variant.
 *
 * Kept: status OK (the site's verified tier), Commander-legal, every card
 * piece resolvable to a card_identities row by Scryfall oracle_id, and
 * popularity ≥ 1 or NULL — measured 2026-08-30, variants in ZERO EDHREC
 * decks were 45k of 109k rows (+38MB with pieces/indexes) that no
 * popularity-ordered shelf can ever surface; NULL is kept because brand-new
 * (spoiler) combos plausibly enter unsynced. M3's Combo Radar owns the
 * revisit (LATER.md): lifting the floor is this constant + one re-ingest.
 * Template requirements ("Permanent Castable for {C}") are kept BY NAME in
 * combos.templates — the most popular combos in the dataset use them, and a
 * card page that silently omitted those would be dishonest — but they are
 * not pieces: piece_count counts cards only.
 */
import { colorsToMask } from "./scryfall-map";

// --- The slice of a bulk-export variant this job reads ------------------------

export interface SpellbookVariant {
  id: string;
  status: string;
  identity?: string;
  popularity?: number | null;
  legalities?: Record<string, boolean>;
  uses?: Array<{ card?: { oracleId?: string; name?: string }; quantity?: number }>;
  requires?: Array<{ template?: { name?: string }; quantity?: number }>;
  produces?: Array<{ feature?: { name?: string; status?: string }; quantity?: number }>;
}

// --- Mapping -------------------------------------------------------------------

export interface ComboRow {
  external_key: string;
  piece_count: number;
  ci_mask: number;
  results: string[];
  templates: string[];
  popularity: number | null;
}

export type VariantSkip =
  "status" | "not_commander_legal" | "never_played" | "no_cards" | "unknown_card";

export type VariantMapResult =
  { ok: true; combo: ComboRow; pieceIds: string[] } | { ok: false; skip: VariantSkip };

/**
 * Feature tiers worth showing as a combo's results. Spellbook's model
 * (spellbook/models/feature.py): HU/PU are "utility for variant generation"
 * bookkeeping; S(tandalone)/H(elper)/C(ontextual) are real produced effects.
 */
const RESULT_FEATURE_STATUSES = new Set(["S", "H", "C"]);

/** Spellbook identity string ("WUB", "C" for colorless) → house mask; colorless = 0. */
export function identityToMask(identity: string | undefined): number {
  const COLORLESS_BIT = 32; // house C bit — never stored on MTG identities
  return colorsToMask([...(identity ?? "").toUpperCase()]) & ~COLORLESS_BIT;
}

const INT4_MAX = 2147483647;

export function mapVariant(
  v: SpellbookVariant,
  resolveOracle: (oracleId: string) => string | undefined,
): VariantMapResult {
  if (v.status !== "OK") return { ok: false, skip: "status" };
  if (v.legalities?.commander !== true) return { ok: false, skip: "not_commander_legal" };
  if (v.popularity === 0) return { ok: false, skip: "never_played" };

  const pieceIds: string[] = [];
  for (const use of v.uses ?? []) {
    const oid = use.card?.oracleId;
    const identityId = oid ? resolveOracle(oid) : undefined;
    if (!identityId) return { ok: false, skip: "unknown_card" };
    if (!pieceIds.includes(identityId)) pieceIds.push(identityId);
  }
  if (pieceIds.length === 0) return { ok: false, skip: "no_cards" };

  const results: string[] = [];
  for (const p of v.produces ?? []) {
    const name = p.feature?.name;
    if (!name || !RESULT_FEATURE_STATUSES.has(p.feature?.status ?? "")) continue;
    if (!results.includes(name)) results.push(name);
  }

  const templates: string[] = [];
  for (const r of v.requires ?? []) {
    const name = r.template?.name;
    if (name && !templates.includes(name)) templates.push(name);
  }

  const popularity =
    typeof v.popularity === "number" && Number.isFinite(v.popularity)
      ? Math.max(0, Math.min(INT4_MAX, Math.round(v.popularity)))
      : null;

  return {
    ok: true,
    combo: {
      external_key: v.id,
      piece_count: pieceIds.length,
      ci_mask: identityToMask(v.identity),
      results,
      templates,
      popularity,
    },
    pieceIds,
  };
}
