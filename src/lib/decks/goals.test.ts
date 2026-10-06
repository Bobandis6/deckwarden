import { describe, expect, it } from "vitest";

import { card, cardMap, commanderDeck, entry, fillers } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

import {
  CALLS_MAX,
  CALLS_MAX_CHARS,
  EXCEPTIONS_MAX,
  goalsPatchBody,
  goalsSchema,
  normalizeGoals,
  publicGoals,
  readGoals,
  restampAnswers,
  withAnswer,
  withExceptions,
  withTarget,
  type DeckGoals,
} from "./goals";

const mtg = goalsSchema(getAdapter("mtg").brackets);
const optcg = goalsSchema(getAdapter("optcg").brackets);
const ok = (schema: typeof mtg, value: unknown) => schema.safeParse(value).success;

describe("goalsSchema — the range and the keys come off the adapter", () => {
  it("Magic takes a target from 1 to 5, whole numbers only", () => {
    for (const level of [1, 2, 3, 4, 5]) expect(ok(mtg, { v: 1, targetLevel: level })).toBe(true);
    for (const bad of [0, 6, 2.5, "3", null]) {
      expect(ok(mtg, { v: 1, targetLevel: bad })).toBe(false);
    }
  });

  it("One Piece declares no brackets: a target, answers or exceptions answer 400 — a budget passes", () => {
    expect(getAdapter("optcg").brackets).toBeUndefined();
    expect(ok(optcg, { v: 1, targetLevel: 2 })).toBe(false);
    expect(ok(optcg, { v: 1, answers: { rulesetVersion: 1, play: { fast: "no" } } })).toBe(false);
    expect(ok(optcg, { v: 1, exceptions: "Rule zero" })).toBe(false);
    expect(ok(optcg, { v: 1, budget: { perCardUsd: 1 } })).toBe(true);
  });

  it("answers: How it plays by the adapter's keys, calls by question id, Yes / No / Not sure", () => {
    const answers = {
      rulesetVersion: 1,
      play: { theme: "yes", quality: "no", fast: "unsure", cedh: "no" },
      calls: {
        "land-denial:9a8c-0001": "yes",
        "extra-turns:0a1b-02+0c3d-04": "no",
        "combo:618-1537": "unsure",
        "combo:513-5034--46": "yes",
      },
    };
    expect(ok(mtg, { v: 1, answers })).toBe(true);
    expect(ok(mtg, { v: 1, answers: { ...answers, play: { speed: "yes" } } })).toBe(false);
    expect(ok(mtg, { v: 1, answers: { ...answers, play: { theme: "maybe" } } })).toBe(false);
    expect(ok(mtg, { v: 1, answers: { ...answers, calls: { "Combo 1": "yes" } } })).toBe(false);
    expect(ok(mtg, { v: 1, answers: { ...answers, calls: { combo: "yes" } } })).toBe(false);
  });

  it("an answer's rules version is one the rules have reached: 0 (stale) up to the current one", () => {
    const at = (rulesetVersion: unknown) =>
      ok(mtg, { v: 1, answers: { rulesetVersion, play: { fast: "no" } } });
    expect(at(0)).toBe(true);
    expect(at(getAdapter("mtg").brackets!.ruleset.version)).toBe(true);
    expect(at(getAdapter("mtg").brackets!.ruleset.version + 1)).toBe(false);
    expect(at(-1)).toBe(false);
    expect(ok(mtg, { v: 1, answers: { play: { fast: "no" } } })).toBe(false);
  });

  it("a chain of extra turns is asked about by every card in it: a long id passes", () => {
    const thirty = Array.from(
      { length: 30 },
      (_, i) => `${String(i).padStart(8, "0")}-1111-4222-8333-444455556666`,
    ).join("+");
    expect(`extra-turns:${thirty}`.length).toBeGreaterThan(1000);
    expect(
      ok(mtg, { v: 1, answers: { rulesetVersion: 1, calls: { [`extra-turns:${thirty}`]: "no" } } }),
    ).toBe(true);
  });

  it("every question id the read can ask passes — eight chained extra turns, an edge land-denial card, a combo", () => {
    const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
    const commander = card({ name: "Commander", isLeaderCandidate: true, externalKey: uuid(99) });
    const turns = Array.from({ length: 8 }, (_, i) =>
      card({
        name: `Turn ${i}`,
        externalKey: uuid(i),
        attrs: { type_line: "Sorcery", oracle_text: "", extra_turn: true },
      }),
    );
    const edge = card({
      name: "Edge",
      externalKey: uuid(50),
      attrs: { type_line: "Land", oracle_text: "", mld: "edge" },
    });
    const [a, b, c] = ["A", "B", "C"].map((n, i) =>
      card({ name: `Piece ${n}`, externalKey: uuid(60 + i) }),
    );
    const specials = [...turns, edge, a, b, c];
    const fill = fillers(99 - specials.length);
    const at = "2026-10-05T00:00:00.000Z";
    const read = getAdapter("mtg").brackets!.assess({
      deck: commanderDeck(
        [commander],
        [...specials, ...fill].map((x) => entry(x)),
      ),
      cards: cardMap([commander, ...specials, ...fill]),
      combos: [
        {
          key: "2552-3263--17",
          cardPieces: [a.id, b.id, c.id].sort(),
          templates: [],
          tag: "S",
          relevant: false,
          results: ["Infinite mana"],
          popularity: 10,
        },
      ],
      freshness: {
        readAt: at,
        feeds: Object.fromEntries(
          ["gameChangers", "landDenial", "extraTurns", "combos"].map((f) => [
            f,
            { state: "ok", asOf: at },
          ]),
        ),
      },
    });
    const ids = read.review.map((q) => q.id);
    expect(ids.map((id) => id.split(":")[0]).sort()).toEqual([
      "combo",
      "extra-turns",
      "land-denial",
    ]);
    expect(ids.find((id) => id.startsWith("extra-turns:"))!.length).toBeGreaterThan(200);
    const calls = Object.fromEntries(ids.map((id) => [id, "yes"]));
    expect(mtg.safeParse({ v: 1, answers: { rulesetVersion: 1, calls } }).success).toBe(true);
  });

  it(`at most ${CALLS_MAX} stored calls, and ${CALLS_MAX_CHARS} characters of them`, () => {
    const long = (i: number) => `extra-turns:${String(i).padStart(4, "0")}${"a".repeat(1200)}`;
    const big = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [long(i), "no"]));
    expect(JSON.stringify(big).length).toBeGreaterThan(CALLS_MAX_CHARS);
    expect(ok(mtg, { v: 1, answers: { rulesetVersion: 1, calls: big } })).toBe(false);
  });

  it(`at most ${CALLS_MAX} stored calls`, () => {
    const calls = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`combo:${i}`, "no"]));
    expect(ok(mtg, { v: 1, answers: { rulesetVersion: 1, calls: calls(CALLS_MAX) } })).toBe(true);
    expect(ok(mtg, { v: 1, answers: { rulesetVersion: 1, calls: calls(CALLS_MAX + 1) } })).toBe(
      false,
    );
  });

  it(`the exceptions line: trimmed, 1–${EXCEPTIONS_MAX} characters`, () => {
    expect(mtg.parse({ v: 1, exceptions: "  one thematic Game Changer  " })).toEqual({
      v: 1,
      exceptions: "one thematic Game Changer",
    });
    expect(ok(mtg, { v: 1, exceptions: "x".repeat(EXCEPTIONS_MAX) })).toBe(true);
    expect(ok(mtg, { v: 1, exceptions: "x".repeat(EXCEPTIONS_MAX + 1) })).toBe(false);
    expect(ok(mtg, { v: 1, exceptions: "   " })).toBe(false);
  });

  it("the budget: a per-card tier the site offers (≤ $5, ≤ $1) and a positive total", () => {
    expect(ok(mtg, { v: 1, budget: { perCardUsd: 5, totalUsd: 150 } })).toBe(true);
    expect(ok(mtg, { v: 1, budget: { perCardUsd: 1 } })).toBe(true);
    expect(ok(mtg, { v: 1, budget: { perCardUsd: 3 } })).toBe(false);
    expect(ok(mtg, { v: 1, budget: { totalUsd: 0 } })).toBe(false);
    expect(ok(mtg, { v: 1, budget: { totalUsd: 100_001 } })).toBe(false);
    expect(ok(mtg, { v: 1, budget: { currency: "eur" } })).toBe(false);
  });

  it("a version this code doesn't write, or a key it doesn't know, answers 400", () => {
    expect(ok(mtg, { v: 2, targetLevel: 2 })).toBe(false);
    expect(ok(mtg, { targetLevel: 2 })).toBe(false);
    expect(ok(mtg, { v: 1, targetLevel: 2, note: "hi" })).toBe(false);
  });
});

describe("the Why sheet's edits", () => {
  it("withTarget sets and clears; goals with nothing left are null", () => {
    const set = withTarget(null, 2);
    expect(set).toEqual({ v: 1, targetLevel: 2 });
    expect(withTarget(set, 4)).toEqual({ v: 1, targetLevel: 4 });
    expect(withTarget(set, null)).toBeNull();
    expect(withTarget({ v: 1, targetLevel: 2, exceptions: "Ask me" }, null)).toEqual({
      v: 1,
      exceptions: "Ask me",
    });
  });

  it("withAnswer stamps the rules it was given under, keeps the rest, and puts the answer last", () => {
    const stale: DeckGoals = {
      v: 1,
      targetLevel: 3,
      answers: { rulesetVersion: 0, play: { theme: "no" }, calls: { "combo:1": "yes" } },
    };
    const next = withAnswer(stale, "calls", "combo:2", "no", { rulesetVersion: 1 });
    expect(next).toEqual({
      v: 1,
      targetLevel: 3,
      answers: {
        rulesetVersion: 1,
        play: { theme: "no" },
        calls: { "combo:1": "yes", "combo:2": "no" },
      },
    });
    const again = withAnswer(next, "calls", "combo:1", "unsure", { rulesetVersion: 1 });
    expect(Object.keys(again!.answers!.calls!)).toEqual(["combo:2", "combo:1"]);
    expect(withAnswer(null, "play", "fast", "yes", { rulesetVersion: 1 })).toEqual({
      v: 1,
      answers: { rulesetVersion: 1, play: { fast: "yes" } },
    });
  });

  it(`past ${CALLS_MAX} answers the first off-screen ones go — never one on screen`, () => {
    const calls = Object.fromEntries(
      Array.from({ length: CALLS_MAX }, (_, i) => [`combo:${i}`, "no" as const]),
    );
    const full: DeckGoals = { v: 1, answers: { rulesetVersion: 1, calls } };
    const next = withAnswer(full, "calls", "combo:new", "yes", {
      rulesetVersion: 1,
      live: ["combo:0", "combo:new"],
    });
    const keys = Object.keys(next!.answers!.calls!);
    expect(keys).toHaveLength(CALLS_MAX);
    expect(keys).toContain("combo:0");
    expect(keys).not.toContain("combo:1");
    expect(keys.at(-1)).toBe("combo:new");
  });

  it(`past ${CALLS_MAX_CHARS} characters the first off-screen answers go too — the stored map always fits the route`, () => {
    const long = (i: number) => `extra-turns:${String(i).padStart(4, "0")}${"a".repeat(1200)}`;
    let goals: DeckGoals | null = null;
    for (let i = 0; i < 12; i++) {
      goals = withAnswer(goals, "calls", long(i), "no", { rulesetVersion: 1, live: [long(i)] });
    }
    const calls = goals!.answers!.calls!;
    expect(JSON.stringify(calls).length).toBeLessThanOrEqual(CALLS_MAX_CHARS);
    expect(Object.keys(calls).at(-1)).toBe(long(11));
    expect(Object.keys(calls)).not.toContain(long(0));
    expect(mtg.safeParse(goals).success).toBe(true);
  });

  it("restampAnswers keeps every answer under the current rules; no answers, no change", () => {
    const stale: DeckGoals = { v: 1, answers: { rulesetVersion: 0, play: { cedh: "no" } } };
    expect(restampAnswers(stale, 1)).toEqual({
      v: 1,
      answers: { rulesetVersion: 1, play: { cedh: "no" } },
    });
    expect(restampAnswers({ v: 1, targetLevel: 2 }, 1)).toEqual({ v: 1, targetLevel: 2 });
    expect(restampAnswers(null, 1)).toBeNull();
  });

  it("withExceptions stores the trimmed line; an empty line is none", () => {
    expect(withExceptions(null, "  ask me first ")).toEqual({ v: 1, exceptions: "ask me first" });
    expect(withExceptions({ v: 1, targetLevel: 2, exceptions: "x" }, "   ")).toEqual({
      v: 1,
      targetLevel: 2,
    });
    expect(withExceptions(null, "")).toBeNull();
    expect(withExceptions(null, "y".repeat(300))!.exceptions).toHaveLength(EXCEPTIONS_MAX);
  });

  it("normalizeGoals drops empty maps and an empty budget", () => {
    expect(
      normalizeGoals({ v: 1, budget: {}, answers: { rulesetVersion: 1, play: {}, calls: {} } }),
    ).toBeNull();
    expect(normalizeGoals({ v: 1, targetLevel: 1, answers: { rulesetVersion: 1 } })).toEqual({
      v: 1,
      targetLevel: 1,
    });
  });
});

describe("what leaves the server", () => {
  it("publicGoals: the target and the exceptions, nothing else", () => {
    expect(
      publicGoals({
        v: 1,
        targetLevel: 3,
        exceptions: "Ask me",
        budget: { totalUsd: 200 },
        answers: { rulesetVersion: 1, play: { fast: "yes" } },
      }),
    ).toEqual({ v: 1, targetLevel: 3, exceptions: "Ask me" });
    expect(publicGoals({ v: 1, budget: { perCardUsd: 1 } })).toBeNull();
    expect(publicGoals(null)).toBeNull();
  });

  it("readGoals: only this version's shape", () => {
    expect(readGoals({ v: 1, targetLevel: 2 })).toEqual({ v: 1, targetLevel: 2 });
    expect(readGoals({ v: 2 })).toBeNull();
    expect(readGoals("goals")).toBeNull();
    expect(readGoals(null)).toBeNull();
  });

  it("goalsPatchBody is the PATCH body and the dirty check: {goals}, normalized, keys sorted", () => {
    expect(goalsPatchBody({ v: 1, targetLevel: 2 })).toBe('{"goals":{"targetLevel":2,"v":1}}');
    expect(goalsPatchBody(null)).toBe('{"goals":null}');
    expect(goalsPatchBody({ v: 1, answers: { rulesetVersion: 1, play: {} } })).toBe(
      '{"goals":null}',
    );
  });

  it("goals read back in jsonb's key order compare equal to the same goals built in place", () => {
    const built = withAnswer(
      withAnswer(withTarget(null, 2), "play", "theme", "no", { rulesetVersion: 1 }),
      "play",
      "fast",
      "yes",
      { rulesetVersion: 1 },
    );
    // What Postgres hands back: keys shortest first, then by bytes, at every depth.
    const fromJsonb = readGoals(
      JSON.parse(
        '{"v": 1, "answers": {"play": {"fast": "yes", "theme": "no"}, "rulesetVersion": 1}, "targetLevel": 2}',
      ),
    );
    expect(goalsPatchBody(fromJsonb)).toBe(goalsPatchBody(built));
  });
});
