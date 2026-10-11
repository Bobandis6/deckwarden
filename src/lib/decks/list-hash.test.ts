/**
 * Y9a — the playable-list hash's pins (WAVE4 D10): equal exactly when the
 * diff says "No card changes", a printing or tag change keeps it, and the
 * digest itself is pinned so a refactor can't silently orphan every stored
 * hash (each log would then mint a fresh snapshot).
 */
import { describe, expect, it } from "vitest";

import { diffDeckLists, isEmptyDiff, type FrozenCard } from "./diff";
import { LIST_HASH_PREFIX, playableListHash, playablePayload } from "./list-hash";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card = (n: number, over: Partial<FrozenCard> = {}): FrozenCard => ({
  cardId: U(n),
  zone: "main",
  qty: 1,
  tags: [],
  printingId: null,
  ...over,
});

describe("playableListHash", () => {
  it("is h1: plus 32 hex digits, and the digest is pinned (changing it re-hashes every deck)", () => {
    expect(playableListHash([])).toMatch(/^h1:[0-9a-f]{32}$/);
    expect(LIST_HASH_PREFIX).toBe("h1:");
    expect(playablePayload([])).toBe("[]");
    expect(playableListHash([])).toBe("h1:6cec00d0556f7072473e37b06d814675");
    expect(playableListHash([card(1, { zone: "commander" }), card(2, { qty: 3 }), card(3)])).toBe(
      "h1:7af1fb419e6ba85efe0b0b2811f0293d",
    );
  });

  it("canonical payload: [zone, cardId, qty], duplicates merged, sorted by zone then card", () => {
    expect(
      playablePayload([
        card(3),
        card(2, { qty: 2 }),
        card(1, { zone: "commander" }),
        card(2, { qty: 1, tags: ["Ramp"] }),
      ]),
    ).toBe(
      JSON.stringify([
        ["commander", U(1), 1],
        ["main", U(2), 3],
        ["main", U(3), 1],
      ]),
    );
  });

  it("a printing or tag change keeps the hash", () => {
    const before = [card(1, { zone: "commander" }), card(2, { qty: 2 }), card(3)];
    const after = [
      card(1, { zone: "commander", printingId: U(91) }),
      card(2, { qty: 2, tags: ["Draw", "Engine"] }),
      card(3, { printingId: U(93), tags: ["Ramp"] }),
    ];
    expect(isEmptyDiff(diffDeckLists(before, after))).toBe(true);
    expect(playableListHash(after)).toBe(playableListHash(before));
  });

  it("order and duplicate splits never change it", () => {
    const a = [card(1), card(2, { qty: 4 }), card(3, { zone: "commander" })];
    const b = [card(3, { zone: "commander" }), card(2, { qty: 1 }), card(1), card(2, { qty: 3 })];
    expect(playableListHash(b)).toBe(playableListHash(a));
  });

  it("a quantity, a card, or a zone change moves it — a commander ⇄ main move included", () => {
    const base = [card(1, { zone: "commander" }), card(2), card(3)];
    const h = playableListHash(base);
    expect(
      playableListHash([card(1, { zone: "commander" }), card(2, { qty: 2 }), card(3)]),
    ).not.toBe(h);
    expect(playableListHash([card(1, { zone: "commander" }), card(2)])).not.toBe(h);
    expect(playableListHash([...base, card(4)])).not.toBe(h);
    expect(playableListHash([card(1), card(2), card(3)])).not.toBe(h);
    // Zone and card ids can't bleed into each other through the separator.
    expect(playableListHash([card(1, { zone: "a b" })])).not.toBe(
      playableListHash([{ zone: "a", cardId: `b ${U(1)}`, qty: 1 }]),
    );
  });

  it("equal exactly when isEmptyDiff says no card changes — 2,000 seeded random pairs", () => {
    // mulberry32: a fixed sequence, so a failure reproduces.
    let seed = 0x5eed9a;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
    const zones = ["commander", "main", "side"];
    const randomList = (): FrozenCard[] =>
      Array.from({ length: 1 + Math.floor(rand() * 6) }, () =>
        card(1 + Math.floor(rand() * 6), {
          zone: pick(zones),
          qty: 1 + Math.floor(rand() * 3),
          tags: rand() < 0.3 ? ["T"] : [],
          printingId: rand() < 0.3 ? U(90) : null,
        }),
      );
    const mutate = (list: FrozenCard[]): FrozenCard[] => {
      const next = list.map((c) => ({ ...c }));
      const i = Math.floor(rand() * next.length);
      switch (Math.floor(rand() * 8)) {
        case 0: // quantity
          next[i].qty += 1;
          break;
        case 1: // zone
          next[i].zone = pick(zones);
          break;
        case 2: // card
          next[i].cardId = U(1 + Math.floor(rand() * 6));
          break;
        case 3: // remove
          next.splice(i, 1);
          break;
        case 4: // tag only
          next[i].tags = ["Changed"];
          break;
        case 5: // printing only
          next[i].printingId = U(99);
          break;
        case 6: // split a row into two of the same key
          if (next[i].qty > 1) {
            next[i].qty -= 1;
            next.push({ ...next[i], qty: 1 });
          }
          break;
        default: // reorder
          next.reverse();
      }
      return next;
    };
    let equal = 0;
    for (let n = 0; n < 2000; n++) {
      const a = randomList();
      const b = rand() < 0.5 ? mutate(a) : randomList();
      const same = isEmptyDiff(diffDeckLists(a, b));
      if (same) equal++;
      expect(playableListHash(a) === playableListHash(b), JSON.stringify({ a, b })).toBe(same);
    }
    // Both sides of the equivalence were exercised.
    expect(equal).toBeGreaterThan(200);
    expect(equal).toBeLessThan(1800);
  });
});
