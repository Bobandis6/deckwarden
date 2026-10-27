/**
 * BRACKET-UP (the owner's ask of 2026-10-27: "why cant the button show up
 * if i want to upgrade a precon to bracket 4 and have the whole suggested
 * list apear for the swap button"): the upgrade toward a target above what
 * the cards show, as data. Pure and client-safe: the "Upgrade toward" sheet
 * asks Suggestions once (the live list, the deck's goals) and resolves the
 * cards; this module pairs each card coming in with the card it replaces,
 * keeps the player's calls, and says which rows start checked. BRACKET-FIT's
 * upward twin (./target-fit.ts), which only fixes cards above the target.
 *
 * - **The rows** are Suggestions' own, in its rank order: the goals already
 *   hid every card above the target, one card at a time.
 * - **The partner** is Swap in's (`planSwapIn`, the Cut Coach's machine):
 *   the Coach's cheapest ordinary cut in the incoming card's curve bucket
 *   (its mana value), then the bucket's next ordinary cuts, in rank order,
 *   so the best-ranked card coming in takes the weakest card. A card whose
 *   bucket has none left then takes the weakest ordinary cut left at
 *   another cost, once every row has had its own bucket (a deviation the
 *   dev corpus asked for: Suggestions fill the curve's gaps, so with its
 *   bucket alone two of three rows came back unpaired; the row says so).
 *   An ordinary cut is one the Coach ranks that is no complete-combo piece:
 *   a card it can't rank (no signal data) is never cut on its own, since a
 *   cut with no stated tradeoff isn't coaching (planSwapIn's partner rule).
 *   And the plan cuts on its own only from the deck's weaker half by the
 *   Coach (or its weakest as many as the rows that pair, when that is
 *   more): at integration the dev precon Breed Lethality paired Carrion
 *   Feeder with Sol Ring, its 1-drop slot holding nothing weaker once
 *   Viscera Seer took Hardened Scales, and "the weakest card it replaces"
 *   never means a staple. Never the commander (only the swap's zone holds partners), never a card
 *   the curve leaves out (a land), never a card coming in, never a card
 *   another row takes.
 * - **Unpaired**: a card outside the curve (a land, no cost; the adapter's
 *   `swap.unmatched` says why, as in Swap in), or no ordinary cut left at
 *   all. It starts unchecked; choosing a card to cut pairs and checks it.
 * - **The chooser**: the incoming card's bucket, then the rest of the
 *   zone, each in the Coach's order (the unranked by name after). Never a
 *   complete-combo piece. A card with a bucket is only offered cards with
 *   one, so a land goes out only for a card the curve leaves out too (an
 *   unpaired land: which land to cut depends on its colors, the player's
 *   call). A card another row's choice holds is shown but can't be taken.
 * - **The player's calls win**: their choices of a card to cut first, in
 *   rank order (never moved), then every other row's partner. Taking a card
 *   another row was given re-plans that row. No card is cut twice: a card
 *   is held by one row whether that row is checked or not, so unchecking a
 *   row never moves another row's card.
 * - **What starts checked** (a deviation the dev corpus asked for: the
 *   Suggestions for precons with no Game Changer carried 2 to 8 of them at
 *   a target of 3, each fine alone): a paired row, in rank order, unless
 *   the caller's `judge` says its card would put the list above the target
 *   once the checked rows above it are in (the goals' own rule, applied to
 *   the list as it would be). Such a row starts unchecked with the judge's
 *   reasons; the player's own check or uncheck always wins. The judgement
 *   is live: unchecking a Game Changer above lets the next one in.
 */
import type { EditorEntry } from "@/lib/decks/editor-state";
import type { DeckGoals } from "@/lib/decks/goals";
import { toDeckSnapshot } from "@/lib/decks/validation";
import type {
  BracketInput,
  BracketsMeta,
  CardData,
  CurveCardInput,
  FormatDef,
  GameId,
} from "@/lib/games/types";
import { rankCuts } from "@/lib/recommend/cuts";
import { fitList } from "@/lib/recommend/fit";
import {
  planSwapIn,
  type SwapInInput,
  type SwapInOption,
  type SwapInPlan,
} from "@/lib/recommend/swap-in";

/** A Suggestions row the plan pairs: the card coming in, as the curve reads it. */
export interface TargetUpRow {
  cardId: string;
  name: string;
  card: CurveCardInput & { id: string };
}

/** One copy out and the card in, where the out card was: fitList's swap. */
export interface TargetUpSwap {
  outId: string;
  inId: string;
  zone: string;
}

/** The player's calls, by the incoming card's id. */
export interface TargetUpOverrides {
  /** Rows the player unchecked. */
  unchecked: ReadonlySet<string>;
  /** Rows the player checked: one the judge left out, or one given a card to cut. */
  checked: ReadonlySet<string>;
  /** The card the player chose to cut. */
  picks: ReadonlyMap<string, string>;
}

export const NO_UP_OVERRIDES: TargetUpOverrides = {
  unchecked: new Set(),
  checked: new Set(),
  picks: new Map(),
};

/** One card the chooser offers. */
export interface TargetUpChoice {
  option: SwapInOption;
  /** In the incoming card's bucket (the chooser's first group). */
  sameBucket: boolean;
  /**
   * In the deck's weaker half by the Cut Coach (or its weakest as many as
   * the rows that pair, when that is more): the only cards the plan cuts on
   * its own, so a staple at a thin cost (Sol Ring at 1) never goes out for a
   * suggestion just because its slot ran out of weaker cards. The player's
   * own choice can still take any card the chooser offers.
   */
  weak: boolean;
}

/** A row's place in the curve: Swap in's plan for its card, and what its chooser offers. */
export interface TargetUpSlot<R> {
  row: R;
  plan: SwapInPlan;
  /** The incoming card's bucket in plain words ("3", "7 or more", never "7+"); null = outside the curve. */
  bucketWords: string | null;
  /** The bucket's cards, then the rest; never a complete-combo piece. */
  choices: TargetUpChoice[];
}

/** How a row's card going out was found. */
export type TargetUpVia =
  /** The player chose it. */
  | "pick"
  /** The weakest ordinary cut left in the incoming card's bucket. */
  | "bucket"
  /** None left there: the weakest ordinary cut left at another cost. */
  | "elsewhere";

/** One row, planned. */
export interface TargetUpPair<R> {
  row: R;
  /** The incoming card's bucket in plain words ("3", "7 or more"); null = outside the curve. */
  bucketWords: string | null;
  /** The card going out; null = unpaired. */
  out: SwapInOption | null;
  /** How `out` was found; null = unpaired. */
  via: TargetUpVia | null;
  /** Why nothing goes out: outside the curve (the adapter says why), or no ordinary cut left. */
  unpaired: "no-bucket" | "no-cut" | null;
  /** The chooser, each card with the incoming card id of the row that holds it (null = free or this row). */
  choices: (TargetUpChoice & { heldBy: string | null; byPick: boolean })[];
  /** What Swap applies. */
  checked: boolean;
  /** The judge's reasons: why the card would put the list above the target after the checked rows above it. */
  above: readonly string[];
}

export interface TargetUpPlan<R> {
  /** Every row, rank order. */
  pairs: TargetUpPair<R>[];
  /** The checked rows' swaps, rank order: what Swap applies. */
  swaps: TargetUpSwap[];
}

/** Why a card would sit above the target with `before` applied; empty = it fits. */
export type TargetUpJudge<R> = (row: R, before: readonly TargetUpSwap[]) => readonly string[];

/**
 * Each row's slot: Swap in's plan for its card over the editor's list (the
 * Cut Coach's input: its cards, the leader zones left out, the combo
 * facts), and the chooser it offers. The expensive half, once per answer.
 */
export function targetUpSlots<R extends TargetUpRow>({
  rows,
  cut,
}: {
  rows: readonly R[];
  cut: Omit<SwapInInput, "incoming">;
}): TargetUpSlot<R>[] {
  const curve = cut.meta.curve;
  const inCurve = new Set(
    cut.entries
      .filter((e) => e.zone === cut.zone && curve !== undefined && curve.bucketOf(e.card) !== null)
      .map((e) => e.card.id),
  );
  const comboPiece = (id: string) => (cut.completeCombosByCard.get(id)?.length ?? 0) > 0;
  const incoming = new Set(rows.map((r) => r.cardId));
  const last = (curve?.buckets.length ?? 0) - 1;
  // The cards the plan may cut on its own (the owner's "the weakest card it
  // replaces"): the Coach's ordinary cuts deck-wide, weakest first, the
  // weaker half of them, or as many as the rows that pair when that's more.
  const ordinaryCuts = rankCuts(cut).cuts.filter(
    (c) =>
      c.zone === cut.zone && !c.inCompleteCombo && inCurve.has(c.cardId) && !incoming.has(c.cardId),
  );
  const pairing = rows.filter((r) => curve !== undefined && curve.bucketOf(r.card) !== null).length;
  const weak = new Set(
    ordinaryCuts
      .slice(0, Math.max(pairing, Math.ceil(ordinaryCuts.length / 2)))
      .map((c) => c.cardId),
  );
  return rows.map((row) => {
    const plan = planSwapIn({ ...cut, incoming: row.card });
    const bucketed = plan.bucket !== null;
    const offered = (o: SwapInOption) =>
      !comboPiece(o.cardId) && !incoming.has(o.cardId) && (!bucketed || inCurve.has(o.cardId));
    const same = [...(plan.partner ? [plan.partner] : []), ...plan.sameBucket].filter(offered);
    return {
      row,
      plan,
      // U9: the last bucket said in words ("7 or more"), not the curve evidence's "7+".
      bucketWords:
        plan.bucket === null
          ? null
          : plan.bucket >= last
            ? `${plan.bucket} or more`
            : String(plan.bucket),
      choices: [
        ...same.map((option) => ({ option, sameBucket: true, weak: weak.has(option.cardId) })),
        ...plan.others
          .filter(offered)
          .map((option) => ({ option, sameBucket: false, weak: weak.has(option.cardId) })),
      ],
    };
  });
}

/**
 * An ordinary cut (the Coach ranks it, no complete-combo piece) in the
 * deck's weaker half (`weak`), that no row holds yet: what the plan cuts on
 * its own.
 */
const ordinary = (c: TargetUpChoice, holder: ReadonlyMap<string, string>) =>
  c.weak && c.option.cut !== null && !c.option.cut.inCompleteCombo && !holder.has(c.option.cardId);

/**
 * The plan over the slots: the player's choices first, then each row's
 * partner in its bucket, then the rows with none left there at another
 * cost (each pass in rank order, never a card taken), then what starts
 * checked. `zone` is where the swaps land (the slots' zone).
 */
export function planTargetUp<R extends TargetUpRow>({
  slots,
  zone,
  overrides = NO_UP_OVERRIDES,
  judge,
}: {
  slots: readonly TargetUpSlot<R>[];
  zone: string;
  overrides?: TargetUpOverrides;
  judge?: TargetUpJudge<R>;
}): TargetUpPlan<R> {
  /** Out card id → the incoming card id holding it. */
  const holder = new Map<string, string>();
  const outOf = new Map<string, { option: SwapInOption; via: TargetUpVia }>();
  const take = (rowId: string, option: SwapInOption, via: TargetUpVia) => {
    holder.set(option.cardId, rowId);
    outOf.set(rowId, { option, via });
  };

  // The player's choices, rank order; a card one choice holds is never another's.
  for (const { row, choices } of slots) {
    const want = overrides.picks.get(row.cardId);
    const choice = want ? choices.find((c) => c.option.cardId === want) : undefined;
    if (choice && !holder.has(choice.option.cardId)) take(row.cardId, choice.option, "pick");
  }
  // Every other row: the weakest ordinary cut left in its bucket.
  for (const { row, choices } of slots) {
    if (outOf.has(row.cardId)) continue;
    const partner = choices.find((c) => c.sameBucket && ordinary(c, holder));
    if (partner) take(row.cardId, partner.option, "bucket");
  }
  // Then a card with a bucket and none left there: the weakest ordinary cut left elsewhere.
  for (const { row, plan, choices } of slots) {
    if (outOf.has(row.cardId) || plan.bucket === null) continue;
    const partner = choices.find((c) => !c.sameBucket && ordinary(c, holder));
    if (partner) take(row.cardId, partner.option, "elsewhere");
  }

  // What starts checked, rank order and live: the judge sees the checked rows above.
  const swaps: TargetUpSwap[] = [];
  const pairs = slots.map(({ row, plan, bucketWords, choices }): TargetUpPair<R> => {
    const found = outOf.get(row.cardId) ?? null;
    const out = found?.option ?? null;
    const above = out && judge ? judge(row, [...swaps]) : [];
    const own = overrides.checked.has(row.cardId)
      ? true
      : overrides.unchecked.has(row.cardId)
        ? false
        : null;
    const checked = out !== null && (own ?? above.length === 0);
    if (checked) swaps.push({ outId: out.cardId, inId: row.cardId, zone });
    return {
      row,
      bucketWords,
      out,
      via: found?.via ?? null,
      unpaired: out ? null : plan.bucket === null ? "no-bucket" : "no-cut",
      choices: choices.map((c) => {
        const by = holder.get(c.option.cardId) ?? null;
        const other = by !== null && by !== row.cardId ? by : null;
        return { ...c, heldBy: other, byPick: other !== null && outOf.get(other)?.via === "pick" };
      }),
      checked,
      above,
    };
  });
  return { pairs, swaps };
}

/**
 * The goals, row by row (the sheet's judge): the adapter's `impact` for the
 * row's card against `assess` of the list after the checked swaps above it,
 * the rule Suggestions hid cards by, against the list as it would be. The
 * reads take every card coming in (`cards` holds them). A card's combos
 * with the list stay unknown here (the server checked each card against
 * the list as it is), so a combo two cards complete together is the
 * after-check's to name. No target, no judge.
 */
export function targetUpJudge<R extends TargetUpRow & { card: CardData }>({
  brackets,
  game,
  format,
  entries,
  cards,
  combos,
  freshness,
  goals,
}: {
  brackets: Pick<BracketsMeta, "assess" | "impact">;
  game: GameId;
  format: FormatDef;
  entries: readonly EditorEntry[];
  /** The list's cards and every card coming in. */
  cards: ReadonlyMap<string, CardData>;
  combos: BracketInput["combos"];
  freshness: BracketInput["freshness"];
  goals: DeckGoals | null;
}): TargetUpJudge<R> | undefined {
  const targetLevel = goals?.targetLevel ?? null;
  if (targetLevel === null) return undefined;
  return (row, before) => {
    const input: BracketInput = {
      deck: toDeckSnapshot(game, format, fitList(entries, format, before)),
      cards,
      combos,
      freshness,
      targetLevel,
      answers: goals?.answers ?? null,
    };
    const read = brackets.assess(input);
    return brackets.impact({ ...input, read, card: row.card, completes: [] }).map((c) => c.why);
  };
}
