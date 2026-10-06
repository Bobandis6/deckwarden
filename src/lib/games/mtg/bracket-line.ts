/**
 * The bracket line's words (Y4a, WAVE4 D5) — what the deck pane says about a
 * read before "Why?". Adapter data, like the read's own sentences
 * (./brackets.ts): the editor now and the share page from Y5 say the same
 * line, and D0's copy guard reads it (bracket-line.test.ts). Plain words,
 * bracket numbers first, never notation. Core adds "Why?", its own lines
 * while the combo facts load or fail ("Checking combos…", "Couldn't check
 * combos · Retry"), and a draft's progress phrase ("add 34 more cards" —
 * src/lib/decks/progress.ts owns it).
 *
 * D5's table, word for word where it speaks:
 * - nothing flagged — "Bracket 1–2 · nothing here goes past Core"
 * - a minimum — "At least Bracket 3 (Upgraded)", "At least Bracket 4 (Optimized)"
 * - a call pending — "Bracket 3 or 4 — one combo is your call"
 * - with answers — "Bracket 4 (Optimized) — from the cards and your answers"
 * - a draft — "Bracket: add 34 more cards · 1 Game Changer so far"
 * - a banned card — "Bracket read needs a legal list · 1 banned card"
 *
 * And the lines it leaves out (REDESIGN "Y4a decisions"):
 * - a minimum of 2 — "At least Bracket 2 (Core)" (one extra-turn card, or a
 *   combo Commander Spellbook rates 2);
 * - a read that couldn't check everything leads with its floor and names the
 *   gap — "At least Bracket 3 (Upgraded) · Couldn't check extra turns"; with
 *   nothing flagged it claims nothing — "Bracket read incomplete · Couldn't
 *   check combos";
 * - a card that isn't legal is never called banned — "· 1 card not legal in
 *   Commander".
 *
 * Y4b adds the player's side (REDESIGN "Y4b decisions"):
 * - a declared target leads, the read beside it in "the cards say" words —
 *   D5's "Your target 2 · the cards say 3+" without the notation D0 forbids:
 *   "Your target: Bracket 2 · the cards say at least 3"; at or above what
 *   the cards prove it reads the same way ("Your target: Bracket 3 · the
 *   cards say at least 2", "… · nothing here goes past Core"), so the
 *   target never hides the read (D11). A draft's and a blocked list's lines
 *   don't change: the sheet shows the target there;
 * - answers with a call still open say both — "Bracket 3 or 4 — from the
 *   cards and your answers · one combo is your call".
 *
 * It reads the ids ./brackets.ts gives its lines: factors `game-changers`,
 * `land-denial`, `extra-turns`, `combo:<key>`, `unchecked:<feed>`,
 * `unchecked:combo:<key>`, `unchecked:cards`; questions `land-denial:<oracle
 * id>`, `extra-turns:<oracle ids>`, `combo:<key>`.
 */
import type { BracketLineContext, BracketQuestion, BracketRead, BracketsMeta } from "../types";
import type { MtgAttrs } from "./attrs";
import { BRACKET_RULESET } from "./bracket-ruleset";
import { mtgFormat } from "./formats";
import { legalityIssue } from "./validate";

const LEVELS = BRACKET_RULESET.levels;
const NOUN = "Bracket";

/** "Bracket 3 (Upgraded)". */
function named(level: number): string {
  const name = LEVELS.find((l) => l.level === level)?.name;
  return name ? `${NOUN} ${level} (${name})` : `${NOUN} ${level}`;
}

/**
 * The brackets a list with nothing flagged can't tell apart: those barring
 * every kind of card the read flags (Game Changers, mass land denial,
 * two-card combos) — Exhibition and Core, which differ only by intent (and
 * by one extra-turn card, which the read would show). WAVE4 D4's "1–2".
 */
const UNFLAGGED = LEVELS.filter(
  (l) => l.gameChangers === 0 && !l.landDenial && l.twoCardCombos === "none",
);
const UNFLAGGED_LOW = UNFLAGGED[0];
const UNFLAGGED_TOP = UNFLAGGED[UNFLAGGED.length - 1];
const UNFLAGGED_RANGE = `${UNFLAGGED_LOW.level}–${UNFLAGGED_TOP.level}`;

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
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
function joinList(items: readonly string[], last: "and" | "or"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${last} ${items[items.length - 1]}`;
}

/** Copies of these cards in the list, every zone — the read counts Game Changers and extra turns by copy. */
function copiesOf(ctx: BracketLineContext<MtgAttrs>, ids: readonly string[]): number {
  const wanted = new Set(ids);
  let n = 0;
  for (const entries of Object.values(ctx.deck.zones)) {
    for (const e of entries) if (wanted.has(e.cardId)) n += e.qty;
  }
  return n;
}

/** A draft's findings so far: "1 Game Changer", "2 Game Changers and 1 combo". */
function foundSoFar(read: BracketRead, ctx: BracketLineContext<MtgAttrs>): string | null {
  const found = read.factors.filter((f) => f.atLeast !== null);
  const parts: string[] = [];
  const gameChangers = found.find((f) => f.id === "game-changers");
  if (gameChangers) {
    const n = copiesOf(ctx, gameChangers.cards);
    parts.push(`${n} ${plural(n, "Game Changer", "Game Changers")}`);
  }
  const combos = found.filter((f) => f.combo !== undefined).length;
  if (combos > 0) parts.push(`${combos} ${plural(combos, "combo", "combos")}`);
  const landDenial = found.find((f) => f.id === "land-denial");
  if (landDenial) {
    const n = landDenial.cards.length;
    parts.push(`${n} land-denial ${plural(n, "card", "cards")}`);
  }
  const extraTurns = found.find((f) => f.id === "extra-turns");
  if (extraTurns) {
    const n = copiesOf(ctx, extraTurns.cards);
    parts.push(`${n} extra-turn ${plural(n, "card", "cards")}`);
  }
  return parts.length > 0 ? joinList(parts, "and") : null;
}

/** What a "Couldn't check" line is about, in the line's few words. */
const FEED_GAPS: Readonly<Record<string, string>> = {
  "unchecked:gameChangers": "Game Changers",
  "unchecked:landDenial": "mass land denial",
  "unchecked:extraTurns": "extra turns",
  "unchecked:combos": "combos",
};

function gaps(read: BracketRead): string[] {
  const out: string[] = [];
  let combos = 0;
  for (const f of read.factors) {
    if (f.atLeast !== null) continue;
    if (f.id === "unchecked:cards") {
      out.push(`${f.cards.length} ${plural(f.cards.length, "card", "cards")}`);
    } else if (f.id.startsWith("unchecked:combo:")) {
      combos++;
    } else if (FEED_GAPS[f.id]) {
      out.push(FEED_GAPS[f.id]);
    }
  }
  if (combos > 0) out.push(`${numberWord(combos)} ${plural(combos, "combo", "combos")}`);
  return out;
}

/** "one combo is your call", "two cards are your call", "chaining extra turns is your call". */
function yourCall(open: readonly BracketQuestion[]): string {
  const combos = open.filter((q) => q.combo !== undefined).length;
  const cards = open.filter((q) => q.id.startsWith("land-denial:")).length;
  const chaining = open.filter((q) => q.id.startsWith("extra-turns:")).length;
  const other = open.length - combos - cards - chaining;
  const parts: string[] = [];
  if (combos > 0) parts.push(`${numberWord(combos)} ${plural(combos, "combo", "combos")}`);
  if (cards > 0) parts.push(`${numberWord(cards)} ${plural(cards, "card", "cards")}`);
  if (chaining > 0) parts.push("chaining extra turns");
  if (other > 0) parts.push(`${numberWord(other)} ${plural(other, "question", "questions")}`);
  const singular = parts.length === 1 && combos + cards + other <= 1;
  return `${joinList(parts, "and")} ${singular ? "is" : "are"} your call`;
}

/**
 * The brackets a pending call leaves open: "3 or 4", "2, 3 or 4", and the
 * unflagged pair as one ("1–2 or 4") unless its top is an outcome itself.
 */
function outcomes(levels: readonly number[]): string {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  const items = sorted.map((l) =>
    l === UNFLAGGED_LOW.level && !sorted.includes(UNFLAGGED_TOP.level)
      ? UNFLAGGED_RANGE
      : String(l),
  );
  return joinList(items, "or");
}

function blockedLine(read: BracketRead, ctx: BracketLineContext<MtgAttrs>): string {
  let banned = 0;
  for (const id of read.blockedBy) {
    const card = ctx.cards.get(id);
    if (card && legalityIssue(card)?.code === "BANNED") banned++;
  }
  const notLegal = read.blockedBy.length - banned;
  const format = mtgFormat(ctx.deck.formatCode)?.label ?? "this format";
  const parts: string[] = [];
  if (banned > 0) parts.push(`${banned} banned ${plural(banned, "card", "cards")}`);
  if (notLegal > 0) {
    parts.push(`${notLegal} ${plural(notLegal, "card", "cards")} not legal in ${format}`);
  }
  return `${NOUN} read needs a legal list · ${joinList(parts, "and")}`;
}

/** The questions still open above where the cards and the answers settle. */
function openCalls(read: BracketRead, settled: number): BracketQuestion[] {
  if (read.status !== "review") return [];
  return read.review.filter(
    (q) => (q.answer === null || q.answer === "unsure") && q.raisesTo > settled,
  );
}

/**
 * The read beside a declared target (Y4b): "the cards say at least 3",
 * "the cards and your answers say 4", "the cards say 3 or 4 — one combo is
 * your call", "nothing here goes past Core", or what couldn't be checked.
 */
function cardsSay(read: BracketRead): string {
  if (read.status === "unavailable") {
    const missed = gaps(read);
    const parts: string[] = [];
    if (read.minimum > UNFLAGGED_LOW.level) parts.push(`the cards say at least ${read.minimum}`);
    if (missed.length > 0) parts.push(`Couldn't check ${joinList(missed, "and")}`);
    return parts.length > 0 ? parts.join(" · ") : `${NOUN} read incomplete`;
  }
  const answered = read.suggested !== null;
  const say = answered ? "the cards and your answers say" : "the cards say";
  const settled = read.suggested ?? read.minimum;
  const open = openCalls(read, settled);
  if (open.length > 0) {
    return `${say} ${outcomes([settled, ...open.map((q) => q.raisesTo)])} — ${yourCall(open)}`;
  }
  if (answered) return `${say} ${settled}`;
  if (read.minimum <= UNFLAGGED_LOW.level) {
    return `nothing here goes past ${UNFLAGGED_TOP.name}`;
  }
  return `the cards say at least ${read.minimum}`;
}

/** The read in one line — `mtgBrackets.line`. */
export function mtgBracketLine(read: BracketRead, ctx: BracketLineContext<MtgAttrs>): string {
  if (read.status === "blocked") return blockedLine(read, ctx);
  if (read.status === "draft") {
    const found = foundSoFar(read, ctx);
    return `${NOUN}: ${ctx.progress ?? "add more cards"}${found ? ` · ${found} so far` : ""}`;
  }
  const target = ctx.targetLevel ?? null;
  if (target !== null) return `Your target: ${NOUN} ${target} · ${cardsSay(read)}`;
  if (read.status === "unavailable") {
    const missed = gaps(read);
    const lead =
      read.minimum > UNFLAGGED_LOW.level
        ? `At least ${named(read.minimum)}`
        : `${NOUN} read incomplete`;
    return missed.length > 0 ? `${lead} · Couldn't check ${joinList(missed, "and")}` : lead;
  }
  const settled = read.suggested ?? read.minimum;
  const open = openCalls(read, settled);
  if (open.length > 0) {
    const range = `${NOUN} ${outcomes([settled, ...open.map((q) => q.raisesTo)])}`;
    return read.suggested !== null
      ? `${range} — from the cards and your answers · ${yourCall(open)}`
      : `${range} — ${yourCall(open)}`;
  }
  if (read.suggested !== null) return `${named(read.suggested)} — from the cards and your answers`;
  if (read.minimum <= UNFLAGGED_LOW.level) {
    return `${NOUN} ${UNFLAGGED_RANGE} · nothing here goes past ${UNFLAGGED_TOP.name}`;
  }
  return `At least ${named(read.minimum)}`;
}

/** A Scryfall Tagger tag's page, by the slug data/mtg/tagger-overrides.json pins (bracket-line.test.ts checks both). */
const taggerTag = (slug: string) => `https://tagger.scryfall.com/tags/card/${slug}`;

/** `mtgBrackets.links`: Wizards' pages for the rules and the Game Changers; Tagger's tag pages for its two flags. */
export const MTG_BRACKET_LINKS: BracketsMeta<MtgAttrs>["links"] = {
  rules: { label: "Wizards' Commander Brackets", href: BRACKET_RULESET.sources.brackets },
  source(id) {
    // A factor's id, a question's (`land-denial:<oracle id>`), or a gap's (`unchecked:<feed>`).
    switch (id.replace(/^unchecked:/, "").split(":")[0]) {
      case "game-changers":
      case "gameChangers":
        return BRACKET_RULESET.sources.gameChangers;
      case "land-denial":
      case "landDenial":
        return taggerTag("mass-land-denial");
      case "extra-turns":
      case "extraTurns":
        return taggerTag("extra-turn");
      default:
        return null;
    }
  },
};
