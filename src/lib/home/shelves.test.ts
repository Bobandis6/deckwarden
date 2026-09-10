/**
 * The shelf builders (R5a): the Magic shelf's hub hrefs and small images
 * (no printing → no image, no slug → no card); the One Piece shelf's two
 * branches over one query — finishes present → labeled, exactly the
 * finish rows and never padded with unranked leaders; no finishes at all
 * → the cold-start shelf in the query's name order with no label.
 */
import { describe, expect, it } from "vitest";

import { magicShelf, opShelf, type FinishLeaderRow } from "./shelves";

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
    });
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
