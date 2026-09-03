/**
 * Recommendation data access (P3.1) — the engine's ONE batched IO layer
 * (hub/queries.ts style): a handful of set-based queries, no N+1, reading
 * only existing tables (card_identities popularity/prices, legalities, and
 * combos via the shared detection layer in combos/queries.ts) — no
 * migration. Game specifics arrive as parameters (numeric
 * game/format ids off the deck row, the adapter's declarative exclude
 * rules); nothing here imports a game module.
 *
 * The deterministic candidate filter lives here as ONE condition builder
 * shared by both entry points (popularity pool + combo-candidate recheck),
 * so "legal / color-fit / budget / not-in-deck" cannot drift apart.
 */
import { and, asc, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { loadCombosNearDeck } from "@/lib/combos/queries";
import type { RecommendMeta } from "@/lib/games/types";
import type { TournamentContext, TournamentSignal } from "./rank";
import type { CandidateCard, CandidateCombo } from "./types";

const { cardIdentities, commanderCardStats, commanderStats, deckCards, legalities } = schema;

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
   * Collections hook (wired in P3.7 by the recommendations route's opt-in
   * `?owned=1`; the signature predates it from P3.1). When set, the pool is
   * restricted to owned cards (an empty set = empty pool, not "hook off");
   * undefined = hook off. The ROUTE is what guarantees a guest or a user
   * with no collection gets undefined, never an empty set.
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
 * Cards that would complete the CARD requirements of a combo with the deck:
 * combos color-fit to the deck where exactly one card piece is missing (the
 * candidate), pivoted candidate-first for the ranker. Template requirements
 * are disclosed in evidence, not resolved (P3.3: deckComboStatus is the one
 * classifier — a template combo is never "complete" on cards alone).
 *
 * The detection SQL is THE shared layer (combos/queries.ts, P3.3) — the
 * Combo Radar runs the same query with `includeComplete: true`; this stays a
 * pure pivot so the two surfaces can never drift apart.
 */
export async function loadComboSignals(
  deckCardIds: readonly string[],
  deckCiMask: number,
): Promise<Map<string, CandidateCombo[]>> {
  const byCandidate = new Map<string, CandidateCombo[]>();
  const found = await loadCombosNearDeck(deckCardIds, deckCiMask, { includeComplete: false });
  for (const combo of found.combos) {
    if (combo.missingPieces.length !== 1) continue; // one-away mode guarantees this
    const candidateId = combo.missingPieces[0].id;
    const list = byCandidate.get(candidateId) ?? [];
    list.push({
      withPieces: combo.inDeckPieces.map((p) => ({ cardId: p.id, name: p.name })),
      results: combo.results,
      templates: combo.templates,
      popularity: combo.popularity,
    });
    byCandidate.set(candidateId, list);
  }
  return byCandidate;
}

/**
 * The deck's leader set as the aggregate keys it: SORTED. decks.leader_ids
 * keeps command-zone entry order (leaderDenorm) while the Topdeck mapper
 * sorts — never compare the arrays raw.
 */
const sortedLeaders = (leaderIds: readonly string[]): string[] => [...leaderIds].sort();

/**
 * Tournament signals for a deck's EXACT commander set (P3.8): the
 * denominator context (null = no aggregated lists — the honest-absence
 * contract: callers then emit no tournament evidence at all) and per-
 * candidate list counts. Two queries on the aggregate tables plus one name
 * lookup for the evidence sentences.
 */
export async function loadTournamentSignals(
  leaderIds: readonly string[],
  candidateIds: readonly string[],
): Promise<{ context: TournamentContext | null; byCandidate: Map<string, TournamentSignal> }> {
  const byCandidate = new Map<string, TournamentSignal>();
  if (leaderIds.length === 0) return { context: null, byCandidate };
  const sorted = sortedLeaders(leaderIds);

  const [totals] = await getDb()
    .select({ lists: commanderStats.lists, firstSeen: commanderStats.firstSeen })
    .from(commanderStats)
    .where(eq(commanderStats.leaderIds, sorted));
  if (!totals) return { context: null, byCandidate };

  // Display order (the deck's own), not the aggregate's sorted key.
  const nameRows = await getDb()
    .select({ id: cardIdentities.id, name: cardIdentities.name })
    .from(cardIdentities)
    .where(inArray(cardIdentities.id, sorted));
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const commanderNames = leaderIds
    .map((id) => nameById.get(id))
    .filter((n): n is string => n !== undefined);

  if (candidateIds.length > 0) {
    const rows = await getDb()
      .select({
        cardId: commanderCardStats.cardIdentityId,
        lists: commanderCardStats.lists,
        top4: commanderCardStats.top4,
      })
      .from(commanderCardStats)
      .where(
        and(
          eq(commanderCardStats.leaderIds, sorted),
          inArray(commanderCardStats.cardIdentityId, [...candidateIds]),
        ),
      );
    for (const r of rows) byCandidate.set(r.cardId, { lists: r.lists, top4: r.top4 });
  }

  return {
    context: { commanderNames, lists: totals.lists, since: totals.firstSeen },
    byCandidate,
  };
}

/**
 * Tournament-sourced candidates (P3.8): the cards most played with the
 * deck's exact commander set, re-checked through the SAME deterministic
 * filter as every other source. This is the third candidate source — the
 * whole point is commander-specific tech the global popularity pool never
 * surfaces (and such cards often have no edhrec popularity at all).
 */
export async function loadTournamentCandidates(
  filter: CandidateFilter,
  leaderIds: readonly string[],
  limit: number,
): Promise<CandidateCard[]> {
  if (leaderIds.length === 0) return [];
  return getDb()
    .select(CANDIDATE_PROJECTION)
    .from(commanderCardStats)
    .innerJoin(cardIdentities, eq(cardIdentities.id, commanderCardStats.cardIdentityId))
    .where(
      and(
        eq(commanderCardStats.leaderIds, sortedLeaders(leaderIds)),
        ...candidateConditions(filter),
      ),
    )
    .orderBy(desc(commanderCardStats.lists), asc(cardIdentities.id))
    .limit(limit);
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
