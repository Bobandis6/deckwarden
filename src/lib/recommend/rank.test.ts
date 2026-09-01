import { describe, expect, it } from "vitest";

import type { RecommendMeta } from "@/lib/games/types";
import type { CandidateCard, CandidateCombo } from "./types";
import {
  COMBO_EVIDENCE_CAP,
  CURVE_CONFIDENCE_FLOOR,
  WEIGHTS,
  comboScore,
  deckCurve,
  popularityScore,
  rankCandidates,
} from "./rank";

/**
 * A synthetic meta, deliberately not the MTG one: the ranker must work off
 * any adapter's RecommendMeta (the multi-game contract), and these tests
 * prove the core carries no game knowledge. MTG phrasing/template specifics
 * live in src/lib/games/mtg/recommend.test.ts.
 */
const META: RecommendMeta = {
  popularity: {
    source: "test-popularity",
    evidence: (rank) => ({ why: `popular ${rank}`, howOften: `rank #${rank}` }),
  },
  curve: {
    source: "test-curve",
    buckets: [4, 6, 2], // buckets 0, 1, 2+
    bucketOf: (card) =>
      card.primaryType === "Resource" || card.costValue === null
        ? null
        : Math.min(2, card.costValue),
    evidence: ({ bucketLabel, current, target }) => ({
      why: `gap at ${bucketLabel}: ${current}/${target}`,
    }),
  },
  combos: {
    source: "test-combos",
    evidence: ({ withNames, templates, popularity }) => ({
      why: `combos with ${withNames.join(" + ")}${templates.length ? ` needs ${templates.join(",")}` : ""}`,
      howOften: popularity !== null ? `${popularity} decks` : null,
    }),
  },
};

let nextId = 0;
function candidate(over: Partial<CandidateCard> = {}): CandidateCard {
  nextId++;
  return {
    id: `00000000-0000-0000-0000-${String(nextId).padStart(12, "0")}`,
    name: `Card ${nextId}`,
    primaryType: "Unit",
    costValue: 2,
    ciMask: 0,
    cheapestUsd: "1.00",
    popularity: null,
    ...over,
  };
}

function combo(over: Partial<CandidateCombo> = {}): CandidateCombo {
  return {
    withPieces: [{ cardId: "deck-1", name: "Deck Piece" }],
    results: ["Infinite value"],
    templates: [],
    popularity: 500,
    ...over,
  };
}

/** A deck with enough curve-relevant cards to clear CURVE_CONFIDENCE_FLOOR. */
const FULLISH_DECK = [
  { card: { primaryType: "Unit", costValue: 0 }, qty: 4 }, // bucket 0 full (4/4)
  { card: { primaryType: "Unit", costValue: 1 }, qty: 5 }, // bucket 1 at 5/6
  { card: { primaryType: "Unit", costValue: 2 }, qty: 2 }, // bucket 2+ full (2/2)
  { card: { primaryType: "Resource", costValue: null }, qty: 10 }, // outside curve
]; // 11 curve-relevant cards — above CURVE_CONFIDENCE_FLOOR

function rank(
  candidates: CandidateCard[],
  combosByCandidate = new Map<string, CandidateCombo[]>(),
  deckCards = FULLISH_DECK,
  limit = 25,
) {
  return rankCandidates({ meta: META, deckCards, candidates, combosByCandidate, limit });
}

describe("evidence payload invariants (the product identity)", () => {
  it("every recommendation carries at least one evidence entry — never a bare score", () => {
    const cands = [candidate({ popularity: 10 }), candidate({ popularity: 5000 })];
    for (const rec of rank(cands)) {
      expect(rec.evidence.length).toBeGreaterThan(0);
      for (const e of rec.evidence) {
        expect(e.why).toBeTruthy();
        expect(e.source).toBeTruthy();
      }
    }
  });

  it("drops a candidate with no signals at all instead of emitting evidence-less output", () => {
    // No popularity, no combos, and a curve bucket that is already full.
    const noSignals = candidate({ popularity: null, costValue: 0 });
    expect(rank([noSignals])).toEqual([]);
  });

  it("evidence names the adapter-declared sources, nothing else", () => {
    const c = candidate({ popularity: 100, costValue: 1 });
    const recs = rank([c], new Map([[c.id, [combo()]]]));
    const sources = new Set(recs[0].evidence.map((e) => e.source));
    expect([...sources].sort()).toEqual(["test-combos", "test-curve", "test-popularity"]);
  });
});

describe("signal scoring", () => {
  it("popularityScore is monotonic (better rank → higher score)", () => {
    expect(popularityScore(1)).toBeGreaterThan(popularityScore(100));
    expect(popularityScore(100)).toBeGreaterThan(popularityScore(10000));
  });

  it("comboScore starts strong and saturates at 1", () => {
    expect(comboScore(0)).toBe(0);
    expect(comboScore(1)).toBeCloseTo(0.7);
    expect(comboScore(2)).toBeCloseTo(0.8);
    expect(comboScore(10)).toBe(1);
  });

  it("a missing signal contributes zero — no fabricated neutral midpoint", () => {
    // Same card twice, once without popularity: the difference must be
    // EXACTLY the popularity term, proving nothing was invented in its place.
    const ranked = candidate({ popularity: 100, costValue: 1 });
    const unranked = candidate({ popularity: null, costValue: 1 });
    const [a] = rank([ranked]);
    const [b] = rank([unranked]);
    expect(a.score - b.score).toBeCloseTo(WEIGHTS.popularity * popularityScore(100), 10);
  });

  it("completing a combo with the deck outranks a moderately better popularity rank", () => {
    const staple = candidate({ popularity: 100, costValue: 0 }); // full bucket, no curve help
    const comboPiece = candidate({ popularity: 500, costValue: 0 });
    const recs = rank([staple, comboPiece], new Map([[comboPiece.id, [combo()]]]));
    expect(recs[0].cardId).toBe(comboPiece.id);
  });
});

describe("curve fit", () => {
  it("emits curve evidence only for buckets with a real deficit", () => {
    const gapFiller = candidate({ popularity: 50, costValue: 1 }); // 5/6 → deficit
    const bucketFull = candidate({ popularity: 50, costValue: 0 }); // 4/4 → none
    const [gapRec] = rank([gapFiller]);
    const [fullRec] = rank([bucketFull]);
    expect(gapRec.evidence.some((e) => e.source === "test-curve")).toBe(true);
    expect(fullRec.evidence.some((e) => e.source === "test-curve")).toBe(false);
  });

  it("curve evidence has no frequency (editorial template) and at most medium confidence", () => {
    const c = candidate({ popularity: 50, costValue: 1 });
    const e = rank([c])[0].evidence.find((ev) => ev.source === "test-curve");
    expect(e).toBeDefined();
    expect(e?.howOften).toBeNull();
    expect(e?.confidence).toBe("medium");
  });

  it("degrades curve confidence to low under the small-deck floor (cold start)", () => {
    const tinyDeck = [{ card: { primaryType: "Unit", costValue: 1 }, qty: 2 }];
    expect(tinyDeck.reduce((n, d) => n + d.qty, 0)).toBeLessThan(CURVE_CONFIDENCE_FLOOR);
    const c = candidate({ popularity: 50, costValue: 2 });
    const e = rank([c], new Map(), tinyDeck)[0].evidence.find((ev) => ev.source === "test-curve");
    expect(e?.confidence).toBe("low");
  });

  it("deckCurve buckets by the adapter predicate, qty-weighted, overflow capped", () => {
    const { counts, total } = deckCurve(
      [
        { card: { primaryType: "Unit", costValue: 0 }, qty: 2 },
        { card: { primaryType: "Unit", costValue: 9 }, qty: 3 }, // → last bucket
        { card: { primaryType: "Resource", costValue: null }, qty: 5 }, // excluded
      ],
      META.curve!,
    );
    expect(counts).toEqual([2, 0, 3]);
    expect(total).toBe(5);
  });
});

describe("combo evidence", () => {
  it("carries the deck partners (with what) and the source frequency (how often)", () => {
    const c = candidate({ costValue: 1 });
    const hit = combo({ withPieces: [{ cardId: "d1", name: "Alpha" }], popularity: 1234 });
    const e = rank([c], new Map([[c.id, [hit]]]))[0].evidence.find(
      (ev) => ev.source === "test-combos",
    );
    expect(e?.with).toEqual([{ cardId: "d1", name: "Alpha" }]);
    expect(e?.howOften).toBe("1234 decks");
    expect(e?.confidence).toBe("high");
  });

  it("an unranked combo degrades to low confidence with no invented frequency", () => {
    const c = candidate({ popularity: null, costValue: 0 });
    const e = rank([c], new Map([[c.id, [combo({ popularity: null })]]]))[0].evidence.find(
      (ev) => ev.source === "test-combos",
    );
    expect(e?.howOften).toBeNull();
    expect(e?.confidence).toBe("low");
  });

  it("caps combo evidence entries but scores the full participation count", () => {
    const c = candidate({ popularity: null, costValue: 0 });
    const hits = Array.from({ length: COMBO_EVIDENCE_CAP + 3 }, () => combo());
    const [rec] = rank([c], new Map([[c.id, hits]]));
    expect(rec.evidence.filter((e) => e.source === "test-combos")).toHaveLength(COMBO_EVIDENCE_CAP);
    expect(rec.score).toBeCloseTo(WEIGHTS.combos * comboScore(hits.length), 10);
  });
});

describe("overall confidence (cold-start rule applied to ranking)", () => {
  it("is the max of the evidence confidences", () => {
    const c = candidate({ popularity: 100, costValue: 1 });
    expect(rank([c])[0].confidence).toBe("high"); // popularity present
  });

  it("bottoms out at low when the only signal is weak (unranked combo, tiny deck)", () => {
    const tinyDeck = [{ card: { primaryType: "Unit", costValue: 1 }, qty: 1 }];
    const c = candidate({ popularity: null, costValue: 0 });
    const [rec] = rank([c], new Map([[c.id, [combo({ popularity: null })]]]), tinyDeck);
    expect(rec.confidence).toBe("low");
  });

  it("template-only support stays medium at best", () => {
    const c = candidate({ popularity: null, costValue: 1 }); // curve gap only
    const [rec] = rank([c]);
    expect(rec.evidence.map((e) => e.source)).toEqual(["test-curve"]);
    expect(rec.confidence).toBe("medium");
  });
});

describe("determinism & ordering", () => {
  it("same input, same output", () => {
    const cands = [
      candidate({ popularity: 10, costValue: 1 }),
      candidate({ popularity: 999, costValue: 2 }),
      candidate({ popularity: null, costValue: 2 }),
    ];
    const combosMap = new Map([[cands[2].id, [combo()]]]);
    const a = rank(cands, combosMap);
    const b = rank(cands, combosMap);
    expect(a).toEqual(b);
  });

  it("breaks score ties by popularity, then name", () => {
    // Two candidates whose only signal is the same curve gap → equal scores.
    const zed = candidate({ popularity: null, costValue: 1, name: "Zed" });
    const abe = candidate({ popularity: null, costValue: 1, name: "Abe" });
    const recs = rank([zed, abe]);
    expect(recs.map((r) => r.name)).toEqual(["Abe", "Zed"]);
  });

  it("honors the limit after ranking", () => {
    const cands = Array.from({ length: 10 }, (_, i) =>
      candidate({ popularity: (i + 1) * 100, costValue: 1 }),
    );
    const recs = rank(cands, new Map(), FULLISH_DECK, 3);
    expect(recs).toHaveLength(3);
    expect(recs[0].popularity).toBe(100); // best rank survived the cut
  });
});

describe("meta without signals (a game with no data yet)", () => {
  it("produces no recommendations rather than inventing evidence", () => {
    const bare: RecommendMeta = {};
    const recs = rankCandidates({
      meta: bare,
      deckCards: FULLISH_DECK,
      candidates: [candidate({ popularity: 5 })],
      combosByCandidate: new Map(),
      limit: 10,
    });
    expect(recs).toEqual([]);
  });
});
