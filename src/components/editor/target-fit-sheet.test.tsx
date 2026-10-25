/**
 * BRACKET-FIT — the "Swap to fit" sheet on its own, over a real Magic read:
 * the asks in plan order (a batch at a time, the limit per open, a 429 and
 * Try again, a card with none planned around), the review (keep, another
 * option, another piece instead), what the swaps can't fix, the price of
 * the cards coming in, the after-check over mocked facts (a fit, a miss in
 * the read's own words, a facts failure with Retry), and Swap handing the
 * editor ONE next list.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TARGET_FIT_ASK_LIMIT } from "@/lib/brackets/target-fit";
import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGoals } from "@/lib/decks/goals";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { basicLands, card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";

import { TargetFitSheet, type TargetFitApply } from "./target-fit-sheet";

const mtg = getAdapter("mtg");

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: Object.fromEntries(
    ["gameChangers", "landDenial", "extraTurns", "combos"].map((f) => [
      f,
      { state: "ok", asOf: AT },
    ]),
  ),
};

const editorCard = (c: MtgCard): EditorCard => ({ ...c, image: null });
const spell = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  editorCard(
    card({
      primaryType: "Sorcery",
      costValue: 2,
      ...over,
      name,
      attrs: { type_line: "Sorcery", oracle_text: "", roles: ["card-draw"] as never, ...attrs },
    }),
  );
const kiki = spell(
  "Kiki-Jiki, Mirror Breaker",
  {},
  { isLeaderCandidate: true, primaryType: "Creature" },
);
const conscripts = spell("Zealous Conscripts", { roles: ["token-maker"] as never });
const rhystic = spell("Rhystic Study", { game_changer: true });
const rift = spell("Cyclonic Rift", { game_changer: true, roles: ["board-wipe"] as never });
const cradle = spell("Gaea's Cradle", { game_changer: true }, { primaryType: "Land" });
const tutors = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((l) =>
  spell(`Tutor ${l}`, { game_changer: true, roles: ["tutor"] as never }),
);
const KIKI: CompleteCombo = {
  key: "kiki",
  cardPieces: [kiki.id, conscripts.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite creature tokens with haste"],
  popularity: 9,
};

/** Kiki-Jiki, the specials, 36 lands, fillers to 100. */
function list(specials: EditorCard[]) {
  const lands = basicLands(36).map(editorCard);
  const fill = fillers(99 - specials.length - 36).map(editorCard);
  const entries: EditorEntry[] = [
    { cardId: kiki.id, zone: "commander", qty: 1, tags: [] },
    ...[...specials, ...lands, ...fill].map((c) => ({
      cardId: c.id,
      zone: "main",
      qty: 1,
      tags: ["mine"],
      printingId: `${c.id}-printing`,
    })),
  ];
  return { entries, cards: new Map([kiki, ...specials, ...lands, ...fill].map((c) => [c.id, c])) };
}

/** One route row: an alternative with its wire (a fresh card id each time). */
function alt(name: string, usd: string | null = "1.00", shared = ["card-draw"]) {
  const wire: CardWire = {
    ...card({
      name,
      primaryType: "Sorcery",
      cheapestUsd: usd === null ? null : Number(usd),
      attrs: { type_line: "Sorcery", oracle_text: "", roles: shared as never },
    }),
    image: null,
  };
  return {
    cardId: wire.id,
    name: wire.name,
    costValue: 2,
    cheapestUsd: usd,
    evidence: [],
    conflicts: [],
    shared,
    card: { ...wire, legality: [] },
  };
}
type Row = ReturnType<typeof alt>;

const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
let ROWS = new Map<string, Row[]>();
/** The facts route's answer for the list after the swaps. */
let afterCombos: (ids: string[]) => CompleteCombo[] = () => [];
let factsFail = false;

const asked = (): string[] =>
  fetchMock.mock.calls
    .filter(([url]) => url === "/api/alternatives")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).cardId);
const factsCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/combos/complete?"));

beforeEach(() => {
  ROWS = new Map();
  afterCombos = () => [];
  factsFail = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/alternatives") {
      const { cardId } = JSON.parse(init!.body as string);
      return ok({
        cardId,
        roles: ["card-draw"],
        alternatives: ROWS.get(cardId) ?? [],
        hidden: [],
        combosTruncated: false,
        tradeoff: null,
      });
    }
    if (url.startsWith("/api/combos/complete?")) {
      if (factsFail) return { ok: false, status: 500, json: async () => ({}) };
      const ids = new URL(url, "http://local").searchParams.get("ids")!.split(",");
      return ok({ combos: afterCombos(ids), freshness: FRESH });
    }
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSheet({
  specials = [conscripts, rhystic, rift, cradle],
  combos = [KIKI] as CompleteCombo[],
  goals = { v: 1, targetLevel: 2 } as DeckGoals,
  owned = null as ReadonlySet<string> | null,
  phone = false,
} = {}) {
  const { entries, cards } = list(specials);
  const read = mtg.brackets!.assess({
    deck: toDeckSnapshot("mtg", COMMANDER, entries),
    cards,
    combos,
    freshness: FRESH,
    targetLevel: goals.targetLevel ?? null,
    answers: goals.answers ?? null,
  });
  const onApply = vi.fn<(apply: TargetFitApply) => void>();
  const onClose = vi.fn();
  render(
    <TargetFitSheet
      adapter={mtg}
      format={COMMANDER}
      entries={entries}
      cards={cards}
      goals={goals}
      read={read}
      combos={combos}
      freshness={FRESH}
      owned={owned}
      phone={phone}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const sheet = screen.getByRole("dialog", { name: "Swap to fit Bracket 2" });
  return { sheet, entries, cards, read, onApply, onClose };
}

const fitState = () =>
  document.querySelector("[data-slot=target-fit-sheet]")?.getAttribute("data-fit-state");
const after = () => document.querySelector<HTMLElement>("[data-slot=target-fit-after]");
async function settled() {
  await waitFor(() => expect(fitState()).not.toBe("asking"));
}
async function verdict(kind: "fits" | "still" | "failed") {
  await waitFor(() => expect(after()?.dataset.after).toBe(kind), { timeout: 3000 });
  return after()!;
}
const name = (id: string) =>
  [kiki, conscripts, rhystic, rift, cradle, ...tutors].find((c) => c.id === id)?.name;

describe("TargetFitSheet — the asks", () => {
  it("asks the cards going out in plan order, as one batch, with Swap Lab's body and the target", async () => {
    ROWS.set(rhystic.id, [alt("Alt Draw")]);
    ROWS.set(rift.id, [alt("Alt Wipe", "2.00", ["board-wipe"])]);
    ROWS.set(conscripts.id, [alt("Alt Maker", "0.50", ["token-maker"])]);
    const { sheet, entries } = renderSheet();
    await settled();
    // The Game Changers first (the read's order), then the combo's piece; the land is never asked.
    expect(asked().map(name)).toEqual(["Cyclonic Rift", "Rhystic Study", "Zealous Conscripts"]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [kiki.id],
      entries: entries.slice(1).map((e) => ({ cardId: e.cardId, qty: e.qty })),
      goals: { v: 1, targetLevel: 2 },
      cardId: rift.id,
    });
    // Rows under each conflict's own sentence.
    const gc = sheet.querySelector<HTMLElement>('[data-fit-fix="game-changers"]')!;
    expect(gc.textContent).toContain(
      "3 Game Changers: Cyclonic Rift, Gaea's Cradle and Rhystic Study.",
    );
    expect(
      [...gc.querySelectorAll<HTMLElement>("[data-fit-row]")].map((r) => name(r.dataset.fitRow!)),
    ).toEqual(["Cyclonic Rift", "Rhystic Study"]);
    const combo = sheet.querySelector<HTMLElement>('[data-fit-fix="combo:kiki"]')!;
    expect(combo.textContent).toContain("Two-card combo with your commander");
    expect(within(sheet).getByRole("button", { name: "Swap 3 cards" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("asks a batch at a time and at most the limit per open; says how many it didn't look at", async () => {
    for (const t of tutors) ROWS.set(t.id, [alt(`Not ${t.name}`)]);
    const { sheet } = renderSheet({ specials: tutors, combos: [] });
    await settled();
    expect(asked()).toHaveLength(TARGET_FIT_ASK_LIMIT);
    expect(asked().map(name)).toEqual(tutors.slice(0, 9).map((t) => t.name));
    expect(sheet.querySelector("[data-slot=target-fit-not-looked]")?.textContent).toBe(
      "Didn't look at 2 more cards. Swap these first, then open this again for more.",
    );
    const left = sheet.querySelector<HTMLElement>("[data-slot=target-fit-left]")!;
    expect(left.textContent).toContain("Tutor J and Tutor K weren't looked at, so they stay.");
    expect(within(sheet).getByRole("button", { name: "Swap 9 cards" })).toBeTruthy();
  });

  it("a card with no option is planned around: Remove A or B, A has none, so B is asked", async () => {
    const pact = spell("Tainted Pact");
    const oracle = spell("Thassa's Oracle");
    const combo: CompleteCombo = {
      ...KIKI,
      key: "oracle",
      cardPieces: [oracle.id, pact.id].sort(),
    };
    ROWS.set(oracle.id, [alt("Alt Oracle")]);
    const { sheet } = renderSheet({ specials: [pact, oracle], combos: [combo] });
    await settled();
    // "Tainted Pact" comes first by name and has none; "Thassa's Oracle" goes instead.
    expect(asked().map((id) => [pact, oracle].find((c) => c.id === id)?.name)).toEqual([
      "Tainted Pact",
      "Thassa's Oracle",
    ]);
    const rows = [...sheet.querySelectorAll<HTMLElement>("[data-fit-row]")];
    expect(rows.map((r) => r.dataset.fitRow)).toEqual([oracle.id]);
    expect(sheet.querySelector("[data-slot=target-fit-left]")).toBeNull();
  });

  it("a 429 stops the asking and says so; Try again asks the failed card again", async () => {
    let limited = true;
    for (const t of tutors.slice(0, 4)) ROWS.set(t.id, [alt(`Not ${t.name}`)]);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/alternatives") {
        const { cardId } = JSON.parse(init!.body as string);
        if (limited && cardId === tutors[1].id)
          return { ok: false, status: 429, json: async () => ({}) };
      }
      return base(input, init);
    });
    const { sheet } = renderSheet({ specials: tutors.slice(0, 4), combos: [] });
    await waitFor(() =>
      expect(sheet.textContent).toContain(
        "Alternatives are rate-limited for a moment. Try again shortly.",
      ),
    );
    // The first batch landed; nothing more is asked while a card failed.
    expect(asked()).toHaveLength(3);
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toBeTruthy();
    limited = false;
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(within(sheet).queryByRole("button", { name: "Swap 4 cards" })).toBeTruthy(),
    );
    expect(asked().filter((id) => id === tutors[1].id)).toHaveLength(2);
    expect(asked()).toHaveLength(5);
  });
});

describe("TargetFitSheet — the review", () => {
  beforeEach(() => {
    ROWS.set(rhystic.id, [alt("Alt Draw"), alt("Second Draw", "0.25")]);
    ROWS.set(rift.id, [alt("Alt Wipe", "2.00", ["board-wipe"])]);
    ROWS.set(conscripts.id, [alt("Alt Maker", "0.50", ["token-maker"])]);
  });

  it("each row: swap or keep, its options with what they share and their price", async () => {
    const { sheet } = renderSheet();
    await settled();
    const group = within(sheet).getByRole("radiogroup", { name: "Instead of Rhystic Study" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false]);
    expect(group.textContent).toContain("Alt Draw$1.00");
    expect(group.textContent).toContain("Second Draw$0.25");
    expect(group.textContent).toContain("Both: card draw");
    expect(
      within(sheet)
        .getByRole("checkbox", { name: /Swap Rhystic Study/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("choosing another option swaps that one in, and the price follows", async () => {
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    await settled();
    expect(sheet.querySelector("[data-slot=target-fit-cost]")?.textContent).toBe(
      "The cards coming in cost $3.50.",
    );
    const group = within(sheet).getByRole("radiogroup", { name: "Instead of Rhystic Study" });
    fireEvent.click(within(group).getAllByRole("radio")[1]);
    expect((within(group).getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(true);
    expect(sheet.querySelector("[data-slot=target-fit-cost]")?.textContent).toBe(
      "The cards coming in cost $2.75.",
    );
  });

  it("keep: the card stays, the fix names it, and checking it again swaps it back", async () => {
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    await settled();
    const check = within(sheet).getByRole("checkbox", { name: /Swap Rhystic Study/ });
    fireEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("false");
    // The row stays, unchecked; focus stays on its check.
    expect(sheet.querySelector(`[data-fit-row="${rhystic.id}"]`)?.hasAttribute("data-kept")).toBe(
      true,
    );
    const left = sheet.querySelector<HTMLElement>('[data-fit-short="game-changers"]')!;
    expect(left.textContent).toContain("You're keeping Rhystic Study.");
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toBeTruthy();
    fireEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("true");
    expect(sheet.querySelector('[data-fit-short="game-changers"]')).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Swap 3 cards" })).toBeTruthy();
  });

  it("a fix that needs one card offers its other pieces: Swap Tainted Pact instead", async () => {
    const pact = spell("Tainted Pact");
    const oracle = spell("Thassa's Oracle");
    const combo: CompleteCombo = {
      ...KIKI,
      key: "oracle",
      cardPieces: [oracle.id, pact.id].sort(),
    };
    ROWS.set(pact.id, [alt("Alt Pact")]);
    ROWS.set(oracle.id, [alt("Alt Oracle")]);
    const { sheet } = renderSheet({ specials: [pact, oracle], combos: [combo] });
    await settled();
    expect(
      [...sheet.querySelectorAll<HTMLElement>("[data-fit-row]")].map((r) => r.dataset.fitRow),
    ).toEqual([pact.id]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Thassa's Oracle instead" }));
    await settled();
    // The first piece stays, kept; the other goes, asked for its options.
    expect(asked().filter((id) => id === oracle.id)).toHaveLength(1);
    const rows = [...sheet.querySelectorAll<HTMLElement>("[data-fit-row]")];
    expect(rows.map((r) => [r.dataset.fitRow, r.hasAttribute("data-kept")])).toEqual([
      [pact.id, true],
      [oracle.id, false],
    ]);
    expect(document.activeElement).toBe(
      within(rows[0]).getByRole("checkbox", { name: /Swap Tainted Pact/ }),
    );
    expect(within(sheet).getByRole("button", { name: "Swap 1 card" })).toBeTruthy();
  });

  it("no incoming card twice: one coming in for another reads as picked for it", async () => {
    const shared = alt("Shared Draw");
    ROWS.set(rhystic.id, [shared, alt("Alt Draw")]);
    ROWS.set(rift.id, [shared, alt("Alt Wipe", "2.00", ["board-wipe"])]);
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    await settled();
    const rhysticGroup = within(sheet).getByRole("radiogroup", {
      name: "Instead of Rhystic Study",
    });
    const [taken] = within(rhysticGroup).getAllByRole("radio");
    // Cyclonic Rift is first in the plan: it takes the shared card.
    expect(taken).toHaveProperty("disabled", true);
    expect(rhysticGroup.textContent).toContain("Coming in for Cyclonic Rift.");
  });

  it("what the swaps can't fix comes last, every card that stays named with its reason", async () => {
    const { sheet } = renderSheet();
    await settled();
    const left = sheet.querySelector<HTMLElement>("[data-slot=target-fit-left]")!;
    expect(within(left).getByRole("heading", { name: "What swaps can't fix" })).toBeTruthy();
    expect(left.textContent).toContain(
      "3 Game Changers: Cyclonic Rift, Gaea's Cradle and Rhystic Study.",
    );
    expect(left.textContent).toContain(
      "Alternatives aren't offered for Gaea's Cradle, so it stays.",
    );
  });

  it("the cards the player owns aren't counted in the price", async () => {
    const owned = new Set([ROWS.get(rift.id)![0].cardId]);
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift], owned });
    await settled();
    expect(sheet.querySelector("[data-slot=target-fit-cost]")?.textContent).toBe(
      "The cards coming in cost $1.50, not counting the 1 you own.",
    );
  });
});

describe("TargetFitSheet — the after-check", () => {
  beforeEach(() => {
    ROWS.set(rhystic.id, [alt("Alt Draw")]);
    ROWS.set(rift.id, [alt("Alt Wipe", "2.00", ["board-wipe"])]);
    ROWS.set(conscripts.id, [alt("Alt Maker", "0.50", ["token-maker"])]);
  });

  it("a fit: the read of the list after the swaps finds nothing above the target — only then it says so", async () => {
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    const line = await verdict("fits");
    expect(line.textContent).toBe(
      "After these swaps, nothing in the list puts the deck above Bracket 2.",
    );
    expect(sheet.querySelector("[data-slot=target-fit-status]")?.textContent).toBe(
      line.textContent,
    );
    // ONE facts GET, for the list after the swaps.
    expect(factsCalls()).toHaveLength(1);
    const ids = new URL(String(factsCalls()[0][0]), "http://local").searchParams.get("ids")!;
    expect(ids.split(",")).not.toContain(rhystic.id);
    expect(ids.split(",")).toContain(ROWS.get(rhystic.id)![0].cardId);
  });

  it("a miss in the read's own words: a land it can't swap, and a combo a card coming in completes", async () => {
    const maker = ROWS.get(conscripts.id)![0];
    afterCombos = (ids) =>
      ids.includes(maker.cardId)
        ? [{ ...KIKI, key: "maker", cardPieces: [kiki.id, maker.cardId].sort() }]
        : [];
    renderSheet();
    const line = await verdict("still");
    expect(line.textContent).toContain(
      "After these swaps, these still put the deck above Bracket 2:",
    );
    const rows = [...line.querySelectorAll<HTMLElement>("[data-after-conflict]")];
    expect(rows.map((r) => r.dataset.afterConflict)).toEqual(["game-changers", "combo:maker"]);
    expect(rows[0].textContent).toBe("1 Game Changer: Gaea's Cradle. Brackets 1 and 2 allow none.");
    expect(rows[1].textContent).toContain(
      "Two-card combo with your commander: Alt Maker + Kiki-Jiki",
    );
  });

  it("a facts failure is said plainly, with Retry; the swap stays the player's call", async () => {
    factsFail = true;
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    const line = await verdict("failed");
    expect(line.textContent).toBe("Couldn't check combos for the list after these swaps. Retry");
    expect(within(sheet).getByRole("button", { name: "Swap 3 cards" })).toHaveProperty(
      "disabled",
      false,
    );
    factsFail = false;
    fireEvent.click(within(line).getByRole("button", { name: "Retry" }));
    await verdict("fits");
  });

  it("a changed swap asks for the new list's facts and says Checking meanwhile", async () => {
    const { sheet } = renderSheet({ specials: [conscripts, rhystic, rift] });
    await verdict("fits");
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /Swap Rhystic Study/ }));
    expect(after()?.dataset.after).toBe("checking");
    expect(after()?.textContent).toBe("Checking the list after these swaps…");
    // Kept: Rhystic Study is a Game Changer left above the target.
    const line = await verdict("still");
    expect(line.textContent).toContain("1 Game Changer: Rhystic Study.");
    expect(factsCalls()).toHaveLength(2);
  });
});

describe("TargetFitSheet — Swap", () => {
  it("hands the editor ONE next list: each card out for its pick in place, every other row untouched, the size kept", async () => {
    ROWS.set(rhystic.id, [alt("Alt Draw")]);
    ROWS.set(rift.id, [alt("Alt Wipe", "2.00", ["board-wipe"])]);
    ROWS.set(conscripts.id, [alt("Alt Maker", "0.50", ["token-maker"])]);
    const { sheet, entries, onApply } = renderSheet();
    await verdict("still");
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap 3 cards" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const apply = onApply.mock.calls[0][0];
    expect(apply.swapped).toBe(3);
    const picks = new Map([
      [rhystic.id, ROWS.get(rhystic.id)![0].cardId],
      [rift.id, ROWS.get(rift.id)![0].cardId],
      [conscripts.id, ROWS.get(conscripts.id)![0].cardId],
    ]);
    expect(apply.cards.map((w) => w.id).sort()).toEqual([...picks.values()].sort());
    expect(apply.entries).toHaveLength(entries.length);
    apply.entries.forEach((e, i) => {
      const inId = picks.get(entries[i].cardId);
      if (inId) expect(e).toEqual({ cardId: inId, zone: "main", qty: 1, tags: [] });
      else expect(e).toBe(entries[i]);
    });
  });

  it("Swap waits while cards are still being asked", async () => {
    const held: (() => void)[] = [];
    ROWS.set(rhystic.id, [alt("Alt Draw")]);
    ROWS.set(rift.id, [alt("Alt Wipe", "2.00", ["board-wipe"])]);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((resolve) => {
          if (String(input) !== "/api/alternatives") return resolve(base(input, init));
          held.push(() => resolve(base(input, init)));
        }),
    );
    const { sheet } = renderSheet({ specials: [rhystic, rift], combos: [] });
    await waitFor(() => expect(held).toHaveLength(2));
    await act(async () => held[0]());
    expect(fitState()).toBe("asking");
    expect(sheet.textContent).toContain("Finding alternatives for 1 more card…");
    expect(within(sheet).getByRole("button", { name: "Swap 1 card" })).toHaveProperty(
      "disabled",
      true,
    );
    await act(async () => held[1]());
    expect(within(sheet).getByRole("button", { name: "Swap 2 cards" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("on a phone: the bottom Drawer", async () => {
    renderSheet({ phone: true });
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeTruthy();
    await settled();
  });
});

describe("copy guard (WAVE4 D0) — everything the sheet renders", () => {
  it("rows, options, what can't be fixed, the after-line and the price: no 'approve', no Spellbook tag name, no notation", async () => {
    const shared = alt("Shared Draw");
    ROWS.set(rhystic.id, [shared, alt("Alt Draw", null)]);
    ROWS.set(rift.id, [shared, alt("Alt Wipe", "2.00", ["board-wipe"])]);
    ROWS.set(conscripts.id, [alt("Alt Maker", "0.50", ["token-maker"])]);
    renderSheet({ owned: new Set([shared.cardId]) });
    await verdict("still");
    const text = document.body.textContent ?? "";
    expect(text).toContain("What swaps can't fix");
    expect(text).toContain("Coming in for Cyclonic Rift.");
    expect(text).not.toMatch(/approv/i);
    expect(text).not.toMatch(/ruthless|spicy|powerful|oddball|precon appropriate|casual/i);
    expect(text).not.toMatch(/\d\+|est\.|[–—]/);
  });
});
