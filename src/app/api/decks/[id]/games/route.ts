/**
 * /api/decks/[id]/games (Y9a, WAVE4 D10) — the deck's game journal.
 *
 * GET  — the recent games, newest first, with the total and the played
 *        allowance's numerator (the dialog discloses it); since Y10 also
 *        the record (every game counted by version, table size and
 *        result), the newest lists played with their diffs, and the
 *        returned games' opponents' names.
 * POST — log a game: one transaction freezes the list it was played with
 *        (src/lib/journal/games.ts logGame) — the newest version with the
 *        same playable-list hash, or a new `played` snapshot — and answers
 *        201 `{game, version, minted, capped, first}`. At the played
 *        allowance the game still logs, `version` null and `capped` true;
 *        `first` (Y10) marks the deck's first game.
 *
 * The gate, in order (requireJournalDeck): session 401 → the per-user
 * bucket (writes 30/min + 200/day, reads 60/min) → 404 / owner 403 → a
 * guest deck 400 "Sign in to keep a game journal" → zod → the adapter's
 * journal checks. Owner-only both ways; caching intent: force-dynamic +
 * no-store — the output depends on the session and changes with every log.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireJournalDeck } from "@/lib/decks/route-helpers";
import {
  journalIssue,
  LOG_BODY,
  playedOnTooLate,
  utcDay,
  type GameFields,
} from "@/lib/journal/check";
import { listGames, logGame } from "@/lib/journal/games";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/games">) {
  const { id } = await ctx.params;
  const access = await requireJournalDeck(request.headers, id, RATE_LIMITS.gamesRead);
  if (access instanceof NextResponse) return access;
  return NextResponse.json(await listGames(access.deck), { headers: NO_STORE });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/decks/[id]/games">) {
  const { id } = await ctx.params;
  const access = await requireJournalDeck(request.headers, id, RATE_LIMITS.gamesWrite);
  if (access instanceof NextResponse) return access;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = LOG_BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const now = new Date();
  const body = parsed.data;
  const game: GameFields = {
    playedOn: body.playedOn ?? utcDay(now),
    podSize: body.podSize,
    result: body.result,
    endTurn: body.endTurn ?? null,
    tableLevel: body.tableLevel ?? null,
    seat: body.seat ?? null,
    opponents: body.opponents ?? null,
    notes: body.notes ?? null,
  };
  if (playedOnTooLate(game.playedOn, now)) {
    return NextResponse.json(
      { error: "That date hasn't happened yet" },
      { status: 400, headers: NO_STORE },
    );
  }
  const issue = journalIssue(access.journal, game);
  if (issue) return NextResponse.json({ error: issue }, { status: 400, headers: NO_STORE });

  const logged = await logGame(access.deck.id, game);
  return NextResponse.json(logged, { status: 201, headers: NO_STORE });
}
