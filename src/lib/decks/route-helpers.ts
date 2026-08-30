/**
 * The auth middleware for deck routes (P1.1): load the deck row, resolve both
 * ownership proofs — the `x-deck-token` header (guest decks) and the Better
 * Auth session (claimed decks, P2.1) — and gate the handler. Handlers get
 * back either the context they need or a ready-made error response.
 *
 * Status contract (locked by the smoke tests): unknown/invalid id → 404;
 * no valid proof on a write (or a private read) → 403. Private decks
 * still 404-vs-403 distinguishably — acceptable for now: public_ids are
 * unguessable and P1.7 revisits read semantics with share pages.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/auth";
import { canReadDeck, deckTokenFrom, isDeckOwner } from "@/lib/decks/access";
import type { DeckRow } from "@/lib/decks/serialize";

const UUID = z.uuid();

export async function loadDeck(id: string): Promise<DeckRow | null> {
  if (!UUID.safeParse(id).success) return null;
  const db = getDb();
  const [deck] = await db.select().from(schema.decks).where(eq(schema.decks.id, id)).limit(1);
  return deck ?? null;
}

/** Share-page lookup (P1.7): decks.public_id is the unguessable URL slug. */
export async function loadDeckByPublicId(publicId: string): Promise<DeckRow | null> {
  // Cheap shape check before the query — slugs are short lowercase tokens
  // (public-id.ts); anything else can't match and skips the roundtrip.
  if (!/^[a-z0-9_]{4,32}$/.test(publicId)) return null;
  const db = getDb();
  const [deck] = await db
    .select()
    .from(schema.decks)
    .where(eq(schema.decks.publicId, publicId))
    .limit(1);
  return deck ?? null;
}

type DeckContext = { deck: DeckRow; isOwner: boolean };

export async function requireReadableDeck(
  headers: Headers,
  id: string,
): Promise<DeckContext | NextResponse> {
  const deck = await loadDeck(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  const token = deckTokenFrom(headers);
  const userId = await getSessionUserId(headers);
  if (!canReadDeck(deck, token, userId)) {
    return NextResponse.json({ error: "This deck is private" }, { status: 403 });
  }
  return { deck, isOwner: isDeckOwner(deck, token, userId) };
}

export async function requireOwnedDeck(
  headers: Headers,
  id: string,
): Promise<DeckContext | NextResponse> {
  const deck = await loadDeck(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  if (!isDeckOwner(deck, deckTokenFrom(headers), await getSessionUserId(headers))) {
    return NextResponse.json({ error: "You don't have edit access to this deck" }, { status: 403 });
  }
  return { deck, isOwner: true };
}
