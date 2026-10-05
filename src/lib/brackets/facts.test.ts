/**
 * Y4a — the facts request's one rule (WAVE4 D5): every distinct card id,
 * sorted, after the game; and the answer's shape check.
 */
import { describe, expect, it } from "vitest";

import { FACTS_ID, FACTS_MAX_IDS, factsIds, factsPath, parseFacts } from "./facts";

const A = "0a000000-0000-4000-8000-000000000001";
const B = "1b000000-0000-4000-8000-000000000002";
const C = "fc000000-0000-4000-8000-000000000003";

const freshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: { combos: { state: "ok", asOf: "2026-10-04T15:29:34.768Z" } },
};
const combo = {
  key: "618-1537",
  cardPieces: [A, B],
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite creature tokens with haste"],
  popularity: 28185,
};

describe("factsIds — the id SET, the facts' key", () => {
  it("every zone, each card once, sorted: copies and zones never change it", () => {
    expect(
      factsIds([
        { cardId: C },
        { cardId: A },
        { cardId: B },
        { cardId: A }, // the same card in another zone
      ]),
    ).toEqual([A, B, C]);
    expect(factsIds([])).toEqual([]);
  });
});

describe("factsPath — the canonical request", () => {
  it("game, then the ids comma-joined — a GET with no deck id and no token", () => {
    expect(factsPath("mtg", [A, B, C])).toBe(`/api/combos/complete?game=mtg&ids=${A},${B},${C}`);
  });

  it("the cap and the id shape the route checks", () => {
    expect(FACTS_MAX_IDS).toBe(200);
    expect(FACTS_ID.test(A)).toBe(true);
    expect(FACTS_ID.test(A.toUpperCase())).toBe(false);
    expect(FACTS_ID.test("618-1537")).toBe(false);
    // 200 uuids stay well inside a URL's budget.
    expect(factsPath("mtg", Array(FACTS_MAX_IDS).fill(A)).length).toBeLessThan(8_000);
  });
});

describe("parseFacts — the answer, shape-checked", () => {
  it("the route's body passes through", () => {
    expect(parseFacts({ combos: [combo], freshness })).toEqual({ combos: [combo], freshness });
    expect(parseFacts({ combos: [], freshness })).toEqual({ combos: [], freshness });
  });

  it("anything else is null — the line then says it couldn't check", () => {
    for (const bad of [
      null,
      "nope",
      {},
      { combos: [] },
      { freshness },
      { combos: {}, freshness },
      { combos: [], freshness: { feeds: {} } },
      { combos: [], freshness: { readAt: "x", feeds: null } },
      { combos: [{ ...combo, cardPieces: undefined }], freshness },
      { combos: [{ ...combo, key: 618 }], freshness },
    ]) {
      expect(parseFacts(bad)).toBeNull();
    }
  });
});
