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
 *
 * Y6a (WAVE4 D7): rank all → goals → slice. `recommendForSnapshot` ranks
 * every candidate, checks them against the deck's goals in rank order
 * (goals.ts' applyGoals) and only then cuts to the limit. For a game with
 * `brackets` and a list with a leader it reads the list first, on the
 * server: the adapter's own `assess` over the entries' declared flags
 * (queries.ts' ReadFacts) and the list's complete combos — ONE more
 * statement (loadCompleteCombos, run beside the candidate gather), the
 * share page's pattern without its freshness read, which moves no level.
 */
import type { DeckGoals } from "@/lib/decks/goals";
import { loadCompleteCombos } from "@/lib/combos/queries";
import { getAdapter } from "@/lib/games/registry";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import type {
  BracketInput,
  CardData,
  CompleteCombo,
  DeckEntry,
  GameAdapter,
  RecommendMeta,
} from "@/lib/games/types";
import {
  applyGoals,
  type GoaledRecommendation,
  type GoalsRead,
  type SuggestionGoals,
} from "./goals";
import { rankCandidates } from "./rank";
import {
  loadCandidatePool,
  loadCandidateRows,
  loadComboSignals,
  loadDeckEntries,
  loadTournamentCandidates,
  loadTournamentSignals,
  type CandidateFilter,
  type ReadFacts,
} from "./queries";
import type { CandidateCard, CandidateCombo } from "./types";

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
  /**
   * The deck's goals as this request may apply them (Y6a): the owner's
   * (target, budget, answers), a visitor's public subset (the target only —
   * the budget and the answers are the owner's), or a draft's own.
   */
  goals?: SuggestionGoals | Pick<DeckGoals, "targetLevel"> | null;
}

/** What Suggestions get (Y6a): the list, what the goals hid from it, and whether the combo scan was cut. */
export interface RecommendResult {
  /** Rank order, at most the limit; each row's goal conflicts beside its evidence. */
  recommendations: GoaledRecommendation[];
  /** Hidden by the goals — the cards that ranked above the list's last row. */
  hidden: GoaledRecommendation[];
  /**
   * The one-away combo scan reached its cap (COMBO_SCAN_LIMIT), so a rarer
   * combo a card would complete wasn't checked against the goals either.
   */
  combosTruncated: boolean;
}

const NO_RESULT: RecommendResult = { recommendations: [], hidden: [], combosTruncated: false };

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
  /** The entry's zone (a saved deck's); absent = the leader zone for `leaderIds`, else the main zone. */
  zone?: string;
  /** Y6a: what the server-side bracket read takes of the card; absent on any entry = no read. */
  facts?: ReadFacts;
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

/** The game's adapter, or undefined for an unknown game id. */
function adapterFor(gameId: number): GameAdapter | undefined {
  const gameCode = gameCodeById(gameId);
  return gameCode ? getAdapter(gameCode) : undefined;
}

/** The game's RecommendMeta, or undefined for games without signals (OPTCG). */
export function recommendMetaFor(gameId: number): RecommendMeta | undefined {
  return adapterFor(gameId)?.recommend;
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
  /** The one-away combo scan reached its cap (Y6a — disclosed with goals). */
  combosTruncated: boolean;
}> {
  const adapter = adapterFor(snapshot.gameId);
  const meta = adapter?.recommend;
  if (!meta) return { candidates: [], combosByCandidate: new Map(), combosTruncated: false };
  // The adapter's bracket flags ride every candidate row (Y6a's goals check).
  const flagPaths = adapter.brackets?.flagPaths;

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

  const [pool, comboSignals, tournamentPool] = await Promise.all([
    loadCandidatePool(filter, opts.poolLimit ?? POOL_LIMIT, flagPaths),
    meta.combos && (opts.includeCombos ?? true)
      ? loadComboSignals(deckCardIds, snapshot.ciMask, snapshot.leaderIds)
      : Promise.resolve({ byCandidate: new Map<string, CandidateCombo[]>(), truncated: false }),
    meta.tournaments
      ? loadTournamentCandidates(
          filter,
          snapshot.leaderIds,
          opts.tournamentPoolLimit ?? TOURNAMENT_POOL_LIMIT,
          flagPaths,
        )
      : Promise.resolve([]),
  ]);
  const combosByCandidate = comboSignals.byCandidate;

  // Combo-sourced candidates outside the popularity pool still face the same
  // deterministic filter (legality/budget/...) before they may rank.
  const pooled = new Set(pool.map((c) => c.id));
  for (const c of tournamentPool) pooled.add(c.id);
  const comboOnlyIds = [...combosByCandidate.keys()].filter((id) => !pooled.has(id));
  const comboRows = await loadCandidateRows(filter, comboOnlyIds, flagPaths);

  const candidates = [
    ...pool,
    ...tournamentPool.filter((c) => !pool.some((p) => p.id === c.id)),
    ...comboRows,
  ];

  return { candidates, combosByCandidate, combosTruncated: comboSignals.truncated };
}

/**
 * A card as the server's bracket read takes it (Y6a): its identity facts
 * and, in `attrs`, the adapter's declared flags alone (all `assess` and
 * `impact` read there — pinned in bracket-impact.test.ts). No legality: it
 * blocks a read's status, never a level, and the candidate filter and
 * validate own it. The two values a candidate row doesn't carry
 * (colorsMask, isLeaderCandidate) no read takes.
 */
function readCard(
  id: string,
  primaryType: string | null,
  costValue: number | null,
  f: Omit<ReadFacts, "colorsMask" | "isLeaderCandidate" | "isPreview"> &
    Partial<Pick<ReadFacts, "colorsMask" | "isLeaderCandidate" | "isPreview">>,
): CardData {
  return {
    id,
    name: f.name,
    externalKey: f.externalKey,
    primaryType,
    costValue,
    colorsMask: f.colorsMask ?? 0,
    ciMask: f.ciMask,
    isLeaderCandidate: f.isLeaderCandidate ?? false,
    isPreview: f.isPreview ?? false,
    cheapestUsd: f.cheapestUsd === null ? null : Number(f.cheapestUsd),
    popularity: f.popularity,
    attrs: f.flags,
    legality: [],
  };
}

/** Whether this snapshot gets a server-side read: the game has `brackets`, the list a leader and every entry its facts. */
function readable(adapter: GameAdapter, snapshot: RecommendSnapshot): boolean {
  return (
    adapter.brackets !== undefined &&
    snapshot.leaderIds.length > 0 &&
    snapshot.entries.every((e) => e.facts !== undefined)
  );
}

/**
 * The list's read for the goals check (Y6a): the snapshot as a DeckSnapshot
 * (a saved deck's zones; a draft's leaders in the leader zone, the rest in
 * the main zone — the same list either way for Commander), its cards, its
 * complete combos, the goals' target and answers. Freshness is left out —
 * it moves the read's status, never a level. Then each candidate as the
 * read sees it, with the combos it would complete (the one-away pivot,
 * whole: every other piece in the list).
 */
function goalsRead(
  adapter: GameAdapter,
  snapshot: RecommendSnapshot,
  combos: readonly CompleteCombo[],
  candidates: readonly CandidateCard[],
  combosByCandidate: ReadonlyMap<string, readonly CandidateCombo[]>,
  goals: RecommendOptions["goals"],
): GoalsRead | null {
  const brackets = adapter.brackets;
  const formatCode = findFormatById(snapshot.formatId)?.code;
  const format = adapter.formats.find((f) => f.code === formatCode);
  if (!brackets || !format) return null;
  const leaderZone = format.zones.find((z) => z.isLeaderZone)?.id;
  const mainZone = format.zones.find((z) => !z.isLeaderZone)?.id;
  const leaders = new Set(snapshot.leaderIds);
  const zones: Record<string, DeckEntry[]> = {};
  const cards = new Map<string, CardData>();
  for (const e of snapshot.entries) {
    const zone = e.zone ?? (leaders.has(e.cardId) ? leaderZone : mainZone);
    if (!zone || !e.facts) continue;
    (zones[zone] ??= []).push({ cardId: e.cardId, qty: e.qty, tags: [] });
    cards.set(e.cardId, readCard(e.cardId, e.primaryType, e.costValue, e.facts));
  }
  const input: BracketInput = {
    deck: { gameId: adapter.id, formatCode: format.code, zones },
    cards,
    combos,
    freshness: null,
    targetLevel: goals?.targetLevel ?? null,
    answers: (goals && "answers" in goals ? goals.answers : null) ?? null,
  };
  return {
    input,
    read: brackets.assess(input),
    candidates: new Map(
      candidates.map((c) => [
        c.id,
        {
          card: readCard(c.id, c.primaryType, c.costValue, c),
          completes: (combosByCandidate.get(c.id) ?? []).map((k) => ({
            key: k.key,
            cardPieces: [...k.withPieces.map((p) => p.cardId), c.id].sort(),
            templates: k.templates,
            tag: k.tag,
            relevant: k.relevant,
            results: k.results,
            popularity: k.popularity,
          })),
        },
      ]),
    ),
  };
}

export async function recommendForSnapshot(
  snapshot: RecommendSnapshot,
  opts: RecommendOptions = {},
): Promise<RecommendResult> {
  const adapter = adapterFor(snapshot.gameId);
  const meta = adapter?.recommend;
  if (!meta) return NO_RESULT; // game without recommendation signals (OPTCG stub)

  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const withRead = readable(adapter, snapshot);
  const [{ candidates, combosByCandidate, combosTruncated }, completeCombos] = await Promise.all([
    gatherSignals(snapshot, {
      maxPriceUsd: opts.maxPriceUsd,
      ownedCardIds: opts.ownedCardIds,
    }),
    withRead ? loadCompleteCombos(snapshot.entries.map((e) => e.cardId)) : Promise.resolve(null),
  ]);

  // One batched signals read for every candidate from any source; absence
  // (no aggregated lists for this commander set) yields a null context and
  // an empty map — the ranker then emits no tournament evidence at all.
  const tournaments = meta.tournaments
    ? await loadTournamentSignals(
        snapshot.leaderIds,
        candidates.map((c) => c.id),
      )
    : { context: null, byCandidate: new Map() };

  // Rank all → goals → slice: the cut comes after the goals (Y6a).
  const ranked = rankCandidates({
    meta,
    deckCards: snapshot.entries.map((e) => ({
      card: { primaryType: e.primaryType, costValue: e.costValue },
      qty: e.qty,
    })),
    candidates,
    combosByCandidate,
    tournamentsByCandidate: tournaments.byCandidate,
    tournamentContext: tournaments.context,
  });
  const read =
    completeCombos !== null
      ? goalsRead(adapter, snapshot, completeCombos, candidates, combosByCandidate, opts.goals)
      : null;
  const { kept, hidden } = applyGoals(ranked, opts.goals ?? null, read, adapter.brackets, limit);
  return { recommendations: kept, hidden, combosTruncated };
}

export async function recommendForDeck(
  deck: RecommendDeckRow,
  opts: RecommendOptions = {},
): Promise<RecommendResult> {
  const adapter = adapterFor(deck.gameId);
  if (!adapter?.recommend) return NO_RESULT;
  const entries = await loadDeckEntries(deck.id, adapter.brackets?.flagPaths);
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
