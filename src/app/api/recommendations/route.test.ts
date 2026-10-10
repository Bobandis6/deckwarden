// @vitest-environment node
/**
 * POST /api/recommendations (Y2b, WAVE4 D2): the draft snapshot route over
 * mocked IO — the facts read, the engine and the limiter are stand-ins, so
 * these pin what the ROUTE decides: the snapshot it hands the engine (the
 * one recommendForDeck builds from a stored deck — leaders first at one
 * copy, every other entry with its quantity, the leaders' OR for the color
 * identity), the budget pass-through, the response shape, no-store on every
 * answer, and the 400s (malformed JSON, a bad body, One Piece, an unknown
 * format, ids that aren't live cards of the game) — none of which runs the
 * engine. The live answers are smoke:recommend's snapshot section.
 *
 * Y6a: every entry carries the read's facts (the adapter's flags among
 * them, asked for by its declared paths), the draft's goals go to the
 * engine checked against the game (goalsSchema), and the answer adds
 * `hidden` and `combosTruncated`.
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findFormat, GAME_ID } from "@/db/seed-data";
import { mtgAdapter } from "@/lib/games/mtg/adapter";

const mocks = vi.hoisted(() => ({
  loadEntryFacts: vi.fn(),
  recommendForSnapshot: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/recommend/queries", () => ({ loadEntryFacts: mocks.loadEntryFacts }));
vi.mock("@/lib/recommend/engine", () => ({ recommendForSnapshot: mocks.recommendForSnapshot }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));

const { POST } = await import("./route");

const THRASIOS = "11111111-1111-4111-8111-111111111111";
const TYMNA = "22222222-2222-4222-8222-222222222222";
const SOL = "33333333-3333-4333-8333-333333333333";
const RATS = "44444444-4444-4444-8444-444444444444";

/** What loadEntryFacts reads past type and cost (Y6a): the read's facts, flags included. */
const read = (name: string, ciMask: number, flags: Record<string, unknown> = {}) => ({
  name,
  externalKey: `oracle-${name}`,
  colorsMask: ciMask,
  ciMask,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: "1.00",
  popularity: 100,
  flags,
});
const FACTS = new Map([
  [THRASIOS, { primaryType: "Creature", costValue: 2, ...read("Thrasios", 2 | 16) }],
  [TYMNA, { primaryType: "Creature", costValue: 3, ...read("Tymna", 1 | 4) }],
  [SOL, { primaryType: "Artifact", costValue: 1, ...read("Sol Ring", 0) }],
  [RATS, { primaryType: "Creature", costValue: 3, ...read("Relentless Rats", 4) }],
]);

const REC = { cardId: "55555555-5555-4555-8555-555555555555", name: "Arcane Signet" };
const HIDDEN = { cardId: "77777777-7777-4777-8777-777777777777", name: "Rhystic Study" };

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { res, body: await res.json() };
}

beforeEach(() => {
  mocks.loadEntryFacts.mockReset();
  mocks.loadEntryFacts.mockImplementation(
    async (_gameId: number, ids: string[]) =>
      new Map(ids.filter((id) => FACTS.has(id)).map((id) => [id, FACTS.get(id)!])),
  );
  mocks.recommendForSnapshot.mockReset();
  mocks.recommendForSnapshot.mockResolvedValue({
    recommendations: [REC],
    hidden: [],
    combosTruncated: false,
  });
  mocks.enforceRateLimit.mockReset();
  mocks.enforceRateLimit.mockResolvedValue(null);
});

describe("POST /api/recommendations", () => {
  it("a seeded draft: the snapshot a stored deck would give — leaders first at one copy, then every entry with its copies and its read facts; the leaders' OR; the budget through; { count, recommendations, hidden, combosTruncated }, no-store", async () => {
    const { res, body } = await post({
      game: "mtg",
      format: "commander",
      leaderIds: [THRASIOS, TYMNA],
      entries: [
        { cardId: SOL, qty: 1 },
        { cardId: RATS, qty: 20 },
      ],
      budget: 5,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ count: 1, recommendations: [REC], hidden: [], combosTruncated: false });

    expect(mocks.loadEntryFacts).toHaveBeenCalledWith(
      GAME_ID.mtg,
      [THRASIOS, TYMNA, SOL, RATS],
      mtgAdapter.brackets!.flagPaths,
    );
    expect(mocks.recommendForSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.recommendForSnapshot).toHaveBeenCalledWith(
      {
        gameId: GAME_ID.mtg,
        formatId: findFormat("mtg", "commander")!.id,
        ciMask: 1 | 2 | 4 | 16,
        leaderIds: [THRASIOS, TYMNA],
        entries: [
          {
            cardId: THRASIOS,
            qty: 1,
            primaryType: "Creature",
            costValue: 2,
            facts: read("Thrasios", 2 | 16),
          },
          {
            cardId: TYMNA,
            qty: 1,
            primaryType: "Creature",
            costValue: 3,
            facts: read("Tymna", 1 | 4),
          },
          {
            cardId: SOL,
            qty: 1,
            primaryType: "Artifact",
            costValue: 1,
            facts: read("Sol Ring", 0),
          },
          {
            cardId: RATS,
            qty: 20,
            primaryType: "Creature",
            costValue: 3,
            facts: read("Relentless Rats", 4),
          },
        ],
      },
      { maxPriceUsd: 5, goals: null },
    );
  });

  it("a draft's goals (Y6a) reach the engine as given, checked against the game; its hidden cards come back", async () => {
    mocks.recommendForSnapshot.mockResolvedValue({
      recommendations: [REC],
      hidden: [HIDDEN],
      combosTruncated: true,
    });
    const goals = {
      v: 1,
      targetLevel: 2,
      budget: { perCardUsd: 5 },
      answers: { rulesetVersion: 1, play: { fast: "no" } },
    };
    const { res, body } = await post({
      game: "mtg",
      format: "commander",
      leaderIds: [TYMNA],
      goals,
    });
    expect(res.status).toBe(200);
    expect(body).toEqual({
      count: 1,
      recommendations: [REC],
      hidden: [HIDDEN],
      combosTruncated: true,
    });
    expect(mocks.recommendForSnapshot.mock.calls[0][1]).toEqual({
      maxPriceUsd: undefined,
      goals,
    });
  });

  it.each([
    ["a target the game doesn't have", { v: 1, targetLevel: 7 }],
    ["a budget tier the site doesn't offer", { v: 1, budget: { perCardUsd: 3 } }],
    ["another version", { v: 2, targetLevel: 2 }],
    ["an unknown key", { v: 1, targetLevel: 2, extra: true }],
  ])("goals with %s answer 400 before any read", async (_label, goals) => {
    const { res, body } = await post({
      game: "mtg",
      format: "commander",
      leaderIds: [TYMNA],
      goals,
    });
    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid goals");
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
    expect(mocks.recommendForSnapshot).not.toHaveBeenCalled();
  });

  it("a leader alone is a snapshot too (entries default to none); no budget means none", async () => {
    const { res } = await post({ game: "mtg", format: "commander", leaderIds: [TYMNA] });
    expect(res.status).toBe(200);
    expect(mocks.recommendForSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ ciMask: 1 | 4, leaderIds: [TYMNA] }),
      { maxPriceUsd: undefined, goals: null },
    );
  });

  it("One Piece answers 400 — no recommendation signals; nothing read, the engine never runs", async () => {
    const { res, body } = await post({ game: "optcg", format: "standard", leaderIds: [TYMNA] });
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("No recommendations for optcg");
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
    expect(mocks.recommendForSnapshot).not.toHaveBeenCalled();
  });

  it("ids that aren't live cards of the game answer 400 naming them — the engine never runs", async () => {
    const stray = "66666666-6666-4666-8666-666666666666";
    const { res, body } = await post({
      game: "mtg",
      format: "commander",
      leaderIds: [TYMNA],
      entries: [{ cardId: stray, qty: 1 }],
    });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Unknown card ids for this game", issues: [stray] });
    expect(mocks.recommendForSnapshot).not.toHaveBeenCalled();
  });

  it("an unknown format answers 400 before any read", async () => {
    const { res, body } = await post({ game: "mtg", format: "modern", leaderIds: [TYMNA] });
    expect(res.status).toBe(400);
    expect(body.error).toBe('Unknown format "modern" for mtg');
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["no leader", { game: "mtg", format: "commander", leaderIds: [] }],
    ["three leaders", { game: "mtg", format: "commander", leaderIds: [THRASIOS, TYMNA, SOL] }],
    [
      "a zero quantity",
      {
        game: "mtg",
        format: "commander",
        leaderIds: [TYMNA],
        entries: [{ cardId: SOL, qty: 0 }],
      },
    ],
    ["a non-uuid id", { game: "mtg", format: "commander", leaderIds: ["sol-ring"] }],
    [
      "501 entries",
      {
        game: "mtg",
        format: "commander",
        leaderIds: [TYMNA],
        entries: Array.from({ length: 501 }, () => ({ cardId: SOL, qty: 1 })),
      },
    ],
    ["a negative budget", { game: "mtg", format: "commander", leaderIds: [TYMNA], budget: -3 }],
  ])("%s answers 400 without a read", async (_label, body) => {
    const { res } = await post(body);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
    expect(mocks.recommendForSnapshot).not.toHaveBeenCalled();
  });

  it("its own bucket answers first — a limited caller gets the 429 and nothing is read", async () => {
    mocks.enforceRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const { res } = await post({ game: "mtg", format: "commander", leaderIds: [TYMNA] });
    expect(res.status).toBe(429);
    const [limits] = mocks.enforceRateLimit.mock.calls[0] as [{ key: string }[]];
    expect(limits.map((l) => l.key.split(":")[0])).toEqual([
      "recommend-snapshot",
      "recommend-snapshot",
    ]);
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });
});
