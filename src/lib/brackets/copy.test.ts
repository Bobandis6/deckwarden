/**
 * Y4a — D0's copy guard over core's bracket words (the line's and the Why
 * sheet's own strings; the adapter's lines are guarded beside them in
 * src/lib/games/mtg/bracket-line.test.ts, the read's sentences in
 * brackets.test.ts): none says "approve" — the Warden's word stays
 * legality-only — and none names a Commander Spellbook tag.
 */
import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/games/registry";

import { BRACKET_COPY, dateLabel, declaredLabel, levelLabel } from "./copy";

/** The table's word-builders — the guard calls each one (a new one must join it here). */
const BUILDERS = [
  "sheetTitle",
  "nothingFound",
  "ifYes",
  "pieces",
  "rules",
  "combosCredit",
  "aboveTargetLead",
  "answered",
  "checked",
];

/** Every string the table can produce, its builders called with real inputs. */
function everyString(): string[] {
  const mtg = getAdapter("mtg").brackets!;
  const C = BRACKET_COPY;
  return [
    ...Object.values(C).flatMap((v) => (typeof v === "string" ? [v] : [])),
    C.sheetTitle(mtg.noun),
    C.nothingFound(mtg.noun),
    ...mtg.levels.map((l) => C.ifYes(levelLabel(mtg, l.level))),
    C.pieces(1),
    C.pieces(2),
    C.rules(mtg.links.rules.label, dateLabel(mtg.ruleset.asOf)),
    C.combosCredit(getAdapter("mtg").capabilities.combos!.sourceLabel),
    ...mtg.levels.map((l) => C.aboveTargetLead(levelLabel(mtg, l.level))),
    C.answered(1),
    C.answered(4),
    // The adapter's words the Y4b blocks render beside core's.
    mtg.exceptionsHint,
    ...mtg.questions.map((q) => q.question),
    // Y5: the share page's words — the declared chip, the checked date, and
    // the adapter's table labels, answers and closing note.
    ...mtg.levels.map((l) => declaredLabel(mtg, l.level)),
    C.checked(dateLabel("2026-10-05T12:00:00.000Z")),
    ...mtg.questions.flatMap((q) => (q.table ? [q.table.label, q.table.yes, q.table.no] : [])),
    mtg.tableNote,
  ];
}

describe("BRACKET_COPY — D5's own lines and the sheet's words", () => {
  it("D5's loading and failure lines, word for word", () => {
    expect(BRACKET_COPY.checking).toBe("Checking combos…");
    expect(BRACKET_COPY.failed).toBe("Couldn't check combos");
    expect(BRACKET_COPY.retry).toBe("Retry");
    expect(BRACKET_COPY.why).toBe("Why?");
  });

  it("the sheet's two blocks, by D5's names", () => {
    expect(BRACKET_COPY.cardsShow).toBe("What the cards show");
    expect(BRACKET_COPY.readAssumes).toBe("What this read assumes");
    expect(BRACKET_COPY.sheetTitle("bracket")).toBe("Why this bracket?");
  });

  it("Y4b's blocks, by D5's names and words", () => {
    const mtg = getAdapter("mtg").brackets!;
    expect(BRACKET_COPY.yourTarget).toBe("Your target");
    expect(BRACKET_COPY.notSet).toBe("Not set");
    expect(BRACKET_COPY.howItPlays).toBe("How it plays");
    expect([BRACKET_COPY.yes, BRACKET_COPY.no, BRACKET_COPY.unsure]).toEqual([
      "Yes",
      "No",
      "Not sure",
    ]);
    expect(BRACKET_COPY.rulesChanged).toBe("Rules changed since you answered");
    expect(BRACKET_COPY.shownOnSharePage).toBe("Shown on your share page.");
    expect(BRACKET_COPY.exceptions).toBe("Table exceptions");
    expect(mtg.exceptionsHint).toBe("e.g. one thematic Game Changer, ask me");
    expect(BRACKET_COPY.aboveTargetLead(levelLabel(mtg, 2))).toBe(
      "Your target is Bracket 2 (Core). These put the deck above it:",
    );
    expect(mtg.questions.map((q) => q.question)).toEqual([
      "Theme first, over power?",
      "Staples and high card quality?",
      "Can it usually win or lock the table before turn 6?",
      "Tuned for the cEDH metagame?",
    ]);
  });

  it("Y5's words: At the table, Copy for the table, the owner's lines, declared and checked", () => {
    const mtg = getAdapter("mtg").brackets!;
    expect(BRACKET_COPY.atTheTable).toBe("At the table");
    expect(BRACKET_COPY.copyForTable).toBe("Copy for the table");
    expect(BRACKET_COPY.exceptionsOwner).toBe("Exceptions (owner)");
    expect(BRACKET_COPY.planOwner).toBe("Plan (owner)");
    expect(BRACKET_COPY.ownersCall).toBe("Owner's call");
    expect(BRACKET_COPY.checked("Sep 30, 2026")).toBe("checked Sep 30, 2026");
    expect(declaredLabel(mtg, 3)).toBe("Bracket 3 (declared)");
  });

  it("levels in plain words, dates pinned to UTC", () => {
    const mtg = getAdapter("mtg").brackets!;
    expect(levelLabel(mtg, 4)).toBe("Bracket 4 (Optimized)");
    expect(BRACKET_COPY.ifYes(levelLabel(mtg, 4))).toBe(
      "If yes, it's at least Bracket 4 (Optimized).",
    );
    expect(levelLabel(mtg, 9)).toBe("Bracket 9");
    expect(dateLabel("2026-02-09")).toBe("Feb 9, 2026");
    expect(dateLabel("2026-10-04T23:59:59.000Z")).toBe("Oct 4, 2026");
    expect(dateLabel("not a date")).toBe("not a date");
    // Y5: text built in the browser may say the viewer's own date.
    expect(dateLabel("2026-10-10T02:12:00.000Z", "America/Chicago")).toBe("Oct 9, 2026");
    expect(BRACKET_COPY.rules("Wizards' Commander Brackets", "Feb 9, 2026")).toBe(
      "Wizards' Commander Brackets, as of Feb 9, 2026",
    );
  });
});

describe("copy guard (WAVE4 D0)", () => {
  it("reads every string the table has — each plain string and each builder", () => {
    const builders = Object.entries(BRACKET_COPY)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    expect(builders.sort()).toEqual([...BUILDERS].sort());
    expect(everyString().length).toBeGreaterThanOrEqual(Object.keys(BRACKET_COPY).length);
  });

  it("no bracket string says approve — the Warden's word is legality-only", () => {
    expect(everyString().filter((s) => /approv/i.test(s))).toEqual([]);
  });

  it("Spellbook's tag names never appear — bracket numbers lead", () => {
    expect(
      everyString().filter((s) =>
        /ruthless|spicy|powerful|oddball|precon appropriate|casual/i.test(s),
      ),
    ).toEqual([]);
  });
});
