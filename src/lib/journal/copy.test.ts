/**
 * Y9a — D0's copy guard over the journal's words: none says "approve"
 * (the Warden's word stays legality-only), every builder is read, and the
 * lines the dialog and the toast print are pinned.
 */
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";

import { JOURNAL_COPY, playedDateLabel } from "./copy";

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
    else out.push((value as (n: number) => string)(100));
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
});
