/**
 * Magic's set lines (X4a, WAVE3.md D4 as amended by the owner's answers of
 * 2026-09-28): which released sets are "main", which lines are numbered,
 * the numbering rule, the words a set's place is shown in, and how the
 * /cards Set picker matches typed text. Pure and client-safe — GET /api/sets
 * computes each row's group and ordinal with it (`placeSets`), the picker
 * and the set header word them with it (`setPlace`, `setPlaceShort`).
 *
 * A "line" is Scryfall's `set_type`, verbatim — the named source; nothing
 * here reclassifies a set by hand except Secret Lair Drop, which the owner
 * named as a main set and Scryfall types `box` beside its other boxes.
 */
import { normalizeCardName } from "@/lib/cards/normalize";
import type { SearchFieldDef } from "@/lib/games/types";
import { ordinal } from "@/lib/tournaments/format";

export type SetGroup = "main" | "other";

/** One row of GET /api/sets (`loadReleasedSets`), newest first. */
export interface ReleasedSet {
  /** The game's own code, lowercase for Magic ("emn"). */
  code: string;
  name: string;
  /** The set's own release date, YYYY-MM-DD — "released" is this date, never `is_preview`. */
  releasedAt: string;
  /** Scryfall's set type, verbatim ("expansion", "masterpiece", …). */
  setType: string;
  group: SetGroup;
  /** Live cards with a live printing in the set — what the set scope lists. */
  cards: number;
  /** Place in its line ("71" → "the 71st expansion set"); null for unnumbered lines. */
  ordinal: number | null;
}

/** The group labels, in the picker's order. */
export const SET_GROUP_LABEL: Record<SetGroup, string> = {
  main: "Main sets",
  other: "Other products",
};

/**
 * The owner's main sets (2026-09-28): expansion, core, masters, commander
 * and draft innovation — which already hold almost every Universes Beyond
 * product — plus the Universes Beyond Eternal sets and the bonus sheets
 * (Scryfall's `masterpiece`)…
 */
export const MAIN_SET_TYPES: ReadonlySet<string> = new Set([
  "expansion",
  "core",
  "masters",
  "commander",
  "draft_innovation",
  "eternal",
  "masterpiece",
]);

/** …and Secret Lair Drop, which Scryfall types `box` beside Secret Lair's other boxes. */
export const MAIN_SET_CODES: ReadonlySet<string> = new Set(["sld"]);

/**
 * The numbered lines. Core sets are not numbered: Scryfall lists Alpha,
 * Beta and Unlimited as three core sets, so Tenth Edition would read as
 * "the 12th core set" — a count its own name contradicts. The added main
 * kinds (Eternal sets, bonus sheets, Secret Lair) are side products, and
 * "Other products" have no line to speak of.
 */
export const ORDINAL_SET_TYPES: ReadonlySet<string> = new Set([
  "expansion",
  "commander",
  "masters",
  "draft_innovation",
]);

export function setGroup(setType: string, code: string): SetGroup {
  return MAIN_SET_TYPES.has(setType) || MAIN_SET_CODES.has(code) ? "main" : "other";
}

/** The rule's input: a released set with its live-card count. */
export interface LineEntry {
  code: string;
  setType: string;
  releasedAt: string;
  cards: number;
}

/**
 * Place in line (the owner's "Eldritch Moon — the 71st expansion set"):
 * each numbered line's sets counted by release date, SKIPPING a set released
 * the same day as a larger set of its line (more live cards; a tie goes to
 * the lower code). Scryfall lists Time Spiral's bonus sheet, Time Spiral
 * Timeshifted, as an expansion of its own on Time Spiral's day — counted,
 * Eldritch Moon comes out 72nd. On 2026-09-28 the skip removes exactly four
 * sets from the numbered lines: Time Spiral Timeshifted, The Big Score and
 * the two Modern Horizons Timeshifts sheets. A skipped set has no number.
 *
 * Returns code → ordinal for the numbered lines only. Dates are ISO strings,
 * so string order is date order.
 */
export function lineOrdinals(sets: readonly LineEntry[]): Map<string, number> {
  const lines = new Map<string, Map<string, LineEntry>>();
  for (const set of sets) {
    if (!ORDINAL_SET_TYPES.has(set.setType)) continue;
    const days = lines.get(set.setType) ?? new Map<string, LineEntry>();
    const held = days.get(set.releasedAt);
    if (!held || set.cards > held.cards || (set.cards === held.cards && set.code < held.code)) {
      days.set(set.releasedAt, set);
    }
    lines.set(set.setType, days);
  }
  const ordinals = new Map<string, number>();
  for (const days of lines.values()) {
    [...days.keys()].sort().forEach((day, i) => ordinals.set(days.get(day)!.code, i + 1));
  }
  return ordinals;
}

/**
 * Which of a day's sets comes first: the main lines in this order, then
 * everything else. Without it the larger set leads, and a set's Commander
 * decks outnumber it (Marvel Super Heroes Commander 616 cards, Marvel Super
 * Heroes 281; Bloomburrow Commander before Bloomburrow).
 */
const DAY_ORDER = [
  "expansion",
  "core",
  "draft_innovation",
  "masters",
  "commander",
  "eternal",
  "masterpiece",
];

function dayRank(setType: string, code: string): number {
  const rank = DAY_ORDER.indexOf(setType);
  if (rank >= 0) return rank;
  return MAIN_SET_CODES.has(code) ? DAY_ORDER.length : DAY_ORDER.length + 1;
}

/**
 * Group and number the released sets, newest first: the rows arrive newest
 * first, larger first, then by name, and a stable sort puts each day's sets
 * in `DAY_ORDER` (the larger set still first inside a line).
 */
export function placeSets(rows: readonly Omit<ReleasedSet, "group" | "ordinal">[]): ReleasedSet[] {
  const ordinals = lineOrdinals(rows);
  return [...rows]
    .sort(
      (a, b) =>
        (a.releasedAt < b.releasedAt ? 1 : a.releasedAt > b.releasedAt ? -1 : 0) ||
        dayRank(a.setType, a.code) - dayRank(b.setType, b.code),
    )
    .map((row) => ({
      ...row,
      group: setGroup(row.setType, row.code),
      ordinal: ordinals.get(row.code) ?? null,
    }));
}

/**
 * How a line is named: `noun` after an ordinal ("the 71st expansion set"),
 * `one` without one ("a core set"). Masters are "reprint sets" — Scryfall's
 * own definition of the type, and the only word true of all of it:
 * Chronicles (1995), Renaissance and The List are masters-typed too, and
 * none of them is a Masters set.
 */
const LINE_WORDS: Record<string, { noun: string; one: string }> = {
  expansion: { noun: "expansion set", one: "an expansion set" },
  commander: { noun: "Commander set", one: "a Commander set" },
  masters: { noun: "reprint set", one: "a reprint set" },
  draft_innovation: { noun: "draft innovation set", one: "a draft innovation set" },
  core: { noun: "core set", one: "a core set" },
  eternal: { noun: "Universes Beyond Eternal set", one: "a Universes Beyond Eternal set" },
  masterpiece: { noun: "bonus sheet", one: "a bonus sheet" },
  promo: { noun: "promo set", one: "a promo set" },
  token: { noun: "token set", one: "a token set" },
  memorabilia: { noun: "memorabilia set", one: "a memorabilia set" },
  duel_deck: { noun: "Duel Decks set", one: "a Duel Decks set" },
  box: { noun: "boxed set", one: "a boxed set" },
  funny: { noun: "Un-set or funny promo set", one: "an Un-set or funny promo set" },
  starter: { noun: "starter set", one: "a starter set" },
  from_the_vault: { noun: "From the Vault set", one: "a From the Vault set" },
  planechase: { noun: "Planechase set", one: "a Planechase set" },
  archenemy: { noun: "Archenemy set", one: "an Archenemy set" },
  spellbook: { noun: "Signature Spellbook set", one: "a Signature Spellbook set" },
  premium_deck: { noun: "Premium Deck Series set", one: "a Premium Deck Series set" },
  arsenal: { noun: "Commander collection set", one: "a Commander collection set" },
  vanguard: { noun: "Vanguard set", one: "a Vanguard set" },
};

/** Secret Lair Drop is one Scryfall set holding every drop of the series. */
const SECRET_LAIR = { noun: "Secret Lair series", one: "the Secret Lair series" };

function lineWords(setType: string, code: string): { noun: string; one: string } {
  if (code === "sld") return SECRET_LAIR;
  const known = LINE_WORDS[setType];
  if (known) return known;
  // A type Scryfall adds later reads as its own words until it is named here.
  const words = `${setType.replace(/_/g, " ")} set`;
  return { noun: words, one: `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}` };
}

type Placed = Pick<ReleasedSet, "code" | "setType" | "ordinal">;

/** The set header's words: "the 71st expansion set", "a core set", "a bonus sheet". */
export function setPlace(set: Placed): string {
  const words = lineWords(set.setType, set.code);
  return set.ordinal ? `the ${ordinal(set.ordinal)} ${words.noun}` : words.one;
}

/** A picker row's words: "71st expansion set", "core set", "bonus sheet". */
export function setPlaceShort(set: Placed): string {
  const words = lineWords(set.setType, set.code);
  return set.ordinal ? `${ordinal(set.ordinal)} ${words.noun}` : words.noun;
}

/**
 * The picker's match (typed text vs a set), best first: 1 the code exactly
 * ("blb"), 2 the name starts with the text ("blo"), 3 a word of the name
 * starts with it ("moon" → Eldritch Moon), 4 the code starts with it, 5 the
 * name contains it. null = no match. Names go through THE shared normalizer,
 * so "Lorwyn" finds "Lórwyn" and case never matters.
 */
export function setMatchClass(
  set: Pick<ReleasedSet, "code" | "name">,
  query: string,
): number | null {
  return matchClass(set, normalizeCardName(query));
}

/** `setMatchClass` over an already-normalized query. */
function matchClass(set: Pick<ReleasedSet, "code" | "name">, q: string): number | null {
  if (!q) return null;
  const name = normalizeCardName(set.name);
  if (set.code === q) return 1;
  if (name.startsWith(q)) return 2;
  if (name.split(/[^a-z0-9]+/).some((word) => word.startsWith(q))) return 3;
  if (set.code.startsWith(q)) return 4;
  if (name.includes(q)) return 5;
  return null;
}

/**
 * The picker's rows for a typed text: every match, best class first, the
 * list's own order (newest first) inside a class. An empty text matches
 * everything in list order.
 */
export function matchSets<T extends Pick<ReleasedSet, "code" | "name">>(
  sets: readonly T[],
  query: string,
): T[] {
  const q = normalizeCardName(query);
  if (!q) return [...sets];
  return sets
    .map((set, index) => ({ set, index, rank: matchClass(set, q) }))
    .filter((m): m is { set: T; index: number; rank: number } => m.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((m) => m.set);
}

/** The adapter's set field, found by declaration — the gate for the Set group and `?set=`. */
export function setFieldKey(fields: readonly SearchFieldDef[]): string | null {
  return fields.find((f) => f.kind === "set")?.key ?? null;
}
