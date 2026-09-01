import { describe, expect, it } from "vitest";

import { candidateConditions, type CandidateFilter } from "./queries";

/**
 * The deterministic filter is SQL built by one function; these tests pin its
 * CONTRACT shape without a database: which inputs add conditions and which
 * are inert. Behavior against real rows is smoke:recommend's job.
 */
const BASE: CandidateFilter = {
  gameId: 1,
  formatId: 1,
  deckCiMask: 3,
  excludeCardIds: [],
};

describe("candidateConditions", () => {
  it("owned-cards hook is INERT when undefined (the P3.7 contract)", () => {
    const off = candidateConditions(BASE);
    const alsoOff = candidateConditions({ ...BASE, ownedCardIds: undefined });
    expect(alsoOff).toHaveLength(off.length);
  });

  it("owned-cards hook restricts when provided — empty set means empty pool, not hook-off", () => {
    const off = candidateConditions(BASE);
    const restricted = candidateConditions({
      ...BASE,
      ownedCardIds: new Set(["00000000-0000-0000-0000-000000000001"]),
    });
    const emptyOwned = candidateConditions({ ...BASE, ownedCardIds: new Set<string>() });
    expect(restricted).toHaveLength(off.length + 1);
    expect(emptyOwned).toHaveLength(off.length + 1);
  });

  it("budget and deck-exclusion each add conditions; adapter exclude rules apply per rule", () => {
    const off = candidateConditions(BASE);
    // Budget adds two: price known AND price under budget (unknown price is
    // never silently "within budget").
    expect(candidateConditions({ ...BASE, maxPriceUsd: 25 })).toHaveLength(off.length + 2);
    expect(
      candidateConditions({ ...BASE, excludeCardIds: ["00000000-0000-0000-0000-000000000002"] }),
    ).toHaveLength(off.length + 1);
    expect(
      candidateConditions({
        ...BASE,
        exclude: [{ jsonbPath: ["type_line"], likePattern: "%Basic%" }],
      }),
    ).toHaveLength(off.length + 1);
  });

  it("rejects a malformed jsonb exclude key instead of interpolating it", () => {
    expect(() =>
      candidateConditions({
        ...BASE,
        exclude: [{ jsonbPath: ["bad' key"] as unknown as [string], likePattern: "%x%" }],
      }),
    ).toThrow(/Invalid exclude path/);
  });
});
