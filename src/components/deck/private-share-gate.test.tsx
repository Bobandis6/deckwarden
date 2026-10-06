/**
 * The private gate (P1.7; no test before Y5): the deck comes from the
 * token-authed API, never the server HTML, and since Y5 the bracket line's
 * facts come from the client too — the deck GET (no-store, the token
 * header), then one facts GET by the id set, the editor's URL. Denied
 * without proof.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { factsIds, factsPath } from "@/lib/brackets/facts";
import { DECK_TOKEN_HEADER, setDeckToken } from "@/lib/decks/token-store";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, fillers } from "@/lib/games/mtg/test-fixtures";
import type { BracketFreshness } from "@/lib/games/types";

import { PrivateShareGate } from "./private-share-gate";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const DECK_ID = "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11";
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
  publicId: "pr1vate0deck",
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

describe("PrivateShareGate", () => {
  it("the owner's browser: the deck GET with its token, then one facts GET from the client", async () => {
    setDeckToken(DECK_ID, "claim-token");
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("/api/combos/complete")
        ? new Response(JSON.stringify({ combos: [], freshness: FRESH }))
        : new Response(JSON.stringify({ deck, cards })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate deckId={DECK_ID} />);
    expect(await screen.findByText(/^Played as Bracket 2 \(Core\)/)).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [deckUrl, deckInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(deckUrl).toBe(`/api/decks/${DECK_ID}`);
    expect(deckInit.cache).toBe("no-store");
    expect((deckInit.headers as Record<string, string>)[DECK_TOKEN_HEADER]).toBe("claim-token");
    expect(fetchMock.mock.calls[1][0]).toBe(factsPath("mtg", factsIds(cards)));
    // The budget is the owner's — the page never says it.
    expect(document.body.textContent).not.toMatch(/\$5|budget/i);
    // A guest owner's browser gets the owner's row.
    expect(screen.getByRole("button", { name: "Share…" })).toBeTruthy();
  });

  it("anyone else: denied, and no facts asked", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PrivateShareGate deckId={DECK_ID} />);
    expect(await screen.findByText(/This deck is private/)).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
