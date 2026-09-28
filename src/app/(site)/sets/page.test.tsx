// @vitest-environment node
/**
 * /sets (X4b), rendered the way the server renders it: every row of
 * `loadReleasedSets(GAME_ID.mtg)` is a link to /cards?set=<code> in the
 * HTML — the other products too, `hidden` by the default "Main sets only" —
 * grouped by year under the serif h1; One Piece is a disabled pill, never a
 * link; the page is ISR (a day) with its own canonical and no request data.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReleasedSet } from "@/lib/sets/lines";

const SETS: ReleasedSet[] = [
  {
    code: "blb",
    name: "Bloomburrow",
    releasedAt: "2024-08-02",
    setType: "expansion",
    group: "main",
    cards: 279,
    ordinal: 102,
  },
  {
    code: "pblb",
    name: "Bloomburrow Promos",
    releasedAt: "2024-08-02",
    setType: "promo",
    group: "other",
    cards: 40,
    ordinal: null,
  },
  {
    code: "emn",
    name: "Eldritch Moon",
    releasedAt: "2016-07-22",
    setType: "expansion",
    group: "main",
    cards: 208,
    ordinal: 71,
  },
];

const loadReleasedSets = vi.fn(async (gameId: number) => {
  void gameId;
  return SETS;
});
vi.mock("@/lib/sets/queries", () => ({ loadReleasedSets }));

const { default: SetsPage, metadata, revalidate } = await import("./page");

describe("/sets", () => {
  it("server HTML: every set a link, the other products hidden, grouped by year", async () => {
    const html = renderToString(await SetsPage());
    expect(loadReleasedSets).toHaveBeenCalledWith(1); // GAME_ID.mtg
    const links = [...html.matchAll(/<li( hidden="")?><a [^>]*href="\/cards\?set=([a-z0-9]+)"/g)];
    expect(links.map((m) => [m[2], m[1] !== undefined])).toEqual([
      ["blb", false],
      ["pblb", true],
      ["emn", false],
    ]);
    expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual([
      "2024",
      "2016",
    ]);
    expect(html).toMatch(/<h1[^>]*>Sets<\/h1>/);
    expect(html).toContain("Every released Magic set, newest first. Pick one to see its cards.");
    expect(html).toContain("71st expansion set");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(html).toContain("Showing 2 of 3 sets");
  });

  it("names Magic as the game and One Piece as a disabled pill, never a link", async () => {
    const html = renderToString(await SetsPage());
    expect(html).toContain('aria-current="page"');
    // React separates adjacent text nodes with an empty comment.
    expect(html).toMatch(/One Piece(<!-- -->)? — soon/);
    expect(html).toContain("One Piece sets are coming.");
    expect(html).not.toMatch(/href="[^"]*game=optcg/);
  });

  it("is ISR for a day, with its own title and canonical", () => {
    expect(revalidate).toBe(86400);
    expect(metadata.title).toBe("Sets");
    expect(metadata.alternates?.canonical).toBe("/sets");
    expect(metadata.description).toMatch(/Magic: The Gathering set/);
  });

  it("takes no request data: the page reads no searchParams", () => {
    // A page that awaits searchParams, headers() or cookies() renders on
    // every hit — the build's ○ is the proof; this pins the signature.
    expect(SetsPage.length).toBe(0);
  });
});
