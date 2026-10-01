/**
 * The start doors (Y2b, WAVE4 D2): one order and one vocabulary per game,
 * straight off the adapters — Magic gets all four, One Piece gets Pick a
 * leader and Paste a list (no precon data, no autofill to roll into), and
 * the picker's hrefs are the chooser's one-shot latches.
 */
import { describe, expect, it } from "vitest";

import { mtgAdapter } from "@/lib/games/mtg/adapter";
import { optcgAdapter } from "@/lib/games/optcg/adapter";
import type { FormatDef, GameAdapter } from "@/lib/games/types";

import { startDoorHref, startDoors } from "./start-doors";

const commander = mtgAdapter.formats[0];
const optcgStandard = optcgAdapter.formats[0];

describe("startDoors", () => {
  it("Magic: Pick a commander · Paste a list · Start from a precon · Surprise me, in that order", () => {
    const doors = startDoors(mtgAdapter, commander);
    expect(doors.map((d) => d.label)).toEqual([
      "Pick a commander",
      "Paste a list",
      "Start from a precon",
      "Surprise me",
    ]);
    expect(doors.map((d) => startDoorHref(d, "mtg"))).toEqual([
      "/commanders",
      "/decks/new?game=mtg&import=1",
      "/precons",
      "/decks/new?game=mtg&surprise=1",
    ]);
  });

  it("One Piece: Pick a leader and Paste a list only — no precon, no Surprise me", () => {
    const doors = startDoors(optcgAdapter, optcgStandard);
    expect(doors.map((d) => d.kind)).toEqual(["leader", "paste"]);
    expect(doors.map((d) => d.label)).toEqual(["Pick a leader", "Paste a list"]);
    expect(doors.map((d) => startDoorHref(d, "optcg"))).toEqual([
      "/leaders",
      "/decks/new?game=optcg&import=1",
    ]);
  });

  it("a format without a leader zone has nothing to pick or roll into — Paste a list stays", () => {
    const noLeaders: FormatDef = {
      ...commander,
      zones: commander.zones.filter((z) => !z.isLeaderZone),
    };
    expect(startDoors(mtgAdapter, noLeaders).map((d) => d.kind)).toEqual(["paste", "precon"]);
  });

  it("each door is declared, not assumed: no leaderBrowse → no Pick door; no autofill → no Surprise me", () => {
    const bare: GameAdapter = {
      ...mtgAdapter,
      display: { ...mtgAdapter.display, leaderBrowse: undefined, preconBrowse: undefined },
      recommend: undefined,
    };
    expect(startDoors(bare, commander).map((d) => d.kind)).toEqual(["paste"]);
  });
});
