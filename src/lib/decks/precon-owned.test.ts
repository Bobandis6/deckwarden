/**
 * PRECON-OWNED's pure shapes: the precon's list as the price math counts it
 * (counted zones, one row per identity), what a Yes owns, the one
 * identity-level owned set the editor hands the price sheets, and the
 * answer's canonical PATCH body.
 */
import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";

import {
  ownedForPricing,
  ownedPreconCopies,
  ownsPreconPatchBody,
  ownsPreconSchema,
  preconCards,
} from "./precon-owned";

describe("preconCards — the precon's list as the price math counts it", () => {
  it("counted zones only, one row per identity with its copies summed, sorted by id", () => {
    expect(
      preconCards(
        [
          { cardId: "c-forest", zone: "main", qty: 12 },
          { cardId: "a-cmdr", zone: "commander", qty: 1 },
          { cardId: "b-treasure", zone: "tokens", qty: 3 },
          { cardId: "c-forest", zone: "commander", qty: 1 },
          { cardId: "d-gone", zone: "main", qty: 0 },
        ],
        COMMANDER,
      ),
    ).toEqual([
      { cardId: "a-cmdr", qty: 1 },
      { cardId: "c-forest", qty: 13 },
    ]);
  });

  it("an empty list is an empty list", () => {
    expect(preconCards([], COMMANDER)).toEqual([]);
  });
});

describe("ownedPreconCopies — what a Yes owns", () => {
  const cards = [
    { cardId: "cmdr", qty: 1 },
    { cardId: "forest", qty: 12 },
  ];

  it("only a Yes owns anything: a No, an unanswered question and no precon own nothing", () => {
    expect(ownedPreconCopies({ owns: true, cards })).toEqual(
      new Map([
        ["cmdr", 1],
        ["forest", 12],
      ]),
    );
    expect(ownedPreconCopies({ owns: false, cards })).toBeNull();
    expect(ownedPreconCopies({ owns: null, cards })).toBeNull();
    expect(ownedPreconCopies(null)).toBeNull();
  });

  it("a duplicate row adds its copies rather than replacing them", () => {
    expect(
      ownedPreconCopies({
        owns: true,
        cards: [
          { cardId: "forest", qty: 6 },
          { cardId: "forest", qty: 6 },
        ],
      })?.get("forest"),
    ).toBe(12);
  });
});

describe("ownedForPricing — the one identity-level owned set the price sheets take", () => {
  const copies = new Map([
    ["cmdr", 1],
    ["forest", 12],
  ]);

  it("the collection's identities plus the owned precon's", () => {
    expect(ownedForPricing(new Set(["sol"]), copies)).toEqual(new Set(["sol", "cmdr", "forest"]));
    expect(ownedForPricing(null, copies)).toEqual(new Set(["cmdr", "forest"]));
  });

  it("without an owned precon it is the collection's set itself, null without one", () => {
    const collection = new Set(["sol"]);
    expect(ownedForPricing(collection, null)).toBe(collection);
    expect(ownedForPricing(null, null)).toBeNull();
  });
});

describe("the answer's PATCH body", () => {
  it("one canonical body per answer: the editor's baseline compares the strings", () => {
    expect(ownsPreconPatchBody(true)).toBe('{"ownsPrecon":true}');
    expect(ownsPreconPatchBody(false)).toBe('{"ownsPrecon":false}');
    expect(ownsPreconPatchBody(null)).toBe('{"ownsPrecon":null}');
  });

  it("true, false or null, nothing else", () => {
    for (const ok of [true, false, null]) expect(ownsPreconSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["yes", 1, 0, undefined, {}])
      expect(ownsPreconSchema.safeParse(bad).success).toBe(false);
  });
});
