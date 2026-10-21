/**
 * /api/decks/[id]/games/[gameId] (Y9a, WAVE4 D10) — one logged game.
 *
 * PATCH  — change its details (date, result, players, turn, table level,
 *          seat, opponents, notes); the version and the list it was played
 *          with never move. The adapter's checks run over the whole game
 *          after the change.
 * DELETE — remove it (the toast's Undo, and Y10's edits). A played
 *          snapshot goes with its last game; a saved version it reused
 *          stays. 200 `{deleted: true, snapshotRemoved}`.
 *
 * Same gate as /games (requireJournalDeck, the write bucket); caching
 * intent: force-dynamic + no-store.
 */
import { NextResponse, type NextRequest } from "next/server";

import { noStoreJson, parseJsonBody } from "@/lib/api/json";
import { requireJournalDeck } from "@/lib/decks/route-helpers";
import {
  journalIssue,
  parseGameParam,
  PATCH_BODY,
  playedOnTooLate,
  type GameFields,
} from "@/lib/journal/check";
import { deleteGame, loadGame, updateGame } from "@/lib/journal/games";
import { RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const notFound = () => noStoreJson({ error: "Game not found" }, { status: 404 });

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/games/[gameId]">,
) {
  const { id, gameId: rawGameId } = await ctx.params;
  const gameId = parseGameParam(rawGameId);
  if (gameId === null) return notFound();
  const access = await requireJournalDeck(request.headers, id, RATE_LIMITS.gamesWrite);
  if (access instanceof NextResponse) return access;

  const body = await parseJsonBody(request, PATCH_BODY);
  if (body instanceof NextResponse) return body;
  const existing = await loadGame(access.deck.id, gameId);
  if (!existing) return notFound();
  const change = body;
  const game: GameFields = {
    playedOn: change.playedOn ?? existing.playedOn,
    podSize: change.podSize ?? existing.podSize,
    result: change.result ?? existing.result,
    endTurn: change.endTurn !== undefined ? change.endTurn : existing.endTurn,
    tableLevel: change.tableLevel !== undefined ? change.tableLevel : existing.tableLevel,
    seat: change.seat !== undefined ? change.seat : existing.seat,
    opponents: change.opponents !== undefined ? change.opponents : existing.opponents,
    notes: change.notes !== undefined ? change.notes : existing.notes,
  };
  if (change.playedOn && playedOnTooLate(change.playedOn, new Date())) {
    return noStoreJson({ error: "That date hasn't happened yet" }, { status: 400 });
  }
  const issue = journalIssue(access.journal, game);
  if (issue) return noStoreJson({ error: issue }, { status: 400 });

  const updated = await updateGame(access.deck.id, gameId, game);
  if (!updated) return notFound();
  return noStoreJson({ game: updated });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/decks/[id]/games/[gameId]">,
) {
  const { id, gameId: rawGameId } = await ctx.params;
  const gameId = parseGameParam(rawGameId);
  if (gameId === null) return notFound();
  const access = await requireJournalDeck(request.headers, id, RATE_LIMITS.gamesWrite);
  if (access instanceof NextResponse) return access;

  const deleted = await deleteGame(access.deck.id, gameId);
  if (!deleted) return notFound();
  return noStoreJson({ deleted: true, ...deleted });
}
