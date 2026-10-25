/**
 * TARGET-CHANGES — what one pick of Your target did, against the real Magic
 * read: the counts are `read.conflicts` at the old and the new target (lists
 * whose cards prove Bracket 1 to 4, every level 1 to 5 and Not set as the
 * target), the rows are the adapter's guide rows verbatim (all when set,
 * only the ones that differ when changed, none when cleared or without a
 * guide), the tools only those the adapter declares, and the words
 * BRACKET_COPY's.
 */
import { describe, expect, it } from "vitest";

import {
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo, GameAdapter } from "@/lib/games/types";

import {
  targetChange,
  targetChangeWords,
  targetTools,
  type TargetChange,
  type TargetTool,
} from "./target-change";

const mtg = getAdapter("mtg");
const brackets = mtg.brackets!;
const guide = brackets.guide!;
const ALL_TOOLS = targetTools(mtg);

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT, detail: "53 cards" },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT, detail: "bulk 7.1.4" },
  },
};

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({ ...over, name, attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs } });
const kiki = named("Kiki-Jiki, Mirror Breaker", {}, { isLeaderCandidate: true });
const conscripts = named("Zealous Conscripts");
const rhystic = named("Rhystic Study", { game_changer: true });
const armageddon = named("Armageddon", { mld: "clear" });
const timeWarp = named("Time Warp", { extra_turn: true });
const kikiCombo: CompleteCombo = {
  key: "618-1537",
  cardPieces: [kiki.id, conscripts.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite creature tokens with haste", "Infinite death triggers"],
  popularity: 28185,
};

/** Kiki-Jiki, the specials, 36 lands, fillers to 100; the combos are the list's complete ones. */
function list(specials: MtgCard[], combos: CompleteCombo[] = []) {
  const main = [...specials, ...basicLands(36), ...fillers(99 - specials.length - 36)];
  const deck = commanderDeck(
    [kiki],
    main.map((c) => entry(c)),
  );
  const cards = cardMap([kiki, ...main]);
  /** The read the sheet renders at a target. */
  return (target: number | null) =>
    brackets.assess({ deck, cards, combos, freshness: FRESH, targetLevel: target });
}

/** Lists whose cards prove Bracket 1, 2, 3 and 4 (no card alone proves 5: that is the player's call). */
const LISTS = {
  1: list([]),
  2: list([timeWarp]),
  3: list([rhystic]),
  4: list([conscripts, rhystic, armageddon, timeWarp], [kikiCombo]),
};
const TARGETS = [null, 1, 2, 3, 4, 5] as const;

/** One pick, as the sheet makes it: the count at the pick, the read after it. */
function pick(
  readAt: (typeof LISTS)[keyof typeof LISTS],
  from: number | null,
  to: number | null,
  opts: { tools?: readonly TargetTool[]; linkPreviews?: boolean } = {},
) {
  return targetChange({
    brackets,
    tools: opts.tools ?? ALL_TOOLS,
    from,
    to,
    read: readAt(to),
    aboveBefore: readAt(from).conflicts.length,
    linkPreviews: opts.linkPreviews ?? true,
  });
}

describe("targetTools — only what the adapter declares", () => {
  it("Magic declares all four: Suggestions, Autofill, Swap Lab, the Combo Radar", () => {
    expect(ALL_TOOLS).toEqual(["suggestions", "autofill", "swap", "combos"]);
  });

  it("One Piece declares none of them", () => {
    expect(targetTools(getAdapter("optcg"))).toEqual([]);
  });

  it("each by its own field: recommend, recommend.autofill, recommend.swap, capabilities.combos", () => {
    const recommend = { ...mtg.recommend!, autofill: undefined, swap: undefined };
    const capabilities = { ...mtg.capabilities, combos: undefined };
    const bare: Pick<GameAdapter, "recommend" | "capabilities"> = { recommend, capabilities };
    expect(targetTools(bare)).toEqual(["suggestions"]);
    expect(
      targetTools({ ...bare, recommend: { ...recommend, swap: mtg.recommend!.swap } }),
    ).toEqual(["suggestions", "swap"]);
    expect(targetTools({ capabilities: mtg.capabilities })).toEqual(["combos"]);
    // Autofill and Swap Lab live inside recommend: without it, neither is named.
    expect(targetTools({ capabilities })).toEqual([]);
  });
});

describe("targetChange — the kind, and nothing for the level already set", () => {
  it("set from Not set, changed between levels, cleared back to Not set", () => {
    expect(pick(LISTS[4], null, 3)?.kind).toBe("set");
    expect(pick(LISTS[4], 2, 4)?.kind).toBe("changed");
    expect(pick(LISTS[4], 4, 2)?.kind).toBe("changed");
    expect(pick(LISTS[4], 2, null)?.kind).toBe("cleared");
  });

  it("the same level twice is no change", () => {
    for (const t of TARGETS) expect(pick(LISTS[4], t, t)).toBeNull();
  });
});

describe("targetChange — the findings above the target are the reads' own conflicts", () => {
  it("the fixtures prove Bracket 1 to 4", () => {
    expect([LISTS[1], LISTS[2], LISTS[3], LISTS[4]].map((readAt) => readAt(null).minimum)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("at every target, each list's count is its read's conflicts (none without a target)", () => {
    const counts = Object.values(LISTS).map((readAt) =>
      TARGETS.map((t) => readAt(t).conflicts.length),
    );
    expect(counts).toEqual([
      [0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0],
      // Land denial (4), the Game Changer and the combo (3), the extra turn (2).
      [0, 4, 3, 1, 0, 0],
    ]);
  });

  it("every pick on every list: now from the read after it, before from the read at it", () => {
    for (const readAt of Object.values(LISTS)) {
      for (const from of TARGETS) {
        for (const to of TARGETS) {
          if (from === to) continue;
          expect(pick(readAt, from, to)!.above).toEqual({
            now: readAt(to).conflicts.length,
            before: readAt(from).conflicts.length,
          });
        }
      }
    }
  });
});

describe("targetChange — what the level allows, the adapter's rows verbatim", () => {
  const rowsOf = (change: TargetChange | null) =>
    change!.rows.map((r) => [r.label, r.value, r.was] as const);

  it("set: every row of the new level, with nothing to compare", () => {
    expect(rowsOf(pick(LISTS[4], null, 3))).toEqual([
      ["Game Changers", "Up to three", null],
      ["Mass land denial", "None", null],
      ["Extra turns", "A few, never chained or looped", null],
      ["Two-card combos", "None before turn 6", null],
      ["Games last", "At least 6 turns", null],
    ]);
  });

  it("changed: only the rows that differ, each with the old level's value", () => {
    expect(rowsOf(pick(LISTS[4], 2, 3))).toEqual([
      ["Game Changers", "Up to three", "None"],
      ["Two-card combos", "None before turn 6", "None"],
      ["Games last", "At least 6 turns", "At least 8 turns"],
    ]);
    expect(rowsOf(pick(LISTS[4], 4, 2))).toEqual([
      ["Game Changers", "None", "No limit"],
      ["Mass land denial", "None", "Allowed"],
      ["Extra turns", "A few, never chained or looped", "No limit"],
      ["Two-card combos", "None", "No limit"],
      ["Games last", "At least 8 turns", "At least 4 turns"],
    ]);
    expect(rowsOf(pick(LISTS[4], 4, 5))).toEqual([
      ["Games last", "Any number of turns", "At least 4 turns"],
    ]);
  });

  it("every pair of levels: exactly the guide rows of the new level whose value differs from the old one's", () => {
    const levels = guide.levels.map((l) => l.level);
    for (const from of levels) {
      for (const to of levels) {
        if (from === to) continue;
        const next = guide.levels.find((l) => l.level === to)!.rows;
        const prev = guide.levels.find((l) => l.level === from)!.rows;
        const expected = next
          .map((row) => ({ ...row, was: prev.find((p) => p.label === row.label)!.value }))
          .filter((row) => row.value !== row.was);
        expect(pick(LISTS[1], from, to)!.rows).toEqual(expected);
        expect(expected.length).toBeGreaterThan(0);
      }
    }
  });

  it("cleared: no rows; a game without a guide: no rows", () => {
    expect(pick(LISTS[4], 3, null)!.rows).toEqual([]);
    const change = targetChange({
      brackets: { ...brackets, guide: undefined },
      tools: ALL_TOOLS,
      from: null,
      to: 3,
      read: LISTS[4](3),
      aboveBefore: 0,
      linkPreviews: true,
    });
    expect(change!.rows).toEqual([]);
    expect(targetChangeWords(change!, brackets).rowsLead).toBeNull();
  });
});

describe("targetChangeWords — the callout's words", () => {
  const words = (change: TargetChange | null) => {
    const w = targetChangeWords(change!, brackets);
    return {
      ...w,
      rows: w.rows.map((r) => `${r.label}: ${r.value}${r.was === null ? "" : ` (was ${r.was})`}`),
    };
  };

  it("set (Not set to 3): the level's name, the cards first, one finding above it, every row, the tools, where it shows", () => {
    expect(words(pick(LISTS[4], null, 3))).toEqual({
      title: "Target set: Bracket 3 (Upgraded)",
      status: "Target set: Bracket 3 (Upgraded). Your cards didn't change.",
      cards: "Your cards didn't change.",
      above: "1 thing in the list puts the deck above it. See Above your target below.",
      rowsLead: "What Bracket 3 allows:",
      rows: [
        "Game Changers: Up to three",
        "Mass land denial: None",
        "Extra turns: A few, never chained or looped",
        "Two-card combos: None before turn 6",
        "Games last: At least 6 turns",
      ],
      tools:
        "Suggestions, Autofill and Alternatives leave out cards above it, and the Combos tab marks combos above it.",
      shown: "Bracket 3 shows on your share page, in link previews and where the deck is listed.",
    });
  });

  it("changed 2 to 4: nothing above it now (was 3 findings), the rows that differ", () => {
    expect(words(pick(LISTS[4], 2, 4))).toEqual({
      title: "Target changed from Bracket 2 to Bracket 4",
      status: "Target changed from Bracket 2 to Bracket 4. Your cards didn't change.",
      cards: "Your cards didn't change.",
      above: "Nothing in the list puts the deck above it (before, 3 did).",
      rowsLead: "Where Bracket 4 differs from Bracket 2:",
      rows: [
        "Game Changers: No limit (was None)",
        "Mass land denial: Allowed (was None)",
        "Extra turns: No limit (was A few, never chained or looped)",
        "Two-card combos: No limit (was None)",
        "Games last: At least 4 turns (was At least 8 turns)",
      ],
      tools:
        "Suggestions, Autofill and Alternatives leave out cards above it, and the Combos tab marks combos above it.",
      shown: "Bracket 4 shows on your share page, in link previews and where the deck is listed.",
    });
  });

  it("changed 4 to 2: three findings above it now (was none)", () => {
    const w = words(pick(LISTS[4], 4, 2));
    expect(w.title).toBe("Target changed from Bracket 4 to Bracket 2");
    expect(w.above).toBe(
      "3 things in the list put the deck above it (before, none did). See Above your target below.",
    );
    expect(w.rowsLead).toBe("Where Bracket 2 differs from Bracket 4:");
    expect(w.rows[0]).toBe("Game Changers: None (was No limit)");
  });

  it("a count that didn't move says no 'was'; neither does a first target", () => {
    // 4 to 5: nothing above either.
    expect(words(pick(LISTS[4], 4, 5)).above).toBe("Nothing in the list puts the deck above it.");
    // 1 to 2 on the Bracket 2 list: one above, then none.
    expect(words(pick(LISTS[2], 1, 2)).above).toBe(
      "Nothing in the list puts the deck above it (before, 1 did).",
    );
    expect(words(pick(LISTS[2], null, 1)).above).toBe(
      "1 thing in the list puts the deck above it. See Above your target below.",
    );
    expect(words(pick(LISTS[3], 1, 2)).above).toBe(
      "1 thing in the list puts the deck above it. See Above your target below.",
    );
  });

  it("cleared: what it marked before, the tools stop, no target shows", () => {
    expect(words(pick(LISTS[4], 2, null))).toEqual({
      title: "Target cleared",
      status: "Target cleared. Your cards didn't change.",
      cards: "Your cards didn't change.",
      above: "Nothing is marked above a target now (before, 3 things were).",
      rowsLead: null,
      rows: [],
      tools:
        "Suggestions, Autofill and Alternatives stop leaving out cards for a target, and the Combos tab stops marking combos above one.",
      shown: "No target shows on your share page, in link previews or where the deck is listed.",
    });
    // Nothing was above the old target: nothing to say about it.
    expect(words(pick(LISTS[4], 4, null)).above).toBeNull();
  });

  it("a private deck: link previews are never named", () => {
    expect(words(pick(LISTS[4], null, 3, { linkPreviews: false })).shown).toBe(
      "Bracket 3 shows on your share page and where the deck is listed.",
    );
    expect(words(pick(LISTS[4], 3, null, { linkPreviews: false })).shown).toBe(
      "No target shows on your share page or where the deck is listed.",
    );
  });

  it("the tools named are only the declared ones, the verb agreeing", () => {
    const toolsFor = (tools: TargetTool[], from: number | null, to: number | null) =>
      words(pick(LISTS[4], from, to, { tools })).tools;
    expect(toolsFor(["suggestions"], null, 2)).toBe("Suggestions leaves out cards above it.");
    expect(toolsFor(["suggestions", "swap"], null, 2)).toBe(
      "Suggestions and Alternatives leave out cards above it.",
    );
    expect(toolsFor(["combos"], null, 2)).toBe("The Combos tab marks combos above it.");
    expect(toolsFor(["suggestions", "combos"], 2, 3)).toBe(
      "Suggestions leaves out cards above it, and the Combos tab marks combos above it.",
    );
    expect(toolsFor(["suggestions"], 2, null)).toBe(
      "Suggestions stops leaving out cards for a target.",
    );
    expect(toolsFor(["combos"], 2, null)).toBe(
      "The Combos tab stops marking combos above a target.",
    );
    expect(toolsFor([], null, 2)).toBeNull();
    expect(toolsFor([], 2, null)).toBeNull();
  });
});
