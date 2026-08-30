/**
 * Lean reads for OG image rendering (P2.6). Deliberately not
 * fetchDeckCardsWire: the unfurl needs four columns, not legality maps and
 * printing images for 100 cards. Uses only promoted cross-game fields so
 * the renderer stays game-agnostic (convention: game logic in adapters —
 * curve semantics live in og/curve.ts, mirrored from analyze.ts).
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { ogCurveBuckets } from "@/lib/og/curve";

const { decks, deckCards, cardIdentities } = schema;

export interface DeckOgData {
  name: string;
  visibility: string;
  cardCount: number;
  priceUsd: number | null;
  curve: number[];
  /** Command-zone names in leader_ids order (2 = partners). */
  commanderNames: string[];
  /** First leader's identity id — the art the unfurl leads with. */
  commanderId: string | null;
}

export async function loadDeckOgData(publicId: string): Promise<DeckOgData | null> {
  if (!/^[a-z0-9_]{4,32}$/.test(publicId)) return null;
  const db = getDb();
  const [deck] = await db
    .select({
      id: decks.id,
      name: decks.name,
      visibility: decks.visibility,
      leaderIds: decks.leaderIds,
    })
    .from(decks)
    .where(eq(decks.publicId, publicId))
    .limit(1);
  if (!deck) return null;

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
      .where(eq(deckCards.deckId, deck.id)),
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
    cardCount,
    priceUsd: priced ? priceSum : null,
    curve: ogCurveBuckets(cards),
    commanderNames,
    commanderId: deck.leaderIds[0] ?? null,
  };
}

export interface CardOgData {
  id: string;
  name: string;
  /** Full type line when the game stores one; primaryType otherwise. */
  typeLine: string | null;
  isLeaderCandidate: boolean;
}

export async function loadCardOgData(id: string): Promise<CardOgData | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      primaryType: cardIdentities.primaryType,
      isLeaderCandidate: cardIdentities.isLeaderCandidate,
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
