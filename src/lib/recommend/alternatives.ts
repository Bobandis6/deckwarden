/**
 * Swap Lab's alternatives (Y7a, WAVE4 D8) — cards that share a job with one
 * card in the list, inside the deck's goals. Not a second engine: the same
 * gather (sources A–C through the one deterministic filter), the same
 * ranker, the same goals step and the Cut Coach's own tradeoff, aimed at one
 * slot.
 *
 * - **Who's a candidate**: `candidateConditions` as Suggestions apply it —
 *   the deck's color identity, legal, not in the deck (the swapped card
 *   included) — narrowed by the adapter's swap declaration: sharing at least
 *   one of the card's roles, the adapter's own scope (Magic: no lands), and
 *   a cost window around the card's cost (Magic: ±1, the gold set's best).
 *   The role pool requires a popularity rank, like Suggestions' pool;
 *   tournament and combo sources may bring unranked cards that share a role.
 * - **The order**: the most shared roles first, then the existing evidence —
 *   EDHREC rank, play with the deck's exact commanders, combos, the curve —
 *   exactly as `rankCandidates` scores it. Each card's role match leads its
 *   evidence, in the adapter's words and credit.
 * - **A swap is not an add**: every candidate is judged in the card's place —
 *   the list WITHOUT one copy of it — for the goals read (a Game Changer for
 *   a Game Changer at a target of 3 stays in), the one-away combo scan (a
 *   combo the swapped card was part of isn't completed by its replacement)
 *   and the curve (the freed slot is the gap).
 * - **The tradeoff**: the Cut Coach's lines for the swapped card over the
 *   whole list — what cutting it costs or frees. The snapshot carries ids
 *   and copies only, so the user-tag role line is never among them; a card
 *   with no evidence has no tradeoff, and none is made up.
 */
import { loadCompleteCombos } from "@/lib/combos/queries";
import type { CompleteCombo } from "@/lib/games/types";
import {
  completeCombosByCard,
  rankCuts,
  type CutComboInput,
  type CutEntryInput,
  type CutEvidence,
} from "./cuts";
import { adapterFor, gatherSignals, goalsRead, readable, type RecommendSnapshot } from "./engine";
import { findFormatById } from "@/db/seed-data";
import { applyGoals, type GoaledRecommendation, type SuggestionGoals } from "./goals";
import { loadTournamentSignals, type CandidateScope } from "./queries";
import { maxConfidence, rankCandidates, type TournamentSignal } from "./rank";
import type { Recommendation, RecommendationEvidence } from "./types";

/** The Card tab's list length; the hidden cards above its last row come back too. */
export const ALTERNATIVES_LIMIT = 8;

export interface AlternativesRequest {
  /** The whole list, the swapped card included — every entry with its facts. */
  snapshot: RecommendSnapshot;
  /** The card to swap out (a main-list card, never a leader). */
  cardId: string;
  /** Its roles: the adapter's declared keys only. Empty = no alternatives. */
  roles: readonly string[];
  /** Its cost; null = no cost window. */
  costValue: number | null;
  goals: SuggestionGoals | null;
  limit?: number;
}

/** One alternative: a goaled recommendation plus the roles it shares, the adapter's display order. */
export type Alternative = GoaledRecommendation & { shared: string[] };

export interface AlternativesResult {
  /** Rank order: the most shared roles first, then the evidence; at most the limit. */
  alternatives: Alternative[];
  /** Hidden by the goals — the cards ranked above the list's last row. */
  hidden: Alternative[];
  /** The one-away combo scan reached its cap (disclosed with goals, as in Suggestions). */
  combosTruncated: boolean;
  /** The Cut Coach's lines for the swapped card; null when it has none. */
  tradeoff: CutEvidence[] | null;
}

const NOTHING: AlternativesResult = {
  alternatives: [],
  hidden: [],
  combosTruncated: false,
  tradeoff: null,
};

/** The list without one copy of the card — the last entry holding it (leaders come first). */
export function withoutOneCopy(snapshot: RecommendSnapshot, cardId: string): RecommendSnapshot {
  const at = snapshot.entries.map((e) => e.cardId).lastIndexOf(cardId);
  if (at < 0) return snapshot;
  const entries = snapshot.entries.flatMap((e, i) =>
    i !== at ? [e] : e.qty > 1 ? [{ ...e, qty: e.qty - 1 }] : [],
  );
  return { ...snapshot, entries };
}

/** The cost window as a whitelisted scope; costs never go below zero. */
export function costWindow(costValue: number, halfWidth: number): CandidateScope {
  return {
    column: "cost_value",
    op: "between",
    min: Math.max(0, costValue - halfWidth),
    max: costValue + halfWidth,
  };
}

/**
 * Sort by shared roles (most first), keeping the ranker's order inside each
 * count, and lead each card's evidence with its role match. A row sharing
 * no role is dropped (the filter already guarantees one).
 */
export function orderBySharedRoles(
  ranked: readonly Recommendation[],
  rolesOf: ReadonlyMap<string, readonly string[]>,
  own: readonly string[],
  roleOrder: readonly string[],
  roleEvidence: (shared: readonly string[]) => RecommendationEvidence,
): (Recommendation & { shared: string[] })[] {
  const mine = new Set(own);
  const position = new Map(roleOrder.map((k, i) => [k, i]));
  const at = (k: string) => position.get(k) ?? Number.MAX_SAFE_INTEGER;
  return ranked
    .map((rec, i) => ({
      rec,
      i,
      shared: (rolesOf.get(rec.cardId) ?? [])
        .filter((r) => mine.has(r))
        .sort((a, b) => at(a) - at(b)),
    }))
    .filter((x) => x.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || a.i - b.i)
    .map(({ rec, shared }) => {
      const evidence = [roleEvidence(shared), ...rec.evidence];
      return { ...rec, evidence, confidence: maxConfidence(evidence), shared };
    });
}

/**
 * The swapped card's tradeoff (rankCuts over the whole list): what cutting
 * it costs (a combo it completes, its play record) or frees (a crowded
 * curve slot, thin measured play). Tournament presence follows the combos
 * route's rule — with an aggregate, every non-leader card was measured.
 */
function cutTradeoff(
  req: AlternativesRequest,
  meta: NonNullable<ReturnType<typeof adapterFor>>["recommend"],
  combos: readonly CompleteCombo[] | null,
  tournaments: {
    context: Parameters<typeof rankCuts>[0]["tournamentContext"];
    byCandidate: ReadonlyMap<string, TournamentSignal>;
  },
): CutEvidence[] | null {
  const adapter = adapterFor(req.snapshot.gameId);
  const formatCode = findFormatById(req.snapshot.formatId)?.code;
  const format = adapter?.formats.find((f) => f.code === formatCode);
  if (!meta?.cuts || !format) return null;
  const leaderZone = format.zones.find((z) => z.isLeaderZone)?.id ?? "leaders";
  const mainZone = format.zones.find((z) => !z.isLeaderZone)?.id ?? "main";
  const leaders = new Set(req.snapshot.leaderIds);
  const names = new Map<string, string>();
  const entries: CutEntryInput[] = [];
  for (const e of req.snapshot.entries) {
    if (!e.facts) continue;
    names.set(e.cardId, e.facts.name);
    entries.push({
      card: {
        id: e.cardId,
        name: e.facts.name,
        primaryType: e.primaryType,
        costValue: e.costValue,
        cheapestUsd: e.facts.cheapestUsd === null ? null : Number(e.facts.cheapestUsd),
        popularity: e.facts.popularity,
      },
      zone: e.zone ?? (leaders.has(e.cardId) ? leaderZone : mainZone),
      qty: e.qty,
      tags: [],
    });
  }
  const asCutCombos: CutComboInput[] = (combos ?? []).map((c) => ({
    templates: c.templates,
    missingPieces: [],
    inDeckPieces: c.cardPieces.map((id) => ({ id, name: names.get(id) ?? "" })),
    results: c.results,
    popularity: c.popularity,
  }));
  const byCard = new Map<string, TournamentSignal>();
  if (tournaments.context) {
    for (const e of entries) {
      if (!leaders.has(e.card.id))
        byCard.set(e.card.id, tournaments.byCandidate.get(e.card.id) ?? { lists: 0, top4: 0 });
    }
  }
  const { cuts } = rankCuts({
    meta,
    roleTargets: [],
    entries,
    excludedZones: new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id)),
    completeCombosByCard: completeCombosByCard(asCutCombos, new Set(entries.map((e) => e.card.id))),
    tournamentsByCard: byCard,
    tournamentContext: tournaments.context,
  });
  return cuts.find((c) => c.cardId === req.cardId)?.evidence ?? null;
}

export async function alternativesForSnapshot(
  req: AlternativesRequest,
): Promise<AlternativesResult> {
  const { snapshot, cardId, roles } = req;
  const adapter = adapterFor(snapshot.gameId);
  const meta = adapter?.recommend;
  const swap = meta?.swap;
  if (!adapter || !meta || !swap || roles.length === 0) return NOTHING;

  const limit = Math.max(1, req.limit ?? ALTERNATIVES_LIMIT);
  const without = withoutOneCopy(snapshot, cardId);
  const scope: CandidateScope[] = [
    ...(swap.candidateScope ? [swap.candidateScope] : []),
    ...(req.costValue !== null ? [costWindow(req.costValue, swap.costWindow)] : []),
  ];
  const withRead = readable(adapter, snapshot);
  const [{ candidates, combosByCandidate, combosTruncated }, completeCombos] = await Promise.all([
    gatherSignals(without, {
      scope,
      roles: { path: swap.rolesPath, any: roles },
      excludeCardIds: [cardId],
    }),
    // The whole list's: the tradeoff and the goals read share it.
    withRead ? loadCompleteCombos(snapshot.entries.map((e) => e.cardId)) : Promise.resolve(null),
  ]);

  // One tournament read for both sides: the candidates' evidence and the list's cut signals.
  const deckIds = [...new Set(snapshot.entries.map((e) => e.cardId))];
  const tournaments = meta.tournaments
    ? await loadTournamentSignals(snapshot.leaderIds, [
        ...new Set([...candidates.map((c) => c.id), ...deckIds]),
      ])
    : { context: null, byCandidate: new Map<string, TournamentSignal>() };

  const ranked = rankCandidates({
    meta,
    deckCards: without.entries.map((e) => ({
      card: { primaryType: e.primaryType, costValue: e.costValue },
      qty: e.qty,
    })),
    candidates,
    combosByCandidate,
    tournamentsByCandidate: tournaments.byCandidate,
    tournamentContext: tournaments.context,
  });
  const labelOf = new Map(swap.roles.map((r) => [r.key, r.label]));
  const ordered = orderBySharedRoles(
    ranked,
    new Map(candidates.map((c) => [c.id, c.roles ?? []])),
    roles,
    swap.roles.map((r) => r.key),
    (shared) => ({
      source: swap.source,
      why: swap.evidence(shared.map((k) => labelOf.get(k) ?? k)).why,
      with: [],
      howOften: null,
      // Community tags with a kill-switch, not measured play.
      confidence: "medium",
    }),
  );

  // The read counts a combo only while every piece is in the list, so the
  // swapped card's combos leave with it (Magic's assessBracket skips the rest).
  const read =
    completeCombos !== null
      ? goalsRead(adapter, without, completeCombos, candidates, combosByCandidate, req.goals)
      : null;
  const { kept, hidden } = applyGoals(ordered, req.goals, read, adapter.brackets, limit);
  const sharedOf = new Map(ordered.map((o) => [o.cardId, o.shared]));
  const withShared = (rows: GoaledRecommendation[]): Alternative[] =>
    rows.map((r) => ({ ...r, shared: sharedOf.get(r.cardId) ?? [] }));

  return {
    alternatives: withShared(kept),
    hidden: withShared(hidden),
    combosTruncated,
    tradeoff: cutTradeoff(req, meta, completeCombos, tournaments),
  };
}
