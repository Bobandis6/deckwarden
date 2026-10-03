/*
 * Parts of this file are ported from Commander Spellbook's deck bracket
 * estimate (SpaceCowMedia/commander-spellbook-backend,
 * backend/spellbook/models/variant.py, estimate_bracket and its patterns, read
 * at commit 190735d9abe0), under this license:
 *
 * MIT License
 *
 * Copyright (c) 2023 Commander-Spellbook
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Magic's bracket read (Y3b, WAVE4 D4) — pure, attributed, versioned. The
 * same code runs in the editor (Y4a) and on the server (Y5, the calibration).
 *
 * What it reads, from named sources only: Game Changers (Wizards' list via
 * Scryfall's `game_changer`), mass land denial and extra turns (Scryfall
 * Tagger, reviewed in data/mtg/tagger-overrides.json), and the list's
 * complete combos (Commander Spellbook: each combo's tag, "relevant" mark
 * and results). What it says: the lowest bracket the cards prove, the
 * questions only the player can answer, and what it couldn't check — never
 * one authoritative number. The highest rule wins.
 *
 * Spellbook's deck ladder, adjusted to Wizards' text in both directions:
 * - stricter where Spellbook is lenient: a relevant two-card combo (at most
 *   two cards besides your commander, no template) reads at least Bracket 3
 *   whatever its tag — Wizards bars two-card infinite combos below 3;
 * - "your call" where Spellbook over-escalates: two or more extra-turn cards
 *   (Wizards bars chaining them, not having them) and edge land denial;
 * - a combo's tag is read as stored, never recomputed (our rows keep no
 *   mana_value_needed, prerequisites or zones): R at least 4, S "3 or 4",
 *   P at least 3, O "2 or 3", C at least 2, E nothing.
 *
 * Spellbook rates a combo without knowing the commander, counting every
 * commander-eligible piece as "arguable". In a deck the commander is always
 * there, which can only make a combo more two-card — and that matters only
 * for tags E, O and S: C, P and R already count it as definitely two-card or
 * top. So a combo that uses your commander and is tagged E, O or S is a
 * question ("it may be faster with your commander"); our own two-card rule
 * already counts the commander as always available.
 *
 * Never lower: a source that is missing, stale or switched off adds a
 * "Couldn't check" line and makes the read `unavailable` — its minimum is
 * then only a floor — while whatever its data still shows keeps counting.
 * Tutors and fast mana never count (Wizards dropped tutor limits on
 * 2025-10-21). A banned or not-legal card blocks the read.
 */
import type {
  BracketAnswers,
  BracketFactor,
  BracketFreshness,
  BracketInput,
  BracketQuestion,
  BracketRead,
  BracketsMeta,
  CardData,
  CompleteCombo,
  FeedFreshness,
  IngestRunFacts,
} from "../types";
import type { MtgAttrs } from "./attrs";
import { BRACKET_RULESET, type BracketLevel } from "./bracket-ruleset";
import { mtgFormat } from "./formats";
import { bracketTagOf, type SpellbookBracketTag } from "./spellbook-tags";
import { legalityIssue } from "./validate";

type MtgCard = CardData<MtgAttrs>;

// --- Spellbook's result patterns, ported verbatim (variant.py ≈24–30) ----------
// Python's re.IGNORECASE is the i flag; re.search is test(). Our `results`
// keep S/H/C features only, which is every name these match (measured on the
// 2026-10-01 bulk: 0 utility-only matches).

const INFINITE_TURNS_REGEX = String.raw`(?:near-)?infinite (?:extra )?turns?`;
export const MASS_LAND_DENIAL_PATTERN = /mass land (?:destruction|denial|removal)/i;
export const EXTRA_TURN_PATTERN = new RegExp(INFINITE_TURNS_REGEX, "i");
export const EXTRA_TURN_FOR_OPPONENT_PATTERN = new RegExp(
  INFINITE_TURNS_REGEX + String.raw` for .* opponent`,
  "i",
);
export const CONTROL_ALL_OPPONENTS_PATTERN = /you control (?:your|(up to )?three) opponents/i;

/** Spellbook's tag → bracket (variant.py's `bracket` field): R 4, S 3, P 3, O 2, C 2, E 1. */
const TAG_LEVEL: Record<SpellbookBracketTag, number> = { R: 4, S: 3, P: 3, O: 2, C: 2, E: 1 };
/** The tags D4 reads as a range — the top of it is the player's call. */
const TAG_UP_TO: Partial<Record<SpellbookBracketTag, number>> = { S: 4, O: 3 };
/** The tags a known commander can raise (the others already count the combo as two-card, or top). */
const COMMANDER_CAN_RAISE: ReadonlySet<SpellbookBracketTag> = new Set(["E", "O", "S"]);
/** Spellbook's "fast": a combo that needs this much mana or less (its speed 4). */
const FAST_COMBO_MANA = 4;

// --- The ruleset, read as levels ------------------------------------------------

const LEVELS: readonly BracketLevel[] = BRACKET_RULESET.levels;
const TOP_LEVEL = LEVELS[LEVELS.length - 1].level;

function lowestLevel(allows: (l: BracketLevel) => boolean): number {
  return (LEVELS.find(allows) ?? LEVELS[LEVELS.length - 1]).level;
}
const levelOf = (n: number): BracketLevel => LEVELS.find((l) => l.level === n)!;

/** The lowest bracket allowing `n` Game Changers. */
function gameChangerLevel(n: number): number {
  return lowestLevel((l) => l.gameChangers === null || l.gameChangers >= n);
}
const LAND_DENIAL_LEVEL = lowestLevel((l) => l.landDenial);
const EXTRA_TURN_LEVEL = lowestLevel((l) => l.extraTurns !== "none");
const CHAINED_TURNS_LEVEL = lowestLevel((l) => l.extraTurns === "any");
const TWO_CARD_LEVEL = lowestLevel((l) => l.twoCardCombos !== "none");
/** Spellbook's R for "control of every opponent" (no Wizards text names it). */
const CONTROL_ALL_LEVEL = TAG_LEVEL.R;
/** Wizards' turn line for Bracket 3, the yardstick for "early". */
const EARLY_TURN = levelOf(TWO_CARD_LEVEL).turns!;
/** "Usually wins or locks the table before turn 6" — the first bracket expecting fewer turns. */
const FAST_DECK_LEVEL = lowestLevel((l) => l.turns === null || l.turns < EARLY_TURN);
/** "Staples and high card quality" — Bracket 3's own words. */
const QUALITY_LEVEL = 3;
/** Not theme first: past Exhibition. */
const NOT_THEME_LEVEL = 2;

const READ_RULESET = {
  version: BRACKET_RULESET.version,
  asOf:
    BRACKET_RULESET.gameChangers.asOf > BRACKET_RULESET.asOf
      ? BRACKET_RULESET.gameChangers.asOf
      : BRACKET_RULESET.asOf,
};

// --- Named sources (WAVE4 D0) -----------------------------------------------------

export const BRACKET_SOURCES = {
  gameChangers: "Wizards' Game Changers list (via Scryfall)",
  tagger: "Community-tagged on Scryfall Tagger",
  spellbook: "Commander Spellbook",
  twoCard: "Commander Spellbook (the combo) and Wizards' brackets (the rule)",
} as const;

// --- Freshness ------------------------------------------------------------------------

/** The feeds the read checks — keys of BracketFreshness.feeds. */
export const BRACKET_FEEDS = ["gameChangers", "landDenial", "extraTurns", "combos"] as const;
export type BracketFeed = (typeof BRACKET_FEEDS)[number];

/** A feed not refreshed for longer than this reads "Couldn't check". */
export const STALE_AFTER_DAYS = 7;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function field(v: unknown, key: string): Record<string, unknown> | null {
  if (!isObject(v)) return null;
  const inner = v[key];
  return isObject(inner) ? inner : null;
}

/**
 * The latest successful Scryfall and Spellbook runs → each feed's freshness.
 * - Game Changers: the Scryfall run recorded `game_changers` (every run since Y3a).
 * - Land denial / extra turns: Tagger's status per flag — fresh reads the run's
 *   date, kept reads its `stale_since`, disabled is off.
 * - Combos: the Spellbook run recorded `bracket_tags` (a run before Y3a didn't).
 * Stale = older than STALE_AFTER_DAYS at `readAt`.
 */
export function mtgBracketFreshness(
  runs: readonly IngestRunFacts[],
  readAt: string,
): BracketFreshness {
  const scryfall = runs.find((r) => r.source === "scryfall") ?? null;
  const spellbook = runs.find((r) => r.source === "spellbook") ?? null;
  const missing: FeedFreshness = { state: "missing", asOf: null };
  const timed = (asOf: string, detail?: string): FeedFreshness => {
    const age = Date.parse(readAt) - Date.parse(asOf);
    const stale = !(age <= STALE_AFTER_DAYS * 86_400_000); // NaN reads stale
    return { state: stale ? "stale" : "ok", asOf, ...(detail ? { detail } : {}) };
  };

  const gc = field(scryfall?.stats, "game_changers");
  const gameChangers =
    scryfall && gc && typeof gc.count === "number" && typeof gc.md5 === "string"
      ? timed(scryfall.startedAt, `${gc.count} cards`)
      : missing;

  const tagger = field(scryfall?.stats, "tagger");
  const taggerFeed = (flag: "mld" | "extra_turn"): FeedFreshness => {
    const status = field(tagger, "status")?.[flag];
    if (!scryfall || status === undefined) return missing;
    if (status === "disabled") return { state: "off", asOf: null };
    if (status === "fresh") return timed(scryfall.startedAt);
    if (status === "kept") {
      const since = field(tagger, "stale_since")?.[flag];
      return timed(typeof since === "string" ? since : scryfall.startedAt);
    }
    return missing;
  };

  const tags = field(spellbook?.stats, "bracket_tags");
  const version = spellbook && isObject(spellbook.stats) ? spellbook.stats.source_version : null;
  const combos =
    spellbook && tags
      ? timed(spellbook.startedAt, typeof version === "string" ? `bulk ${version}` : undefined)
      : missing;

  return {
    readAt,
    feeds: {
      gameChangers,
      landDenial: taggerFeed("mld"),
      extraTurns: taggerFeed("extra_turn"),
      combos,
    },
  };
}

// --- Words ------------------------------------------------------------------------------

function joinList(items: readonly string[], last: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}
const joinAnd = (items: readonly string[]) => joinList(items, "and");
const joinOr = (items: readonly string[]) => joinList(items, "or");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** [1, 2] → "Brackets 1 and 2"; [1, 2, 3] → "Brackets 1–3"; [1] → "Bracket 1". */
function bracketsPhrase(levels: readonly number[]): string {
  if (levels.length === 1) return `Bracket ${levels[0]}`;
  if (levels.length === 2) return `Brackets ${levels[0]} and ${levels[1]}`;
  return `Brackets ${levels[0]}–${levels[levels.length - 1]}`;
}
/** "Bracket 1 expects" / "Brackets 1 and 2 expect" — the verb agrees with however many there are. */
function bracketsVerb(levels: readonly number[], one: string, many: string): string {
  return `${bracketsPhrase(levels)} ${levels.length === 1 ? one : many}`;
}
const levelsWhere = (pred: (l: BracketLevel) => boolean) => LEVELS.filter(pred).map((l) => l.level);

/** "2026-10-02T04:54:15Z" → "Oct 2, 2026", pinned to UTC. */
function dateLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const byName = (a: MtgCard, b: MtgCard) => a.name.localeCompare(b.name, "en");

/** "How it plays" (Y4b asks them): each answer only ever raises the read. */
export const MTG_BRACKET_QUESTIONS = [
  { key: "theme", question: "Theme first, over power?" },
  { key: "quality", question: "Staples and high card quality?" },
  { key: "fast", question: `Can it usually win or lock the table before turn ${EARLY_TURN}?` },
  { key: "cedh", question: "Tuned for the cEDH metagame?" },
] as const;

/** What the read assumes — fixed text, the date from ingest (WAVE4 D5). */
function assumptionsFor(gameChangersAsOf: string | null): string[] {
  const timed = LEVELS.filter((l) => l.turns !== null);
  const turns = joinAnd(timed.map((l) => String(l.turns)));
  return [
    `Reads the card list only — it can't see how fast your deck wins. Wizards expects games to last at least ${turns} turns at Brackets ${timed[0].level}–${timed[timed.length - 1].level}.`,
    `A combo counts as fast when it needs ${FAST_COMBO_MANA} mana or less to assemble (Commander Spellbook).`,
    "Your commander counts as always available.",
    "Tutors and fast mana don't change the read — Wizards dropped tutor limits in October 2025.",
    "Land-denial and extra-turn lists are Scryfall community tags, not Wizards lists.",
    "Combos no EDHREC deck has played aren't checked.",
    gameChangersAsOf
      ? `Game Changers: Wizards' list as of ${dateLabel(gameChangersAsOf)}.`
      : "Game Changers: Wizards' list.",
  ];
}

/** What a feed's "Couldn't check" line says. `null` = the freshness itself didn't load. */
const FEED_WORDS: Record<BracketFeed, { what: string; source: string; data: string }> = {
  gameChangers: {
    what: "Game Changers",
    source: BRACKET_SOURCES.gameChangers,
    data: "the card data",
  },
  landDenial: {
    what: "mass land denial",
    source: BRACKET_SOURCES.tagger,
    data: "Scryfall Tagger's list",
  },
  extraTurns: {
    what: "extra turns",
    source: BRACKET_SOURCES.tagger,
    data: "Scryfall Tagger's list",
  },
  combos: {
    what: "combos",
    source: BRACKET_SOURCES.spellbook,
    data: "Commander Spellbook's ratings",
  },
};

function uncheckedFeed(feed: BracketFeed, f: FeedFreshness | null): BracketFactor {
  const w = FEED_WORDS[feed];
  let why: string;
  if (f === null) why = "its freshness didn't load";
  else if (f.state === "off") why = `${w.data} is switched off`;
  else if (f.state === "stale" && f.asOf)
    why = `${w.data} hasn't refreshed since ${dateLabel(f.asOf)}`;
  else why = `${w.data} hasn't been read yet`;
  return {
    id: `unchecked:${feed}`,
    sentence: `Couldn't check ${w.what}: ${why}.`,
    cards: [],
    source: w.source,
    atLeast: null,
    change: null,
  };
}

// --- Combos -----------------------------------------------------------------------------

interface ComboRead {
  /** The pieces in name order, "A + B", and their ids in that order. */
  label: string;
  cards: string[];
  factor: BracketFactor | null;
  question: Omit<BracketQuestion, "answer"> | null;
  /** The combo's rating (or its "relevant" mark, where it matters) couldn't be read. */
  unchecked: boolean;
}

function readCombo(
  combo: CompleteCombo,
  cards: ReadonlyMap<string, MtgCard>,
  commanderIds: ReadonlySet<string>,
): ComboRead {
  const pieces = combo.cardPieces
    .map((id) => cards.get(id) ?? null)
    .filter((c): c is MtgCard => c !== null)
    .sort(byName);
  const label = pieces.map((c) => c.name).join(" + ");
  const others = pieces.filter((c) => !commanderIds.has(c.id));
  const usesCommander = combo.cardPieces.some((id) => commanderIds.has(id));
  const tag = bracketTagOf(combo.tag);
  const landDenial = combo.results.find((r) => MASS_LAND_DENIAL_PATTERN.test(r));
  const turns = combo.results.find(
    (r) => EXTRA_TURN_PATTERN.test(r) && !EXTRA_TURN_FOR_OPPONENT_PATTERN.test(r),
  );
  const controlAll = combo.results.find((r) => CONTROL_ALL_OPPONENTS_PATTERN.test(r));
  const base = { id: `combo:${combo.key}`, cards: pieces.map((c) => c.id), combo: combo.key };
  const commanderMayRaise = usesCommander && tag !== null && COMMANDER_CAN_RAISE.has(tag);

  // A combo that needs a template is never confirmed by the list: one
  // question, whose "yes" is what the combo would prove with it.
  if (combo.templates.length > 0) {
    const ifMet = Math.max(
      landDenial ? LAND_DENIAL_LEVEL : 1,
      turns ? CHAINED_TURNS_LEVEL : 1,
      controlAll ? CONTROL_ALL_LEVEL : 1,
      tag ? (TAG_UP_TO[tag] ?? TAG_LEVEL[tag]) : 1,
      combo.relevant === true && others.length + combo.templates.length <= 2 ? TWO_CARD_LEVEL : 1,
      commanderMayRaise ? TAG_LEVEL.R : 1,
    );
    return {
      label,
      cards: base.cards,
      factor: null,
      question:
        ifMet > 1
          ? {
              ...base,
              question: "Does your deck have the rest of this combo?",
              because: `${label} also needs ${joinAnd(combo.templates)}.`,
              source: BRACKET_SOURCES.spellbook,
              raisesTo: ifMet,
            }
          : null,
      unchecked: tag === null || combo.relevant === null,
    };
  }

  const twoCard = combo.relevant === true && others.length <= 2;
  // Every rule that fires; the highest names the factor (`what` is the
  // result it read, when the rule is about one).
  const rules: { level: number; what?: string; words: string; source: string }[] = [];
  if (landDenial)
    rules.push({
      level: LAND_DENIAL_LEVEL,
      what: "mass land denial",
      words: `${bracketsVerb(
        levelsWhere((l) => !l.landDenial),
        "expects",
        "expect",
      )} none.`,
      source: BRACKET_SOURCES.spellbook,
    });
  if (turns)
    rules.push({
      level: CHAINED_TURNS_LEVEL,
      what: "infinite turns",
      words: `${bracketsVerb(
        levelsWhere((l) => l.extraTurns !== "any"),
        "expects",
        "expect",
      )} no chained extra turns.`,
      source: BRACKET_SOURCES.spellbook,
    });
  if (controlAll)
    rules.push({
      level: CONTROL_ALL_LEVEL,
      what: "control of every opponent",
      words: `Commander Spellbook rates that Bracket ${CONTROL_ALL_LEVEL}.`,
      source: BRACKET_SOURCES.spellbook,
    });
  if (tag === "R")
    rules.push({
      level: TAG_LEVEL.R,
      words: `${twoCard ? "A fast one — " : ""}Commander Spellbook rates it Bracket ${TAG_LEVEL.R}.`,
      source: BRACKET_SOURCES.spellbook,
    });
  if (twoCard)
    rules.push({
      level: TWO_CARD_LEVEL,
      words: `${bracketsVerb(
        levelsWhere((l) => l.twoCardCombos === "none"),
        "expects",
        "expect",
      )} none.`,
      source: BRACKET_SOURCES.twoCard,
    });
  if (tag !== null && tag !== "R" && tag !== "E") {
    const upTo = TAG_UP_TO[tag];
    rules.push({
      level: TAG_LEVEL[tag],
      words: `Commander Spellbook rates it Bracket ${TAG_LEVEL[tag]}${upTo ? ` or ${upTo}` : ""}.`,
      source: BRACKET_SOURCES.spellbook,
    });
  }
  // Stable: among equal levels the order above wins (a named result first).
  rules.sort((a, b) => b.level - a.level);
  const top = rules[0] ?? null;
  const firm = top?.level ?? 1;

  // The player's call: the top of an S / O range, and a combo with your
  // commander whose rating may have undercounted it.
  const because: string[] = [];
  let raisesTo = firm;
  const upTo = tag ? TAG_UP_TO[tag] : undefined;
  if (tag && upTo !== undefined && upTo > firm) {
    raisesTo = upTo;
    because.push(`Commander Spellbook rates it Bracket ${TAG_LEVEL[tag]} or ${upTo}.`);
  }
  if (commanderMayRaise && TAG_LEVEL.R > firm) {
    raisesTo = TAG_LEVEL.R;
    because.push(
      `${because.length > 0 ? "It" : "Commander Spellbook"} rates combos without knowing your commander — with yours always there, it may be faster.`,
    );
  }

  return {
    label,
    cards: base.cards,
    factor: top
      ? {
          ...base,
          sentence: `${twoCard ? (usesCommander ? "Two-card combo with your commander" : "Two-card combo") : "Combo"}: ${label}${top.what ? ` — ${top.what}` : ""}. ${top.words}`,
          source: top.source,
          atLeast: top.level,
          change:
            others.length > 0
              ? `Remove ${joinOr(others.map((c) => c.name))} to fit Bracket ${top.level - 1}.`
              : null,
        }
      : null,
    question:
      raisesTo > firm
        ? {
            ...base,
            question:
              raisesTo >= TAG_LEVEL.R
                ? `Can this combo win or lock the game before turn ${EARLY_TURN}?`
                : "Does this combo win or lock the game in your deck?",
            because: `${label}: ${because.join(" ")}`,
            source: BRACKET_SOURCES.spellbook,
            raisesTo,
          }
        : null,
    unchecked: tag === null || (combo.relevant === null && others.length <= 2),
  };
}

// --- The read ------------------------------------------------------------------------------

function suggestedLevel(
  minimum: number,
  answers: BracketAnswers | null | undefined,
  review: readonly BracketQuestion[],
): number | null {
  if (!answers) return null;
  let floor: number | null = null;
  const raise = (n: number) => {
    floor = floor === null ? n : Math.max(floor, n);
  };
  const play = answers.play ?? {};
  if (play.cedh === "yes") raise(TOP_LEVEL);
  if (play.fast === "yes") raise(FAST_DECK_LEVEL);
  if (play.quality === "yes") raise(QUALITY_LEVEL);
  if (play.theme === "no") raise(NOT_THEME_LEVEL);
  if (play.theme === "yes") raise(1);
  for (const q of review) {
    if (q.answer === "yes") raise(q.raisesTo);
    else if (q.answer === "no") raise(1);
  }
  return floor === null ? null : Math.max(minimum, floor);
}

export function assessBracket(input: BracketInput<MtgAttrs>): BracketRead {
  const { deck, cards } = input;
  const answersStale =
    input.answers != null && input.answers.rulesetVersion !== BRACKET_RULESET.version;
  const format = mtgFormat(deck.formatCode);
  if (!format) {
    return {
      status: "unavailable",
      minimum: 1,
      suggested: null,
      factors: [],
      assumptions: [],
      review: [],
      blockedBy: [],
      conflicts: [],
      ruleset: READ_RULESET,
      answersStale,
    };
  }

  // The list: copies per card (every zone), the commander, the size.
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  const copies = new Map<string, number>();
  const commanderIds = new Set<string>();
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    for (const e of entries) {
      copies.set(e.cardId, (copies.get(e.cardId) ?? 0) + e.qty);
      if (leaderZones.has(zoneId)) commanderIds.add(e.cardId);
    }
  }
  let size = 0;
  let underZone = false;
  for (const zone of format.zones) {
    const n = (deck.zones[zone.id] ?? []).reduce((s, e) => s + e.qty, 0);
    if (zone.countsTowardSize) size += n;
    if (n < zone.min) underZone = true;
  }
  const isDraft = underZone || size < format.deckSize.min;

  const held: { card: MtgCard; qty: number }[] = [];
  const unknown: string[] = [];
  for (const [id, qty] of copies) {
    const card = cards.get(id);
    if (card) held.push({ card, qty });
    else unknown.push(id);
  }
  held.sort((a, b) => byName(a.card, b.card));
  const blockedBy = held
    .filter((h) => {
      const issue = legalityIssue(h.card);
      return issue?.code === "BANNED" || issue?.code === "NOT_LEGAL";
    })
    .map((h) => h.card.id);

  const factors: BracketFactor[] = [];
  const unchecked: BracketFactor[] = [];
  const questions: Omit<BracketQuestion, "answer">[] = [];
  const feedOf = (feed: BracketFeed): FeedFreshness | null =>
    input.freshness ? (input.freshness.feeds[feed] ?? { state: "missing", asOf: null }) : null;
  /** True when the feed can vouch for an absence; otherwise notes "Couldn't check". */
  const checkFeed = (feed: BracketFeed): boolean => {
    const f = feedOf(feed);
    if (f?.state === "ok") return true;
    unchecked.push(uncheckedFeed(feed, f));
    return false;
  };
  let complete = true;
  if (unknown.length > 0) {
    complete = false;
    unchecked.push({
      id: "unchecked:cards",
      sentence: `Couldn't check ${unknown.length} ${plural(unknown.length, "card", "cards")}: ${plural(unknown.length, "its", "their")} card data didn't load.`,
      cards: [...unknown].sort(),
      source: "Deckwarden",
      atLeast: null,
      change: null,
    });
  }

  // Game Changers (Wizards' list via Scryfall).
  const gameChangers = held.filter((h) => h.card.attrs.game_changer === true);
  const gcCount = gameChangers.reduce((s, h) => s + h.qty, 0);
  if (gcCount > 0) {
    const level = gameChangerLevel(gcCount);
    const below = levelOf(level - 1);
    const allowance = below.gameChangers ?? 0;
    const names = gameChangers.map((h) => h.card.name);
    factors.push({
      id: "game-changers",
      sentence: `${gcCount} ${plural(gcCount, "Game Changer", "Game Changers")}: ${joinAnd(names)}. ${
        allowance === 0
          ? `${bracketsVerb(
              levelsWhere((l) => l.gameChangers === 0),
              "allows",
              "allow",
            )} none.`
          : `Bracket ${below.level} allows up to ${numberWord(allowance)}.`
      }`,
      cards: gameChangers.map((h) => h.card.id),
      source: BRACKET_SOURCES.gameChangers,
      atLeast: level,
      change:
        allowance === 0
          ? `Remove ${joinAnd(names)} to fit Bracket ${below.level}.`
          : `Remove ${gcCount - allowance} of them to fit Bracket ${below.level}.`,
    });
  }
  if (!checkFeed("gameChangers")) complete = false;

  // Mass land denial (Scryfall Tagger, split clear / edge by the overrides file).
  const clear = held.filter((h) => h.card.attrs.mld === "clear");
  if (clear.length > 0) {
    const names = clear.map((h) => h.card.name);
    factors.push({
      id: "land-denial",
      sentence: `Mass land denial: ${joinAnd(names)}. ${bracketsVerb(
        levelsWhere((l) => !l.landDenial),
        "expects",
        "expect",
      )} none.`,
      cards: clear.map((h) => h.card.id),
      source: BRACKET_SOURCES.tagger,
      atLeast: LAND_DENIAL_LEVEL,
      change: `Remove ${joinAnd(names)} to fit Bracket ${LAND_DENIAL_LEVEL - 1}.`,
    });
  }
  for (const h of held.filter((x) => x.card.attrs.mld === "edge")) {
    questions.push({
      id: `land-denial:${h.card.externalKey}`,
      question: "Does it deny lands the way Armageddon does?",
      because: `${h.card.name} is tagged land denial, but it depends on how it's played.`,
      cards: [h.card.id],
      source: BRACKET_SOURCES.tagger,
      raisesTo: LAND_DENIAL_LEVEL,
    });
  }
  if (!checkFeed("landDenial")) complete = false;

  // Extra turns (Scryfall Tagger): one is past Exhibition; chaining them is the call.
  const extraTurns = held.filter((h) => h.card.attrs.extra_turn === true);
  const turnCount = extraTurns.reduce((s, h) => s + h.qty, 0);
  if (turnCount > 0) {
    const names = extraTurns.map((h) => h.card.name);
    factors.push({
      id: "extra-turns",
      sentence: `${turnCount} extra-turn ${plural(turnCount, "card", "cards")}: ${joinAnd(names)}. ${bracketsVerb(
        levelsWhere((l) => l.extraTurns === "none"),
        "expects",
        "expect",
      )} none.`,
      cards: extraTurns.map((h) => h.card.id),
      source: BRACKET_SOURCES.tagger,
      atLeast: EXTRA_TURN_LEVEL,
      change: `Remove ${joinAnd(names)} to fit Bracket ${EXTRA_TURN_LEVEL - 1}.`,
    });
    if (turnCount >= 2) {
      questions.push({
        id: `extra-turns:${extraTurns
          .map((h) => h.card.externalKey)
          .sort()
          .join("+")}`,
        question: "Do these extra turns chain?",
        because: `${bracketsVerb(
          levelsWhere((l) => l.extraTurns === "few"),
          "expects",
          "expect",
        )} only a few extra turns, never chained or looped.`,
        cards: extraTurns.map((h) => h.card.id),
        source: BRACKET_SOURCES.tagger,
        raisesTo: CHAINED_TURNS_LEVEL,
      });
    }
  }
  if (!checkFeed("extraTurns")) complete = false;

  // Complete combos (Commander Spellbook) — re-checked against this list, so
  // facts fetched for an older snapshot can't count a combo that's gone.
  if (input.combos === null) {
    complete = false;
    unchecked.push({
      id: "unchecked:combos",
      sentence: "Couldn't check combos.",
      cards: [],
      source: BRACKET_SOURCES.spellbook,
      atLeast: null,
      change: null,
    });
  } else {
    const feedOk = checkFeed("combos");
    if (!feedOk) complete = false;
    const seen = new Set<string>();
    for (const combo of input.combos) {
      if (seen.has(combo.key)) continue;
      seen.add(combo.key);
      if (combo.cardPieces.length === 0 || !combo.cardPieces.every((id) => copies.has(id)))
        continue;
      const read = readCombo(combo, cards, commanderIds);
      if (read.factor) factors.push(read.factor);
      if (read.question) questions.push(read.question);
      if (read.unchecked) {
        complete = false;
        // A feed that can't vouch already says so once for every combo.
        if (feedOk) {
          unchecked.push({
            id: `unchecked:combo:${combo.key}`,
            sentence: `Couldn't check how Commander Spellbook rates ${read.label}.`,
            cards: read.cards,
            source: BRACKET_SOURCES.spellbook,
            atLeast: null,
            change: null,
            combo: combo.key,
          });
        }
      }
    }
  }

  factors.sort((a, b) => (b.atLeast ?? 0) - (a.atLeast ?? 0));
  const minimum = Math.max(1, ...factors.map((f) => f.atLeast ?? 1));
  const review: BracketQuestion[] = questions
    .filter((q) => q.raisesTo > minimum)
    .sort((a, b) => b.raisesTo - a.raisesTo)
    .map((q) => ({ ...q, answer: input.answers?.calls?.[q.id] ?? null }));
  const suggested = suggestedLevel(minimum, input.answers, review);
  const settled = suggested ?? minimum;
  const open = review.some(
    (q) => (q.answer === null || q.answer === "unsure") && q.raisesTo > settled,
  );
  const target = input.targetLevel ?? null;

  return {
    status:
      blockedBy.length > 0
        ? "blocked"
        : isDraft
          ? "draft"
          : !complete
            ? "unavailable"
            : open
              ? "review"
              : "read",
    minimum,
    suggested,
    factors: [...factors, ...unchecked],
    assumptions: assumptionsFor(feedOf("gameChangers")?.asOf ?? null),
    review,
    blockedBy,
    conflicts:
      target === null
        ? []
        : factors.filter((f) => f.atLeast !== null && f.atLeast > target).map((f) => f.id),
    ruleset: READ_RULESET,
    answersStale,
  };
}

/** The Magic adapter's `brackets` declaration (Y3b). */
export const mtgBrackets: BracketsMeta<MtgAttrs> = {
  noun: "bracket",
  levels: LEVELS.map(({ level, name }) => ({ level, name })),
  ruleset: READ_RULESET,
  questions: MTG_BRACKET_QUESTIONS,
  freshnessSources: ["scryfall", "spellbook"],
  freshness: mtgBracketFreshness,
  assess: assessBracket,
};
