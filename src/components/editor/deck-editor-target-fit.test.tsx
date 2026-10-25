/**
 * BRACKET-FIT in the editor: the Why sheet's conflict callout's "Swap to
 * fit Bracket 2…" swaps the Why sheet for the "Swap to fit" sheet, which
 * asks Swap Lab for the cards the plan takes out (opening, asking and
 * reviewing write nothing); Swap is ONE whole-list edit — "Swapped 2 cards"
 * with one Undo that restores the list exactly — and focus comes back to
 * the bracket line ("Why?" once the new list's facts land); Escape hands it
 * back to "Why?"; on a draft the apply mints exactly one row.
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
const vault = wire({
  name: "Mana Vault",
  primaryType: "Artifact",
  costValue: 1,
  cheapestUsd: 40,
  attrs: {
    type_line: "Artifact",
    oracle_text: "",
    game_changer: true,
    roles: ["mana-rock", "ramp"] as never,
  },
});
const rhystic = wire({
  name: "Rhystic Study",
  primaryType: "Enchantment",
  costValue: 3,
  cheapestUsd: 30,
  attrs: {
    type_line: "Enchantment",
    oracle_text: "",
    game_changer: true,
    roles: ["card-draw"] as never,
  },
});
const wastes = wire({
  name: "Wastes",
  primaryType: "Land",
  costValue: null,
  cheapestUsd: 0.1,
  attrs: { type_line: "Basic Land — Wastes", oracle_text: "" },
});
const mindStone = wire({
  name: "Mind Stone",
  primaryType: "Artifact",
  costValue: 2,
  cheapestUsd: 0.5,
  attrs: { type_line: "Artifact", oracle_text: "", roles: ["mana-rock", "ramp"] as never },
});
const arena = wire({
  name: "Phyrexian Arena",
  primaryType: "Enchantment",
  costValue: 3,
  cheapestUsd: 2,
  attrs: { type_line: "Enchantment", oracle_text: "", roles: ["card-draw"] as never },
});
const LIST = [
  { cardId: kozilek.id, zone: "commander", qty: 1, tags: [], printingId: null, card: kozilek },
  { cardId: vault.id, zone: "main", qty: 1, tags: ["ramp"], printingId: null, card: vault },
  { cardId: rhystic.id, zone: "main", qty: 1, tags: [], printingId: null, card: rhystic },
  { cardId: wastes.id, zone: "main", qty: 97, tags: [], printingId: null, card: wastes },
];
const ORIGINAL = LIST.map(({ cardId, zone, qty, tags }) => ({ cardId, zone, qty, tags }));
const ALTS = new Map([
  [vault.id, [mindStone]],
  [rhystic.id, [arena]],
]);
const altRow = (c: CardWire) => ({
  cardId: c.id,
  name: c.name,
  costValue: c.costValue,
  cheapestUsd: c.cheapestUsd!.toFixed(2),
  evidence: [],
  conflicts: [],
  shared: (c.attrs as { roles: string[] }).roles,
  card: { ...c, legality: [] },
});

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
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
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
  if (url === "/api/precons/fitlab") {
    return ok({
      deck: { name: "Fit Lab", game: "mtg", format: "commander", leaderIds: [kozilek.id] },
      cards: LIST,
    });
  }
  if (url === "/api/alternatives" && method === "POST") {
    const { cardId } = JSON.parse(init!.body as string);
    return ok({
      cardId,
      roles: [],
      alternatives: (ALTS.get(cardId) ?? []).map(altRow),
      hidden: [],
      combosTruncated: false,
      tradeoff: null,
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
const altCalls = () => calls((u, m) => u === "/api/alternatives" && m === "POST");
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
const fitSheet = () => screen.queryByRole("dialog", { name: "Swap to fit Bracket 2" });
async function openWhy() {
  fireEvent.click(await pollFor(() => screen.queryByRole("button", { name: "Why?" })));
  return pollFor(whySheet);
}
const door = (dialog: HTMLElement) =>
  within(dialog).queryByRole("button", { name: "Swap to fit Bracket 2…" });
const swapButton = (dialog: HTMLElement, n: number) => {
  const b = within(dialog).queryByRole("button", { name: `Swap ${n} cards` });
  return b && !(b as HTMLButtonElement).disabled ? b : null;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  deckGoals = { v: 1, targetLevel: 2 };
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

describe("DeckEditor — Swap to fit (BRACKET-FIT)", () => {
  it("the door swaps the Why sheet for the fit sheet; asking and reviewing write nothing; Swap is ONE edit, one Undo restores the list exactly, focus back on the bracket line", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    const why = await openWhy();
    expect(altCalls()).toHaveLength(0);
    fireEvent.click(door(why)!);
    const sheet = await pollFor(fitSheet);
    expect(whySheet()).toBeNull();
    const apply = await pollFor(() => swapButton(sheet, 2));
    // The plan's two cards, asked under the goals.
    expect(
      altCalls().map(([, init]) => JSON.parse((init as RequestInit).body as string).cardId),
    ).toEqual([vault.id, rhystic.id]);
    expect(JSON.parse(altCalls()[0][1].body as string)).toMatchObject({
      goals: { targetLevel: 2 },
    });
    // The after-check: the list after the swaps, read by the adapter.
    await pollFor(() =>
      sheet.querySelector("[data-slot=target-fit-after]")?.getAttribute("data-after") === "fits"
        ? sheet
        : null,
    );
    expect(sheet.querySelector("[data-slot=target-fit-after]")!.textContent).toBe(
      "After these swaps, nothing in the list puts the deck above Bracket 2.",
    );
    await settle(1500);
    await act(async () => {});
    expect([posts(), puts(), patches()]).toEqual([0, 0, 0]);

    fireEvent.click(apply);
    const toastEl = (await pollFor(() => screen.queryByText("Swapped 2 cards"))).closest(
      '[data-slot="toast"]',
    ) as HTMLElement;
    expect(fitSheet()).toBeNull();
    // The new list's facts are on their way, so the line itself holds focus ("Why?" is a Tab away).
    await pollFor(() => (document.activeElement === line() ? line() : null));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(1);
    expect(lastPutEntries()).toEqual([
      ORIGINAL[0],
      { cardId: mindStone.id, zone: "main", qty: 1, tags: [] },
      { cardId: arena.id, zone: "main", qty: 1, tags: [] },
      ORIGINAL[3],
    ]);
    expect([posts(), patches()]).toEqual([0, 0]);

    // One Undo for the batch: the whole list back exactly, the tags included.
    fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
    await settle(1500);
    await act(async () => {});
    expect(puts()).toBe(2);
    expect(lastPutEntries()).toEqual(ORIGINAL);
  });

  it("Escape closes the fit sheet, asks nothing more and writes nothing; focus goes back to Why?", async () => {
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    fireEvent.click(door(await openWhy())!);
    const sheet = await pollFor(fitSheet);
    await pollFor(() => swapButton(sheet, 2));
    fireEvent.keyDown(sheet, { key: "Escape" });
    await pollFor(() => (fitSheet() === null ? document.body : null));
    const why = await pollFor(() => screen.queryByRole("button", { name: "Why?" }));
    await pollFor(() => (document.activeElement === why ? why : null));
    await settle(1500);
    await act(async () => {});
    expect([posts(), puts(), patches()]).toEqual([0, 0, 0]);
    expect(altCalls()).toHaveLength(2);
  });

  it("nothing that can go (a land Game Changer alone): the callout names it, and there is no door", async () => {
    const cradle = wire({
      name: "Gaea's Cradle",
      primaryType: "Land",
      costValue: null,
      attrs: { type_line: "Legendary Land", oracle_text: "", game_changer: true },
    });
    deckCards = [
      LIST[0],
      { cardId: cradle.id, zone: "main", qty: 1, tags: [], printingId: null, card: cradle },
      { ...LIST[3], qty: 98 },
    ];
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    const why = await openWhy();
    const callout = why.querySelector<HTMLElement>("[data-slot=bracket-conflicts]")!;
    expect(callout.textContent).toContain("Gaea's Cradle");
    expect(door(why)).toBeNull();
    expect(altCalls()).toHaveLength(0);
  });

  it("no target: the callout and its door aren't there; One Piece has no bracket line at all", async () => {
    deckGoals = null;
    stubViewport(1440);
    render(<DeckEditor deckId="deck-1" />);
    const why = await openWhy();
    expect(why.querySelector("[data-slot=bracket-conflicts]")).toBeNull();
    expect(why.querySelector("[data-slot=bracket-fit-door]")).toBeNull();
    cleanup();
    render(<DeckEditor deckId={null} draftGame="optcg" draftFormat="standard" />);
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();
    expect(document.querySelector("[data-slot=bracket-fit-door]")).toBeNull();
  });

  it("a precon draft: a target, then the door; the apply mints exactly one row carrying the target and the swapped list", async () => {
    stubViewport(1440);
    render(
      <DeckEditor deckId={null} draftGame="mtg" draftFormat="commander" draftFromSlug="fitlab" />,
    );
    await pollFor(() => screen.queryByRole("button", { name: "Keep this deck" }));
    const why = await openWhy();
    fireEvent.click(
      within(within(why).getByRole("group", { name: "Your target" })).getByRole("button", {
        name: "2",
      }),
    );
    fireEvent.click(await pollFor(() => door(why)));
    const sheet = await pollFor(fitSheet);
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
    expect(create.goals).toEqual({ v: 1, targetLevel: 2 });
    expect(lastPutEntries().map((e) => e.cardId)).toEqual([
      kozilek.id,
      mindStone.id,
      arena.id,
      wastes.id,
    ]);
  });
});
