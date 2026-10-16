/**
 * Budget Twin (Y8, WAVE4 D9) — fit a deck under a total budget through
 * reviewed swaps. Pure and client-safe: the Fit sheet asks Swap Lab's route
 * (`POST /api/alternatives`) one card at a time and hands every answer
 * here; this module decides which cards are worth asking about, which
 * alternative each one gets, and what the deck would cost after.
 *
 * - **The estimate** is the deck's cheapest printings (`cheapestUsd`, the
 *   identity's cheapest — never the chosen printing) over the format's
 *   counted zones, leaders included: what the whole deck costs to buy.
 *   Owned copies cost $0 only when a collection exists (the editor's owned
 *   set is meaningless without one). A card with no known price is never
 *   counted as $0: it is left out of the sum and counted beside it.
 * - **The cards considered**, priciest first: main-list cards the adapter
 *   offers alternatives for (Magic: no lands — LATER row 31), with a known
 *   price, holding at least one of the adapter's roles (read off the card
 *   wire's attrs, so a card the route would answer "no-roles" is never
 *   asked about), not owned (with a collection — a card you own costs
 *   nothing to keep), not a piece of a complete combo in the list (the
 *   bracket line's facts — a fit never breaks a combo), and run as a single
 *   copy (several copies of one card are a choice, not a price).
 * - **The options per card**: the route's own rows, its order (shared roles,
 *   then the evidence), keeping the ones that are priced, cheaper than the
 *   card and inside the per-card budget — the first three. Hidden rows
 *   (above the target) never reach here; the route already checked each
 *   one against the deck's goals in the card's place.
 * - **The picks**: the player's own checks and choices first; then, priciest
 *   card first, each card the player left alone takes its best-ranked
 *   option not already picked for another card — but only while the deck is
 *   still over the total, so the default is the fewest swaps of the
 *   priciest cards that reach it. When the best-ranked picks can't reach
 *   the total, the sheet's picks take each card's cheapest option instead
 *   (`prefer: "price"`, said aloud): the closest the alternatives get. An
 *   alternative is never picked twice (a singleton deck can't hold two).
 */
import { deckOwnership, formatUsd } from "@/lib/collection/ownership";
import { swapCard, type EditorEntry } from "@/lib/decks/editor-state";
import type { CardData, FormatDef, SwapMeta } from "@/lib/games/types";

/** Cards asked about per open, at most — under a third of the alternatives bucket (30/min). */
export const FIT_ASK_LIMIT = 9;
/** Asked together: the priciest unasked cards, this many at a time. */
export const FIT_BATCH = 3;
/** Alternatives shown per card (D9: one to three). */
export const FIT_OPTIONS = 3;

/** The deck's cost at its cheapest printings; `unpriced` cards are left out of `usd`. */
export interface FitEstimate {
  usd: number;
  /** Cards (identities) with no known price — never counted as $0. */
  unpriced: number;
}

export function deckEstimate(
  entries: readonly { cardId: string; zone: string; qty: number }[],
  cards: ReadonlyMap<string, { cheapestUsd: number | null }>,
  /** The owned set — only when a collection exists; null = nothing is owned. */
  owned: ReadonlySet<string> | null,
  format: FormatDef,
): FitEstimate {
  const s = deckOwnership(entries, cards, owned ?? new Set(), format);
  return { usd: s.missingUsd, unpriced: s.unpricedMissing };
}

/**
 * The goals line's total (D9): "est. $212 of your $150", "(+3 unpriced)"
 * when cards have no price; "$150 total" when the estimate is unknown.
 */
export function totalPhrase(totalUsd: number, estimate: FitEstimate | null): string {
  if (!estimate) return `${formatUsd(totalUsd)} total`;
  const head = `est. ${usdBeside(estimate.usd, totalUsd)} of your ${formatUsd(totalUsd)}`;
  return estimate.unpriced > 0 ? `${head} (+${estimate.unpriced} unpriced)` : head;
}

/**
 * Whole dollars, as everywhere — except when that would read as the total
 * itself while the cents say otherwise ($150.40 of your $150 is over).
 */
function usdBeside(usd: number, totalUsd: number): string {
  const whole = formatUsd(usd);
  return whole === formatUsd(totalUsd) && cents(usd) !== cents(totalUsd)
    ? `$${usd.toFixed(2)}`
    : whole;
}

/** A card the sheet may ask about. */
export interface FitCard {
  id: string;
  name: string;
  zone: string;
  /** Its cheapest printing, USD. */
  usd: number;
}

/** A card left out, and why — the sheet names the pricier ones. */
export interface FitSkip {
  id: string;
  name: string;
  usd: number | null;
  reason: "no-roles" | "combo" | "owned" | "unpriced";
}

export function fitConsidered({
  entries,
  cards,
  format,
  swap,
  owned,
  comboPieceIds,
}: {
  entries: readonly EditorEntryLike[];
  cards: ReadonlyMap<string, CardData & { name: string }>;
  format: FormatDef;
  swap: Pick<SwapMeta, "offers" | "rolesPath" | "roles">;
  /** Only with a collection; null = nothing owned. */
  owned: ReadonlySet<string> | null;
  /** Complete-combo pieces (the bracket line's facts); null = unknown, nothing protected. */
  comboPieceIds: ReadonlySet<string> | null;
}): { considered: FitCard[]; skipped: FitSkip[] } {
  const swappable = new Set(
    format.zones.filter((z) => !z.isLeaderZone && z.countsTowardSize).map((z) => z.id),
  );
  const declared = new Set(swap.roles.map((r) => r.key));
  const considered: FitCard[] = [];
  const skipped: FitSkip[] = [];
  for (const e of entries) {
    if (!swappable.has(e.zone) || e.qty !== 1) continue;
    const card = cards.get(e.cardId);
    if (!card || !swap.offers(card)) continue;
    const usd = card.cheapestUsd;
    const base = { id: card.id, name: card.name, usd };
    if (owned?.has(card.id)) skipped.push({ ...base, reason: "owned" });
    else if (usd === null || !Number.isFinite(usd)) skipped.push({ ...base, reason: "unpriced" });
    else if (!holdsRole(card, swap.rolesPath, declared))
      skipped.push({ ...base, reason: "no-roles" });
    else if (comboPieceIds?.has(card.id)) skipped.push({ ...base, reason: "combo" });
    else considered.push({ id: card.id, name: card.name, zone: e.zone, usd });
  }
  const byPrice = (
    a: { usd: number | null; name: string },
    b: { usd: number | null; name: string },
  ) => (b.usd ?? -1) - (a.usd ?? -1) || a.name.localeCompare(b.name);
  return { considered: considered.sort(byPrice), skipped: skipped.sort(byPrice) };
}

type EditorEntryLike = Pick<EditorEntry, "cardId" | "zone" | "qty">;

function holdsRole(card: CardData, path: string, declared: ReadonlySet<string>): boolean {
  const roles = (card.attrs as Record<string, unknown>)[path];
  return Array.isArray(roles) && roles.some((r) => typeof r === "string" && declared.has(r));
}

/** What a route row needs to be an option. */
export interface FitOptionInput {
  cardId: string;
  name: string;
  cheapestUsd: string | null;
  conflicts: readonly { rule: string; severity: "hide" | "flag" }[];
}

/**
 * A card's options: the route's rows in its order that are priced, cheaper
 * than the card, and inside the per-card budget (a row over it carries the
 * "budget" flag) — the first FIT_OPTIONS.
 */
export function fitOptions<R extends FitOptionInput>(outUsd: number, rows: readonly R[]): R[] {
  return rows
    .filter((r) => {
      const usd = priceOf(r);
      return (
        usd !== null &&
        cents(usd) < cents(outUsd) &&
        !r.conflicts.some((c) => c.rule === "budget" || c.severity === "hide")
      );
    })
    .slice(0, FIT_OPTIONS);
}

const priceOf = (r: FitOptionInput): number | null => {
  if (r.cheapestUsd === null) return null;
  const usd = Number(r.cheapestUsd);
  return Number.isFinite(usd) ? usd : null;
};
const cents = (usd: number) => Math.round(usd * 100);

export interface FitRow<R> {
  card: FitCard;
  /** 0–3: none = nothing cheaper fits the goals. */
  options: R[];
  /** The option swapped in, or null = the card stays. */
  chosen: string | null;
  /** True when the sheet chose (or left) it; false once the player did. */
  auto: boolean;
  /** The card's price less its pick's; 0 when it stays. */
  savingUsd: number;
}

export interface FitPlan<R> {
  /** The answered cards, priciest first — a row without options included. */
  rows: FitRow<R>[];
  /** How the sheet's own picks chose: the best-ranked option, or (when that can't fit) the cheapest. */
  prefer: "rank" | "price";
  /** The estimate after the checked swaps. */
  afterUsd: number;
  swaps: number;
  /** After the swaps the deck is at or under the total. */
  fits: boolean;
}

/**
 * The plan over the answered cards. `overrides` are the player's own:
 * a cardId to swap in, or null for "keep this card". Every other row is
 * the sheet's — checked only while the deck is still over the total.
 */
export function planFit<R extends FitOptionInput>({
  considered,
  answers,
  estimateUsd,
  totalUsd,
  overrides,
}: {
  considered: readonly FitCard[];
  /** The route's rows per answered card (answers still loading or failed are absent). */
  answers: ReadonlyMap<string, readonly R[]>;
  estimateUsd: number;
  totalUsd: number;
  overrides: ReadonlyMap<string, string | null>;
}): FitPlan<R> {
  const byRank = pickAll(considered, answers, estimateUsd, totalUsd, overrides, "rank");
  if (byRank.fits) return byRank;
  const byPrice = pickAll(considered, answers, estimateUsd, totalUsd, overrides, "price");
  // Only when it gets closer: an equal estimate keeps the better-ranked cards.
  return byPrice.afterUsd < byRank.afterUsd ? byPrice : byRank;
}

function pickAll<R extends FitOptionInput>(
  considered: readonly FitCard[],
  answers: ReadonlyMap<string, readonly R[]>,
  estimateUsd: number,
  totalUsd: number,
  overrides: ReadonlyMap<string, string | null>,
  prefer: "rank" | "price",
): FitPlan<R> {
  const rows: FitRow<R>[] = considered
    .filter((c) => answers.has(c.id))
    .map((card) => ({
      card,
      options: fitOptions(card.usd, answers.get(card.id)!),
      chosen: null,
      auto: !overrides.has(card.id),
      savingUsd: 0,
    }));
  const taken = new Set<string>();
  let afterCents = cents(estimateUsd);
  const pick = (row: FitRow<R>, option: R) => {
    taken.add(option.cardId);
    row.chosen = option.cardId;
    row.savingUsd = (cents(row.card.usd) - cents(priceOf(option)!)) / 100;
    afterCents -= cents(row.savingUsd);
  };
  // The player's picks first: they hold their alternatives whatever comes before them.
  for (const row of rows) {
    const id = overrides.get(row.card.id);
    if (row.auto || id == null || taken.has(id)) continue;
    const option = row.options.find((o) => o.cardId === id);
    if (option) pick(row, option);
  }
  // Then the sheet's, priciest card first, while the deck is over the total.
  for (const row of rows) {
    if (!row.auto || afterCents <= cents(totalUsd)) continue;
    const free = row.options.filter((o) => !taken.has(o.cardId));
    const option =
      prefer === "rank"
        ? free[0]
        : free.reduce<R | undefined>(
            (best, o) =>
              best === undefined || cents(priceOf(o)!) < cents(priceOf(best)!) ? o : best,
            undefined,
          );
    if (option) pick(row, option);
  }
  return {
    rows,
    prefer,
    afterUsd: afterCents / 100,
    swaps: rows.filter((r) => r.chosen !== null).length,
    fits: afterCents <= cents(totalUsd),
  };
}

/**
 * The deck after the checked swaps: each card out and its pick in, in place
 * (Swap Lab's `swapCard` — the row keeps its position, the new card comes
 * without the old row's tags or printing). One whole-list edit for
 * `applyListSwap`, whose one Undo restores the list exactly.
 */
export function fitList(
  entries: readonly EditorEntry[],
  format: FormatDef,
  swaps: readonly { outId: string; inId: string; zone: string }[],
): EditorEntry[] {
  // A swap that can't happen (its card already gone) leaves the list as it was.
  return swaps.reduce<EditorEntry[]>(
    (next, s) => swapCard(next, format, s.zone, s.outId, s.inId).entries,
    [...entries],
  );
}

/**
 * The footer's sentence: "est. $148 of your $150" when the swaps reach the
 * total, "Gets you to $172 of your $150" when they can't.
 */
export function afterPhrase(afterUsd: number, totalUsd: number, fits: boolean): string {
  const after = usdBeside(afterUsd, totalUsd);
  return fits
    ? `est. ${after} of your ${formatUsd(totalUsd)}`
    : `Gets you to ${after} of your ${formatUsd(totalUsd)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Fit sheet's words (D9's, where D9 has them). */
export const FIT_COPY = {
  /** The door — More's item adds the ellipsis. */
  door: "Fit my budget",
  title: "Fit my budget",
  lead: "Swaps your priciest cards for cheaper ones that share a job. Check the swaps you want.",
  totalLabel: "Deck total",
  fit: "Fit",
  change: "Change",
  /** No total yet: nothing is asked until there is one. */
  setTotal: "Set a total to see what to swap.",
  invalidTotal: "Enter a whole number of dollars, at least $1.",
  now: (estimate: FitEstimate) =>
    `est. ${formatUsd(estimate.usd)} now (cheapest printings)` +
    (estimate.unpriced > 0
      ? ` · ${plural(estimate.unpriced, "card")} without a price not counted`
      : ""),
  within: (phrase: string) => `Already within your budget: ${phrase}.`,
  saveTotal: (totalUsd: number) => `Save ${formatUsd(totalUsd)} as this deck's total`,
  removeTotal: "Remove this deck's total",
  /** D9, word for word: nothing to swap down. */
  nothing: "No suitable alternative under your goals.",
  asking: (n: number) => `Finding cheaper cards for ${plural(n, "more card")}…`,
  limited: "Alternatives are rate-limited for a moment. Try again shortly.",
  failed: "Couldn't check some cards.",
  retry: "Try again",
  /** Asked, answered, nothing cheaper inside the goals. */
  noneFor: (names: readonly string[]) =>
    `No cheaper alternative under your goals for ${names.join(", ")}.`,
  owned: "Cards you own count as $0 and stay.",
  combosUnknown: "Couldn't check combos. Combo pieces aren't kept out of these swaps.",
  combosChecking: "Checking combos. Combo pieces aren't kept out of these swaps yet.",
  pickedFor: (name: string) => `picked for ${name}`,
  /** The plan fell back to each card's cheapest option (`prefer: "price"`). */
  cheapest:
    "The best-ranked swaps can't reach your total, so each card takes its cheapest alternative.",
  saves: (usd: number) => `saves $${usd.toFixed(2)}`,
  apply: (n: number) => `Swap ${plural(n, "card")}`,
  /** The apply's toast; its Undo restores the whole list. */
  toast: (n: number) => `Swapped ${plural(n, "card")}`,
  noLeader: (noun: string) => `Add a ${noun} first. Alternatives follow its color identity.`,
} as const;

/** "Not looked at: Serra Ascendant (no community roles yet), …" — why a pricey card isn't offered. */
export function skippedLine(skips: readonly FitSkip[], max = 4): string | null {
  const why = (s: FitSkip) =>
    s.reason === "combo"
      ? "a combo piece"
      : s.reason === "no-roles"
        ? "no community roles yet"
        : null;
  const named = skips.filter((s) => why(s) !== null);
  if (named.length === 0) return null;
  const shown = named.slice(0, max).map((s) => `${s.name} (${why(s)})`);
  const more = named.length - shown.length;
  return `Not looked at: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`;
}
