/**
 * Y9a — what a logged game may say (WAVE4 D10): the adapters' journal
 * declarations (Magic: pods of 2–8, a bracket 1–5, seats in turn order,
 * partner pairs; One Piece: 1v1, went first or second, no table level) and
 * core's checks over them, plus the routes' zod bodies.
 */
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";

import {
  journalIssue,
  LOG_BODY,
  parseGameParam,
  PATCH_BODY,
  playedOnTooLate,
  utcDay,
  type GameFields,
} from "./check";

const mtg = getAdapter("mtg").journal!;
const optcg = getAdapter("optcg").journal!;
const ORACLE = "0b5a4f8e-1111-4222-8333-944445555666";

const game = (over: Partial<GameFields> = {}): GameFields => ({
  playedOn: "2026-10-10",
  podSize: 4,
  result: "win",
  endTurn: null,
  tableLevel: null,
  seat: null,
  opponents: null,
  notes: null,
  ...over,
});

describe("the adapters' journal declarations", () => {
  it("Magic: pods of 2–8 (4 first), the bracket 1–5, seats 1st…Nth, two leaders an opponent", () => {
    expect(mtg.pod).toEqual({ min: 2, max: 8, default: 4 });
    expect(mtg.tableLevel?.noun).toBe("bracket");
    expect(mtg.tableLevel?.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(mtg.seats(4)).toEqual([
      { seat: 1, label: "1st", phrase: "went 1st" },
      { seat: 2, label: "2nd", phrase: "went 2nd" },
      { seat: 3, label: "3rd", phrase: "went 3rd" },
      { seat: 4, label: "4th", phrase: "went 4th" },
    ]);
    expect(mtg.seats(8).map((s) => s.label)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "5th",
      "6th",
      "7th",
      "8th",
    ]);
    expect(mtg.opponentLeaders).toBe(2);
  });

  it("One Piece: 1v1, went first or second, no table level, one leader an opponent", () => {
    expect(optcg.pod).toEqual({ min: 2, max: 2, default: 2 });
    expect(optcg.tableLevel).toBeUndefined();
    expect(optcg.seats(2)).toEqual([
      { seat: 1, label: "Went first", phrase: "went first" },
      { seat: 2, label: "Went second", phrase: "went second" },
    ]);
    expect(optcg.opponentLeaders).toBe(1);
  });
});

describe("journalIssue — the adapter's checks over a whole game", () => {
  it("passes every game the declarations offer", () => {
    for (let pod = 2; pod <= 8; pod++) {
      for (const { seat } of mtg.seats(pod)) {
        expect(journalIssue(mtg, game({ podSize: pod, seat, tableLevel: 3 }))).toBeNull();
      }
    }
    expect(journalIssue(optcg, game({ podSize: 2, seat: 2 }))).toBeNull();
  });

  it("the pod's range — a One Piece game is 1v1", () => {
    expect(journalIssue(mtg, game({ podSize: 1 }))).toBe("A game here has 2–8 players");
    expect(journalIssue(mtg, game({ podSize: 9 }))).toBe("A game here has 2–8 players");
    expect(journalIssue(optcg, game({ podSize: 4 }))).toBe("A game here has 2 players");
  });

  it("a seat inside the table", () => {
    expect(journalIssue(mtg, game({ podSize: 3, seat: 4 }))).toBe("Seat must be 1–3");
    expect(journalIssue(optcg, game({ podSize: 2, seat: 3 }))).toBe("Seat must be 1–2");
  });

  it("a table level only where declared, and inside its levels", () => {
    expect(journalIssue(optcg, game({ podSize: 2, tableLevel: 3 }))).toBe(
      "This game has no table level",
    );
    expect(journalIssue(mtg, game({ tableLevel: 6 }))).toBe("The bracket must be 1–5");
    expect(journalIssue(mtg, game({ tableLevel: 0 }))).toBe("The bracket must be 1–5");
  });

  it("opponents: at most pod − 1, and the game's leader count each", () => {
    expect(journalIssue(mtg, game({ opponents: [[ORACLE], [ORACLE, ORACLE]] }))).toBeNull();
    expect(journalIssue(mtg, game({ podSize: 2, opponents: [[ORACLE], [ORACLE]] }))).toBe(
      "At most 1 opponent at a 2-player table",
    );
    expect(journalIssue(mtg, game({ opponents: [[ORACLE, ORACLE, ORACLE]] }))).toBe(
      "An opponent names at most 2 leaders",
    );
    expect(journalIssue(optcg, game({ podSize: 2, opponents: [["OP15-058", "OP01-001"]] }))).toBe(
      "An opponent names one leader",
    );
    expect(journalIssue(optcg, game({ podSize: 2, opponents: [["OP15-058"]] }))).toBeNull();
  });
});

describe("the routes' bodies", () => {
  it("POST needs a result and a pod size; the rest is optional and strict", () => {
    expect(LOG_BODY.safeParse({ result: "win", podSize: 4 }).success).toBe(true);
    expect(LOG_BODY.safeParse({ result: "won", podSize: 4 }).success).toBe(false);
    expect(LOG_BODY.safeParse({ podSize: 4 }).success).toBe(false);
    expect(LOG_BODY.safeParse({ result: "win", podSize: 4, life: 40 }).success).toBe(false);
    expect(LOG_BODY.safeParse({ result: "win", podSize: 4.5 }).success).toBe(false);
  });

  it("a played date is a real calendar date, not before 1993", () => {
    const ok = (playedOn: string) =>
      LOG_BODY.safeParse({ result: "win", podSize: 4, playedOn }).success;
    expect(ok("2026-10-10")).toBe(true);
    expect(ok("2024-02-29")).toBe(true);
    expect(ok("2026-02-30")).toBe(false);
    expect(ok("2026-13-01")).toBe(false);
    expect(ok("10/10/2026")).toBe(false);
    expect(ok("1992-12-31")).toBe(false);
  });

  it("notes trim to null when blank; at most 500 characters", () => {
    expect(LOG_BODY.parse({ result: "win", podSize: 4, notes: "   " }).notes).toBeNull();
    expect(LOG_BODY.parse({ result: "win", podSize: 4, notes: " gg " }).notes).toBe("gg");
    expect(LOG_BODY.safeParse({ result: "win", podSize: 4, notes: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("opponent keys are external keys — a uuid or a printed id, never a name", () => {
    const ok = (opponents: unknown) =>
      LOG_BODY.safeParse({ result: "win", podSize: 4, opponents }).success;
    expect(ok([[ORACLE], ["OP15-058"]])).toBe(true);
    expect(ok([["Atraxa, Praetors' Voice"]])).toBe(false);
    expect(ok([[]])).toBe(false);
  });

  it("PATCH changes at least one field and never the version or the list", () => {
    expect(PATCH_BODY.safeParse({ result: "loss" }).success).toBe(true);
    expect(PATCH_BODY.safeParse({}).success).toBe(false);
    expect(PATCH_BODY.safeParse({ version: 3 }).success).toBe(false);
    expect(PATCH_BODY.safeParse({ listHash: "h1:00" }).success).toBe(false);
    expect(PATCH_BODY.safeParse({ endTurn: null }).success).toBe(true);
  });

  it("a game id is a plain positive integer", () => {
    expect(parseGameParam("17")).toBe(17);
    expect(parseGameParam("0")).toBeNull();
    expect(parseGameParam("017")).toBeNull();
    expect(parseGameParam("1e3")).toBeNull();
    expect(parseGameParam("99999999999999999")).toBeNull();
  });

  it("dates run one day past the server's UTC today, for players east of UTC", () => {
    const now = new Date("2026-10-10T23:30:00Z");
    expect(utcDay(now)).toBe("2026-10-10");
    expect(playedOnTooLate("2026-10-11", now)).toBe(false);
    expect(playedOnTooLate("2026-10-12", now)).toBe(true);
  });
});
