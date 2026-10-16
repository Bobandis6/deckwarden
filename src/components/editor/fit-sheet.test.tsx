/**
 * Y8 — the Fit sheet on its own (WAVE4 D9, Budget Twin): nothing is asked
 * until a total is set; the priciest cards are asked first, a batch at a
 * time, only while the checked swaps fall short; the running total reads
 * "est. $X of your $150" or "Gets you to $X of your $150"; unpriced cards
 * are disclosed; "No suitable alternative under your goals." when nothing
 * can be swapped down; Apply hands the editor ONE next list.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGoals } from "@/lib/decks/goals";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { CompleteCombo } from "@/lib/games/types";
import { deckEstimate, FIT_ASK_LIMIT } from "@/lib/recommend/fit";
import { FitSheet, type FitApply } from "./fit-sheet";

const mtg = getAdapter("mtg");
const editorCard = (name: string, usd: number | null, roles: string[] = ["ramp"], extra = {}) =>
  ({
    // Any string: a retired or unknown role key must read as none.
    ...card({
      name,
      primaryType: "Artifact",
      cheapestUsd: usd,
      attrs: { roles } as never,
      ...extra,
    }),
    image: null,
  }) as EditorCard;

// The $300 fixture deck: a $20 commander, ten pricey role-holders ($171),
// 37 Plains at $0.50 and 52 fillers without a role ($90.50).
const leader = editorCard("Odric", 20, [], { isLeaderCandidate: true, primaryType: "Creature" });
const PRICEY = [40, 30, 25, 20, 15, 12, 10, 8, 6, 5].map((usd, i) =>
  editorCard(`Pricey ${String.fromCharCode(65 + i)}`, usd),
);
const plains = editorCard("Plains", 0.5, [], { primaryType: "Land", costValue: null });
const fillers = Array.from({ length: 52 }, (_, i) =>
  editorCard(`Filler ${i}`, i ? 1.75 : 1.25, []),
);
const ENTRIES: EditorEntry[] = [
  { cardId: leader.id, zone: "commander", qty: 1, tags: [] },
  ...PRICEY.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
  { cardId: plains.id, zone: "main", qty: 37, tags: [] },
  ...fillers.map((c) => ({ cardId: c.id, zone: "main", qty: 1, tags: [] })),
];
const CARDS = new Map([leader, ...PRICEY, plains, ...fillers].map((c) => [c.id, c]));

let seq = 0;
/** One route row: an alternative at a price, with its wire. */
function row(usd: string | null, extra: Record<string, unknown> = {}) {
  seq += 1;
  const wire: CardWire = {
    ...card({ name: `Alt ${seq}`, primaryType: "Artifact", cheapestUsd: Number(usd) }),
    image: null,
  };
  return {
    cardId: wire.id,
    name: wire.name,
    costValue: 2,
    cheapestUsd: usd,
    evidence: [],
    conflicts: [],
    shared: ["ramp"],
    card: wire,
    ...extra,
  };
}
const answer = (cardId: string, alternatives: ReturnType<typeof row>[]) => ({
  cardId,
  roles: ["ramp"],
  alternatives,
  hidden: [],
  combosTruncated: false,
  tradeoff: null,
});
/** Every pricey card: the best-ranked alternative at $1.00, a cheaper one at $0.50 after it. */
const ROWS = new Map(PRICEY.map((c) => [c.id, [row("1.00"), row("0.50")]]));

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
/** The cards asked about, in order. */
const asked = (): string[] =>
  fetchMock.mock.calls
    .filter(([url]) => url === "/api/alternatives")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).cardId);
const name = (id: string) => CARDS.get(id)?.name;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const { cardId } = JSON.parse(init.body as string);
    return ok(answer(cardId, ROWS.get(cardId) ?? []));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSheet({
  entries = ENTRIES,
  cards = CARDS as ReadonlyMap<string, EditorCard>,
  goals = null as DeckGoals | null,
  owned = null as ReadonlySet<string> | null,
  combos = [] as CompleteCombo[] | null,
  phone = false,
} = {}) {
  const onApply = vi.fn<(apply: FitApply) => void>();
  const onSaveTotal = vi.fn<(total: number | null) => void>();
  render(
    <FitSheet
      adapter={mtg}
      format={COMMANDER}
      entries={entries}
      cards={cards}
      goals={goals}
      estimate={deckEstimate(entries, cards, owned, COMMANDER)}
      owned={owned}
      combos={combos}
      factsState={combos ? "ready" : "failed"}
      phone={phone}
      onApply={onApply}
      onSaveTotal={onSaveTotal}
      onClose={() => {}}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: "Fit my budget" });
  return { sheet, onApply, onSaveTotal };
}
const fitState = () =>
  document.querySelector("[data-slot=fit-sheet]")?.getAttribute("data-fit-state");
const after = () => document.querySelector("[data-slot=fit-after]")?.textContent;
async function settled() {
  await waitFor(() => expect(fitState()).not.toBe("asking"));
}
const preset = (sheet: HTMLElement, label: string) =>
  fireEvent.click(within(sheet).getByRole("button", { name: label }));

describe("FitSheet — the total and the asks", () => {
  it("asks nothing until a total is set; the field takes focus; the estimate reads at once", async () => {
    const { sheet } = renderSheet();
    expect(sheet.textContent).toContain("Set a total to see what to swap.");
    expect(sheet.textContent).toContain("est. $300 now (cheapest printings)");
    const field = within(sheet).getByRole("textbox", { name: "Deck total" });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a total it already meets asks nothing — Save $400 as this deck's total saves it alone", () => {
    const { sheet, onSaveTotal } = renderSheet();
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Deck total" }), {
      target: { value: "$400" },
    });
    fireEvent.click(within(sheet).getByRole("button", { name: "Fit" }));
    expect(fitState()).toBe("within");
    expect(sheet.textContent).toContain("Already within your budget: est. $300 of your $400.");
    fireEvent.click(within(sheet).getByRole("button", { name: "Save $400 as this deck's total" }));
    expect(onSaveTotal).toHaveBeenCalledWith(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a total that isn't a whole number of dollars is refused, aloud", () => {
    const { sheet } = renderSheet();
    const field = within(sheet).getByRole("textbox", { name: "Deck total" });
    for (const value of ["0", "12.50", "abc", "100001"]) {
      fireEvent.change(field, { target: { value } });
      fireEvent.click(within(sheet).getByRole("button", { name: "Fit" }));
      expect(within(sheet).getByRole("alert").textContent).toBe(
        "Enter a whole number of dollars, at least $1.",
      );
    }
    expect(fitState()).toBe("set-total");
  });

  it("$250: the three priciest are asked together, and the first batch fits — nothing more is asked", async () => {
    const { sheet } = renderSheet();
    preset(sheet, "$250");
    await settled();
    expect(asked().map(name)).toEqual(["Pricey A", "Pricey B", "Pricey C"]);
    // 300 − 39 − 29 = 232: two swaps reach it; Pricey C stays unchecked.
    expect(after()).toBe("est. $232 of your $250");
    const rows = sheet.querySelectorAll("[data-fit-row]");
    expect(rows).toHaveLength(3);
    expect(within(sheet).getByRole("checkbox", { name: /Swap Pricey C/ })).toHaveProperty(
      "checked",
      false,
    );
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toBeTruthy();
  });

  it("the $300 fixture at $150: batch after batch while it falls short — eight swaps land it at $148, Apply hands one list", async () => {
    const { sheet, onApply } = renderSheet();
    preset(sheet, "$150");
    await settled();
    // Three batches of three: the ninth card is asked with its batch; the tenth never is.
    expect(asked()).toHaveLength(FIT_ASK_LIMIT);
    expect(asked().map(name)).toEqual(PRICEY.slice(0, 9).map((c) => c.name));
    expect(after()).toBe("est. $148 of your $150");
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap 8 cards" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const apply = onApply.mock.calls[0][0];
    expect(apply.swapped).toBe(8);
    expect(apply.totalUsd).toBe(150);
    // Each pricey card's best-ranked alternative, in its place; the ninth and tenth stay.
    const picks = PRICEY.slice(0, 8).map((c) => ROWS.get(c.id)![0].cardId);
    expect(apply.cards.map((w) => w.id)).toEqual(picks);
    expect(apply.entries.map((e) => e.cardId)).toEqual(
      ENTRIES.map((e) => {
        const i = PRICEY.findIndex((c) => c.id === e.cardId);
        return i >= 0 && i < 8 ? picks[i] : e.cardId;
      }),
    );
    expect(apply.entries).toHaveLength(ENTRIES.length);
  });

  it("a new total keeps every answer: lowering it asks only the cards it hadn't", async () => {
    const { sheet } = renderSheet();
    preset(sheet, "$250");
    await settled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Change" }));
    preset(sheet, "$150");
    await settled();
    expect(asked()).toHaveLength(FIT_ASK_LIMIT);
    expect(new Set(asked()).size).toBe(FIT_ASK_LIMIT);
  });

  it("the goals ride every ask without the total; a row over the per-card budget is never offered", async () => {
    const goals: DeckGoals = { v: 1, targetLevel: 3, budget: { perCardUsd: 5, totalUsd: 290 } };
    const flagged = row("4.00", {
      conflicts: [
        { rule: "budget", source: "Card price", why: "Costs $6 — over", severity: "flag" },
      ],
    });
    ROWS.set(PRICEY[0].id, [flagged, ...ROWS.get(PRICEY[0].id)!]);
    try {
      const { sheet } = renderSheet({ goals });
      // A saved total: the plan starts at once, and the total reads, not edits.
      expect(sheet.textContent).toContain("Deck total $290");
      await settled();
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body).toEqual({
        game: "mtg",
        format: "commander",
        leaderIds: [leader.id],
        entries: ENTRIES.slice(1).map((e) => ({ cardId: e.cardId, qty: e.qty })),
        goals: { v: 1, targetLevel: 3, budget: { perCardUsd: 5 } },
        cardId: PRICEY[0].id,
      });
      expect(within(sheet).queryByText(flagged.name)).toBeNull();
      // The goals the alternatives keep to, read-only — the total is the sheet's own.
      expect(sheet.querySelector("[data-slot=goals-line]")?.textContent).toBe(
        "Your goals: Bracket 3 (Upgraded), ≤ $5 a card",
      );
    } finally {
      ROWS.set(PRICEY[0].id, ROWS.get(PRICEY[0].id)!.slice(1));
    }
  });
});

describe("FitSheet — honest outcomes", () => {
  it("says how close it gets: the best-ranked can't reach it, so each card takes its cheapest — said aloud", async () => {
    const few = new Map([...ROWS].slice(0, 2));
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { cardId } = JSON.parse(init.body as string);
      return ok(answer(cardId, few.get(cardId) ?? []));
    });
    const { sheet } = renderSheet();
    preset(sheet, "$150");
    await settled();
    expect(asked()).toHaveLength(FIT_ASK_LIMIT);
    // 300 − (40 − 0.50) − (30 − 0.50) = 231.
    expect(after()).toBe("Gets you to $231 of your $150");
    expect(sheet.textContent).toContain(
      "The best-ranked swaps can't reach your total, so each card takes its cheapest alternative.",
    );
    expect(sheet.textContent).toContain(
      "No cheaper alternative under your goals for Pricey C, Pricey D, Pricey E, Pricey F, Pricey G, Pricey H, Pricey I.",
    );
  });

  it("nothing to swap down: “No suitable alternative under your goals.” — and nothing to apply", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      ok(answer(JSON.parse(init.body as string).cardId, [row("99.00")])),
    );
    const { sheet } = renderSheet();
    preset(sheet, "$150");
    await waitFor(() => expect(fitState()).toBe("nothing"));
    expect(sheet.textContent).toContain("No suitable alternative under your goals.");
    expect(within(sheet).getByRole("button", { name: "Swap 0 cards" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("no card worth asking about is the same honest line — and the pricey ones it skipped are named", async () => {
    const noRoles = new Map(
      [...CARDS].map(([id, c]) => [id, { ...c, attrs: { ...c.attrs, roles: [] } }]),
    );
    const { sheet } = renderSheet({ cards: noRoles });
    preset(sheet, "$150");
    expect(fitState()).toBe("nothing");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sheet.textContent).toContain(
      "Not looked at: Pricey A (no community roles yet), Pricey B (no community roles yet), Pricey C (no community roles yet), Pricey D (no community roles yet) and 58 more.",
    );
  });

  it("unpriced cards are counted beside the estimate, never as $0; owned ones are $0 and stay", () => {
    const mystery = editorCard("Mystery", null);
    const entries = [...ENTRIES, { cardId: mystery.id, zone: "main", qty: 1, tags: [] }];
    const cards = new Map([...CARDS, [mystery.id, mystery]]);
    const { sheet } = renderSheet({ entries, cards, owned: new Set([PRICEY[0].id]) });
    expect(sheet.textContent).toContain(
      "est. $260 now (cheapest printings) · 1 card without a price not counted",
    );
    expect(sheet.textContent).toContain("Cards you own count as $0 and stay.");
  });

  it("combo pieces stay out — and without facts the sheet says it couldn't keep them out", async () => {
    const combo: CompleteCombo = {
      key: "k",
      cardPieces: [PRICEY[0].id, PRICEY[1].id],
      templates: [],
      tag: "C",
      relevant: true,
      results: ["Infinite mana"],
      popularity: 9,
    };
    const { sheet } = renderSheet({ combos: [combo] });
    preset(sheet, "$250");
    await settled();
    expect(asked().map(name)).toEqual(["Pricey C", "Pricey D", "Pricey E"]);
    expect(sheet.textContent).toContain(
      "Not looked at: Pricey A (a combo piece), Pricey B (a combo piece).",
    );
    cleanup();
    fetchMock.mockClear();
    const unknown = renderSheet({ combos: null });
    preset(unknown.sheet, "$250");
    await settled();
    expect(asked().map(name)).toEqual(["Pricey A", "Pricey B", "Pricey C"]);
    expect(unknown.sheet.textContent).toContain(
      "Couldn't check combos. Combo pieces aren't kept out of these swaps.",
    );
  });

  it("a 429 stops the asking and says so; Try again asks the failed cards again", async () => {
    let limited = true;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const { cardId } = JSON.parse(init.body as string);
      if (limited && cardId === PRICEY[1].id)
        return { ok: false, status: 429, json: async () => ({}) };
      return ok(answer(cardId, ROWS.get(cardId) ?? []));
    });
    const { sheet } = renderSheet();
    preset(sheet, "$150");
    await waitFor(() =>
      expect(sheet.textContent).toContain(
        "Alternatives are rate-limited for a moment. Try again shortly.",
      ),
    );
    // The batch landed; nothing more is asked while a card failed.
    expect(asked()).toHaveLength(3);
    limited = false;
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    await settled();
    expect(asked().filter((id) => id === PRICEY[1].id)).toHaveLength(2);
    expect(asked()).toHaveLength(FIT_ASK_LIMIT + 1);
    expect(after()).toBe("est. $148 of your $150");
  });

  it("no commander: says so and asks nothing", () => {
    const { sheet } = renderSheet({ entries: ENTRIES.slice(1) });
    preset(sheet, "$150");
    expect(sheet.textContent).toContain(
      "Add a Commander first. Alternatives follow its color identity.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("FitSheet — the review", () => {
  it("unchecking a swap keeps the card — and the sheet checks the next one to stay in budget", async () => {
    const { sheet } = renderSheet();
    preset(sheet, "$250");
    await settled();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Swap Pricey A/ }));
    // 300 − 29 − 24 = 247: Pricey B and C now carry it.
    expect(after()).toBe("est. $247 of your $250");
    expect(within(sheet).getByRole("checkbox", { name: /Swap Pricey C/ })).toHaveProperty(
      "checked",
      true,
    );
    // Checked again, it takes its best-ranked option back.
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Swap Pricey A/ }));
    const a = within(sheet).getByRole("radiogroup", { name: "Instead of Pricey A" });
    expect(within(a).getAllByRole("radio")[0]).toHaveProperty("checked", true);
  });

  it("a choice picks another alternative and the total follows; one picked for another card is disabled and says for which", async () => {
    const shared = row("2.00");
    ROWS.set(PRICEY[1].id, [shared, ...ROWS.get(PRICEY[1].id)!]);
    ROWS.set(PRICEY[0].id, [...ROWS.get(PRICEY[0].id)!, shared]);
    try {
      const { sheet } = renderSheet();
      preset(sheet, "$250");
      await settled();
      const a = within(sheet).getByRole("radiogroup", { name: "Instead of Pricey A" });
      const [, cheaper, viaB] = within(a).getAllByRole("radio");
      expect(viaB).toHaveProperty("disabled", true);
      expect(a.textContent).toContain("picked for Pricey B");
      fireEvent.click(cheaper);
      expect(cheaper).toHaveProperty("checked", true);
      // 300 − 39.50 − 28 = 232.50; the row now says what the cheaper choice saves.
      expect(after()).toBe("est. $233 of your $250");
      expect(a.textContent).toContain("saves $39.50");
    } finally {
      ROWS.set(PRICEY[1].id, ROWS.get(PRICEY[1].id)!.slice(1));
      ROWS.set(PRICEY[0].id, ROWS.get(PRICEY[0].id)!.slice(0, 2));
    }
  });

  it("Remove this deck's total clears it and asks for a new one", async () => {
    const { sheet, onSaveTotal } = renderSheet({ goals: { v: 1, budget: { totalUsd: 400 } } });
    expect(fitState()).toBe("within");
    // Already the deck's total: nothing to save.
    expect(within(sheet).queryByRole("button", { name: /^Save / })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove this deck's total" }));
    expect(onSaveTotal).toHaveBeenCalledWith(null);
    await act(async () => {});
    expect(fitState()).toBe("set-total");
  });

  it("Apply waits while cards are still being asked — the plan can still move", async () => {
    const held: (() => void)[] = [];
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((resolve) => {
          const { cardId } = JSON.parse(init.body as string);
          held.push(() => resolve(ok(answer(cardId, ROWS.get(cardId) ?? []))));
        }),
    );
    const { sheet } = renderSheet();
    preset(sheet, "$250");
    await waitFor(() => expect(held).toHaveLength(3));
    // Two answers in: the plan already fits, but the third card is still out.
    await act(async () => {
      held[0]();
      held[1]();
    });
    expect(fitState()).toBe("asking");
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toHaveProperty(
      "disabled",
      true,
    );
    await act(async () => held[2]());
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("on a phone: the bottom Drawer, the field focused when no total is saved", async () => {
    renderSheet({ phone: true });
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeTruthy();
    const field = screen.getByRole("textbox", { name: "Deck total" });
    await waitFor(() => expect(document.activeElement).toBe(field));
  });
});
