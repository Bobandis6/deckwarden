/**
 * OP deck analytics (P4.3) — declarative blocks over the main 50, pure and
 * qty-weighted like mtg/analyze.ts. The leader sits outside every number
 * here: its cost slot is life, it never occupies the 50, and validate keeps
 * it out of the main zone.
 *
 * Corpus-verified rules (2026-09-04, game_id 2):
 * - counter_num is only ever 1000 or 2000; absent = no printed counter.
 * - cost_value runs 1..10; NULL cost on non-leaders = the 23 alternative-cost
 *   events Bandai prints with a "−" cost box (they get the "–" bucket, not 0).
 * - "[Blocker]" as a substring overcounts (374 ids): references ("cannot
 *   activate a [Blocker] Character" — ST01-002 Usopp) and conditional grants
 *   ("this Character gains [Blocker]") aren't blockers. A card IS one iff an
 *   occurrence starts its line, follows only bracketed keywords, or opens a
 *   sentence (282 ids; every exclusion hand-checked).
 * - trigger_text always carries the "[Trigger] " prefix; one source quirk
 *   (OP01-009 Carrot) folds the whole trigger into oracle_text instead, so
 *   text *starting* with "[Trigger]" also counts as having one.
 * - Searchers: "Look at N cards from the top of your deck; reveal (up to) K
 *   <target> and add it/them to your hand". Targets that parse into known
 *   components get a row; disjunctions of full clauses ("… or up to 1 …",
 *   7 cards corpus-wide) get none — a missing row is honest, a wrong number
 *   is not.
 */
import type { AnalyticsBlock, CardData, DeckSnapshot } from "../types";
import type { OptcgAttrs } from "./adapter";
import { OPTCG_COLOR_BIT } from "./punk-map";

type OptcgCard = CardData<OptcgAttrs>;

// --- Blocker detection (rule measured against the whole corpus) --------------

/**
 * True iff some "[Blocker]" occurrence is inherent: at line start, after
 * nothing but bracketed keywords, or opening a sentence. Mid-sentence
 * occurrences are references or grants.
 */
export function isBlocker(text: string): boolean {
  let idx = -1;
  while ((idx = text.indexOf("[Blocker]", idx + 1)) >= 0) {
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const prefix = text.slice(lineStart, idx);
    if (prefix.trim() === "") return true;
    if (/^\s*(\[[^\]]*\]\s*)+$/.test(prefix)) return true;
    if (/[.!?)]\s*$/.test(prefix)) return true;
  }
  return false;
}

/** trigger_text is the contract; the OP01-009-style fold is the exception. */
export function hasTrigger(card: OptcgCard): boolean {
  if (card.attrs.trigger_text != null) return true;
  return (card.attrs.oracle_text ?? "").trimStart().startsWith("[Trigger]");
}

// --- Searcher parsing --------------------------------------------------------

const SEARCH_RE =
  /[Ll]ook at (\d+) cards? from the top of your deck[;,.]?\s*(?:then\s+)?reveal (?:up to )?(?:\d+|one|a) (.+?)(?:,? and|,) add (?:it|them|that card) to your hand/;

interface TargetFilter {
  /** Union pool: match any listed name, exact trait, or trait substring. Empty = no pool constraint. */
  names: string[];
  traits: string[];
  traitIncludes: string[];
  /** AND-ed constraints. */
  colorMask: number;
  categories: string[];
  costMin: number | null;
  costMax: number | null;
  powerExact: number | null;
  powerMax: number | null;
  powerMin: number | null;
  needTrigger: boolean;
  /** Exclusions (by name / trait / trait substring). */
  notNames: string[];
  notTraits: string[];
  notTraitIncludes: string[];
}

const FILLER = /\b(?:type|cards?|or)\b|,/g;

/** Pull names/traits/quoted includes out of a fragment; null if anything else remains. */
function pullPool(
  fragment: string,
): { names: string[]; traits: string[]; traitIncludes: string[] } | null {
  let s = fragment;
  const names: string[] = [];
  const traits: string[] = [];
  const traitIncludes: string[] = [];
  s = s.replace(/\{([^}]*)\}/g, (_, t: string) => (traits.push(t), " "));
  s = s.replace(/"([^"]*)"/g, (_, t: string) => (traitIncludes.push(t), " "));
  s = s.replace(/\[([^\]]*)\]/g, (_, t: string) => (names.push(t), " "));
  s = s.replace(/\bwith a type including\b/g, " ");
  if (s.replace(FILLER, " ").trim() !== "") return null;
  return { names, traits, traitIncludes };
}

/**
 * Parse a searcher's reveal-target into components, strictly: any residue the
 * grammar doesn't recognize rejects the card (no row beats a wrong row).
 */
export function parseSearcher(text: string): { look: number; filter: TargetFilter } | null {
  const m = text.match(SEARCH_RE);
  if (!m) return null;
  const look = Number(m[1]);

  const [positive, ...rest] = m[2].split(/\bother than\b/);
  const excluded = pullPool(rest.join(" "));
  if (excluded == null) return null;

  const filter: TargetFilter = {
    names: [],
    traits: [],
    traitIncludes: [],
    colorMask: 0,
    categories: [],
    costMin: null,
    costMax: null,
    powerExact: null,
    powerMax: null,
    powerMin: null,
    needTrigger: false,
    notNames: excluded.names,
    notTraits: excluded.traits,
    notTraitIncludes: excluded.traitIncludes,
  };

  let s = ` ${positive} `;
  // "a total of up to 2 X" — the count is already outside the target model.
  s = s.replace(/^\s*total of (?:up to )?\d+\b/, " ");
  s = s.replace(/\bwith a \[Trigger\]/g, () => ((filter.needTrigger = true), " "));
  s = s.replace(
    /\bwith a (?:base )?cost of (\d+)(?: or (less|more)| to (\d+))?/g,
    (_, n: string, cmp: string | undefined, to: string | undefined) => {
      const v = Number(n);
      if (to != null) [filter.costMin, filter.costMax] = [v, Number(to)];
      else if (cmp === "less") filter.costMax = v;
      else if (cmp === "more") filter.costMin = v;
      else [filter.costMin, filter.costMax] = [v, v];
      return " ";
    },
  );
  s = s.replace(
    /\bwith (\d+) power(?: or (less|more))?/g,
    (_, n: string, cmp: string | undefined) => {
      const v = Number(n);
      if (cmp === "less") filter.powerMax = v;
      else if (cmp === "more") filter.powerMin = v;
      else filter.powerExact = v;
      return " ";
    },
  );
  s = s.replace(/\{([^}]*)\}/g, (_, t: string) => (filter.traits.push(t), " "));
  s = s.replace(/"([^"]*)"/g, (_, t: string) => (filter.traitIncludes.push(t), " "));
  s = s.replace(/\[([^\]]*)\]/g, (_, t: string) => (filter.names.push(t), " "));
  s = s.replace(/\bwith a type including\b/g, " ");
  for (const [color, bit] of Object.entries(OPTCG_COLOR_BIT))
    s = s.replace(new RegExp(`\\b${color}\\b`, "gi"), () => ((filter.colorMask |= bit), " "));
  s = s.replace(
    /\b(Character|Event|Stage)\b/g,
    (_, c: string) => (filter.categories.push(c.toLowerCase()), " "),
  );
  if (s.replace(FILLER, " ").trim() !== "") return null;
  return { look, filter };
}

export function matchesTarget(card: OptcgCard, f: TargetFilter): boolean {
  const traits = card.attrs.traits ?? [];
  if (f.notNames.includes(card.name)) return false;
  if (f.notTraits.some((t) => traits.includes(t))) return false;
  if (f.notTraitIncludes.some((sub) => traits.some((t) => t.includes(sub)))) return false;

  const pooled = f.names.length + f.traits.length + f.traitIncludes.length > 0;
  if (pooled) {
    const inPool =
      f.names.includes(card.name) ||
      f.traits.some((t) => traits.includes(t)) ||
      f.traitIncludes.some((sub) => traits.some((t) => t.includes(sub)));
    if (!inPool) return false;
  }
  if (f.colorMask !== 0 && (card.colorsMask & f.colorMask) === 0) return false;
  if (f.categories.length > 0 && !f.categories.includes(card.attrs.category ?? "")) return false;
  if (f.costMin != null && (card.costValue == null || card.costValue < f.costMin)) return false;
  if (f.costMax != null && (card.costValue == null || card.costValue > f.costMax)) return false;
  const power = card.attrs.power_num;
  if (f.powerExact != null && power !== f.powerExact) return false;
  if (f.powerMin != null && (power == null || power < f.powerMin)) return false;
  if (f.powerMax != null && (power == null || power > f.powerMax)) return false;
  if (f.needTrigger && !hasTrigger(card)) return false;
  return true;
}

// --- Hypergeometric ----------------------------------------------------------

/** P(≥1 of `hits` among `draws` from `population`), exact product form. */
export function pAtLeastOne(population: number, hits: number, draws: number): number {
  if (population <= 0 || hits <= 0) return 0;
  const d = Math.min(draws, population);
  let pNone = 1;
  for (let i = 0; i < d; i++) {
    const misses = population - hits - i;
    if (misses <= 0) return 1;
    pNone *= misses / (population - i);
  }
  return 1 - pNone;
}

// --- The dashboard -----------------------------------------------------------

const CURVE_LABELS = ["–", "1", "2", "3", "4", "5", "6", "7", "8+"] as const;

export function analyzeOptcg(
  deck: DeckSnapshot,
  cards: ReadonlyMap<string, OptcgCard>,
): AnalyticsBlock[] {
  // Main zone only — the leader's slot has no cost, counter, or category ratio.
  const entries = (deck.zones.main ?? [])
    .map((e) => ({ qty: e.qty, card: cards.get(e.cardId) }))
    .filter((e): e is { qty: number; card: OptcgCard } => e.card != null);
  const mainQty = entries.reduce((n, e) => n + e.qty, 0);

  const curve = new Array<number>(CURVE_LABELS.length).fill(0);
  let counter1k = 0;
  let counter2k = 0;
  let counterSum = 0;
  let counterlessCharacters = 0;
  let blockerQty = 0;
  let triggerQty = 0;
  const categoryQty = new Map<string, number>();

  for (const { qty, card } of entries) {
    const cost = card.costValue;
    curve[cost == null ? 0 : Math.min(cost, 8)] += qty;

    const counter = card.attrs.counter_num;
    if (counter === 1000) counter1k += qty;
    else if (counter === 2000) counter2k += qty;
    if (counter != null) counterSum += counter * qty;
    const category = card.attrs.category ?? "character";
    if (category === "character" && counter == null) counterlessCharacters += qty;

    if (isBlocker(card.attrs.oracle_text ?? "")) blockerQty += qty;
    if (hasTrigger(card)) triggerQty += qty;
    categoryQty.set(category, (categoryQty.get(category) ?? 0) + qty);
  }

  // One row per distinct searcher; each copy has the same odds. Population is
  // a fresh deck minus the resolving copy (disclosed in the block title), so
  // a searcher matching its own filter targets one copy fewer.
  const searcherRows: { name: string; look: number; targets: number; pct: number }[] = [];
  for (const { card } of entries) {
    const parsed = parseSearcher(card.attrs.oracle_text ?? "");
    if (!parsed) continue;
    let targets = 0;
    for (const e of entries) targets += matchesTarget(e.card, parsed.filter) ? e.qty : 0;
    if (matchesTarget(card, parsed.filter)) targets -= 1;
    const population = mainQty - 1;
    const pct = Math.round(pAtLeastOne(population, targets, parsed.look) * 100);
    searcherRows.push({ name: card.name, look: parsed.look, targets, pct });
  }
  searcherRows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

  const CATEGORY_LABEL: Record<string, string> = {
    character: "Characters",
    event: "Events",
    stage: "Stages",
    leader: "Leaders", // never expected in main; surfaced rather than hidden
  };

  return [
    {
      kind: "histogram",
      id: "don-curve",
      title: "DON!! curve",
      buckets: curve.map((value, i) => ({ label: CURVE_LABELS[i], value })),
    },
    { kind: "stat", id: "counter-1k", title: "+1000 counters", value: String(counter1k) },
    { kind: "stat", id: "counter-2k", title: "+2000 counters", value: String(counter2k) },
    {
      kind: "stat",
      id: "counter-total",
      title: "Counter total",
      value: counterSum === 0 ? "0" : `+${counterSum.toLocaleString("en-US")}`,
      hint: "Sum of printed counters",
    },
    {
      kind: "stat",
      id: "no-counter",
      title: "No counter",
      value: String(counterlessCharacters),
      hint: "Characters without a counter",
    },
    {
      kind: "stat",
      id: "blockers",
      title: "Blockers",
      value: String(blockerQty),
      hint: "Printed [Blocker]",
    },
    {
      kind: "stat",
      id: "trigger-density",
      title: "Triggers",
      value: String(triggerQty),
      hint:
        mainQty > 0
          ? `${Math.round((triggerQty / mainQty) * 100)}% of ${mainQty} cards`
          : undefined,
    },
    {
      kind: "breakdown",
      id: "categories",
      title: "Card types",
      slices: [...categoryQty.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, value]) => ({ label: CATEGORY_LABEL[category] ?? category, value })),
    },
    {
      kind: "table",
      id: "searchers",
      title: "Searcher hit rates (fresh deck)",
      columns: ["Card", "Looks", "Targets", "Hit %"],
      rows: searcherRows.map((r) => [r.name, r.look, r.targets, r.pct]),
    },
  ];
}
