/**
 * Hub data access (P2.4). MTG-only for now (game_id pinned): /c/[slug]
 * resolves within one game's slug namespace, and M4 revisits routing when a
 * second game grows hubs. Everything here reads card data only — hubs carry
 * no per-viewer state, which is what lets the pages be ISR-cached.
 *
 * Staples contract (cold-start rule): cards that FIT the leader's color
 * identity ((ci_mask & ~leaderCi) = 0), ranked by edhrec_rank popularity —
 * an honestly-good zero-corpus signal — excluding the leader itself, basic
 * lands (Forest is not advice), preview/removed cards, and anything with a
 * current unconditional banned/not_legal row for the leader format.
 */
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { FORMAT_ID, GAME_ID } from "@/db/seed-data";

const { cardIdentities, cardPrintings, decks, legalities } = schema;

export type LeaderRow = typeof schema.cardIdentities.$inferSelect;

const SLUG_RE = /^[a-z0-9-]{1,60}$/;

export async function loadLeaderBySlug(slug: string): Promise<LeaderRow | null> {
  if (!SLUG_RE.test(slug)) return null;
  const [leader] = await getDb()
    .select()
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, GAME_ID.mtg),
        eq(cardIdentities.slug, slug),
        eq(cardIdentities.isLeaderCandidate, true),
      ),
    )
    .limit(1);
  return leader ?? null;
}

/** Default printing (for the image); null for identities with no printings. */
export async function loadDefaultPrinting(cardIdentityId: string) {
  const [printing] = await getDb()
    .select({ id: cardPrintings.id, imageOverride: cardPrintings.imageOverride })
    .from(cardPrintings)
    .where(and(eq(cardPrintings.cardIdentityId, cardIdentityId), eq(cardPrintings.isDefault, true)))
    .limit(1);
  return printing ?? null;
}

/** The leader's own current unconditional status in the leader format ('legal' when no row). */
export async function loadLeaderStatus(cardIdentityId: string): Promise<string> {
  const [row] = await getDb()
    .select({ status: legalities.status })
    .from(legalities)
    .where(
      and(
        eq(legalities.formatId, FORMAT_ID.commander),
        eq(legalities.cardIdentityId, cardIdentityId),
        isNull(legalities.effectiveTo),
        isNull(legalities.condition),
      ),
    )
    .limit(1);
  return row?.status ?? "legal";
}

export interface StapleRow {
  id: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  ciMask: number;
  cheapestUsd: string | null;
  popularity: number | null;
}

export const STAPLES_LIMIT = 100;

export async function loadStaples(leader: { id: string; ciMask: number }): Promise<StapleRow[]> {
  return getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      primaryType: cardIdentities.primaryType,
      costValue: cardIdentities.costValue,
      ciMask: cardIdentities.ciMask,
      cheapestUsd: cardIdentities.cheapestUsd,
      popularity: cardIdentities.popularity,
    })
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, GAME_ID.mtg),
        eq(cardIdentities.isRemoved, false),
        eq(cardIdentities.isPreview, false),
        ne(cardIdentities.id, leader.id),
        sql`${cardIdentities.popularity} IS NOT NULL`,
        // ::int disambiguates ~ (bitwise NOT) from ~ (regex) on the untyped param.
        sql`(${cardIdentities.ciMask} & ~${leader.ciMask}::int) = 0`,
        sql`coalesce(${cardIdentities.attrs}->>'type_line', '') NOT LIKE '%Basic%'`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${legalities} l
          WHERE l.card_identity_id = ${cardIdentities.id}
            AND l.format_id = ${FORMAT_ID.commander}
            AND l.effective_to IS NULL AND l.condition IS NULL
            AND l.status IN ('banned', 'not_legal'))`,
      ),
    )
    .orderBy(asc(cardIdentities.popularity))
    .limit(STAPLES_LIMIT);
}

export interface HubDeckRow {
  publicId: string;
  name: string;
  likesCount: number;
  updatedAt: Date;
}

export const HUB_DECKS_LIMIT = 10;

/**
 * "Decks with this commander" (P2.5 — the shelf P2.4 deliberately deferred).
 * Public decks whose command zone contains this leader, most-liked first,
 * recency as the tiebreak. Cold-start rule: callers render the shelf only
 * when this returns rows — an empty shelf is padding, not honesty. Community
 * data, but still zero per-viewer state, so hub ISR is untouched.
 */
export async function loadHubDecks(leaderId: string): Promise<HubDeckRow[]> {
  return getDb()
    .select({
      publicId: decks.publicId,
      name: decks.name,
      likesCount: decks.likesCount,
      updatedAt: decks.updatedAt,
    })
    .from(decks)
    .where(
      and(
        eq(decks.visibility, "public"),
        // The decks_hub GIN index serves @> containment.
        sql`${decks.leaderIds} @> ARRAY[${leaderId}]::uuid[]`,
      ),
    )
    .orderBy(desc(decks.likesCount), desc(decks.updatedAt))
    .limit(HUB_DECKS_LIMIT);
}

export interface LeaderIndexRow {
  id: string;
  name: string;
  slug: string | null;
  ciMask: number;
  costValue: number | null;
  popularity: number | null;
  cheapestUsd: string | null;
}

export const LEADERS_PAGE_SIZE = 60;

/**
 * Leader index page: popularity order (edhrec_rank asc = most played first;
 * unranked leaders sort last), optional exact color-identity filter.
 */
export async function loadLeaderIndex(opts: {
  ciMask: number | null;
  page: number;
}): Promise<LeaderIndexRow[]> {
  const conditions = [
    eq(cardIdentities.gameId, GAME_ID.mtg),
    eq(cardIdentities.isLeaderCandidate, true),
    eq(cardIdentities.isRemoved, false),
    sql`${cardIdentities.slug} IS NOT NULL`,
  ];
  if (opts.ciMask !== null) conditions.push(eq(cardIdentities.ciMask, opts.ciMask));
  return getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      slug: cardIdentities.slug,
      ciMask: cardIdentities.ciMask,
      costValue: cardIdentities.costValue,
      popularity: cardIdentities.popularity,
      cheapestUsd: cardIdentities.cheapestUsd,
    })
    .from(cardIdentities)
    .where(and(...conditions))
    .orderBy(sql`${cardIdentities.popularity} ASC NULLS LAST`, asc(cardIdentities.name))
    .limit(LEADERS_PAGE_SIZE)
    .offset((opts.page - 1) * LEADERS_PAGE_SIZE);
}
