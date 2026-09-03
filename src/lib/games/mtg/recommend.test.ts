import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import {
  MTG_CURVE_TEMPLATE,
  mtgCurveBucketOf,
  mtgRecommend,
  STAPLE_RANK,
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

  it("prices against the play-data tier it compounds, above a real floor", () => {
    expect(cuts.price?.minUsd).toBe(10);
    const { why } = cuts.price!.evidence({ usd: "42.50" });
    expect(why).toContain("$42.50");
    expect(why).toContain("widely-played tier");
  });

  it("declares display metadata for every cut evidence source", () => {
    // Curve/popularity/combo reuse the sibling slugs; roles and price add
    // their own — all must render with a human label in the panel.
    for (const slug of ["edhrec_rank", "curve-template", "spellbook", "role-template", "price"]) {
      expect(mtgRecommend.sources?.[slug]?.label).toBeTruthy();
    }
  });
});
