/**
 * The private gate (P1.7; no test before Y5; the public id since S6, L4):
 * the deck comes from the token-authed API, never the server HTML, and the
 * server HTML carries no uuid either — the gate holds the public id alone
 * and resolves it through POST /api/decks/mine with the tokens this browser
 * holds (the uuid arrives only after the proof), then the deck GET
 * (no-store, the token header), then one facts GET by the id set, the
 * editor's URL (Y5). Denied without a request when no token is held, and
 * after the mine call alone when the held tokens prove other decks.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { factsIds, factsPath } from "@/lib/brackets/facts";
import { DECK_TOKEN_HEADER, setDeckToken } from "@/lib/decks/token-store";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, fillers } from "@/lib/games/mtg/test-fixtures";
import type { BracketFreshness } from "@/lib/games/types";

import { PrivateShareGate } from "./private-share-gate";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// The owner row / tile menu preloads the Games dialog's chunk (Y9b); load it
// here first so that preload resolves from the module cache — under a full
// run a cold import could outlive this file's environment (Y10).
await import("@/components/editor/log-game-dialog");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const DECK_ID = "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11";
const PUBLIC_ID = "pr1vate0deck";
const OTHER_ID = "6a1c0f9e-8b2d-4c3e-9f4a-5b6c7d8e9f01";
const commanderZone = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
const mainZone = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;
const wire = (c: typeof atraxa, zone: string) => ({
  cardId: c.id,
  zone,
  qty: 1,
  tags: [],
  printingId: null,
  card: { ...c, image: null },
});
const cards = [wire(atraxa, commanderZone), ...fillers(99).map((c) => wire(c, mainZone))];
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
    landDenial: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
    extraTurns: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
    combos: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" },
  },
};
const deck = {
  id: DECK_ID,
  publicId: PUBLIC_ID,
  game: "mtg",
  format: "commander",
  name: "Private Atraxa",
  description: null,
  notes: null,
  visibility: "private",
  likesCount: 0,
  updatedAt: "2026-10-05T00:00:00.000Z",
  leaderIds: [atraxa.id],
  ciMask: atraxa.ciMask,
  isOwner: false,
  // The owner's wire: every goal (the page shows only the table's).
  goals: { v: 1, targetLevel: 2, budget: { perCardUsd: 5 } },
};
/** What /api/decks/mine answers for the tokens it verified (deckMetaJson + a tile image). */
const mineDeck = (id: string, publicId: string) => ({
  ...deck,
  id,
  publicId,
  isOwner: true,
  leaderImage: null,
});

type Call = [string, RequestInit | undefined];

describe("PrivateShareGate", () => {
  it("the owner's browser: its tokens to mine, the matching deck's GET with its token, then one facts GET", async () => {
    setDeckToken(DECK_ID, "claim-token");
    setDeckToken(OTHER_ID, "other-token");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/decks/mine") {
        return new Response(
          JSON.stringify({
            decks: [mineDeck(OTHER_ID, "0ther0deck00"), mineDeck(DECK_ID, PUBLIC_ID)],
          }),
        );
      }
      if (url.startsWith("/api/combos/complete")) {
        return new Response(JSON.stringify({ combos: [], freshness: FRESH }));
      }
      return new Response(JSON.stringify({ deck, cards }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate publicId={PUBLIC_ID} />);
    expect(await screen.findByText(/^Played as Bracket 2 \(Core\)/)).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const calls = fetchMock.mock.calls as unknown as Call[];
    const [mineUrl, mineInit] = calls[0];
    expect(mineUrl).toBe("/api/decks/mine");
    expect(mineInit?.method).toBe("POST");
    expect(mineInit?.cache).toBe("no-store");
    expect(JSON.parse(mineInit?.body as string)).toEqual({
      decks: expect.arrayContaining([
        { id: DECK_ID, token: "claim-token" },
        { id: OTHER_ID, token: "other-token" },
      ]),
    });
    const [deckUrl, deckInit] = calls[1];
    expect(deckUrl).toBe(`/api/decks/${DECK_ID}`);
    expect(deckInit?.cache).toBe("no-store");
    expect((deckInit?.headers as Record<string, string>)[DECK_TOKEN_HEADER]).toBe("claim-token");
    expect(calls[2][0]).toBe(factsPath("mtg", factsIds(cards)));
    // The budget is the owner's — the page never says it.
    expect(document.body.textContent).not.toMatch(/\$5|budget/i);
    // A guest owner's browser gets the owner's row.
    expect(screen.getByRole("button", { name: "Share…" })).toBeTruthy();
  });

  it("no token held: denied without a single request", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate publicId={PUBLIC_ID} />);
    expect(await screen.findByText(/This deck is private/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tokens for other decks only: the mine call, then denied — no deck GET, no facts", async () => {
    setDeckToken(OTHER_ID, "other-token");
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify({ decks: [mineDeck(OTHER_ID, "0ther0deck00")] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate publicId={PUBLIC_ID} />);
    expect(await screen.findByText(/This deck is private/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/decks/mine");
  });

  it("a mine answer the deck GET then refuses: denied, nothing else asked", async () => {
    setDeckToken(DECK_ID, "stale-token");
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/decks/mine"
        ? new Response(JSON.stringify({ decks: [mineDeck(DECK_ID, PUBLIC_ID)] }))
        : new Response("{}", { status: 403 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate publicId={PUBLIC_ID} />);
    expect(await screen.findByText(/This deck is private/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
