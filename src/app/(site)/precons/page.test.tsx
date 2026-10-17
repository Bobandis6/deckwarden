// @vitest-environment node
/**
 * /precons (W8b; LATER row 151), rendered the way the server renders it:
 * the real page with its two loaders mocked and the real Magic adapter
 * reading each precon. Every tile says its bracket read in the server HTML
 * (its share page's words), the bracket filter's chips are there for the
 * bands the precons fall in, the facts are loaded once for the page (never
 * per tile), and the page is ISR for a day with no request data.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { PreconBracketFacts, PreconIndexRow } from "@/lib/decks/precons";
import { card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import type { BracketFreshness } from "@/lib/games/types";

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
  },
};

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

const PRECONS: { row: PreconIndexRow; commander: MtgCard; specials: MtgCard[] }[] = [
  { name: "Breed Lethality", date: "2016-11-11", specials: [rhystic] },
  { name: "Counterpunch", date: "2011-06-17", specials: [] },
  { name: "Merciless Rage", date: "2019-08-23", specials: [dockside] },
].map(({ name, date, specials }, i) => {
  const slug = name.toLowerCase().replace(/ /g, "_");
  const commander = leader(`${name} Commander`);
  return {
    commander,
    specials,
    row: {
      id: `00000000-0000-4000-9000-00000000000${i}`,
      publicId: `p_${slug}`,
      name,
      ciMask: 0,
      leaderIds: [commander.id],
      slug,
      setCode: "C16",
      setName: "Commander 2016",
      releaseDate: date,
      printingId: null,
      imageOverride: null,
      estUsd: 97,
    },
  };
});

function facts(): PreconBracketFacts {
  const entries = new Map<string, EditorEntry[]>();
  const cards = new Map<string, EditorCard>();
  for (const { row, commander, specials } of PRECONS) {
    const main = [...specials, ...fillers(99 - specials.length)];
    entries.set(row.id, [
      { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
      ...main.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
    ]);
    for (const c of [commander, ...main]) cards.set(c.id, { ...c, image: null });
  }
  return { entries, cards, combos: new Map(), freshness: FRESH };
}

const loadPreconIndex = vi.fn(async () => ({
  rows: PRECONS.map((p) => p.row),
  leaderNames: new Map(PRECONS.map((p) => [p.commander.id, p.commander.name])),
}));
const loadPreconBracketFacts = vi.fn(async (adapter: unknown) => {
  void adapter;
  return facts();
});
vi.mock("@/lib/decks/precons", () => ({ loadPreconIndex, loadPreconBracketFacts }));

const { default: PreconsPage, metadata, revalidate } = await import("./page");

describe("/precons", () => {
  it("server HTML: every tile says its precon's bracket read, in its share page's words", async () => {
    const html = renderToString(await PreconsPage());
    const tiles = html.match(/data-slot="deck-tile"/g) ?? [];
    const lines = [...html.matchAll(/data-slot="tile-bracket"[^>]*>(.*?)<\/p>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ""),
    );
    expect(tiles).toHaveLength(3);
    // Newest first: Merciless Rage (2019), Breed Lethality (2016), Counterpunch (2011).
    expect(lines).toEqual([
      "Bracket read needs a legal list · 1 banned card",
      "At least Bracket 3 (Upgraded)",
      "Bracket 1 to 2 · nothing here goes past Core",
    ]);
    // The facts are read once for the page, never per tile.
    expect(loadPreconBracketFacts).toHaveBeenCalledTimes(1);
    expect((loadPreconBracketFacts.mock.calls[0][0] as { id: string }).id).toBe("mtg");
  });

  it("server HTML: the bracket filter, named by the adapter's noun, a chip per band in use", async () => {
    const html = renderToString(await PreconsPage());
    expect(html).toMatch(/role="group" aria-labelledby="precons-bracket"/);
    expect(html).toMatch(/<span id="precons-bracket"[^>]*>Bracket<\/span>/);
    const group = html.slice(html.indexOf('aria-labelledby="precons-bracket"'));
    const chips = [...group.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g)]
      .slice(0, 3)
      .map((m) => [m[2], m[1]]);
    expect(chips).toEqual([
      ["All", "true"],
      ["1 to 2", "false"],
      ["3", "false"],
    ]);
  });

  it("is ISR for a day, with its own title and canonical", () => {
    expect(revalidate).toBe(86400);
    expect(metadata.title).toBe("Precons");
    expect(metadata.alternates?.canonical).toBe("/precons");
  });

  it("takes no request data: the page reads no searchParams", () => {
    // A page that awaits searchParams, headers() or cookies() renders on
    // every hit — the build's ○ is the proof; this pins the signature.
    expect(PreconsPage.length).toBe(0);
  });
});
