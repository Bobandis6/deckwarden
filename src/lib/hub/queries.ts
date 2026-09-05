/**
 * Hub data access (P2.4; game-scoped P4.4). Routing decision (the "M4
 * revisits" this header used to promise): each game keeps its own hub root —
 * /commanders → /c/[slug] for MTG, /leaders → /l/[slug] for OP — because the
 * vocabulary differs ("commander" is MTG-speak; OP players say "leader") and
 * the 4,012 existing /c/ URLs are live SEO surface that must not move.
 * Cross-game slug collisions are structurally dead regardless: ci_slug is
 * unique per game, and OP slugs embed the external key (leaderHubSlug).
 * Slug-taking loaders are game_id-parameterized; MTG-signal loaders
 * (staples, decks shelf, the popularity-ordered index) stay MTG-only by
 * construction and say so. Everything here reads card data only — hubs carry
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

/** Slug lookup within ONE game's namespace (ci_slug is unique per game). */
export async function loadLeaderBySlug(gameId: number, slug: string): Promise<LeaderRow | null> {
  if (!SLUG_RE.test(slug)) return null;
  const [leader] = await getDb()
    .select()
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, gameId),
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

/** The leader's own current unconditional status in the given format ('legal' when no row). */
export async function loadLeaderStatus(formatId: number, cardIdentityId: string): Promise<string> {
  const [row] = await getDb()
    .select({ status: legalities.status })
    .from(legalities)
    .where(
      and(
        eq(legalities.formatId, formatId),
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
 * MTG-only by construction — popularity is an MTG signal (EDHREC), and the
 * OP index below deliberately doesn't pretend to have one.
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

export interface OpLeaderIndexRow {
  id: string;
  name: string;
  slug: string | null;
  externalKey: string;
  colorsMask: number;
  attrs: unknown;
}

/**
 * OP leader index (P4.4): every slugged OP leader, name order — the honest
 * zero-signal ordering (popularity/prices are all-NULL for OP, and
 * external_key order interleaves EB/OP/P/ST prefixes, a poor "newest first"
 * proxy; LATER row 55 holds the release-date map). 142 rows today, no
 * pagination needed; exact colors_mask filter mirrors /commanders semantics
 * (colors_mask == ci_mask for OP by ingest contract).
 */
export async function loadOpLeaderIndex(opts: {
  colorsMask: number | null;
}): Promise<OpLeaderIndexRow[]> {
  const conditions = [
    eq(cardIdentities.gameId, GAME_ID.optcg),
    eq(cardIdentities.isLeaderCandidate, true),
    eq(cardIdentities.isRemoved, false),
    sql`${cardIdentities.slug} IS NOT NULL`,
  ];
  if (opts.colorsMask !== null) conditions.push(eq(cardIdentities.colorsMask, opts.colorsMask));
  return getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      slug: cardIdentities.slug,
      externalKey: cardIdentities.externalKey,
      colorsMask: cardIdentities.colorsMask,
      attrs: cardIdentities.attrs,
    })
    .from(cardIdentities)
    .where(and(...conditions))
    .orderBy(asc(cardIdentities.name), asc(cardIdentities.externalKey));
}

/**
 * Same-name OP leaders (P4.4): the 17-Luffys problem as a feature — each hub
 * cross-links its namesakes so a searcher landing on the wrong Luffy finds
 * the right one. Callers render the block only when this returns rows.
 */
export async function loadOpLeaderSiblings(
  name: string,
  excludeId: string,
): Promise<OpLeaderIndexRow[]> {
  return getDb()
    .select({
      id: cardIdentities.id,
      name: cardIdentities.name,
      slug: cardIdentities.slug,
      externalKey: cardIdentities.externalKey,
      colorsMask: cardIdentities.colorsMask,
      attrs: cardIdentities.attrs,
    })
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, GAME_ID.optcg),
        eq(cardIdentities.isLeaderCandidate, true),
        eq(cardIdentities.isRemoved, false),
        eq(cardIdentities.name, name),
        ne(cardIdentities.id, excludeId),
        sql`${cardIdentities.slug} IS NOT NULL`,
      ),
    )
    .orderBy(asc(cardIdentities.externalKey));
}
