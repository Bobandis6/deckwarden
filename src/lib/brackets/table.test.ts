/**
 * Y5 — At the table (WAVE4 D6): the share page's read is the editor's read,
 * said to the pod; the goals it shows are the target, the exceptions and
 * the answers the read used (never "Not sure", never a cut card's); and
 * "Copy for the table" is D6's text, line for line, every source named, a
 * line with nothing to say left out.
 */
import { describe, expect, it } from "vitest";

import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import { tableGoals, type DeckGoals } from "@/lib/decks/goals";
import { addMorePhrase, deckProgress } from "@/lib/decks/progress";
import { toDeckSnapshot } from "@/lib/decks/validation";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, card, fillers, type MtgCard } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import type { BracketFreshness, CompleteCombo } from "@/lib/games/types";

import {
  hasTableRead,
  lineValue,
  planLine,
  PLAN_MAX,
  shareGoals,
  tableBracket,
  tableSummary,
  tableText,
} from "./table";

const mtg = getAdapter("mtg");
const brackets = mtg.brackets!;
const commanderZone = COMMANDER.zones.find((z) => z.isLeaderZone)!.id;
const mainZone = COMMANDER.zones.find((z) => !z.isLeaderZone)!.id;

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

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}) =>
  card({ name, attrs: { type_line: "Sorcery", oracle_text: "", ...attrs } });
const rhystic = named("Rhystic Study", { game_changer: true });
const rift = named("Cyclonic Rift", { game_changer: true });
const timeWarp = named("Time Warp", { extra_turn: true });
const temporal = named("Temporal Manipulation", { extra_turn: true });
const kiki = named("Kiki-Jiki, Mirror Breaker");
const conscripts = named("Zealous Conscripts");

const kikiCombo: CompleteCombo = {
  key: "618-1537",
  cardPieces: [kiki.id, conscripts.id].sort(),
  templates: [],
  tag: "C",
  relevant: true,
  results: ["Infinite creature tokens with haste"],
  popularity: 28185,
};

function list(specials: MtgCard[], size = 100) {
  const fill = fillers(Math.max(0, size - 1 - specials.length));
  const entries: EditorEntry[] = [
    { cardId: atraxa.id, zone: commanderZone, qty: 1, tags: [] },
    ...[...specials, ...fill].map((c) => ({ cardId: c.id, zone: mainZone, qty: 1, tags: [] })),
  ];
  const cards = new Map<string, EditorCard>(
    [atraxa, ...specials, ...fill].map((c) => [c.id, { ...c, image: null }]),
  );
  return { entries, cards };
}

function table(
  l: ReturnType<typeof list>,
  goals: DeckGoals | null,
  combos: CompleteCombo[] | null = [],
) {
  return tableBracket({
    adapter: mtg,
    format: COMMANDER,
    entries: l.entries,
    cards: l.cards,
    combos,
    freshness: FRESH,
    goals,
  })!;
}

const v = brackets.ruleset.version;

describe("tableBracket — the editor's read, in the table's voice", () => {
  it("assesses exactly what the editor assesses (same inputs, same read)", () => {
    const l = list([rhystic, rift, kiki, conscripts]);
    const goals: DeckGoals = { v: 1, targetLevel: 2, answers: { rulesetVersion: v } };
    const shared = table(l, goals, [kikiCombo]);
    const editor = brackets.assess({
      deck: toDeckSnapshot("mtg", COMMANDER, l.entries),
      cards: l.cards,
      combos: [kikiCombo],
      freshness: FRESH,
      targetLevel: 2,
      answers: goals.answers,
    });
    expect(shared.read).toEqual(editor);
    expect(shared.ctx.voice).toBe("table");
    expect(shared.ctx.targetLevel).toBe(2);
  });

  it("one fixture, both surfaces: the editor's target row and the share page's, side by side", () => {
    const l = list([rhystic, rift, kiki, conscripts]);
    const t = table(l, { v: 1, targetLevel: 2 }, [kikiCombo]);
    const ownerCtx = {
      ...t.ctx,
      voice: undefined,
      progress: addMorePhrase(deckProgress(l.entries, COMMANDER).toGo),
    };
    expect(brackets.line(t.read, ownerCtx)).toBe(
      "Your target: Bracket 2 · the cards say at least 3",
    );
    expect(brackets.line(t.read, t.ctx)).toBe(
      "Played as Bracket 2 (Core) · the cards say at least 3",
    );
  });

  it("nothing for a list without a commander, or a game without brackets", () => {
    const l = list([rhystic]);
    const noCommander = l.entries.filter((e) => e.zone !== commanderZone);
    expect(
      tableBracket({
        adapter: mtg,
        format: COMMANDER,
        entries: noCommander,
        cards: l.cards,
        combos: [],
        freshness: FRESH,
        goals: null,
      }),
    ).toBeNull();
    const op = getAdapter("optcg");
    expect(
      tableBracket({
        adapter: op,
        format: op.formats[0],
        entries: l.entries,
        cards: l.cards,
        combos: [],
        freshness: FRESH,
        goals: null,
      }),
    ).toBeNull();
  });

  it("a draft says how far to go, to the pod (not the builder's 'add N more cards')", () => {
    const t = table(list([rhystic], 60), null);
    expect(t.read.status).toBe("draft");
    expect(hasTableRead(t.read)).toBe(false);
    expect(brackets.line(t.read, t.ctx)).toBe("Bracket: 40 cards to go · 1 Game Changer so far");
  });
});

describe("tableGoals — the answers the read used", () => {
  const l = list([timeWarp, temporal]);

  it("keeps a yes or a no on screen; drops Not sure, a cut card's answer, and the budget", () => {
    const first = table(l, null);
    const chain = first.read.review.find((q) => q.id.startsWith("extra-turns:"))!;
    expect(chain).toBeDefined();
    const goals: DeckGoals = {
      v: 1,
      targetLevel: 3,
      exceptions: "ask me about Time Warp",
      budget: { perCardUsd: 5 },
      answers: {
        rulesetVersion: v,
        play: { fast: "no", quality: "unsure", theme: "yes" },
        calls: {
          [chain.id]: "no",
          "land-denial:00000000-0000-0000-0000-000000000000": "yes", // a card since cut
        },
      },
    };
    const t = table(l, goals);
    expect(t.goals).toEqual({
      v: 1,
      targetLevel: 3,
      exceptions: "ask me about Time Warp",
      answers: {
        rulesetVersion: v,
        play: { fast: "no", theme: "yes" },
        calls: { [chain.id]: "no" },
      },
    });
    // The filter never changes the read: the shown goals assess the same.
    expect(table(l, t.goals).read).toEqual({ ...t.read, answersStale: false });
  });

  it("Not sure alone is nothing to show; no goals at all is null", () => {
    const t = table(l, { v: 1, answers: { rulesetVersion: v, play: { fast: "unsure" } } });
    expect(t.goals).toBeNull();
    expect(tableGoals(null, t.read, ["fast"])).toBeNull();
  });

  it("is idempotent (the private gate filters again on the client)", () => {
    const goals: DeckGoals = {
      v: 1,
      targetLevel: 4,
      answers: { rulesetVersion: v, play: { cedh: "no" } },
    };
    const once = table(l, goals).goals;
    expect(table(l, once).goals).toEqual(once);
  });
});

describe("shareGoals — what a public page sends (computed on the server)", () => {
  const l = list([timeWarp, temporal]);
  const wires = l.entries.map((e) => ({ ...e, card: l.cards.get(e.cardId)! }));
  const fmt = { adapter: mtg, format: COMMANDER };
  const goals: DeckGoals = {
    v: 1,
    targetLevel: 3,
    budget: { totalUsd: 200 },
    answers: { rulesetVersion: v, play: { fast: "no", cedh: "unsure" } },
  };

  it("with the page's facts: the target and the answers the read used — never the budget", () => {
    expect(
      shareGoals({ fmt, cards: wires, goals, facts: { combos: [], freshness: FRESH } }),
    ).toEqual({ v: 1, targetLevel: 3, answers: { rulesetVersion: v, play: { fast: "no" } } });
  });

  it("without them (a failed load) no answer at all — never every answer", () => {
    expect(shareGoals({ fmt, cards: wires, goals, facts: null })).toEqual({ v: 1, targetLevel: 3 });
  });

  it("no read (no commander, One Piece): the public goals", () => {
    const noCommander = wires.filter((w) => w.zone !== commanderZone);
    expect(
      shareGoals({ fmt, cards: noCommander, goals, facts: { combos: [], freshness: FRESH } }),
    ).toEqual({ v: 1, targetLevel: 3 });
    expect(shareGoals({ fmt: null, cards: wires, goals, facts: null })).toEqual({
      v: 1,
      targetLevel: 3,
    });
  });
});

describe("Copy for the table — D6's text", () => {
  const url = "https://deckwarden.gg/d/uwvrnv2pv4t6";

  function copied(l: ReturnType<typeof list>, goals: DeckGoals | null, plan: string | null = null) {
    const t = table(l, goals);
    const lines = tableSummary(brackets, t.read, t.goals, l.cards);
    return tableText({
      deckName: "Atraxa Superfriends",
      formatLabel: COMMANDER.label,
      line: brackets.line(t.read, t.ctx),
      checkedAt: FRESH.readAt,
      lines,
      names: l.cards,
      plan,
      note: brackets.tableNote,
      url,
    });
  }

  it("the checked date is the reader's own: 9 PM in Chicago is still Oct 9, not UTC's Oct 10", () => {
    const at = "2026-10-10T02:12:00.000Z";
    const second = (timeZone?: string) =>
      tableText({
        deckName: "Sram — Budget Armory",
        formatLabel: COMMANDER.label,
        line: "Bracket 1–2 · nothing here goes past Core",
        checkedAt: at,
        timeZone,
        lines: [],
        names: new Map(),
        plan: null,
        note: brackets.tableNote,
        url,
      }).split("\n")[1];
    expect(second("America/Chicago")).toBe(
      "Bracket 1–2 · nothing here goes past Core · checked Oct 9, 2026",
    );
    expect(second()).toBe("Bracket 1–2 · nothing here goes past Core · checked Oct 10, 2026");
  });

  it("the fixture, line for line, every source named", () => {
    const text = copied(list([rhystic, rift]), {
      v: 1,
      targetLevel: 3,
      exceptions: "one thematic Game Changer — ask me",
      answers: { rulesetVersion: v, play: { fast: "no" } },
    });
    expect(text.split("\n")).toEqual([
      "Atraxa Superfriends — Commander",
      "Played as Bracket 3 (Upgraded) · the cards say at least 3 · checked Oct 5, 2026",
      "Game Changers (Wizards' list): Cyclonic Rift, Rhystic Study",
      "Combos (Commander Spellbook): none found",
      "Land denial / extra turns (Scryfall Tagger): none",
      "Pace (owner): doesn't usually win before turn 6",
      "Exceptions (owner): one thematic Game Changer — ask me",
      "Reads the card list only; combos via Commander Spellbook.",
      url,
    ]);
  });

  it("no target, no answers, no exceptions: those lines are absent, never 'none'", () => {
    const text = copied(list([]), null);
    expect(text.split("\n")).toEqual([
      "Atraxa Superfriends — Commander",
      "Bracket 1–2 · nothing here goes past Core · checked Oct 5, 2026",
      "Game Changers (Wizards' list): none",
      "Combos (Commander Spellbook): none found",
      "Land denial / extra turns (Scryfall Tagger): none",
      "Reads the card list only; combos via Commander Spellbook.",
      url,
    ]);
    expect(text).not.toMatch(/owner/);
  });

  it("a combo's pieces join with +, an answered call says its answer and its cards, the plan is the owner's words", () => {
    const l = list([kiki, conscripts, timeWarp, temporal]);
    const chain = table(l, null, [kikiCombo]).read.review.find((q) =>
      q.id.startsWith("extra-turns:"),
    )!;
    const t = table(l, { v: 1, answers: { rulesetVersion: v, calls: { [chain.id]: "no" } } }, [
      kikiCombo,
    ]);
    const lines = tableSummary(brackets, t.read, t.goals, l.cards);
    const text = tableText({
      deckName: "Kiki Combo",
      formatLabel: COMMANDER.label,
      line: brackets.line(t.read, t.ctx),
      checkedAt: null,
      lines,
      names: l.cards,
      plan: "Copy creatures forever.\n\nSecond paragraph stays home.",
      note: brackets.tableNote,
      url,
    }).split("\n");
    expect(text[1]).toBe("Bracket 3 (Upgraded) — from the cards and the owner's answers");
    expect(text).toContain(
      "Combos (Commander Spellbook): Kiki-Jiki, Mirror Breaker + Zealous Conscripts",
    );
    expect(text).toContain(
      "Land denial / extra turns (Scryfall Tagger): Temporal Manipulation, Time Warp",
    );
    expect(text).toContain(
      "Owner's call: Do these extra turns chain? No — Temporal Manipulation, Time Warp",
    );
    expect(text).toContain("Plan (owner): Copy creatures forever.");
    expect(text.join("\n")).not.toContain("Second paragraph");
  });

  it("tableSummary prints only a yes or a no, whatever goals it is handed", () => {
    const l = list([]);
    const t = table(l, null);
    const lines = tableSummary(
      brackets,
      t.read,
      { v: 1, answers: { rulesetVersion: v, play: { fast: "unsure", cedh: "no" } } },
      l.cards,
    );
    expect(lines.filter((x) => x.id.startsWith("play:")).map((x) => x.id)).toEqual(["play:cedh"]);
  });

  it("a feed the read couldn't check says so, never 'none'", () => {
    const l = list([]);
    const t = tableBracket({
      adapter: mtg,
      format: COMMANDER,
      entries: l.entries,
      cards: l.cards,
      combos: null,
      freshness: FRESH,
      goals: null,
    })!;
    const rows = tableSummary(brackets, t.read, null, l.cards);
    expect(rows.find((r) => r.id === "combos")?.text).toBe("couldn't check");
  });

  it("D0: no notation, no 'approve', no Spellbook tag name in anything it prints", () => {
    const text = copied(list([rhystic, rift, timeWarp, temporal]), {
      v: 1,
      targetLevel: 2,
      answers: {
        rulesetVersion: v,
        play: { fast: "yes", cedh: "no", theme: "no", quality: "yes" },
      },
    });
    expect(text).not.toMatch(/\d\+/);
    expect(text).not.toMatch(/approv/i);
    expect(text).not.toMatch(/ruthless|spicy|powerful|oddball|precon appropriate|casual/i);
  });
});

describe("itemSeparator — names with commas never run together", () => {
  const names = new Map([
    ["a", { name: "Gorma, the Gullet" }],
    ["b", { name: "Viscera Seer" }],
    ["c", { name: "Woe Strider" }],
    ["d", { name: "Rhystic Study" }],
  ]);
  it("'; ' between combos or comma names, ', ' otherwise", () => {
    const combos = {
      id: "combos",
      label: "Combos",
      items: [
        ["a", "b"],
        ["a", "c"],
      ],
      text: "",
    };
    expect(lineValue(combos, names)).toBe(
      "Gorma, the Gullet + Viscera Seer; Gorma, the Gullet + Woe Strider",
    );
    expect(lineValue({ ...combos, items: [["a"], ["d"]] }, names)).toBe(
      "Gorma, the Gullet; Rhystic Study",
    );
    expect(lineValue({ ...combos, items: [["b"], ["d"]] }, names)).toBe(
      "Viscera Seer, Rhystic Study",
    );
  });
});

describe("planLine — the owner's description, shortened, never written", () => {
  it("first paragraph, one line, cut at a word with an ellipsis", () => {
    expect(planLine(null)).toBeNull();
    expect(planLine("   \n\n ")).toBeNull();
    expect(planLine("Go  wide,\nthen   swing.\n\nNotes")).toBe("Go wide, then swing.");
    const long = `${"word ".repeat(80)}end`;
    const cut = planLine(long)!;
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(PLAN_MAX + 1);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  });
});
