/**
 * The homepage leader shelves (R5a, REDESIGN.md §2 "Site shell and
 * homepage", item 2) — pure builders over the two shelf queries, so the
 * cold-start branch the live corpus never exercises is unit-tested rather
 * than trusted.
 *
 * Magic: the index's page-1 top rows (edhrec_rank — CARD play rate, which
 * is why Ragavan sits among commanders; the index's own subtitle is the
 * honest label and the shelf reuses its sense) with the `small` rendition
 * of each default printing. One Piece: leaders ordered by their most recent
 * kept Top finish, then by how many — tournament data, so the shelf's label
 * names the source (the attribution rule). The query LEFT JOINs the finish
 * ranking onto every leader and orders finishes first, so ONE statement
 * serves both branches: rows with a finish → the labeled shelf of exactly
 * those rows (never padded with unranked leaders); no finish anywhere →
 * the cold-start shelf, name order, no label, no popularity wording (§2's
 * words). Both shelves take the `small` rendition of each default printing
 * (One Piece's since P4.9: the mirror's WebP on img.deckwarden.gg).
 *
 * U5 (WAVE5 D6): home's hero fans three Magic commanders as full `normal`
 * cards and the shelf shows six more, so no image appears in two sections
 * of the page (D0). Since 2026-10-17 (the owner's call, amending D6's "top
 * three") the fan rotates daily: the pool is the index's top POOL_SIZE,
 * the day's three are a seeded draw over it (the seed is the UTC date, so
 * every render of one day agrees and the fan turns over at 00:00 UTC), the
 * highest-ranked of the three sits in the center, and the shelf is the six
 * highest-ranked of the rest — the most-played commanders are always on the
 * page, in the fan on their day and on the shelf otherwise. One statement
 * still serves both: the page asks `loadTopCommanders` for POOL_SIZE rows
 * and `magicHome` splits them. The day key comes from the page, never from
 * a clock read in here, so the split is a pure function of rows and day.
 */
import { embeddablePrintingImageUrl } from "@/lib/cards/images";
import { leaderTileImage } from "@/lib/decks/tiles";
import { mulberry32 } from "@/lib/recommend/rng";

/** Six per shelf: three by two below `lg`, one row of six from it (U5). */
export const SHELF_SIZE = 6;

/** The hero fan's cards (U5): three full cards, the day's draw from the pool. */
export const FAN_SIZE = 3;

/**
 * The fan's pool (the daily rotation, 2026-10-17): the Magic index's top
 * POOL_SIZE commanders, the LIMIT of home's one Magic statement (9 before).
 * Wide enough that the fan reads as new most days (C(30, 3) = 4,060 fans),
 * narrow enough that every card in it is a commander people actually play.
 */
export const POOL_SIZE = 30;

/**
 * The rotation's day key: the UTC calendar date as `YYYY-MM-DD`. The page
 * passes `utcDayKey(new Date())` once per request; tests pass a literal.
 * UTC rather than the server's zone, so every region agrees on the day and
 * the fan turns over at 00:00 UTC for everyone at once.
 */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** FNV-1a over the day key: a 32-bit seed for mulberry32 (W9a's generator; one PRNG in the repo). */
function daySeed(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The day's picks: `count` distinct indices below `size` by a seeded
 * partial Fisher–Yates (one `rand()` per pick, so a fixed day and a fixed
 * pool size give a fixed draw). Which indices, not their order: the caller
 * walks the pool in rank order.
 */
function dailyPicks(size: number, count: number, day: string): Set<number> {
  const rand = mulberry32(daySeed(day));
  const indices = Array.from({ length: size }, (_, i) => i);
  const n = Math.min(count, size);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (size - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, n));
}

export interface MagicShelfRow {
  id: string;
  name: string;
  slug: string | null;
  ciMask: number;
  printingId: string | null;
  imageOverride: unknown;
}

export interface MagicShelfCard {
  id: string;
  name: string;
  href: string;
  ciMask: number;
  /**
   * The `normal` rendition (488 × 680): the gallery shows these at up to about
   * 200 px (FRESH-UI-HOME), where `small`'s 146 px would blur on a 2x screen;
   * null when the leader has no default printing.
   */
  image: string | null;
}

export function magicShelf(rows: readonly MagicShelfRow[]): MagicShelfCard[] {
  return rows
    .filter((row) => row.slug !== null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      href: `/c/${row.slug}`,
      ciMask: row.ciMask,
      image: row.printingId
        ? embeddablePrintingImageUrl(
            { id: row.printingId, imageOverride: row.imageOverride },
            "normal",
          )
        : null,
    }));
}

export interface FanCard {
  id: string;
  name: string;
  /**
   * The `normal` rendition (488 × 680, the artist and © line in the frame);
   * null when the leader has no default printing.
   */
  image: string | null;
}

export interface MagicHome {
  /**
   * The day's FAN_SIZE picks from the pool in rank order: the highest-ranked
   * first — the center card, on top (`.home-fan > :first-child`).
   */
  fan: FanCard[];
  /** The SHELF_SIZE highest-ranked of the rest of the pool: the shelf never repeats a fan card. */
  shelf: MagicShelfCard[];
}

function fanCard(row: MagicShelfRow): FanCard {
  return {
    id: row.id,
    name: row.name,
    image: row.printingId
      ? embeddablePrintingImageUrl(
          { id: row.printingId, imageOverride: row.imageOverride },
          "normal",
        )
      : null,
  };
}

/**
 * Home's Magic rows split for one day (U5; the daily rotation of
 * 2026-10-17). The pool is the first POOL_SIZE slugged rows (the query
 * orders them most played first; rows past the pool are ignored). The fan
 * is a seeded draw of FAN_SIZE from the pool, listed in rank order, so the
 * day's highest-ranked card is the first element — the center card, on
 * top — and a screen reader still hears the most played first. The shelf is
 * the SHELF_SIZE highest-ranked rows not in the fan, in rank order. Fewer
 * rows than the pool still fill the fan first (three of five rows fan, two
 * shelve); no row is ever in both. `day` is the UTC day key (`utcDayKey`),
 * handed in by the page: the same rows and day always give the same split.
 */
export function magicHome(rows: readonly MagicShelfRow[], day: string): MagicHome {
  const pool = rows.filter((row) => row.slug !== null).slice(0, POOL_SIZE);
  const picks = dailyPicks(pool.length, FAN_SIZE, day);
  const fan: FanCard[] = [];
  const rest: MagicShelfRow[] = [];
  pool.forEach((row, i) => {
    if (picks.has(i)) fan.push(fanCard(row));
    else rest.push(row);
  });
  return { fan, shelf: magicShelf(rest.slice(0, SHELF_SIZE)) };
}

export interface FinishLeaderRow {
  id: string;
  name: string;
  slug: string | null;
  externalKey: string;
  colorsMask: number;
  attrs: unknown;
  /** ISO date of the most recent kept finish; null = none on record. */
  latestFinish: string | null;
  finishes: number;
  printingId: string | null;
  imageOverride: unknown;
}

export interface OpShelfCard {
  id: string;
  name: string;
  href: string;
  externalKey: string;
  colorsMask: number;
  life: number | null;
  finishes: number;
  /** The `small` rendition; null when the leader has no default printing. */
  image: string | null;
}

export interface OpShelf {
  /** True when the rows ARE tournament results (label + credit required); false = the cold-start shelf. */
  labeled: boolean;
  leaders: OpShelfCard[];
}

function opCard(row: FinishLeaderRow): OpShelfCard {
  const attrs = (row.attrs ?? {}) as { life?: unknown };
  return {
    id: row.id,
    name: row.name,
    href: `/l/${row.slug}`,
    externalKey: row.externalKey,
    colorsMask: row.colorsMask,
    life: typeof attrs.life === "number" ? attrs.life : null,
    finishes: row.finishes,
    image: leaderTileImage(
      row.printingId ? { id: row.printingId, imageOverride: row.imageOverride } : null,
    ),
  };
}

export function opShelf(rows: readonly FinishLeaderRow[]): OpShelf {
  const slugged = rows.filter((row) => row.slug !== null);
  const withFinishes = slugged.filter((row) => row.latestFinish !== null);
  if (withFinishes.length > 0) return { labeled: true, leaders: withFinishes.map(opCard) };
  return { labeled: false, leaders: slugged.map(opCard) };
}
