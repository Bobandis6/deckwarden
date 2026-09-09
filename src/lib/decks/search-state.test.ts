/**
 * The search state machine (R3, C5). Pins the two fixed bugs — no "empty"
 * before a response, notices clear on input — plus the stale-response guard,
 * wrap-around selection, retry, and the add/clear resets.
 */
import { describe, expect, it } from "vitest";

import { card } from "@/lib/games/mtg/test-fixtures";
import type { EditorCard } from "./editor-state";
import {
  INITIAL_SEARCH_STATE,
  searchReducer,
  type SearchAction,
  type SearchState,
} from "./search-state";

const sol: EditorCard = { ...card({ name: "Sol Ring" }), image: null };
const signet: EditorCard = { ...card({ name: "Arcane Signet" }), image: null };

function run(...actions: SearchAction[]): SearchState {
  return actions.reduce(searchReducer, INITIAL_SEARCH_STATE);
}

describe("searchReducer", () => {
  it("idle → typing on input, with the quantity prefix parsed off the query", () => {
    const s = run({ type: "input", raw: "4 Sol Ring" });
    expect(s.status).toBe("typing");
    expect(s.query).toBe("Sol Ring");
    expect(s.qty).toBe(4);
    expect(s.requestId).toBe(1);
  });

  it("typing → searching → results, and never `empty` before a response", () => {
    const typing = run({ type: "input", raw: "sol" });
    expect(typing.results).toEqual([]);
    expect(typing.status).not.toBe("empty");
    const searching = searchReducer(typing, { type: "request" });
    expect(searching.status).toBe("searching");
    const results = searchReducer(searching, { type: "response", id: 1, results: [sol, signet] });
    expect(results.status).toBe("results");
    expect(results.results).toHaveLength(2);
    expect(results.sel).toBe(0);
  });

  it("an empty response is the only way into `empty`", () => {
    const s = run(
      { type: "input", raw: "zzz" },
      { type: "request" },
      { type: "response", id: 1, results: [] },
    );
    expect(s.status).toBe("empty");
  });

  it("a stale response never wins", () => {
    const s = run(
      { type: "input", raw: "sol" },
      { type: "request" },
      { type: "input", raw: "sig" },
      { type: "request" },
      { type: "response", id: 1, results: [sol] },
    );
    expect(s.status).toBe("searching");
    expect(s.results).toEqual([]);
    const settled = searchReducer(s, { type: "response", id: 2, results: [signet] });
    expect(settled.results).toEqual([signet]);
  });

  it("a new query keeps the old results on screen until the response lands, but drops its verdict", () => {
    const empty = run(
      { type: "input", raw: "zzz" },
      { type: "request" },
      { type: "response", id: 1, results: [] },
    );
    const retyped = searchReducer(empty, { type: "input", raw: "sol" });
    expect(retyped.status).toBe("typing");
    const had = run(
      { type: "input", raw: "sol" },
      { type: "request" },
      { type: "response", id: 1, results: [sol] },
    );
    expect(searchReducer(had, { type: "input", raw: "sig" }).results).toEqual([sol]);
  });

  it("only the quantity prefix changing sends no new request", () => {
    const a = run({ type: "input", raw: "4 Sol Ring" }, { type: "request" });
    const b = searchReducer(a, { type: "input", raw: "5 Sol Ring" });
    expect(b.requestId).toBe(a.requestId);
    expect(b.status).toBe("searching");
    expect(b.qty).toBe(5);
  });

  it("failure → failed (results cleared); retry re-arms the same query under a new token", () => {
    const failed = run(
      { type: "input", raw: "sol" },
      { type: "request" },
      { type: "failure", id: 1 },
    );
    expect(failed.status).toBe("failed");
    expect(failed.results).toEqual([]);
    expect(searchReducer(failed, { type: "failure", id: 0 })).toBe(failed);
    const retried = searchReducer(failed, { type: "retry" });
    expect(retried.status).toBe("typing");
    expect(retried.query).toBe("sol");
    expect(retried.requestId).toBe(2);
    // retry is inert outside `failed`
    expect(searchReducer(retried, { type: "retry" })).toBe(retried);
  });

  it("notices clear on the next input and on add, and survive clear", () => {
    const noticed = run(
      { type: "input", raw: "sol" },
      { type: "notice", notice: { text: "Commander is full (max 2 cards)", tone: "err" } },
    );
    expect(noticed.notice?.text).toContain("full");
    expect(searchReducer(noticed, { type: "input", raw: "sol r" }).notice).toBeNull();
    expect(searchReducer(noticed, { type: "added" }).notice).toBeNull();
    expect(searchReducer(noticed, { type: "clear" }).notice?.text).toContain("full");
  });

  it("move wraps in both directions and select clamps", () => {
    const s = run(
      { type: "input", raw: "s" },
      { type: "request" },
      { type: "response", id: 1, results: [sol, signet] },
    );
    expect(searchReducer(s, { type: "move", delta: 1 }).sel).toBe(1);
    expect(searchReducer(s, { type: "move", delta: -1 }).sel).toBe(1);
    expect(
      searchReducer(searchReducer(s, { type: "move", delta: 1 }), { type: "move", delta: 1 }).sel,
    ).toBe(0);
    expect(searchReducer(s, { type: "select", index: 1 }).sel).toBe(1);
    expect(searchReducer(s, { type: "select", index: 7 })).toBe(s);
    expect(searchReducer(INITIAL_SEARCH_STATE, { type: "move", delta: 1 })).toBe(
      INITIAL_SEARCH_STATE,
    );
  });

  it("added and clear reset to idle with the input emptied and in-flight responses orphaned", () => {
    const s = run(
      { type: "input", raw: "4 sol" },
      { type: "request" },
      { type: "response", id: 1, results: [sol] },
    );
    const added = searchReducer(s, { type: "added" });
    expect(added).toMatchObject({
      status: "idle",
      raw: "",
      query: "",
      qty: 1,
      results: [],
      sel: 0,
    });
    expect(searchReducer(added, { type: "response", id: 1, results: [sol] })).toBe(added);
    const cleared = searchReducer(s, { type: "clear" });
    expect(cleared.status).toBe("idle");
    expect(cleared.raw).toBe("");
  });

  it("emptying the input returns to idle and drops the pending request", () => {
    const s = run({ type: "input", raw: "sol" }, { type: "request" }, { type: "input", raw: "  " });
    expect(s.status).toBe("idle");
    expect(searchReducer(s, { type: "response", id: 1, results: [sol] })).toBe(s);
    expect(searchReducer(s, { type: "request" })).toBe(s);
  });
});
