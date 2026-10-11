/**
 * Y10 — the record's arithmetic (WAVE4 D10): every game counted from the
 * GET's cells, split by players and by list; a percentage only from 10
 * games; "Too few games to compare" below 5 per list; the games logged
 * with no list kept counted in every total and in their own row.
 */
import { describe, expect, it } from "vitest";

import {
  COMPARE_FROM,
  PERCENT_FROM,
  RECORD_LISTS,
  shownPercent,
  summarizeRecord,
  tallyByVersion,
  tooFewToCompare,
  type PlayedList,
  type RecordCell,
} from "./record";

const cell = (
  version: number | null,
  podSize: number,
  result: RecordCell["result"],
  games: number,
): RecordCell => ({ version, podSize, result, games });

/** Thirteen games over three lists and two table sizes, two of them logged with no list kept. */
const CELLS: RecordCell[] = [
  cell(8, 4, "win", 3),
  cell(8, 4, "loss", 3),
  cell(8, 3, "loss", 1),
  cell(5, 4, "win", 2),
  cell(5, 4, "loss", 1),
  cell(null, 4, "loss", 2),
  cell(2, 4, "win", 1),
];
/** The GET described two of the three lists played (as if RECORD_LISTS were 2). */
const LISTS: PlayedList[] = [
  { version: 5, since: 2, change: "+1 · -1" },
  { version: 8, since: 5, change: "+2 · -2" },
];

describe("summarizeRecord", () => {
  it("the fixture's numbers: 13 games · 6–7, 46% (from 10 games)", () => {
    const r = summarizeRecord(CELLS, LISTS);
    expect({ games: r.games, win: r.win, loss: r.loss, draw: r.draw }).toEqual({
      games: 13,
      win: 6,
      loss: 7,
      draw: 0,
    });
    expect(shownPercent(r)).toBe(46);
  });

  it("by players, smallest table first, each with its own count", () => {
    expect(summarizeRecord(CELLS, LISTS).pods).toEqual([
      { podSize: 3, games: 1, win: 0, loss: 1, draw: 0 },
      { podSize: 4, games: 12, win: 6, loss: 6, draw: 0 },
    ]);
  });

  it("by list, newest first with its diff line; then the games with no list kept; older lists counted", () => {
    const r = summarizeRecord(CELLS, LISTS);
    expect(r.lists).toEqual([
      { version: 8, since: 5, change: "+2 · -2", games: 7, win: 3, loss: 4, draw: 0 },
      { version: 5, since: 2, change: "+1 · -1", games: 3, win: 2, loss: 1, draw: 0 },
      { version: null, since: null, change: null, games: 2, win: 0, loss: 2, draw: 0 },
    ]);
    // v2 was played (1 game) but isn't described: "and 1 earlier list".
    expect(r.moreLists).toBe(1);
    expect(r.lists.map(tooFewToCompare)).toEqual([false, true, true]);
    expect(r.lists.map(shownPercent)).toEqual([null, null, null]);
  });

  it("draws count in every group", () => {
    const r = summarizeRecord(
      [cell(1, 4, "draw", 1), cell(1, 4, "win", 1)],
      [{ version: 1, since: null, change: null }],
    );
    expect(r).toMatchObject({ games: 2, win: 1, loss: 0, draw: 1 });
    expect(r.lists[0]).toMatchObject({ games: 2, draw: 1 });
  });

  it("no games: nothing to say, nothing to show", () => {
    expect(summarizeRecord([], [])).toEqual({
      games: 0,
      win: 0,
      loss: 0,
      draw: 0,
      pods: [],
      lists: [],
      moreLists: 0,
    });
  });

  it("only games with no list kept: one row, no versions", () => {
    const r = summarizeRecord([cell(null, 4, "win", 1)], []);
    expect(r.lists).toEqual([
      { version: null, since: null, change: null, games: 1, win: 1, loss: 0, draw: 0 },
    ]);
    expect(r.moreLists).toBe(0);
  });

  it("a described list with no counted games is left out (the cells are the truth)", () => {
    const r = summarizeRecord(
      [cell(8, 4, "win", 1)],
      [
        { version: 8, since: 3, change: "+1" },
        { version: 3, since: null, change: null },
      ],
    );
    expect(r.lists.map((l) => l.version)).toEqual([8]);
  });

  it("an empty cell (0 games) counts nothing", () => {
    const r = summarizeRecord(
      [cell(4, 6, "win", 0), cell(4, 4, "loss", 1)],
      [{ version: 4, since: null, change: null }],
    );
    expect(r.pods.map((p) => p.podSize)).toEqual([4]);
    expect(r.games).toBe(1);
  });
});

describe("the gates", () => {
  const t = (win: number, games: number) => ({ games, win, loss: games - win, draw: 0 });

  it("a percentage only from 10 games (WAVE4 A: 5 of 20 is 11–47% at 95%)", () => {
    expect(PERCENT_FROM).toBe(10);
    expect(shownPercent(t(5, 9))).toBeNull();
    expect(shownPercent(t(5, 10))).toBe(50);
    expect(shownPercent(t(1, 3 * 4))).toBe(8);
    expect(shownPercent(t(2, 3 * 4))).toBe(17);
  });

  it("'Too few games to compare' below 5 games", () => {
    expect(COMPARE_FROM).toBe(5);
    expect(tooFewToCompare(t(4, 4))).toBe(true);
    expect(tooFewToCompare(t(0, 5))).toBe(false);
  });

  it("the GET describes the newest 10 lists", () => {
    expect(RECORD_LISTS).toBe(10);
  });
});

describe("tallyByVersion (History's rows)", () => {
  it("win / loss / draw per version, every table size together; no-list games belong to none", () => {
    const byVersion = tallyByVersion([...CELLS, cell(8, 4, "draw", 1)]);
    expect(byVersion.get(8)).toEqual({ games: 8, win: 3, loss: 4, draw: 1 });
    expect(byVersion.get(5)).toEqual({ games: 3, win: 2, loss: 1, draw: 0 });
    expect(byVersion.get(2)).toEqual({ games: 1, win: 1, loss: 0, draw: 0 });
    expect([...byVersion.keys()].sort()).toEqual([2, 5, 8]);
  });
});
