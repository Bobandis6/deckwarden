/**
 * Recommendation data access (P3.1) — the engine's ONE batched IO layer
 * (hub/queries.ts style): a handful of set-based queries, no N+1, reading
 * only existing tables (card_identities popularity/prices, legalities,
 * combos) — no migration. Game specifics arrive as parameters (numeric
 * game/format ids off the deck row, the adapter's declarative exclude
 * rules); nothing here imports a game module.
 *
 * The deterministic candidate filter lives here as ONE condition builder
 * shared by both entry points (popularity pool + combo-candidate recheck),
 * so "legal / color-fit / budget / not-in-deck" cannot drift apart.
 */
import { and, asc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { RecommendMeta } from "@/lib/games/types";
import type { CandidateCard, CandidateCombo } from "./types";

const { cardIdentities, combos, comboPieces, deckCards, legalities } = schema;

export interface CandidateFilter {
  gameId: number;
  formatId: number;
  /** Deck color identity; candidates must satisfy (ci & ~deckCi) = 0. */
  deckCiMask: number;
  /** Cards already in the deck (leaders included) — never recommended. */
  excludeCardIds: readonly string[];
  /** Budget: only cards with a KNOWN price at or under this (USD). */
  maxPriceUsd?: number;
  /**
   * Collections hook (P3.7) — INERT today: nothing populates it. When set,
   * the pool is restricted to owned cards (an empty set = empty pool, not
   * "hook off"); undefined = hook off. Wired now so the filter signature is
   * stable when collection import lands.
   */
  ownedCardIds?: ReadonlySet<string>;
  /** Adapter's never-advise rules (MTG: basic lands). */
  exclude?: RecommendMeta["exclude"];
}

const JSONB_KEY_RE = /^[a-z0-9_]+$/;

/** Exported for tests: the deterministic filter, one condition list. */
export function candidateConditions(f: CandidateFilter): SQL[] {
  const conditions: SQL[] = [
    sql`${cardIdentities.gameId} = ${f.gameId}`,
    sql`${cardIdentities.isRemoved} = false`,
    sql`${cardIdentities.isPreview} = false`,
    // ::int disambiguates ~ (bitwise NOT) from ~ (regex) on the untyped param.
    sql`(${cardIdentities.ciMask} & ~${f.deckCiMask}::int) = 0`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${legalities} l
      WHERE l.card_identity_id = ${cardIdentities.id}
        AND l.format_id = ${f.formatId}
        AND l.effective_to IS NULL AND l.condition IS NULL
        AND l.status IN ('banned', 'not_legal'))`,
  ];
  if (f.excludeCardIds.length > 0) {
    conditions.push(notInArray(cardIdentities.id, [...f.excludeCardIds]));
  }
  for (const rule of f.exclude ?? []) {
    const key = rule.jsonbPath[0];
    if (!JSONB_KEY_RE.test(key)) throw new Error(`Invalid exclude path: ${key}`);
    conditions.push(
      sql`coalesce(${cardIdentities.attrs}->>${sql.raw(`'${key}'`)}, '') NOT LIKE ${rule.likePattern}`,
    );
  }
  if (f.maxPriceUsd !== undefined) {
    conditions.push(sql`${cardIdentities.cheapestUsd} IS NOT NULL`);
    conditions.push(sql`${cardIdentities.cheapestUsd} <= ${f.maxPriceUsd}`);
  }
  if (f.ownedCardIds !== undefined) {
    conditions.push(
      f.ownedCardIds.size === 0 ? sql`false` : inArray(cardIdentities.id, [...f.ownedCardIds]),
    );
  }
  return conditions;
}

const CANDIDATE_PROJECTION = {
  id: cardIdentities.id,
  name: cardIdentities.name,
  primaryType: cardIdentities.primaryType,
  costValue: cardIdentities.costValue,
  ciMask: cardIdentities.ciMask,
  cheapestUsd: cardIdentities.cheapestUsd,
  popularity: cardIdentities.popularity,
};

/**
 * The popularity-ranked candidate pool (the staples query, parameterized).
 * Requires a popularity value — this pool IS the popularity signal; cards
 * without one can still enter through combo participation.
 */
export async function loadCandidatePool(
  filter: CandidateFilter,
  limit: number,
): Promise<CandidateCard[]> {
  return getDb()
    .select(CANDIDATE_PROJECTION)
    .from(cardIdentities)
    .where(and(...candidateConditions(filter), sql`${cardIdentities.popularity} IS NOT NULL`))
    .orderBy(asc(cardIdentities.popularity), asc(cardIdentities.id))
    .limit(limit);
}

/** Combo-sourced candidates re-checked through the SAME deterministic filter. */
export async function loadCandidateRows(
  filter: CandidateFilter,
  ids: readonly string[],
): Promise<CandidateCard[]> {
  if (ids.length === 0) return [];
  return getDb()
    .select(CANDIDATE_PROJECTION)
    .from(cardIdentities)
    .where(and(...candidateConditions(filter), inArray(cardIdentities.id, [...ids])));
}

/**
 * Most combos considered per request. Popularity-ordered, so what a cap ever
 * drops is the unranked/least-played tail — combo-dense decks lose the least
 * meaningful lines first, never silently the best ones.
 */
export const COMBO_SCAN_LIMIT = 200;

/**
 * Cards that would complete the CARD requirements of a combo with the deck:
 * combos color-fit to the deck where exactly one card piece is missing (the
 * candidate). Template requirements are disclosed in evidence, not resolved
 * — findForDeck template semantics stay with P3.3 (LATER.md).
 *
 * Entry is through combo_pieces_by_card on the deck's cards (the P2.5 index
 * contract) — never a full combos scan.
 */
export async function loadComboSignals(
  deckCardIds: readonly string[],
  deckCiMask: number,
): Promise<Map<string, CandidateCombo[]>> {
  const byCandidate = new Map<string, CandidateCombo[]>();
  if (deckCardIds.length === 0) return byCandidate;
  const db = getDb();
  const deckIds = [...deckCardIds];

  const oneAway = db
    .select({ comboId: comboPieces.comboId })
    .from(comboPieces)
    .innerJoin(combos, eq(combos.id, comboPieces.comboId))
    .where(inArray(comboPieces.cardIdentityId, deckIds))
    .groupBy(comboPieces.comboId, combos.pieceCount)
    .having(sql`count(*) = ${combos.pieceCount} - 1`);

  const comboRows = await db
    .select({
      id: combos.id,
      results: combos.results,
      templates: combos.templates,
      popularity: combos.popularity,
    })
    .from(combos)
    .where(and(inArray(combos.id, oneAway), sql`(${combos.ciMask} & ~${deckCiMask}::int) = 0`))
    .orderBy(sql`${combos.popularity} DESC NULLS LAST`, asc(combos.id))
    .limit(COMBO_SCAN_LIMIT);
  if (comboRows.length === 0) return byCandidate;

  const pieceRows = await db
    .select({
      comboId: comboPieces.comboId,
      cardId: cardIdentities.id,
      name: cardIdentities.name,
    })
    .from(comboPieces)
    .innerJoin(cardIdentities, eq(cardIdentities.id, comboPieces.cardIdentityId))
    .where(
      inArray(
        comboPieces.comboId,
        comboRows.map((c) => c.id),
      ),
    )
    .orderBy(asc(cardIdentities.name));

  const piecesByCombo = new Map<number, { cardId: string; name: string }[]>();
  for (const row of pieceRows) {
    const list = piecesByCombo.get(row.comboId) ?? [];
    list.push({ cardId: row.cardId, name: row.name });
    piecesByCombo.set(row.comboId, list);
  }

  const inDeck = new Set(deckIds);
  for (const combo of comboRows) {
    const pieces = piecesByCombo.get(combo.id) ?? [];
    const missing = pieces.filter((p) => !inDeck.has(p.cardId));
    if (missing.length !== 1) continue; // defensive: the SQL already guarantees this
    const candidateId = missing[0].cardId;
    const list = byCandidate.get(candidateId) ?? [];
    list.push({
      withPieces: pieces.filter((p) => inDeck.has(p.cardId)),
      results: combo.results,
      templates: combo.templates,
      popularity: combo.popularity,
    });
    byCandidate.set(candidateId, list);
  }
  return byCandidate;
}

/** The deck's cards with the fields curve bucketing reads (all zones). */
export async function loadDeckEntries(
  deckId: string,
): Promise<
  { cardId: string; qty: number; primaryType: string | null; costValue: number | null }[]
> {
  return getDb()
    .select({
      cardId: deckCards.cardIdentityId,
      qty: deckCards.quantity,
      primaryType: cardIdentities.primaryType,
      costValue: cardIdentities.costValue,
    })
    .from(deckCards)
    .innerJoin(cardIdentities, eq(cardIdentities.id, deckCards.cardIdentityId))
    .where(eq(deckCards.deckId, deckId));
}
