/**
 * MTG recommendation signal metadata (P3.1) — pure data + pure phrase
 * builders consumed by the core engine (src/lib/recommend/). No IO, no SQL.
 *
 * Evidence honesty rules (the product identity — "explainable deck lab"):
 * every sentence names what the data actually is. edhrec_rank is global
 * Commander play data, not deck-specific advice, and the tier words below
 * are scoped so a rank-20k card is never called a staple. The curve template
 * is EDITORIAL (the widely-taught deck-building shape), and its evidence
 * says "template", mirroring the hub template's labeling (cold-start rule:
 * computed/curated advice is fine, faked community stats are not).
 */
import type { AutofillMeta, CurveCardInput, RecommendMeta } from "../types";

/**
 * Editorial nonland target curve, buckets 0–7+ (the analytics histogram
 * convention in analyze.ts). Counts describe a complete deck and sum to 62 =
 * the hub template's 99 role slots minus its 37 lands — one editorial
 * skeleton, two views (a test enforces the arithmetic against hub.roles).
 * Shape: the taught Commander curve — peak at 2–3, tapering top end.
 */
export const MTG_CURVE_TEMPLATE: readonly number[] = [2, 8, 13, 13, 10, 7, 5, 4];

/** Nonland cards with a real cost participate in curve logic; cap at 7+. */
export function mtgCurveBucketOf(card: CurveCardInput): number | null {
  if (card.primaryType === "Land" || card.costValue === null) return null;
  return Math.min(7, Math.max(0, card.costValue));
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The popularity tier boundaries — ONE vocabulary for both directions
 * (P3.1 add evidence, P3.4 cut evidence): "staple" through STAPLE_RANK,
 * "widely played" through WIDELY_PLAYED_RANK, scoped wording beyond. The
 * Cut Coach flips which side of the tradeoff each tier argues, never the
 * boundaries or the words.
 */
export const STAPLE_RANK = 2000;
export const WIDELY_PLAYED_RANK = 10000;

/**
 * Share tiers for the tournament cut side (P3.11) — the tournament twin of
 * the rank boundaries above, over the P3.8 aggregate: at or above
 * TOURNAMENT_STAPLE_SHARE of the set's measured lists, cutting gives up a
 * measured staple (keep); at or above TOURNAMENT_PLAYED_SHARE the card
 * still sees real measured play (keep); below, the thin record argues the
 * slot is cheap (cut). Editorial boundaries — the sentences carry the raw
 * numbers so the tier word never outruns the data.
 */
export const TOURNAMENT_STAPLE_SHARE = 0.5;
export const TOURNAMENT_PLAYED_SHARE = 0.15;

/**
 * The one Topdeck scope sentence, both directions (P3.8 add / P3.11 cut):
 * raw numbers, the event floor, the source, the settling date, top-4s
 * disclosed — extracted so the two evidence builders can't drift.
 */
function topdeckHowOften(
  lists: number,
  ofLists: number,
  since: string | null,
  top4: number,
): string {
  const sinceText = since ? `, settled events since ${since.slice(0, 7)}` : "";
  const top4Text = top4 > 0 ? `; ${fmt(top4)} placed top 4` : "";
  return `${fmt(lists)} of ${fmt(ofLists)} top-16 lists at 16+ player events on Topdeck.gg${sinceText}${top4Text}`;
}

/**
 * The land half of the editorial skeleton (W9a): the hub template's 37
 * lands, autofill's base group. 37 + Σ MTG_CURVE_TEMPLATE = 99 — the
 * commander is the 100th (a test enforces the arithmetic).
 */
export const MTG_LAND_TEMPLATE = 37;

/**
 * Ranked (non-filler) land slots by color count (index = popcount of the
 * deck's color identity): mono decks want mostly basics; five-color decks
 * lean on real fixing. Editorial, like the curve template.
 */
export const MTG_RANKED_LANDS_BY_COLOR: readonly number[] = [6, 8, 16, 22, 26, 28];

/** WUBRG bit → its cost letter + basic land, in bitmask order. */
const MTG_BASICS: readonly { bit: number; letter: string; name: string }[] = [
  { bit: 1, letter: "W", name: "Plains" },
  { bit: 2, letter: "U", name: "Island" },
  { bit: 4, letter: "B", name: "Swamp" },
  { bit: 8, letter: "R", name: "Mountain" },
  { bit: 16, letter: "G", name: "Forest" },
];

const FILLER_WHY = `A basic land filling the ${MTG_LAND_TEMPLATE}-land template`;

/**
 * Autofill declaration (W9a): the base template + tournament lock tiers the
 * core planner consumes. lockShare is TOURNAMENT_STAPLE_SHARE BY REFERENCE
 * (the P3.11 pin) — never a second literal.
 */
export const mtgAutofill: AutofillMeta = {
  base: {
    label: "Lands",
    source: "land-template",
    count: MTG_LAND_TEMPLATE,
    scope: { column: "primary_type", op: "eq", value: "Land" },
    isBase: (card) => card.primaryType === "Land",
    rankedByColorCount: MTG_RANKED_LANDS_BY_COLOR,
    maxColorlessIdentity: 8,
    fillerNames: [...MTG_BASICS.map((b) => b.name), "Wastes"],
    fillers({ ciMask, n, costTexts }) {
      if (n <= 0) return [];
      const colors = MTG_BASICS.filter((b) => (ciMask & b.bit) !== 0);
      // Colorless identity: Wastes is the only basic that fits (W9a's live
      // subjects: Kozilek-style commanders and the one colorless precon).
      if (colors.length === 0) return [{ name: "Wastes", qty: n, why: FILLER_WHY }];
      // Split by colored-pip counts across the chosen nonland costs; a deck
      // with no measurable pips (all-artifact keeps) splits evenly.
      const pips = colors.map((c) =>
        costTexts.reduce((sum, cost) => sum + (cost.split(c.letter).length - 1), 0),
      );
      const totalPips = pips.reduce((a, b) => a + b, 0);
      const weights = totalPips > 0 ? pips : colors.map(() => 1);
      const weightSum = weights.reduce((a, b) => a + b, 0);
      // Largest remainder, ties to WUBRG order — deterministic by construction.
      const raw = weights.map((w) => (n * w) / weightSum);
      const qty = raw.map(Math.floor);
      let left = n - qty.reduce((a, b) => a + b, 0);
      const order = raw
        .map((r, i) => ({ frac: r - Math.floor(r), i }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
      for (const { i } of order) {
        if (left <= 0) break;
        qty[i] += 1;
        left -= 1;
      }
      return colors
        .map((c, i) => ({ name: c.name, qty: qty[i], why: FILLER_WHY }))
        .filter((f) => f.qty > 0);
    },
  },
  lockShare: TOURNAMENT_STAPLE_SHARE,
  lockMinLists: 5,
  costTextOf: (attrs) => (typeof attrs.mana_cost === "string" ? attrs.mana_cost : null),
  curveLabel: (bucketLabel) => `Mana value ${bucketLabel}`,
};

export const mtgRecommend: RecommendMeta = {
  popularity: {
    source: "edhrec_rank",
    evidence(rank) {
      const why =
        rank <= STAPLE_RANK
          ? "A Commander staple by EDHREC play data"
          : rank <= WIDELY_PLAYED_RANK
            ? "Widely played in Commander decks"
            : "Sees Commander play";
      return { why, howOften: `EDHREC rank #${fmt(rank)}` };
    },
  },

  curve: {
    source: "curve-template",
    buckets: MTG_CURVE_TEMPLATE,
    bucketOf: mtgCurveBucketOf,
    evidence({ bucketLabel, current, target }) {
      return {
        why: `Fills a curve gap — ${current} of the template's ~${target} nonland cards at mana value ${bucketLabel}`,
      };
    },
  },

  /**
   * The commander×card tournament aggregate (P3.8): settled Topdeck.gg
   * top-16 lists with the deck's EXACT commander set. Every sentence names
   * the real scope — top-16 lists, 16+ player events, the 14-day settling
   * lag — and the raw numbers ride in howOften so a 1-of-2 never reads like
   * a 58-of-94 (confidence is the machine's, from the sample size).
   */
  tournaments: {
    source: "topdeck-top16",
    evidence({ commanderNames, lists, ofLists, share, top4, since }) {
      const cmd = commanderNames.join(" + ");
      const pct = Math.round(share * 100);
      return {
        why: `Played in ${pct}% of top-16 lists with ${cmd}`,
        howOften: topdeckHowOften(lists, ofLists, since, top4),
      };
    },
  },

  combos: {
    source: "spellbook",
    evidence({ withNames, results, templates, popularity }) {
      const partners = withNames.join(" + ");
      const payoff = results.length
        ? `: ${results.slice(0, 2).join(", ")}${results.length > 2 ? ", …" : ""}`
        : "";
      // Template-requirement combos (P2.5 tables-as-they-are): a combo that
      // also needs a generic piece is never "complete" on cards alone — say so.
      const why =
        templates.length > 0
          ? `Combos with ${partners}${payoff} (also needs ${templates.join(", ")})`
          : `Completes a combo with ${partners}${payoff}`;
      return {
        why,
        howOften: popularity !== null ? `In ${fmt(popularity)} decks on Commander Spellbook` : null,
      };
    },
  },

  /**
   * Cut Coach phrasing (P3.4): every sentence states the TRADEOFF — what
   * cutting costs (or doesn't cost) the deck — over the same data the add
   * direction uses. Tier words and boundaries are shared with `popularity`
   * above; the curve/role targets are the one editorial skeleton
   * (MTG_CURVE_TEMPLATE / hub.roles); combo warnings fire only for combos
   * that are truly complete (deckComboStatus — template combos never were).
   */
  cuts: {
    popularity: {
      evidence(rank) {
        const howOften = `EDHREC rank #${fmt(rank)}`;
        if (rank <= STAPLE_RANK) {
          return {
            why: "A Commander staple by EDHREC play data — cutting it gives up a proven card",
            howOften,
            side: "keep",
          };
        }
        if (rank <= WIDELY_PLAYED_RANK) {
          return {
            why: "Widely played in Commander decks — it usually earns its slot",
            howOften,
            side: "keep",
          };
        }
        return {
          why: "Outside the widely-played tier of Commander cards",
          howOften,
          side: "cut",
        };
      },
    },
    curve: {
      evidence({ bucketLabel, current, target }) {
        return {
          why: `${current} nonland cards at mana value ${bucketLabel} vs the template's ~${target} — this bucket has slack`,
        };
      },
    },
    roles: {
      source: "role-template",
      evidence({ role, tagged, target }) {
        return {
          why: `${tagged} of your cards are tagged ${role}; the template suggests ~${target}`,
        };
      },
    },
    combos: {
      evidence({ withNames, results, popularity }) {
        const partners = withNames.join(" + ");
        const payoff = results.length
          ? ` (${results.slice(0, 2).join(", ")}${results.length > 2 ? ", …" : ""})`
          : "";
        return {
          why: `Part of ${partners}${payoff} — cutting it breaks the combo`,
          howOften:
            popularity !== null ? `In ${fmt(popularity)} decks on Commander Spellbook` : null,
        };
      },
    },
    price: {
      source: "price",
      minUsd: 10,
      evidence({ usd }) {
        return { why: `Costs $${usd} while sitting outside the widely-played tier` };
      },
    },
    /**
     * The P3.8 aggregate answering the cut side (P3.11): the same exact-set
     * scope in every sentence — the deck's OWN commanders, never a widened
     * pairing (LATER row 35 owns that). Thin measured play argues with the
     * raw counts; a meaningful share flips to a keep warning at the tiers
     * declared above.
     */
    tournaments: {
      evidence({ commanderNames, lists, ofLists, share, top4, since }) {
        const cmd = commanderNames.join(" + ");
        const howOften = topdeckHowOften(lists, ofLists, since, top4);
        // Percentage honesty (the P3.10 shareLabel rule): a real 100% may
        // say so; anything less never rounds up to it.
        const pct = share >= 1 ? 100 : Math.min(99, Math.round(share * 100));
        if (share >= TOURNAMENT_STAPLE_SHARE) {
          return {
            why: `Played in ${pct}% of top-16 lists with ${cmd} — cutting it gives up a measured staple`,
            howOften,
            side: "keep" as const,
          };
        }
        if (share >= TOURNAMENT_PLAYED_SHARE) {
          return {
            why: `Played in ${pct}% of top-16 lists with ${cmd} — it sees real measured play`,
            howOften,
            side: "keep" as const,
          };
        }
        return {
          why: `Played in ${fmt(lists)} of ${fmt(ofLists)} top-16 lists with ${cmd}`,
          howOften,
          side: "cut" as const,
        };
      },
    },
  },

  // Evidence-source display names + credit links (P3.2 panel). Spellbook's
  // link matches the card/hub-page attribution; the curve template gets no
  // link — it's Deckwarden editorial, not an external dataset (the role
  // template and card prices likewise).
  sources: {
    edhrec_rank: { label: "EDHREC", href: "https://edhrec.com" },
    spellbook: { label: "Commander Spellbook", href: "https://commanderspellbook.com" },
    // The hard attribution rule: Topdeck.gg credit + link wherever tournament
    // data appears — the panel renders this with every evidence entry.
    "topdeck-top16": { label: "Topdeck.gg", href: "https://topdeck.gg" },
    "curve-template": { label: "Curve template" },
    "land-template": { label: "Land template" },
    "role-template": { label: "Role template" },
    price: { label: "Card price" },
  },

  // Starter-shell autofill (W9a) — declared above, consumed by the core planner.
  autofill: mtgAutofill,

  // Basic lands are never advice (hub staples precedent).
  exclude: [{ jsonbPath: ["type_line"], likePattern: "%Basic%" }],
};
