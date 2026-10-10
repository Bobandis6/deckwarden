/**
 * The Suggestions panel's fetch policy (P3.2), with Y2b's draft branch
 * (WAVE4 D2): a draft — no deck row — asks POST /api/recommendations with
 * its snapshot, under the same gate as a saved deck's GET (the tab open, a
 * leader in the zone, autosave at rest) and the same key, so an unchanged
 * draft never asks twice; once a row exists the GET takes over and the
 * snapshot route is never called again. The panel itself never creates a
 * deck — that is the editor's (deck-editor.test.tsx pins its zero-POST
 * seeds).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { card } from "@/lib/games/mtg/test-fixtures";
import { mtgAdapter } from "@/lib/games/mtg/adapter";
import type { Recommendation } from "@/lib/recommend/types";

import { RecommendationsPanel } from "./recommendations-panel";

const format = mtgAdapter.formats[0];
const leader = card({ name: "Tymna the Weaver", isLeaderCandidate: true, ciMask: 1 | 4 });
const sol = card({ name: "Sol Ring", primaryType: "Artifact", costValue: 1 });

const rec: Recommendation = {
  cardId: "55555555-5555-4555-8555-555555555555",
  name: "Arcane Signet",
  primaryType: "Artifact",
  costValue: 2,
  ciMask: 0,
  cheapestUsd: "0.40",
  popularity: 2,
  score: 0.9,
  confidence: "high",
  evidence: [
    {
      source: "edhrec_rank",
      why: "A Commander staple in EDHREC decklists",
      with: [],
      howOften: "EDHREC rank #2",
      confidence: "high",
    },
  ],
};

const fetchMock = vi.fn();
const snapshotCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/recommendations");
const deckGets = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/decks/"));

type Props = Parameters<typeof RecommendationsPanel>[0];
const baseEntries: Props["entries"] = [
  { cardId: leader.id, zone: "commander", qty: 1 },
  { cardId: sol.id, zone: "main", qty: 1 },
];

function props(over: Partial<Props> = {}): Props {
  return {
    adapter: mtgAdapter,
    format,
    deckId: null,
    entries: baseEntries,
    inDeckQty: new Map(),
    saveStatus: "saved",
    active: true,
    onAdd: () => undefined,
    ...over,
  };
}

/** Let the effect's fetch and its JSON settle. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ count: 1, recommendations: [rec] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RecommendationsPanel — a draft (Y2b)", () => {
  it("asks POST /api/recommendations with the snapshot — the leader apart, copies kept, no budget — and renders the evidence; never a deck GET", async () => {
    render(<RecommendationsPanel {...props()} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);
    const [, init] = snapshotCalls()[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [leader.id],
      entries: [{ cardId: sol.id, qty: 1 }],
    });
    expect(deckGets()).toHaveLength(0);
    expect(await screen.findByText("Arcane Signet")).toBeTruthy();
    expect(screen.getByText("A Commander staple in EDHREC decklists")).toBeTruthy();
  });

  it("only while its tab is open: closed asks nothing; opening asks once; closing and reopening an unchanged draft never asks again", async () => {
    const view = render(<RecommendationsPanel {...props({ active: false })} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    view.rerender(<RecommendationsPanel {...props({ active: true })} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);

    view.rerender(<RecommendationsPanel {...props({ active: false })} />);
    view.rerender(<RecommendationsPanel {...props({ active: true })} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);
  });

  it("the same snapshot in a new array (a tag or printing edit) never asks again; a budget pick does, in USD", async () => {
    const view = render(<RecommendationsPanel {...props()} />);
    await flush();
    const tagged = baseEntries.map((e) => ({ ...e, tags: ["ramp"] }));
    view.rerender(<RecommendationsPanel {...props({ entries: tagged })} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    await flush();
    expect(snapshotCalls()).toHaveLength(2);
    const [, init] = snapshotCalls()[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string).budget).toBe(5);
  });

  it("no leader, nothing asked — the panel says what it needs", async () => {
    render(<RecommendationsPanel {...props({ entries: [baseEntries[1]] })} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Add a Commander to get suggestions/)).toBeTruthy();
  });

  it("a pending first edit waits: nothing is asked until autosave is at rest", async () => {
    const view = render(<RecommendationsPanel {...props({ saveStatus: "dirty" })} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Suggestions appear once the deck saves.")).toBeTruthy();
    view.rerender(<RecommendationsPanel {...props({ saveStatus: "saving" })} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("once the row exists the GET takes over: minting the same snapshot asks nothing; the next settled edit GETs the deck, never the snapshot route", async () => {
    const view = render(<RecommendationsPanel {...props()} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);

    // The first edit mints the row: dirty → saving → saved with a deck id.
    view.rerender(<RecommendationsPanel {...props({ saveStatus: "dirty" })} />);
    view.rerender(<RecommendationsPanel {...props({ deckId: "deck-1", saveStatus: "saving" })} />);
    view.rerender(<RecommendationsPanel {...props({ deckId: "deck-1" })} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const grown = [...baseEntries, { cardId: rec.cardId, zone: "main", qty: 1 }];
    view.rerender(<RecommendationsPanel {...props({ deckId: "deck-1", entries: grown })} />);
    await flush();
    expect(snapshotCalls()).toHaveLength(1);
    expect(deckGets().map(([url]) => String(url))).toEqual(["/api/decks/deck-1/recommendations"]);
  });

  it("a 429 says so in words, with a retry", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    render(<RecommendationsPanel {...props()} />);
    await flush();
    expect(
      screen.getByText("Suggestions are rate-limited for a moment — try again shortly."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

// --- A saved deck (P3.2): what Y6a must keep while it grows the panel --------------

const combo: Recommendation = {
  cardId: "66666666-6666-4666-8666-666666666666",
  name: "Rings of Brighthearth",
  primaryType: "Artifact",
  costValue: 3,
  ciMask: 0,
  cheapestUsd: null,
  popularity: 900,
  score: 0.6,
  confidence: "high",
  evidence: [
    {
      source: "curve-template",
      why: "Fills a gap at mana value 3",
      with: [],
      howOften: null,
      confidence: "low",
    },
    {
      source: "spellbook",
      why: "Completes a combo with Basalt Monolith: infinite colorless mana",
      with: [{ cardId: sol.id, name: "Basalt Monolith" }],
      howOften: "In 4,210 EDHREC decks",
      confidence: "high",
    },
  ],
};

/** A resolve answer whose match is the shown card (the hook's id guard passes). */
const resolveWire = (r: Recommendation, id = r.cardId) => ({
  results: [
    {
      input: r.name,
      match: { ...card({ name: r.name, primaryType: r.primaryType }), id, image: null },
    },
  ],
});

describe("RecommendationsPanel — a saved deck (P3.2)", () => {
  const saved = (over: Partial<Props> = {}) => props({ deckId: "deck-1", ...over });

  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url) === "/api/cards/resolve") {
        return { ok: true, status: 200, json: async () => resolveWire(rec) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          deckId: "deck-1",
          count: 2,
          owned: { requested: false, applied: false },
          recommendations: [rec, combo],
        }),
      };
    });
  });

  it("GETs the deck once per settled key: a tag edit never asks again; the budget and Refresh do — the budget in USD; never the snapshot route", async () => {
    const view = render(<RecommendationsPanel {...saved()} />);
    await flush();
    expect(deckGets().map(([url]) => String(url))).toEqual(["/api/decks/deck-1/recommendations"]);

    const tagged = baseEntries.map((e) => ({ ...e, tags: ["ramp"] }));
    view.rerender(<RecommendationsPanel {...saved({ entries: tagged })} />);
    await flush();
    expect(deckGets()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "≤ $1 a card" }));
    await flush();
    expect(String(deckGets()[1][0])).toBe("/api/decks/deck-1/recommendations?budget=1");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await flush();
    expect(deckGets()).toHaveLength(3);
    expect(snapshotCalls()).toHaveLength(0);
  });

  it("each row leads with its strongest evidence, names its sources and price; expanding shows every entry — the partners linked, how often, each confidence as reported", async () => {
    render(<RecommendationsPanel {...saved()} />);
    await flush();
    // The collapsed row: the high-confidence combo line leads, not the low curve one.
    expect(
      screen.getAllByText("Completes a combo with Basalt Monolith: infinite colorless mana"),
    ).toHaveLength(1);
    // Source names follow the same order (strongest first).
    expect(screen.getByText("Commander Spellbook · Curve template")).toBeTruthy();
    expect(screen.getByText("EDHREC · $0.40")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand evidence for Rings of Brighthearth" }),
    );
    expect(screen.getByText("Fills a gap at mana value 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Basalt Monolith" }).getAttribute("href")).toBe(
      `/cards/${sol.id}`,
    );
    expect(screen.getByText("In 4,210 EDHREC decks")).toBeTruthy();
    expect(screen.getAllByText("low").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Collapse evidence for Rings of Brighthearth" }),
    ).toBeTruthy();
  });

  it("Add resolves the shown card (the id guard) and hands it to the editor's add — once; a card already in the deck reads In deck", async () => {
    const onAdd = vi.fn<Props["onAdd"]>(() => undefined);
    const view = render(<RecommendationsPanel {...saved({ onAdd })} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Add Arcane Signet to the deck" }));
    await flush();
    const resolves = fetchMock.mock.calls.filter(([url]) => url === "/api/cards/resolve");
    expect(resolves).toHaveLength(1);
    expect(JSON.parse((resolves[0][1] as RequestInit).body as string)).toEqual({
      game: "mtg",
      format: "commander",
      names: ["Arcane Signet"],
    });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({ id: rec.cardId, name: "Arcane Signet" });

    view.rerender(
      <RecommendationsPanel {...saved({ onAdd, inDeckQty: new Map([[rec.cardId, 1]]) })} />,
    );
    expect(screen.getByText("In deck ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Arcane Signet to the deck" })).toBeNull();
  });

  it("a resolve that answers a different card adds nothing and says so", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url) === "/api/cards/resolve"
        ? { ok: true, status: 200, json: async () => resolveWire(rec, combo.cardId) }
        : { ok: true, status: 200, json: async () => ({ recommendations: [rec] }) },
    );
    const onAdd = vi.fn<Props["onAdd"]>(() => undefined);
    render(<RecommendationsPanel {...saved({ onAdd })} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Add Arcane Signet to the deck" }));
    await flush();
    expect(onAdd).not.toHaveBeenCalled();
    expect(
      screen.getByText("Couldn't load Arcane Signet — try adding it from search."),
    ).toBeTruthy();
  });

  it("empty answers say why: nothing at All; nothing at a budget names the price and the way out", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ recommendations: [] }),
    }));
    render(<RecommendationsPanel {...saved()} />);
    await flush();
    expect(screen.getByText("No suggestions right now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    await flush();
    expect(
      screen.getByText("No suggestions with a known price of $5 or less — try a wider budget."),
    ).toBeTruthy();
  });

  it("“Only cards I own” is disabled without a collection, with the honest hint; with one it asks ?owned=1", async () => {
    const view = render(<RecommendationsPanel {...saved()} />);
    await flush();
    const toggle = screen.getByTestId("only-owned-toggle") as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.getByRole("link", { name: "import a collection" })).toBeTruthy();

    view.rerender(<RecommendationsPanel {...saved({ ownedAvailable: true })} />);
    fireEvent.click(screen.getByTestId("only-owned-toggle"));
    await flush();
    expect(String(deckGets().at(-1)![0])).toBe("/api/decks/deck-1/recommendations?owned=1");
  });
});

// --- Goals (Y6a, WAVE4 D7) -------------------------------------------------------------------

const hiddenRec = (name: string, why: string): Recommendation & { conflicts: unknown[] } => ({
  ...rec,
  cardId: `9${rec.cardId.slice(1, -2)}${String(name.length).padStart(2, "0")}`,
  name,
  conflicts: [
    {
      rule: "game-changers",
      source: "Wizards' Game Changers list (via Scryfall)",
      why,
      severity: "hide",
    },
  ],
});

describe("RecommendationsPanel — goals (Y6a)", () => {
  const goals2 = { v: 1 as const, targetLevel: 2, budget: { perCardUsd: 5 } };
  let answer: Record<string, unknown>;
  const saved = (over: Partial<Props> = {}) => props({ deckId: "deck-1", ...over });

  beforeEach(() => {
    answer = { recommendations: [rec], hidden: [], combosTruncated: false };
    fetchMock.mockImplementation(async (url: string) =>
      String(url) === "/api/cards/resolve"
        ? { ok: true, status: 200, json: async () => resolveWire(rec) }
        : { ok: true, status: 200, json: async () => answer },
    );
  });

  it("one goals line on top — the target in its level's words and the budget — whose Change opens Your target", async () => {
    const onChangeGoals = vi.fn();
    render(<RecommendationsPanel {...saved({ goals: goals2, onChangeGoals })} />);
    await flush();
    const line = document.querySelector('[data-slot="goals-line"]')!;
    expect(line.textContent).toBe("Your goals: Bracket 2 (Core) · ≤ $5 a card · Change");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onChangeGoals).toHaveBeenCalledTimes(1);
  });

  it("with no goals it is the door to a target (LATER row 175): No bracket target yet · Set one", async () => {
    const onChangeGoals = vi.fn();
    const view = render(<RecommendationsPanel {...saved({ onChangeGoals })} />);
    await flush();
    expect(document.querySelector('[data-slot="goals-line"]')!.textContent).toBe(
      "No bracket target yet · Set one",
    );
    fireEvent.click(screen.getByRole("button", { name: "Set one" }));
    expect(onChangeGoals).toHaveBeenCalledTimes(1);
    // Without the door the line only reads.
    view.rerender(<RecommendationsPanel {...saved()} />);
    expect(screen.queryByRole("button", { name: "Set one" })).toBeNull();
  });

  it("the budget starts from the deck's own: that tier pressed and asked for — the GET in USD, a draft's POST with its goals", async () => {
    const view = render(<RecommendationsPanel {...saved({ goals: goals2 })} />);
    await flush();
    expect(screen.getByRole("button", { name: "≤ $5 a card" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(String(deckGets()[0][0])).toBe("/api/decks/deck-1/recommendations?budget=5");
    view.unmount();

    render(
      <RecommendationsPanel
        {...props({ goals: { ...goals2, exceptions: "one Game Changer, ask me" } })}
      />,
    );
    await flush();
    const body = JSON.parse((snapshotCalls()[0][1] as RequestInit).body as string);
    expect(body.budget).toBe(5);
    // The goals the check reads — never the exceptions line.
    expect(body.goals).toEqual({ v: 1, targetLevel: 2, budget: { perCardUsd: 5 } });
  });

  it("another tier shows “Save as this deck's budget”, which saves the pick as the goal (a total stays); the deck's own tier hides it", async () => {
    const onGoalsChange = vi.fn();
    const withTotal = { ...goals2, budget: { perCardUsd: 5, totalUsd: 150 } };
    const view = render(<RecommendationsPanel {...saved({ goals: withTotal, onGoalsChange })} />);
    await flush();
    expect(screen.queryByRole("button", { name: "Save as this deck's budget" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "≤ $1 a card" }));
    await flush();
    expect(String(deckGets().at(-1)![0])).toBe("/api/decks/deck-1/recommendations?budget=1");
    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    expect(screen.queryByRole("button", { name: "Save as this deck's budget" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as this deck's budget" }));
    expect(onGoalsChange).toHaveBeenCalledWith({ v: 1, targetLevel: 2, budget: { totalUsd: 150 } });

    // Saved: the control follows the deck's goal again.
    view.rerender(
      <RecommendationsPanel
        {...saved({ goals: { v: 1, targetLevel: 2, budget: { totalUsd: 150 } }, onGoalsChange })}
      />,
    );
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Save as this deck's budget" })).toBeNull();
  });

  it("“N hidden by your goals · Show” — Show lists them with their reasons, Hide folds them; the list keeps its own rows", async () => {
    answer = {
      recommendations: [rec],
      hidden: [
        hiddenRec(
          "Rhystic Study",
          "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
        ),
        hiddenRec(
          "Cyclonic Rift",
          "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
        ),
      ],
      combosTruncated: false,
    };
    render(<RecommendationsPanel {...saved({ goals: goals2 })} />);
    await flush();
    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle.closest("p")!.textContent).toBe("2 hidden by your goals · Show");
    expect(screen.queryByText("Rhystic Study")).toBeNull();

    fireEvent.click(toggle);
    const list = screen.getByRole("list", { name: "Hidden by your goals" });
    expect(list.querySelectorAll('li[data-goals="hidden"]')).toHaveLength(2);
    expect(list.textContent).toContain("Rhystic Study");
    expect(list.textContent).toContain(
      "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
    );
    expect(screen.getByRole("button", { name: "Hide" }).getAttribute("aria-expanded")).toBe("true");
    // A hidden card can still be added — it's the owner's deck.
    expect(screen.getByRole("button", { name: "Add Rhystic Study to the deck" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("list", { name: "Hidden by your goals" })).toBeNull();
    expect(screen.getByText("Arcane Signet")).toBeTruthy();
  });

  it("a row's flags ride beside its evidence, never in it; a combo scan cut at its cap says so", async () => {
    answer = {
      recommendations: [
        {
          ...rec,
          conflicts: [
            {
              rule: "game-changers",
              source: "Wizards' Game Changers list (via Scryfall)",
              why: "Would make this deck at least Bracket 3 — a Game Changer (Wizards' list)",
              severity: "flag",
            },
            {
              rule: "budget",
              source: "Card price",
              why: "Costs $45.00 — over your ≤ $5 a card budget",
              severity: "flag",
            },
          ],
        },
      ],
      hidden: [],
      combosTruncated: true,
    };
    render(<RecommendationsPanel {...saved()} />);
    await flush();
    const row = screen.getByText("Arcane Signet").closest("li")!;
    expect(row.getAttribute("data-goals")).toBe("flagged");
    expect([...row.querySelectorAll("[data-conflict]")].map((p) => p.textContent)).toEqual([
      "Would make this deck at least Bracket 3 — a Game Changer (Wizards' list)",
      "Costs $45.00 — over your ≤ $5 a card budget",
    ]);
    expect(screen.getByText(/Combo checks stopped at the most popular combos/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
  });

  it("the goals are in the key: a new target asks again once it has saved; an exceptions edit never does", async () => {
    const view = render(<RecommendationsPanel {...saved({ goals: goals2 })} />);
    await flush();
    expect(deckGets()).toHaveLength(1);
    view.rerender(
      <RecommendationsPanel {...saved({ goals: { ...goals2, exceptions: "ask me" } })} />,
    );
    await flush();
    expect(deckGets()).toHaveLength(1);

    const goals3 = { ...goals2, targetLevel: 3 };
    view.rerender(<RecommendationsPanel {...saved({ goals: goals3, saveStatus: "saving" })} />);
    await flush();
    expect(deckGets()).toHaveLength(1);
    view.rerender(<RecommendationsPanel {...saved({ goals: goals3 })} />);
    await flush();
    expect(deckGets()).toHaveLength(2);
  });

  it("an add says nothing on the live line (the editor toasts it with Undo); a failure still does", async () => {
    const onAdd = vi.fn<Props["onAdd"]>(() => undefined);
    const view = render(<RecommendationsPanel {...saved({ onAdd })} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Add Arcane Signet to the deck" }));
    await flush();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Added Arcane Signet")).toBeNull();

    view.rerender(<RecommendationsPanel {...saved({ onAdd: () => "Main deck is full" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Arcane Signet to the deck" }));
    await flush();
    expect(screen.getByText("Main deck is full")).toBeTruthy();
  });

  it("every card hidden: the list says nothing else fits the goals", async () => {
    answer = {
      recommendations: [],
      hidden: [
        hiddenRec(
          "Rhystic Study",
          "A Game Changer (Wizards' list) — your Bracket 2 target allows none",
        ),
      ],
      combosTruncated: false,
    };
    render(<RecommendationsPanel {...saved({ goals: goals2 })} />);
    await flush();
    expect(screen.getByText("Nothing else fits your goals right now.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show" })).toBeTruthy();
  });
});
