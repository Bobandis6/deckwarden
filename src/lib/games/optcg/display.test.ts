/**
 * One Piece display hooks the builder's rows and captions read (R3, C13 /
 * C15): the printed id badge, the leader caption's stat line (Life
 * included), and the row suffix (Power · Counter, units dropped, no Life).
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "../types";
import { optcgAdapter, type OptcgAttrs } from "./adapter";

function op(attrs: OptcgAttrs, over: Partial<CardData<OptcgAttrs>> = {}): CardData<OptcgAttrs> {
  return {
    id: "f17abc33-b7f1-51b2-9a61-7f3af8c60d6a",
    name: "Enel",
    externalKey: "OP15-058",
    primaryType: "Leader",
    costValue: null,
    colorsMask: 1,
    ciMask: 1,
    isLeaderCandidate: true,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    legality: [],
    ...over,
    attrs,
  };
}

describe("optcg display (R3)", () => {
  it("idBadge is the printed id", () => {
    expect(optcgAdapter.display.idBadge?.(op({ category: "leader" }))).toBe("OP15-058");
  });

  it("statLine carries Life for the leader caption; rowStats drops units and Life", () => {
    const leader = op({ category: "leader", power_num: 5000, life: 5 });
    expect(optcgAdapter.display.statLine?.(leader)).toBe("5000 Power · 5 Life");
    expect(optcgAdapter.display.rowStats?.(leader)).toBe("5000");
    const character = op({ category: "character", power_num: 5000, counter_num: 1000 });
    expect(optcgAdapter.display.rowStats?.(character)).toBe("5000 · +1000");
    expect(optcgAdapter.display.rowStats?.(op({ category: "event" }))).toBeNull();
  });
});
