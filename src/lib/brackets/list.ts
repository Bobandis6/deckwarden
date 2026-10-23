/**
 * The cards on a game's named bracket list (BRACKETS-PAGE): Magic's Game
 * Changers as the nightly last flagged them, for the /brackets page. The
 * adapter declares the list (`brackets.guide.list`) and its attrs flag, read
 * by containment, `attrs @> '{"game_changer": true}'`, the one shape
 * ci_attrs_gin (jsonb_path_ops) serves (`attrs ? key` would scan); so core
 * never names the key. Each card with its default printing's `small`
 * rendition (a full card, never a crop: the artist and © line stay in the
 * pixels), in name order. Removed identities are left out; previews stay,
 * because the read counts a flagged card whatever its release.
 *
 * Caching intent: none here, callers decide (/brackets is ISR, revalidated
 * daily). ONE statement. A failed load throws: a revalidation that throws
 * keeps the last good page.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { getDb, schema, type DbExecutor } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { embeddablePrintingImageUrl, thumbnailUrl } from "@/lib/cards/images";
import type { GameAdapter } from "@/lib/games/types";

const { cardIdentities, cardPrintings } = schema;

/** An attrs key as adapters declare them (recommend/queries.ts' rule), checked before it reaches the document. */
const ATTRS_KEY_RE = /^[a-z0-9_]+$/;

export interface BracketListCard {
  /** The identity id: the card page is /cards/<id>. */
  id: string;
  name: string;
  /** The default printing's `small` rendition; null = no embeddable image (the name in a box). */
  image: string | null;
}

/** The list's cards; empty when the game declares no guide list. */
export async function loadBracketListCards(
  adapter: GameAdapter,
  db: DbExecutor = getDb(),
): Promise<BracketListCard[]> {
  const list = adapter.brackets?.guide?.list;
  if (!list) return [];
  const [key] = list.path;
  if (!ATTRS_KEY_RE.test(key)) throw new Error(`Invalid list path: ${key}`);
  const rows = await db
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      printingId: cardPrintings.id,
      imageOverride: cardPrintings.imageOverride,
    })
    .from(cardIdentities)
    .leftJoin(
      cardPrintings,
      and(eq(cardPrintings.cardIdentityId, cardIdentities.id), eq(cardPrintings.isDefault, true)),
    )
    .where(
      and(
        eq(cardIdentities.gameId, GAME_ID[adapter.id]),
        eq(cardIdentities.isRemoved, false),
        // A bound parameter, never sql.raw: the document is data.
        sql`${cardIdentities.attrs} @> ${JSON.stringify({ [key]: true })}::jsonb`,
      ),
    )
    .orderBy(asc(cardIdentities.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image: r.printingId
      ? thumbnailUrl(
          embeddablePrintingImageUrl(
            { id: r.printingId, imageOverride: r.imageOverride },
            "normal",
          ),
        )
      : null,
  }));
}
