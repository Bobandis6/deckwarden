/**
 * Y4a — the bracket line (WAVE4 D5), rendered: D5's line table character for
 * character from real Magic reads, the two lines Y4a adds, what follows the
 * text ("Why?", "Retry", or nothing), 44 px on coarse pointers, and One
 * Piece's nothing at all. U3a: the editor's status slot — present and empty
 * before a read, the bracket number forward, the quiet Why?.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BracketFactsState } from "@/lib/brackets/facts";
import { addMorePhrase, deckProgress } from "@/lib/decks/progress";
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
import type {
  BracketAnswers,
  BracketFreshness,
  CompleteCombo,
  GameAdapter,
} from "@/lib/games/types";

import { BracketLine } from "./bracket-line";

const mtg = getAdapter("mtg");
const optcg = getAdapter("optcg");

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

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({ ...over, name, attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs } });
const commander = named("Test Commander", {}, { isLeaderCandidate: true });
const rhystic = named("Rhystic Study", { game_changer: true });
const gcs = ["Cyclonic Rift", "Smothering Tithe", "Underworld Breach"].map((n) =>
  named(n, { game_changer: true }),
);
const timeWarp = named("Time Warp", { extra_turn: true });
const dockside = named("Dockside Extortionist", {}, { legality: [{ status: "banned" }] });
const pieces = ["A", "B", "C"].map((n) => named(`Piece ${n}`));

function spec(specials: MtgCard[], size = 100) {
  const fill = fillers(Math.max(0, size - 1 - specials.length));
  const deck = commanderDeck(
    [commander],
    [...specials, ...fill].map((c) => entry(c)),
  );
  return { deck, cards: cardMap([commander, ...specials, ...fill]) };
}

/** Render the line as the editor does: the read from the adapter, core's progress phrase. */
function renderLine(
  list: ReturnType<typeof spec>,
  {
    combos = [],
    facts = "ready",
    adapter = mtg,
    onWhy = vi.fn(),
    onRetry = vi.fn(),
    targetLevel = null,
    answers = null,
    slot = false,
  }: {
    combos?: CompleteCombo[] | null;
    facts?: BracketFactsState;
    adapter?: GameAdapter;
    onWhy?: () => void;
    onRetry?: () => void;
    targetLevel?: number | null;
    answers?: BracketAnswers | null;
    /** The editor's status slot (U3a). */
    slot?: boolean;
  } = {},
) {
  const read =
    adapter.brackets?.assess({
      deck: list.deck,
      cards: list.cards,
      combos,
      freshness: FRESH,
      targetLevel,
      answers,
    }) ?? null;
  const entries = Object.entries(list.deck.zones).flatMap(([zone, es]) =>
    es.map((e) => ({ ...e, zone })),
  );
  const ctx = {
    deck: list.deck,
    cards: list.cards,
    progress: addMorePhrase(deckProgress(entries, COMMANDER).toGo),
    targetLevel,
  };
  return render(
    <BracketLine
      adapter={adapter}
      read={read}
      ctx={ctx}
      facts={facts}
      onWhy={onWhy}
      onRetry={onRetry}
      slot={slot}
    />,
  );
}

const lineText = () =>
  document.querySelector<HTMLElement>("[data-slot=bracket-line]")?.textContent ?? null;

const scombo: CompleteCombo = {
  key: "2552-3263",
  cardPieces: pieces.map((p) => p.id).sort(),
  templates: [],
  tag: "S",
  relevant: false,
  results: ["Infinite mana"],
  popularity: 900,
};

describe("Y4b — the target and the answers, rendered", () => {
  it("D5's 'Target below the cards' row, in plain words", () => {
    renderLine(spec([rhystic]), { targetLevel: 2 });
    expect(lineText()).toBe("Your target: Bracket 2 · the cards say at least 3 · Why?");
  });

  it("with answers: settled, and with a call still open", () => {
    renderLine(spec(pieces), {
      combos: [scombo],
      answers: { rulesetVersion: 1, calls: { "combo:2552-3263": "yes" } },
    });
    expect(lineText()).toBe("Bracket 4 (Optimized) — from the cards and your answers · Why?");
  });

  it("answers from older rules ask for a second look before Why? — and still count", () => {
    renderLine(spec(pieces), {
      combos: [scombo],
      answers: { rulesetVersion: 0, calls: { "combo:2552-3263": "yes" } },
    });
    expect(lineText()).toBe(
      "Bracket 4 (Optimized) — from the cards and your answers · Rules changed since you answered · Why?",
    );
  });

  it("a draft holding a target keeps its Why? though it found nothing — the target lives in the sheet", () => {
    const { unmount } = renderLine(spec([], 40));
    expect(lineText()).toBe("Bracket: add 60 more cards");
    unmount();
    renderLine(spec([], 40), { targetLevel: 2 });
    expect(lineText()).toBe("Bracket: add 60 more cards · Why?");
  });
});

describe("D5's line table, rendered", () => {
  it.each([
    ["Nothing flagged", spec([]), "Bracket 1–2 · nothing here goes past Core · Why?"],
    ["A minimum of 3", spec([rhystic]), "At least Bracket 3 (Upgraded) · Why?"],
    ["A minimum of 4", spec([rhystic, ...gcs]), "At least Bracket 4 (Optimized) · Why?"],
  ])("%s", (_label, list, expected) => {
    renderLine(list);
    expect(lineText()).toBe(expected);
  });

  it("Your call pending", () => {
    renderLine(spec(pieces), { combos: [scombo] });
    expect(lineText()).toBe("Bracket 3 or 4 — one combo is your call · Why?");
  });

  it("Draft — while the facts land it is D5's line exactly; once they're in, Why? follows what it found", () => {
    const { unmount } = renderLine(spec([rhystic], 66), { facts: "checking" });
    expect(lineText()).toBe("Bracket: add 34 more cards · 1 Game Changer so far");
    unmount();
    renderLine(spec([rhystic], 66));
    expect(lineText()).toBe("Bracket: add 34 more cards · 1 Game Changer so far · Why?");
  });

  it("a draft that found nothing offers no Why? (there's nothing to explain yet)", () => {
    renderLine(spec([], 1));
    expect(lineText()).toBe("Bracket: add 99 more cards");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Banned card — nothing follows (the problem list names it)", () => {
    renderLine(spec([dockside]));
    expect(lineText()).toBe("Bracket read needs a legal list · 1 banned card");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("Loading — text, no spinner, no Why?", () => {
    renderLine(spec([rhystic]), { facts: "checking" });
    expect(lineText()).toBe("Checking combos…");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector("[data-slot=bracket-line] [role=progressbar]")).toBeNull();
  });

  it("Failure — Retry asks again", () => {
    const onRetry = vi.fn();
    renderLine(spec([rhystic]), { facts: "failed", combos: null, onRetry });
    expect(lineText()).toBe("Couldn't check combos · Retry");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("the two lines Y4a adds", () => {
  it("a minimum of 2", () => {
    renderLine(spec([timeWarp]));
    expect(lineText()).toBe("At least Bracket 2 (Core) · Why?");
  });

  it("a read that couldn't check everything: its floor, the gap, and Why? (Retry can't fix a stale feed)", () => {
    const list = spec([rhystic]);
    const read = mtg.brackets!.assess({
      deck: list.deck,
      cards: list.cards,
      combos: [],
      freshness: {
        ...FRESH,
        feeds: { ...FRESH.feeds, extraTurns: { state: "stale", asOf: "2026-09-01T00:00:00Z" } },
      },
    });
    render(
      <BracketLine
        adapter={mtg}
        read={read}
        ctx={{ deck: list.deck, cards: list.cards, progress: null }}
        facts="ready"
        onWhy={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(lineText()).toBe("At least Bracket 3 (Upgraded) · Couldn't check extra turns · Why?");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("too many cards to ask about: the read says it couldn't check combos, with Why?", () => {
    renderLine(spec([]), { facts: "over", combos: null });
    expect(lineText()).toBe("Bracket read incomplete · Couldn't check combos · Why?");
  });
});

describe("Why?", () => {
  it("is a real button that opens the sheet — reachable by keyboard, 44 px on touch", () => {
    const onWhy = vi.fn();
    renderLine(spec([rhystic]), { onWhy });
    const why = screen.getByRole("button", { name: "Why?" });
    expect(why.tagName).toBe("BUTTON");
    expect(why.getAttribute("type")).toBe("button");
    expect(why.getAttribute("aria-haspopup")).toBe("dialog");
    expect(why.className).toContain("pointer-coarse:min-h-11");
    why.focus();
    expect(document.activeElement).toBe(why);
    fireEvent.click(why);
    expect(onWhy).toHaveBeenCalledTimes(1);
  });

  it("Retry is 44 px on touch too", () => {
    renderLine(spec([]), { facts: "failed", combos: null });
    expect(screen.getByRole("button", { name: "Retry" }).className).toContain(
      "pointer-coarse:min-h-11",
    );
  });

  it("the line is not a live region (it changes on every settled edit) and carries its state for QA", () => {
    renderLine(spec([rhystic]));
    const line = document.querySelector<HTMLElement>("[data-slot=bracket-line]")!;
    expect(line.getAttribute("role")).toBeNull();
    expect(line.getAttribute("aria-live")).toBeNull();
    expect(line.dataset.status).toBe("read");
    expect(line.dataset.facts).toBe("ready");
  });
});

describe("adapter gating (D0)", () => {
  it("One Piece renders nothing — no line, no apology", () => {
    const { container } = renderLine(spec([]), { adapter: optcg });
    expect(container.innerHTML).toBe("");
  });

  it("no read (no commander yet) renders nothing", () => {
    const list = spec([]);
    const { container } = render(
      <BracketLine
        adapter={mtg}
        read={null}
        ctx={{ deck: list.deck, cards: list.cards, progress: null }}
        facts="off"
        onWhy={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("One Piece holds no slot either (U3a): nothing to reserve without a read to give", () => {
    const list = spec([]);
    const { container } = render(
      <BracketLine
        adapter={optcg}
        read={null}
        ctx={{ deck: list.deck, cards: list.cards, progress: null }}
        facts="off"
        onWhy={() => {}}
        onRetry={() => {}}
        slot
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("the editor's status slot (U3a, WAVE5 D4)", () => {
  const line = () => document.querySelector<HTMLElement>("[data-slot=bracket-line]")!;

  it("no read yet: the slot is present and empty — a read's own box, hidden, nothing to press or focus", () => {
    const list = spec([]);
    const { unmount } = render(
      <BracketLine
        adapter={mtg}
        read={null}
        ctx={{ deck: list.deck, cards: list.cards, progress: null }}
        facts="off"
        onWhy={() => {}}
        onRetry={() => {}}
        slot
      />,
    );
    const empty = line();
    expect(empty.dataset.status).toBe("empty");
    expect(empty.getAttribute("aria-hidden")).toBe("true");
    expect(empty.textContent?.trim()).toBe("");
    expect(empty.querySelector("button")).toBeNull();
    expect(empty.hasAttribute("tabindex")).toBe(false);
    expect(empty.querySelector("svg")?.getAttribute("class")).toContain("invisible");
    // The same classes as a read's line, so the read lands in the same box.
    const emptyClass = empty.className;
    unmount();
    renderLine(spec([]), { slot: true });
    expect(line().className).toBe(emptyClass);
  });

  it.each([
    [
      "Nothing flagged",
      spec([]),
      "Bracket 1–2",
      "Bracket 1–2 · nothing here goes past Core · Why?",
    ],
    [
      "A minimum of 3",
      spec([rhystic]),
      "At least Bracket 3 (Upgraded)",
      "At least Bracket 3 (Upgraded) · Why?",
    ],
  ])(
    "%s: the words are unchanged; the bracket number reads foreground medium, the rest muted",
    (_label, list, lead, text) => {
      renderLine(list, { slot: true });
      expect(lineText()).toBe(text);
      const strong = line().querySelector("span > span")!;
      expect(strong.textContent).toBe(lead);
      expect(strong.className).toContain("text-foreground");
      expect(strong.className).toContain("font-medium");
      expect(line().className).toContain("text-muted-foreground");
    },
  );

  it("core's own lines name no number, so nothing comes forward", () => {
    const { unmount } = renderLine(spec([rhystic]), { facts: "checking", slot: true });
    expect(lineText()).toBe("Checking combos…");
    expect(line().querySelector("span > span")).toBeNull();
    unmount();
    renderLine(spec([rhystic]), { facts: "failed", combos: null, slot: true });
    expect(lineText()).toBe("Couldn't check combos · Retry");
    expect(line().querySelector("span > span")).toBeNull();
  });

  it("Why? is a muted text button, no underline, forward on hover and focus; 44 px on touch without growing the line", () => {
    const onWhy = vi.fn();
    renderLine(spec([rhystic]), { slot: true, onWhy });
    const why = screen.getByRole("button", { name: "Why?" });
    expect(why.className).toContain("text-muted-foreground");
    expect(why.className).toContain("hover:text-foreground");
    expect(why.className).toContain("focus-visible:text-foreground");
    expect(why.className.split(" ")).not.toContain("underline");
    expect(why.className).toContain("pointer-coarse:min-h-11");
    expect(why.className).toContain("pointer-coarse:-my-[13px]");
    fireEvent.click(why);
    expect(onWhy).toHaveBeenCalledTimes(1);
  });

  it("without the slot (the share page until U6) the line is as it was", () => {
    renderLine(spec([rhystic]));
    expect(line().querySelector("span > span")).toBeNull();
    const why = screen.getByRole("button", { name: "Why?" });
    expect(why.className).toContain("text-foreground");
    expect(why.className.split(" ")).toContain("underline");
    expect(why.className).not.toContain("-my-[13px]");
  });
});
