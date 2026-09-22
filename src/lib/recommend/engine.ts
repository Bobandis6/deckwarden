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
 * no deck row — snapshot callers (W9a autofill) feed the same engine
 * through `recommendForSnapshot`/`gatherSignals`, not a second engine.
 *
 * W9a split: `gatherSignals` owns candidate assembly (sources A–C through
 * the one deterministic filter), `recommendForSnapshot` adds the tournament
 * signals read + ranking, and `recommendForDeck` is the thin deck-row
 * wrapper. The autofill route calls `gatherSignals` twice (curve pool /
 * base pool via `scope`) and loads tournament signals ONCE over the union —
 * which is why the signals read is not inside `gatherSignals`.
 */
import { getAdapter } from "@/lib/games/registry";
import { gameCodeById } from "@/db/seed-data";
import type { RecommendMeta } from "@/lib/games/types";
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
import type { CandidateCard, CandidateCombo, Recommendation } from "./types";

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

/** One deck entry with the fields curve bucketing reads (loadDeckEntries shape). */
export interface SnapshotEntry {
  cardId: string;
  qty: number;
  primaryType: string | null;
  costValue: number | null;
}

/**
 * A deck's recommendation-relevant state without a deck row — what W9a's
 * autofill route builds from its POST body, and what `recommendForDeck`
 * builds from the stored deck.
 */
export interface RecommendSnapshot {
  gameId: number;
  formatId: number;
  ciMask: number;
  leaderIds: string[];
  /** All zones, leaders included — these ids are never candidates. */
  entries: SnapshotEntry[];
}

/**
 * Knobs the autofill route turns per `gatherSignals` call; everything is a
 * plain default for the recommendations path. The CandidateFilter stays an
 * internal shape assembled HERE (snapshot + opts) so "legal / color-fit /
 * budget / not-in-deck" cannot drift between callers — W9b consumes the
 * route, never a third gather variant.
 */
export interface GatherOptions {
  maxPriceUsd?: number;
  ownedCardIds?: ReadonlySet<string>;
  /** Popularity-pool size; default POOL_LIMIT. */
  poolLimit?: number;
  /** Tournament-candidate pool size; default TOURNAMENT_POOL_LIMIT. */
  tournamentPoolLimit?: number;
  /** Whitelisted primary_type scope (W9a: curve pool `ne` Land, base pool `eq` Land). */
  scope?: CandidateFilter["scope"];
  /** Combo signals load (default true; the base-pool call turns it off). */
  includeCombos?: boolean;
}

/** The game's RecommendMeta, or undefined for games without signals (OPTCG). */
export function recommendMetaFor(gameId: number): RecommendMeta | undefined {
  const gameCode = gameCodeById(gameId);
  return gameCode ? getAdapter(gameCode).recommend : undefined;
}

/**
 * Candidate assembly (sources A–C) for one snapshot: the deterministic
 * filter, the pools, and combo participation — everything up to (but not
 * including) the tournament-signals read, which callers run once over
 * however many gathers they made.
 */
export async function gatherSignals(
  snapshot: RecommendSnapshot,
  opts: GatherOptions = {},
): Promise<{
  candidates: CandidateCard[];
  combosByCandidate: Map<string, CandidateCombo[]>;
}> {
  const meta = recommendMetaFor(snapshot.gameId);
  if (!meta) return { candidates: [], combosByCandidate: new Map() };

  const deckCardIds = [...new Set(snapshot.entries.map((e) => e.cardId))];

  const filter: CandidateFilter = {
    gameId: snapshot.gameId,
    formatId: snapshot.formatId,
    deckCiMask: snapshot.ciMask,
    excludeCardIds: deckCardIds,
    maxPriceUsd: opts.maxPriceUsd,
    ownedCardIds: opts.ownedCardIds,
    exclude: meta.exclude,
    scope: opts.scope,
  };

  const [pool, combosByCandidate, tournamentPool] = await Promise.all([
    loadCandidatePool(filter, opts.poolLimit ?? POOL_LIMIT),
    meta.combos && (opts.includeCombos ?? true)
      ? loadComboSignals(deckCardIds, snapshot.ciMask)
      : Promise.resolve(new Map<string, CandidateCombo[]>()),
    meta.tournaments
      ? loadTournamentCandidates(
          filter,
          snapshot.leaderIds,
          opts.tournamentPoolLimit ?? TOURNAMENT_POOL_LIMIT,
        )
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

  return { candidates, combosByCandidate };
}

export async function recommendForSnapshot(
  snapshot: RecommendSnapshot,
  opts: RecommendOptions = {},
): Promise<Recommendation[]> {
  const meta = recommendMetaFor(snapshot.gameId);
  if (!meta) return []; // game without recommendation signals (OPTCG stub)

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const { candidates, combosByCandidate } = await gatherSignals(snapshot, {
    maxPriceUsd: opts.maxPriceUsd,
    ownedCardIds: opts.ownedCardIds,
  });

  // One batched signals read for every candidate from any source; absence
  // (no aggregated lists for this commander set) yields a null context and
  // an empty map — the ranker then emits no tournament evidence at all.
  const tournaments = meta.tournaments
    ? await loadTournamentSignals(
        snapshot.leaderIds,
        candidates.map((c) => c.id),
      )
    : { context: null, byCandidate: new Map() };

  return rankCandidates({
    meta,
    deckCards: snapshot.entries.map((e) => ({
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

export async function recommendForDeck(
  deck: RecommendDeckRow,
  opts: RecommendOptions = {},
): Promise<Recommendation[]> {
  if (!recommendMetaFor(deck.gameId)) return [];
  const entries = await loadDeckEntries(deck.id);
  return recommendForSnapshot(
    {
      gameId: deck.gameId,
      formatId: deck.formatId,
      ciMask: deck.ciMask,
      leaderIds: deck.leaderIds,
      entries,
    },
    opts,
  );
}
