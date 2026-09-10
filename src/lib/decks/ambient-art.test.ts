/**
 * The ambient-art helpers (R2): the art leader is the FIRST leader-zone
 * entry in entries order — the same order `leaderDenorm` writes to
 * decks.leader_ids, pinned over one list — with the entry's chosen printing
 * or null; the request key and path; and `orderLeadersBy`, which puts a
 * name-sorted wire back into the decks-row order so a partner deck's art
 * leader survives a reload.
 */
import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { optcgAdapter } from "@/lib/games/optcg/adapter";
import { leaderDenorm } from "./cards";
import { artRequestPath, artTargetKey, leaderArtTarget, orderLeadersBy } from "./ambient-art";

const TYMNA = "11111111-1111-4111-8111-111111111111";
const THRASIOS = "22222222-2222-4222-8222-222222222222";
const SOL = "33333333-3333-4333-8333-333333333333";
const ALT = "44444444-4444-4444-8444-444444444444";
const OPTCG_STANDARD = optcgAdapter.formats[0];

const entry = (cardId: string, zone: string, printingId?: string) => ({
  cardId,
  zone,
  qty: 1,
  tags: [] as string[],
  ...(printingId ? { printingId } : {}),
});

describe("leaderArtTarget", () => {
  it("is null without a leader-zone entry, whatever the main deck holds", () => {
    expect(leaderArtTarget([], COMMANDER)).toBeNull();
    expect(leaderArtTarget([entry(SOL, "main")], COMMANDER)).toBeNull();
  });

  it("is the FIRST leader entry in entries order — the order leaderDenorm persists", () => {
    const partners = [entry(SOL, "main"), entry(TYMNA, "commander"), entry(THRASIOS, "commander")];
    expect(leaderArtTarget(partners, COMMANDER)).toEqual({ cardId: TYMNA, printingId: null });
    const { leaderIds } = leaderDenorm(partners, COMMANDER, new Map());
    expect(leaderIds[0]).toBe(TYMNA);
    expect(leaderArtTarget(partners, COMMANDER)?.cardId).toBe(leaderIds[0]);
    // Reversed insertion → the other partner, in both places.
    const reversed = [entry(THRASIOS, "commander"), entry(TYMNA, "commander")];
    expect(leaderArtTarget(reversed, COMMANDER)?.cardId).toBe(
      leaderDenorm(reversed, COMMANDER, new Map()).leaderIds[0],
    );
  });

  it("carries the entry's chosen printing; a One Piece leader zone works the same", () => {
    expect(leaderArtTarget([entry(TYMNA, "commander", ALT)], COMMANDER)).toEqual({
      cardId: TYMNA,
      printingId: ALT,
    });
    expect(leaderArtTarget([entry(SOL, "main"), entry(TYMNA, "leader")], OPTCG_STANDARD)).toEqual({
      cardId: TYMNA,
      printingId: null,
    });
  });
});

describe("artTargetKey / artRequestPath", () => {
  it("keys and paths differ by printing", () => {
    expect(artTargetKey({ cardId: TYMNA, printingId: null })).toBe(`${TYMNA}:`);
    expect(artTargetKey({ cardId: TYMNA, printingId: ALT })).toBe(`${TYMNA}:${ALT}`);
    expect(artRequestPath({ cardId: TYMNA, printingId: null })).toBe(`/api/cards/${TYMNA}/art`);
    expect(artRequestPath({ cardId: TYMNA, printingId: ALT })).toBe(
      `/api/cards/${TYMNA}/art?printingId=${ALT}`,
    );
  });
});

describe("orderLeadersBy", () => {
  it("restores the decks-row leader order over a name-sorted wire and leaves the rest alone", () => {
    const wire = [entry(THRASIOS, "commander"), entry(TYMNA, "commander"), entry(SOL, "main")];
    const ordered = orderLeadersBy(wire, COMMANDER, [TYMNA, THRASIOS]);
    expect(ordered.map((e) => e.cardId)).toEqual([TYMNA, THRASIOS, SOL]);
    expect(leaderArtTarget(ordered, COMMANDER)?.cardId).toBe(TYMNA);
    // A wire already in that order is untouched; unknown ids trail.
    expect(orderLeadersBy(ordered, COMMANDER, [TYMNA, THRASIOS])).toEqual(ordered);
    expect(orderLeadersBy(wire, COMMANDER, [TYMNA]).map((e) => e.cardId)).toEqual([
      TYMNA,
      THRASIOS,
      SOL,
    ]);
    expect(orderLeadersBy(wire, COMMANDER, []).map((e) => e.cardId)).toEqual([
      THRASIOS,
      TYMNA,
      SOL,
    ]);
  });

  it("a single leader or none passes through", () => {
    const one = [entry(TYMNA, "commander"), entry(SOL, "main")];
    expect(orderLeadersBy(one, COMMANDER, [TYMNA])).toEqual(one);
    expect(orderLeadersBy([entry(SOL, "main")], COMMANDER, [])).toEqual([entry(SOL, "main")]);
  });
});
