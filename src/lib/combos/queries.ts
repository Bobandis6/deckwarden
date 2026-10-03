/**
 * Combo data access (P2.5). Deliberately game-agnostic: combos reach cards
 * through combo_pieces → card_identities, so "combos using this card" works
 * for any game that ever grows a combo source (today: MTG, from Commander
 * Spellbook). Read-only card data with no per-viewer state — the pages that
 * render this stay ISR-cacheable.
 *
 * Ordering is Spellbook popularity (EDHREC deck count) DESC — an honest
 * zero-corpus signal, same spirit as the hub staples' edhrec_rank.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema, type DbExecutor } from "@/db";
import type { CompleteCombo } from "@/lib/games/types";

const { combos, comboPieces, cardIdentities, deckCards } = schema;

export interface ComboPieceRef {
  id: string;
  name: string;
  /** The identity's external key — resolve's pass 0 hydrates pieces by it (W9c). */
  externalKey: string;
}

export interface ComboView {
  id: number;
  /** Spellbook variant id — powers the commanderspellbook.com deep link. */
  externalKey: string;
  results: string[];
  templates: string[];
  popularity: number | null;
  /** All card pieces (anchor included), name order. */
  pieces: ComboPieceRef[];
}

export const COMBOS_SHOWN = 10;

/**
 * The most-played combos using one card, plus the honest total. With
 * `fitCiMask` (hub pages), only combos playable inside that color identity
 * are counted — a Kiki+Pestermite line is no advice for a mono-red deck.
 */
export async function loadCombosForCard(
  cardIdentityId: string,
  opts: { fitCiMask?: number; limit?: number } = {},
): Promise<{ total: number; combos: ComboView[] }> {
  const db = getDb();
  const limit = opts.limit ?? COMBOS_SHOWN;

  const conditions = [eq(comboPieces.cardIdentityId, cardIdentityId)];
  if (opts.fitCiMask !== undefined) {
    // ::int disambiguates ~ (bitwise NOT) from ~ (regex) on the untyped param.
    conditions.push(sql`(${combos.ciMask} & ~${opts.fitCiMask}::int) = 0`);
  }

  const top = await db
    .select({
      id: combos.id,
      externalKey: combos.externalKey,
      results: combos.results,
      templates: combos.templates,
      popularity: combos.popularity,
      total: sql<number>`count(*) over ()::int`,
    })
    .from(combos)
    .innerJoin(comboPieces, eq(comboPieces.comboId, combos.id))
    .where(and(...conditions))
    .orderBy(sql`${combos.popularity} DESC NULLS LAST`, combos.id)
    .limit(limit);

  if (top.length === 0) return { total: 0, combos: [] };

  const pieceRows = await db
    .select({
      comboId: comboPieces.comboId,
      id: cardIdentities.id,
      name: cardIdentities.name,
      externalKey: cardIdentities.externalKey,
    })
    .from(comboPieces)
    .innerJoin(cardIdentities, eq(cardIdentities.id, comboPieces.cardIdentityId))
    .where(
      inArray(
        comboPieces.comboId,
        top.map((c) => c.id),
      ),
    )
    .orderBy(cardIdentities.name);

  const piecesByCombo = new Map<number, ComboPieceRef[]>();
  for (const row of pieceRows) {
    const list = piecesByCombo.get(row.comboId) ?? [];
    list.push({ id: row.id, name: row.name, externalKey: row.externalKey });
    piecesByCombo.set(row.comboId, list);
  }

  return {
    total: top[0].total,
    combos: top.map((c) => ({
      id: c.id,
      externalKey: c.externalKey,
      results: c.results,
      templates: c.templates,
      popularity: c.popularity,
      pieces: piecesByCombo.get(c.id) ?? [],
    })),
  };
}

/**
 * One combo by its Spellbook variant key (X3, GET /api/combos/[key] — the
 * hub door's draft seed). ONE statement: the external_key UNIQUE index is
 * a single probe, then the combo's piece rows by primary key; pieces come
 * back in name order like every ComboView. null for an unknown key — the
 * nightly hard-deletes combos that leave the export, so an hour-old ISR
 * hub can link a key that is gone — and for a combo holding a removed
 * piece: resolve refuses removed cards, so no deck could be seeded with it
 * (0 such combos on 2026-09-28).
 */
export async function loadComboByKey(externalKey: string): Promise<ComboView | null> {
  const rows = await getDb()
    .select({
      id: combos.id,
      externalKey: combos.externalKey,
      results: combos.results,
      templates: combos.templates,
      popularity: combos.popularity,
      pieceId: cardIdentities.id,
      pieceName: cardIdentities.name,
      pieceKey: cardIdentities.externalKey,
      pieceRemoved: cardIdentities.isRemoved,
    })
    .from(combos)
    .innerJoin(comboPieces, eq(comboPieces.comboId, combos.id))
    .innerJoin(cardIdentities, eq(cardIdentities.id, comboPieces.cardIdentityId))
    .where(eq(combos.externalKey, externalKey))
    .orderBy(cardIdentities.name);

  const [first] = rows;
  if (!first || rows.some((r) => r.pieceRemoved)) return null;
  return {
    id: first.id,
    externalKey: first.externalKey,
    results: first.results,
    templates: first.templates,
    popularity: first.popularity,
    pieces: rows.map((r) => ({ id: r.pieceId, name: r.pieceName, externalKey: r.pieceKey })),
  };
}

// ---------------------------------------------------------------------------
// Deck-relative detection (P3.3) — THE shared query layer for "what combos
// does this deck have / nearly have". The recommendation engine's one-away
// signal (recommend/queries.ts loadComboSignals) is a pivot over this same
// function — one SQL shape, never a second engine.
// ---------------------------------------------------------------------------

/** A combo relative to a deck: pieces split into held and missing. */
export interface DeckComboView {
  id: number;
  /** Spellbook variant id — powers the external walkthrough deep link. */
  externalKey: string;
  results: string[];
  /**
   * Named template requirements ("A creature with power 5+"). Cards alone
   * never complete a combo that has these — classification/rendering must
   * say "also needs …" (deckComboStatus in ./view.ts enforces it).
   */
  templates: string[];
  popularity: number | null;
  /** Deck cards supplying pieces (name order). */
  inDeckPieces: ComboPieceRef[];
  /** Empty = every card piece is in deck; one entry = one card away. */
  missingPieces: ComboPieceRef[];
}

/**
 * Most combos considered per detection request. Popularity-ordered, so what
 * the cap ever drops is the unranked/least-played tail — combo-dense decks
 * lose the least meaningful lines first, never silently the best ones. The
 * Radar discloses when the cap was hit (`truncated`).
 */
export const COMBO_SCAN_LIMIT = 200;

/**
 * Combos the deck holds all card pieces of (`includeComplete`) or is exactly
 * one card short of, color-fit to the deck. Entry is through
 * combo_pieces_by_card on the deck's cards (the P2.5 index contract) — never
 * a full combos scan: one aggregate over the deck's piece rows, one piece
 * fetch for the matches. `truncated` = the scan cap was reached, so more
 * matches may exist beyond the `limit` most-played.
 */
export async function loadCombosNearDeck(
  deckCardIds: readonly string[],
  deckCiMask: number,
  opts: { includeComplete: boolean; limit?: number },
): Promise<{ combos: DeckComboView[]; truncated: boolean }> {
  if (deckCardIds.length === 0) return { combos: [], truncated: false };
  const db = getDb();
  const deckIds = [...deckCardIds];
  const limit = opts.limit ?? COMBO_SCAN_LIMIT;

  const matched = db
    .select({ comboId: comboPieces.comboId })
    .from(comboPieces)
    .innerJoin(combos, eq(combos.id, comboPieces.comboId))
    .where(inArray(comboPieces.cardIdentityId, deckIds))
    .groupBy(comboPieces.comboId, combos.pieceCount)
    .having(
      opts.includeComplete
        ? sql`count(*) >= ${combos.pieceCount} - 1`
        : sql`count(*) = ${combos.pieceCount} - 1`,
    );

  const comboRows = await db
    .select({
      id: combos.id,
      externalKey: combos.externalKey,
      results: combos.results,
      templates: combos.templates,
      popularity: combos.popularity,
    })
    .from(combos)
    // ::int disambiguates ~ (bitwise NOT) from ~ (regex) on the untyped param.
    .where(and(inArray(combos.id, matched), sql`(${combos.ciMask} & ~${deckCiMask}::int) = 0`))
    .orderBy(sql`${combos.popularity} DESC NULLS LAST`, combos.id)
    .limit(limit);
  if (comboRows.length === 0) return { combos: [], truncated: false };

  const pieceRows = await db
    .select({
      comboId: comboPieces.comboId,
      id: cardIdentities.id,
      name: cardIdentities.name,
      externalKey: cardIdentities.externalKey,
    })
    .from(comboPieces)
    .innerJoin(cardIdentities, eq(cardIdentities.id, comboPieces.cardIdentityId))
    .where(
      inArray(
        comboPieces.comboId,
        comboRows.map((c) => c.id),
      ),
    )
    .orderBy(cardIdentities.name);

  const piecesByCombo = new Map<number, ComboPieceRef[]>();
  for (const row of pieceRows) {
    const list = piecesByCombo.get(row.comboId) ?? [];
    list.push({ id: row.id, name: row.name, externalKey: row.externalKey });
    piecesByCombo.set(row.comboId, list);
  }

  const inDeck = new Set(deckIds);
  const views: DeckComboView[] = [];
  for (const combo of comboRows) {
    const pieces = piecesByCombo.get(combo.id) ?? [];
    const missing = pieces.filter((p) => !inDeck.has(p.id));
    // Defensive: the SQL guarantees ≤1 missing; >1 only from a re-ingest
    // racing between the two queries — drop rather than misreport.
    if (missing.length > 1) continue;
    views.push({
      id: combo.id,
      externalKey: combo.externalKey,
      results: combo.results,
      templates: combo.templates,
      popularity: combo.popularity,
      inDeckPieces: pieces.filter((p) => inDeck.has(p.id)),
      missingPieces: missing,
    });
  }
  return { combos: views, truncated: comboRows.length === limit };
}

/**
 * The list's complete combos — the bracket read's combo facts (Y3b, WAVE4
 * D4): every combo whose card pieces are ALL in `cardIds`, templates
 * included (the read decides what an open template means). Uncapped, and ONE
 * statement: the list's piece rows (entered through combo_pieces_by_card,
 * the P2.5 contract) are grouped per combo first — narrow rows, so the sort
 * stays small — and a group joins its combo only when it holds all
 * piece_count pieces, so its array_agg IS the combo's full piece list and
 * nothing is fetched twice. Measured 2026-10-02: 25 ms on the server for
 * the heaviest precon (5,417 piece rows → 4 combos); 101 ms for the 100
 * most combo-dense identities (71,277 piece rows → 445 combos), where
 * joining first took 197 ms and spilled ~20 MB to disk. No identity
 * filter: a combo's stored identity is exactly its pieces' union (0
 * exceptions over all 66,881 combos), so a complete combo always fits the
 * list and the answer depends on the id set alone (Y4a's GET keys on it).
 * Ordered by popularity, like every combo list. Its bound is the list
 * itself: only combos made of cards in it.
 */
export async function loadCompleteCombos(
  cardIds: readonly string[],
  db: DbExecutor = getDb(),
): Promise<CompleteCombo[]> {
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return [];
  const held = db
    .select({
      comboId: comboPieces.comboId,
      count: sql<number>`count(*)`.as("held_count"),
      cardPieces: sql<
        string[]
      >`array_agg(${comboPieces.cardIdentityId}::text ORDER BY ${comboPieces.cardIdentityId})`.as(
        "card_pieces",
      ),
    })
    .from(comboPieces)
    .where(inArray(comboPieces.cardIdentityId, ids))
    .groupBy(comboPieces.comboId)
    .as("held");
  return db
    .select({
      key: combos.externalKey,
      cardPieces: held.cardPieces,
      templates: combos.templates,
      tag: combos.bracketTag,
      relevant: combos.relevant,
      results: combos.results,
      popularity: combos.popularity,
    })
    .from(held)
    .innerJoin(combos, and(eq(combos.id, held.comboId), eq(combos.pieceCount, held.count)))
    .orderBy(sql`${combos.popularity} DESC NULLS LAST`, combos.id);
}

/** The deck's distinct card identities (all zones) — detection input. */
export async function loadDeckCardIds(deckId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ id: deckCards.cardIdentityId })
    .from(deckCards)
    .where(eq(deckCards.deckId, deckId));
  return rows.map((r) => r.id);
}
