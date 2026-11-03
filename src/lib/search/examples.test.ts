/**
 * SEARCH-EXAMPLES: the day's "Try" examples. A commander is named up to its
 * first comma (front face only); the two are the day's fan in rank order,
 * the next fan card standing in when two share a name; then Sol Ring and
 * One Piece's OP01-001. Each carries its game and the /cards search it
 * runs. Three rows make the fan exactly those rows in rank order (a pool
 * smaller than the fan fans everything), so those cases need no seed; the
 * thirty-row case reads the day's draw from magicHome itself.
 */
import { describe, expect, it } from "vitest";

import { magicHome, POOL_SIZE, type MagicShelfRow } from "@/lib/home/shelves";

import {
  COMMANDER_EXAMPLES,
  exampleHref,
  exampleName,
  ONE_PIECE_EXAMPLE,
  searchExamples,
  STAPLE_EXAMPLE,
} from "./examples";

function row(name: string, i: number): MagicShelfRow {
  return {
    id: `id-${i}`,
    name,
    slug: `slug-${i}`,
    ciMask: 0,
    printingId: null,
    imageOverride: null,
  };
}

const DAY = "2026-11-03";

describe("exampleName", () => {
  it("names a commander up to its first comma, front face only", () => {
    expect(exampleName("Atraxa, Praetors' Voice")).toBe("Atraxa");
    expect(exampleName("Syr Konrad, the Grim")).toBe("Syr Konrad");
    expect(exampleName("Edgar Markov")).toBe("Edgar Markov");
    expect(exampleName("The Ur-Dragon")).toBe("The Ur-Dragon");
    expect(exampleName("Esika, God of the Tree // The Prismatic Bridge")).toBe("Esika");
    expect(exampleName("Valki, God of Lies // Tibalt, Cosmic Impostor")).toBe("Valki");
  });
});

describe("exampleHref", () => {
  it("is a /cards search: q alone for Magic, game=optcg first for One Piece", () => {
    expect(exampleHref("Sol Ring", "mtg")).toBe("/cards?q=Sol+Ring");
    expect(exampleHref("Atraxa", "mtg")).toBe("/cards?q=Atraxa");
    expect(exampleHref("OP01-001", "optcg")).toBe("/cards?game=optcg&q=OP01-001");
    // What /cards reads back (Next parses searchParams as URLSearchParams does).
    const read = new URLSearchParams(exampleHref("Y'shtola", "mtg").split("?")[1]);
    expect(read.get("q")).toBe("Y'shtola");
  });
});

describe("searchExamples", () => {
  const three = [
    row("Atraxa, Praetors' Voice", 0),
    row("Edgar Markov", 1),
    row("The Ur-Dragon", 2),
  ];

  it("names the day's first two commanders, then Sol Ring, then One Piece's card number", () => {
    expect(searchExamples(DAY, three)).toEqual([
      { text: "Atraxa", game: "mtg", href: "/cards?q=Atraxa" },
      { text: "Edgar Markov", game: "mtg", href: "/cards?q=Edgar+Markov" },
      { text: STAPLE_EXAMPLE, game: "mtg", href: "/cards?q=Sol+Ring" },
      { text: ONE_PIECE_EXAMPLE, game: "optcg", href: "/cards?game=optcg&q=OP01-001" },
    ]);
  });

  it("follows the day's fan: two of home's three hero cards, highest-ranked first", () => {
    const pool = Array.from({ length: POOL_SIZE }, (_, i) => row(`Commander ${i}, the Tester`, i));
    for (const day of ["2026-11-03", "2026-11-04", "2027-01-01"]) {
      const fan = magicHome(pool, day).fan;
      const texts = searchExamples(day, pool).map((e) => e.text);
      expect(texts.slice(0, COMMANDER_EXAMPLES)).toEqual(
        fan.slice(0, COMMANDER_EXAMPLES).map((card) => card.name.split(",")[0]),
      );
      expect(texts.slice(COMMANDER_EXAMPLES)).toEqual([STAPLE_EXAMPLE, ONE_PIECE_EXAMPLE]);
    }
  });

  it("the same rows and day give the same examples", () => {
    const pool = Array.from({ length: POOL_SIZE }, (_, i) => row(`Commander ${i}`, i));
    expect(searchExamples(DAY, pool)).toEqual(searchExamples(DAY, pool));
  });

  it("two fan cards that share a name: the next one stands in, so no two links run one search", () => {
    const rows = [
      row("Atraxa, Praetors' Voice", 0),
      row("Atraxa, Grand Unifier", 1),
      row("Edgar Markov", 2),
    ];
    expect(searchExamples(DAY, rows).map((e) => e.text)).toEqual([
      "Atraxa",
      "Edgar Markov",
      STAPLE_EXAMPLE,
      ONE_PIECE_EXAMPLE,
    ]);
  });

  it("a cold corpus leaves the commanders out; rows without a hub never count", () => {
    expect(searchExamples(DAY, []).map((e) => e.text)).toEqual([STAPLE_EXAMPLE, ONE_PIECE_EXAMPLE]);
    const unslugged = { ...row("Kenrith, the Returned King", 9), slug: null };
    expect(searchExamples(DAY, [unslugged, row("Edgar Markov", 1)]).map((e) => e.text)).toEqual([
      "Edgar Markov",
      STAPLE_EXAMPLE,
      ONE_PIECE_EXAMPLE,
    ]);
  });
});
