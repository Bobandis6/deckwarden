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
