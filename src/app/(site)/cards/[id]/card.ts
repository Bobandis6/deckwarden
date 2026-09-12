/**
 * The card page's one lookup (P2.6, extracted in R6): React `cache` dedupes
 * it across the segment layout (the 404 gate above the loading boundary),
 * generateMetadata and the page within a request. The queries are P2.6's,
 * moved verbatim.
 */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { getDb, schema } from "@/db";

const { cardIdentities, cardPrintings, sets, formats, legalities } = schema;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadCard(id: string) {
  if (!UUID_RE.test(id)) return null;
  const db = getDb();
  const [identity] = await db.select().from(cardIdentities).where(eq(cardIdentities.id, id));
  if (!identity) return null;

  const [printings, formatRows, legalityRows] = await Promise.all([
    db
      .select({
        id: cardPrintings.id,
        setCode: sets.code,
        setName: sets.name,
        collectorNumber: cardPrintings.collectorNumber,
        rarity: cardPrintings.rarity,
        releasedAt: cardPrintings.releasedAt,
        isDefault: cardPrintings.isDefault,
        prices: cardPrintings.prices,
        imageOverride: cardPrintings.imageOverride,
        isRemoved: cardPrintings.isRemoved,
      })
      .from(cardPrintings)
      .innerJoin(sets, eq(sets.id, cardPrintings.setId))
      .where(eq(cardPrintings.cardIdentityId, id))
      .orderBy(desc(cardPrintings.releasedAt)),
    db.select().from(formats).where(eq(formats.gameId, identity.gameId)).orderBy(asc(formats.id)),
    db
      .select({ formatId: legalities.formatId, status: legalities.status })
      .from(legalities)
      .where(
        and(
          eq(legalities.cardIdentityId, id),
          isNull(legalities.effectiveTo),
          isNull(legalities.condition),
        ),
      ),
  ]);

  // Default (displayed) printing first; stable sort keeps release order within groups.
  printings.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return { identity, printings, formatRows, legalityRows };
}

// One DB lookup shared by the layout (the 404 gate, R6), generateMetadata and the page render (P2.6).
export const getCard = cache(loadCard);
