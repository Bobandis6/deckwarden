/**
 * Precon reads (W8b, WAVE2.md D7): the queries behind /precons, the share
 * page's product chrome and GET /api/precons/[slug]. Everything here is
 * public product data — kind='precon' rows are ownerless official lists
 * (W8a), so no caller ever passes viewer state.
 *
 * Lookup key decision (W8b): the URL-facing key is the SLUG
 * (`precon_products.slug`, e.g. `breed_lethality_c16`) — it already names
 * the deck publicly as `public_id = 'p_' + slug`, it fits the public-id
 * grammar, and it keeps every precon URL lowercase. The MTGJSON fileName
 * `code` stays the ingest's upsert key only; passing it to the API 404s
 * (PRECON_SLUG_RE rejects its uppercase — pinned in precon-info.test.ts).
 */
import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { PRECON_SLUG_RE, type PreconInfo } from "@/lib/decks/precon-info";
import type { DeckRow } from "@/lib/decks/serialize";

const { cardIdentities, cardPrintings, deckCards, decks, preconProducts, sets } = schema;

/** MTGJSON set codes are uppercase, Scryfall's stored codes lowercase — join case-blind. */
const setNameJoin = and(
  sql`lower(${sets.code}) = lower(${preconProducts.setCode})`,
  eq(sets.gameId, GAME_ID.mtg),
);

const preconInfoSelect = {
  slug: preconProducts.slug,
  code: preconProducts.code,
  setCode: preconProducts.setCode,
  setName: sets.name,
  releaseDate: preconProducts.releaseDate,
  productName: preconProducts.productName,
};

function toPreconInfo(row: {
  slug: string;
  code: string;
  setCode: string;
  setName: string | null;
  releaseDate: string | null;
  productName: string;
}): PreconInfo {
  return {
    slug: row.slug,
    code: row.code,
    setCode: row.setCode,
    setName: row.setName ?? row.setCode,
    releaseDate: row.releaseDate,
    productName: row.productName,
  };
}

/** The share page's join: product metadata for a deck row, null for user decks. */
export async function loadPreconByDeckId(deckId: string): Promise<PreconInfo | null> {
  const [row] = await getDb()
    .select(preconInfoSelect)
    .from(preconProducts)
    .leftJoin(sets, setNameJoin)
    .where(eq(preconProducts.deckId, deckId))
    .limit(1);
  return row ? toPreconInfo(row) : null;
}

/**
 * The API lookup: slug → the precon's deck row + product info. Precon rows
 * only by construction — the query starts from precon_products, so a user
 * deck's id or publicId can never resolve here.
 */
export async function loadPreconBySlug(
  slug: string,
): Promise<{ deck: DeckRow; precon: PreconInfo } | null> {
  if (!PRECON_SLUG_RE.test(slug)) return null;
  const [row] = await getDb()
    .select({ deck: decks, info: preconInfoSelect })
    .from(preconProducts)
    .innerJoin(decks, eq(decks.id, preconProducts.deckId))
    .leftJoin(sets, setNameJoin)
    .where(eq(preconProducts.slug, slug))
    .limit(1);
  return row ? { deck: row.deck, precon: toPreconInfo(row.info) } : null;
}

/** One /precons index row: the tile fields plus the product metadata the filters need. */
export interface PreconIndexRow {
  publicId: string;
  name: string;
  ciMask: number;
  leaderIds: string[];
  slug: string;
  setCode: string;
  setName: string;
  releaseDate: string | null;
  printingId: string | null;
  imageOverride: unknown;
  /** Cheapest-printing sum across the list, null when no card has a price. */
  estUsd: number | null;
}

/**
 * Every precon for the static index (~181 rows, once per ISR revalidate):
 * the deck + product join with the first leader's default printing aboard,
 * a second aggregate for the est. price (cheapest current printings — the
 * same `cheapest_usd` the share page sums; SUM skips null-priced cards, so
 * the figure is honest-approximate and rendered with ≈), and a third for
 * the leader names the search filter matches against.
 */
export async function loadPreconIndex(): Promise<{
  rows: PreconIndexRow[];
  leaderNames: Map<string, string>;
}> {
  const db = getDb();
  const [rows, prices] = await Promise.all([
    db
      .select({
        id: decks.id,
        publicId: decks.publicId,
        name: decks.name,
        ciMask: decks.ciMask,
        leaderIds: decks.leaderIds,
        slug: preconProducts.slug,
        setCode: preconProducts.setCode,
        setName: sets.name,
        releaseDate: preconProducts.releaseDate,
        printingId: cardPrintings.id,
        imageOverride: cardPrintings.imageOverride,
      })
      .from(decks)
      .innerJoin(preconProducts, eq(preconProducts.deckId, decks.id))
      .leftJoin(sets, setNameJoin)
      .leftJoin(
        cardPrintings,
        sql`${cardPrintings.cardIdentityId} = ${decks.leaderIds}[1] AND ${cardPrintings.isDefault}`,
      )
      .where(eq(decks.kind, "precon"))
      .orderBy(sql`${preconProducts.releaseDate} desc nulls last`, preconProducts.slug),
    db
      .select({
        deckId: deckCards.deckId,
        estUsd: sql<string | null>`sum(${deckCards.quantity} * ${cardIdentities.cheapestUsd})`,
      })
      .from(deckCards)
      .innerJoin(decks, and(eq(decks.id, deckCards.deckId), eq(decks.kind, "precon")))
      .innerJoin(cardIdentities, eq(cardIdentities.id, deckCards.cardIdentityId))
      .groupBy(deckCards.deckId),
  ]);
  const priceByDeck = new Map(prices.map((p) => [p.deckId, p.estUsd]));
  const leaderIds = [...new Set(rows.flatMap((r) => r.leaderIds ?? []))];
  const leaders =
    leaderIds.length > 0
      ? await db
          .select({ id: cardIdentities.id, name: cardIdentities.name })
          .from(cardIdentities)
          .where(sql`${cardIdentities.id} = ANY(ARRAY[${sql.join(leaderIds, sql`, `)}]::uuid[])`)
      : [];
  return {
    rows: rows.map((r) => {
      const est = priceByDeck.get(r.id);
      return {
        publicId: r.publicId,
        name: r.name,
        ciMask: r.ciMask,
        leaderIds: r.leaderIds ?? [],
        slug: r.slug,
        setCode: r.setCode,
        setName: r.setName ?? r.setCode,
        releaseDate: r.releaseDate,
        printingId: r.printingId,
        imageOverride: r.imageOverride,
        estUsd: est === null || est === undefined ? null : Number(est),
      };
    }),
    leaderNames: new Map(leaders.map((l) => [l.id, l.name])),
  };
}
