/**
 * One Piece display hooks the builder's rows and captions read (R3, C13 /
 * C15): the printed id badge, the leader caption's stat line (Life
 * included), and the row suffix (Power · Counter, units dropped, no Life).
 * R2 adds the ambient swatches (the frame hexes in Bandai's display order,
 * a neutral grey for mask 0) and pins that the adapter declares NO ambient
 * art — the gradient is the only ambient treatment One Piece gets.
 */
import { describe, expect, it } from "vitest";

import type { CardData } from "../types";
import { optcgAdapter, type OptcgAttrs } from "./adapter";
import { OPTCG_COLORLESS_HEX, OPTCG_COLORS } from "./colors";

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

  it("colorSwatches are the frame hexes in Bandai display order; mask 0 is the neutral grey (R2)", () => {
    const swatches = (mask: number) => optcgAdapter.display.colorSwatches?.(mask);
    const bit = (name: string) => OPTCG_COLORS.find((c) => c.name === name)!.bit;
    expect(swatches(bit("Purple"))).toEqual(["#6a1b9a"]); // Enel OP15-058, the hub-CTA seed
    expect(swatches(bit("Yellow") | bit("Red"))).toEqual(["#d32f2f", "#f9a825"]);
    expect(swatches(0)).toEqual([OPTCG_COLORLESS_HEX]);
    expect(OPTCG_COLORS.some((c) => c.hex === OPTCG_COLORLESS_HEX)).toBe(false);
  });

  it("declares no ambient art (REDESIGN.md §3: off until Bandai answers)", () => {
    expect(optcgAdapter.capabilities.ambientArt).toBeUndefined();
  });
});
