/**
 * Precon reads (W8b, WAVE2.md D7): the queries behind /precons, the share
 * page's product chrome and GET /api/precons/[slug]. Everything here is
 * public product data — kind='precon' rows are ownerless official lists
 * (W8a), so no caller ever passes viewer state. PRECON-OWNED adds the
 * deck API's two: the create resolves `fromPrecon` through
 * loadPreconBySlug, and the owner's GET reads the precon a deck started
 * from through loadDeckPrecon (the route decides it is the owner's alone).
 *
 * Lookup key decision (W8b): the URL-facing key is the SLUG
 * (`precon_products.slug`, e.g. `breed_lethality_c16`) — it already names
 * the deck publicly as `public_id = 'p_' + slug`, it fits the public-id
 * grammar, and it keeps every precon URL lowercase. The MTGJSON fileName
 * `code` stays the ingest's upsert key only; passing it to the API 404s
 * (PRECON_SLUG_RE rejects its uppercase — pinned in precon-info.test.ts).
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema, type DbExecutor } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { loadBracketFreshness } from "@/lib/brackets/freshness";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { PRECON_SLUG_RE, type PreconInfo } from "@/lib/decks/precon-info";
import { preconCards, type DeckPrecon } from "@/lib/decks/precon-owned";
import type { DeckRow } from "@/lib/decks/serialize";
import type {
  BracketFreshness,
  CompleteCombo,
  FormatDef,
  GameAdapter,
  LegalityEntry,
} from "@/lib/games/types";
import { flagsColumn } from "@/lib/recommend/queries";

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

/**
 * The owner's precon read (PRECON-OWNED): the precon a deck started from
 * (`decks.precon_deck_id`) as GET /api/decks/[id] hands it to the owner,
 * minus the answer, which is the deck row's own. ONE statement, indexed
 * both ways: precon_products by its primary key, its deck_cards by theirs
 * (deck_id leads it), only the format's counted zones. Null when the
 * product is gone.
 */
export async function loadDeckPrecon(
  preconDeckId: string,
  format: Pick<FormatDef, "zones">,
  db: DbExecutor = getDb(),
): Promise<Omit<DeckPrecon, "owns"> | null> {
  const counted = format.zones.filter((z) => z.countsTowardSize).map((z) => z.id);
  const rows = await db
    .select({
      slug: preconProducts.slug,
      name: preconProducts.productName,
      cardId: deckCards.cardIdentityId,
      zone: deckCards.zone,
      qty: deckCards.quantity,
    })
    .from(preconProducts)
    .leftJoin(
      deckCards,
      and(eq(deckCards.deckId, preconProducts.deckId), inArray(deckCards.zone, counted)),
    )
    .where(eq(preconProducts.deckId, preconDeckId));
  const [first] = rows;
  if (!first) return null;
  return {
    slug: first.slug,
    name: first.name,
    cards: preconCards(
      rows.flatMap((r) =>
        r.cardId !== null && r.zone !== null && r.qty !== null
          ? [{ cardId: r.cardId, zone: r.zone, qty: r.qty }]
          : [],
      ),
      format,
    ),
  };
}

/** One /precons index row: the tile fields plus the product metadata the filters need. */
export interface PreconIndexRow {
  /** The deck's id: the bracket facts' key (loadPreconBracketFacts). */
  id: string;
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
        id: r.id,
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

/** What loadPreconBracketFacts answers: the share page's bracket facts for every precon. */
export interface PreconBracketFacts {
  /** Each precon's list, by deck id. */
  entries: Map<string, EditorEntry[]>;
  /** Every card in any precon, as the read takes it. */
  cards: Map<string, EditorCard>;
  /** Each precon's complete combos, by deck id; a list with none is absent. */
  combos: Map<string, CompleteCombo[]>;
  /** Null when the game declares no brackets. */
  freshness: BracketFreshness | null;
}

interface PreconCardRaw extends Record<string, unknown> {
  deck_id: string;
  card_id: string;
  zone: string;
  qty: number;
  name: string;
  external_key: string;
  primary_type: string | null;
  cost_value: number | null;
  colors_mask: number;
  ci_mask: number;
  is_leader_candidate: boolean;
  is_preview: boolean;
  popularity: number | null;
  flags: Record<string, unknown>;
  legality: LegalityEntry[];
}

interface PreconComboRaw extends Record<string, unknown> {
  deck_id: string;
  key: string;
  card_pieces: string[];
  templates: string[];
  tag: string | null;
  relevant: boolean | null;
  results: string[];
  popularity: number | null;
}

/**
 * The /precons bracket read's facts (LATER row 151, WAVE4 F): the share
 * page's facts for every precon at once — run at each build and daily
 * revalidate, never per tile. Three statements, whatever the count:
 *
 * - every precon entry with its card as the read takes it: the identity
 *   facts, the adapter's declared bracket flags (`brackets.flagPaths`, the
 *   recommend routes' column: `attrs` is never selected whole, and `assess`
 *   reads nothing else from it) and the card's legality exceptions for the
 *   deck's own format (fetchLegalityMap's current rows, as one jsonb array);
 * - every precon's complete combos: loadCompleteCombos' group-first shape
 *   over (deck, card) pairs, a group joining its combo only when it holds
 *   all piece_count pieces; the pieces of the complete ones alone are read
 *   back, sorted as loadCompleteCombos sorts them, and each list's combos
 *   come in its popularity order;
 * - the read's freshness (loadBracketFreshness).
 *
 * Measured 2026-10-17 over 182 precons (15,127 entries, 6,429 cards, 60
 * complete combos), EXPLAIN ANALYZE on the server: the cards ~71 ms and
 * the combos ~400 ms, neither spilling at Neon's 4 MB work_mem (the
 * combos' (id, piece_count) hash is 3.8 MB at 68,312 combos). The tile's
 * line and bands matched the share page's path on all 182.
 *
 * A failed load throws, like the index's own reads: a revalidate that
 * throws keeps the last good page.
 */
export async function loadPreconBracketFacts(
  adapter: GameAdapter,
  db: DbExecutor = getDb(),
): Promise<PreconBracketFacts> {
  const [cardRows, comboRows, freshness] = await Promise.all([
    // The precons' distinct cards first, flags computed there: joining the
    // whole card_identities hashed every row's attrs and spilled at 4 MB
    // work_mem. card_identities stays unaliased: flagsColumn names its table.
    db.execute<PreconCardRaw>(sql`
      WITH ci AS MATERIALIZED (
        SELECT card_identities.id, card_identities.name, card_identities.external_key,
          card_identities.primary_type, card_identities.cost_value,
          card_identities.colors_mask, card_identities.ci_mask,
          card_identities.is_leader_candidate, card_identities.is_preview,
          card_identities.popularity,
          ${flagsColumn(adapter.brackets?.flagPaths)} AS flags
        FROM card_identities
        WHERE card_identities.id IN (
          SELECT pc.card_identity_id FROM deck_cards pc
          JOIN decks pd ON pd.id = pc.deck_id AND pd.kind = 'precon'
        )
      )
      SELECT dc.deck_id, dc.card_identity_id AS card_id, dc.zone, dc.quantity AS qty,
        ci.name, ci.external_key, ci.primary_type, ci.cost_value, ci.colors_mask,
        ci.ci_mask, ci.is_leader_candidate, ci.is_preview, ci.popularity, ci.flags,
        coalesce((
          SELECT jsonb_agg(CASE WHEN l.condition IS NULL
              THEN jsonb_build_object('status', l.status)
              ELSE jsonb_build_object('status', l.status, 'condition', l.condition) END)
          FROM legalities l
          WHERE l.format_id = d.format_id AND l.card_identity_id = dc.card_identity_id
            AND l.effective_to IS NULL
        ), '[]'::jsonb) AS legality
      FROM deck_cards dc
      JOIN decks d ON d.id = dc.deck_id AND d.kind = 'precon'
      JOIN ci ON ci.id = dc.card_identity_id`),
    // The complete (deck, combo) pairs first, against combos' (id,
    // piece_count) alone; then each pair's combo row. Hashing the combos'
    // wide columns for every held group spilled at 4 MB work_mem.
    db.execute<PreconComboRaw>(sql`
      WITH held AS MATERIALIZED (
        SELECT h.deck_id, h.combo_id
        FROM (
          SELECT d.deck_id, cp.combo_id, count(*) AS held_count
          FROM (
            SELECT DISTINCT dc.deck_id, dc.card_identity_id
            FROM deck_cards dc
            JOIN decks dk ON dk.id = dc.deck_id AND dk.kind = 'precon'
          ) d
          JOIN combo_pieces cp ON cp.card_identity_id = d.card_identity_id
          GROUP BY d.deck_id, cp.combo_id
        ) h
        JOIN combos k ON k.id = h.combo_id AND k.piece_count = h.held_count
      )
      SELECT held.deck_id, c.external_key AS key,
        (SELECT array_agg(p.card_identity_id::text ORDER BY p.card_identity_id)
           FROM combo_pieces p WHERE p.combo_id = c.id) AS card_pieces,
        c.templates, c.bracket_tag AS tag, c.relevant, c.results, c.popularity
      FROM held
      JOIN combos c ON c.id = held.combo_id
      ORDER BY held.deck_id, c.popularity DESC NULLS LAST, c.id`),
    loadBracketFreshness(adapter, db),
  ]);

  const entries = new Map<string, EditorEntry[]>();
  const cards = new Map<string, EditorCard>();
  for (const r of cardRows) {
    const list = entries.get(r.deck_id);
    const entry: EditorEntry = { cardId: r.card_id, zone: r.zone, qty: r.qty, tags: [] };
    if (list) list.push(entry);
    else entries.set(r.deck_id, [entry]);
    if (cards.has(r.card_id)) continue;
    cards.set(r.card_id, {
      id: r.card_id,
      name: r.name,
      externalKey: r.external_key,
      primaryType: r.primary_type,
      costValue: r.cost_value,
      colorsMask: r.colors_mask,
      ciMask: r.ci_mask,
      isLeaderCandidate: r.is_leader_candidate,
      isPreview: r.is_preview,
      // Not the read's: the index sums its own prices, and tiles carry no card images.
      cheapestUsd: null,
      popularity: r.popularity,
      attrs: r.flags,
      legality: r.legality,
      image: null,
    });
  }
  const combos = new Map<string, CompleteCombo[]>();
  for (const r of comboRows) {
    const combo: CompleteCombo = {
      key: r.key,
      cardPieces: r.card_pieces,
      templates: r.templates,
      tag: r.tag,
      relevant: r.relevant,
      results: r.results,
      popularity: r.popularity,
    };
    const list = combos.get(r.deck_id);
    if (list) list.push(combo);
    else combos.set(r.deck_id, [combo]);
  }
  return { entries, cards, combos, freshness };
}
