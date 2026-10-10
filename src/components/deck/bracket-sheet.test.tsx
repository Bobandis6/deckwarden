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
import type { DeckGoals } from "@/lib/decks/goals";
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
    goals,
    onGoalsChange,
    onSwapCard,
    canSwap,
  }: {
    combos?: CompleteCombo[] | null;
    freshness?: BracketFreshness | null;
    phone?: boolean;
    /** Y4b: the deck's goals — the read is assessed with them, as the editor does. */
    goals?: DeckGoals | null;
    onGoalsChange?: (next: DeckGoals | null) => void;
    /** Y7b: the callout's swaps. */
    onSwapCard?: (cardId: string) => void;
    canSwap?: (cardId: string) => boolean;
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
      onGoalsChange={onGoalsChange}
      onSwapCard={onSwapCard}
      canSwap={canSwap}
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
    expect(within(target).getByText("Shown on your share page.")).toBeTruthy();
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
      within(dialog()).getByText("Bracket 2 (Core) — from the cards and your answers"),
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
      within(dialog()).getByText("Bracket 4 (Optimized) — from the cards and your answers"),
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
