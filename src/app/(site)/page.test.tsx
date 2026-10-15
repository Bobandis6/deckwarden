// @vitest-environment node
/**
 * Home (U5, WAVE5 D6: home B), rendered the way the server renders it — the
 * real page with its queries mocked, async server components resolved by
 * React's stream: the section order (the split hero, the Magic region, the
 * One Piece field, Continue building only with own decks, the rail, the
 * capabilities, the outro); the pinned strings and links smoke:seo and
 * smoke:engagement read (the H1, `/leaders`, `/cards?game=optcg`, the exact
 * Surprise me `<a>`, ♥ on the rail, no "Continue building" for a guest);
 * the fan's three cards eager and on no other section (D0); nine Magic rows
 * asked for; zero uppercase section labels; no "Open beta", Moxfield or
 * GitHub sentence left on the page.
 */
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  // The rail's commander is the shelf's tenth row: never a fan or shelf card.
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

/** Every <img> src in a slice of HTML. */
const srcs = (html: string) => [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
/** The printing id an image URL derives from (Scryfall's small or normal path). */
const printingOf = (src: string) => src.match(/\/([0-9a-f]{8}-[0-9a-f-]+)\.jpg$/)?.[1] ?? src;

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
  it("stays force-dynamic and asks for nine Magic rows: the fan's three and the shelf's six", async () => {
    expect(dynamic).toBe("force-dynamic");
    await renderHome();
    expect(mocks.loadTopCommanders).toHaveBeenCalledWith(9);
    expect(mocks.loadRecentFinishLeaders).toHaveBeenCalledWith(2, 6);
  });

  it("orders the sections: hero, Magic, One Piece, the rail, the capabilities, the outro", async () => {
    const html = await renderHome();
    const main = html.slice(html.indexOf('<main id="main"'), html.indexOf("</main>"));
    expect(main).toMatch(/^<main id="main" class="[^"]*max-w-wide[^"]*"/);
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

  it("the split hero: the pinned H1, the 15-word sentence, Build a deck and Browse commanders", async () => {
    const html = await renderHome();
    // The H1 wraps the same in Literata and its fallback at every width (no reflow on the swap).
    expect(html).toMatch(
      /<h1 class="type-display max-w-\[7em\] text-balance md:max-w-\[12em\] lg:max-w-none">Your next great deck starts here\.<\/h1>/,
    );
    const sentence =
      "Keyboard-first deck building for Commander and the One Piece Card Game. Free, no account needed.";
    expect(html).toContain(sentence);
    expect(sentence.split(" ")).toHaveLength(15);
    const hero = html.slice(html.indexOf("<h1"), html.indexOf('data-slot="hero-fan"'));
    expect(
      [...hero.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[2], m[1]]),
    ).toEqual([
      ["Build a deck", "/decks/new"],
      ["Browse commanders", "/commanders"],
    ]);
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

  it("the fan: the top three as eager `normal` cards, none of them on the shelf or the rail (D0)", async () => {
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
    expect(fanImgs.map((img) => img.match(/alt="([^"]*)"/)?.[1])).toEqual([
      "Commander 1",
      "Commander 2",
      "Commander 3",
    ]);
    const rest = html.slice(html.indexOf('aria-label="Magic: The Gathering · Commander"'));
    const restPrintings = srcs(rest).map(printingOf);
    for (const src of srcs(fan)) expect(restPrintings).not.toContain(printingOf(src));
    // The shelf is the next six: Commanders 4 to 9, linked to their hubs.
    const shelf = rest.slice(0, rest.indexOf('aria-label="One Piece Card Game"'));
    expect([...shelf.matchAll(/href="\/c\/(commander-\d+)"/g)].map((m) => m[1])).toEqual(
      [4, 5, 6, 7, 8, 9].map((i) => `commander-${i}`),
    );
    // Only the fan is eager: every other card image waits for the viewport.
    expect(srcs(rest)).not.toHaveLength(0);
    expect(rest).not.toContain('loading="eager"');
  });

  it("zero uppercase section labels; serif section headings; the rail's ♥", async () => {
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
      ["Magic: The Gathering", "type-section"],
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
  });

  it("a guest's empty Continue building leaves an empty, hidden wrapper: no hairline, no words", async () => {
    const html = await renderHome();
    expect(html).toMatch(/<div class="border-gold\/30 border-t py-12 empty:hidden"><\/div>/);
  });
});
