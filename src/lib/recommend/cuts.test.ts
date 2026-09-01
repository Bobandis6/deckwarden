import { describe, expect, it } from "vitest";

import type { RecommendMeta } from "@/lib/games/types";
import {
  completeCombosByCard,
  CUT_WEIGHTS,
  rankCuts,
  type CutCandidate,
  type CutComboInput,
  type CutEntryInput,
  type RankCutsInput,
} from "./cuts";

/**
 * Minimal game-ignorant meta mirroring the MTG shape: tier boundary at
 * rank 10000 (side flips), 3-bucket curve, price floor $10. The machine
 * must work off any such declaration — MTG-specific phrasing is pinned in
 * games/mtg/recommend.test.ts, not here.
 */
const META: RecommendMeta = {
  popularity: {
    source: "pop",
    evidence: (rank) => ({ why: `add:${rank}`, howOften: `#${rank}` }),
  },
  curve: {
    source: "curve",
    buckets: [2, 3, 2],
    bucketOf: (card) =>
      card.primaryType === "Land" || card.costValue === null ? null : Math.min(2, card.costValue),
    evidence: () => ({ why: "add-curve" }),
  },
  combos: {
    source: "combo",
    evidence: () => ({ why: "add-combo", howOften: null }),
  },
  cuts: {
    popularity: {
      evidence: (rank) =>
        rank <= 10000
          ? { why: `proven (#${rank})`, howOften: `#${rank}`, side: "keep" }
          : { why: `fringe (#${rank})`, howOften: `#${rank}`, side: "cut" },
    },
    curve: {
      evidence: ({ bucketLabel, current, target }) => ({
        why: `bucket ${bucketLabel}: ${current} vs ~${target}`,
      }),
    },
    roles: {
      source: "role",
      evidence: ({ role, tagged, target }) => ({
        why: `${tagged} tagged ${role}, wants ~${target}`,
      }),
    },
    combos: {
      evidence: ({ withNames }) => ({ why: `breaks ${withNames.join(" + ")}`, howOften: null }),
    },
    price: {
      source: "price",
      minUsd: 10,
      evidence: ({ usd }) => ({ why: `pricey $${usd}` }),
    },
  },
};

let nextId = 0;
function entry(
  over: Partial<CutEntryInput["card"]> & { qty?: number; zone?: string; tags?: string[] },
): CutEntryInput {
  nextId += 1;
  const { qty, zone, tags, ...card } = over;
  return {
    card: {
      id: card.id ?? `c${nextId}`,
      name: card.name ?? `Card ${nextId}`,
      primaryType: card.primaryType ?? "Creature",
      costValue: card.costValue ?? null,
      cheapestUsd: card.cheapestUsd ?? null,
      popularity: card.popularity ?? null,
    },
    zone: zone ?? "main",
    qty: qty ?? 1,
    tags: tags ?? [],
  };
}

function rank(over: Partial<RankCutsInput>): ReturnType<typeof rankCuts> {
  return rankCuts({
    meta: META,
    roleTargets: [],
    entries: [],
    excludedZones: new Set(["commander"]),
    completeCombosByCard: new Map(),
    ...over,
  });
}

const byId = (result: { cuts: CutCandidate[] }, id: string): CutCandidate => {
  const hit = result.cuts.find((c) => c.cardId === id);
  if (!hit) throw new Error(`no candidate ${id}`);
  return hit;
};

describe("popularity signal", () => {
  it("ranks a deep-rank card above a staple, with sides matching the tiers", () => {
    const result = rank({
      entries: [
        entry({ id: "staple", popularity: 12 }),
        entry({ id: "fringe", popularity: 40000 }),
      ],
    });
    expect(result.cuts.map((c) => c.cardId)).toEqual(["fringe", "staple"]);
    expect(byId(result, "fringe").evidence[0]).toMatchObject({
      source: "pop",
      side: "cut",
      confidence: "high",
    });
    expect(byId(result, "staple").evidence[0]).toMatchObject({ side: "keep" });
    expect(byId(result, "fringe").score).toBeGreaterThan(byId(result, "staple").score);
  });

  it("emits nothing for a null rank — missing signal stays missing", () => {
    const result = rank({ entries: [entry({ id: "unknown", popularity: null })] });
    expect(result.cuts).toEqual([]);
    expect(result.unranked).toBe(1);
  });

  it("trails a keep-side popularity line behind the cut reasons that ranked the card", () => {
    // Widely played (keep) but its bucket is overloaded (cut): the lead line
    // must be why it's ranked — the curve slack — with the keep line as the
    // trailing cost, never a top cut fronted by "it earns its slot".
    const overload = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `mv1-${i}`, costValue: 1, popularity: 5000 }),
    );
    const result = rank({ entries: overload });
    const sides = byId(result, "mv1-0").evidence.map((e) => [e.source, e.side]);
    expect(sides).toEqual([
      ["curve", "cut"],
      ["pop", "keep"],
    ]);
  });
});

describe("curve overload", () => {
  it("adds cut evidence only for buckets over their target", () => {
    // Bucket 1 target 3: five cards at cost 1 → surplus. Bucket 0 target 2:
    // one card at cost 0 → under target, silent.
    const overload = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `mv1-${i}`, costValue: 1, popularity: 20000 }),
    );
    const result = rank({
      entries: [...overload, entry({ id: "mv0", costValue: 0, popularity: 20000 })],
    });
    const line = byId(result, "mv1-0").evidence.find((e) => e.source === "curve");
    expect(line).toMatchObject({ side: "cut", why: "bucket 1: 5 vs ~3" });
    expect(byId(result, "mv0").evidence.some((e) => e.source === "curve")).toBe(false);
  });

  it("ignores cards outside curve logic (lands, no cost)", () => {
    const result = rank({
      entries: [entry({ id: "land", primaryType: "Land", costValue: 0, popularity: 20000 })],
    });
    expect(byId(result, "land").evidence.some((e) => e.source === "curve")).toBe(false);
  });

  it("counts excluded-zone (leader) cards toward the deck's curve state", () => {
    // Two mv-2 main cards + a commander at mv 2 → bucket 2 holds 3 > target
    // 2, and the surplus exists only because the leader is counted.
    const result = rank({
      entries: [
        entry({ id: "a", costValue: 2, popularity: 20000 }),
        entry({ id: "b", costValue: 2, popularity: 20000 }),
        entry({ id: "cmd", costValue: 2, zone: "commander", popularity: 20000 }),
      ],
    });
    expect(result.cuts.map((c) => c.cardId).sort()).toEqual(["a", "b"]); // never the leader
    expect(byId(result, "a").evidence.some((e) => e.source === "curve")).toBe(true);
  });
});

describe("role overload (tags only, never inferred)", () => {
  const roleTargets = [{ label: "Ramp", count: 2 }];

  it("counts qty-weighted tagged cards, case-insensitively, and phrases the overload", () => {
    const result = rank({
      roleTargets,
      entries: [
        entry({ id: "r1", tags: ["ramp"], qty: 2, popularity: 20000 }),
        entry({ id: "r2", tags: ["RAMP"], popularity: 20000 }),
        entry({ id: "untagged", popularity: 20000 }),
      ],
    });
    const line = byId(result, "r1").evidence.find((e) => e.source === "role");
    expect(line).toMatchObject({
      side: "cut",
      why: "3 tagged Ramp, wants ~2",
      confidence: "medium",
    });
    // Untagged cards get no role evidence even while the role is overloaded.
    expect(byId(result, "untagged").evidence.some((e) => e.source === "role")).toBe(false);
  });

  it("stays silent at or under the target, and for tags that match no template role", () => {
    const result = rank({
      roleTargets,
      entries: [
        entry({ id: "r1", tags: ["Ramp"], popularity: 20000 }),
        entry({ id: "w1", tags: ["wincon"], popularity: 20000 }),
      ],
    });
    expect(byId(result, "r1").evidence.some((e) => e.source === "role")).toBe(false);
    expect(byId(result, "w1").evidence.some((e) => e.source === "role")).toBe(false);
  });

  it("scores the largest surplus once for multi-tagged cards but lists every overloaded role", () => {
    const targets = [
      { label: "Ramp", count: 1 },
      { label: "Draw", count: 1 },
    ];
    const result = rank({
      roleTargets: targets,
      entries: [
        entry({ id: "both", tags: ["Ramp", "Draw"], qty: 2, popularity: 20000 }),
        entry({ id: "one", tags: ["Ramp"], qty: 2, popularity: 20000 }),
      ],
    });
    expect(byId(result, "both").evidence.filter((e) => e.source === "role")).toHaveLength(2);
    // Same max surplus → same role contribution: listing two roles must not double-punish.
    expect(byId(result, "both").score).toBeCloseTo(byId(result, "one").score, 10);
  });
});

describe("complete-combo membership", () => {
  const combo = (
    id: string,
  ): [
    string,
    {
      withPieces: { cardId: string; name: string }[];
      results: string[];
      popularity: number | null;
    }[],
  ] => [
    id,
    [
      {
        withPieces: [{ cardId: "partner", name: "Partner Piece" }],
        results: ["Infinite mana"],
        popularity: 4000,
      },
    ],
  ];

  it("leads the member's evidence with the break warning and sorts members last", () => {
    const result = rank({
      entries: [
        entry({ id: "piece", popularity: 40000, cheapestUsd: 40 }),
        entry({ id: "staple", popularity: 12 }),
      ],
      completeCombosByCard: new Map([combo("piece")]),
    });
    // Max cut signals on the piece, near-zero on the staple — membership still wins.
    expect(result.cuts.map((c) => c.cardId)).toEqual(["staple", "piece"]);
    const piece = byId(result, "piece");
    expect(piece.inCompleteCombo).toBe(true);
    expect(piece.evidence[0]).toMatchObject({
      source: "combo",
      side: "keep",
      why: "breaks Partner Piece",
      confidence: "high",
    });
    expect(piece.evidence[0].with).toEqual([{ cardId: "partner", name: "Partner Piece" }]);
  });

  it("degrades an unranked combo's warning to low confidence, still leading", () => {
    const result = rank({
      entries: [entry({ id: "piece", popularity: 40000 })],
      completeCombosByCard: new Map([
        [
          "piece",
          [{ withPieces: [{ cardId: "p2", name: "Other" }], results: [], popularity: null }],
        ],
      ]),
    });
    expect(byId(result, "piece").evidence[0]).toMatchObject({ side: "keep", confidence: "low" });
  });
});

describe("price signal", () => {
  it("fires only on measured weak play at or above the floor", () => {
    const result = rank({
      entries: [
        entry({ id: "pricey-fringe", popularity: 40000, cheapestUsd: 42.5 }),
        entry({ id: "pricey-staple", popularity: 12, cheapestUsd: 100 }),
        entry({ id: "cheap-fringe", popularity: 40000, cheapestUsd: 2 }),
        entry({ id: "pricey-unknown", popularity: null, cheapestUsd: 100 }),
      ],
    });
    expect(byId(result, "pricey-fringe").evidence.some((e) => e.source === "price")).toBe(true);
    expect(byId(result, "pricey-staple").evidence.some((e) => e.source === "price")).toBe(false);
    expect(byId(result, "cheap-fringe").evidence.some((e) => e.source === "price")).toBe(false);
    // No rank → no contribution to weigh price against → unranked entirely.
    expect(result.cuts.some((c) => c.cardId === "pricey-unknown")).toBe(false);
    expect(byId(result, "pricey-fringe").score - byId(result, "cheap-fringe").score).toBeCloseTo(
      CUT_WEIGHTS.price * (42.5 / 50),
      10,
    );
  });
});

describe("ordering and determinism", () => {
  it("breaks score ties by popularity desc (nulls last), then name", () => {
    // Equal curve-only signals: two null-popularity cards and nothing else.
    const mkEntries = (): CutEntryInput[] => [
      entry({ id: "b-card", name: "Beta", costValue: 1, popularity: null }),
      entry({ id: "a-card", name: "Alpha", costValue: 1, popularity: null }),
      entry({ id: "ranked", name: "Gamma", costValue: 1, popularity: 30000 }),
      entry({ id: "x", name: "Delta", costValue: 1, popularity: 20000 }),
    ];
    const result = rank({ entries: mkEntries() });
    // 4 cards in bucket 1 (target 3) → all carry curve evidence. Ranked ones
    // score higher (popularity adds); among the null pair, name breaks the tie.
    expect(result.cuts.map((c) => c.cardId)).toEqual(["ranked", "x", "a-card", "b-card"]);
    const again = rank({ entries: mkEntries() });
    expect(again.cuts.map((c) => c.cardId)).toEqual(result.cuts.map((c) => c.cardId));
  });

  it("returns nothing without a cuts declaration", () => {
    const noCuts: RecommendMeta = { popularity: META.popularity, curve: META.curve };
    expect(rank({ meta: noCuts, entries: [entry({ popularity: 40000 })] }).cuts).toEqual([]);
  });
});

describe("completeCombosByCard", () => {
  const combos: CutComboInput[] = [
    {
      inDeckPieces: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      missingPieces: [],
      templates: [],
      results: ["Infinite mana"],
      popularity: 4000,
    },
    {
      // Template-requirement combo: all cards held, still never "complete".
      inDeckPieces: [
        { id: "a", name: "A" },
        { id: "t", name: "T" },
      ],
      missingPieces: [],
      templates: ["A creature with power 5+"],
      results: [],
      popularity: 9000,
    },
    {
      // One-away line — not complete, cutting a piece breaks nothing yet.
      inDeckPieces: [{ id: "b", name: "B" }],
      missingPieces: [{ id: "z", name: "Z" }],
      templates: [],
      results: [],
      popularity: 100,
    },
  ];

  it("maps only truly complete combos, each piece seeing its partners", () => {
    const map = completeCombosByCard(combos, new Set(["a", "b", "t"]));
    expect(map.get("a")).toEqual([
      { withPieces: [{ cardId: "b", name: "B" }], results: ["Infinite mana"], popularity: 4000 },
    ]);
    expect(map.get("b")).toHaveLength(1);
    expect(map.has("t")).toBe(false); // template combo never warns
  });

  it("drops a combo whose piece has already been cut from the entries", () => {
    const map = completeCombosByCard(combos, new Set(["a", "t"]));
    expect(map.size).toBe(0);
  });
});
