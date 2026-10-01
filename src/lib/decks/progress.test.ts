/**
 * Y2a (WAVE4 D2): the one owner of an unfinished deck's words — both games
 * through their FormatDefs, and nothing over the maximum (over is a problem).
 */
import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { getAdapter } from "@/lib/games/registry";
import type { EditorEntry } from "./editor-state";
import { deckProgress, isProgressIssue, progressLine, toGoPhrase } from "./progress";

const STANDARD = getAdapter("optcg").formats[0];
const e = (cardId: string, zone: string, qty = 1): EditorEntry => ({ cardId, zone, qty, tags: [] });
const mains = (n: number, qty = 1) => Array.from({ length: n }, (_, i) => e(`c${i}`, "main", qty));

describe("progress (Y2a)", () => {
  it("an empty Commander deck: Choose a commander · 100 to go", () => {
    expect(progressLine(deckProgress([], COMMANDER), "Commander")).toBe(
      "Choose a commander · 100 to go",
    );
  });

  it("the commander counts toward 100; a full main without one only asks for the commander", () => {
    expect(
      progressLine(deckProgress([e("a", "commander"), ...mains(97)], COMMANDER), "Commander"),
    ).toBe("2 to go");
    expect(progressLine(deckProgress(mains(100), COMMANDER), "Commander")).toBe(
      "Choose a commander",
    );
  });

  it("at or over the size there is nothing to say (over is a problem, not progress)", () => {
    expect(
      progressLine(deckProgress([e("a", "commander"), ...mains(99)], COMMANDER), "Commander"),
    ).toBeNull();
    expect(
      progressLine(deckProgress([e("a", "commander"), ...mains(105)], COMMANDER), "Commander"),
    ).toBeNull();
    expect(toGoPhrase(0)).toBeNull();
    expect(toGoPhrase(-3)).toBeNull();
    expect(toGoPhrase(2)).toBe("2 to go");
  });

  it("One Piece: the Leader sits outside the 50", () => {
    expect(progressLine(deckProgress([], STANDARD), "Leader")).toBe("Choose a leader · 50 to go");
    expect(
      progressLine(deckProgress([e("l", "leader"), ...mains(10, 4)], STANDARD), "Leader"),
    ).toBe("10 to go");
  });

  it("isProgressIssue reads the adapter's flag only", () => {
    expect(
      isProgressIssue({ code: "DECK_SIZE", severity: "error", message: "", progress: true }),
    ).toBe(true);
    expect(isProgressIssue({ code: "DECK_SIZE", severity: "error", message: "" })).toBe(false);
  });
});
