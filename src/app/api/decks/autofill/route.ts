/**
 * POST /api/decks/autofill (W9a) — the starter-shell engine's API. Takes a
 * SNAPSHOT (game, format, leaders, kept cards as ids), returns a planned
 * shell with evidence on every pick, and **writes nothing** — the W9b
 * review sheet renders the plan and applying it goes through the editor's
 * normal autosave path. Draft-safe by construction: no deck row needed.
 *
 * The client sends ids only; every fact (type, cost, color identity,
 * legality, price) is read server-side, so a crafted body can't smuggle a
 * wrong ciMask past the deterministic filter. `leaderIds` owns the command
 * zone — keep entries there answer 400.
 *
 * A game whose adapter declares no `recommend.autofill` answers 400 (One
 * Piece — that IS the OP deliverable; no apology copy, it's an API).
 *
 * Caching intent: force-dynamic + no-store — output depends on the body
 * and (for omitted seeds) a server roll. Rate-limited per IP as the app's
 * costliest read; W9b's reroll button spends this budget.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { findFormat, GAME_ID } from "@/db/seed-data";
import { loadCardWires } from "@/lib/cards/wire";
import { clientIp } from "@/lib/decks/access";
import { cardListIssues, type DeckCardInput } from "@/lib/decks/cards";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { getAdapter } from "@/lib/games/registry";
import type { CardData } from "@/lib/games/types";
import { buildShell, finishShell, type FillerPick } from "@/lib/recommend/autofill";
import { gatherSignals, type RecommendSnapshot } from "@/lib/recommend/engine";
import { loadEntryFacts, loadFillerRows, loadTournamentSignals } from "@/lib/recommend/queries";
import { rankCandidates } from "@/lib/recommend/rank";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Pool sizes per gather (WAVE2 §W9a): curve pool `ne` base, base pool `eq`. */
const CURVE_POOL = 600;
const CURVE_TOURNAMENT_POOL = 200;
const BASE_POOL = 150;
const BASE_TOURNAMENT_POOL = 100;

const BODY = z.object({
  game: z.enum(["mtg", "optcg"]),
  format: z.string().max(40),
  leaderIds: z.array(z.uuid()).min(1).max(2),
  keep: z
    .array(
      z.object({
        cardId: z.uuid(),
        zone: z.string().max(40),
        qty: z.number().int().min(1).max(99),
      }),
    )
    .max(500)
    .default([]),
  budgetUsd: z.number().positive().max(100_000).optional(),
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1)
    .optional(),
});

const bad = (error: string, issues?: unknown) =>
  NextResponse.json(issues ? { error, issues } : { error }, { status: 400, headers: NO_STORE });

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(RATE_LIMITS.deckAutofill(clientIp(request.headers)));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad("Body must be JSON");
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) return bad("Invalid body", parsed.error.issues);
  const { game, format, leaderIds, keep, budgetUsd } = parsed.data;

  const adapter = getAdapter(game);
  const meta = adapter.recommend;
  const autofill = meta?.autofill;
  const curve = meta?.curve;
  if (!meta || !autofill || !curve) {
    return bad(`No autofill for ${game}`);
  }

  const seededFormat = findFormat(game, format);
  const formatDef = adapter.formats.find((f) => f.code === format);
  if (!seededFormat || !formatDef) return bad(`Unknown format "${format}" for ${game}`);

  const leaderZone = formatDef.zones.find((z) => z.isLeaderZone);
  const mainZone = formatDef.zones.find((z) => z.countsTowardSize && !z.isLeaderZone);
  if (!leaderZone || !mainZone) return bad(`Format "${format}" cannot be autofilled`);
  if (keep.some((k) => k.zone === leaderZone.id)) {
    return bad(`Leaders go in leaderIds, not keep (zone "${leaderZone.id}")`);
  }

  // Server-authoritative facts for every id the client sent.
  const ids = [...new Set([...leaderIds, ...keep.map((k) => k.cardId)])];
  const facts = await loadEntryFacts(GAME_ID[game], ids);
  const unknown = ids.filter((id) => !facts.has(id));
  if (unknown.length > 0) return bad("Unknown card ids for this game", unknown);

  const entries: DeckCardInput[] = [
    ...leaderIds.map((id) => ({ cardId: id, zone: leaderZone.id, qty: 1, tags: [] })),
    ...keep.map((k) => ({ cardId: k.cardId, zone: k.zone, qty: k.qty, tags: [] })),
  ];
  const structural = cardListIssues(entries, formatDef);
  if (structural.length > 0) return bad("Invalid card list", structural);

  const ciMask = leaderIds.reduce((mask, id) => mask | facts.get(id)!.ciMask, 0);
  const snapshot: RecommendSnapshot = {
    gameId: GAME_ID[game],
    formatId: seededFormat.id,
    ciMask,
    leaderIds: [...leaderIds],
    entries: entries.map((e) => ({
      cardId: e.cardId,
      qty: e.qty,
      primaryType: facts.get(e.cardId)!.primaryType,
      costValue: facts.get(e.cardId)!.costValue,
    })),
  };
  const seed = parsed.data.seed ?? Math.floor(Math.random() * 2 ** 31);

  // Two gathers through the one deterministic filter: the curve pool is the
  // negation of the adapter's base scope, the base pool the scope itself —
  // the "split by isBase" happens in SQL, not by re-sorting one pool.
  const baseScope = autofill.base.scope;
  const [curveGather, baseGather] = await Promise.all([
    gatherSignals(snapshot, {
      poolLimit: CURVE_POOL,
      tournamentPoolLimit: CURVE_TOURNAMENT_POOL,
      scope: { ...baseScope, op: "ne" },
      maxPriceUsd: budgetUsd,
    }),
    gatherSignals(snapshot, {
      poolLimit: BASE_POOL,
      tournamentPoolLimit: BASE_TOURNAMENT_POOL,
      scope: baseScope,
      maxPriceUsd: budgetUsd,
      includeCombos: false,
    }),
  ]);

  // ONE tournament-signals read over the union (honest absence: a commander
  // set with no aggregated lists yields no topdeck evidence anywhere).
  const tournaments = meta.tournaments
    ? await loadTournamentSignals(leaderIds, [
        ...curveGather.candidates.map((c) => c.id),
        ...baseGather.candidates.map((c) => c.id),
      ])
    : { context: null, byCandidate: new Map() };

  const deckCards = snapshot.entries.map((e) => ({
    card: { primaryType: e.primaryType, costValue: e.costValue },
    qty: e.qty,
  }));
  const pool = rankCandidates({
    meta,
    deckCards,
    candidates: curveGather.candidates,
    combosByCandidate: curveGather.combosByCandidate,
    tournamentsByCandidate: tournaments.byCandidate,
    tournamentContext: tournaments.context,
    limit: curveGather.candidates.length,
  });
  const basePool = rankCandidates({
    meta,
    deckCards,
    candidates: baseGather.candidates,
    combosByCandidate: new Map(),
    tournamentsByCandidate: tournaments.byCandidate,
    tournamentContext: tournaments.context,
    limit: baseGather.candidates.length,
  });

  // Planner inputs: slots over countsTowardSize zones; curve/base state
  // from the kept NON-leader cards (the commander is the slot above the
  // template, not a card inside it).
  const countsZones = new Set(formatDef.zones.filter((z) => z.countsTowardSize).map((z) => z.id));
  const keptTotal = entries.filter((e) => countsZones.has(e.zone)).reduce((n, e) => n + e.qty, 0);
  const draft = buildShell({
    autofill,
    curve,
    slots: formatDef.deckSize.min - keptTotal,
    keep: entries
      .filter((e) => countsZones.has(e.zone) && e.zone !== leaderZone.id)
      .map((e) => ({
        qty: e.qty,
        card: {
          primaryType: facts.get(e.cardId)!.primaryType,
          costValue: facts.get(e.cardId)!.costValue,
        },
      })),
    ciMask,
    pool,
    basePool,
    tournamentContext: tournaments.context,
    tournamentsByCandidate: tournaments.byCandidate,
    comboCandidateIds: new Set(curveGather.combosByCandidate.keys()),
    zone: mainZone.id,
    seed,
  });

  // Fillers (adapter basics) + the wire read the response needs anyway.
  const fillerRows =
    draft.fillerNeed > 0
      ? await loadFillerRows(GAME_ID[game], seededFormat.id, autofill.base.fillerNames)
      : [];
  const wires = await loadCardWires(
    [...ids, ...draft.picks.map((p) => p.cardId), ...fillerRows.map((r) => r.id)],
    seededFormat.id,
  );
  const wireById = new Map(wires.map((w) => [w.id, w]));

  let fillerPicks: FillerPick[] = [];
  if (draft.fillerNeed > 0) {
    // Pip counts from every chosen nonbase card (leaders + keeps + picks).
    const costTexts: string[] = [];
    const nonbaseIds = new Set([
      ...leaderIds,
      ...keep.map((k) => k.cardId),
      ...draft.picks.filter((p) => p.group !== "base").map((p) => p.cardId),
    ]);
    for (const id of nonbaseIds) {
      const wire = wireById.get(id);
      if (!wire) continue;
      if (autofill.base.isBase({ primaryType: wire.primaryType, costValue: wire.costValue })) {
        continue;
      }
      const cost = autofill.costTextOf(wire.attrs);
      if (cost) costTexts.push(cost);
    }
    const rowByName = new Map(fillerRows.map((r) => [r.name, r]));
    fillerPicks = autofill.base.fillers({ ciMask, n: draft.fillerNeed, costTexts }).flatMap((f) => {
      const row = rowByName.get(f.name);
      // A missing filler row (unresolvable name) becomes an honest
      // shortfall note in finishShell, never a silent substitute.
      return row
        ? [
            {
              cardId: row.id,
              name: row.name,
              qty: f.qty,
              cheapestUsd: row.cheapestUsd,
              why: f.why,
            },
          ]
        : [];
    });
  }

  const shell = finishShell(draft, fillerPicks, { zone: mainZone.id, budgetUsd });

  // Authoritative validation over keep + picks — same pure adapter code the
  // editor runs. Same-card entries merge (kept basics + fillers).
  const mergedEntries = new Map<string, DeckCardInput>();
  for (const e of [
    ...entries,
    ...shell.picks.map((p) => ({ cardId: p.cardId, zone: p.zone, qty: p.qty, tags: [] })),
  ]) {
    const key = `${e.zone} ${e.cardId}`;
    const prev = mergedEntries.get(key);
    if (prev) prev.qty += e.qty;
    else mergedEntries.set(key, { ...e });
  }
  const usedIds = new Set([...mergedEntries.values()].map((e) => e.cardId));
  const cardData = new Map<string, CardData>();
  for (const wire of wires) {
    if (usedIds.has(wire.id)) cardData.set(wire.id, wire);
  }
  const validation = adapter.validate(
    toDeckSnapshot(adapter.id, formatDef, [...mergedEntries.values()]),
    cardData,
  );

  return NextResponse.json(
    {
      game,
      format,
      seed: shell.seed,
      picks: shell.picks,
      groups: shell.groups,
      notes: shell.notes,
      totals: shell.totals,
      issues: validation,
      cards: wires.filter((w) => usedIds.has(w.id)),
    },
    { headers: NO_STORE },
  );
}
