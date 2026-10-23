// @vitest-environment node
/**
 * /brackets (BRACKETS-PAGE), rendered the way the server renders it: the
 * real page with its two loaders mocked and the real Magic adapter. The
 * five levels come off the reviewed table (a changed table changes the
 * page), the Game Changers come from the list loader with their card-page
 * links, the precon spread is counted from the facts at render, a stale or
 * unread feed says so, the door is the editor's paste import, the page is
 * ISR for a day with no request data, and every word in it passes the copy
 * rules (WAVE4 D0, WAVE5 D0).
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BracketListCard } from "@/lib/brackets/list";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { PreconBracketFacts } from "@/lib/decks/precons";
import { card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import type { BracketFreshness, FeedFreshness } from "@/lib/games/types";

const AT = "2026-10-20T15:21:12.743Z";
const fresh = (gameChangers: FeedFreshness): BracketFreshness => ({
  readAt: "2026-10-23T12:00:00.000Z",
  feeds: {
    gameChangers,
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
  },
});
const FRESH = fresh({ state: "ok", asOf: AT, detail: "53 cards" });

const leader = (name: string) =>
  card({
    name,
    isLeaderCandidate: true,
    attrs: { type_line: "Legendary Creature — Test", oracle_text: "" },
  });
const rhystic = card({
  name: "Rhystic Study",
  attrs: { type_line: "Enchantment", oracle_text: "", game_changer: true },
});
const dockside = card({ name: "Dockside Extortionist", legality: [{ status: "banned" }] });

/** Four precons: two with nothing flagged, one holding a Game Changer, one with a banned card. */
const PRECONS: { specials: MtgCard[] }[] = [
  { specials: [] },
  { specials: [rhystic] },
  { specials: [dockside] },
  { specials: [] },
];

function facts(freshness: BracketFreshness | null = FRESH): PreconBracketFacts {
  const entries = new Map<string, EditorEntry[]>();
  const cards = new Map<string, EditorCard>();
  PRECONS.forEach(({ specials }, i) => {
    const commander = leader(`Precon Commander ${i}`);
    const main = [...specials, ...fillers(99 - specials.length)];
    entries.set(`00000000-0000-4000-9000-00000000000${i}`, [
      { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
      ...main.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
    ]);
    for (const c of [commander, ...main]) cards.set(c.id, { ...c, image: null });
  });
  return { entries, cards, combos: new Map(), freshness };
}

const RIFT = "22222222-2222-4222-8222-222222222222";
const RHYSTIC = "11111111-1111-4111-8111-111111111111";
const LIST: BracketListCard[] = [
  { id: RIFT, name: "Cyclonic Rift", image: null },
  {
    id: RHYSTIC,
    name: "Rhystic Study",
    image: "https://cards.scryfall.io/small/front/a/b/abcdef12-3456-4789-8abc-def123456789.jpg",
  },
];

let factsNow: PreconBracketFacts = facts();
const loadBracketListCards = vi.fn(async (adapter: unknown) => {
  void adapter;
  return LIST;
});
const loadPreconBracketFacts = vi.fn(async (adapter: unknown) => {
  void adapter;
  return factsNow;
});
vi.mock("@/lib/brackets/list", () => ({ loadBracketListCards }));
vi.mock("@/lib/decks/precons", () => ({ loadPreconBracketFacts }));

const { default: BracketsPage, metadata, revalidate } = await import("./page");

const render = async () => renderToString(await BracketsPage());

/** The text of the main element, one line per block (headings, paragraphs, items, cells). */
function blocks(html: string): string[] {
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  return main
    .replace(
      /<\/?(?:h[1-6]|p|li|dt|dd|td|th|div|section|ol|ul|dl|table|thead|tbody|tr)\b[^>]*>/g,
      "\n",
    )
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** One level's card, from its `<li` to the next level's. */
function levelCard(html: string, level: number): string {
  const at = html.lastIndexOf("<li", html.indexOf(`data-level="${level}"`));
  return html.slice(at, html.indexOf("</li>", at) + "</li>".length);
}

/** The list's captions, in order (an image-less card's box repeats the name, aria-hidden). */
const names = (html: string) =>
  [...html.matchAll(/data-slot="list-card-name"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("/brackets: the five levels", () => {
  it("one card per level, its name and its rows from the reviewed table", async () => {
    const html = await render();
    const levels = [...html.matchAll(/data-slot="bracket-level" data-level="(\d)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(levels).toEqual([1, 2, 3, 4, 5]);
    const lines = blocks(html);
    for (const name of [
      "Bracket 1 (Exhibition)",
      "Bracket 2 (Core)",
      "Bracket 3 (Upgraded)",
      "Bracket 4 (Optimized)",
      "Bracket 5 (cEDH)",
    ]) {
      expect(lines).toContain(name);
    }
    const three = levelCard(html, 3);
    expect(blocks(`<main>${three}</main>`)).toEqual([
      "Bracket 3 (Upgraded)",
      "Game Changers",
      "Up to three",
      "Mass land denial",
      "None",
      "Extra turns",
      "A few, never chained or looped",
      "Two-card combos",
      "None before turn 6",
      "Games last",
      "At least 6 turns",
    ]);
    expect(lines).toContain(
      "With none of these cards, a list reads Bracket 1 to 2: Exhibition and Core then differ only by intent, which the cards can't show.",
    );
    // Wizards' page with the rules' own date.
    expect(html).toContain('href="https://magic.wizards.com/en/formats/commander#brackets"');
    expect(lines).toContain(
      "From Wizards' Commander Brackets as of Nov 5, 2025, the rules the read applies.",
    );
  });
});

describe("/brackets: the Game Changers", () => {
  it("the loader's cards, each linking its card page, the count found, the revision and the last check", async () => {
    const html = await render();
    const links = [...html.matchAll(/data-slot="list-card"><a[^>]*href="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(links).toEqual([`/cards/${RIFT}`, `/cards/${RHYSTIC}`]);
    expect(names(html)).toEqual(["Cyclonic Rift", "Rhystic Study"]);
    const lines = blocks(html);
    // The small rendition, lazy, never priority; the image-less card shows its name in the box.
    expect(html).toMatch(
      /<img[^>]*src="https:\/\/cards\.scryfall\.io\/small\/front\/a\/b\/abcdef12-3456-4789-8abc-def123456789\.jpg"[^>]*loading="lazy"/,
    );
    expect(lines).toContain(
      "Brackets 1 and 2 allow none, Bracket 3 up to three, Brackets 4 and 5 any number.",
    );
    expect(lines).toContain(
      "Wizards' list as of Feb 9, 2026 named 53 cards. Scryfall flagged these 2 cards at the last check, Oct 20, 2026.",
    );
    expect(html).toContain('href="https://magic.wizards.com/en/formats/commander#gamechangers"');
    expect(loadBracketListCards).toHaveBeenCalled();
    expect((loadBracketListCards.mock.calls[0][0] as { id: string }).id).toBe("mtg");
  });

  it("a stale feed is shown and said to be stale; an unread one says so; the list stays", async () => {
    factsNow = facts(fresh({ state: "stale", asOf: "2026-10-01T15:00:00.000Z" }));
    try {
      const stale = blocks(await render());
      expect(stale).toContain(
        "Wizards' list as of Feb 9, 2026 named 53 cards. Scryfall flagged these 2 cards at the last check, Oct 1, 2026. That check is out of date, so the list may have changed since.",
      );
      expect(names(await render())).toHaveLength(2);
      factsNow = facts(fresh({ state: "missing", asOf: null }));
      const missing = blocks(await render());
      expect(missing).toContain(
        "Wizards' list as of Feb 9, 2026 named 53 cards. The card data flags these 2 cards. When the flags were last checked couldn't be read.",
      );
      expect(names(await render())).toHaveLength(2);
    } finally {
      factsNow = facts();
    }
  });
});

describe("/brackets: how the read works, and every precon read", () => {
  it("the read's own assumption lines and the questions only the player answers", async () => {
    const lines = blocks(await render());
    expect(lines).toContain(
      "Tutors and fast mana don't change the read. Wizards dropped tutor limits in October 2025.",
    );
    expect(lines).toContain("Game Changers: Wizards' list as of Oct 20, 2026.");
    for (const q of [
      "Theme first, over power?",
      "Staples and high card quality?",
      "Can it usually win or lock the table before turn 6?",
      "Tuned for the cEDH metagame?",
    ]) {
      expect(lines).toContain(q);
    }
    expect(lines).toContain("Optional: answer what you know. An answer can only raise the read.");
    expect(lines).toContain("Reads the card list only; combos via Commander Spellbook.");
  });

  it("the spread, counted at render from the facts: each tile's line, then what puts them higher", async () => {
    const html = await render();
    const table = (slot: string) => {
      const at = html.indexOf(`data-slot="${slot}"`);
      return [...html.slice(at, html.indexOf("</table>", at)).matchAll(/<tr[^>]*>(.*?)<\/tr>/g)]
        .slice(1)
        .map((row) => [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1]));
    };
    expect(table("precon-spread")).toEqual([
      ["Bracket 1 to 2 · nothing here goes past Core", "2"],
      ["At least Bracket 3 (Upgraded)", "1"],
      ["Bracket read needs a legal list · 1 banned card", "1"],
    ]);
    expect(table("precon-reasons")).toEqual([["A Game Changer", "1"]]);
    const lines = blocks(html);
    expect(lines).toContain("1 precon reads higher than Bracket 1 to 2. What puts it there:");
    expect(lines.some((l) => l.endsWith("What the read says today about all 4:"))).toBe(true);
    expect(html).toContain('href="/precons"');
    expect(loadPreconBracketFacts).toHaveBeenCalled();
  });
});

describe("/brackets: the door and the sources", () => {
  it("Check a deck opens the editor's paste import; Start from a precon its index", async () => {
    const html = await render();
    const door = html.slice(html.indexOf('data-slot="bracket-door"'));
    expect(door).toMatch(
      /<a[^>]*href="\/decks\/new\?game=mtg&amp;import=1"[^>]*>Check a deck<\/a>/,
    );
    expect(door).toMatch(/<a[^>]*href="\/precons"[^>]*>Start from a precon<\/a>/);
    for (const href of [
      "https://scryfall.com",
      "https://tagger.scryfall.com",
      "https://commanderspellbook.com",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(blocks(html)).toContain(
      "Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.",
    );
  });
});

describe("/brackets: caching and metadata", () => {
  it("is ISR for a day, with its own title, description and canonical", () => {
    expect(revalidate).toBe(86400);
    expect(metadata.title).toBe("Commander brackets");
    expect(metadata.alternates?.canonical).toBe("/brackets");
    expect(metadata.description).toMatch(/Game Changers/);
  });

  it("takes no request data: the page reads no searchParams", () => {
    // A page that awaits searchParams, headers() or cookies() renders on
    // every hit; the build's ○ is the proof, this pins the signature.
    expect(BracketsPage.length).toBe(0);
  });

  it("one h1, the page's title; one h2 per section", async () => {
    const html = await render();
    expect(html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1]).toBe("Commander brackets");
    expect([...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1])).toEqual([
      "What each bracket allows",
      "The Game Changers",
      "How Deckwarden reads a deck",
      "Read your own deck",
      "Sources",
    ]);
  });
});

describe("copy guard (WAVE4 D0, WAVE5 D0): every word on the page", () => {
  it("reads real words", async () => {
    expect((await render()).length).toBeGreaterThan(5000);
    expect(blocks(await render()).length).toBeGreaterThan(60);
  });

  it("no em or en dash, no digit range; at most one middle dot a line", async () => {
    const lines = blocks(await render());
    expect(lines.filter((l) => /[–—]|\d-\d/.test(l))).toEqual([]);
    expect(lines.filter((l) => l.split("·").length > 2)).toEqual([]);
  });

  it("plain words: no notation, no approve, no Spellbook tag names", async () => {
    const lines = blocks(await render());
    expect(lines.filter((l) => /\d\+|est\./i.test(l))).toEqual([]);
    expect(lines.filter((l) => /approv/i.test(l))).toEqual([]);
    expect(
      lines.filter((l) => /ruthless|spicy|powerful|oddball|precon appropriate|casual/i.test(l)),
    ).toEqual([]);
  });
});

describe("/brackets follows the reviewed table", () => {
  it("a changed allowance changes the page", async () => {
    vi.resetModules();
    vi.doMock("@/lib/games/mtg/bracket-ruleset", async (importOriginal) => {
      const real = await importOriginal<typeof import("@/lib/games/mtg/bracket-ruleset")>();
      return {
        ...real,
        BRACKET_RULESET: {
          ...real.BRACKET_RULESET,
          levels: real.BRACKET_RULESET.levels.map((l) =>
            l.level === 3 ? { ...l, gameChangers: 4 } : l,
          ),
        },
      };
    });
    try {
      const { default: Changed } = await import("./page");
      const lines = blocks(renderToString(await Changed()));
      expect(lines).toContain(
        "Brackets 1 and 2 allow none, Bracket 3 up to four, Brackets 4 and 5 any number.",
      );
      const html = renderToString(await Changed());
      const three = levelCard(html, 3);
      expect(three).toContain("Up to four");
      expect(three).not.toContain("Up to three");
    } finally {
      vi.doUnmock("@/lib/games/mtg/bracket-ruleset");
      vi.resetModules();
    }
  });
});
