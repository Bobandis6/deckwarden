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
 *      the deck, re-checked through the SAME filter.
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
  type CandidateFilter,
} from "./queries";
import type { CandidateCombo, Recommendation } from "./types";

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 50;
/** Popularity-pool size before ranking; plenty above any response limit. */
export const POOL_LIMIT = 300;

export interface RecommendOptions {
  limit?: number;
  /** Budget filter: only cards with a known price ≤ this (USD). */
  maxPriceUsd?: number;
  /** Collections hook (P3.7) — see CandidateFilter; nothing sets this today. */
  ownedCardIds?: ReadonlySet<string>;
}

export interface RecommendDeckRow {
  id: string;
  gameId: number;
  formatId: number;
  ciMask: number;
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

  const [pool, combosByCandidate] = await Promise.all([
    loadCandidatePool(filter, POOL_LIMIT),
    meta.combos
      ? loadComboSignals(deckCardIds, deck.ciMask)
      : Promise.resolve(new Map<string, CandidateCombo[]>()),
  ]);

  // Combo-sourced candidates outside the popularity pool still face the same
  // deterministic filter (legality/budget/...) before they may rank.
  const pooled = new Set(pool.map((c) => c.id));
  const comboOnlyIds = [...combosByCandidate.keys()].filter((id) => !pooled.has(id));
  const comboRows = await loadCandidateRows(filter, comboOnlyIds);

  return rankCandidates({
    meta,
    deckCards: deckEntries.map((e) => ({
      card: { primaryType: e.primaryType, costValue: e.costValue },
      qty: e.qty,
    })),
    candidates: [...pool, ...comboRows],
    combosByCandidate,
    limit,
  });
}
