/**
 * Y4a — the Why sheet (WAVE4 D5): its two blocks from real Magic reads —
 * What the cards show (each finding's sentence, what would change it and its
 * linked source; a combo's results, piece count and walkthrough; "Your call"
 * as open questions with no answer controls; "Couldn't check") and What this
 * read assumes (the fixed lines, the rules' page and date, the Commander
 * Spellbook credit) — D0's attribution, the Drawer on phones, and D0's copy
 * guard over everything the sheet renders.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BRACKET_COPY } from "@/lib/brackets/copy";
import { COMMANDER } from "@/lib/games/mtg/formats";
import {
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { goalsPatchBody, type DeckGoals } from "@/lib/decks/goals";
import type { FitEstimate } from "@/lib/recommend/fit";
import { addMorePhrase, deckProgress } from "@/lib/decks/progress";
import type {
  BracketFreshness,
  BracketRead,
  BracketSpeedFacts,
  CompleteCombo,
  GameAdapter,
} from "@/lib/games/types";

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

/** Kiki-Jiki, the specials, a real list's lands (36 unless said; BRACKET-SPEED counts them), fillers to `size`. */
function spec(specials: MtgCard[], size = 100, landCount = 36) {
  const room = Math.max(0, size - 1 - specials.length);
  const lands = basicLands(Math.min(landCount, room));
  const fill = fillers(room - lands.length);
  const main = [...specials, ...lands, ...fill];
  const deck = commanderDeck(
    [kiki],
    main.map((c) => entry(c)),
  );
  return { deck, cards: cardMap([kiki, ...main]) };
}

function sheet(
  list: ReturnType<typeof spec>,
  {
    combos = [kikiCombo],
    freshness = FRESH,
    phone = false,
    goals,
    estimate,
    onGoalsChange,
    onSwapCard,
    canSwap,
    speed = mtg.brackets!.speed!.facts(list.deck, list.cards),
    linkPreviews,
  }: {
    combos?: CompleteCombo[] | null;
    freshness?: BracketFreshness | null;
    phone?: boolean;
    /** Y4b: the deck's goals — the read is assessed with them, as the editor does. */
    goals?: DeckGoals | null;
    /** Y8: the deck's estimate beside a total. */
    estimate?: FitEstimate | null;
    onGoalsChange?: (next: DeckGoals | null) => void;
    /** Y7b: the callout's swaps. */
    onSwapCard?: (cardId: string) => void;
    canSwap?: (cardId: string) => boolean;
    /** BRACKET-SPEED: the list's facts, as the editor and the share page hand them (the adapter's by default). */
    speed?: BracketSpeedFacts | null;
    /** LATER row 306: the deck's link previews draw its target (the editor: any deck but a private one). */
    linkPreviews?: boolean;
  } = {},
) {
  const read: BracketRead = mtg.brackets!.assess({
    deck: list.deck,
    cards: list.cards,
    combos,
    freshness,
    targetLevel: goals?.targetLevel ?? null,
    answers: goals?.answers ?? null,
  });
  const entries = Object.entries(list.deck.zones).flatMap(([zone, es]) =>
    es.map((e) => ({ ...e, zone })),
  );
  const line = mtg.brackets!.line(read, {
    deck: list.deck,
    cards: list.cards,
    progress: addMorePhrase(deckProgress(entries, COMMANDER).toGo),
    targetLevel: goals?.targetLevel ?? null,
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
      goals={goals}
      estimate={estimate}
      onGoalsChange={onGoalsChange}
      onSwapCard={onSwapCard}
      canSwap={canSwap}
      speed={speed}
      linkPreviews={linkPreviews}
      onClose={onClose}
    />,
  );
  return { read, line, onClose };
}

const dialog = () => screen.getByRole("dialog", { name: "Why this bracket?" });
const block = (name: string) => within(dialog()).getByRole("region", { name });

/**
 * TARGET-CHANGES: the editor's loop around the sheet — the goals in state,
 * the read re-assessed with them on every render (deck-editor's
 * `bracketRead` memo takes them), so a pick's callout reads the read the
 * sheet renders after it. `open` false unmounts the sheet, as closing it does.
 */
function Owner({
  list,
  initial = null,
  combos = [],
  adapter = mtg,
  phone = false,
  linkPreviews = true,
  open = true,
  onGoals,
}: {
  list: ReturnType<typeof spec>;
  initial?: DeckGoals | null;
  combos?: CompleteCombo[];
  adapter?: GameAdapter;
  phone?: boolean;
  linkPreviews?: boolean;
  open?: boolean;
  onGoals?: (next: DeckGoals | null) => void;
}) {
  const [goals, setGoals] = useState(initial);
  if (!open) return null;
  const targetLevel = goals?.targetLevel ?? null;
  const read = mtg.brackets!.assess({
    deck: list.deck,
    cards: list.cards,
    combos,
    freshness: FRESH,
    targetLevel,
    answers: goals?.answers ?? null,
  });
  return (
    <BracketSheet
      adapter={adapter}
      read={read}
      line={mtg.brackets!.line(read, {
        deck: list.deck,
        cards: list.cards,
        progress: null,
        targetLevel,
      })}
      combos={combos}
      cards={list.cards}
      phone={phone}
      goals={goals}
      onGoalsChange={(next) => {
        onGoals?.(next);
        setGoals(next);
      }}
      linkPreviews={linkPreviews}
      onClose={() => {}}
    />
  );
}

/** Your target's block, wherever the sheet is (the Modal, or the Drawer on a phone). */
const targetBlock = () => document.querySelector<HTMLElement>("[data-slot=bracket-target]")!;
const choice = (label: string) =>
  within(within(targetBlock()).getByRole("group", { name: "Your target" })).getByRole("button", {
    name: label,
  });
const changeCallout = () =>
  targetBlock().querySelector<HTMLElement>("[data-slot=bracket-target-change]");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Why sheet — What the cards show", () => {
  it("leads with the line's own words; every finding names its cards and its reason, what would change it, and its source", () => {
    sheet(spec([conscripts, rhystic, armageddon]));
    expect(within(dialog()).getByText("At least Bracket 4 (Optimized)")).toBeTruthy();
    const cardsShow = block("What the cards show");

    const land = cardsShow.querySelector<HTMLElement>("[data-factor=land-denial]")!;
    expect(land.textContent).toContain(
      "Mass land denial: Armageddon. Brackets 1 to 3 expect none.",
    );
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
      within(dialog()).getByText("The list isn't finished. This is what the cards show so far."),
    ).toBeTruthy();
    const row = block("What the cards show").querySelector<HTMLElement>(
      "[data-factor='combo:618-1537']",
    )!;
    expect(row.textContent).toContain(
      "Two-card combo with your commander: Kiki-Jiki, Mirror Breaker + Zealous Conscripts. Brackets 1 and 2 expect none.",
    );
    expect(row.textContent).toContain(
      "Infinite creature tokens with haste, Infinite death triggers, 2 cards · How it works",
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
      within(cardsShow).getByText("The list can't answer these. You and your table can."),
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

  it("BRACKETS-PAGE: How brackets work links the site's guide, on its own line, in the same tab", () => {
    sheet(spec([conscripts]));
    const assumes = block("What this read assumes");
    const guide = within(assumes).getByRole("link", { name: "How brackets work" });
    expect(guide.getAttribute("href")).toBe("/brackets");
    expect(guide.getAttribute("target")).toBeNull();
    // Its own paragraph: the sources line keeps its one middle dot and its two links.
    expect(guide.closest("p")!.textContent).toBe("How brackets work");
    const sources = within(assumes)
      .getByRole("link", { name: /Wizards' Commander Brackets/ })
      .closest("p")!;
    expect(sources.querySelectorAll("a")).toHaveLength(2);
    expect(sources.textContent!.split(" · ")).toHaveLength(2);
    // Every link in the block: the guide, then Wizards' rules, then the combo credit.
    expect(
      within(assumes)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual([
      "/brackets",
      "https://magic.wizards.com/en/formats/commander#brackets",
      "https://commanderspellbook.com",
    ]);
  });
});

describe("Y4b — the player's side of the sheet", () => {
  const pressed = (group: HTMLElement) =>
    within(group)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);
  const liliKey = `land-denial:${liliana.externalKey}`;

  it("without a way to change goals the sheet only reads — Y4a's sheet, no target, no How it plays", () => {
    sheet(spec([liliana]), { combos: [] });
    expect(within(dialog()).queryByRole("region", { name: "Your target" })).toBeNull();
    expect(within(dialog()).queryByText("How it plays")).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: "Yes" })).toBeNull();
  });

  it("Your target: Segmented 1–5 · Not set — Not set at first; a pick sets the level, Not set clears it", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([rhystic]), { combos: [], goals: null, onGoalsChange });
    const target = block("Your target");
    const group = within(target).getByRole("group", { name: "Your target" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["1", "2", "3", "4", "5", "Not set"]);
    expect(pressed(group)).toEqual(["Not set"]);
    fireEvent.click(within(group).getByRole("button", { name: "2" }));
    expect(onGoalsChange).toHaveBeenLastCalledWith({ v: 1, targetLevel: 2 });
  });

  it("Y8: a total alone shows the goals line with its running estimate — the owner's sheet only", () => {
    sheet(spec([]), {
      combos: [],
      goals: { v: 1, budget: { totalUsd: 150 } },
      estimate: { usd: 212, unpriced: 2 },
      onGoalsChange: vi.fn(),
    });
    expect(dialog().querySelector("[data-slot=goals-line]")?.textContent).toBe(
      "Your goals: est. $212 of your $150 (+2 unpriced) Change",
    );
    cleanup();
    // The share page's sheet (no onGoalsChange) never shows a budget.
    sheet(spec([]), { combos: [], goals: { v: 1, budget: { totalUsd: 150 } } });
    expect(dialog().querySelector("[data-slot=goals-line]")).toBeNull();
  });

  it("a target set: its name beside it; Not set clears it; other goals stay", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([]), {
      combos: [],
      goals: { v: 1, targetLevel: 3, exceptions: "Ask me" },
      onGoalsChange,
    });
    const target = block("Your target");
    const group = within(target).getByRole("group", { name: "Your target" });
    expect(pressed(group)).toEqual(["3"]);
    expect(within(target).getByText("Bracket 3 (Upgraded)")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Not set" }));
    expect(onGoalsChange).toHaveBeenLastCalledWith({ v: 1, exceptions: "Ask me" });
  });

  it("LATER row 306: the note says where the target shows; link previews only when they draw it (never for a private deck)", () => {
    const goals: DeckGoals = { v: 1, targetLevel: 3 };
    sheet(spec([]), { combos: [], goals, onGoalsChange: vi.fn(), linkPreviews: true });
    expect(
      within(block("Your target")).getByText(
        "Shown on your share page. Your target also shows in link previews and where the deck is listed.",
      ),
    ).toBeTruthy();
    cleanup();

    // The editor passes false for a private deck, and so does a caller that says nothing.
    sheet(spec([]), { combos: [], goals, onGoalsChange: vi.fn() });
    const target = block("Your target");
    expect(
      within(target).getByText(
        "Shown on your share page. Your target also shows where the deck is listed.",
      ),
    ).toBeTruthy();
    expect(target.textContent).not.toContain("link previews");
    cleanup();

    // The share page's sheet only reads: no target block, so no note at all.
    sheet(spec([]), { combos: [], goals, linkPreviews: true });
    expect(dialog().textContent).not.toContain("Shown on your share page");
    expect(dialog().textContent).not.toContain("link previews");
  });

  it("the conflict callout lists the read's conflicts — each finding's sentence and what would change it", () => {
    const { read } = sheet(spec([conscripts, rhystic, armageddon]), {
      goals: { v: 1, targetLevel: 2 },
      onGoalsChange: vi.fn(),
    });
    expect(
      within(dialog()).getByText("Your target: Bracket 2 · the cards say at least 4"),
    ).toBeTruthy();
    const callout = block("Your target").querySelector<HTMLElement>(
      "[data-slot=bracket-conflicts]",
    )!;
    expect(within(callout).getByText("Above your target")).toBeTruthy();
    expect(
      within(callout).getByText("Your target is Bracket 2 (Core). These put the deck above it:"),
    ).toBeTruthy();
    expect(read.conflicts).toEqual(["land-denial", "game-changers", "combo:618-1537"]);
    const rows = [...callout.querySelectorAll<HTMLElement>("[data-conflict]")];
    expect(rows.map((r) => r.dataset.conflict)).toEqual(read.conflicts);
    expect(rows[1].textContent).toContain("1 Game Changer: Rhystic Study.");
    expect(rows[1].textContent).toContain("Remove Rhystic Study to fit Bracket 2.");
    // The findings list above is untouched: the target never hides evidence.
    expect(
      block("What the cards show").querySelectorAll("[data-factor]").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("Y7b: each card a conflict names gets Swap {card}… where the editor can swap it — the commander and the lands get none", () => {
    const onSwapCard = vi.fn();
    const scapes = named("Armageddon Twin", { mld: "clear" }, { primaryType: "Land" });
    sheet(spec([conscripts, rhystic, armageddon, scapes]), {
      goals: { v: 1, targetLevel: 2 },
      onGoalsChange: vi.fn(),
      onSwapCard,
      // The editor's rule: a main-list card the adapter offers (never the commander or a land).
      canSwap: (id) => id !== kiki.id && id !== scapes.id,
    });
    const callout = block("Your target").querySelector<HTMLElement>(
      "[data-slot=bracket-conflicts]",
    )!;
    const swaps = within(callout)
      .getAllByRole("button")
      .map((b) => b.textContent);
    // Land denial names both — only the spell swaps; the combo's commander doesn't.
    expect(swaps).toEqual(["Swap Armageddon…", "Swap Rhystic Study…", "Swap Zealous Conscripts…"]);
    const denial = callout.querySelector<HTMLElement>('[data-conflict="land-denial"]')!;
    expect(denial.textContent).toContain("Armageddon Twin");
    const gc = callout.querySelector<HTMLElement>('[data-conflict="game-changers"]')!;
    fireEvent.click(within(gc).getByRole("button", { name: "Swap Rhystic Study…" }));
    expect(onSwapCard).toHaveBeenCalledWith(rhystic.id);
    // The findings list above stays without buttons — the callout is the one place.
    expect(
      within(block("What the cards show")).queryByRole("button", { name: /^Swap/ }),
    ).toBeNull();
  });

  it("Y7b: without onSwapCard (the share page) the callout has no swaps — whatever canSwap says", () => {
    sheet(spec([rhystic]), {
      combos: [],
      goals: { v: 1, targetLevel: 2 },
      onGoalsChange: vi.fn(),
      canSwap: () => true,
    });
    const callout = document.querySelector<HTMLElement>("[data-slot=bracket-conflicts]")!;
    expect(callout).toBeTruthy();
    expect(within(callout).queryByRole("button")).toBeNull();
  });

  it("no callout at or above what the cards prove, or with no target", () => {
    sheet(spec([rhystic]), { combos: [], goals: { v: 1, targetLevel: 3 }, onGoalsChange: vi.fn() });
    expect(document.querySelector("[data-slot=bracket-conflicts]")).toBeNull();
  });

  it("the table-exceptions line: the adapter's example as its hint, 200 at most, stored trimmed", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([]), { combos: [], goals: { v: 1, targetLevel: 2 }, onGoalsChange });
    const input = within(block("Your target")).getByRole("textbox", {
      name: "Table exceptions",
    }) as HTMLInputElement;
    expect(input.placeholder).toBe("e.g. one thematic Game Changer, ask me");
    expect(input.maxLength).toBe(200);
    fireEvent.change(input, { target: { value: "one thematic Game Changer " } });
    expect(input.value).toBe("one thematic Game Changer ");
    expect(onGoalsChange).toHaveBeenLastCalledWith({
      v: 1,
      targetLevel: 2,
      exceptions: "one thematic Game Changer",
    });
  });

  it("How it plays: optional and collapsed; four questions, Yes / No / Not sure, each answer stamped with today's rules", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([]), { combos: [], goals: null, onGoalsChange });
    const trigger = within(dialog()).getByRole("button", { name: "How it plays" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(within(dialog()).queryByRole("group", { name: "Theme first, over power?" })).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    for (const q of mtg.brackets!.questions) {
      const group = within(dialog()).getByRole("group", { name: q.question });
      expect(
        within(group)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Yes", "No", "Not sure"]);
      expect(pressed(group)).toEqual([]);
    }
    fireEvent.click(
      within(
        within(dialog()).getByRole("group", { name: "Staples and high card quality?" }),
      ).getByRole("button", { name: "Yes" }),
    );
    expect(onGoalsChange).toHaveBeenLastCalledWith({
      v: 1,
      answers: { rulesetVersion: 1, play: { quality: "yes" } },
    });
  });

  it("answers already given show as pressed, and the closed block counts them", () => {
    sheet(spec([]), {
      combos: [],
      goals: { v: 1, answers: { rulesetVersion: 1, play: { theme: "no", fast: "unsure" } } },
      onGoalsChange: vi.fn(),
    });
    const trigger = within(dialog()).getByRole("button", { name: /How it plays/ });
    expect(trigger.textContent).toContain("How it plays· 2 answered");
    fireEvent.click(trigger);
    expect(
      pressed(within(dialog()).getByRole("group", { name: "Theme first, over power?" })),
    ).toEqual(["No"]);
    // "Not theme first" alone already says past Exhibition.
    expect(
      within(dialog()).getByText("Bracket 2 (Core) · from the cards and your answers"),
    ).toBeTruthy();
  });

  it("Your call: Yes / No / Not sure per question, keyed by its stable id; the answer shows", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([liliana, timeWarp, temporal]), { combos: [], goals: null, onGoalsChange });
    const cardsShow = block("What the cards show");
    const land = cardsShow.querySelector<HTMLElement>(`[data-question='${liliKey}']`)!;
    const group = within(land).getByRole("group", {
      name: "Does it deny lands the way Armageddon does? Liliana of the Veil",
    });
    expect(within(land).getByText("Your answer")).toBeTruthy();
    expect(pressed(group)).toEqual([]);
    fireEvent.click(within(group).getByRole("button", { name: "No" }));
    expect(onGoalsChange).toHaveBeenLastCalledWith({
      v: 1,
      answers: { rulesetVersion: 1, calls: { [liliKey]: "no" } },
    });
    expect(
      within(cardsShow).getByText("Answers that change the read are shown on your share page."),
    ).toBeTruthy();
  });

  it("an answered question keeps its place in Your call with its answer pressed", () => {
    sheet(spec([liliana]), {
      combos: [],
      goals: { v: 1, answers: { rulesetVersion: 1, calls: { [liliKey]: "yes" } } },
      onGoalsChange: vi.fn(),
    });
    expect(
      within(dialog()).getByText("Bracket 4 (Optimized) · from the cards and your answers"),
    ).toBeTruthy();
    const land = document.querySelector<HTMLElement>(`[data-question='${liliKey}']`)!;
    expect(pressed(within(land).getByRole("group"))).toEqual(["Yes"]);
  });

  it("the answers are reachable from the keyboard: arrows move between choices, a choice is a button", async () => {
    const onGoalsChange = vi.fn();
    sheet(spec([liliana]), { combos: [], goals: null, onGoalsChange });
    const land = document.querySelector<HTMLElement>(`[data-question='${liliKey}']`)!;
    const [yes, no] = within(land).getAllByRole("button");
    yes.focus();
    fireEvent.keyDown(yes, { key: "ArrowRight" });
    // The roving focus lands on the next frame.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement).toBe(no);
    fireEvent.click(no); // Enter or Space on a native button
    expect(onGoalsChange).toHaveBeenLastCalledWith({
      v: 1,
      answers: { rulesetVersion: 1, calls: { [liliKey]: "no" } },
    });
  });

  it("Rules changed since you answered: older answers still count, How it plays opens itself, Keep my answers restamps them", () => {
    const onGoalsChange = vi.fn();
    const stale: DeckGoals = {
      v: 1,
      answers: { rulesetVersion: 0, play: { cedh: "no" }, calls: { [liliKey]: "yes" } },
    };
    const { read } = sheet(spec([liliana]), { combos: [], goals: stale, onGoalsChange });
    expect(read).toMatchObject({ answersStale: true, suggested: 4 });
    const notice = document.querySelector<HTMLElement>("[data-slot=bracket-stale]")!;
    expect(within(notice).getByText("Rules changed since you answered")).toBeTruthy();
    expect(
      within(notice).getByText(
        "Your answers still count. Check them against the new rules, or keep them as they are.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog())
        .getByRole("button", { name: /How it plays/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(within(notice).getByRole("button", { name: "Keep my answers" }));
    expect(onGoalsChange).toHaveBeenLastCalledWith({
      v: 1,
      answers: { rulesetVersion: 1, play: { cedh: "no" }, calls: { [liliKey]: "yes" } },
    });
  });

  it("answers under today's rules raise no notice", () => {
    sheet(spec([liliana]), {
      combos: [],
      goals: { v: 1, answers: { rulesetVersion: 1, calls: { [liliKey]: "yes" } } },
      onGoalsChange: vi.fn(),
    });
    expect(document.querySelector("[data-slot=bracket-stale]")).toBeNull();
  });
});

describe("TARGET-CHANGES — a pick of Your target says what it did", () => {
  /** Land denial (4), a Game Changer and a combo with the commander (3), an extra turn (2). */
  const four = () => spec([conscripts, rhystic, armageddon, timeWarp]);
  const frame = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  const part = (name: string) =>
    changeCallout()?.querySelector<HTMLElement>(`[data-slot=bracket-target-change-${name}]`)
      ?.textContent ?? null;
  const rowsLead = () =>
    changeCallout()!.querySelector("[data-slot=bracket-target-change-rows] > p")!.textContent;
  const rows = () =>
    [...changeCallout()!.querySelectorAll("[data-allowance]")].map((r) => r.textContent);
  const status = () => within(targetBlock()).getByRole("status");
  /** The conflict callout's rows: the read the sheet renders. */
  const conflictRows = () => targetBlock().querySelectorAll("[data-conflict]").length;
  const pressedChoice = () =>
    within(within(targetBlock()).getByRole("group", { name: "Your target" }))
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);
  const ALL_TOOLS =
    "Suggestions, Autofill and Alternatives leave out cards above it, and the Combos tab marks combos above it.";

  it("set (Not set to 3): it pops in under the choice: the title with Undo, then Your cards didn't change, the list against it, every row, the tools, where it shows", () => {
    render(<Owner list={four()} combos={[kikiCombo]} />);
    expect(changeCallout()).toBeNull();
    fireEvent.click(choice("3"));

    const box = changeCallout()!;
    expect(box.dataset.change).toBe("set");
    expect(
      within(targetBlock()).getByRole("group", { name: "Target set: Bracket 3 (Upgraded)" }),
    ).toBe(box);
    expect([...box.children].map((c) => c.textContent)).toEqual([
      "Target set: Bracket 3 (Upgraded) Undo",
      // Always, and first.
      "Your cards didn't change.",
      "1 thing in the list puts the deck above it. See Above your target below.",
      expect.stringMatching(/^What Bracket 3 allows:/),
      ALL_TOOLS,
      "Bracket 3 shows on your share page, in link previews and where the deck is listed.",
    ]);
    expect(rowsLead()).toBe("What Bracket 3 allows:");
    expect(rows()).toEqual([
      "Game Changers: Up to three",
      "Mass land denial: None",
      "Extra turns: A few, never chained or looped",
      "Two-card combos: None before turn 6",
      "Games last: At least 6 turns",
    ]);
    // The rows are the adapter's guide rows, verbatim.
    expect(rows()).toEqual(
      mtg.brackets!.guide!.levels[2].rows.map((r) => `${r.label}: ${r.value}`),
    );
    // The count is the conflict callout's, which sits below it.
    expect(conflictRows()).toBe(1);
    const conflicts = targetBlock().querySelector("[data-slot=bracket-conflicts]")!;
    expect(box.compareDocumentPosition(conflicts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const group = within(targetBlock()).getByRole("group", { name: "Your target" });
    expect(group.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // U2's pop-in, for readers who haven't asked for reduced motion only.
    expect(box.className).toContain("motion-safe:animate-dw-in");
    expect(box.className).not.toMatch(/(^|\s)animate-/);
  });

  it("changed 2 to 4, then 4 to 2: the count against the new target beside the old one, only the rows that differ", () => {
    render(<Owner list={four()} combos={[kikiCombo]} initial={{ v: 1, targetLevel: 2 }} />);
    expect(conflictRows()).toBe(3);
    fireEvent.click(choice("4"));
    expect(changeCallout()!.dataset.change).toBe("changed");
    expect(changeCallout()!.firstElementChild!.textContent).toBe(
      "Target changed from Bracket 2 to Bracket 4 Undo",
    );
    expect(changeCallout()!.children[1].textContent).toBe("Your cards didn't change.");
    expect(part("above")).toBe("Nothing in the list puts the deck above it (before, 3 did).");
    expect(conflictRows()).toBe(0);
    expect(rowsLead()).toBe("Where Bracket 4 differs from Bracket 2:");
    expect(rows()).toEqual([
      "Game Changers: No limit (was None)",
      "Mass land denial: Allowed (was None)",
      "Extra turns: No limit (was A few, never chained or looped)",
      "Two-card combos: No limit (was None)",
      "Games last: At least 4 turns (was At least 8 turns)",
    ]);
    expect(part("tools")).toBe(ALL_TOOLS);
    expect(part("shown")).toBe(
      "Bracket 4 shows on your share page, in link previews and where the deck is listed.",
    );

    fireEvent.click(choice("2"));
    expect(changeCallout()!.firstElementChild!.textContent).toBe(
      "Target changed from Bracket 4 to Bracket 2 Undo",
    );
    expect(part("above")).toBe(
      "3 things in the list put the deck above it (before, none did). See Above your target below.",
    );
    expect(conflictRows()).toBe(3);
    expect(rowsLead()).toBe("Where Bracket 2 differs from Bracket 4:");
    expect(rows()).toEqual([
      "Game Changers: None (was No limit)",
      "Mass land denial: None (was Allowed)",
      "Extra turns: A few, never chained or looped (was No limit)",
      "Two-card combos: None (was No limit)",
      "Games last: At least 8 turns (was At least 4 turns)",
    ]);
    // Replaced, never stacked.
    expect(targetBlock().querySelectorAll("[data-slot=bracket-target-change]")).toHaveLength(1);
  });

  it("cleared: what it marked before, no rows, the tools stop, no target shows", () => {
    render(<Owner list={four()} combos={[kikiCombo]} initial={{ v: 1, targetLevel: 2 }} />);
    fireEvent.click(choice("Not set"));
    const box = changeCallout()!;
    expect(box.dataset.change).toBe("cleared");
    expect([...box.children].map((c) => c.textContent)).toEqual([
      "Target cleared Undo",
      "Your cards didn't change.",
      "Nothing is marked above a target now (before, 3 things were).",
      "Suggestions, Autofill and Alternatives stop leaving out cards for a target, and the Combos tab stops marking combos above one.",
      "No target shows on your share page, in link previews or where the deck is listed.",
    ]);
    expect(box.querySelector("[data-allowance]")).toBeNull();
    expect(targetBlock().querySelector("[data-slot=bracket-conflicts]")).toBeNull();
  });

  it("truth: the count is the read the sheet renders, on lists proving Bracket 1 to 4, at every level and Not set, against the real assess", () => {
    const lists = [
      { list: spec([]), combos: [] },
      { list: spec([timeWarp]), combos: [] },
      { list: spec([rhystic]), combos: [] },
      { list: four(), combos: [kikiCombo] },
    ];
    // Set, every level up, a drop, cleared, set at the top, and back down.
    const walk = [1, 2, 3, 4, 5, 1, null, 5, 3, null, 2, 4, 1];
    const minimums: number[] = [];
    for (const { list, combos } of lists) {
      const readAt = (targetLevel: number | null) =>
        mtg.brackets!.assess({
          deck: list.deck,
          cards: list.cards,
          combos,
          freshness: FRESH,
          targetLevel,
        });
      minimums.push(readAt(null).minimum);
      render(<Owner list={list} combos={combos} />);
      let from: number | null = null;
      for (const to of walk) {
        fireEvent.click(choice(to === null ? "Not set" : String(to)));
        const now = readAt(to).conflicts.length;
        const before = readAt(from).conflicts.length;
        // The sheet's own conflict rows are the read's, and the callout's count is theirs.
        expect(conflictRows()).toBe(now);
        const said = /^(\d+) things? in the list puts? the deck above it/.exec(part("above") ?? "");
        expect(said ? Number(said[1]) : 0).toBe(conflictRows());
        expect(part("above")).toBe(
          to === null
            ? before > 0
              ? BRACKET_COPY.aboveCleared(before)
              : null
            : BRACKET_COPY.aboveNow(now, from !== null && before !== now ? before : null),
        );
        from = to;
      }
      cleanup();
    }
    expect(minimums).toEqual([1, 2, 3, 4]);
  });

  it("Undo puts the previous target back on the goals as they are then: answers and exceptions stay; focus returns to the choice", async () => {
    const onGoals = vi.fn();
    const answers = { rulesetVersion: 1, play: { quality: "yes" as const } };
    render(
      <Owner
        list={four()}
        combos={[kikiCombo]}
        initial={{ v: 1, targetLevel: 2, exceptions: "Ask me", answers }}
        onGoals={onGoals}
      />,
    );
    fireEvent.click(choice("4"));
    expect(onGoals).toHaveBeenLastCalledWith({
      v: 1,
      targetLevel: 4,
      exceptions: "Ask me",
      answers,
    });
    // An edit after the pick is kept by the Undo.
    fireEvent.change(within(targetBlock()).getByRole("textbox", { name: "Table exceptions" }), {
      target: { value: "Ask me first" },
    });
    expect(changeCallout()).toBeTruthy();
    const undo = within(changeCallout()!).getByRole("button", { name: "Undo" });
    expect(undo.className).toContain("ml-1");
    expect(undo.className).toContain("underline underline-offset-4");
    undo.focus();
    fireEvent.click(undo);
    expect(onGoals).toHaveBeenLastCalledWith({
      v: 1,
      targetLevel: 2,
      exceptions: "Ask me first",
      answers,
    });
    expect(onGoals).toHaveBeenCalledTimes(3);
    expect(changeCallout()).toBeNull();
    expect(pressedChoice()).toEqual(["2"]);
    expect(conflictRows()).toBe(3);
    expect(document.activeElement).toBe(choice("2"));
    expect(status().textContent).toBe("");
  });

  it("Undo of a first target clears it again (the goals had nothing else)", () => {
    const onGoals = vi.fn();
    render(<Owner list={four()} combos={[kikiCombo]} onGoals={onGoals} />);
    fireEvent.click(choice("3"));
    expect(onGoals).toHaveBeenLastCalledWith({ v: 1, targetLevel: 3 });
    fireEvent.click(within(changeCallout()!).getByRole("button", { name: "Undo" }));
    expect(onGoals).toHaveBeenLastCalledWith(null);
    expect(pressedChoice()).toEqual(["Not set"]);
    expect(changeCallout()).toBeNull();
  });

  it("the level already set does nothing: no goals change, no callout, nothing announced", () => {
    const onGoals = vi.fn();
    render(
      <Owner
        list={four()}
        combos={[kikiCombo]}
        initial={{ v: 1, targetLevel: 3 }}
        onGoals={onGoals}
      />,
    );
    fireEvent.click(choice("3"));
    expect(onGoals).not.toHaveBeenCalled();
    expect(changeCallout()).toBeNull();
    expect(status().textContent).toBe("");
    // After a pick, the new level pressed again leaves its callout as it was.
    fireEvent.click(choice("5"));
    const box = changeCallout()!;
    fireEvent.click(choice("5"));
    expect(onGoals).toHaveBeenCalledTimes(1);
    expect(changeCallout()).toBe(box);
    expect(box.firstElementChild!.textContent).toBe(
      "Target changed from Bracket 3 to Bracket 5 Undo",
    );
  });

  it("a short polite status says it; the callout itself is no live region and never takes focus from the choice", async () => {
    render(<Owner list={four()} combos={[kikiCombo]} />);
    // The dialog's own first focus lands before the test moves it.
    await frame();
    await frame();
    // Always there, so the pick's summary is announced.
    expect(status().textContent).toBe("");
    const three = choice("3");
    three.focus();
    fireEvent.click(three);
    await frame();
    expect(status().textContent).toBe(
      "Target set: Bracket 3 (Upgraded). Your cards didn't change.",
    );
    expect(status().getAttribute("role")).toBe("status");
    const box = changeCallout()!;
    expect(box.contains(status())).toBe(false);
    expect(box.querySelector("[role=status], [role=alert], [aria-live]")).toBeNull();
    expect(box.getAttribute("aria-live")).toBeNull();
    expect(document.activeElement).toBe(choice("3"));
    expect(box.contains(document.activeElement)).toBe(false);
  });

  it("Dismiss takes it away and hands focus back to the choice; the target stays", () => {
    const onGoals = vi.fn();
    render(<Owner list={four()} combos={[kikiCombo]} onGoals={onGoals} />);
    fireEvent.click(choice("3"));
    const dismiss = within(changeCallout()!).getByRole("button", { name: "Dismiss" });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(changeCallout()).toBeNull();
    expect(status().textContent).toBe("");
    expect(pressedChoice()).toEqual(["3"]);
    expect(document.activeElement).toBe(choice("3"));
    expect(onGoals).toHaveBeenCalledTimes(1);
    // The sheet's own Close is still the only "Close".
    expect(within(dialog()).getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("the next pick replaces it (a fresh pop-in); closing the sheet forgets it", () => {
    const list = four();
    const { rerender } = render(<Owner list={list} combos={[kikiCombo]} />);
    fireEvent.click(choice("3"));
    const first = changeCallout()!;
    fireEvent.click(choice("4"));
    fireEvent.click(choice("5"));
    expect(changeCallout()).not.toBe(first);
    expect(changeCallout()!.firstElementChild!.textContent).toBe(
      "Target changed from Bracket 4 to Bracket 5 Undo",
    );
    // Only the row that differs between the two.
    expect(rows()).toEqual(["Games last: Any number of turns (was At least 4 turns)"]);
    expect(targetBlock().querySelectorAll("[data-slot=bracket-target-change]")).toHaveLength(1);

    rerender(<Owner list={list} combos={[kikiCombo]} open={false} />);
    rerender(<Owner list={list} combos={[kikiCombo]} />);
    expect(changeCallout()).toBeNull();
    expect(pressedChoice()).toEqual(["5"]);
  });

  it("it only ever tells a change that happened: a pick the goals never took says nothing", () => {
    // The plain harness hands the sheet fixed goals: the pick reaches the
    // editor's handler, but the target the sheet renders stays Not set.
    const onGoalsChange = vi.fn();
    sheet(spec([rhystic]), { combos: [], goals: null, onGoalsChange });
    fireEvent.click(choice("3"));
    expect(onGoalsChange).toHaveBeenLastCalledWith({ v: 1, targetLevel: 3 });
    expect(changeCallout()).toBeNull();
    expect(within(targetBlock()).getByRole("status").textContent).toBe("");
  });

  it("a private deck: where it shows never names link previews", () => {
    render(<Owner list={four()} combos={[kikiCombo]} linkPreviews={false} />);
    fireEvent.click(choice("3"));
    expect(part("shown")).toBe("Bracket 3 shows on your share page and where the deck is listed.");
    expect(changeCallout()!.textContent).not.toContain("link previews");
    fireEvent.click(choice("Not set"));
    expect(part("shown")).toBe("No target shows on your share page or where the deck is listed.");
    expect(changeCallout()!.textContent).not.toContain("link previews");
  });

  it("the tools named are only the ones the adapter declares", () => {
    const cases: [GameAdapter, string | null][] = [
      [
        {
          ...mtg,
          recommend: { ...mtg.recommend!, autofill: undefined, swap: undefined },
          capabilities: { ...mtg.capabilities, combos: undefined },
        },
        "Suggestions leaves out cards above it.",
      ],
      [
        { ...mtg, recommend: { ...mtg.recommend!, autofill: undefined } },
        "Suggestions and Alternatives leave out cards above it, and the Combos tab marks combos above it.",
      ],
      [{ ...mtg, recommend: undefined }, "The Combos tab marks combos above it."],
      [
        { ...mtg, recommend: undefined, capabilities: { ...mtg.capabilities, combos: undefined } },
        null,
      ],
    ];
    for (const [adapter, said] of cases) {
      render(<Owner list={four()} combos={[kikiCombo]} adapter={adapter} />);
      fireEvent.click(choice("3"));
      expect(part("tools")).toBe(said);
      expect(changeCallout()!.children[1].textContent).toBe("Your cards didn't change.");
      cleanup();
    }
  });

  it("on a phone: the same callout inside the Drawer", () => {
    render(<Owner list={four()} combos={[kikiCombo]} phone />);
    const popup = document.querySelector<HTMLElement>("[data-slot=drawer-popup]")!;
    fireEvent.click(choice("3"));
    expect(popup.contains(changeCallout())).toBe(true);
    expect(changeCallout()!.children[1].textContent).toBe("Your cards didn't change.");
    // Wraps rather than scrolls sideways at 320 px: no text in it is kept on one line
    // (the Dismiss icon is the one nowrap element).
    expect(changeCallout()!.className).toContain("break-words");
    expect(
      [...changeCallout()!.querySelectorAll(".whitespace-nowrap, .truncate")].map((el) =>
        el.getAttribute("aria-label"),
      ),
    ).toEqual(["Dismiss"]);
  });
});

describe("BRACKET-SPEED — How fast it looks, and the owner's nudge", () => {
  const rock = (i: number) =>
    named(`Mox ${i}`, { roles: ["mana-rock"], type_line: "Artifact" }, { costValue: 1 });
  const demonic = named("Demonic Tutor", { roles: ["tutor"], type_line: "Sorcery" });
  const speedBlock = () => dialog().querySelector<HTMLElement>("[data-slot=bracket-speed]");
  const nudge = () => dialog().querySelector<HTMLElement>("[data-slot=bracket-speed-nudge]");
  const howItPlays = () => within(dialog()).getByRole("button", { name: /How it plays/ });
  const rows = () =>
    [...speedBlock()!.querySelectorAll("[data-speed]")].map((el) => el.textContent);

  it("the block after What the cards show: the three facts with their plain meaning, and the sentence that agrees with the read's assumption", () => {
    const { read } = sheet(spec([]), { combos: [] });
    const block = speedBlock()!;
    expect(
      within(block).getByRole("heading", { level: 3, name: "How fast it looks" }),
    ).toBeTruthy();
    expect(rows()).toEqual([
      "Fast mana: 0 (mana sources costing 1 or less)",
      "Tutors: 0 (cards that search for other cards, land tutors aside)",
      "Curve: average mana value 3.43, 36 lands",
    ]);
    expect(block.textContent).toContain(
      "These show how fast the list looks. They don't change the bracket.",
    );
    expect(read.assumptions).toContain(
      "Tutors and fast mana don't change the read. Wizards dropped tutor limits in October 2025.",
    );
    // After What the cards show, before What this read assumes.
    const cardsShow = block.ownerDocument.getElementById(
      within(dialog()).getByRole("heading", { name: "What the cards show" }).id,
    )!.parentElement!;
    expect(
      cardsShow.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      block.compareDocumentPosition(
        within(dialog()).getByRole("heading", { name: "What this read assumes" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("the facts count what the list holds: fast mana at 1 or less, tutors, the curve with the lands", () => {
    sheet(spec([rock(1), rock(2), demonic], 100, 30), { combos: [] });
    expect(rows()).toEqual([
      "Fast mana: 2 (mana sources costing 1 or less)",
      "Tutors: 1 (cards that search for other cards, land tutors aside)",
      "Curve: average mana value 3.41, 30 lands",
    ]);
  });

  it("no facts handed in (a game or a caller without them): no block", () => {
    sheet(spec([]), { combos: [], speed: null });
    expect(speedBlock()).toBeNull();
    expect(nudge()).toBeNull();
  });

  it("the nudge: owner only, when the facts look tuned and the cEDH question is unanswered — How it plays opens with it, pointing at that question", () => {
    const onGoalsChange = vi.fn();
    sheet(spec([rock(1), rock(2), rock(3), rock(4), rock(5), rock(6)]), {
      combos: [],
      goals: null,
      onGoalsChange,
    });
    expect(howItPlays().getAttribute("aria-expanded")).toBe("true");
    expect(nudge()!.textContent).toBe("6 fast mana look like a cEDH list. If it is, say so below.");
    const cedh = dialog().querySelector<HTMLElement>("[data-play=cedh]")!;
    expect(cedh.hasAttribute("data-nudged")).toBe(true);
    expect(dialog().querySelectorAll("[data-nudged]")).toHaveLength(1);
    // The answer goes the way every How it plays answer goes: the same key, the same body.
    fireEvent.click(
      within(within(cedh).getByRole("group", { name: "Tuned for the cEDH metagame?" })).getByRole(
        "button",
        { name: "Yes" },
      ),
    );
    const next = onGoalsChange.mock.lastCall![0] as DeckGoals;
    expect(next).toEqual({ v: 1, answers: { rulesetVersion: 1, play: { cedh: "yes" } } });
    expect(goalsPatchBody(next)).toBe(
      '{"goals":{"answers":{"play":{"cedh":"yes"},"rulesetVersion":1},"v":1}}',
    );
  });

  it("lands at 33 or fewer nudge too; the sentence names only what crossed", () => {
    sheet(spec([], 100, 33), { combos: [], goals: null, onGoalsChange: vi.fn() });
    expect(nudge()!.textContent).toBe("33 lands look like a cEDH list. If it is, say so below.");
    cleanup();
    sheet(spec([rock(1), rock(2), rock(3), rock(4), rock(5), rock(6)], 100, 26), {
      combos: [],
      goals: null,
      onGoalsChange: vi.fn(),
    });
    expect(nudge()!.textContent).toBe(
      "6 fast mana and 26 lands look like a cEDH list. If it is, say so below.",
    );
  });

  it("no nudge below the cuts: 5 fast mana and 34 lands, How it plays stays collapsed", () => {
    sheet(spec([rock(1), rock(2), rock(3), rock(4), rock(5)], 100, 34), {
      combos: [],
      goals: null,
      onGoalsChange: vi.fn(),
    });
    expect(speedBlock()).toBeTruthy();
    expect(nudge()).toBeNull();
    expect(howItPlays().getAttribute("aria-expanded")).toBe("false");
    expect(dialog().querySelector("[data-nudged]")).toBeNull();
  });

  it.each(["yes", "no", "unsure"] as const)(
    "once the cEDH question has an answer (%s) the nudge is gone and the block is collapsed again",
    (answer) => {
      sheet(spec([], 100, 26), {
        combos: [],
        goals: { v: 1, answers: { rulesetVersion: 1, play: { cedh: answer } } },
        onGoalsChange: vi.fn(),
      });
      expect(speedBlock()).toBeTruthy();
      expect(nudge()).toBeNull();
      expect(howItPlays().getAttribute("aria-expanded")).toBe("false");
    },
  );

  it("an answer to another question does not quiet it", () => {
    sheet(spec([], 100, 26), {
      combos: [],
      goals: { v: 1, answers: { rulesetVersion: 1, play: { fast: "yes" } } },
      onGoalsChange: vi.fn(),
    });
    expect(nudge()).toBeTruthy();
  });

  it("a draft is never nudged — every unfinished list has few lands — but its facts show", () => {
    const { read } = sheet(spec([], 60, 20), { combos: [], goals: null, onGoalsChange: vi.fn() });
    expect(read.status).toBe("draft");
    expect(rows()[2]).toBe("Curve: average mana value 3.38, 20 lands");
    expect(nudge()).toBeNull();
    expect(howItPlays().getAttribute("aria-expanded")).toBe("false");
  });

  it("a visitor (no way to change goals) reads the facts and is never asked", () => {
    sheet(spec([rock(1), rock(2), rock(3), rock(4), rock(5), rock(6)], 100, 26), { combos: [] });
    expect(speedBlock()).toBeTruthy();
    expect(nudge()).toBeNull();
    expect(dialog().querySelector("[data-slot=bracket-how-it-plays]")).toBeNull();
    expect(within(dialog()).queryByText(/cEDH list/)).toBeNull();
  });

  it("the words: no em or en dash, at most one middle dot a line, no notation", () => {
    sheet(spec([rock(1), rock(2), rock(3), rock(4), rock(5), rock(6)], 100, 26), {
      combos: [],
      goals: null,
      onGoalsChange: vi.fn(),
    });
    const lines = [...rows(), nudge()!.textContent!, speedBlock()!.textContent!];
    expect(lines.filter((l) => /[\u2013\u2014]|\d-\d/.test(l))).toEqual([]);
    expect(lines.filter((l) => l.split(" · ").length > 2)).toEqual([]);
    expect(lines.filter((l) => /\d\+|est\./i.test(l))).toEqual([]);
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
    [
      "BRACKET-SPEED: a tuned-looking owner's list, the facts and the nudge",
      () => {
        sheet(spec([rhystic], 100, 26), { combos: [], goals: null, onGoalsChange: vi.fn() });
        expect(document.querySelector("[data-slot=bracket-speed]")).toBeTruthy();
        expect(document.querySelector("[data-slot=bracket-speed-nudge]")).toBeTruthy();
      },
    ],
    [
      "Y4b: a target below the cards, answers under older rules, How it plays open",
      () => {
        sheet(spec([conscripts, rhystic, armageddon, liliana, timeWarp, temporal]), {
          goals: {
            v: 1,
            targetLevel: 1,
            exceptions: "Ask me first",
            answers: { rulesetVersion: 0, play: { theme: "yes", fast: "no" } },
          },
          onGoalsChange: vi.fn(),
        });
        expect(document.querySelector("[data-slot=bracket-conflicts]")).toBeTruthy();
        expect(document.querySelector("[data-slot=bracket-stale]")).toBeTruthy();
        expect(screen.getByRole("group", { name: "Tuned for the cEDH metagame?" })).toBeTruthy();
      },
    ],
    [
      "TARGET-CHANGES: a changed target's callout, with its rows and tools",
      () => {
        render(
          <Owner
            list={spec([conscripts, rhystic, armageddon, timeWarp])}
            combos={[kikiCombo]}
            initial={{ v: 1, targetLevel: 2 }}
          />,
        );
        fireEvent.click(choice("4"));
        expect(changeCallout()?.querySelector("[data-allowance]")).toBeTruthy();
      },
    ],
  ])("%s: no 'approve', no Spellbook tag name", (_label, open) => {
    open();
    const text = document.body.textContent ?? "";
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toMatch(/approv/i);
    expect(text).not.toMatch(/ruthless|spicy|powerful|oddball|precon appropriate|casual/i);
  });
});

describe("Y5 — the share page's sheet reads only", () => {
  it("shows the owner's yes or no on a question; a Not sure says nothing; no target block, no choices", () => {
    const list = spec([timeWarp, temporal]);
    const open = mtg.brackets!.assess({
      deck: list.deck,
      cards: list.cards,
      combos: [],
      freshness: FRESH,
    });
    const chain = open.review.find((q) => q.id.startsWith("extra-turns:"))!;
    for (const [answer, shown] of [
      ["no", "The owner's answer: No"],
      ["yes", "The owner's answer: Yes"],
      ["unsure", null],
    ] as const) {
      const goals: DeckGoals = {
        v: 1,
        answers: { rulesetVersion: 1, calls: { [chain.id]: answer } },
      };
      sheet(list, { combos: [], goals });
      const dialog = screen.getByRole("dialog");
      expect(dialog.querySelector("[data-slot=owner-answer]")?.textContent ?? null).toBe(shown);
      expect(dialog.querySelector("[data-slot=bracket-target]")).toBeNull();
      expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);
      cleanup();
    }
  });
});
