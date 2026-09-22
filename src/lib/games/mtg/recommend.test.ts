import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import {
  MTG_CURVE_TEMPLATE,
  MTG_LAND_TEMPLATE,
  MTG_RANKED_LANDS_BY_COLOR,
  mtgAutofill,
  mtgCurveBucketOf,
  mtgRecommend,
  STAPLE_RANK,
  TOURNAMENT_PLAYED_SHARE,
  TOURNAMENT_STAPLE_SHARE,
  WIDELY_PLAYED_RANK,
} from "./recommend";

describe("curve template ↔ hub template coherence", () => {
  it("curve buckets + hub lands = the hub template's 99 role slots", () => {
    const roles = mtgAdapter.hub!.roles;
    const lands = roles.find((r) => r.label === "Lands")!.count;
    const roleTotal = roles.reduce((n, r) => n + r.count, 0);
    const curveTotal = MTG_CURVE_TEMPLATE.reduce((a, b) => a + b, 0);
    expect(roleTotal).toBe(99); // commander is the 100th
    expect(curveTotal).toBe(roleTotal - lands); // one editorial skeleton, two views
  });

  it("is wired into the adapter", () => {
    expect(mtgAdapter.recommend).toBe(mtgRecommend);
    expect(mtgAdapter.recommend?.curve?.buckets).toEqual(MTG_CURVE_TEMPLATE);
  });
});

describe("mtgCurveBucketOf", () => {
  it("excludes lands and costless cards; caps at 7+", () => {
    expect(mtgCurveBucketOf({ primaryType: "Land", costValue: 0 })).toBeNull();
    expect(mtgCurveBucketOf({ primaryType: "Creature", costValue: null })).toBeNull();
    expect(mtgCurveBucketOf({ primaryType: "Creature", costValue: 2 })).toBe(2);
    expect(mtgCurveBucketOf({ primaryType: "Sorcery", costValue: 12 })).toBe(7);
    expect(mtgCurveBucketOf({ primaryType: "Instant", costValue: 0 })).toBe(0);
  });
});

describe("evidence phrasing (sources named, honesty scoped)", () => {
  it("popularity names edhrec_rank and never calls a deep rank a staple", () => {
    expect(mtgRecommend.popularity?.source).toBe("edhrec_rank");
    const staple = mtgRecommend.popularity!.evidence(150);
    expect(staple.why).toContain("staple");
    expect(staple.howOften).toBe("EDHREC rank #150");
    const deep = mtgRecommend.popularity!.evidence(20000);
    expect(deep.why).not.toContain("staple");
    expect(deep.why).not.toContain("Widely");
    expect(deep.howOften).toBe("EDHREC rank #20,000");
  });

  it("combo evidence names spellbook, the partners, and any template requirement", () => {
    expect(mtgRecommend.combos?.source).toBe("spellbook");
    const complete = mtgRecommend.combos!.evidence({
      withNames: ["Basalt Monolith"],
      results: ["Infinite colorless mana"],
      templates: [],
      popularity: 6412,
    });
    expect(complete.why).toContain("Completes a combo with Basalt Monolith");
    expect(complete.why).toContain("Infinite colorless mana");
    expect(complete.howOften).toBe("In 6,412 decks on Commander Spellbook");

    // Tables-as-they-are (P2.5): template combos are never "complete" on cards.
    const templated = mtgRecommend.combos!.evidence({
      withNames: ["Kiki-Jiki, Mirror Breaker"],
      results: ["Infinite creatures"],
      templates: ["Permanent Castable for {C}"],
      popularity: null,
    });
    expect(templated.why).not.toContain("Completes");
    expect(templated.why).toContain("also needs Permanent Castable for {C}");
    expect(templated.howOften).toBeNull();
  });

  it("curve evidence names the template and the real counts", () => {
    expect(mtgRecommend.curve?.source).toBe("curve-template");
    const { why } = mtgRecommend.curve!.evidence({ bucketLabel: "2", current: 3, target: 13 });
    expect(why).toContain("3");
    expect(why).toContain("13");
    expect(why).toContain("mana value 2");
  });

  it("declares basic lands as never-advise", () => {
    expect(mtgRecommend.exclude).toEqual([{ jsonbPath: ["type_line"], likePattern: "%Basic%" }]);
  });

  it("tournament evidence names topdeck-top16, the exact scope, and the raw numbers", () => {
    expect(mtgRecommend.tournaments?.source).toBe("topdeck-top16");
    const { why, howOften } = mtgRecommend.tournaments!.evidence({
      commanderNames: ["Kinnan, Bonder Prodigy"],
      lists: 58,
      ofLists: 94,
      share: 58 / 94,
      top4: 17,
      since: "2026-03-07",
    });
    expect(why).toBe("Played in 62% of top-16 lists with Kinnan, Bonder Prodigy");
    expect(howOften).toBe(
      "58 of 94 top-16 lists at 16+ player events on Topdeck.gg, settled events since 2026-03; 17 placed top 4",
    );

    // partner pairs name both commanders; no top-4s and no date stay silent
    const pair = mtgRecommend.tournaments!.evidence({
      commanderNames: ["Kraum, Ludevic's Opus", "Tymna the Weaver"],
      lists: 1,
      ofLists: 2,
      share: 0.5,
      top4: 0,
      since: null,
    });
    expect(pair.why).toContain("Kraum, Ludevic's Opus + Tymna the Weaver");
    expect(pair.howOften).toBe("1 of 2 top-16 lists at 16+ player events on Topdeck.gg");
  });

  it("credits Topdeck.gg with a link — the hard attribution rule", () => {
    expect(mtgRecommend.sources?.["topdeck-top16"]).toEqual({
      label: "Topdeck.gg",
      href: "https://topdeck.gg",
    });
  });
});

describe("cut phrasing (P3.4 — the tradeoff in the deck's own terms)", () => {
  const cuts = mtgRecommend.cuts!;

  it("shares the popularity tier boundaries with the add direction, flipping the side", () => {
    // Same scoped words at the same ranks: a staple stays a staple in both
    // directions; only which side of the tradeoff it argues changes.
    const staple = cuts.popularity!.evidence(STAPLE_RANK);
    expect(staple.side).toBe("keep");
    expect(staple.why).toContain("staple");
    expect(staple.howOften).toBe(`EDHREC rank #${STAPLE_RANK.toLocaleString("en-US")}`);

    const widely = cuts.popularity!.evidence(WIDELY_PLAYED_RANK);
    expect(widely.side).toBe("keep");
    expect(widely.why).toContain("Widely played");

    const deep = cuts.popularity!.evidence(WIDELY_PLAYED_RANK + 1);
    expect(deep.side).toBe("cut");
    expect(deep.why).not.toContain("staple");
    expect(deep.why).toContain("widely-played tier");
  });

  it("phrases curve slack with the template's real counts", () => {
    const { why } = cuts.curve!.evidence({ bucketLabel: "3", current: 18, target: 13 });
    expect(why).toContain("18 nonland cards at mana value 3");
    expect(why).toContain("~13");
  });

  it("phrases role overload as tagged counts vs the template", () => {
    expect(cuts.roles?.source).toBe("role-template");
    const { why } = cuts.roles!.evidence({ role: "Ramp", tagged: 13, target: 10 });
    expect(why).toBe("13 of your cards are tagged Ramp; the template suggests ~10");
  });

  it("says a cut breaks the combo, naming the partners and the play count", () => {
    const { why, howOften } = cuts.combos!.evidence({
      withNames: ["Basalt Monolith", "Rings of Brighthearth"],
      results: ["Infinite colorless mana"],
      popularity: 6412,
    });
    expect(why).toContain("Part of Basalt Monolith + Rings of Brighthearth");
    expect(why).toContain("cutting it breaks the combo");
    expect(why).toContain("Infinite colorless mana");
    expect(howOften).toBe("In 6,412 decks on Commander Spellbook");
    expect(
      cuts.combos!.evidence({ withNames: ["A"], results: [], popularity: null }).howOften,
    ).toBeNull();
  });

  it("phrases the tournament tradeoff by share tier, exact-set in every sentence (P3.11)", () => {
    const at = (lists: number, ofLists: number, top4 = 0) =>
      cuts.tournaments!.evidence({
        commanderNames: ["Kinnan, Bonder Prodigy"],
        lists,
        ofLists,
        share: lists / ofLists,
        top4,
        since: "2026-03-07",
      });

    // The row's headline: a measured zero argues cut, raw numbers up front.
    const zero = at(0, 94);
    expect(zero.side).toBe("cut");
    expect(zero.why).toBe("Played in 0 of 94 top-16 lists with Kinnan, Bonder Prodigy");
    expect(zero.howOften).toBe(
      "0 of 94 top-16 lists at 16+ player events on Topdeck.gg, settled events since 2026-03",
    );

    // Thin play stays a cut argument; top4 is DISCLOSED in howOften, never ranked on.
    const thin = at(3, 94, 1);
    expect(thin.side).toBe("cut");
    expect(thin.why).toBe("Played in 3 of 94 top-16 lists with Kinnan, Bonder Prodigy");
    expect(thin.howOften).toContain("; 1 placed top 4");

    // At the played tier the record is a keep warning; at the staple tier it names the cost.
    const played = at(Math.ceil(TOURNAMENT_PLAYED_SHARE * 94), 94);
    expect(played.side).toBe("keep");
    expect(played.why).toContain("sees real measured play");
    const staple = at(58, 94, 17);
    expect(58 / 94).toBeGreaterThanOrEqual(TOURNAMENT_STAPLE_SHARE);
    expect(staple.side).toBe("keep");
    expect(staple.why).toBe(
      "Played in 62% of top-16 lists with Kinnan, Bonder Prodigy — cutting it gives up a measured staple",
    );
    expect(staple.howOften).toBe(
      "58 of 94 top-16 lists at 16+ player events on Topdeck.gg, settled events since 2026-03; 17 placed top 4",
    );

    // Percentage honesty (the P3.10 shareLabel rule): 187 of 188 is 99%,
    // never a false 100% — and a real 100% may say so.
    expect(at(187, 188).why).toContain("99%");
    expect(at(94, 94).why).toContain("100%");
  });

  it("prices against the play-data tier it compounds, above a real floor", () => {
    expect(cuts.price?.minUsd).toBe(10);
    const { why } = cuts.price!.evidence({ usd: "42.50" });
    expect(why).toContain("$42.50");
    expect(why).toContain("widely-played tier");
  });

  it("declares display metadata for every cut evidence source", () => {
    // Curve/popularity/combo/tournaments reuse the sibling slugs; roles and
    // price add their own — all must render with a human label in the panel.
    for (const slug of [
      "edhrec_rank",
      "curve-template",
      "spellbook",
      "role-template",
      "price",
      "topdeck-top16",
    ]) {
      expect(mtgRecommend.sources?.[slug]?.label).toBeTruthy();
    }
  });
});

describe("autofill declaration (W9a — the starter-shell contract)", () => {
  const autofill = mtgAutofill;

  it("lands + curve = the 99: base.count + Σ curve buckets, and the ranked-lands ladder is sane", () => {
    const curveTotal = MTG_CURVE_TEMPLATE.reduce((a, b) => a + b, 0);
    expect(autofill.base.count + curveTotal).toBe(99); // commander is the 100th
    expect(autofill.base.count).toBe(MTG_LAND_TEMPLATE);
    // One entry per color count 0–5, never asking for more ranked lands than the template holds.
    expect(MTG_RANKED_LANDS_BY_COLOR).toHaveLength(6);
    for (const n of MTG_RANKED_LANDS_BY_COLOR) {
      expect(n).toBeLessThanOrEqual(autofill.base.count);
    }
  });

  it("lockShare IS the P3.11 staple-share pin (never a second literal) and is wired into the adapter", () => {
    expect(autofill.lockShare).toBe(TOURNAMENT_STAPLE_SHARE);
    expect(autofill.lockMinLists).toBe(5);
    expect(mtgRecommend.autofill).toBe(mtgAutofill);
    expect(mtgRecommend.sources?.["land-template"]?.label).toBeTruthy();
  });

  it("scopes the base pool to Lands and classifies base cards the same way", () => {
    expect(autofill.base.scope).toEqual({ column: "primary_type", op: "eq", value: "Land" });
    expect(autofill.base.isBase({ primaryType: "Land", costValue: null })).toBe(true);
    expect(autofill.base.isBase({ primaryType: "Creature", costValue: 2 })).toBe(false);
  });

  it("splits fillers by colored pips, largest remainder, WUBRG ties", () => {
    const picks = autofill.base.fillers({
      ciMask: 3, // WU
      n: 10,
      costTexts: ["{W}{W}", "{U}"],
    });
    expect(picks).toEqual([
      { name: "Plains", qty: 7, why: "A basic land filling the 37-land template" },
      { name: "Island", qty: 3, why: "A basic land filling the 37-land template" },
    ]);
    // Hybrid symbols count both sides.
    const hybrid = autofill.base.fillers({ ciMask: 3, n: 2, costTexts: ["{W/U}"] });
    expect(hybrid.map((p) => `${p.name}:${p.qty}`)).toEqual(["Plains:1", "Island:1"]);
  });

  it("splits evenly when no pips are measurable and answers colorless with Wastes", () => {
    const even = autofill.base.fillers({ ciMask: 3, n: 5, costTexts: [] });
    expect(even.map((p) => `${p.name}:${p.qty}`)).toEqual(["Plains:3", "Island:2"]);
    expect(autofill.base.fillers({ ciMask: 0, n: 4, costTexts: ["{3}"] })).toEqual([
      { name: "Wastes", qty: 4, why: "A basic land filling the 37-land template" },
    ]);
    expect(autofill.base.fillers({ ciMask: 3, n: 0, costTexts: [] })).toEqual([]);
  });

  it("declares every basic as a loadable filler name and cost/curve accessors", () => {
    expect(autofill.base.fillerNames).toEqual([
      "Plains",
      "Island",
      "Swamp",
      "Mountain",
      "Forest",
      "Wastes",
    ]);
    expect(autofill.costTextOf({ mana_cost: "{2}{G}" })).toBe("{2}{G}");
    expect(autofill.costTextOf({})).toBeNull();
    expect(autofill.curveLabel("7+")).toBe("Mana value 7+");
  });
});
