/**
 * BRACKET-UP in the editor: when the target is above what the cards show,
 * the Why sheet's Below your target box holds "Upgrade toward Bracket 3…",
 * which swaps the Why sheet for the "Upgrade toward" sheet. It asks
 * Suggestions ONCE with the live list (no deck id, the goals in the body)
 * and resolves the names ONCE; opening, asking and reviewing write
 * nothing. Swap is ONE whole-list edit, "Swapped 2 cards" with one Undo
 * that restores the list exactly, and focus comes back to the bracket line
 * ("Why?" once the new list's facts land); Escape hands it back to "Why?";
 * on a draft the apply mints exactly one row carrying the target. No box
 * without a target or at the target, and One Piece has no bracket line.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire } from "@/lib/decks/editor-state";
import { card } from "@/lib/games/mtg/test-fixtures";
import { MD_QUERY, WIDE_QUERY } from "./use-tier";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

import { DeckEditor } from "./deck-editor";

function stubViewport(width: number) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === WIDE_QUERY ? width >= 1200 : query === MD_QUERY ? width >= 768 : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
}

const wire = (over: Parameters<typeof card>[0]): CardWire => ({ ...card(over), image: null });
const kozilek = wire({
  name: "Kozilek, the Great Distortion",
  primaryType: "Creature",
  costValue: 10,
  isLeaderCandidate: true,
  attrs: { type_line: "Legendary Creature — Eldrazi", oracle_text: "" },
});
const spell = (name: string, costValue: number, popularity: number, usd: number) =>
  wire({
    name,
    primaryType: "Artifact",
    costValue,
    popularity,
    cheapestUsd: usd,
    attrs: { type_line: "Artifact", oracle_text: "" },
  });
const fringeRock = spell("Fringe Rock", 2, 40_000, 0.2);
const fringeDraw = spell("Fringe Draw", 3, 41_000, 0.3);
const fringeRamp = spell("Fringe Ramp", 2, 30_000, 0.25);
const wastes = wire({
  name: "Wastes",
  primaryType: "Land",
  costValue: null,
  cheapestUsd: 0.1,
  attrs: { type_line: "Basic Land — Wastes", oracle_text: "" },
});
const signet = spell("Arcane Signet", 2, 3, 0.5);
const study = wire({
  name: "Rhystic Study",
  primaryType: "Enchantment",
  costValue: 3,
  popularity: 9,
  cheapestUsd: 30,
  attrs: { type_line: "Enchantment", oracle_text: "", game_changer: true },
});
const entryOf = (c: CardWire, zone: string, qty = 1, tags: string[] = []) => ({
  cardId: c.id,
  zone,
  qty,
  tags,
  printingId: null,
  card: c,
});
const LIST = [
  entryOf(kozilek, "commander"),
  entryOf(fringeRock, "main", 1, ["ramp"]),
  entryOf(fringeDraw, "main"),
  entryOf(fringeRamp, "main"),
  entryOf(wastes, "main", 96),
];
const ORIGINAL = LIST.map(({ cardId, zone, qty, tags }) => ({ cardId, zone, qty, tags }));
const recOf = (c: CardWire) => ({
  cardId: c.id,
  name: c.name,
  primaryType: c.primaryType,
  costValue: c.costValue,
  ciMask: 0,
  cheapestUsd: c.cheapestUsd!.toFixed(2),
  popularity: c.popularity,
  score: 0.9,
  confidence: "high",
  evidence: [
    {
      source: "edhrec_rank",
      why: "A Commander staple in EDHREC decklists",
      with: [],
      howOften: "EDHREC rank #3",
      confidence: "high",
    },
  ],
  conflicts: [],
});
const INCOMING = [signet, study];

const FRESH_FACTS = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: Object.fromEntries(
    ["gameChangers", "landDenial", "extraTurns", "combos"].map((feed) => [
      feed,
      { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
    ]),
  ),
};

const fetchMock = vi.fn();
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });
let deckGoals: unknown = null;
/** The saved deck's cards (a test may swap in another list). */
let deckCards: typeof LIST = LIST;
function route(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (url === "/api/decks/deck-1" && method === "GET") {
    return ok({
      deck: {
        id: "deck-1",
        publicId: "abcdefgh1234",
        game: "mtg",
        format: "commander",
        name: "Kozilek",
        description: null,
        notes: null,
        visibility: "unlisted",
        isOwner: true,
        forkedFrom: null,
        leaderIds: [kozilek.id],
        goals: deckGoals,
      },
      cards: deckCards,
      owned: [],
      hasCollection: false,
    });
  }
  if (url === "/api/precons/uplab") {
    return ok({
      deck: { name: "Up Lab", game: "mtg", format: "commander", leaderIds: [kozilek.id] },
      cards: LIST,
    });
  }
  if (url === "/api/recommendations" && method === "POST") {
    const recommendations = INCOMING.map(recOf);
    return ok({
      count: recommendations.length,
      recommendations,
      hidden: [],
      combosTruncated: false,
    });
  }
  if (url === "/api/cards/resolve" && method === "POST") {
    const { names } = JSON.parse(init!.body as string) as { names: string[] };
    return ok({
      results: names.map((n) => ({
        input: n,
        match: INCOMING.find((c) => c.name === n) ?? null,
        suggestions: [],
      })),
    });
  }
  if (url === "/api/decks" && method === "POST") {
    return ok({
      deck: { id: "deck-1", publicId: "abcdefgh1234", visibility: "unlisted" },
      claimToken: "token-1",
    });
  }
  if (url === "/api/decks/deck-1/cards" && method === "PUT") return ok({});
  if (url === "/api/decks/deck-1" && method === "PATCH") return ok({});
  if (url.startsWith("/api/decks/deck-1/recommendations")) return ok({ recommendations: [] });
  if (url.startsWith("/api/decks/deck-1/combos")) return ok({ combos: [], inDeck: [] });
  if (url.startsWith("/api/combos/complete?")) return ok({ combos: [], freshness: FRESH_FACTS });
  return ok({});
}

const calls = (pred: (url: string, method: string) => boolean) =>
  fetchMock.mock.calls.filter(([url, init]) =>
    pred(String(url), (init as RequestInit | undefined)?.method ?? "GET"),
  );
const posts = () => calls((u, m) => u === "/api/decks" && m === "POST").length;
const puts = () => calls((_u, m) => m === "PUT").length;
const patches = () => calls((u, m) => u === "/api/decks/deck-1" && m === "PATCH").length;
const recCalls = () => calls((u, m) => u === "/api/recommendations" && m === "POST");
const resolveCalls = () => calls((u, m) => u === "/api/cards/resolve" && m === "POST");
const lastPutEntries = () =>
  (
    JSON.parse(calls((_u, m) => m === "PUT").at(-1)![1].body as string) as {
      cards: { cardId: string; zone: string; qty: number; tags: string[] }[];
    }
  ).cards;

/** Run the debounces and let the mocked fetch settle. */
async function settle(ms = 250) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
/** deck-editor.test.tsx's pollFor: 50 ms of fake time and one real frame a round, 2 s of real time. */
async function pollFor<T>(query: () => T | null): Promise<T> {
  const deadline = performance.now() + 2000;
  for (;;) {
    const found = query();
    if (found) return found;
    if (performance.now() > deadline) throw new Error("pollFor: never appeared within 2 s");
    await settle(50);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  }
}

const line = () => document.querySelector<HTMLElement>("[data-slot=bracket-line]");
const whySheet = () => screen.queryByRole("dialog", { name: "Why this bracket?" });
const upSheet = () => screen.queryByRole("dialog", { name: "Upgrade toward Bracket 3" });
async function openWhy() {
  fireEvent.click(await pollFor(() => screen.queryByRole("button", { name: "Why?" })));
  return pollFor(whySheet);
}
const door = (dialog: HTMLElement) =>
  within(dialog).queryByRole("button", { name: "Upgrade toward Bracket 3…" });
const swapButton = (dialog: HTMLElement, n: number) => {
  const b = within(dialog).queryByRole("button", { name: `Swap ${n} cards` });
  return b && !(b as HTMLButtonElement).disabled ? b : null;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  deckGoals = { v: 1, targetLevel: 3 };
  deckCards = LIST;
  fetchMock.mockReset();
  fetchMock.mockImplementation(route);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.localStorage.clear();
  window.history.replaceState(null, "", "/decks/deck-1/edit");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("DeckEditor — Upgrade toward (BRACKET-UP)", () => {
  it("the door swaps the Why sheet for the upgrade sheet; asking and reviewing write nothing; Swap is ONE edit, one Undo restores the list exactly, focus back on the bracket line", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    const why = await openWhy();
    const below = why.querySelector<HTMLElement>("[data-slot=bracket-below]")!;
    expect(below.textContent).toContain(
      "Your target is Bracket 3 (Upgraded). Nothing in this list raises the bracket.",
    );
    expect(recCalls()).toHaveLength(0);
    fireEvent.click(door(why)!);
    const sheet = await pollFor(upSheet);
    expect(whySheet()).toBeNull();
    const apply = await pollFor(() => swapButton(sheet, 2));
    // ONE Suggestions POST with the live list and the goals, never a deck id; ONE resolve.
    expect(recCalls()).toHaveLength(1);
    const body = JSON.parse(recCalls()[0][1].body as string);
    expect(body).toEqual({
      game: "mtg",
      format: "commander",
      leaderIds: [kozilek.id],
      entries: ORIGINAL.slice(1).map(({ cardId, qty }) => ({ cardId, qty })),
      goals: { v: 1, targetLevel: 3 },
    });
    expect(resolveCalls()).toHaveLength(1);
    expect(JSON.parse(resolveCalls()[0][1].body as string).names).toEqual([
      "Arcane Signet",
      "Rhystic Study",
    ]);
    // The after-check: the list after the swaps, read by the adapter.
    await pollFor(() =>
      sheet.querySelector("[data-slot=target-up-after]")?.getAttribute("data-after") === "reached"
        ? sheet
        : null,
    );
    expect(sheet.querySelector("[data-slot=target-up-after] p")!.textContent).toBe(
      "After these swaps, the cards show at least Bracket 3 (Upgraded). That's your target.",
    );
    expect(sheet.querySelector("[data-slot=target-up-cost]")?.textContent).toBe(
      "The cards coming in cost $30.50.",
    );
    await settle(1500);
    await act(async () => {});
    expect([posts(), puts(), patches()]).toEqual([0, 0, 0]);

    fireEvent.click(apply);
    const toastEl = (await pollFor(() => screen.queryByText("Swapped 2 cards"))).closest(
      '[data-slot="toast"]',
    ) as HTMLElement;
    expect(upSheet()).toBeNull();
    // The new list's facts are on their way, so the line itself holds focus ("Why?" is a Tab away).
    await pollFor(() => (document.activeElement === line() ? line() : null));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(1);
    // Each card in where the weakest card at its cost was; the rest untouched, tags included.
    expect(lastPutEntries()).toEqual([
      ORIGINAL[0],
      { cardId: signet.id, zone: "main", qty: 1, tags: [] },
      { cardId: study.id, zone: "main", qty: 1, tags: [] },
      ORIGINAL[3],
      ORIGINAL[4],
    ]);
    expect([posts(), patches()]).toEqual([0, 0]);

    // One Undo for the batch: the whole list back exactly, the tags included.
    fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(2);
    expect(lastPutEntries()).toEqual(ORIGINAL);
  });

  it("Escape closes the sheet, asks nothing more and writes nothing; focus goes back to Why?", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    fireEvent.click(door(await openWhy())!);
    const sheet = await pollFor(upSheet);
    await pollFor(() => swapButton(sheet, 2));
    fireEvent.keyDown(sheet, { key: "Escape" });
    await pollFor(() => (upSheet() === null ? document.body : null));
    const why = await pollFor(() => screen.queryByRole("button", { name: "Why?" }));
    await pollFor(() => (document.activeElement === why ? why : null));
    await settle(1500);
    await act(async () => {});
    expect([posts(), puts(), patches()]).toEqual([0, 0, 0]);
    expect([recCalls().length, resolveCalls().length]).toEqual([1, 1]);
  });

  it("no box: no target, a target the cards already reach, and One Piece has no bracket line at all", async () => {
    deckGoals = null;
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    let why = await openWhy();
    expect(why.querySelector("[data-slot=bracket-below]")).toBeNull();
    cleanup();
    // A Game Changer already in the list: the cards show Bracket 3, the target's own level.
    deckGoals = { v: 1, targetLevel: 3 };
    deckCards = [LIST[0], entryOf(study, "main"), ...LIST.slice(2)];
    render(<DeckEditor deckId="deck-1" />);
    why = await openWhy();
    expect(why.querySelector("[data-slot=bracket-below]")).toBeNull();
    expect(why.querySelector("[data-slot=bracket-up-door]")).toBeNull();
    cleanup();
    render(<DeckEditor deckId={null} draftGame="optcg" draftFormat="standard" />);
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
    expect(document.querySelector("[data-slot=bracket-up-door]")).toBeNull();
  });

  it("a precon draft: a target, then the door; the apply mints exactly one row carrying the target and the upgraded list", async () => {
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="uplab" />,
    );
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    const why = await openWhy();
    fireEvent.click(
      within(within(why).getByRole("group", { name: "Your target" })).getByRole("button", {
        name: "3",
      }),
    );
    fireEvent.click(await pollFor(() => door(why)));
    const sheet = await pollFor(upSheet);
    fireEvent.click(await pollFor(() => swapButton(sheet, 2)));
    await pollFor(() => screen.queryByText("Swapped 2 cards"));
    await settle(1500);
    await act(async () => {});
    await settle(1500);
    await act(async () => {});
    expect(posts()).toBe(1);
    const create = JSON.parse(
      calls((u, m) => u === "/api/decks" && m === "POST")[0][1].body as string,
    );
    expect(create.goals).toEqual({ v: 1, targetLevel: 3 });
    expect(lastPutEntries().map((e) => e.cardId)).toEqual([
      kozilek.id,
      signet.id,
      study.id,
      fringeRamp.id,
      wastes.id,
    ]);
  });
});
