/**
 * The shelf builders (R5a): the Magic shelf's hub hrefs and small images
 * (no printing → no image, no slug → no card); the One Piece shelf's two
 * branches over one query — finishes present → labeled, exactly the
 * finish rows and never padded with unranked leaders; no finishes at all
 * → the cold-start shelf in the query's name order with no label — and,
 * since P4.9, the mirror's small WebP on each One Piece card. U5: home's
 * Magic rows split into the hero fan (the top three, `normal`) and the
 * shelf (the next six), never sharing a card.
 */
import { describe, expect, it } from "vitest";

import {
  FAN_SIZE,
  magicHome,
  magicShelf,
  opShelf,
  SHELF_SIZE,
  type FinishLeaderRow,
  type MagicShelfRow,
} from "./shelves";

describe("magicShelf", () => {
  it("links each hub and takes the small rendition of the default printing", () => {
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
      "https://cards.scryfall.io/small/front/5/b/5b40815d-0104-461e-b193-fcf5e1f35299.jpg",
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

describe("magicHome (U5)", () => {
  it("asks for nine rows: the fan's three and the shelf's six", () => {
    expect([FAN_SIZE, SHELF_SIZE]).toEqual([3, 6]);
  });

  it("the fan takes the top three as `normal` renditions, the shelf the next six, no card in both", () => {
    const rows = Array.from({ length: FAN_SIZE + SHELF_SIZE }, (_, i) => commander(i + 1));
    const { fan, shelf } = magicHome(rows);
    expect(fan.map((c) => c.name)).toEqual(["Commander 1", "Commander 2", "Commander 3"]);
    expect(fan[0]).toEqual({
      id: "c1",
      name: "Commander 1",
      image: "https://cards.scryfall.io/normal/front/0/1/01aaaaaa-0000-4000-8000-000000000000.jpg",
    });
    expect(shelf.map((c) => c.name)).toEqual([4, 5, 6, 7, 8, 9].map((i) => `Commander ${i}`));
    expect(shelf[0].image).toBe(
      "https://cards.scryfall.io/small/front/0/4/04aaaaaa-0000-4000-8000-000000000000.jpg",
    );
    // D0: no image on two sections of one page.
    const fanIds = new Set(fan.map((c) => c.id));
    expect(shelf.some((c) => fanIds.has(c.id))).toBe(false);
  });

  it("an override image serves the fan as stored; no printing → null (CardImage's named box)", () => {
    const override =
      "https://cards.scryfall.io/normal/front/f/f/ffaaaaaa-0000-4000-8000-000000000000.jpg";
    const { fan } = magicHome([
      commander(1, { imageOverride: { front: override } }),
      commander(2, { printingId: null }),
    ]);
    expect(fan.map((c) => c.image)).toEqual([override, null]);
  });

  it("skips unslugged rows, and a short corpus shortens the shelf first", () => {
    const { fan, shelf } = magicHome([
      commander(1),
      commander(2, { slug: null }),
      commander(3),
      commander(4),
      commander(5),
    ]);
    expect(fan.map((c) => c.id)).toEqual(["c1", "c3", "c4"]);
    expect(shelf.map((c) => c.id)).toEqual(["c5"]);
    expect(magicHome([])).toEqual({ fan: [], shelf: [] });
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
