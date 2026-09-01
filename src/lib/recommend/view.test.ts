import { describe, expect, it } from "vitest";

import type { RecommendationEvidence } from "./types";
import { orderEvidence } from "./view";

describe("orderEvidence — strongest first, engine order within a tier", () => {
  const ev = (confidence: RecommendationEvidence["confidence"], why: string) => ({
    source: "s",
    why,
    with: [],
    howOften: null,
    confidence,
  });

  it("sorts by confidence desc, stable within", () => {
    const input = [ev("low", "curve"), ev("high", "pop"), ev("high", "combo"), ev("medium", "m")];
    expect(orderEvidence(input).map((e) => e.why)).toEqual(["pop", "combo", "m", "curve"]);
  });

  it("does not mutate its input", () => {
    const input = [ev("low", "a"), ev("high", "b")];
    orderEvidence(input);
    expect(input.map((e) => e.why)).toEqual(["a", "b"]);
  });
});
