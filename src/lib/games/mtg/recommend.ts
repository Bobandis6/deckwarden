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
import type { CurveCardInput, RecommendMeta } from "../types";

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

export const mtgRecommend: RecommendMeta = {
  popularity: {
    source: "edhrec_rank",
    evidence(rank) {
      const why =
        rank <= 2000
          ? "A Commander staple by EDHREC play data"
          : rank <= 10000
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

  // Basic lands are never advice (hub staples precedent).
  exclude: [{ jsonbPath: ["type_line"], likePattern: "%Basic%" }],
};
