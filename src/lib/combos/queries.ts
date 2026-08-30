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

import { getDb, schema } from "@/db";

const { combos, comboPieces, cardIdentities } = schema;

export interface ComboPieceRef {
  id: string;
  name: string;
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
    list.push({ id: row.id, name: row.name });
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
