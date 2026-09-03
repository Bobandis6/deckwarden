/**
 * Recommendation engine entry point (P3.1): batched IO (queries.ts) feeding
 * the pure ranker (rank.ts). Consumes only the adapter interface — the
 * game's RecommendMeta — never game internals.
 *
 * Candidate sources, deterministic by construction:
 *   A. popularity pool — top cards by the game's popularity signal that pass
 *      the filter (legality / color identity / budget / not-in-deck / no
 *      never-advise cards / owned-hook);
 *   B. combo participants — cards one piece short of a color-fit combo with
 *      the deck, re-checked through the SAME filter;
 *   C. tournament tech (P3.8) — the cards most played with the deck's EXACT
 *      commander set in settled top-16 lists, re-checked through the same
 *      filter. Commander-specific tech the global pool never surfaces is
 *      the point; a commander set with no aggregated lists contributes no
 *      candidates and no evidence (honest absence).
 *
 * A deck with no leader has ci_mask 0, so only colorless-identity cards fit
 * — correct (that IS the empty color identity), just sparse; P3.2 decides
 * how the panel presents that state. Draft decks (P2.8 lazy creation) have
 * no deck row — when P3.2 needs live-draft recommendations it should feed a
 * snapshot through a POST body into this same engine, not a second engine.
 */
import { getAdapter } from "@/lib/games/registry";
import { gameCodeById } from "@/db/seed-data";
import { rankCandidates } from "./rank";
import {
  loadCandidatePool,
  loadCandidateRows,
  loadComboSignals,
  loadDeckEntries,
  loadTournamentCandidates,
  loadTournamentSignals,
  type CandidateFilter,
} from "./queries";
import type { CandidateCombo, Recommendation } from "./types";

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 50;
/** Popularity-pool size before ranking; plenty above any response limit. */
export const POOL_LIMIT = 300;
/** Tournament-candidate pool size (source C) — the most-played tech first. */
export const TOURNAMENT_POOL_LIMIT = 100;

export interface RecommendOptions {
  limit?: number;
  /** Budget filter: only cards with a known price ≤ this (USD). */
  maxPriceUsd?: number;
  /** Collections hook — see CandidateFilter; set by the route's opt-in `?owned=1` (P3.7). */
  ownedCardIds?: ReadonlySet<string>;
}

export interface RecommendDeckRow {
  id: string;
  gameId: number;
  formatId: number;
  ciMask: number;
  /** Command-zone denorm, entry order (the tournament queries sort it). */
  leaderIds: string[];
}

export async function recommendForDeck(
  deck: RecommendDeckRow,
  opts: RecommendOptions = {},
): Promise<Recommendation[]> {
  const gameCode = gameCodeById(deck.gameId);
  const meta = gameCode ? getAdapter(gameCode).recommend : undefined;
  if (!meta) return []; // game without recommendation signals (OPTCG stub)

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const deckEntries = await loadDeckEntries(deck.id);
  const deckCardIds = [...new Set(deckEntries.map((e) => e.cardId))];

  const filter: CandidateFilter = {
    gameId: deck.gameId,
    formatId: deck.formatId,
    deckCiMask: deck.ciMask,
    excludeCardIds: deckCardIds,
    maxPriceUsd: opts.maxPriceUsd,
    ownedCardIds: opts.ownedCardIds,
    exclude: meta.exclude,
  };

  const [pool, combosByCandidate, tournamentPool] = await Promise.all([
    loadCandidatePool(filter, POOL_LIMIT),
    meta.combos
      ? loadComboSignals(deckCardIds, deck.ciMask)
      : Promise.resolve(new Map<string, CandidateCombo[]>()),
    meta.tournaments
      ? loadTournamentCandidates(filter, deck.leaderIds, TOURNAMENT_POOL_LIMIT)
      : Promise.resolve([]),
  ]);

  // Combo-sourced candidates outside the popularity pool still face the same
  // deterministic filter (legality/budget/...) before they may rank.
  const pooled = new Set(pool.map((c) => c.id));
  for (const c of tournamentPool) pooled.add(c.id);
  const comboOnlyIds = [...combosByCandidate.keys()].filter((id) => !pooled.has(id));
  const comboRows = await loadCandidateRows(filter, comboOnlyIds);

  const candidates = [
    ...pool,
    ...tournamentPool.filter((c) => !pool.some((p) => p.id === c.id)),
    ...comboRows,
  ];

  // One batched signals read for every candidate from any source; absence
  // (no aggregated lists for this commander set) yields a null context and
  // an empty map — the ranker then emits no tournament evidence at all.
  const tournaments = meta.tournaments
    ? await loadTournamentSignals(
        deck.leaderIds,
        candidates.map((c) => c.id),
      )
    : { context: null, byCandidate: new Map() };

  return rankCandidates({
    meta,
    deckCards: deckEntries.map((e) => ({
      card: { primaryType: e.primaryType, costValue: e.costValue },
      qty: e.qty,
    })),
    candidates,
    combosByCandidate,
    tournamentsByCandidate: tournaments.byCandidate,
    tournamentContext: tournaments.context,
    limit,
  });
}
