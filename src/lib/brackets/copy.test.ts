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

import {
  BRACKET_COPY,
  dateLabel,
  declaredLabel,
  goalsParts,
  levelLabel,
  levelNumberLabel,
} from "./copy";
import { targetChange, targetChangeWords, targetTools, type TargetTool } from "./target-change";

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
  "previewShows",
  "previewShowsNone",
  "declare",
  "targetShown",
  // TARGET-CHANGES: the callout's words (targetChangeWords calls them all below).
  "targetSet",
  "targetChanged",
  "changeStatus",
  "aboveNow",
  "aboveCleared",
  "allowsLead",
  "differsLead",
  "was",
  "toolsFollow",
  "toolsStop",
  "targetShowsAt",
  "targetShowsNone",
  // BRACKET-FIT: the door and the sheet (fitLines calls them all below).
  "fitDoor",
  "fitTitle",
  "fitInsteadOf",
  "fitShares",
  "fitComingFor",
  "fitInstead",
  "fitAlso",
  "fitAsking",
  "fitNotLooked",
  "fitStaysCommander",
  "fitStaysNotOffered",
  "fitStaysCopies",
  "fitStaysNoRoles",
  "fitStaysNone",
  "fitStaysKept",
  "fitStaysNotAsked",
  "fitAfterFits",
  "fitAfterStill",
  "fitAfterStillCount",
  "fitNothing",
  "fitCost",
  // BRACKET-UP: the box, the door and the sheet (upLines calls them all below).
  "belowTargetLead",
  "upCardsShow",
  "upAnswersSay",
  "upDoor",
  "upTitle",
  "upDropped",
  "upSwapIn",
  "upCutFor",
  "upAt",
  "upOutFor",
  "upElsewhere",
  "upAfter",
  "upAfterAnswers",
  "upAfterNothing",
  "upFloor",
  "upAfterAbove",
  "upAfterAboveCount",
];

/**
 * BRACKET-UP: every line the box, the door and the sheet can say for
 * Magic — at each level, in both of the level's forms, one card and
 * several, the adapter's bucket names and its reasons for a card it can't
 * pair (a land, no cost).
 */
function upLines(): string[] {
  const mtg = getAdapter("mtg");
  const brackets = mtg.brackets!;
  const swap = mtg.recommend!.swap!;
  const C = BRACKET_COPY;
  const lines: string[] = [];
  for (const { level } of brackets.levels) {
    const named = levelLabel(brackets, level);
    const short = levelNumberLabel(brackets, level);
    lines.push(C.belowTargetLead(named), C.upCardsShow(named), C.upAnswersSay(named));
    lines.push(C.upDoor(short), C.upTitle(short), C.upAfter(named), C.upAfterAnswers(named));
    lines.push(C.upFloor(named), C.upAfterAbove(short));
    lines.push(C.upAfterAboveCount(1, short), C.upAfterAboveCount(2, short));
  }
  lines.push(C.upAfterNothing(brackets.noun), C.nothingFound(brackets.noun));
  for (const n of [1, 2, 9]) lines.push(C.upDropped(n));
  for (const name of ["Arcane Signet", "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"]) {
    lines.push(C.upSwapIn(name), C.upCutFor(name), C.upOutFor("Mind Stone", name));
  }
  // The words the planner hands bucketName: the last bucket as "7 or more", never "7+".
  for (const label of ["0", "3", "7 or more"]) {
    lines.push(C.upAt(swap.bucketName(label)), C.upElsewhere(swap.bucketName(label)));
  }
  const land = card({ name: "Gilded Grove", primaryType: "Land", costValue: 0 });
  const costless = card({ name: "Ancestral Vision", primaryType: "Sorcery", costValue: null });
  lines.push(swap.unmatched(land), swap.unmatched(costless));
  return lines;
}

/**
 * BRACKET-FIT: every line the door and the sheet can say for Magic — at
 * each level, one card and several, every reason a card stays, the price
 * line's cases, and the role labels Magic declares.
 */
function fitLines(): string[] {
  const mtg = getAdapter("mtg");
  const brackets = mtg.brackets!;
  const C = BRACKET_COPY;
  const one = ["Rhystic Study"];
  const two = ["Gaea's Cradle", "Ancient Tomb"];
  const three = ["Demonic Tutor", "Vampiric Tutor", "Mystical Tutor"];
  const lines: string[] = [];
  for (const level of brackets.levels.map((l) => levelNumberLabel(brackets, l.level))) {
    lines.push(C.fitDoor(level), C.fitTitle(level), C.fitAfterFits(level), C.fitAfterStill(level));
    lines.push(C.fitAfterStillCount(1, level), C.fitAfterStillCount(2, level));
    lines.push(C.fitNothing(level));
  }
  for (const names of [one, two, three]) {
    lines.push(
      C.fitStaysCommander(names, mtg.display.leaderNoun),
      C.fitStaysNotOffered(names),
      C.fitStaysNoRoles(names),
      C.fitStaysNone(names),
      C.fitStaysKept(names),
      C.fitStaysNotAsked(names),
      C.fitInsteadOf(names[0]),
      C.fitInstead(names[0]),
      C.fitComingFor(names[0]),
      C.fitAlso(names[0]),
    );
  }
  lines.push(C.fitStaysCopies("Relentless Rats", 3));
  for (const n of [1, 2, 9]) lines.push(C.fitAsking(n), C.fitNotLooked(n));
  const roles = mtg.recommend!.swap!.roles.map((r) => r.label);
  lines.push(C.fitShares(roles.slice(0, 1)), C.fitShares(roles.slice(0, 3)), ...roles);
  for (const [usd, owned, unpriced, total] of [
    [14.2, 0, 0, 3],
    [14.2, 1, 0, 3],
    [14.2, 0, 1, 3],
    [14.2, 1, 2, 4],
    [0, 3, 0, 3],
    [0, 0, 1, 1],
    [0, 0, 2, 2],
    [0, 1, 1, 2],
  ] as const) {
    lines.push(C.fitCost(usd, owned, unpriced, total));
  }
  return lines;
}

/**
 * TARGET-CHANGES: every line the callout can say for Magic — every pick
 * between Not set and the five levels, the counts that say "was" and the
 * ones that don't, link previews or not, the tools Magic declares and
 * smaller sets of them (each verb's singular and plural).
 */
function targetChangeLines(): string[] {
  const mtg = getAdapter("mtg").brackets!;
  const toolSets: TargetTool[][] = [
    targetTools(getAdapter("mtg")),
    ["suggestions"],
    ["combos"],
    ["suggestions", "autofill"],
  ];
  const counts = [
    [0, 0],
    [1, 0],
    [0, 1],
    [3, 1],
    [2, 2],
  ] as const;
  const targets = [null, ...mtg.levels.map((l) => l.level)];
  const lines: string[] = [];
  for (const from of targets) {
    for (const to of targets) {
      for (const [now, before] of counts) {
        for (const tools of toolSets) {
          for (const linkPreviews of [true, false]) {
            const change = targetChange({
              brackets: mtg,
              tools,
              from,
              to,
              read: { conflicts: Array.from({ length: now }, (_, i) => `f${i}`) },
              aboveBefore: before,
              linkPreviews,
            });
            if (!change) continue;
            const w = targetChangeWords(change, mtg);
            lines.push(w.title, w.status, w.cards, w.shown);
            if (w.above) lines.push(w.above);
            if (w.rowsLead) lines.push(w.rowsLead);
            if (w.tools) lines.push(w.tools);
            for (const row of w.rows) {
              lines.push(row.label, row.value);
              if (row.was !== null) lines.push(BRACKET_COPY.was(row.was));
            }
          }
        }
      }
    }
  }
  return lines;
}

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
    // LATER row 306: Your target's note, with link previews and without.
    C.targetShown(true),
    C.targetShown(false),
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
    // DECK-PREVIEW-BRACKET: the Share dialog's line at every level and with none, and its action.
    ...previewWords(),
    // TARGET-CHANGES: every line the callout can say.
    ...targetChangeLines(),
    // BRACKET-FIT: every line the door and the sheet can say.
    ...fitLines(),
    // BRACKET-UP: every line the box, the door and the sheet can say.
    ...upLines(),
  ];
}

/** DECK-PREVIEW-BRACKET: every word the Share dialog's bracket line can say. */
function previewWords(): string[] {
  const mtg = getAdapter("mtg").brackets!;
  return [
    ...mtg.levels.map((l) => BRACKET_COPY.previewShows(declaredLabel(mtg, l.level))),
    BRACKET_COPY.previewShowsNone(mtg.noun),
    BRACKET_COPY.declare(mtg.noun),
    BRACKET_COPY.changeGoals,
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

describe("DECK-PREVIEW-BRACKET's words — the Share dialog's line", () => {
  it("what link previews show, in the image's declared label, and the two actions", () => {
    const mtg = getAdapter("mtg").brackets!;
    expect(BRACKET_COPY.previewShows(declaredLabel(mtg, 3))).toBe(
      "Link previews show Bracket 3 (declared).",
    );
    expect(BRACKET_COPY.previewShowsNone(mtg.noun)).toBe("Link previews show no bracket.");
    expect(BRACKET_COPY.declare(mtg.noun)).toBe("Declare a bracket");
    expect(BRACKET_COPY.changeGoals).toBe("Change");
  });

  it("no em or en dash, at most one middle dot, and nothing that promises an old preview changes", () => {
    const words = previewWords();
    expect(words.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(words.filter((w) => w.split(" · ").length > 2)).toEqual([]);
    expect(words.filter((w) => /updat|refresh|already|will /i.test(w))).toEqual([]);
  });
});

describe("LATER row 306's words — Your target's note says where the target shows", () => {
  it("the share page, then the target where the deck is listed, and in link previews unless the deck is private", () => {
    expect(BRACKET_COPY.targetShown(true)).toBe(
      "Shown on your share page. Your target also shows in link previews and where the deck is listed.",
    );
    expect(BRACKET_COPY.targetShown(false)).toBe(
      "Shown on your share page. Your target also shows where the deck is listed.",
    );
  });

  it("no em or en dash, at most one middle dot, and nothing that promises an old preview changes", () => {
    const words = [BRACKET_COPY.targetShown(true), BRACKET_COPY.targetShown(false)];
    expect(words.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(words.filter((w) => w.split(" · ").length > 2)).toEqual([]);
    expect(words.filter((w) => /updat|refresh|already|will /i.test(w))).toEqual([]);
  });
});

describe("TARGET-CHANGES' words — what a pick of Your target did", () => {
  const mtg = getAdapter("mtg").brackets!;
  const C = BRACKET_COPY;

  it("the titles: set in the level's own words, changed with 'to' between, cleared", () => {
    expect(C.targetSet(levelLabel(mtg, 3))).toBe("Target set: Bracket 3 (Upgraded)");
    expect(C.targetChanged(levelNumberLabel(mtg, 2), levelNumberLabel(mtg, 3))).toBe(
      "Target changed from Bracket 2 to Bracket 3",
    );
    expect(C.targetCleared).toBe("Target cleared");
    expect(C.changeStatus("Target cleared")).toBe("Target cleared. Your cards didn't change.");
  });

  it("the cards first, then the list against the target, pointing at the conflict callout by its heading", () => {
    expect(C.cardsUnchanged).toBe("Your cards didn't change.");
    expect(C.aboveNow(0, null)).toBe("Nothing in the list puts the deck above it.");
    expect(C.aboveNow(0, 3)).toBe("Nothing in the list puts the deck above it (before, 3 did).");
    expect(C.aboveNow(1, null)).toBe(
      "1 thing in the list puts the deck above it. See Above your target below.",
    );
    expect(C.aboveNow(2, 0)).toBe(
      "2 things in the list put the deck above it (before, none did). See Above your target below.",
    );
    expect(C.aboveNow(2, 1)).toContain(`See ${C.aboveTarget} below.`);
    expect(C.aboveCleared(1)).toBe("Nothing is marked above a target now (before, 1 thing was).");
  });

  it("the rows' lead and the old value in parentheses (U9: no dash aside)", () => {
    expect(C.allowsLead("Bracket 3")).toBe("What Bracket 3 allows:");
    expect(C.differsLead("Bracket 3", "Bracket 2")).toBe("Where Bracket 3 differs from Bracket 2:");
    expect(`Game Changers: Up to three ${C.was("None")}`).toBe(
      "Game Changers: Up to three (was None)",
    );
  });

  it("the tools by core's names, the verbs agreeing; none named, nothing said", () => {
    expect([C.toolSuggestions, C.toolAutofill, C.toolSwap, C.toolCombos]).toEqual([
      "Suggestions",
      "Autofill",
      "Alternatives",
      "Combos tab",
    ]);
    expect(C.toolsFollow(["Suggestions", "Autofill", "Alternatives"], "Combos tab")).toBe(
      "Suggestions, Autofill and Alternatives leave out cards above it, and the Combos tab marks combos above it.",
    );
    expect(C.toolsFollow(["Suggestions"], null)).toBe("Suggestions leaves out cards above it.");
    expect(C.toolsStop(["Suggestions", "Autofill", "Alternatives"], "Combos tab")).toBe(
      "Suggestions, Autofill and Alternatives stop leaving out cards for a target, and the Combos tab stops marking combos above one.",
    );
    expect(C.toolsStop([], "Combos tab")).toBe(
      "The Combos tab stops marking combos above a target.",
    );
    expect(C.toolsFollow([], null)).toBe("");
    expect(C.toolsStop([], null)).toBe("");
  });

  it("where it shows: targetShown's rule, link previews only when they draw it", () => {
    expect(C.targetShowsAt("Bracket 3", true)).toBe(
      "Bracket 3 shows on your share page, in link previews and where the deck is listed.",
    );
    expect(C.targetShowsAt("Bracket 3", false)).toBe(
      "Bracket 3 shows on your share page and where the deck is listed.",
    );
    expect(C.targetShowsNone(true)).toBe(
      "No target shows on your share page, in link previews or where the deck is listed.",
    );
    expect(C.targetShowsNone(false)).toBe(
      "No target shows on your share page or where the deck is listed.",
    );
    expect([C.undo, C.dismiss]).toEqual(["Undo", "Dismiss"]);
  });

  it("no em or en dash, no middle dot, nothing that promises an old preview changes, no notation", () => {
    const lines = targetChangeLines();
    expect(lines.length).toBeGreaterThan(1000);
    expect(lines.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(lines.filter((w) => w.includes("·"))).toEqual([]);
    expect(lines.filter((w) => /updat|refresh|already|will /i.test(w))).toEqual([]);
    expect(lines.filter((w) => /\d\+|est\./i.test(w))).toEqual([]);
    // Never a multi-dot line: one period ends a sentence, never "..".
    expect(lines.filter((w) => /\.\./.test(w))).toEqual([]);
  });
});

describe("BRACKET-FIT's words — the door, the sheet, the after-line", () => {
  const mtg = getAdapter("mtg").brackets!;
  const C = BRACKET_COPY;
  const level = levelNumberLabel(mtg, 2);

  it("the door and the title in the level's short form; the after-line in the brief's own words", () => {
    expect(C.fitDoor(level)).toBe("Swap to fit Bracket 2…");
    expect(C.fitTitle(level)).toBe("Swap to fit Bracket 2");
    expect(C.fitAfterFits(level)).toBe(
      "After these swaps, nothing in the list puts the deck above Bracket 2.",
    );
    expect(C.fitAfterStill(level)).toBe(
      "After these swaps, these still put the deck above Bracket 2:",
    );
    expect(C.fitAfterStillCount(1, level)).toBe(
      "After these swaps, 1 thing still puts the deck above Bracket 2.",
    );
    expect(C.fitAfterStillCount(2, level)).toBe(
      "After these swaps, 2 things still put the deck above Bracket 2.",
    );
    // The lead when nothing can be swapped (the door shows anyway), and its one button.
    expect(C.fitNothing(level)).toBe(
      "None of the cards that put the deck above Bracket 2 can be swapped here, but you can still remove or replace them yourself.",
    );
    expect(C.fitDone).toBe("Done");
    expect(C.fitAfterChecking).toBe("Checking the list after these swaps…");
    expect(C.fitAfterFailed).toBe("Couldn't check combos for the list after these swaps.");
  });

  it("why a card stays, one card and several, the verbs agreeing", () => {
    expect(C.fitStaysCommander(["Urza, Lord High Artificer"], "Commander")).toBe(
      "Urza, Lord High Artificer is your commander, so it stays.",
    );
    expect(C.fitStaysCommander(["Thrasios, Triton Hero", "Tymna the Weaver"], "Commander")).toBe(
      "Thrasios, Triton Hero and Tymna the Weaver are your commanders, so they stay.",
    );
    expect(C.fitStaysNotOffered(["Gaea's Cradle"])).toBe(
      "Alternatives aren't offered for Gaea's Cradle, so it stays.",
    );
    expect(C.fitStaysCopies("Relentless Rats", 3)).toBe(
      "The list runs 3 copies of Relentless Rats, and a swap takes one, so it stays.",
    );
    expect(C.fitStaysNoRoles(["Mystic Remora", "Tergrid"])).toBe(
      "Mystic Remora and Tergrid have no community roles yet, so nothing is known to share their job.",
    );
    expect(C.fitStaysNone(["Thassa's Oracle"])).toBe(
      "No alternative under your goals for Thassa's Oracle, so it stays.",
    );
    expect(C.fitStaysKept(["A", "B", "C"])).toBe("You're keeping A, B and C.");
    expect(C.fitStaysNotAsked(["Ad Nauseam"])).toBe("Ad Nauseam wasn't looked at, so it stays.");
  });

  it("the asks, the limit, and the price of the cards coming in", () => {
    expect(C.fitAsking(1)).toBe("Finding alternatives for 1 more card…");
    expect(C.fitAsking(3)).toBe("Finding alternatives for 3 more cards…");
    expect(C.fitNotLooked(2)).toBe(
      "Didn't look at 2 more cards. Swap these first, then open this again for more.",
    );
    expect(C.fitCost(14.2, 0, 0, 3)).toBe("The cards coming in cost $14.20.");
    expect(C.fitCost(14.2, 1, 1, 4)).toBe(
      "The cards coming in cost $14.20, not counting the 1 you own. 1 more has no price yet.",
    );
    expect(C.fitCost(0, 3, 0, 3)).toBe("You own every card coming in.");
    expect(C.fitCost(0, 0, 1, 1)).toBe("No price is known for the card coming in.");
    expect(C.fitCost(0, 1, 2, 3)).toBe(
      "No price is known for the 2 cards coming in that you don't own.",
    );
    expect(C.fitShares(["card draw", "tutor"])).toBe("Both: card draw, tutor");
    expect(C.fitComingFor("Cyclonic Rift")).toBe("Coming in for Cyclonic Rift.");
    expect(C.fitNoPrice).toBe("no price yet");
  });

  it("no em or en dash, no middle dot, no notation, never a multi-dot line", () => {
    const lines = fitLines();
    expect(lines.length).toBeGreaterThan(80);
    expect(lines.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(lines.filter((w) => w.includes("·"))).toEqual([]);
    expect(lines.filter((w) => /\d\+|est\./i.test(w))).toEqual([]);
    expect(lines.filter((w) => /\.\./.test(w))).toEqual([]);
  });
});

describe("BRACKET-UP's words — the box, the door, the sheet, the after-line", () => {
  const mtg = getAdapter("mtg").brackets!;
  const C = BRACKET_COPY;
  const four = levelNumberLabel(mtg, 4);

  it("the box in the level's own words, the door and the title in its short form", () => {
    expect(C.belowTarget).toBe("Below your target");
    expect(`${C.belowTargetLead(levelLabel(mtg, 4))} ${C.upCardsShow(levelLabel(mtg, 2))}`).toBe(
      "Your target is Bracket 4 (Optimized). The cards show at least Bracket 2 (Core).",
    );
    expect(C.upAnswersSay(levelLabel(mtg, 3))).toBe(
      "The cards and your answers say Bracket 3 (Upgraded).",
    );
    expect(C.upDoor(four)).toBe("Upgrade toward Bracket 4…");
    expect(C.upTitle(four)).toBe("Upgrade toward Bracket 4");
    // Said true to the fallback (most pairs cut the weakest card at another cost).
    expect(C.upLead).toBe(
      "Brings in your Suggestions, each for the weakest card it can replace, at the same cost when there is one. Check the swaps you want.",
    );
  });

  it("the rows: the check, the chooser and its groups, a card another row takes, why a row has nothing to cut", () => {
    const swap = getAdapter("mtg").recommend!.swap!;
    expect(C.upSwapIn("Arcane Signet")).toBe("Swap in Arcane Signet");
    expect(C.upCutFor("Arcane Signet")).toBe("Card to cut for Arcane Signet");
    expect([C.upReplaces, C.upChoose, C.upOthers]).toEqual([
      "Replaces",
      "Choose a card to cut",
      "Other cards",
    ]);
    expect(C.upAt(swap.bucketName("3"))).toBe("At mana value 3");
    expect(C.upOutFor("Mind Stone", "Arcane Signet")).toBe("Mind Stone (out for Arcane Signet)");
    expect(C.upElsewhere(swap.bucketName("7 or more"))).toBe(
      "No suggested cut at mana value 7 or more, so the weakest card at another cost goes.",
    );
    expect(C.upNoCut).toBe("No suggested cut is left. Choose the card to cut.");
    expect(C.upDropped(1)).toBe("1 suggestion couldn't load, so it's left out.");
    expect(C.upDropped(2)).toBe("2 suggestions couldn't load, so they're left out.");
    expect([C.upAsking, C.upLimited, C.upFailed, C.upNone]).toEqual([
      "Finding suggestions…",
      "Suggestions are rate-limited for a moment. Try again shortly.",
      "Couldn't load suggestions.",
      "No suggestions fit your goals right now.",
    ]);
  });

  it("the after-line: what the cards show, the target named only when reached, the floor's limit", () => {
    expect(`${C.upAfter(levelLabel(mtg, 4))} ${C.upReached}`).toBe(
      "After these swaps, the cards show at least Bracket 4 (Optimized). That's your target.",
    );
    expect(C.upAfterAnswers(levelLabel(mtg, 4))).toBe(
      "After these swaps, the cards and your answers say Bracket 4 (Optimized).",
    );
    expect(C.upAfterNothing(mtg.noun)).toBe(
      "After these swaps, nothing in the list raises the bracket.",
    );
    expect(C.upFloor(levelLabel(mtg, 5))).toBe(
      "Cards can only show a floor. If the deck plays at Bracket 5 (cEDH), say so under How it plays.",
    );
    expect(C.upAfterAbove(levelNumberLabel(mtg, 3))).toBe(
      "After these swaps, these put the deck above Bracket 3:",
    );
    expect(C.upAfterAboveCount(1, levelNumberLabel(mtg, 3))).toBe(
      "After these swaps, 1 thing puts the deck above Bracket 3.",
    );
    expect(C.upAfterAboveCount(2, levelNumberLabel(mtg, 3))).toBe(
      "After these swaps, 2 things put the deck above Bracket 3.",
    );
    // How it plays is pointed at by its own heading.
    expect(C.upFloor("Bracket 4")).toContain(C.howItPlays);
  });

  it("no em or en dash, no middle dot, no notation, never a multi-dot line", () => {
    const lines = upLines();
    expect(lines.length).toBeGreaterThan(60);
    expect(lines.filter((w) => /[–—]|\d-\d/.test(w))).toEqual([]);
    expect(lines.filter((w) => w.includes("·"))).toEqual([]);
    expect(lines.filter((w) => /\d\+|est\./i.test(w))).toEqual([]);
    expect(lines.filter((w) => /\.\./.test(w))).toEqual([]);
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
