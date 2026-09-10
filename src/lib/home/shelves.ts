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
 * words). One Piece images stay off the shelf until LATER row 51.
 */
import { leaderTileImage } from "@/lib/decks/tiles";

/** Six per shelf — two rows of three in the game card. */
export const SHELF_SIZE = 6;

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
  /** The `small` rendition; null when the leader has no default printing. */
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
      image: leaderTileImage(
        row.printingId ? { id: row.printingId, imageOverride: row.imageOverride } : null,
      ),
    }));
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
}

export interface OpShelfCard {
  id: string;
  name: string;
  href: string;
  externalKey: string;
  colorsMask: number;
  life: number | null;
  finishes: number;
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
  };
}

export function opShelf(rows: readonly FinishLeaderRow[]): OpShelf {
  const slugged = rows.filter((row) => row.slug !== null);
  const withFinishes = slugged.filter((row) => row.latestFinish !== null);
  if (withFinishes.length > 0) return { labeled: true, leaders: withFinishes.map(opCard) };
  return { labeled: false, leaders: slugged.map(opCard) };
}
