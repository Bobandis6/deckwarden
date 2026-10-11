/**
 * The playable-list hash (Y9a, WAVE4 D10) — what lets a logged game reuse a
 * version instead of minting a snapshot per game: two lists hash alike
 * exactly when the diff (diff.ts) finds no card changes between them.
 *
 * The canonical payload is the diff's own notion of a list: `[zone, cardId,
 * qty]` triples, duplicate (zone, card) keys merged by adding their
 * quantities (diff.ts `index`), sorted by zone then card id in code-unit
 * order (locale-free, so every runtime agrees). Tags and printings are not
 * in it — a tag edit or a printing swap is not a change to the list, and
 * the diff ignores them the same way.
 *
 * Pure and isomorphic: no `node:crypto` (the editor may hash the screen's
 * list later — Y10's "No card changes since vN"), and synchronous, so Web
 * Crypto's async digest doesn't fit. The digest is cyrb128 (bryc's public-
 * domain 128-bit string hash, four Math.imul lanes — deterministic in every
 * engine). Non-cryptographic on purpose: a hash only ever meets the other
 * versions of ONE deck (at most 150), where an accidental 128-bit collision
 * is out of reach and a deliberate one would only mislabel the owner's own
 * game. The `h1:` prefix names this payload + digest; a future change bumps
 * it, and rows under the old prefix re-hash like the pre-0018 NULLs do.
 */

/** Anything with a zone, a card and a quantity: frozen snapshots, editor entries. */
export interface PlayableEntry {
  zone: string;
  cardId: string;
  qty: number;
}

export const LIST_HASH_PREFIX = "h1:";

/** The canonical payload — exported for the pins; callers want playableListHash. */
export function playablePayload(entries: readonly PlayableEntry[]): string {
  const merged = new Map<string, [string, string, number]>();
  for (const e of entries) {
    const key = `${e.zone} ${e.cardId}`;
    const prev = merged.get(key);
    if (prev) prev[2] += e.qty;
    else merged.set(key, [e.zone, e.cardId, e.qty]);
  }
  const rows = [...merged.values()].sort((a, b) =>
    a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  return JSON.stringify(rows);
}

/** cyrb128 — four 32-bit lanes, 128 bits out, as 32 lowercase hex digits. */
function cyrb128(str: string): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

/** The list's hash: equal exactly when `isEmptyDiff(diffDeckLists(a, b))`. */
export function playableListHash(entries: readonly PlayableEntry[]): string {
  return LIST_HASH_PREFIX + cyrb128(playablePayload(entries));
}
