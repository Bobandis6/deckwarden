/**
 * Pure deck view-model: grouping + in-group sorting for the deck views (P1.3).
 *
 * Lives in the lib layer so P1.7's share pages reuse it verbatim: entries +
 * a card map in, plain group structures out. Game knowledge stays in the
 * adapter — the only card fields consumed are core CardData ones (name,
 * primaryType, costValue, cheapestUsd); group labels are game-neutral.
 */
import { isPlayableZone } from "@/lib/decks/playable";
import { NO_TYPE_LABEL, typeGroupRank } from "@/lib/games/type-order";
import type { FormatDef } from "@/lib/games/types";

/** The three GameAdapter defaultGroupBy keys (types.ts display.defaultGroupBy). */
export const GROUP_KEYS = ["primaryType", "costValue", "tags"] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export const SORT_KEYS = ["name", "cost", "price"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** The card fields grouping/sorting reads — a structural subset of CardData. */
export interface ViewCard {
  name: string;
  primaryType: string | null;
  costValue: number | null;
  cheapestUsd: number | null;
}

export interface ViewEntry {
  cardId: string;
  qty: number;
  tags: string[];
}

export interface ViewItem<E extends ViewEntry, C extends ViewCard> {
  entry: E;
  card: C;
}

export interface DeckGroup<E extends ViewEntry, C extends ViewCard> {
  /** Stable key: "type:Creature" | "cost:2" | "cost:none" | "tag:ramp" | "untagged". */
  key: string;
  label: string;
  /** Total quantity in the group (a multi-tag entry counts once per tag group). */
  qty: number;
  items: ViewItem<E, C>[];
}

/**
 * Entries in the format's leader zone(s), the rest of the playable list, and
 * the entries set aside in zones that don't count toward the size (DECK-TOKENS:
 * Magic's Tokens) — so `rest` is the deck as played everywhere it's read (the
 * groups, the sample hand, ambient art) and `aside` is the token list.
 */
export function splitLeaderEntries<E extends { zone: string }>(
  entries: readonly E[],
  format: FormatDef,
): { leader: E[]; rest: E[]; aside: E[] } {
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  const leader: E[] = [];
  const rest: E[] = [];
  const aside: E[] = [];
  for (const e of entries) {
    if (leaderZones.has(e.zone)) leader.push(e);
    else if (isPlayableZone(format, e.zone)) rest.push(e);
    else aside.push(e);
  }
  return { leader, rest, aside };
}

/** nulls sort last in either direction. */
function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

function compareItems<E extends ViewEntry, C extends ViewCard>(
  sortBy: SortKey,
  a: ViewItem<E, C>,
  b: ViewItem<E, C>,
): number {
  if (sortBy === "cost") {
    const d = compareNullable(a.card.costValue, b.card.costValue, 1);
    if (d !== 0) return d;
  } else if (sortBy === "price") {
    // Most expensive first — "what's worth money" is the question price sort answers.
    const d = compareNullable(a.card.cheapestUsd, b.card.cheapestUsd, -1);
    if (d !== 0) return d;
  }
  return a.card.name.localeCompare(b.card.name);
}

/**
 * Group non-leader entries for display. Entries whose card is missing from the
 * map are skipped (the caller's map is built from the same response as the
 * entries, so this is a hydration race at worst, not data loss).
 *
 * Group order: primaryType → the adapter's `typeOrder` when it declares one
 * (DECK-TOKENS: listed types in that order, unlisted ones after them by
 * label, "Other" last — the same rank the game's type breakdown sorts by),
 * otherwise biggest group first (label tiebreak; One Piece); costValue →
 * ascending, cost-less last; tags → alphabetical, "Untagged" last. Cards with
 * several tags appear in each of those tag groups, so tag-group quantities can
 * sum past the deck size — by design, tags are overlapping categories.
 */
export function groupDeckEntries<E extends ViewEntry, C extends ViewCard>(
  entries: readonly E[],
  cards: ReadonlyMap<string, C>,
  groupBy: GroupKey,
  sortBy: SortKey,
  typeOrder?: readonly string[],
): DeckGroup<E, C>[] {
  // order: primaryType = the declared rank (without one, qty decides); costValue = the cost; tags = 0/1 untagged-last.
  const groups = new Map<string, DeckGroup<E, C> & { order: number }>();
  const put = (key: string, label: string, order: number, item: ViewItem<E, C>) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, label, order, qty: 0, items: [] };
      groups.set(key, group);
    }
    group.qty += item.entry.qty;
    group.items.push(item);
  };

  for (const entry of entries) {
    const card = cards.get(entry.cardId);
    if (!card) continue;
    const item = { entry, card };
    if (groupBy === "primaryType") {
      const type = card.primaryType ?? NO_TYPE_LABEL;
      put(`type:${type}`, type, typeOrder ? typeGroupRank(typeOrder, type) : 0, item);
    } else if (groupBy === "costValue") {
      const cost = card.costValue;
      if (cost === null) put("cost:none", "No cost", Number.POSITIVE_INFINITY, item);
      else put(`cost:${cost}`, `Cost ${cost}`, cost, item);
    } else {
      const tags = [...new Set(entry.tags)];
      if (tags.length === 0) put("untagged", "Untagged", 1, item);
      else for (const tag of tags) put(`tag:${tag}`, tag, 0, item);
    }
  }

  const list = [...groups.values()];
  for (const group of list) group.items.sort((a, b) => compareItems(sortBy, a, b));
  list.sort((a, b) => {
    if (groupBy === "primaryType" && !typeOrder) {
      if (a.qty !== b.qty) return b.qty - a.qty;
    } else if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.label.localeCompare(b.label);
  });
  return list.map(({ key, label, qty, items }) => ({ key, label, qty, items }));
}
