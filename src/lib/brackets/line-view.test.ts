/**
 * Y4a — which line the deck pane shows, in order (WAVE4 D5): blocked, the
 * facts failed, a draft, the facts on their way, then the read with "Why?".
 */
import { describe, expect, it } from "vitest";

import type { BracketFactor, BracketLineContext, BracketRead } from "@/lib/games/types";

import type { BracketFactsState } from "./facts";
import { bracketLineView } from "./line-view";

const brackets = { line: (r: BracketRead) => `adapter line (${r.status})` };
const ctx = {
  deck: { gameId: "mtg", formatCode: "commander", zones: {} },
  cards: new Map(),
  progress: null,
} as BracketLineContext;

const finding: BracketFactor = {
  id: "game-changers",
  sentence: "1 Game Changer: Rhystic Study.",
  cards: ["x"],
  source: "Wizards",
  atLeast: 3,
  change: null,
};
const gap: BracketFactor = { ...finding, id: "unchecked:combos", atLeast: null };

function read(status: BracketRead["status"], factors: BracketFactor[] = []): BracketRead {
  return {
    status,
    minimum: 1,
    suggested: null,
    factors,
    assumptions: [],
    review: [],
    blockedBy: [],
    conflicts: [],
    ruleset: { version: 1, asOf: "2026-02-09" },
    answersStale: false,
  };
}

const view = (r: BracketRead, facts: BracketFactsState) => bracketLineView(brackets, r, ctx, facts);

describe("bracketLineView", () => {
  it("blocked comes first and offers nothing — the problem list already names the card", () => {
    for (const facts of ["ready", "checking", "failed", "over"] as const) {
      expect(view(read("blocked", [finding]), facts)).toEqual({
        text: "adapter line (blocked)",
        action: null,
      });
    }
  });

  it("the facts failed: D5's failure line with Retry, drafts included", () => {
    for (const status of ["read", "review", "unavailable", "draft"] as const) {
      expect(view(read(status), "failed")).toEqual({
        text: "Couldn't check combos",
        action: "retry",
      });
    }
  });

  it("a draft speaks at once; Why? waits for the facts and for something to explain", () => {
    expect(view(read("draft", [finding]), "checking")).toEqual({
      text: "adapter line (draft)",
      action: null,
    });
    expect(view(read("draft", [finding]), "ready").action).toBe("why");
    expect(view(read("draft", [finding]), "over").action).toBe("why");
    expect(view(read("draft"), "ready").action).toBeNull();
    // A gap alone is nothing to explain in a draft.
    expect(view(read("draft", [gap]), "ready").action).toBeNull();
    const asked = { ...read("draft"), review: [{ id: "q" } as BracketRead["review"][number]] };
    expect(view(asked, "ready").action).toBe("why");
  });

  it("checking: D5's loading line, text only — a read that may be out of date says so", () => {
    for (const status of ["read", "review", "unavailable"] as const) {
      expect(view(read(status), "checking")).toEqual({ text: "Checking combos…", action: null });
    }
  });

  it("otherwise the adapter's line and Why? — 'over' too (its read says what it couldn't check)", () => {
    for (const status of ["read", "review", "unavailable"] as const) {
      for (const facts of ["ready", "over"] as const) {
        expect(view(read(status), facts)).toEqual({
          text: `adapter line (${status})`,
          action: "why",
        });
      }
    }
  });
});
