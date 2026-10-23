/**
 * Y4a — D0's copy guard over core's bracket words (the line's and the Why
 * sheet's own strings; the adapter's lines are guarded beside them in
 * src/lib/games/mtg/bracket-line.test.ts, the read's sentences in
 * brackets.test.ts): none says "approve" — the Warden's word stays
 * legality-only — and none names a Commander Spellbook tag.
 */
import { describe, expect, it } from "vitest";

import {
  atraxa,
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
} from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketSpeedFacts } from "@/lib/games/types";

import { budgetLabel } from "@/components/deck/goals-line";

import { BRACKET_COPY, dateLabel, declaredLabel, goalsParts, levelLabel } from "./copy";

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
  "noTarget",
  "hiddenByGoals",
  "speedNote",
];

/**
 * BRACKET-SPEED: the adapter's facts for two lists — a precon's shape (36
 * lands, nothing fast) and a cEDH shape (26 lands, six rocks at 1, a
 * tutor), so the guard reads the rows, the line and the nudge.
 */
function speedFacts(): BracketSpeedFacts[] {
  const speed = getAdapter("mtg").brackets!.speed!;
  const rock = (i: number) =>
    card({
      name: `Mox ${i}`,
      costValue: 1,
      attrs: { type_line: "Artifact", oracle_text: "", roles: ["mana-rock"] },
    });
  const tutor = card({
    name: "Demonic Tutor",
    attrs: { type_line: "Sorcery", oracle_text: "", roles: ["tutor"] },
  });
  const lists = [
    [...basicLands(36), ...fillers(63)],
    [...basicLands(26), ...[1, 2, 3, 4, 5, 6].map(rock), tutor, ...fillers(66)],
  ];
  return lists.map((main) => {
    const deck = commanderDeck(
      [atraxa],
      main.map((c) => entry(c)),
    );
    return speed.facts(deck, cardMap([atraxa, ...main]))!;
  });
}

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
    // BRACKETS-PAGE: What this read assumes links the site's guide by the adapter's label.
    mtg.links.guide!.label,
    ...mtg.questions.map((q) => q.question),
    // Y5: the share page's words — the declared chip, the checked date, and
    // the adapter's table labels, answers and closing note.
    ...mtg.levels.map((l) => declaredLabel(mtg, l.level)),
    C.checked(dateLabel("2026-10-05T12:00:00.000Z")),
    ...mtg.questions.flatMap((q) => (q.table ? [q.table.label, q.table.yes, q.table.no] : [])),
    mtg.tableNote,
    // Y6a: the goals line and the hidden count (the impact lines are
    // guarded in bracket-impact.test.ts).
    C.noTarget(mtg.noun),
    C.hiddenByGoals(1),
    C.hiddenByGoals(12),
    ...mtg.levels.flatMap((l) =>
      goalsParts(mtg, { targetLevel: l.level, budget: { perCardUsd: 5 } }, budgetLabel),
    ),
    // BRACKET-SPEED: the block's sentence, the table's label, and the
    // adapter's rows, line and nudge for a precon shape and a cEDH shape.
    C.speedNote(mtg.noun),
    mtg.speed!.label,
    ...speedFacts().flatMap((f) => [
      f.line,
      ...(f.nudge ? [f.nudge] : []),
      ...f.rows.flatMap((r) => [r.label, r.value, ...(r.meaning ? [r.meaning] : [])]),
    ]),
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

describe("Y6a's words — the goals line and the hidden count", () => {
  const mtg = getAdapter("mtg").brackets!;

  it("the goals line's parts: the target in the level's own words, then the budget's label; none when neither is set", () => {
    expect(goalsParts(mtg, { targetLevel: 2, budget: { perCardUsd: 5 } }, budgetLabel)).toEqual([
      "Bracket 2 (Core)",
      "≤ $5 a card",
    ]);
    expect(goalsParts(mtg, { budget: { perCardUsd: 1 } }, budgetLabel)).toEqual(["≤ $1 a card"]);
    expect(goalsParts(mtg, { v: 1 } as never, budgetLabel)).toEqual([]);
    expect(goalsParts(mtg, null, budgetLabel)).toEqual([]);
    // A game without brackets never says a level.
    expect(
      goalsParts(undefined, { targetLevel: 2, budget: { perCardUsd: 5 } }, budgetLabel),
    ).toEqual(["≤ $5 a card"]);
  });

  it("Y8: the total's phrase comes last, built by the caller — never without its builder", () => {
    const goals = { targetLevel: 3, budget: { perCardUsd: 5, totalUsd: 150 } };
    expect(goalsParts(mtg, goals, budgetLabel, (t) => `est. $212 of your $${t}`)).toEqual([
      "Bracket 3 (Upgraded)",
      "≤ $5 a card",
      "est. $212 of your $150",
    ]);
    // The bracket table's guard never sees a price: without the builder, no total.
    expect(goalsParts(mtg, goals, budgetLabel)).toEqual(["Bracket 3 (Upgraded)", "≤ $5 a card"]);
    expect(
      goalsParts(undefined, { budget: { totalUsd: 90 } }, budgetLabel, (t) => `$${t} total`),
    ).toEqual(["$90 total"]);
  });

  it("D7's words without notation", () => {
    expect(BRACKET_COPY.goalsLead).toBe("Your goals:");
    expect(BRACKET_COPY.noTarget("bracket")).toBe("No bracket target yet");
    expect(BRACKET_COPY.hiddenByGoals(3)).toBe("3 hidden by your goals");
    expect(BRACKET_COPY.saveBudget).toBe("Save as this deck's budget");
  });
});

describe("BRACKET-SPEED's words — the block's heading and its sentence", () => {
  it("the heading, and the sentence agreeing with the read's assumption line", () => {
    const mtg = getAdapter("mtg").brackets!;
    expect(BRACKET_COPY.speed).toBe("How fast it looks");
    expect(BRACKET_COPY.speedNote(mtg.noun)).toBe(
      "These show how fast the list looks. They don't change the bracket.",
    );
    expect(mtg.speed!.label).toBe("Speed (Scryfall Tagger roles)");
    // The guard reads both shapes: one nudges, one does not.
    const [precon, cedh] = speedFacts();
    expect(precon.tuned).toBe(false);
    expect(precon.nudge).toBeNull();
    expect(cedh.tuned).toBe(true);
    expect(cedh.nudge).toBe(
      "6 fast mana and 26 lands look like a cEDH list. If it is, say so below.",
    );
  });

  it("the new strings carry no em or en dash and at most one middle dot (WAVE5's rule)", () => {
    const mtg = getAdapter("mtg").brackets!;
    const words = [
      BRACKET_COPY.speed,
      BRACKET_COPY.speedNote(mtg.noun),
      mtg.speed!.label,
      ...speedFacts().flatMap((f) => [
        f.line,
        f.nudge ?? "",
        ...f.rows.flatMap((r) => [r.label, r.value, r.meaning ?? ""]),
      ]),
    ];
    expect(words.filter((w) => /[\u2013\u2014]|\d-\d/.test(w))).toEqual([]);
    expect(words.filter((w) => w.split(" · ").length > 2)).toEqual([]);
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

  it("plain words, never notation: no '+', no '(est.)'", () => {
    expect(everyString().filter((s) => /\d\+|est\./i.test(s))).toEqual([]);
  });
});
