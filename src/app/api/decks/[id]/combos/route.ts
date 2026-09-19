/**
 * /api/decks/[id]/combos — the Combo Radar (P3.3): what the deck already
 * does and what it is one card from doing, by combo. The complement of the
 * recommendations route it sits beside: that one ranks candidate CARDS with
 * combo participation as one signal; this one is organized BY COMBO,
 * exhaustive over the stored set up to the disclosed scan cap, never
 * re-ranked against staples.
 *
 * Cost, stated (Neon budget): ~4 queries — deck row (access), deck card
 * ids, one aggregate entered via combo_pieces_by_card, one piece fetch —
 * vs the recommendations route's ~6 plus ranking. Both panels fetch only
 * while their tab is active and once per settled autosave burst, so adding
 * this route does NOT double the per-edit combo scan: at most one of the
 * two runs per edit. Same rate-limit stance, own bucket. P3.11 adds up to
 * 3 aggregate reads (a commander_stats PK hit; the name + pair-row reads
 * only when the set has data) for games whose recommend meta declares
 * tournaments — the Cut Coach's signals ride THIS response so the
 * one-fetch-per-edit policy holds instead of growing a second route.
 *
 * No query params by design: the Radar has no tunables (no budget/limit —
 * detection is what it is), so there is nothing to zod. Read access mirrors
 * the deck GET (owner always; non-owners unless private).
 *
 * Caching intent: force-dynamic + no-store — output depends on the deck's
 * current cards (mid-edit) and on who is asking (x-deck-token / session for
 * private decks), so neither CDN nor browser may cache it.
 */
import { NextResponse, type NextRequest } from "next/server";

import { loadCombosNearDeck, loadDeckCardIds } from "@/lib/combos/queries";
import { deckComboStatus } from "@/lib/combos/view";
import { clientIp } from "@/lib/decks/access";
import { deckFormat, requireReadableDeck } from "@/lib/decks/route-helpers";
import type { TournamentCutSignals } from "@/lib/recommend/cuts";
import { loadTournamentSignals } from "@/lib/recommend/queries";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/combos">) {
  const limited = await enforceRateLimit(RATE_LIMITS.deckCombos(clientIp(request.headers)));
  if (limited) return limited;

  const { id } = await ctx.params;
  const access = await requireReadableDeck(request.headers, id);
  if (access instanceof NextResponse) return access;
  const { deck } = access;

  const cardIds = await loadDeckCardIds(deck.id);
  const found = await loadCombosNearDeck(cardIds, deck.ciMask, { includeComplete: true });

  // Bucketed by the one shared classifier: template-gated combos stay in
  // inDeck (all cards present) but are never "complete" — the panel renders
  // their status honestly from the same helper.
  const inDeck = found.combos.filter((c) => deckComboStatus(c) !== "one-away");
  const oneAway = found.combos.filter((c) => deckComboStatus(c) === "one-away");

  // Additive tournament block (P3.11), over the SAME card ids the combo
  // scan used. byCard carries an entry per measured card — lists may
  // honestly be 0, the Cut Coach's "0 of N" line — EXCEPT the leaders:
  // commanders are excluded from their own lists at ingest (no self-rows),
  // so a zero there would be fabricated, and the Coach never ranks the
  // leader zone anyway. Games without tournaments meta (OP) skip the reads
  // entirely and answer the honest empty shape.
  const meta = deckFormat(deck)?.adapter.recommend;
  let tournaments: TournamentCutSignals = { context: null, byCard: {} };
  if (meta?.tournaments) {
    const signals = await loadTournamentSignals(deck.leaderIds, cardIds);
    if (signals.context) {
      const leaderSet = new Set(deck.leaderIds);
      const byCard: TournamentCutSignals["byCard"] = {};
      for (const id of cardIds) {
        if (!leaderSet.has(id)) byCard[id] = signals.byCandidate.get(id) ?? { lists: 0, top4: 0 };
      }
      tournaments = { context: signals.context, byCard };
    }
  }

  return NextResponse.json(
    { deckId: deck.id, inDeck, oneAway, truncated: found.truncated, tournaments },
    { headers: NO_STORE },
  );
}
