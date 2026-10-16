// @vitest-environment node
/**
 * /c/[slug] (U7b, WAVE5 D8: the hub openings), rendered the way the server
 * renders it — the real page with its loaders mocked, async server
 * components resolved by React's stream. Every section opens with its serif
 * h2 standing alone and the one explainer sits under the first data section
 * (the staples) on the ladder's meta step; the lines the smokes read (the
 * Meta Lens clause, the combos count, the finishes' floor and source) keep
 * their words and close their blocks as source lines; the lines that
 * restated a heading are gone; the staples' hundred rows are all in the
 * HTML, 75 of them hidden behind "Show all 100"; the pinned CTA anchors,
 * the curve's h3 and the credits hold.
 */
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { lettersToMask } from "@/lib/games/colors";

const mocks = vi.hoisted(() => ({
  getLeader: vi.fn(),
  loadDefaultPrinting: vi.fn(),
  loadLeaderStatus: vi.fn(),
  loadStaples: vi.fn(),
  loadHubDecks: vi.fn(),
  loadHubPrecons: vi.fn(),
  loadCommanderMetaLens: vi.fn(),
  loadCombosForCard: vi.fn(),
  loadTopFinishes: vi.fn(),
  resolveCardArt: vi.fn(),
}));

vi.mock("./leader", () => ({ getLeader: mocks.getLeader }));
vi.mock("@/lib/hub/queries", () => ({
  STAPLES_LIMIT: 100,
  loadDefaultPrinting: mocks.loadDefaultPrinting,
  loadLeaderStatus: mocks.loadLeaderStatus,
  loadStaples: mocks.loadStaples,
  loadHubDecks: mocks.loadHubDecks,
  loadHubPrecons: mocks.loadHubPrecons,
  loadCommanderMetaLens: mocks.loadCommanderMetaLens,
}));
vi.mock("@/lib/combos/queries", () => ({
  COMBOS_SHOWN: 10,
  loadCombosForCard: mocks.loadCombosForCard,
}));
vi.mock("@/lib/tournaments/queries", () => ({
  TOP_FINISHES_SHOWN: 8,
  loadTopFinishes: mocks.loadTopFinishes,
}));
vi.mock("@/lib/cards/art", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cards/art")>()),
  resolveCardArt: mocks.resolveCardArt,
}));

const { default: CommanderHubPage, revalidate } = await import("./page");

const LEADER = {
  id: "11111111-1111-4111-8111-111111111111",
  gameId: 1,
  name: "Atraxa",
  slug: "atraxa",
  externalKey: "oracle-atraxa",
  primaryType: "Creature",
  costValue: 4,
  colorsMask: lettersToMask("WUBG"),
  ciMask: lettersToMask("WUBG"),
  isLeaderCandidate: true,
  isPreview: false,
  isRemoved: false,
  cheapestUsd: "12.00",
  popularity: 1,
  attrs: {
    type_line: "Legendary Creature — Phyrexian Angel Horror",
    oracle_text:
      "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",
  },
};

const STAPLES = Array.from({ length: 100 }, (_, i) => ({
  id: `${(i + 1).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
  name: `Staple ${i + 1}`,
  primaryType: i % 7 === 0 ? "Land" : "Artifact",
  costValue: i % 8,
  cheapestUsd: i % 3 === 0 ? "0.50" : "6.00",
}));

const deckRow = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  publicId: `pub${i}`,
  name: `Deck ${i}`,
  gameId: 1,
  formatId: 1,
  visibility: "public",
  kind: "user",
  ciMask: LEADER.ciMask,
  leaderIds: [LEADER.id],
  likesCount: 0,
  updatedAt: new Date("2026-10-10T12:00:00Z"),
  targetLevel: null,
  printingId: "22222222-2222-4222-8222-222222222222",
  imageOverride: null,
  authorName: "Bobandis6",
  authorUsername: "bobandis6",
  ...extra,
});

async function renderHub(): Promise<string> {
  const stream = await renderToReadableStream(
    await CommanderHubPage({
      params: Promise.resolve({ slug: LEADER.slug }),
      searchParams: Promise.resolve({}),
    }),
  );
  await stream.allReady;
  return new Response(stream).text();
}

/** The slice of `html` from a section's aria-label to its closing tag. */
function section(html: string, label: string): string {
  const start = html.indexOf(`aria-label="${label}"`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

/** React separates adjacent text nodes with an empty comment; the words are what matter. */
const words = (s: string) => s.replace(/<!-- -->/g, "");

const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => words(m[1]));

beforeEach(() => {
  mocks.getLeader.mockReset().mockResolvedValue(LEADER);
  mocks.loadDefaultPrinting
    .mockReset()
    .mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", imageOverride: null });
  mocks.resolveCardArt.mockReset().mockResolvedValue(null);
  mocks.loadLeaderStatus.mockReset().mockResolvedValue("legal");
  mocks.loadStaples.mockReset().mockResolvedValue(STAPLES);
  mocks.loadCombosForCard.mockReset().mockResolvedValue({
    total: 12,
    combos: [
      {
        id: 1,
        externalKey: "1234-5678",
        results: ["Infinite mana"],
        templates: [],
        popularity: 10,
        pieces: [
          { id: LEADER.id, name: LEADER.name, externalKey: LEADER.externalKey },
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Partner Piece",
            externalKey: "oracle-piece",
          },
        ],
      },
    ],
  });
  mocks.loadHubDecks.mockReset().mockResolvedValue([deckRow(1)]);
  mocks.loadHubPrecons.mockReset().mockResolvedValue([
    deckRow(2, {
      name: "Breed Lethality",
      kind: "precon",
      publicId: "p_breed",
      updatedAt: new Date("2016-11-11T00:00:00Z"),
    }),
  ]);
  mocks.loadTopFinishes.mockReset().mockResolvedValue({
    total: 3,
    finishes: [
      {
        tournamentId: 7,
        externalKey: "ev-7",
        eventName: "Big Event",
        startDate: "2026-09-01",
        playerCount: 32,
        placement: 1,
        playerName: "Pat",
        leaderNames: [LEADER.name],
        decklistUrl: null,
        wins: 4,
        draws: 0,
        losses: 1,
      },
    ],
  });
  mocks.loadCommanderMetaLens.mockReset().mockResolvedValue({
    rows: [{ id: STAPLES[0].id, name: "Staple 1", lists: 40, top4: 10 }],
    totalLists: 42,
    setCount: 1,
    since: "2026-01-01",
  });
});

describe("/c/[slug] (U7b: the hub openings)", () => {
  it("stays ISR for an hour; every section opens with a serif h2 standing alone, the one explainer under the staples", async () => {
    expect(revalidate).toBe(3600);
    const html = await renderHub();
    expect(html).toMatch(/<main id="main"[^>]*data-game="mtg"/);
    expect(h2s(html)).toEqual([
      "A typical Commander deck",
      "Staples in these colors",
      "Most played with Atraxa",
      "Combos with Atraxa",
      "Top finishes",
      "Precons led by Atraxa",
      "Decks with this commander",
    ]);
    // Exactly one explainer sits right under an h2: the staples', on the ladder's meta step.
    const explainers = [...html.matchAll(/<\/h2><p class="([^"]*)">((?:[^<]|<!-- -->)*)/g)];
    expect(explainers).toHaveLength(1);
    expect(words(explainers[0][2])).toMatch(/^The 100 cards that fit this color identity/);
    expect(explainers[0][1].split(" ")).toContain("type-meta-multiline");
    expect(explainers[0][1]).not.toContain("text-xs");
    // The lines that restated their heading are gone (deletions, not rewrites).
    for (const gone of [
      "A starting template, not a rule",
      "Official preconstructed decks with",
      "Public Deckwarden decks running",
    ]) {
      expect(html).not.toContain(gone);
    }
    // The curve keeps its h3 (hubs-smoke reads it).
    expect(html).toContain("Curve of these staples");
  });

  it("keeps the smoke-pinned lines byte-identical and moves each under its block as a source line", async () => {
    const html = await renderHub();

    const lens = section(html, "Most played with this commander");
    expect(lens.indexOf("<table")).toBeGreaterThan(lens.indexOf("</h2>"));
    const lensLine = lens.indexOf("ranked by lists played");
    expect(lensLine).toBeGreaterThan(lens.indexOf("</table>"));
    expect(words(lens.slice(lensLine))).toContain("top-4 counts shown for context. Results from");
    expect(words(lens)).toContain(
      "The 1 most-played cards in 42 settled top-16 lists running Atraxa",
    );
    expect(html).toContain("40 of 42"); // the table's n-of-N share literal (hubs-smoke)

    const combos = section(html, "Combos");
    const combosLine = words(combos).indexOf("most popular of 12 combos");
    expect(combosLine).toBeGreaterThan(words(combos).indexOf("</ul>"));
    expect(words(combos).slice(combosLine)).toContain(
      "(by EDHREC decklist count) using this commander that fit its color identity, from Commander Spellbook.",
    );

    const finishes = words(section(html, "Top finishes"));
    const floor = finishes.indexOf(
      "3 finishes placing top 16 at 16+ player events with this commander. Results from",
    );
    expect(floor).toBeGreaterThan(finishes.indexOf("</ul>"));
    expect(finishes.indexOf("All 3 finishes →")).toBeGreaterThan(floor);
    expect(finishes).toContain("Topdeck.gg");
    expect(html).toContain("https://topdeck.gg/event/");
  });

  it("renders every staple in the HTML, the rows past 25 hidden behind Show all 100; the pinned CTAs and credits hold", async () => {
    const html = await renderHub();
    const staples = section(html, "Staples");
    expect(staples.match(/<tr[ >]/g)).toHaveLength(101); // the header row and all 100
    expect(staples.match(/<tr hidden=""/g)).toHaveLength(75);
    expect(staples.match(/href="\/cards\/[0-9a-f-]+"/g)).toHaveLength(100);
    expect(staples).toMatch(/<button[^>]*>Show all <!-- -->100<\/button>/);
    expect(html).toMatch(
      /<a[^>]*href="\/decks\/new\?game=mtg&amp;leader=oracle-atraxa"[^>]*>Build with this commander<\/a>/,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/decks\/new\?game=mtg&amp;leader=oracle-atraxa&amp;autofill=1"[^>]*>Start with a starter shell<\/a>/,
    );
    expect(html).toMatch(
      /<a[^>]*href="\/decks\/new\?game=mtg&amp;leader=oracle-atraxa&amp;combo=1234-5678&amp;autofill=1"[^>]*>Build around this combo<\/a>/,
    );
    for (const credit of ["Scryfall", "EDHREC", "Commander Spellbook", "Topdeck.gg", "MTGJSON"]) {
      expect(html).toContain(credit);
    }
  });
});
