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

/**
 * The popularity tier boundaries — ONE vocabulary for both directions
 * (P3.1 add evidence, P3.4 cut evidence): "staple" through STAPLE_RANK,
 * "widely played" through WIDELY_PLAYED_RANK, scoped wording beyond. The
 * Cut Coach flips which side of the tradeoff each tier argues, never the
 * boundaries or the words.
 */
export const STAPLE_RANK = 2000;
export const WIDELY_PLAYED_RANK = 10000;

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
      const sinceText = since ? `, settled events since ${since.slice(0, 7)}` : "";
      const top4Text = top4 > 0 ? `; ${fmt(top4)} placed top 4` : "";
      return {
        why: `Played in ${pct}% of top-16 lists with ${cmd}`,
        howOften: `${fmt(lists)} of ${fmt(ofLists)} top-16 lists at 16+ player events on Topdeck.gg${sinceText}${top4Text}`,
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
    "role-template": { label: "Role template" },
    price: { label: "Card price" },
  },

  // Basic lands are never advice (hub staples precedent).
  exclude: [{ jsonbPath: ["type_line"], likePattern: "%Basic%" }],
};
