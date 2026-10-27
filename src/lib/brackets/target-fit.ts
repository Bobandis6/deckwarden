/**
 * BRACKET-FIT (the owner's ask of 2026-10-24: "once you set a target
 * bracket after your deck is built can we have a button to swap all the
 * suggested cards all at once to make it that desired bracket"): the
 * fewest swaps that bring a deck to its target, as data. Pure and
 * client-safe: the "Swap to fit" sheet asks Swap Lab's route
 * (`POST /api/alternatives`) one card at a time and hands every answer
 * here; this module decides which cards go out, which alternative each one
 * takes, which card to ask about next, and what the swaps can't fix.
 *
 * - **What each conflict needs** is the adapter's (`brackets.fixes`): at
 *   least `remove` of the cards in `from` must leave. Core names no rule.
 * - **Which cards can go** (`targetFitCards`): a main-list card the adapter
 *   offers alternatives for, run as one copy (a swap takes one), holding at
 *   least one of the adapter's roles read off its attrs, as Fit reads them
 *   (a card the route would answer "no-roles" is never asked about). Once
 *   asked, only a card with an option; never one the player keeps.
 * - **The options** are the route's rows in its order, none the goals hid
 *   and none over the per-card budget: the first FIT_OPTIONS. Each was
 *   judged in the card's place under the target. Price is never a rule here
 *   (it is the sheet's footer line).
 * - **The choice** is a small set multicover (`fewestCover`): every card a
 *   fix can't do without goes first (a fix whose `remove` is all its
 *   available cards), then, repeatedly, the card that serves the most unmet
 *   need (a Game Changer that is also a combo piece counts twice). Ties go
 *   to a card known to have options, then one already asked about, then one
 *   not asked yet; then the card whose first option shares the most roles;
 *   then name order, so the plan is deterministic. That greedy answer is
 *   the bound for an exact branch and bound, which keeps it unless a
 *   smaller cover exists: the greedy alone is not always the fewest (three
 *   combos sharing one piece against two combos each, for one), and the
 *   brief's bar is the exact minimum.
 * - **The picks**: the player's own choices first, then each card its
 *   best-ranked option not already coming in for another (a matching, so
 *   no incoming card is picked twice and no card goes without one while a
 *   re-route would give it one). A card whose options are all taken is
 *   planned around like a card with none: "Remove A or B", A has none, so
 *   B goes.
 * - **The asks** follow the plan: the cards going out that weren't asked
 *   about yet, in plan order. Past the ask limit, a card never asked about
 *   is planned around too, and what it would have fixed is named.
 *
 * What it can't fix comes back per fix, with the reason for every card that
 * stays: the commander's part (commanders are never swapped here), no
 * alternatives offered for that kind of card, several copies, no roles yet,
 * no alternative under the goals, kept by the player, or not looked at.
 */
import type { DeckGoals } from "@/lib/decks/goals";
import { toDeckSnapshot, type SnapshotEntry } from "@/lib/decks/validation";
import type {
  BracketFix,
  BracketInput,
  BracketRead,
  CardData,
  FormatDef,
  GameAdapter,
  SwapMeta,
} from "@/lib/games/types";
import { FIT_ASK_LIMIT, FIT_BATCH, FIT_OPTIONS } from "@/lib/recommend/fit";

/** Cards asked about per open, at most: Fit's limit, under a third of the alternatives bucket (30 a minute). */
export const TARGET_FIT_ASK_LIMIT = FIT_ASK_LIMIT;
/** Asked together, in plan order. */
export const TARGET_FIT_BATCH = FIT_BATCH;
/** The exact search's node bound; past it the greedy (or the best cover found) stands. */
export const COVER_BUDGET = 200_000;

/** Why a card a fix names can never go out here. */
export type TargetFitBlock = "not-offered" | "copies" | "no-roles";
/** Why a card a fix names stays in the list. */
export type TargetFitStay = TargetFitBlock | "kept" | "none" | "not-asked";

/** A card some fix names, as the plan sees it. */
export interface TargetFitCard {
  id: string;
  name: string;
  /** The zone of its entry, where a swap lands; null when the list has none the plan can swap. */
  zone: string | null;
  /** Its copies there. */
  qty: number;
  /** null = it can go out (once it has an option). */
  block: TargetFitBlock | null;
}

/** What a route row needs to be an option. */
export interface TargetFitRow {
  cardId: string;
  name: string;
  cheapestUsd: string | null;
  /** The roles it shares with the card going out, the adapter's keys. */
  shared: readonly string[];
  conflicts: readonly { rule: string; severity: "hide" | "flag" }[];
}

/** One asked card: its rows, or the ask's failure (a 429 is `limited`). */
export type TargetFitAnswer<R> =
  { status: "done"; rows: readonly R[] } | { status: "error"; limited: boolean };

/** The player's own calls, which the plan keeps to. */
export interface TargetFitOverrides {
  /** Cards that stay: never out. */
  keep: ReadonlySet<string>;
  /** Cards the player swaps out ("Swap B instead", or a kept row checked again): out while they can be. */
  swap: ReadonlySet<string>;
  /** The option the player chose for a card. */
  picks: ReadonlyMap<string, string>;
}

export const NO_OVERRIDES: TargetFitOverrides = {
  keep: new Set(),
  swap: new Set(),
  picks: new Map(),
};

/** One card going out. */
export interface TargetFitOut<R> {
  id: string;
  name: string;
  zone: string;
  /** The fixes its leaving serves (their factor ids), fix order. */
  fixes: string[];
  /** Its options, one to FIT_OPTIONS; empty while it waits for its answer. */
  options: R[];
  /** The option coming in; null while it waits. */
  pick: R | null;
}

/** A fix the plan can't meet, and why. */
export interface TargetFitShort {
  factor: string;
  /** How many more must leave than the plan can take out. */
  short: number;
  /** The part of `remove` only commanders hold (they never go). */
  commander: number;
  /** The fix's cards that stay, grouped by reason, each group in the fix's order. */
  stays: { reason: TargetFitStay; ids: string[] }[];
}

export interface TargetFitPlan<R> {
  /** The cards going out: the fixes' order, each fix's cards in its order. */
  outs: TargetFitOut<R>[];
  /** Cards going out not asked about yet: the next to ask, in order. */
  ask: string[];
  /** Cards going out asked about without an answer: in flight, or failed. */
  waiting: string[];
  /** The cards the player keeps, fix order (their rows stay, unchecked). */
  kept: string[];
  /**
   * A fix needing one card, met by a card that serves it alone: the other
   * cards it could take instead, by the fix's factor id.
   */
  instead: ReadonlyMap<string, string[]>;
  /** The fixes the plan can't meet, fix order. */
  short: TargetFitShort[];
  /** Past the ask limit: how many more cards the plan would have asked about. */
  notAsked: number;
  /** The outs with a pick: what Swap applies. */
  swaps: number;
  /** The cover is the exact minimum (false only past COVER_BUDGET). */
  exact: boolean;
}

// --- The cards and their options ------------------------------------------------------

function holdsRole(card: CardData, path: string, declared: ReadonlySet<string>): boolean {
  const roles = (card.attrs as Record<string, unknown>)[path];
  return Array.isArray(roles) && roles.some((r) => typeof r === "string" && declared.has(r));
}

/** Every card some fix names, with where it sits and whether it can go out. */
export function targetFitCards({
  fixes,
  entries,
  cards,
  format,
  swap,
}: {
  fixes: readonly BracketFix[];
  entries: readonly { cardId: string; zone: string; qty: number }[];
  cards: ReadonlyMap<string, CardData>;
  format: FormatDef;
  swap: Pick<SwapMeta, "offers" | "rolesPath" | "roles">;
}): Map<string, TargetFitCard> {
  const swappable = new Set(
    format.zones.filter((z) => !z.isLeaderZone && z.countsTowardSize).map((z) => z.id),
  );
  const declared = new Set(swap.roles.map((r) => r.key));
  const out = new Map<string, TargetFitCard>();
  for (const fix of fixes) {
    for (const id of fix.from) {
      if (out.has(id)) continue;
      const card = cards.get(id);
      const held = entries.filter((e) => e.cardId === id && swappable.has(e.zone));
      const qty = held.reduce((n, e) => n + e.qty, 0);
      const zone = held[0]?.zone ?? null;
      const block: TargetFitBlock | null =
        !card || zone === null || !swap.offers(card)
          ? "not-offered"
          : qty !== 1
            ? "copies"
            : !holdsRole(card, swap.rolesPath, declared)
              ? "no-roles"
              : null;
      out.set(id, { id, name: card?.name ?? id, zone, qty, block });
    }
  }
  return out;
}

/** A card's options: the route's rows in its order, none hidden and none over the per-card budget. */
export function targetFitOptions<R extends TargetFitRow>(rows: readonly R[]): R[] {
  return rows
    .filter((r) => !r.conflicts.some((c) => c.rule === "budget" || c.severity === "hide"))
    .slice(0, FIT_OPTIONS);
}

/** The read's fixes for the list as the editor holds it: the input the read was assessed from. */
export function targetFitFixes({
  adapter,
  format,
  entries,
  cards,
  read,
  combos,
  freshness,
  goals,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  entries: readonly SnapshotEntry[];
  cards: ReadonlyMap<string, CardData>;
  read: BracketRead;
  combos: BracketInput["combos"];
  freshness: BracketInput["freshness"];
  goals: DeckGoals | null;
}): BracketFix[] {
  const targetLevel = goals?.targetLevel ?? null;
  const fixes = adapter.brackets?.fixes;
  if (!fixes || targetLevel === null) return [];
  return fixes(read, {
    deck: toDeckSnapshot(adapter.id, format, entries),
    cards,
    combos,
    freshness,
    targetLevel,
    answers: goals?.answers ?? null,
  });
}

/**
 * The conflict callout's door: the game declares fixes and Swap Lab, and
 * the read has a conflict to fix. It shows even when no card can go out
 * (the owner's call of 2026-10-27: a door that hid itself read as a missing
 * button); the sheet then says why each card stays.
 */
export function targetFitDoor(input: Parameters<typeof targetFitFixes>[0]): boolean {
  if (!input.adapter.recommend?.swap) return false;
  return targetFitFixes(input).length > 0;
}

// --- The cover --------------------------------------------------------------------------

/** One fix's need over the cards that can go: `need` of `cards`. */
export interface CoverDemand {
  need: number;
  cards: readonly string[];
}

/**
 * The fewest cards meeting every demand (each card counts once toward
 * every demand it is in). Forced cards first, then every demand's cards
 * where it needs them all, then the greedy (the most unmet need, ties to
 * the earlier card in `order`); then an exact branch and bound from that
 * bound, which replaces it only with a smaller cover. A demand needing
 * more than its cards is capped at all of them. Cards come back in
 * `order`'s order.
 */
export function fewestCover({
  demands,
  forced = new Set<string>(),
  order,
  budget = COVER_BUDGET,
}: {
  demands: readonly CoverDemand[];
  forced?: ReadonlySet<string>;
  /** Every card of every demand, best first: ties go to the earlier. A card not here is never taken. */
  order: readonly string[];
  budget?: number;
}): { cards: string[]; exact: boolean } {
  const rank = new Map(order.map((id, i) => [id, i]));
  const byRank = (a: string, b: string) => rank.get(a)! - rank.get(b)!;
  const sets = demands.map((d) => [...new Set(d.cards.filter((id) => rank.has(id)))].sort(byRank));
  const member = new Map<string, number[]>();
  sets.forEach((set, i) => {
    for (const id of set) member.set(id, [...(member.get(id) ?? []), i]);
  });
  const left = demands.map((d, i) => Math.max(0, Math.min(d.need, sets[i].length)));

  const chosen = new Set<string>();
  const take = (id: string, need: number[]) => {
    chosen.add(id);
    for (const i of member.get(id) ?? []) need[i] -= 1;
  };
  for (const id of [...forced].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))) {
    if (member.has(id) && !chosen.has(id)) take(id, left);
  }
  sets.forEach((set, i) => {
    if (left[i] > 0 && sets[i].filter((id) => !chosen.has(id)).length <= left[i]) {
      for (const id of set) if (!chosen.has(id)) take(id, left);
    }
  });

  // The greedy: the most unmet need, ties to the earlier card.
  const greedy = new Set(chosen);
  const greedyLeft = [...left];
  for (;;) {
    let best: string | null = null;
    let bestGain = 0;
    for (const id of order) {
      if (greedy.has(id)) continue;
      const gain = (member.get(id) ?? []).filter((i) => greedyLeft[i] > 0).length;
      if (gain > bestGain) {
        best = id;
        bestGain = gain;
      }
    }
    if (best === null) break;
    greedy.add(best);
    for (const i of member.get(best)!) greedyLeft[i] -= 1;
  }

  // The exact search, bounded by the greedy's size.
  let best = [...greedy];
  let nodes = 0;
  let exact = true;
  const current = new Set(chosen);
  const need = [...left];
  const excluded = new Set<string>();
  const free = (id: string) => !current.has(id) && !excluded.has(id);
  const search = () => {
    nodes += 1;
    if (nodes > budget) {
      exact = false;
      return;
    }
    let open = -1;
    let fewest = Infinity;
    let maxNeed = 0;
    let sum = 0;
    for (let i = 0; i < sets.length; i++) {
      if (need[i] <= 0) continue;
      const room = sets[i].filter(free).length;
      if (room < need[i]) return;
      sum += need[i];
      maxNeed = Math.max(maxNeed, need[i]);
      if (room < fewest) {
        fewest = room;
        open = i;
      }
    }
    if (open < 0) {
      if (current.size < best.length) best = [...current];
      return;
    }
    let maxGain = 1;
    for (const [id, demandsOf] of member) {
      if (!free(id)) continue;
      maxGain = Math.max(maxGain, demandsOf.filter((i) => need[i] > 0).length);
    }
    if (current.size + Math.max(maxNeed, Math.ceil(sum / maxGain)) >= best.length) return;
    const tried: string[] = [];
    for (const id of sets[open].filter(free)) {
      current.add(id);
      for (const i of member.get(id)!) need[i] -= 1;
      search();
      current.delete(id);
      for (const i of member.get(id)!) need[i] += 1;
      if (!exact) break;
      excluded.add(id);
      tried.push(id);
    }
    for (const id of tried) excluded.delete(id);
  };
  search();
  return { cards: best.sort(byRank), exact };
}

// --- The plan ---------------------------------------------------------------------------

/**
 * Each card going out takes an option: the player's choices first, then
 * plan order, each its best-ranked option not coming in for another — with
 * re-routing (a matching), so a card goes without only when no
 * arrangement gives it one. The player's choices are never moved.
 */
function assignPicks<R extends TargetFitRow>(
  order: readonly string[],
  options: ReadonlyMap<string, readonly R[]>,
  chosen: ReadonlyMap<string, string>,
): Map<string, R> {
  const owner = new Map<string, string>();
  const pick = new Map<string, R>();
  const fixed = new Set<string>();
  for (const id of order) {
    const want = chosen.get(id);
    const option = want ? options.get(id)?.find((o) => o.cardId === want) : undefined;
    if (!option || owner.has(option.cardId)) continue;
    owner.set(option.cardId, id);
    pick.set(id, option);
    fixed.add(id);
  }
  const assign = (id: string, option: R) => {
    owner.set(option.cardId, id);
    pick.set(id, option);
  };
  // Its best free option first; only when none is free, one whose holder can move to another.
  const place = (id: string, seen: Set<string>): boolean => {
    const mine = options.get(id) ?? [];
    const open = mine.find((o) => !owner.has(o.cardId));
    if (open) {
      assign(id, open);
      return true;
    }
    for (const option of mine) {
      if (seen.has(option.cardId)) continue;
      seen.add(option.cardId);
      const holder = owner.get(option.cardId)!;
      if (!fixed.has(holder) && place(holder, seen)) {
        assign(id, option);
        return true;
      }
    }
    return false;
  };
  for (const id of order) if (!pick.has(id)) place(id, new Set());
  return pick;
}

/**
 * The plan over the answers so far. `asked` holds every card asked about
 * this open (answered, failed or in flight); `canAsk` is false once the
 * ask limit is spent.
 */
export function planTargetFit<R extends TargetFitRow>({
  fixes,
  cards,
  answers,
  asked,
  canAsk,
  overrides = NO_OVERRIDES,
}: {
  fixes: readonly BracketFix[];
  cards: ReadonlyMap<string, TargetFitCard>;
  answers: ReadonlyMap<string, TargetFitAnswer<R>>;
  asked: ReadonlySet<string>;
  canAsk: boolean;
  overrides?: TargetFitOverrides;
}): TargetFitPlan<R> {
  const options = new Map<string, R[]>();
  for (const [id, a] of answers) if (a.status === "done") options.set(id, targetFitOptions(a.rows));

  const stay = new Map<string, TargetFitStay>();
  for (const c of cards.values()) {
    if (c.block) stay.set(c.id, c.block);
    else if (overrides.keep.has(c.id)) stay.set(c.id, "kept");
    else if (options.get(c.id)?.length === 0) stay.set(c.id, "none");
  }
  const neverAsked = (id: string) => !answers.has(id) && !asked.has(id);
  const orderOf = (available: (id: string) => boolean) => {
    const status = (id: string) => (options.has(id) ? 0 : asked.has(id) ? 1 : 2);
    const shares = (id: string) => options.get(id)?.[0]?.shared.length ?? 0;
    return [...cards.keys()]
      .filter(available)
      .sort(
        (a, b) =>
          status(a) - status(b) ||
          shares(b) - shares(a) ||
          cards.get(a)!.name.localeCompare(cards.get(b)!.name, "en") ||
          a.localeCompare(b),
      );
  };
  const cover = (available: (id: string) => boolean) => {
    const order = orderOf(available);
    return fewestCover({
      demands: fixes.map((f) => ({ need: f.remove, cards: f.from.filter(available) })),
      forced: new Set([...overrides.swap].filter(available)),
      order,
    });
  };
  const inPlanOrder = (ids: ReadonlySet<string>) => {
    const listed: string[] = [];
    for (const f of fixes)
      for (const id of f.from) if (ids.has(id) && !listed.includes(id)) listed.push(id);
    return listed;
  };

  // Past the ask limit, a card never asked about is planned around.
  if (!canAsk)
    for (const id of cards.keys()) if (!stay.has(id) && neverAsked(id)) stay.set(id, "not-asked");

  for (;;) {
    const available = (id: string) => cards.has(id) && !stay.has(id);
    const { cards: chosen, exact } = cover(available);
    const out = inPlanOrder(new Set(chosen));
    const picks = assignPicks(out, options, overrides.picks);
    // Options all coming in for other cards: planned around, like none.
    const without = out.filter((id) => (options.get(id)?.length ?? 0) > 0 && !picks.has(id));
    if (without.length > 0) {
      for (const id of without) stay.set(id, "none");
      continue;
    }

    const outSet = new Set(out);
    const outs: TargetFitOut<R>[] = out.map((id) => {
      const c = cards.get(id)!;
      return {
        id,
        name: c.name,
        zone: c.zone!,
        fixes: fixes.filter((f) => f.from.includes(id)).map((f) => f.factor),
        options: options.get(id) ?? [],
        pick: picks.get(id) ?? null,
      };
    });
    const kept = inPlanOrder(
      new Set([...overrides.keep].filter((id) => cards.get(id)?.block === null)),
    );
    const instead = new Map<string, string[]>();
    for (const f of fixes) {
      if (f.remove !== 1) continue;
      const going = f.from.filter((id) => outSet.has(id));
      if (going.length !== 1) continue;
      const serves = outs.find((o) => o.id === going[0])!.fixes;
      if (serves.length !== 1) continue;
      const others = f.from.filter((id) => available(id) && !outSet.has(id));
      if (others.length > 0) instead.set(f.factor, others);
    }
    const short: TargetFitShort[] = [];
    for (const f of fixes) {
      const can = f.from.filter(available).length;
      const missing = f.remove - can;
      if (missing <= 0) continue;
      const stays: TargetFitShort["stays"] = [];
      for (const id of f.from) {
        const reason = stay.get(id);
        if (!reason) continue;
        const group = stays.find((g) => g.reason === reason);
        if (group) group.ids.push(id);
        else stays.push({ reason, ids: [id] });
      }
      short.push({
        factor: f.factor,
        short: missing,
        commander: Math.max(0, f.remove - f.from.length),
        stays,
      });
    }
    // How many more the plan would have asked about, had the limit allowed.
    let notAsked = 0;
    if (!canAsk) {
      const open = (id: string) => available(id) || stay.get(id) === "not-asked";
      notAsked = cover(open).cards.filter((id) => stay.get(id) === "not-asked").length;
    }
    return {
      outs,
      ask: out.filter(neverAsked),
      waiting: out.filter((id) => !options.has(id) && asked.has(id)),
      kept,
      instead,
      short,
      notAsked,
      swaps: outs.filter((o) => o.pick !== null).length,
      exact,
    };
  }
}
