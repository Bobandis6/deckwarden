/**
 * The auth middleware for deck routes (P1.1): load the deck row, resolve both
 * ownership proofs — the `x-deck-token` header (guest decks) and the Better
 * Auth session (claimed decks, P2.1) — and gate the handler. Handlers get
 * back either the context they need or a ready-made error response.
 *
 * Status contract (locked by the smoke tests): unknown/invalid id → 404; no
 * valid proof on a write to a public or unlisted deck → 403. A PRIVATE deck a
 * caller cannot read or edit answers exactly what an unknown id answers — the
 * same no-store 404 "Deck not found" — on every gate in this file (the
 * 2026-10-30 security audit's deck-oracle record). S6 settled that contract
 * on the share page by public id ("the link no longer says the deck
 * exists"), and a deck's uuid is public while the deck is readable
 * (deckMetaJson, the share page's client props, the editor URL), so a uuid
 * kept from then must not tell "made private" from "deleted" either. Both
 * proofs resolve whether or not a row was found, so the two answers do
 * comparable work. The folder gate keeps the same rule: a private folder is
 * the unknown id's 404 for every session but its owner's, as its share page
 * is since the same audit.
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { noStoreJson } from "@/lib/api/json";
import { getSessionUserId } from "@/lib/auth";
import { canReadDeck, clientIp, deckTokenFrom, isDeckOwner } from "@/lib/decks/access";
import { isFolderOwner, loadFolder, type FolderRow } from "@/lib/decks/folders";
import type { DeckRow } from "@/lib/decks/serialize";
import { findAdapter } from "@/lib/games/registry";
import type { FormatDef, GameAdapter, JournalMeta } from "@/lib/games/types";
import { JOURNAL_COPY } from "@/lib/journal/copy";
import { enforceRateLimit, type GatedWriteLimits, type RateLimit } from "@/lib/rate-limit";

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

/** `userId` is the session the gate resolved (S8, I3): handlers reuse it instead of reading the session twice. */
type DeckContext = { deck: DeckRow; isOwner: boolean; userId: string | null };

/** The one answer for an unknown id and for a private deck the caller may not reach (the docblock). */
const deckNotFound = () => noStoreJson({ error: "Deck not found" }, { status: 404 });
const folderNotFound = () => noStoreJson({ error: "Folder not found" }, { status: 404 });

export async function requireReadableDeck(
  headers: Headers,
  id: string,
): Promise<DeckContext | NextResponse> {
  const deck = await loadDeck(id);
  const token = deckTokenFrom(headers);
  const userId = await getSessionUserId(headers);
  if (!deck || !canReadDeck(deck, token, userId)) return deckNotFound();
  return { deck, isOwner: isDeckOwner(deck, token, userId), userId };
}

/**
 * `authoritative` (S3) reads the session from the database instead of the
 * 5-minute cookie cache — for the deck DELETE, so a session revoked elsewhere
 * cannot act within the cache window. The guest token path is unchanged.
 */
export async function requireOwnedDeck(
  headers: Headers,
  id: string,
  opts: { authoritative?: boolean } = {},
): Promise<DeckContext | NextResponse> {
  const deck = await loadDeck(id);
  const userId = await getSessionUserId(headers, opts);
  if (!deck) return deckNotFound();
  if (!isDeckOwner(deck, deckTokenFrom(headers), userId)) {
    // A private deck's existence is the secret S6 keeps: the unknown id's answer.
    if (deck.visibility === "private") return deckNotFound();
    return NextResponse.json({ error: "You don't have edit access to this deck" }, { status: 403 });
  }
  return { deck, isOwner: true, userId };
}

/**
 * The owner-write gate with its limiter in the audit's order (S4,
 * SECURITY-AUDIT-report.md M1): a 404 for an id that cannot be a deck
 * before any counter is touched; the caller's IP bucket (a stranger's
 * hammering is bounded by their own address, 403s included); the ownership
 * proof (404 / 403); and only then the per-deck bucket, which the deck's
 * owner alone can reach. Before S4 the routes consumed both buckets before
 * `requireOwnedDeck`, so anyone holding a deck's uuid — public in every deck
 * JSON and share page — could spend the owner's per-deck allowance with
 * tokenless 403s and lock the editor out of saving (120 a minute did it),
 * and a non-uuid id minted a counter row per string. Every bucket still runs
 * before the body is read, so malformed spam consumes quota too (P1.8).
 */
export async function requireOwnedDeckWrite(
  headers: Headers,
  id: string,
  limits: GatedWriteLimits,
  opts: { authoritative?: boolean } = {},
): Promise<DeckContext | NextResponse> {
  if (!UUID.safeParse(id).success) return deckNotFound();
  const limited = await enforceRateLimit(limits.ip(clientIp(headers)));
  if (limited) return limited;
  const access = await requireOwnedDeck(headers, id, opts);
  if (access instanceof NextResponse) return access;
  // The row's id, not the URL's: one bucket per deck whatever the id's case.
  const deckLimited = await enforceRateLimit(limits.resource(access.deck.id));
  if (deckLimited) return deckLimited;
  return access;
}

/**
 * Engagement gate (P2.3): likes/bookmarks are session actions on any deck
 * the viewer can read. 401 signed out — that's the UI's "sign in to like"
 * path — then the read contract: the one 404 for an unknown id and for a
 * private deck this viewer can't read. The guest token still counts toward
 * readability, so a signed-in holder of an unclaimed private deck's token
 * can engage with it.
 */
export async function requireEngageableDeck(
  headers: Headers,
  id: string,
): Promise<{ deck: DeckRow; userId: string } | NextResponse> {
  const userId = await getSessionUserId(headers);
  if (!userId) {
    return NextResponse.json({ error: "Sign in to do that" }, { status: 401 });
  }
  const deck = await loadDeck(id);
  if (!deck || !canReadDeck(deck, deckTokenFrom(headers), userId)) return deckNotFound();
  return { deck, userId };
}

/**
 * The journal gate (Y9a, WAVE4 D10), in the contract's order: session (401)
 * → the per-user bucket → the deck (404) and its owner (403, or the same 404
 * when the deck is private: the docblock's contract) → a guest deck
 * answers 400 "Sign in to keep a game journal" (the folderId precedent: a
 * signed-in holder of an unclaimed deck's key claims it by signing in on
 * /account) → a game without a journal declaration, 400. The journal is
 * account-only: games are rows per person, and the anon purge keys on
 * updated_at, which a logged game never moves.
 */
export async function requireJournalDeck(
  headers: Headers,
  id: string,
  limits: (userId: string) => RateLimit[],
): Promise<{ deck: DeckRow; userId: string; journal: JournalMeta } | NextResponse> {
  const userId = await getSessionUserId(headers);
  if (!userId) {
    return noStoreJson({ error: JOURNAL_COPY.signIn }, { status: 401 });
  }
  const limited = await enforceRateLimit(limits(userId));
  if (limited) return limited;
  const deck = await loadDeck(id);
  if (!deck) return deckNotFound();
  if (!isDeckOwner(deck, deckTokenFrom(headers), userId)) {
    if (deck.visibility === "private") return deckNotFound();
    return noStoreJson({ error: "You don't have edit access to this deck" }, { status: 403 });
  }
  if (deck.userId === null) {
    return noStoreJson({ error: JOURNAL_COPY.signIn }, { status: 400 });
  }
  const journal = deckFormat(deck)?.adapter.journal;
  if (!journal) {
    return noStoreJson({ error: "This game has no game journal" }, { status: 400 });
  }
  return { deck, userId, journal };
}

/**
 * Folder twin of requireOwnedDeck (P2.2); session is the only proof. Same
 * status contract: unknown/invalid id → 404, not the owner → 403 — and a
 * private folder the unknown id's 404, the answer its share page gives.
 */
export async function requireOwnedFolder(
  headers: Headers,
  id: string,
): Promise<{ folder: FolderRow } | NextResponse> {
  const folder = await loadFolder(id);
  const userId = await getSessionUserId(headers);
  if (!folder) return folderNotFound();
  if (!isFolderOwner(folder, userId)) {
    if (folder.visibility === "private") return folderNotFound();
    return NextResponse.json({ error: "This folder isn't yours" }, { status: 403 });
  }
  return { folder };
}

/** requireOwnedDeckWrite's folder twin (S4, M1): the same order, the session as the only proof. */
export async function requireOwnedFolderWrite(
  headers: Headers,
  id: string,
  limits: GatedWriteLimits,
): Promise<{ folder: FolderRow } | NextResponse> {
  if (!UUID.safeParse(id).success) return folderNotFound();
  const limited = await enforceRateLimit(limits.ip(clientIp(headers)));
  if (limited) return limited;
  const access = await requireOwnedFolder(headers, id);
  if (access instanceof NextResponse) return access;
  const folderLimited = await enforceRateLimit(limits.resource(access.folder.id));
  if (folderLimited) return folderLimited;
  return access;
}

/**
 * A deck row's adapter + FormatDef (the core <-> adapter seam every card
 * writer needs). Undefined for a row whose seeded game/format has no
 * adapter (azuki is seeded without one) — which routes surface as a 500.
 */
export function deckFormat(deck: {
  gameId: number;
  formatId: number;
}): { adapter: GameAdapter; format: FormatDef } | undefined {
  const adapter = findAdapter(gameCodeById(deck.gameId));
  const formatCode = findFormatById(deck.formatId)?.code;
  const format = adapter?.formats.find((f) => f.code === formatCode);
  return adapter && format ? { adapter, format } : undefined;
}
