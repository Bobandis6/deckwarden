/**
 * Lean reads for OG image rendering (P2.6). Deliberately not
 * fetchDeckCardsWire: the unfurl needs four columns, not legality maps and
 * printing images for 100 cards. Uses only promoted cross-game fields so
 * the renderer stays game-agnostic (convention: game logic in adapters —
 * curve semantics live in og/curve.ts, mirrored from analyze.ts).
 *
 * DECK-TOKENS: the card read leaves token identities out — a token can only
 * sit in a deck's Tokens zone (the save route's rule), so the count, the
 * price and the curve stay the playable list's without an adapter import.
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { notTokenSql } from "@/lib/cards/tokens-sql";
import { goalsTargetLevel } from "@/lib/decks/collections";
import { ogCurveBuckets } from "@/lib/og/curve";

const { decks, deckCards, cardIdentities } = schema;

export interface DeckOgData {
  name: string;
  visibility: "public" | "unlisted";
  /** The deck's game — kicker/curve-label vocabulary and the art posture (P4.6). */
  gameId: number;
  cardCount: number;
  priceUsd: number | null;
  curve: number[];
  /** Command-zone names in leader_ids order (2 = partners). */
  commanderNames: string[];
  /** First leader's identity id — the art the unfurl leads with. */
  commanderId: string | null;
  /**
   * The owner's declared target (Y5, decks.goals.targetLevel) — read off
   * the row, never computed; null = not set. The unfurl says "(declared)".
   */
  targetLevel: number | null;
}

/**
 * A private deck's read stops at the visibility row (S8, SECURITY-AUDIT-report.md
 * I9): the preview renders the generic image for it, so the card list and
 * the leader names are never fetched — nothing past the first statement.
 */
export type DeckOgRead = { visibility: "private" } | DeckOgData;

export async function loadDeckOgData(publicId: string): Promise<DeckOgRead | null> {
  if (!/^[a-z0-9_]{4,32}$/.test(publicId)) return null;
  const db = getDb();
  const [deck] = await db
    .select({
      id: decks.id,
      name: decks.name,
      visibility: decks.visibility,
      gameId: decks.gameId,
      leaderIds: decks.leaderIds,
      targetLevel: goalsTargetLevel,
    })
    .from(decks)
    .where(eq(decks.publicId, publicId))
    .limit(1);
  if (!deck) return null;
  if (deck.visibility === "private") return { visibility: "private" };

  const [cards, leaders] = await Promise.all([
    db
      .select({
        qty: deckCards.quantity,
        primaryType: cardIdentities.primaryType,
        costValue: cardIdentities.costValue,
        cheapestUsd: cardIdentities.cheapestUsd,
      })
      .from(deckCards)
      .innerJoin(cardIdentities, eq(cardIdentities.id, deckCards.cardIdentityId))
      .where(and(eq(deckCards.deckId, deck.id), notTokenSql(cardIdentities.attrs))),
    deck.leaderIds.length
      ? db
          .select({ id: cardIdentities.id, name: cardIdentities.name })
          .from(cardIdentities)
          .where(inArray(cardIdentities.id, deck.leaderIds))
      : Promise.resolve([]),
  ]);

  let cardCount = 0;
  let priceSum = 0;
  let priced = false;
  for (const c of cards) {
    cardCount += c.qty;
    if (c.cheapestUsd !== null) {
      priceSum += Number(c.cheapestUsd) * c.qty;
      priced = true;
    }
  }
  // Preserve command-zone order (partner pairs display in the order chosen).
  const byId = new Map(leaders.map((l) => [l.id, l.name]));
  const commanderNames = deck.leaderIds.flatMap((id) => byId.get(id) ?? []);

  return {
    name: deck.name,
    visibility: deck.visibility,
    gameId: deck.gameId,
    cardCount,
    priceUsd: priced ? priceSum : null,
    curve: ogCurveBuckets(cards),
    commanderNames,
    commanderId: deck.leaderIds[0] ?? null,
    targetLevel: deck.targetLevel,
  };
}

export interface CardOgData {
  id: string;
  name: string;
  /** Full type line when the game stores one; primaryType otherwise. */
  typeLine: string | null;
  isLeaderCandidate: boolean;
  gameId: number;
}

export async function loadCardOgData(id: string): Promise<CardOgData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      primaryType: cardIdentities.primaryType,
      isLeaderCandidate: cardIdentities.isLeaderCandidate,
      gameId: cardIdentities.gameId,
      attrs: cardIdentities.attrs,
    })
    .from(cardIdentities)
    .where(and(eq(cardIdentities.id, id), eq(cardIdentities.isRemoved, false)))
    .limit(1);
  if (!row) return null;
  const attrs = row.attrs as { type_line?: string };
  return {
    id: row.id,
    name: row.name,
    typeLine: attrs.type_line ?? row.primaryType,
    isLeaderCandidate: row.isLeaderCandidate,
    gameId: row.gameId,
  };
}

/** Default printing id for an identity — the art the OG image renders. */
export async function loadDefaultPrintingId(cardIdentityId: string): Promise<string | null> {
  const { cardPrintings } = schema;
  const [p] = await getDb()
    .select({ id: cardPrintings.id })
    .from(cardPrintings)
    .where(and(eq(cardPrintings.cardIdentityId, cardIdentityId), eq(cardPrintings.isDefault, true)))
    .limit(1);
  return p?.id ?? null;
}
