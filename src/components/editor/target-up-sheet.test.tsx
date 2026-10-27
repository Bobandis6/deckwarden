/**
 * BRACKET-UP — the "Upgrade toward" sheet on its own, over a real Magic
 * read: the two asks (ONE Suggestions POST with the live list, the goals
 * and the deck's budget; ONE resolve with the id guard), a 429 and Try
 * again; the review (rows in Suggestions' order, the weakest card at each
 * cost, uncheck, another card to cut, an unpaired land, the goals row by
 * row); the after-check over mocked facts (the target reached, short of
 * it, nothing raised, a combo two cards complete above it, a facts
 * failure); the price; and Swap handing the editor ONE next list.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire, EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGoals } from "@/lib/decks/goals";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { basicLands, card, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";

import type { TargetFitApply } from "./target-fit-sheet";
import { TargetUpSheet } from "./target-up-sheet";

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
const kiki = editorCard(
  card({
    name: "Kiki-Jiki, Mirror Breaker",
    costValue: 5,
    isLeaderCandidate: true,
    attrs: { type_line: "Legendary Creature — Goblin Shaman", oracle_text: "" },
  }),
);
const lands = basicLands(36).map(editorCard);
/** 63 ranked fringe spells, mana value 1 to 6: Fringe 62 is the weakest 2-drop, Fringe 63 the weakest 3-drop. */
const fringe = Array.from({ length: 63 }, (_, i) =>
  editorCard(
    card({
      name: `Fringe ${i + 1}`,
      primaryType: "Sorcery",
      costValue: (i % 6) + 1,
      popularity: 30_000 + i,
      cheapestUsd: 0.1,
      attrs: { type_line: "Sorcery", oracle_text: "" },
    }),
  ),
);
const byName = (name: string) => [...lands, ...fringe].find((c) => c.name === name)!;

function list() {
  const entries: EditorEntry[] = [
    { cardId: kiki.id, zone: "commander", qty: 1, tags: [] },
    ...[...lands, ...fringe].map((c) => ({
      cardId: c.id,
      zone: "main",
      qty: 1,
      tags: ["mine"],
      printingId: `${c.id}-printing`,
    })),
  ];
  return { entries, cards: new Map([kiki, ...lands, ...fringe].map((c) => [c.id, c])) };
}

/** A card coming in: its wire and its Suggestions row. */
function incoming(
  name: string,
  costValue: number,
  usd: string | null = "1.00",
  over: Omit<Partial<MtgCard>, "attrs"> & { attrs?: Partial<MtgCard["attrs"]> } = {},
) {
  const wire: CardWire = {
    ...card({
      primaryType: "Sorcery",
      ...over,
      name,
      costValue,
      cheapestUsd: usd === null ? null : Number(usd),
      attrs: { type_line: "Sorcery", oracle_text: "", ...over.attrs },
    }),
    image: null,
    legality: [],
  };
  const rec = {
    cardId: wire.id,
    name,
    primaryType: wire.primaryType,
    costValue,
    ciMask: 0,
    cheapestUsd: usd,
    popularity: 10,
    score: 0.9,
    confidence: "high",
    evidence: [
      {
        source: "edhrec_rank",
        why: `A Commander staple in EDHREC decklists (${name})`,
        with: [],
        howOften: "EDHREC rank #10",
        confidence: "high",
      },
    ],
    conflicts: [],
  };
  return { wire, rec };
}
const changer = (name: string) =>
  incoming(name, 2, "1.00", { attrs: { game_changer: true, type_line: "Sorcery" } });
const one = changer("Changer One");
const plain = incoming("Plain Three", 3, "2.50");
const two = changer("Changer Two");
const grove = incoming("Gilded Grove", 0, "0.75", {
  primaryType: "Land",
  attrs: { type_line: "Land" },
});
const three = changer("Changer Three");
const four = changer("Changer Four");
const DEFAULT_IN = [one, plain, two, grove, three, four];

const fetchMock = vi.fn();
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
let IN = DEFAULT_IN;
/** The resolve's answer by name: a test can make one name resolve to another card. */
let resolveAs = (name: string): CardWire | null =>
  IN.find((x) => x.rec.name === name)?.wire ?? null;
let recStatus = 200;
let afterCombos: (ids: string[]) => CompleteCombo[] = () => [];
let factsFail = false;

const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u).startsWith(url));
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

beforeEach(() => {
  IN = DEFAULT_IN;
  resolveAs = (name) => IN.find((x) => x.rec.name === name)?.wire ?? null;
  recStatus = 200;
  afterCombos = () => [];
  factsFail = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/recommendations") {
      if (recStatus !== 200)
        return Promise.resolve({ ok: false, status: recStatus, json: async () => ({}) });
      const recommendations = IN.map((x) => x.rec);
      return ok({
        count: recommendations.length,
        recommendations,
        hidden: [],
        combosTruncated: false,
      });
    }
    if (url === "/api/cards/resolve") {
      const { names } = JSON.parse(init!.body as string) as { names: string[] };
      return ok({
        results: names.map((n) => ({ input: n, match: resolveAs(n), suggestions: [] })),
      });
    }
    if (url.startsWith("/api/combos/complete?")) {
      if (factsFail) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
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
  goals = { v: 1, targetLevel: 3, budget: { perCardUsd: 5 } } as DeckGoals,
  owned = null as ReadonlySet<string> | null,
  phone = false,
  combos = [] as CompleteCombo[] | null,
  factsState = "ready" as "ready" | "failed" | "checking",
} = {}) {
  const { entries, cards } = list();
  const onApply = vi.fn<(apply: TargetFitApply) => void>();
  const onClose = vi.fn();
  render(
    <TargetUpSheet
      adapter={mtg}
      format={COMMANDER}
      entries={entries}
      cards={cards}
      goals={goals}
      combos={combos}
      freshness={FRESH}
      factsState={factsState}
      owned={owned}
      phone={phone}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  const level = goals.targetLevel;
  const sheet = screen.getByRole("dialog", { name: `Upgrade toward Bracket ${level}` });
  return { sheet, entries, cards, onApply, onClose };
}

const upState = () =>
  document.querySelector("[data-slot=target-up-sheet]")?.getAttribute("data-up-state");
const after = () => document.querySelector<HTMLElement>("[data-slot=target-up-after]");
const row = (name: string) =>
  document.querySelector<HTMLElement>(
    `[data-up-row="${DEFAULT_IN.find((x) => x.rec.name === name)!.wire.id}"]`,
  )!;
const chooser = (name: string) =>
  screen.getByRole("combobox", { name: `Card to cut for ${name}` }) as HTMLSelectElement;
const selected = (name: string) => {
  const select = chooser(name);
  return select.options[select.selectedIndex]?.textContent;
};
const box = (name: string) => screen.getByRole("checkbox", { name: `Swap in ${name}` });
async function ready() {
  await waitFor(() => expect(upState()).toBe("ready"));
}
async function verdict(kind: "reached" | "below" | "above" | "failed") {
  await waitFor(() => expect(after()?.dataset.after).toBe(kind), { timeout: 3000 });
  return after()!;
}

describe("TargetUpSheet — the asks", () => {
  it("ONE Suggestions POST with the live list, the goals and the deck's budget; ONE resolve for its names; nothing written", async () => {
    const { entries } = renderSheet();
    await ready();
    expect(calls("/api/recommendations")).toHaveLength(1);
    expect(bodyOf(calls("/api/recommendations")[0])).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [kiki.id],
      entries: entries.slice(1).map((e) => ({ cardId: e.cardId, qty: e.qty })),
      budget: 5,
      goals: { v: 1, targetLevel: 3, budget: { perCardUsd: 5 } },
    });
    expect(calls("/api/cards/resolve")).toHaveLength(1);
    expect(bodyOf(calls("/api/cards/resolve")[0])).toEqual({
      game: "mtg",
      format: "commander",
      names: DEFAULT_IN.map((x) => x.rec.name),
    });
    // Only reads: the two asks and the after-check's facts GET.
    const methods = fetchMock.mock.calls.map(([u, init]) => [
      String(u).split("?")[0],
      (init as RequestInit | undefined)?.method ?? "GET",
    ]);
    expect(methods.filter(([u]) => u !== "/api/combos/complete")).toEqual([
      ["/api/recommendations", "POST"],
      ["/api/cards/resolve", "POST"],
    ]);
  });

  it("the id guard: a name that resolves to another card drops its row, and the sheet says so", async () => {
    const stranger = incoming("Plain Three", 3).wire;
    resolveAs = (name) =>
      name === "Plain Three" ? stranger : (IN.find((x) => x.rec.name === name)?.wire ?? null);
    renderSheet();
    await ready();
    expect(document.querySelector(`[data-up-row="${plain.wire.id}"]`)).toBeNull();
    expect(document.querySelectorAll("[data-up-row]")).toHaveLength(5);
    expect(document.querySelector("[data-slot=target-up-dropped]")?.textContent).toBe(
      "1 suggestion couldn't load, so it's left out.",
    );
  });

  it("a 429 says so, with Try again; Try again asks again", async () => {
    recStatus = 429;
    const { sheet } = renderSheet();
    await waitFor(() =>
      expect(sheet.textContent).toContain(
        "Suggestions are rate-limited for a moment. Try again shortly.",
      ),
    );
    expect(calls("/api/cards/resolve")).toHaveLength(0);
    expect(within(sheet).getByRole("button", { name: "Swap 0 cards" })).toHaveProperty(
      "disabled",
      true,
    );
    recStatus = 200;
    fireEvent.click(within(sheet).getByRole("button", { name: "Try again" }));
    await ready();
    expect(calls("/api/recommendations")).toHaveLength(2);
  });

  it("StrictMode's twin: the aborted ask writes nothing and goes no further; one answer fills the rows", async () => {
    const { entries, cards } = list();
    render(
      <StrictMode>
        <TargetUpSheet
          adapter={mtg}
          format={COMMANDER}
          entries={entries}
          cards={cards}
          goals={{ v: 1, targetLevel: 3 }}
          combos={[]}
          freshness={FRESH}
          factsState="ready"
          owned={null}
          phone={false}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      </StrictMode>,
    );
    await ready();
    expect(calls("/api/recommendations")).toHaveLength(2);
    expect(calls("/api/cards/resolve")).toHaveLength(1);
    expect(document.querySelectorAll("[data-up-row]")).toHaveLength(DEFAULT_IN.length);
  });

  it("nothing came back: says so, asks nothing more, and only closes", async () => {
    IN = [];
    const { sheet, onClose } = renderSheet();
    await waitFor(() => expect(upState()).toBe("none"));
    expect(sheet.textContent).toContain("No suggestions fit your goals right now.");
    expect(calls("/api/cards/resolve")).toHaveLength(0);
    expect(within(sheet).queryByRole("button", { name: /^Swap \d+ cards?$/ })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TargetUpSheet — the review", () => {
  it("rows in Suggestions' order: the price, the first evidence line and its source, the weakest card at its cost", async () => {
    renderSheet();
    await ready();
    const rows = [...document.querySelectorAll<HTMLElement>("[data-up-row]")];
    expect(rows.map((r) => r.dataset.upRow)).toEqual(DEFAULT_IN.map((x) => x.wire.id));
    const first = row("Changer One");
    expect(first.textContent).toContain("$1.00");
    expect(first.textContent).toContain("A Commander staple in EDHREC decklists (Changer One)");
    expect(first.textContent).toContain("EDHREC");
    // The plan cuts only from the deck's weaker half by the Cut Coach, its cost first. Here the
    // Coach reads the 6-drops as the crowded slot and the 2-drops as wanted, so no 2-drop is in
    // that half: the 2-drop rows take the weakest 6-drops, the 3-drop the weakest 3-drop.
    expect(selected("Changer One")).toBe("Fringe 60");
    expect(selected("Changer Two")).toBe("Fringe 54");
    expect(selected("Plain Three")).toBe("Fringe 63");
    expect(row("Changer One").querySelector("[data-up-elsewhere]")?.textContent).toBe(
      "No suggested cut at mana value 2, so the weakest card at another cost goes.",
    );
    // The chooser: its cost first, then the rest; a card another row takes says for which.
    const groups = [...chooser("Changer One").querySelectorAll("optgroup")].map((g) => g.label);
    expect(groups).toEqual(["At mana value 2", "Other cards"]);
    const taken = [...chooser("Changer One").options].find(
      (o) => o.value === byName("Fringe 54").id,
    )!;
    expect(taken.textContent).toBe("Fringe 54 (out for Changer Two)");
    expect(taken.disabled).toBe(false);
    // Never a land for a spell.
    expect([...chooser("Changer One").options].map((o) => o.textContent)).not.toContain("Forest 1");
  });

  it("the goals row by row: the fourth Game Changer starts unchecked, saying why; the rest start checked", async () => {
    const { sheet } = renderSheet();
    await ready();
    expect(box("Changer One").getAttribute("aria-checked")).toBe("true");
    expect(box("Changer Three").getAttribute("aria-checked")).toBe("true");
    expect(box("Changer Four").getAttribute("aria-checked")).toBe("false");
    expect(row("Changer Four").querySelector("[data-up-above]")?.textContent).toBe(
      "A fourth Game Changer (Wizards' list). Your Bracket 3 target allows up to three",
    );
    expect(within(sheet).getByRole("button", { name: "Swap 4 cards" })).toBeTruthy();
    // Unchecking one above lets it in.
    fireEvent.click(box("Changer One"));
    expect(box("Changer Four").getAttribute("aria-checked")).toBe("true");
    expect(row("Changer Four").querySelector("[data-up-above]")).toBeNull();
    expect(within(sheet).getByRole("button", { name: "Swap 4 cards" })).toBeTruthy();
  });

  it("uncheck, and another card to cut: the row that held it takes the next", async () => {
    const { sheet } = renderSheet();
    await ready();
    fireEvent.click(box("Plain Three"));
    expect(box("Plain Three").getAttribute("aria-checked")).toBe("false");
    expect(within(sheet).getByRole("button", { name: "Swap 3 cards" })).toBeTruthy();
    // Changer One takes the card Changer Two held; Changer Two moves to the weakest one left.
    fireEvent.change(chooser("Changer One"), { target: { value: byName("Fringe 54").id } });
    expect(selected("Changer One")).toBe("Fringe 54");
    expect(selected("Changer Two")).toBe("Fringe 60");
    // The player's choice can't be taken by another row.
    const held = [...chooser("Changer Two").options].find(
      (o) => o.value === byName("Fringe 54").id,
    )!;
    expect(held.disabled).toBe(true);
    // The player may still choose a card outside the weaker half (a 2-drop): their call.
    fireEvent.change(chooser("Changer Three"), { target: { value: byName("Fringe 62").id } });
    expect(selected("Changer Three")).toBe("Fringe 62");
  });

  it("an unpaired land: unchecked, the adapter's reason; choosing a land to cut checks it", async () => {
    const { sheet } = renderSheet();
    await ready();
    const land = row("Gilded Grove");
    expect(box("Gilded Grove").getAttribute("aria-checked")).toBe("false");
    expect(box("Gilded Grove")).toHaveProperty("disabled", true);
    expect(land.querySelector("[data-up-unpaired]")?.textContent).toBe(
      "A land gets no suggested partner. Which land to cut depends on its colors. Choose the card to cut.",
    );
    expect(selected("Gilded Grove")).toBe("Choose a card to cut");
    fireEvent.change(chooser("Gilded Grove"), { target: { value: byName("Forest 1").id } });
    expect(box("Gilded Grove").getAttribute("aria-checked")).toBe("true");
    expect(selected("Gilded Grove")).toBe("Forest 1");
    expect(within(sheet).getByRole("button", { name: "Swap 5 cards" })).toBeTruthy();
  });

  it("without the list's combo facts nothing is protected, and the sheet says so (Swap in's rule)", async () => {
    renderSheet({ combos: null, factsState: "failed" });
    await ready();
    expect(document.body.textContent).toContain(
      "Couldn't check combos. Combo pieces aren't kept out of these swaps.",
    );
    cleanup();
    renderSheet();
    await ready();
    expect(document.body.textContent).not.toContain("Couldn't check combos.");
  });

  it("the price of the cards coming in, the ones the player owns left out", async () => {
    renderSheet({ owned: new Set([one.wire.id]) });
    await ready();
    // Changer One, Plain Three, Changer Two and Changer Three: $5.50, less the $1.00 owned.
    expect(document.querySelector("[data-slot=target-up-cost]")?.textContent).toBe(
      "The cards coming in cost $4.50, not counting the 1 you own.",
    );
  });
});

describe("TargetUpSheet — the after-check", () => {
  it("the target reached: the level's words, That's your target., and the read's sentence for it", async () => {
    const { sheet } = renderSheet();
    const line = await verdict("reached");
    expect(line.querySelector("p")?.textContent).toBe(
      "After these swaps, the cards show at least Bracket 3 (Upgraded). That's your target.",
    );
    expect(line.querySelector('[data-after-finding="game-changers"]')?.textContent).toContain(
      "3 Game Changers: Changer One, Changer Three and Changer Two.",
    );
    expect(sheet.querySelector("[data-slot=target-up-status]")?.textContent).toBe(
      "After these swaps, the cards show at least Bracket 3 (Upgraded). That's your target.",
    );
    // ONE facts GET, for the list after the swaps.
    expect(calls("/api/combos/complete?")).toHaveLength(1);
    const ids = new URL(String(calls("/api/combos/complete?")[0][0]), "http://local").searchParams
      .get("ids")!
      .split(",");
    expect(ids).toContain(one.wire.id);
    expect(ids).not.toContain(byName("Fringe 60").id);
  });

  it("short of the target: what the cards show, never the target, and How it plays for the rest", async () => {
    IN = [one, plain];
    renderSheet({ goals: { v: 1, targetLevel: 4 } });
    const line = await verdict("below");
    expect(line.textContent).toContain(
      "After these swaps, the cards show at least Bracket 3 (Upgraded).",
    );
    expect(line.textContent).not.toContain("That's your target.");
    expect(line.textContent).toContain(
      "Cards can only show a floor. If the deck plays at Bracket 4 (Optimized), say so under How it plays.",
    );
  });

  it("nothing raised: says so in the read's words", async () => {
    IN = [plain];
    renderSheet({ goals: { v: 1, targetLevel: 4 } });
    const line = await verdict("below");
    expect(line.querySelector("p")?.textContent).toBe(
      "After these swaps, nothing in the list raises the bracket.",
    );
  });

  it("at Bracket 5 the cards never reach it: the floor, and How it plays", async () => {
    IN = [one, two, three, four];
    renderSheet({ goals: { v: 1, targetLevel: 5 } });
    const line = await verdict("below");
    expect(line.querySelector("p")?.textContent).toBe(
      "After these swaps, the cards show at least Bracket 4 (Optimized).",
    );
    expect(line.textContent).toContain(
      "Cards can only show a floor. If the deck plays at Bracket 5 (cEDH), say so under How it plays.",
    );
  });

  it("two cards coming in complete a combo above the target: named in the read's sentence", async () => {
    afterCombos = (ids) =>
      ids.includes(one.wire.id) && ids.includes(plain.wire.id)
        ? [
            {
              key: "pair",
              cardPieces: [one.wire.id, plain.wire.id].sort(),
              templates: [],
              tag: "R",
              relevant: true,
              results: ["Infinite turns"],
              popularity: 50,
            },
          ]
        : [];
    const { sheet } = renderSheet();
    const line = await verdict("above");
    expect(line.querySelector("p")?.textContent).toBe(
      "After these swaps, these put the deck above Bracket 3:",
    );
    expect(
      [...line.querySelectorAll<HTMLElement>("[data-after-conflict]")].map(
        (r) => r.dataset.afterConflict,
      ),
    ).toEqual(["combo:pair"]);
    expect(sheet.querySelector("[data-slot=target-up-status]")?.textContent).toBe(
      "After these swaps, 1 thing puts the deck above Bracket 3.",
    );
    // Unchecking one of them takes it back to the target.
    fireEvent.click(box("Plain Three"));
    await verdict("reached");
  });

  it("a facts failure is said plainly, with Retry", async () => {
    factsFail = true;
    const { sheet } = renderSheet();
    const line = await verdict("failed");
    expect(line.textContent).toBe("Couldn't check combos for the list after these swaps. Retry");
    expect(within(sheet).getByRole("button", { name: "Swap 4 cards" })).toHaveProperty(
      "disabled",
      false,
    );
    factsFail = false;
    fireEvent.click(within(line).getByRole("button", { name: "Retry" }));
    await verdict("reached");
  });
});

describe("TargetUpSheet — Swap", () => {
  it("hands the editor ONE next list: each card in where its partner was, every other row untouched, the size kept", async () => {
    const { sheet, entries, onApply } = renderSheet();
    await verdict("reached");
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap 4 cards" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const apply = onApply.mock.calls[0][0];
    expect(apply.swapped).toBe(4);
    expect(apply.cards.map((w) => w.id)).toEqual([one, plain, two, three].map((x) => x.wire.id));
    const swaps = new Map([
      [byName("Fringe 60").id, one.wire.id],
      [byName("Fringe 63").id, plain.wire.id],
      [byName("Fringe 54").id, two.wire.id],
      [byName("Fringe 48").id, three.wire.id],
    ]);
    expect(apply.entries).toHaveLength(entries.length);
    apply.entries.forEach((e, i) => {
      const inId = swaps.get(entries[i].cardId);
      if (inId) expect(e).toEqual({ cardId: inId, zone: "main", qty: 1, tags: [] });
      else expect(e).toBe(entries[i]);
    });
  });

  it("on a phone: the bottom Drawer", async () => {
    renderSheet({ phone: true });
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeTruthy();
    await ready();
  });
});

describe("copy guard (WAVE4 D0) — everything the sheet renders", () => {
  it("rows, choosers, reasons, the after-line and the price: no 'approve', no Spellbook tag name, no notation", async () => {
    renderSheet({ owned: new Set([one.wire.id]) });
    await verdict("reached");
    const text = document.body.textContent ?? "";
    expect(text).toContain("Replaces");
    expect(text).not.toMatch(/approv/i);
    expect(text).not.toMatch(/ruthless|spicy|powerful|oddball|precon appropriate|casual/i);
    expect(text).not.toMatch(/\d\+|est\.|[–—]/);
  });
});
