// @vitest-environment node
/**
 * POST /api/alternatives (Y7a, WAVE4 D8): Swap Lab's snapshot route over
 * mocked IO — the facts read, the pipeline, the wires and the limiter are
 * stand-ins, so these pin what the ROUTE decides: the snapshot it hands the
 * pipeline (the draft Suggestions POST's shape: leaders first at one copy,
 * every entry with its copies and its read facts), the card's declared
 * roles in the adapter's order, the honest empty answers and their reasons,
 * the CardWire on every row, no-store on every answer, and the 400s (One
 * Piece, a card that isn't in the entries, unknown ids, bad goals, a
 * malformed body) — none of which runs the pipeline. The live answers are
 * the gold set's and the smoke's.
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { findFormat, GAME_ID } from "@/db/seed-data";
import { mtgAdapter } from "@/lib/games/mtg/adapter";

const mocks = vi.hoisted(() => ({
  loadEntryFacts: vi.fn(),
  alternativesForSnapshot: vi.fn(),
  loadCardWires: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/recommend/queries", () => ({ loadEntryFacts: mocks.loadEntryFacts }));
vi.mock("@/lib/recommend/alternatives", () => ({
  alternativesForSnapshot: mocks.alternativesForSnapshot,
}));
vi.mock("@/lib/cards/wire", () => ({ loadCardWires: mocks.loadCardWires }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));

const { POST } = await import("./route");

const ODRIC = "11111111-1111-4111-8111-111111111111";
const SOL = "33333333-3333-4333-8333-333333333333";
const PLAINS = "44444444-4444-4444-8444-444444444444";
const SWORDS = "55555555-5555-4555-8555-555555555555";

const read = (name: string, ciMask: number, roles?: string[]) => ({
  name,
  externalKey: `oracle-${name}`,
  colorsMask: ciMask,
  ciMask,
  isLeaderCandidate: false,
  isPreview: false,
  cheapestUsd: "1.00",
  popularity: 100,
  flags: {},
  ...(roles ? { roles } : {}),
});
const FACTS = new Map([
  [ODRIC, { primaryType: "Creature", costValue: 3, ...read("Odric", 1, []) }],
  // Stored sorted; a key the adapter doesn't declare is no role.
  [
    SOL,
    { primaryType: "Artifact", costValue: 1, ...read("Sol Ring", 0, ["mana-rock", "ramp", "x"]) },
  ],
  [PLAINS, { primaryType: "Land", costValue: 0, ...read("Plains", 0, []) }],
  [SWORDS, { primaryType: "Instant", costValue: 1, ...read("Swords to Plowshares", 1, []) }],
]);

const ROW = {
  cardId: "66666666-6666-4666-8666-666666666666",
  name: "Arcane Signet",
  shared: ["ramp", "mana-rock"],
  conflicts: [],
};
const HIDDEN = { ...ROW, cardId: "77777777-7777-4777-8777-777777777777", name: "Mana Vault" };
const wire = (id: string, name: string) => ({ id, name, attrs: {}, legality: [], image: null });

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/alternatives", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { res, body: await res.json() };
}

const LIST = {
  game: "mtg",
  format: "commander",
  leaderIds: [ODRIC],
  entries: [
    { cardId: SOL, qty: 1 },
    { cardId: PLAINS, qty: 30 },
    { cardId: SWORDS, qty: 1 },
  ],
};

beforeEach(() => {
  mocks.loadEntryFacts.mockReset();
  mocks.loadEntryFacts.mockImplementation(
    async (_gameId: number, ids: string[]) =>
      new Map(ids.filter((id) => FACTS.has(id)).map((id) => [id, FACTS.get(id)!])),
  );
  mocks.alternativesForSnapshot.mockReset();
  mocks.alternativesForSnapshot.mockResolvedValue({
    alternatives: [ROW],
    hidden: [HIDDEN],
    combosTruncated: false,
    tradeoff: [{ source: "edhrec_rank", side: "keep" }],
  });
  mocks.loadCardWires.mockReset();
  mocks.loadCardWires.mockImplementation(async (ids: string[]) =>
    ids.map((id) => wire(id, id === ROW.cardId ? ROW.name : HIDDEN.name)),
  );
  mocks.enforceRateLimit.mockReset();
  mocks.enforceRateLimit.mockResolvedValue(null);
});

describe("POST /api/alternatives", () => {
  it("Sol Ring: the snapshot the draft Suggestions POST builds, its declared roles in order, every row with its CardWire, no-store", async () => {
    const goals = { v: 1, targetLevel: 2 };
    const { res, body } = await post({ ...LIST, cardId: SOL, goals });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      cardId: SOL,
      roles: ["ramp", "mana-rock"],
      alternatives: [{ ...ROW, card: wire(ROW.cardId, ROW.name) }],
      hidden: [{ ...HIDDEN, card: wire(HIDDEN.cardId, HIDDEN.name) }],
      combosTruncated: false,
      tradeoff: [{ source: "edhrec_rank", side: "keep" }],
    });

    expect(mocks.loadEntryFacts).toHaveBeenCalledWith(
      GAME_ID.mtg,
      [ODRIC, SOL, PLAINS, SWORDS],
      mtgAdapter.brackets!.flagPaths,
      "roles",
    );
    const [req] = mocks.alternativesForSnapshot.mock.calls[0];
    expect(req).toMatchObject({
      cardId: SOL,
      roles: ["ramp", "mana-rock"],
      costValue: 1,
      goals,
      snapshot: {
        gameId: GAME_ID.mtg,
        formatId: findFormat("mtg", "commander")!.id,
        ciMask: 1,
        leaderIds: [ODRIC],
      },
    });
    expect(
      req.snapshot.entries.map((e: { cardId: string; qty: number }) => [e.cardId, e.qty]),
    ).toEqual([
      [ODRIC, 1],
      [SOL, 1],
      [PLAINS, 30],
      [SWORDS, 1],
    ]);
    expect(req.snapshot.entries[1].facts).toMatchObject({ name: "Sol Ring", flags: {} });
    expect(mocks.loadCardWires).toHaveBeenCalledWith(
      [ROW.cardId, HIDDEN.cardId],
      findFormat("mtg", "commander")!.id,
    );
  });

  it("a card with no roles yet answers an honest empty list — the pipeline never runs", async () => {
    const { res, body } = await post({ ...LIST, cardId: SWORDS });
    expect(res.status).toBe(200);
    expect(body).toEqual({
      cardId: SWORDS,
      roles: [],
      alternatives: [],
      hidden: [],
      combosTruncated: false,
      tradeoff: null,
      reason: "no-roles",
    });
    expect(mocks.alternativesForSnapshot).not.toHaveBeenCalled();
  });

  it("a land isn't offered (the adapter's call), whatever its roles", async () => {
    const { body } = await post({ ...LIST, cardId: PLAINS });
    expect(body.reason).toBe("not-offered");
    expect(mocks.alternativesForSnapshot).not.toHaveBeenCalled();
  });

  it("names why a list is empty: every match hidden by the goals, or nothing to match", async () => {
    mocks.alternativesForSnapshot.mockResolvedValue({
      alternatives: [],
      hidden: [HIDDEN],
      combosTruncated: false,
      tradeoff: null,
    });
    expect((await post({ ...LIST, cardId: SOL })).body.reason).toBe("goals");
    mocks.alternativesForSnapshot.mockResolvedValue({
      alternatives: [],
      hidden: [],
      combosTruncated: false,
      tradeoff: null,
    });
    const { body } = await post({ ...LIST, cardId: SOL });
    expect(body.reason).toBe("none");
    expect(mocks.loadCardWires).toHaveBeenCalledWith([], expect.any(Number));
  });

  it("One Piece answers 400 — no swap declared; nothing read", async () => {
    const { res, body } = await post({
      game: "optcg",
      format: "standard",
      leaderIds: [ODRIC],
      entries: [{ cardId: SOL, qty: 1 }],
      cardId: SOL,
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body.error).toBe("No alternatives for optcg");
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });

  it("a card that isn't in the entries — a leader included — answers 400 before any read", async () => {
    for (const cardId of [ODRIC, "99999999-9999-4999-8999-999999999999"]) {
      const { res, body } = await post({ ...LIST, cardId });
      expect(res.status).toBe(400);
      expect(body.error).toMatch(/must be in the list's entries/);
    }
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });

  it("ids that aren't live cards of the game answer 400 naming them", async () => {
    const stray = "88888888-8888-4888-8888-888888888888";
    const { res, body } = await post({
      ...LIST,
      entries: [...LIST.entries, { cardId: stray, qty: 1 }],
      cardId: SOL,
    });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Unknown card ids for this game", issues: [stray] });
    expect(mocks.alternativesForSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["no card", { ...LIST }],
    ["a non-uuid card", { ...LIST, cardId: "sol-ring" }],
    ["no leader", { ...LIST, leaderIds: [], cardId: SOL }],
    ["an unknown format", { ...LIST, format: "modern", cardId: SOL }],
    ["goals the game doesn't have", { ...LIST, cardId: SOL, goals: { v: 1, targetLevel: 9 } }],
  ])("%s answers 400 without a read", async (_label, body) => {
    const { res } = await post(body);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
    expect(mocks.alternativesForSnapshot).not.toHaveBeenCalled();
  });

  it("its own bucket answers first — a limited caller gets the 429 and nothing is read", async () => {
    mocks.enforceRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
    const { res } = await post({ ...LIST, cardId: SOL });
    expect(res.status).toBe(429);
    const [limits] = mocks.enforceRateLimit.mock.calls[0] as [{ key: string }[]];
    expect(limits.map((l) => l.key.split(":")[0])).toEqual(["alternatives", "alternatives"]);
    expect(mocks.loadEntryFacts).not.toHaveBeenCalled();
  });
});
