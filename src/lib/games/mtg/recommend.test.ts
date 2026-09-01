import { describe, expect, it } from "vitest";

import { mtgAdapter } from "./adapter";
import { MTG_CURVE_TEMPLATE, mtgCurveBucketOf, mtgRecommend } from "./recommend";

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
});
