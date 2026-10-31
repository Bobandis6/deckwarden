/**
 * The shelf builders (R5a): the Magic shelf's hub hrefs and small images
 * (no printing → no image, no slug → no card); the One Piece shelf's two
 * branches over one query — finishes present → labeled, exactly the
 * finish rows and never padded with unranked leaders; no finishes at all
 * → the cold-start shelf in the query's name order with no label — and,
 * since P4.9, the mirror's small WebP on each One Piece card. U5: home's
 * Magic rows split into the hero fan (`normal`) and the shelf, never
 * sharing a card; since the daily rotation (2026-10-17) the fan is the
 * day's seeded draw of three from the top-30 pool — the same day gives the
 * same fan and shelf, another day another fan, the highest-ranked of the
 * three first (the center), the shelf the six highest-ranked of the rest.
 */
import { describe, expect, it } from "vitest";

import {
  FAN_SIZE,
  magicHome,
  magicShelf,
  opShelf,
  POOL_SIZE,
  SHELF_SIZE,
  utcDayKey,
  type FinishLeaderRow,
  type MagicShelfRow,
} from "./shelves";

describe("magicShelf", () => {
  it("links each hub and takes the normal rendition of the default printing (the gallery size)", () => {
    const cards = magicShelf([
      {
        id: "a",
        name: "Syr Konrad, the Grim",
        slug: "syr-konrad-the-grim",
        ciMask: 4,
        printingId: "5b40815d-0104-461e-b193-fcf5e1f35299",
        imageOverride: null,
      },
      {
        id: "b",
        name: "Printless",
        slug: "printless",
        ciMask: 0,
        printingId: null,
        imageOverride: null,
      },
      { id: "c", name: "Unslugged", slug: null, ciMask: 1, printingId: null, imageOverride: null },
    ]);
    expect(cards.map((c) => c.href)).toEqual(["/c/syr-konrad-the-grim", "/c/printless"]);
    expect(cards[0].image).toBe(
      "https://cards.scryfall.io/normal/front/5/b/5b40815d-0104-461e-b193-fcf5e1f35299.jpg",
    );
    expect(cards[1].image).toBeNull();
  });
});

const commander = (i: number, overrides: Partial<MagicShelfRow> = {}): MagicShelfRow => ({
  id: `c${i}`,
  name: `Commander ${i}`,
  slug: `commander-${i}`,
  ciMask: i % 32,
  printingId: `${i.toString(16).padStart(2, "0")}aaaaaa-0000-4000-8000-000000000000`,
  imageOverride: null,
  ...overrides,
});

/** `n` commanders in rank order, most played first. */
const corpus = (n: number) => Array.from({ length: n }, (_, i) => commander(i + 1));
const ids = (cards: readonly { id: string }[]) => cards.map((c) => c.id);
/** A card's rank in the corpus: its 1-based position, `c7` → 7. */
const rank = (id: string) => Number(id.slice(1));

const DAY = "2026-10-17";
const NEXT_DAY = "2026-10-18";

describe("magicHome (U5; the daily rotation of 2026-10-17)", () => {
  it("the sizes: a fan of three and a shelf of six from a pool of thirty", () => {
    expect([FAN_SIZE, SHELF_SIZE, POOL_SIZE]).toEqual([3, 6, 30]);
  });

  it("the same day and rows give the same fan and shelf, every time", () => {
    const rows = corpus(POOL_SIZE);
    const first = magicHome(rows, DAY);
    expect(magicHome(rows, DAY)).toEqual(first);
    expect(magicHome([...rows], DAY)).toEqual(first);
    expect(first.fan).toHaveLength(FAN_SIZE);
    expect(first.shelf).toHaveLength(SHELF_SIZE);
  });

  it("another UTC day fans other cards", () => {
    const rows = corpus(POOL_SIZE);
    expect(ids(magicHome(rows, NEXT_DAY).fan)).not.toEqual(ids(magicHome(rows, DAY).fan));
    // A week of fans is not one fan repeated.
    const week = Array.from({ length: 7 }, (_, i) =>
      ids(magicHome(rows, `2026-10-${17 + i}`).fan).join(","),
    );
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it("the fan is drawn from the pool and listed in rank order: the day's highest-ranked first (the center)", () => {
    const rows = corpus(POOL_SIZE);
    for (const day of [DAY, NEXT_DAY, "2026-11-01", "2027-01-01"]) {
      const { fan } = magicHome(rows, day);
      const ranks = ids(fan).map(rank);
      expect(ranks).toHaveLength(3);
      expect(new Set(ranks).size).toBe(3);
      for (const r of ranks) expect(r).toBeLessThanOrEqual(POOL_SIZE);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(ranks[0]).toBe(Math.min(...ranks));
    }
  });

  it("the shelf is the six highest-ranked of the rest, in rank order; no card in both (D0)", () => {
    const rows = corpus(POOL_SIZE);
    for (const day of [DAY, NEXT_DAY, "2026-11-01", "2027-01-01"]) {
      const { fan, shelf } = magicHome(rows, day);
      const fanIds = new Set(ids(fan));
      expect(shelf.some((c) => fanIds.has(c.id))).toBe(false);
      const expected = rows.filter((r) => !fanIds.has(r.id)).slice(0, SHELF_SIZE);
      expect(ids(shelf)).toEqual(ids(expected));
    }
  });

  it("renditions: the fan and the shelf both `normal` (the gallery shows the shelf at up to 200 px), from the default printing", () => {
    const { fan, shelf } = magicHome(corpus(POOL_SIZE), DAY);
    for (const card of fan) {
      const hex = rank(card.id).toString(16).padStart(2, "0");
      expect(card).toEqual({
        id: card.id,
        name: `Commander ${rank(card.id)}`,
        image: `https://cards.scryfall.io/normal/front/${hex[0]}/${hex[1]}/${hex}aaaaaa-0000-4000-8000-000000000000.jpg`,
      });
    }
    for (const card of shelf) {
      expect(card.href).toBe(`/c/commander-${rank(card.id)}`);
      expect(card.image).toMatch(/^https:\/\/cards\.scryfall\.io\/normal\/front\//);
    }
  });

  it("rows past the pool never fan or shelve", () => {
    const rows = corpus(POOL_SIZE + 20);
    for (const day of [DAY, NEXT_DAY, "2026-12-25"]) {
      const { fan, shelf } = magicHome(rows, day);
      for (const id of [...ids(fan), ...ids(shelf)])
        expect(rank(id)).toBeLessThanOrEqual(POOL_SIZE);
    }
    // Rows past the pool do not change the day's draw either.
    expect(magicHome(rows, DAY)).toEqual(magicHome(corpus(POOL_SIZE), DAY));
  });

  it("an override image serves the fan as stored; no printing → null (CardImage's named box)", () => {
    const override =
      "https://cards.scryfall.io/normal/front/f/f/ffaaaaaa-0000-4000-8000-000000000000.jpg";
    const { fan } = magicHome(
      [commander(1, { imageOverride: { front: override } }), commander(2, { printingId: null })],
      DAY,
    );
    expect(fan.map((c) => c.image)).toEqual([override, null]);
  });

  it("skips unslugged rows, and a short corpus fills the fan first", () => {
    const { fan, shelf } = magicHome(
      [commander(1), commander(2, { slug: null }), commander(3), commander(4), commander(5)],
      DAY,
    );
    // Four slugged rows: three fan (in rank order), the one left shelves.
    expect(fan).toHaveLength(3);
    expect(shelf).toHaveLength(1);
    const all = [...ids(fan), ...ids(shelf)].sort();
    expect(all).toEqual(["c1", "c3", "c4", "c5"]);
    expect(ids(fan).map(rank)).toEqual([...ids(fan).map(rank)].sort((a, b) => a - b));
    expect(ids(magicHome([commander(1), commander(2)], DAY).fan).sort()).toEqual(["c1", "c2"]);
    expect(magicHome([commander(1), commander(2)], DAY).shelf).toEqual([]);
    expect(magicHome([], DAY)).toEqual({ fan: [], shelf: [] });
  });
});

describe("utcDayKey", () => {
  it("is the UTC calendar date, whatever the zone the instant was written in", () => {
    expect(utcDayKey(new Date("2026-10-17T00:00:00Z"))).toBe("2026-10-17");
    expect(utcDayKey(new Date("2026-10-17T23:59:59.999Z"))).toBe("2026-10-17");
    expect(utcDayKey(new Date("2026-10-18T00:00:00Z"))).toBe("2026-10-18");
    // 8 pm in Los Angeles on the 17th is already the 18th in UTC: the fan turns there, not at local midnight.
    expect(utcDayKey(new Date("2026-10-17T20:00:00-07:00"))).toBe("2026-10-18");
  });
});

const leader = (
  name: string,
  key: string,
  finishes: number,
  latest: string | null,
  life: unknown = 5,
): FinishLeaderRow => ({
  id: key,
  name,
  slug: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${key.toLowerCase()}`,
  externalKey: key,
  colorsMask: 32,
  attrs: { life },
  latestFinish: latest,
  finishes,
  printingId: `printing-${key}`,
  imageOverride: { front: `https://img.deckwarden.gg/optcg/images/${key}.png` },
});

describe("opShelf", () => {
  it("with finishes: labeled, in the query's order, only the rows that placed", () => {
    const shelf = opShelf([
      leader("Enel", "OP15-058", 231, "2026-09-08"),
      leader("Dracule Mihawk", "OP14-020", 173, "2026-09-08"),
      leader("Kaido", "OP17-058", 28, "2026-09-07"),
      // The query's LEFT JOIN tail: leaders with no finish never pad the shelf.
      leader("Ace", "ST13-001", 0, null),
      leader("Nami", "OP01-001", 0, null),
    ]);
    expect(shelf.labeled).toBe(true);
    expect(shelf.leaders.map((l) => l.name)).toEqual(["Enel", "Dracule Mihawk", "Kaido"]);
    expect(shelf.leaders[0]).toEqual({
      id: "OP15-058",
      name: "Enel",
      href: "/l/enel-op15-058",
      externalKey: "OP15-058",
      colorsMask: 32,
      life: 5,
      finishes: 231,
      image: "https://img.deckwarden.gg/optcg/small/OP15-058.webp",
    });
  });

  it("a leader with no default printing, or an r2.dev image, keeps the gradient (image null)", () => {
    const shelf = opShelf([
      { ...leader("Enel", "OP15-058", 231, "2026-09-08"), printingId: null, imageOverride: null },
      {
        ...leader("Dracule Mihawk", "OP14-020", 173, "2026-09-08"),
        imageOverride: {
          front: "https://pub-6d142676dd964e79abf609637297c45d.r2.dev/optcg/images/OP14-020.png",
        },
      },
    ]);
    expect(shelf.leaders.map((l) => l.image)).toEqual([null, null]);
  });

  it("cold start (no finishes anywhere): unlabeled, every row in name order, life kept", () => {
    const shelf = opShelf([
      leader("Ace", "ST13-001", 0, null, 4),
      leader("Boa Hancock", "OP14-041", 0, null),
      leader("Enel", "OP15-058", 0, null, "five"),
    ]);
    expect(shelf.labeled).toBe(false);
    expect(shelf.leaders.map((l) => l.name)).toEqual(["Ace", "Boa Hancock", "Enel"]);
    expect(shelf.leaders.map((l) => l.life)).toEqual([4, 5, null]);
    expect(shelf.leaders.every((l) => l.finishes === 0)).toBe(true);
  });

  it("drops unslugged rows and answers an empty shelf for no rows", () => {
    expect(opShelf([])).toEqual({ labeled: false, leaders: [] });
    const unslugged = { ...leader("Ghost", "P-000", 3, "2026-09-01"), slug: null };
    expect(opShelf([unslugged]).leaders).toEqual([]);
  });
});
