/**
 * Card-by-card deck diff (P3.6) — the pure core of versioning and forks.
 *
 * Operates on the frozen snapshot shape deck_versions stores
 * ([{cardId, zone, qty, tags, printingId}]) and nothing else, so the same
 * function compares a version to the live list, two versions, or a fork to
 * its upstream. Adapter-agnostic by construction: zone ids are data here;
 * labels come from the FormatDef at render time (deck-diff-view.tsx).
 *
 * Scope, stated plainly: the diff is about WHAT cards are in WHICH zone at
 * WHAT quantity. Tag edits and alternate-printing swaps are not changes to
 * the list and are deliberately ignored — a version whose only difference
 * is a tag renders as "no card changes", and the UI says so.
 *
 * Moves: a card that leaves one zone and appears in another at the same
 * quantity (commander <-> main is the real case) is reported once as a move
 * instead of a removal plus an addition. Different quantities stay as the
 * two raw changes — that is honestly two edits.
 */

export interface FrozenCard {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId: string | null;
}

export interface DiffEntry {
  cardId: string;
  zone: string;
  qty: number;
}

export interface DiffQtyChange {
  cardId: string;
  zone: string;
  from: number;
  to: number;
}

export interface DiffMove {
  cardId: string;
  fromZone: string;
  toZone: string;
  qty: number;
}

export interface DeckDiff {
  /** In `after` only (or added to a second zone). */
  added: DiffEntry[];
  /** In `before` only. */
  removed: DiffEntry[];
  /** Same (zone, card) on both sides with a different quantity. */
  qtyChanged: DiffQtyChange[];
  /** Left one zone and entered another at the same quantity. */
  moved: DiffMove[];
  /** (zone, card) entries identical on both sides, quantity included. */
  unchanged: number;
}

const key = (zone: string, cardId: string) => `${zone} ${cardId}`;

function byZoneThenCard<T extends { zone: string; cardId: string }>(a: T, b: T): number {
  return a.zone.localeCompare(b.zone) || a.cardId.localeCompare(b.cardId);
}

/** Collapse duplicate (zone, card) keys defensively: snapshots are unique by construction, inputs may not be. */
function index(cards: readonly FrozenCard[]): Map<string, DiffEntry> {
  const map = new Map<string, DiffEntry>();
  for (const c of cards) {
    const k = key(c.zone, c.cardId);
    const prev = map.get(k);
    if (prev) prev.qty += c.qty;
    else map.set(k, { cardId: c.cardId, zone: c.zone, qty: c.qty });
  }
  return map;
}

export function diffDeckLists(
  before: readonly FrozenCard[],
  after: readonly FrozenCard[],
): DeckDiff {
  const a = index(before);
  const b = index(after);

  let added: DiffEntry[] = [];
  let removed: DiffEntry[] = [];
  const qtyChanged: DiffQtyChange[] = [];
  let unchanged = 0;

  for (const [k, entry] of a) {
    const other = b.get(k);
    if (!other) removed.push(entry);
    else if (other.qty !== entry.qty) {
      qtyChanged.push({ cardId: entry.cardId, zone: entry.zone, from: entry.qty, to: other.qty });
    } else unchanged++;
  }
  for (const [k, entry] of b) {
    if (!a.has(k)) added.push(entry);
  }

  // Pair removals with additions of the same card in another zone at the
  // same quantity. One pairing per side: a card removed from one zone and
  // added to two zones is a move plus an add, never two moves.
  const moved: DiffMove[] = [];
  const consumedAdds = new Set<DiffEntry>();
  const consumedRemoves = new Set<DiffEntry>();
  for (const rem of removed) {
    const match = added.find(
      (add) =>
        !consumedAdds.has(add) &&
        add.cardId === rem.cardId &&
        add.zone !== rem.zone &&
        add.qty === rem.qty,
    );
    if (match) {
      consumedAdds.add(match);
      consumedRemoves.add(rem);
      moved.push({ cardId: rem.cardId, fromZone: rem.zone, toZone: match.zone, qty: rem.qty });
    }
  }
  added = added.filter((e) => !consumedAdds.has(e)).sort(byZoneThenCard);
  removed = removed.filter((e) => !consumedRemoves.has(e)).sort(byZoneThenCard);
  qtyChanged.sort(byZoneThenCard);
  moved.sort((x, y) => x.fromZone.localeCompare(y.fromZone) || x.cardId.localeCompare(y.cardId));

  return { added, removed, qtyChanged, moved, unchanged };
}

export function isEmptyDiff(diff: DeckDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.qtyChanged.length === 0 &&
    diff.moved.length === 0
  );
}

/** Card-count deltas for a one-line summary: "+3 · -2 · 1 qty · 1 moved". */
export function diffSummary(diff: DeckDiff): string {
  if (isEmptyDiff(diff)) return "No card changes";
  const plus = diff.added.reduce((n, e) => n + e.qty, 0);
  const minus = diff.removed.reduce((n, e) => n + e.qty, 0);
  const parts: string[] = [];
  if (plus > 0) parts.push(`+${plus}`);
  if (minus > 0) parts.push(`-${minus}`);
  if (diff.qtyChanged.length > 0) parts.push(`${diff.qtyChanged.length} qty`);
  if (diff.moved.length > 0) parts.push(`${diff.moved.length} moved`);
  return parts.join(" · ");
}
