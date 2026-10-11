/**
 * Y9a — D0's copy guard over the journal's words: none says "approve"
 * (the Warden's word stays legality-only), every builder is read, and the
 * lines the dialog and the toast print are pinned.
 */
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";

import { JOURNAL_COPY, playedDateLabel } from "./copy";

/** Y9b's builders over the adapter's leader noun, called the ways the field calls them. */
const OPPONENT_WORDS: Record<string, (noun: string) => string[]> = {
  opponentsLabel: (noun) => [1, 3].map((max) => JOURNAL_COPY.opponentsLabel(noun, max)),
  opponentBox: (noun) => [
    JOURNAL_COPY.opponentBox(noun, 1, 1),
    JOURNAL_COPY.opponentBox(noun, 2, 3),
  ],
  secondBox: (noun) => [JOURNAL_COPY.secondBox(noun, 1)],
  addSecond: (noun) => [JOURNAL_COPY.addSecond(noun)],
  searchLeader: (noun) => [JOURNAL_COPY.searchLeader(noun)],
  removeLeader: () => [JOURNAL_COPY.removeLeader("Atraxa, Praetors' Voice")],
  opponentUnpicked: (noun) => [JOURNAL_COPY.opponentUnpicked(noun)],
};

/** Every string the table can print — each plain string and each builder, called. */
function everyString(): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(JOURNAL_COPY)) {
    if (typeof value === "string") out.push(value);
    else if (key === "gameLine") {
      for (const version of [12, null]) {
        out.push(
          JOURNAL_COPY.gameLine({
            playedOn: "2026-10-10",
            result: "win",
            podSize: 4,
            seatPhrase: "went 2nd",
            version,
            onePod: false,
          }),
        );
      }
    } else if (key === "resultButton" || key === "logged") {
      for (const r of ["win", "loss", "draw"] as const)
        out.push((value as (r: string) => string)(r));
    } else if (key === "playedNote") out.push(JOURNAL_COPY.playedNote("2026-10-10"));
    else if (key in OPPONENT_WORDS) {
      // Y9b's opponents' words, in both adapters' nouns.
      for (const noun of ["Commander", "Leader"]) out.push(...OPPONENT_WORDS[key](noun));
    } else out.push((value as (n: number) => string)(100));
  }
  // The adapters' journal words ride along.
  for (const id of ["mtg", "optcg"] as const) {
    const journal = getAdapter(id).journal!;
    for (const s of journal.seats(journal.pod.max)) out.push(s.label, s.phrase);
    if (journal.tableLevel) out.push(journal.tableLevel.noun);
  }
  return out;
}

describe("JOURNAL_COPY", () => {
  it("no journal string says approve — the Warden's word is legality-only", () => {
    expect(everyString().length).toBeGreaterThan(Object.keys(JOURNAL_COPY).length);
    expect(everyString().filter((s) => /approv/i.test(s))).toEqual([]);
  });

  it("the toast: 'Logged a win', and the capped line names the allowance", () => {
    expect(JOURNAL_COPY.logged("win")).toBe("Logged a win");
    expect(JOURNAL_COPY.logged("loss")).toBe("Logged a loss");
    expect(JOURNAL_COPY.logged("draw")).toBe("Logged a draw");
    expect(JOURNAL_COPY.capped(100)).toBe(
      "This deck already keeps 100 played lists, so this game keeps no list of its own.",
    );
  });

  it("a played snapshot's note is 'Played {date}', read as a calendar date in any time zone", () => {
    expect(JOURNAL_COPY.playedNote("2026-10-10")).toBe("Played Oct 10, 2026");
    expect(JOURNAL_COPY.playedNote("2026-01-01")).toBe("Played Jan 1, 2026");
    expect(playedDateLabel("2026-12-31", false)).toBe("Dec 31");
  });

  it("a recent game's line: date · result · players · seat · version", () => {
    expect(
      JOURNAL_COPY.gameLine({
        playedOn: "2026-10-10",
        result: "win",
        podSize: 4,
        seatPhrase: "went 1st",
        version: 12,
        onePod: false,
      }),
    ).toBe("Oct 10 · Won · 4 players · went 1st · v12");
    // One Piece is always 1v1: no player count; no seat picked, no seat.
    expect(
      JOURNAL_COPY.gameLine({
        playedOn: "2026-10-09",
        result: "loss",
        podSize: 2,
        seatPhrase: null,
        version: null,
        onePod: true,
      }),
    ).toBe("Oct 9 · Lost · no list kept");
  });

  it("the sign-in sentence the guest dialog and the routes share", () => {
    expect(JOURNAL_COPY.signIn).toBe("Sign in to keep a game journal");
  });

  it("Y9b's doors and the opponents' words, in the adapter's noun", () => {
    expect(JOURNAL_COPY.logHeading).toBe("Log a game");
    expect(JOURNAL_COPY.logGameMenu).toBe("Log a game…");
    const commander = getAdapter("mtg").display.leaderNoun;
    const leader = getAdapter("optcg").display.leaderNoun;
    expect(JOURNAL_COPY.opponentsLabel(commander, 3)).toBe("Opponents' commanders");
    expect(JOURNAL_COPY.opponentsLabel(leader, 1)).toBe("Opponent's leader");
    expect(JOURNAL_COPY.opponentBox(commander, 2, 3)).toBe("Opponent 2's commander");
    expect(JOURNAL_COPY.opponentBox(leader, 1, 1)).toBe("Opponent's leader");
    expect(JOURNAL_COPY.secondBox(commander, 1)).toBe("Opponent 1's second commander");
    expect(JOURNAL_COPY.addSecond(commander)).toBe("Add a second commander");
    expect(JOURNAL_COPY.searchLeader(leader)).toBe("Search a leader…");
    expect(JOURNAL_COPY.opponentUnpicked(commander)).toBe(
      "Pick the commander from the list, or clear the box.",
    );
  });
});
