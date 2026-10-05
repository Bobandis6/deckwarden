/**
 * Y4a — the Why sheet (WAVE4 D5): its two blocks from real Magic reads —
 * What the cards show (each finding's sentence, what would change it and its
 * linked source; a combo's results, piece count and walkthrough; "Your call"
 * as open questions with no answer controls; "Couldn't check") and What this
 * read assumes (the fixed lines, the rules' page and date, the Commander
 * Spellbook credit) — D0's attribution, the Drawer on phones, and D0's copy
 * guard over everything the sheet renders.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import {
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { addMorePhrase, deckProgress } from "@/lib/decks/progress";
import type { BracketFreshness, BracketRead, CompleteCombo } from "@/lib/games/types";

import { BracketSheet } from "./bracket-sheet";

const mtg = getAdapter("mtg");

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT, detail: "53 cards" },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT, detail: "bulk 7.1.4" },
  },
};

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({ ...over, name, attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs } });
const kiki = named("Kiki-Jiki, Mirror Breaker", {}, { isLeaderCandidate: true });
const conscripts = named("Zealous Conscripts");
const rhystic = named("Rhystic Study", { game_changer: true });
const armageddon = named("Armageddon", { mld: "clear" });
const liliana = named("Liliana of the Veil", { mld: "edge" });
const timeWarp = named("Time Warp", { extra_turn: true });
const temporal = named("Temporal Manipulation", { extra_turn: true });

const kikiCombo: CompleteCombo = {
  key: "618-1537",
  cardPieces: [kiki.id, conscripts.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite creature tokens with haste", "Infinite death triggers"],
  popularity: 28185,
};

function spec(specials: MtgCard[], size = 100) {
  const fill = fillers(Math.max(0, size - 1 - specials.length));
  const deck = commanderDeck(
    [kiki],
    [...specials, ...fill].map((c) => entry(c)),
  );
  return { deck, cards: cardMap([kiki, ...specials, ...fill]) };
}

function sheet(
  list: ReturnType<typeof spec>,
  {
    combos = [kikiCombo],
    freshness = FRESH,
    phone = false,
  }: { combos?: CompleteCombo[] | null; freshness?: BracketFreshness | null; phone?: boolean } = {},
) {
  const read: BracketRead = mtg.brackets!.assess({
    deck: list.deck,
    cards: list.cards,
    combos,
    freshness,
  });
  const entries = Object.entries(list.deck.zones).flatMap(([zone, es]) =>
    es.map((e) => ({ ...e, zone })),
  );
  const line = mtg.brackets!.line(read, {
    deck: list.deck,
    cards: list.cards,
    progress: addMorePhrase(deckProgress(entries, COMMANDER).toGo),
  });
  const onClose = vi.fn();
  render(
    <BracketSheet
      adapter={mtg}
      read={read}
      line={line}
      combos={combos}
      cards={list.cards}
      phone={phone}
      onClose={onClose}
    />,
  );
  return { read, line, onClose };
}

const dialog = () => screen.getByRole("dialog", { name: "Why this bracket?" });
const block = (name: string) => within(dialog()).getByRole("region", { name });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Why sheet — What the cards show", () => {
  it("leads with the line's own words; every finding names its cards and its reason, what would change it, and its source", () => {
    sheet(spec([conscripts, rhystic, armageddon]));
    expect(within(dialog()).getByText("At least Bracket 4 (Optimized)")).toBeTruthy();
    const cardsShow = block("What the cards show");

    const land = cardsShow.querySelector<HTMLElement>("[data-factor=land-denial]")!;
    expect(land.textContent).toContain("Mass land denial: Armageddon. Brackets 1–3 expect none.");
    expect(land.textContent).toContain("Remove Armageddon to fit Bracket 3.");
    const tagger = within(land).getByRole("link", { name: /Community-tagged on Scryfall Tagger/ });
    expect(tagger.getAttribute("href")).toBe(
      "https://tagger.scryfall.com/tags/card/mass-land-denial",
    );
    expect(tagger.getAttribute("target")).toBe("_blank");

    const gc = cardsShow.querySelector<HTMLElement>("[data-factor=game-changers]")!;
    expect(gc.textContent).toContain("1 Game Changer: Rhystic Study.");
    expect(gc.textContent).toContain("Remove Rhystic Study to fit Bracket 2.");
    expect(
      within(gc)
        .getByRole("link", { name: /Wizards' Game Changers list \(via Scryfall\)/ })
        .getAttribute("href"),
    ).toBe("https://magic.wizards.com/en/formats/commander#gamechangers");
  });

  it("a combo shows what it does, its piece count and How it works ↗ — the combo-seeded draft's combo too", () => {
    sheet(spec([conscripts], 2));
    expect(within(dialog()).getByText("Bracket: add 98 more cards · 1 combo so far")).toBeTruthy();
    expect(
      within(dialog()).getByText("The list isn't finished — this is what the cards show so far."),
    ).toBeTruthy();
    const row = block("What the cards show").querySelector<HTMLElement>(
      "[data-factor='combo:618-1537']",
    )!;
    expect(row.textContent).toContain(
      "Two-card combo with your commander: Kiki-Jiki, Mirror Breaker + Zealous Conscripts. Brackets 1 and 2 expect none.",
    );
    expect(row.textContent).toContain(
      "Infinite creature tokens with haste · Infinite death triggers · 2 cards · How it works",
    );
    expect(
      within(row)
        .getByRole("link", { name: /How it works/ })
        .getAttribute("href"),
    ).toBe("https://commanderspellbook.com/combo/618-1537/");
    expect(row.textContent).toContain("Remove Zealous Conscripts to fit Bracket 2.");
  });

  it("nothing found says so plainly", () => {
    sheet(spec([]), { combos: [] });
    expect(
      within(block("What the cards show")).getByText("Nothing in this list raises the bracket."),
    ).toBeTruthy();
  });

  it("Your call: open questions with what a yes would mean — no answer controls (Y4b stores answers)", () => {
    sheet(spec([liliana, timeWarp, temporal]), { combos: [] });
    const cardsShow = block("What the cards show");
    expect(within(cardsShow).getByText("Your call")).toBeTruthy();
    expect(
      within(cardsShow).getByText("The list can't answer these — you and your table can."),
    ).toBeTruthy();
    const chain = cardsShow.querySelector<HTMLElement>("[data-question^='extra-turns:']")!;
    expect(within(chain).getByText("Do these extra turns chain?")).toBeTruthy();
    // The reason doesn't name the cards, so the row does.
    expect(within(chain).getByText("Temporal Manipulation, Time Warp")).toBeTruthy();
    expect(within(chain).getByText("If yes, it's at least Bracket 4 (Optimized).")).toBeTruthy();
    const land = cardsShow.querySelector<HTMLElement>("[data-question^='land-denial:']")!;
    expect(within(land).getByText("Does it deny lands the way Armageddon does?")).toBeTruthy();
    // Its reason already names Liliana — no second list.
    expect(within(land).queryByText("Liliana of the Veil")).toBeNull();
    // Open questions only: nothing to press.
    expect(within(cardsShow).queryAllByRole("button")).toEqual([]);
    expect(within(cardsShow).queryAllByRole("radio")).toEqual([]);
    expect(within(dialog()).queryByRole("button", { name: /^(Yes|No|Not sure)$/ })).toBeNull();
  });

  it("Couldn't check: what was missing, never a lower number", () => {
    sheet(spec([rhystic]), {
      combos: null,
      freshness: {
        ...FRESH,
        feeds: { ...FRESH.feeds, extraTurns: { state: "stale", asOf: "2026-09-01T00:00:00Z" } },
      },
    });
    const cardsShow = block("What the cards show");
    expect(within(cardsShow).getByText("Couldn't check")).toBeTruthy();
    expect(
      within(cardsShow).getByText(
        "Couldn't check extra turns: Scryfall Tagger's list hasn't refreshed since Sep 1, 2026.",
      ),
    ).toBeTruthy();
    expect(within(cardsShow).getByText("Couldn't check combos.")).toBeTruthy();
    expect(
      within(dialog()).getByText(/^At least Bracket 3 \(Upgraded\) · Couldn't check/),
    ).toBeTruthy();
  });
});

describe("the Why sheet — What this read assumes", () => {
  it("the adapter's fixed lines, the rules' page with its as-of date, and the Commander Spellbook credit", () => {
    const { read } = sheet(spec([conscripts]));
    const assumes = block("What this read assumes");
    expect(read.assumptions).toHaveLength(7);
    for (const line of read.assumptions) expect(within(assumes).getByText(line)).toBeTruthy();
    expect(
      within(assumes).getByText(/Game Changers: Wizards' list as of Oct 4, 2026\./),
    ).toBeTruthy();
    const rules = within(assumes).getByRole("link", {
      name: /Wizards' Commander Brackets, as of Feb 9, 2026/,
    });
    expect(rules.getAttribute("href")).toBe(
      "https://magic.wizards.com/en/formats/commander#brackets",
    );
    const credit = within(assumes).getByRole("link", {
      name: /Combos and their ratings from Commander Spellbook/,
    });
    expect(credit.getAttribute("href")).toBe("https://commanderspellbook.com");
  });
});

describe("the sheet's shape", () => {
  it("from md: the Modal, titled by the adapter's noun", () => {
    sheet(spec([]));
    expect(dialog()).toBeTruthy();
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeNull();
  });

  it("on a phone: the bottom Drawer with the same content and a 44 px Close", () => {
    sheet(spec([conscripts]), { phone: true });
    const popup = document.querySelector<HTMLElement>("[data-slot=drawer-popup]")!;
    expect(within(popup).getByText("Why this bracket?")).toBeTruthy();
    expect(within(popup).getByText("What the cards show")).toBeTruthy();
    expect(within(popup).getByRole("button", { name: "Close" }).className).toContain(
      "pointer-coarse:size-11",
    );
  });

  it("One Piece declares no read: nothing renders", () => {
    const list = spec([]);
    const read = mtg.brackets!.assess({
      deck: list.deck,
      cards: list.cards,
      combos: [],
      freshness: FRESH,
    });
    const { container } = render(
      <BracketSheet
        adapter={getAdapter("optcg")}
        read={read}
        line="x"
        combos={[]}
        cards={list.cards}
        phone={false}
        onClose={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("copy guard (WAVE4 D0) — everything the sheet renders", () => {
  it.each([
    ["nothing flagged", () => sheet(spec([]), { combos: [] })],
    ["findings and a combo", () => sheet(spec([conscripts, rhystic, armageddon]))],
    ["questions", () => sheet(spec([liliana, timeWarp, temporal]), { combos: [] })],
    ["gaps", () => sheet(spec([rhystic]), { combos: null, freshness: null })],
    ["a draft", () => sheet(spec([conscripts], 2))],
  ])("%s: no 'approve', no Spellbook tag name", (_label, open) => {
    open();
    const text = document.body.textContent ?? "";
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/approv/i);
    expect(text).not.toMatch(/ruthless|spicy|powerful|oddball|precon appropriate|casual/i);
  });
});
