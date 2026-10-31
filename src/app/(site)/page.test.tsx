// @vitest-environment node
/**
 * Home (U5, WAVE5 D6: home B), rendered the way the server renders it — the
 * real page with its queries mocked, async server components resolved by
 * React's stream: the section order (the band, the doors row, the Magic region, the
 * One Piece field, Continue building only with own decks, the rail, the
 * capabilities, the outro); the pinned strings and links smoke:seo and
 * smoke:engagement read (the H1, `/leaders`, `/cards?game=optcg`, the exact
 * Surprise me `<a>`, ♥ on the rail, no "Continue building" for a guest);
 * the fan's three cards eager and on no other section (D0); thirty Magic
 * rows asked for and the fan the day's draw from them (the daily rotation
 * of 2026-10-17: the page reads the UTC date, pinned here with a fake
 * Date, and `magicHome` says which three); zero uppercase section labels;
 * no "Open beta", Moxfield or GitHub sentence left on the page.
 */
import { renderToReadableStream } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { magicHome } from "@/lib/home/shelves";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  loadTopCommanders: vi.fn(),
  loadRecentFinishLeaders: vi.fn(),
  loadRecentPublicDecks: vi.fn(),
  loadOwnerDecks: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => mocks.userId }));
vi.mock("@/lib/hub/queries", () => ({ loadTopCommanders: mocks.loadTopCommanders }));
vi.mock("@/lib/tournaments/queries", () => ({
  loadRecentFinishLeaders: mocks.loadRecentFinishLeaders,
}));
vi.mock("@/lib/decks/collections", () => ({
  CONTINUE_BUILDING_LIMIT: 6,
  loadRecentPublicDecks: mocks.loadRecentPublicDecks,
  loadOwnerDecks: mocks.loadOwnerDecks,
}));

const { default: Home, dynamic } = await import("./page");

/** A Scryfall-shaped printing id whose first two characters are distinct per row. */
const printing = (i: number) =>
  `${i.toString(16).padStart(2, "0")}bbbbbb-0000-4000-8000-000000000000`;

const COMMANDERS = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Commander ${i + 1}`,
  slug: `commander-${i + 1}`,
  ciMask: 1,
  costValue: 3,
  popularity: i + 1,
  cheapestUsd: null,
  printingId: printing(i + 1),
  imageOverride: null,
}));

const FINISH_LEADERS = ["OP12-061", "OP17-039"].map((key, i) => ({
  id: key,
  name: `Leader ${i + 1}`,
  slug: `leader-${i + 1}-${key.toLowerCase()}`,
  externalKey: key,
  colorsMask: 1,
  attrs: { life: 5 },
  latestFinish: "2026-10-10",
  finishes: 2 - i,
  printingId: `printing-${key}`,
  imageOverride: { front: `https://img.deckwarden.gg/optcg/images/${key}.png` },
}));

const deckRow = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  publicId: `pub${i}`,
  name: `Public Deck ${i}`,
  gameId: 1,
  formatId: 1,
  visibility: "public",
  ciMask: 1,
  leaderIds: [`c${i}`],
  likesCount: 0,
  updatedAt: new Date("2026-10-10T12:00:00Z"),
  targetLevel: null,
  // The rail's commander is outside the twelve Magic rows: never a fan or shelf card.
  printingId: printing(20 + i),
  imageOverride: null,
  authorName: "Bobandis6",
  authorUsername: "bobandis6",
  ...extra,
});

async function renderHome(): Promise<string> {
  const stream = await renderToReadableStream(await Home());
  await stream.allReady;
  return new Response(stream).text();
}

/**
 * Pins the UTC date the page reads for the fan's day key — Date alone, so
 * React's stream keeps its real timers.
 */
function onUtcDay(day: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
}

const DAY = "2026-10-17";
const NEXT_DAY = "2026-10-18";
/** The fan's `alt`s and the shelf's hub slugs in a rendered home. */
function fanAndShelf(html: string) {
  const fanStart = html.indexOf('data-slot="hero-fan"');
  const fan = html.slice(fanStart, html.indexOf("</div>", fanStart));
  const rest = html.slice(html.indexOf('aria-label="Magic: The Gathering · Commander"'));
  const shelf = rest.slice(0, rest.indexOf('aria-label="One Piece Card Game"'));
  return {
    fan: [...fan.matchAll(/<img[^>]*alt="([^"]*)"/g)].map((m) => m[1]),
    shelf: [...shelf.matchAll(/href="\/c\/(commander-\d+)"/g)].map((m) => m[1]),
  };
}

/** Every <img> src in a slice of HTML. */
const srcs = (html: string) => [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
/** The printing id an image URL derives from (Scryfall's small or normal path). */
const printingOf = (src: string) => src.match(/\/([0-9a-f]{8}-[0-9a-f-]+)\.jpg$/)?.[1] ?? src;

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.userId = null;
  mocks.loadTopCommanders.mockReset();
  mocks.loadTopCommanders.mockImplementation(async (limit: number) => COMMANDERS.slice(0, limit));
  mocks.loadRecentFinishLeaders.mockReset();
  mocks.loadRecentFinishLeaders.mockResolvedValue(FINISH_LEADERS);
  mocks.loadRecentPublicDecks.mockReset();
  mocks.loadRecentPublicDecks.mockResolvedValue([deckRow(1, { likesCount: 2 }), deckRow(2)]);
  mocks.loadOwnerDecks.mockReset();
  mocks.loadOwnerDecks.mockResolvedValue([deckRow(3, { name: "My Draft", visibility: "private" })]);
});

describe("home (U5, home B)", () => {
  it("stays force-dynamic and asks for thirty Magic rows: the fan's pool, the shelf drawn from the rest", async () => {
    expect(dynamic).toBe("force-dynamic");
    await renderHome();
    expect(mocks.loadTopCommanders).toHaveBeenCalledWith(30);
    expect(mocks.loadRecentFinishLeaders).toHaveBeenCalledWith(2, 6);
  });

  it("orders the sections: hero, Magic, One Piece, the rail, the capabilities, the outro", async () => {
    const html = await renderHome();
    const main = html.slice(html.indexOf('<main id="main"'), html.indexOf("</main>"));
    // The container moved onto the bands (the hero band runs edge to edge).
    expect(main).toMatch(/^<main id="main" class="w-full flex-1">/);
    expect(main).toContain('<div class="max-w-wide mx-auto w-full px-4 home-band-inner">');
    const order = [
      "<h1",
      'aria-label="Magic: The Gathering · Commander"',
      'aria-label="One Piece Card Game"',
      'aria-label="Recent public decks"',
      'aria-label="What Deckwarden does"',
      "Decks built here follow you into an account whenever you",
    ].map((needle) => main.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // A guest: no Continue building in the server HTML (engagement-smoke).
    expect(html).not.toContain("Continue building");
  });

  it("the band: the pinned H1 on the fluid step, the 15-word sentence in two tones, then the doors row and the two game tiles", async () => {
    const html = await renderHome();
    // The H1 wraps the same in Literata and its fallback at every width (no
    // reflow on the swap): the per-tier caps, re-measured for `.type-hero`.
    expect(html).toMatch(
      /<h1 class="type-hero max-w-\[9em\] text-balance md:max-w-\[12em\] lg:max-w-none">Your next great deck starts here\.<\/h1>/,
    );
    const sentence = "Keyboard-first deck building for Commander and the One Piece Card Game.";
    const second = "Free. No account needed.";
    expect(html).toContain(sentence);
    expect(html).toContain(`<span class="text-muted-foreground block">${second}</span>`);
    expect(`${sentence} ${second}`.split(" ")).toHaveLength(15);
    // The intro's target (HOME-INTRO): the hero section carries its slot, and
    // the sentence is the <p> right after the h1 (globals.css keys `h1 + p`).
    expect(html).toMatch(/<section data-slot="home-hero" class="home-band">/);
    expect(html).toMatch(/<\/h1><p class="max-w-xl text-lg text-pretty">Keyboard-first/);
    expect(html.match(/data-slot="home-hero"/g)).toHaveLength(1);
    // The band holds the words and the trio, nothing else: no link before the trio.
    const band = html.slice(html.indexOf("<h1"), html.indexOf('data-slot="hero-fan"'));
    expect(band).not.toContain("<a ");
    // The doors row: the wide Build a deck (the `hero` size, full width, the
    // arrow after the label) and Browse commanders, then a tile per game.
    const doors = html.slice(
      html.indexOf('aria-label="Start building"'),
      html.indexOf('aria-label="Magic: The Gathering · Commander"'),
    );
    const build = doors.slice(0, doors.indexOf('aria-label="Choose your game"'));
    expect(
      [...build.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[2], m[1]]),
    ).toEqual([
      ["Build a deck", "/decks/new"],
      ["Browse commanders", "/commanders"],
    ]);
    expect(build).toMatch(/<a[^>]*class="[^"]*\bh-14\b[^"]*"[^>]*href="\/decks\/new"/);
    const tiles = doors.slice(doors.indexOf('aria-label="Choose your game"'));
    expect([...tiles.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "/decks/new?game=mtg",
      "/decks/new?game=optcg",
    ]);
    expect([...tiles.matchAll(/data-game="(\w+)"/g)].map((m) => m[1])).toEqual(["mtg", "optcg"]);
    expect(tiles).toContain("Commander · 100 cards");
    expect(tiles).toContain("Leader + 50 cards");
    // The paintings (HOME-ATMOSPHERE, 2026-10-31): a decorative, eager,
    // low-priority <img> of a static file under /home in each tile, the
    // crop's focal point in --tile-focus on the link, the words after it.
    expect([...tiles.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "/home/mtg-tile.webp",
      "/home/optcg-tile.webp",
    ]);
    expect(
      tiles.match(
        /<img[^>]*alt=""[^>]*loading="eager"[^>]*fetch[Pp]riority="low"[^>]*class="home-tile-art"/g,
      ),
    ).toHaveLength(2);
    expect(tiles).toMatch(/style="--tile-focus:\s*62% 50%"/);
    expect(tiles).toMatch(/style="--tile-focus:\s*68% 50%"/);
    expect(html).not.toContain("Open beta");
  });

  it("keeps smoke:seo's pins: the two One Piece links and the exact Surprise me <a>", async () => {
    const html = await renderHome();
    expect(html).toContain('href="/leaders"');
    expect(html).toContain('href="/cards?game=optcg"');
    expect(html).toMatch(
      /<a[^>]*href="\/decks\/new\?game=mtg&amp;surprise=1"[^>]*>Surprise me<\/a>/,
    );
  });

  it("the fan: the day's three as eager `normal` cards, none of them on the shelf or the rail (D0)", async () => {
    onUtcDay(DAY);
    const html = await renderHome();
    const fanStart = html.indexOf('data-slot="hero-fan"');
    const fan = html.slice(fanStart, html.indexOf("</div>", fanStart));
    const fanImgs = [...fan.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(fanImgs).toHaveLength(3);
    for (const img of fanImgs) {
      expect(img).toContain('loading="eager"');
      expect(img).toMatch(/fetchPriority="high"|fetchpriority="high"/);
      expect(img).toMatch(/src="https:\/\/cards\.scryfall\.io\/normal\/front\//);
    }
    // The three are magicHome's draw for the UTC date the page read, in
    // rank order: the first (the center card) is the highest-ranked.
    const expected = magicHome(COMMANDERS, DAY);
    const names = fanImgs.map((img) => img.match(/alt="([^"]*)"/)?.[1]);
    expect(names).toEqual(expected.fan.map((c) => c.name));
    const ranks = names.map((name) => Number(name?.slice("Commander ".length)));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(3);
    const rest = html.slice(html.indexOf('aria-label="Magic: The Gathering · Commander"'));
    const restPrintings = srcs(rest).map(printingOf);
    for (const src of srcs(fan)) expect(restPrintings).not.toContain(printingOf(src));
    // The shelf is the six highest-ranked of the rest, linked to their hubs.
    const shelf = rest.slice(0, rest.indexOf('aria-label="One Piece Card Game"'));
    const shelfSlugs = [...shelf.matchAll(/href="\/c\/(commander-\d+)"/g)].map((m) => m[1]);
    expect(shelfSlugs).toEqual(expected.shelf.map((c) => c.href.slice("/c/".length)));
    expect(shelfSlugs).toEqual(
      COMMANDERS.filter((c) => !names.includes(c.name))
        .slice(0, 6)
        .map((c) => c.slug),
    );
    // Only the fan is eager: every other card image waits for the viewport.
    expect(srcs(rest)).not.toHaveLength(0);
    expect(rest).not.toContain('loading="eager"');
  });

  it("the fan is the day's: the next UTC date fans other cards, the shelf still never repeating one", async () => {
    onUtcDay(DAY);
    const today = fanAndShelf(await renderHome());
    onUtcDay(NEXT_DAY);
    const tomorrow = fanAndShelf(await renderHome());
    expect(tomorrow.fan).not.toEqual(today.fan);
    expect(tomorrow.fan).toEqual(magicHome(COMMANDERS, NEXT_DAY).fan.map((c) => c.name));
    for (const day of [today, tomorrow]) {
      expect(day.fan).toHaveLength(3);
      expect(day.shelf).toHaveLength(6);
      const fanSlugs = day.fan.map((name) => name.toLowerCase().replace(" ", "-"));
      expect(day.shelf.some((slug) => fanSlugs.includes(slug))).toBe(false);
    }
    // The same date twice renders the same fan: the draw is the date's, not the request's.
    onUtcDay(DAY);
    expect(fanAndShelf(await renderHome())).toEqual(today);
  });

  it("zero uppercase section labels; serif section headings (the gallery's on the fluid step); the rail's ♥", async () => {
    const html = await renderHome();
    const main = html.slice(html.indexOf('<main id="main"'), html.indexOf("</main>"));
    // The only uppercase left is One Piece's printed card ids (data, not labels).
    const upper = [...main.matchAll(/<(\w+)[^>]*class="[^"]*\buppercase\b[^"]*"[^>]*>([^<]*)</g)];
    expect(upper.map((m) => [m[1], m[2]])).toEqual([
      ["span", "OP12-061"],
      ["span", "OP17-039"],
    ]);
    const h2s = [...main.matchAll(/<h2 class="([^"]*)">([^<]*)<\/h2>/g)].map((m) => [m[2], m[1]]);
    expect(h2s).toEqual([
      ["Find your next commander.", "type-headline max-md:max-w-[11em] text-balance"],
      ["One Piece Card Game", "type-section"],
      ["Recent public decks", "type-section"],
      ["What Deckwarden does", "type-section"],
    ]);
    expect(
      [...main.matchAll(/<h3 class="([^"]*)">([^<]*)<\/h3>/g)].map((m) => [m[2], m[1]]),
    ).toEqual([
      ["Popular in Commander decklists", "type-small"],
      ["Recent Top finishes", "type-small"],
    ]);
    expect(main).toContain("♥ 2");
  });

  it("the outro is one sentence and the crest: no Moxfield, no GitHub (the footer links it)", async () => {
    const html = await renderHome();
    const main = html.slice(html.indexOf('<main id="main"'), html.indexOf("</main>"));
    expect(main).toMatch(
      // React separates adjacent text nodes with an empty comment.
      /Decks built here follow you into an account whenever you(<!-- -->)? <a [^>]*href="\/account"[^>]*>sign in<\/a>\./,
    );
    expect(main).not.toContain("Moxfield");
    expect(main).not.toContain("github.com");
  });

  it("signed in: Continue building renders before the rail, on the serif heading, with the edit link", async () => {
    mocks.userId = "user-1";
    const html = await renderHome();
    expect(mocks.loadOwnerDecks).toHaveBeenCalledWith("user-1");
    const continueAt = html.indexOf('aria-label="Continue building"');
    expect(continueAt).toBeGreaterThan(html.indexOf('aria-label="One Piece Card Game"'));
    expect(continueAt).toBeLessThan(html.indexOf('aria-label="Recent public decks"'));
    expect(html).toContain('<h2 class="type-section">Continue building</h2>');
    expect(html).toContain(`href="/decks/${"00000000-0000-4000-8000-000000000003"}/edit"`);
    // LATER row 248: the tile's Share page is a 44 px target on touch.
    const share = html.match(/<a [^>]*>Share page<\/a>/)?.[0] ?? "";
    expect(share).toContain(
      'class="text-muted-foreground text-xs hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"',
    );
  });

  it("a guest's empty Continue building leaves an empty, hidden wrapper: no hairline, no words", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<div class="border-gold\/30 border-t py-12 empty:hidden"><\/div>/);
  });
});
