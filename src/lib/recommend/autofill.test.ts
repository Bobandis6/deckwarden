import { describe, expect, it } from "vitest";

import type { AutofillMeta, RecommendMeta } from "@/lib/games/types";
import {
  buildShell,
  COMBO_PICK_CAP,
  finishShell,
  FULL_NOTE,
  scaleByLargestRemainder,
  shortfallNote,
  type ShellInput,
} from "./autofill";
import type { TournamentContext, TournamentSignal } from "./rank";
import { mulberry32, sampleWeighted } from "./rng";
import type { Recommendation } from "./types";

/**
 * Planner tests run on a MINI declaration (template 3 base + [2,3,2] curve
 * = 10 slots) so every count is checkable by hand; the real MTG declaration
 * is pinned in src/lib/games/mtg/recommend.test.ts.
 */
const AUTOFILL: AutofillMeta = {
  base: {
    label: "Lands",
    source: "land-template",
    count: 3,
    scope: { column: "primary_type", op: "eq", value: "Land" },
    isBase: (card) => card.primaryType === "Land",
    rankedByColorCount: [1, 2, 3],
    maxColorlessIdentity: 1,
    fillerNames: ["Plains"],
    fillers: ({ n }) => (n > 0 ? [{ name: "Plains", qty: n, why: "basic filler" }] : []),
  },
  lockShare: 0.5,
  lockMinLists: 5,
  costTextOf: (attrs) => (typeof attrs.mana_cost === "string" ? attrs.mana_cost : null),
  curveLabel: (label) => `Mana value ${label}`,
};

const CURVE: NonNullable<RecommendMeta["curve"]> = {
  source: "curve-template",
  buckets: [2, 3, 2],
  bucketOf: (card) =>
    card.primaryType === "Land" || card.costValue === null
      ? null
      : Math.min(2, Math.max(0, card.costValue)),
  evidence: () => ({ why: "gap" }),
};

let seq = 0;
function rec(
  over: Partial<Recommendation> & { costValue: number | null; primaryType?: string | null },
): Recommendation {
  seq += 1;
  return {
    cardId: `00000000-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    name: `Card ${seq}`,
    primaryType: "Creature",
    ciMask: 0,
    cheapestUsd: "1.00",
    popularity: seq,
    score: 0.5,
    confidence: "high",
    evidence: [{ source: "edhrec_rank", why: "why", with: [], howOften: null, confidence: "high" }],
    ...over,
  };
}

const land = (over: Partial<Recommendation> = {}) =>
  rec({ primaryType: "Land", costValue: null, ...over });

function input(over: Partial<ShellInput> = {}): ShellInput {
  return {
    autofill: AUTOFILL,
    curve: CURVE,
    slots: 10,
    keep: [],
    ciMask: 3,
    pool: [],
    basePool: [],
    tournamentContext: null,
    tournamentsByCandidate: new Map(),
    comboCandidateIds: new Set(),
    zone: "main",
    seed: 42,
    ...over,
  };
}

/** A pool big enough to fill the mini template with room to sample. */
function bigPool(scorePer = (i: number) => 1 - i * 0.01): Recommendation[] {
  const out: Recommendation[] = [];
  for (let bucket = 0; bucket < 3; bucket++) {
    for (let i = 0; i < 12; i++) {
      out.push(rec({ costValue: bucket, score: scorePer(i) }));
    }
  }
  return out;
}

describe("scaleByLargestRemainder", () => {
  it("hits the total exactly, largest fractional remainder first, ties to the lower index", () => {
    expect(scaleByLargestRemainder([2, 3, 2], 7)).toEqual([2, 3, 2]);
    // 6×[2,3,2]/7 = [1.71, 2.57, 1.71]: the two .71 fractions win the remainders.
    expect(scaleByLargestRemainder([2, 3, 2], 6)).toEqual([2, 2, 2]);
    expect(scaleByLargestRemainder([1, 1, 1], 2)).toEqual([1, 1, 0]);
    expect(scaleByLargestRemainder([2, 3, 2], 0)).toEqual([0, 0, 0]);
    expect(scaleByLargestRemainder([0, 0, 0], 5)).toEqual([0, 0, 0]);
  });
});

describe("rng", () => {
  it("mulberry32 is a pinned sequence (determinism is the product)", () => {
    const rand = mulberry32(42);
    const first = [rand(), rand(), rand()];
    const again = mulberry32(42);
    expect([again(), again(), again()]).toEqual(first);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(first[0]);
  });

  it("sampleWeighted is seed-deterministic and favors weight", () => {
    const items = [
      { id: "heavy", w: 100 },
      { id: "light", w: 0.0001 },
    ];
    const picks = sampleWeighted(items, 1, (i) => i.w, mulberry32(1));
    expect(picks[0].id).toBe("heavy");
    const a = sampleWeighted(items, 2, (i) => i.w, mulberry32(7));
    const b = sampleWeighted(items, 2, (i) => i.w, mulberry32(7));
    expect(a).toEqual(b);
  });
});

describe("buildShell", () => {
  it("a full deck plans nothing and says so", () => {
    const shell = finishShell(buildShell(input({ slots: 0 })), [], { zone: "main" });
    expect(shell.picks).toEqual([]);
    expect(shell.notes).toEqual([FULL_NOTE]);
  });

  it("an empty deck fills every slot: base ranked + fillers + the scaled curve", () => {
    const draft = buildShell(
      input({ pool: bigPool(), basePool: [land({ ciMask: 1 }), land({ ciMask: 2 })] }),
    );
    // ci popcount 2 → rankedByColorCount[2] = 3 ranked slots, 2 lands exist.
    expect(draft.picks.filter((p) => p.group === "base")).toHaveLength(2);
    expect(draft.fillerNeed).toBe(1);
    // Curve: 10 slots − 3 base = 7 = the template [2,3,2] verbatim.
    const perBucket = [0, 1, 2].map(
      (b) => draft.picks.filter((p) => p.group === `curve-${b}`).length,
    );
    expect(perBucket).toEqual([2, 3, 2]);
    const shell = finishShell(
      draft,
      [{ cardId: "f-1", name: "Plains", qty: 1, cheapestUsd: "0.10", why: "basic filler" }],
      { zone: "main" },
    );
    expect(shell.totals.picks).toBe(10);
    expect(shell.notes).toEqual([]);
    expect(shell.groups.map((g) => `${g.label}:${g.picks}`)).toEqual([
      "Lands:3",
      "Mana value 0:2",
      "Mana value 1:3",
      "Mana value 2+:2",
    ]);
    // Every pick carries evidence, fillers included.
    expect(shell.picks.every((p) => p.evidence.length >= 1)).toBe(true);
    expect(shell.picks.find((p) => p.tier === "filler")?.evidence[0].source).toBe("land-template");
  });

  it("kept cards shrink their buckets and the base need (partners / off-template keeps rescale)", () => {
    const draft = buildShell(
      input({
        slots: 6,
        keep: [
          { qty: 2, card: { primaryType: "Land", costValue: null } },
          { qty: 2, card: { primaryType: "Creature", costValue: 1 } },
        ],
        pool: bigPool(),
        basePool: [land({ ciMask: 1 })],
      }),
    );
    // needBase = 3 − 2 = 1 (ranked land available → no filler).
    expect(draft.picks.filter((p) => p.group === "base")).toHaveLength(1);
    expect(draft.fillerNeed).toBe(0);
    // Curve raw need [2, 1, 2] scales to 5 slots by largest remainder.
    const perBucket = [0, 1, 2].map(
      (b) => draft.picks.filter((p) => p.group === `curve-${b}`).length,
    );
    expect(perBucket.reduce((a, b) => a + b, 0)).toBe(5);
    expect(perBucket).toEqual([2, 1, 2]);
  });

  it("same seed → identical picks; another seed → different picks", () => {
    const base = input({ pool: bigPool(() => 0.5), basePool: [land()] });
    const one = buildShell({ ...base, seed: 7 }).picks.map((p) => p.cardId);
    const two = buildShell({ ...base, seed: 7 }).picks.map((p) => p.cardId);
    expect(two).toEqual(one);
    const other = buildShell({ ...base, seed: 8 }).picks.map((p) => p.cardId);
    expect(other).not.toEqual(one);
  });

  it("tier A locks measured staples in rank order ahead of sampling", () => {
    const locked = rec({ costValue: 0, score: 0.01 }); // low score, strong record
    const signals = new Map<string, TournamentSignal>([[locked.cardId, { lists: 9, top4: 2 }]]);
    const context: TournamentContext = { commanderNames: ["A"], lists: 12, since: null };
    const draft = buildShell(
      input({
        pool: [...bigPool(), locked],
        basePool: [],
        tournamentContext: context,
        tournamentsByCandidate: signals,
      }),
    );
    const pick = draft.picks.find((p) => p.cardId === locked.cardId);
    expect(pick?.tier).toBe("locked");
  });

  it("a thin record (lists < lockMinLists) never locks", () => {
    const thin = rec({ costValue: 0, score: 0.01 });
    const draft = buildShell(
      input({
        pool: [thin, ...bigPool()],
        tournamentContext: { commanderNames: ["A"], lists: 4, since: null },
        tournamentsByCandidate: new Map([[thin.cardId, { lists: 4, top4: 0 }]]),
      }),
    );
    expect(draft.picks.find((p) => p.cardId === thin.cardId)?.tier ?? "absent").not.toBe("locked");
  });

  it("tier B caps combo picks globally", () => {
    const combos = Array.from({ length: 10 }, () => rec({ costValue: 1, score: 0.9 }));
    const draft = buildShell(
      input({
        slots: 20,
        pool: [...combos, ...bigPool()],
        comboCandidateIds: new Set(combos.map((c) => c.cardId)),
      }),
    );
    expect(draft.picks.filter((p) => p.tier === "combo").length).toBeLessThanOrEqual(
      COMBO_PICK_CAP,
    );
    expect(draft.picks.filter((p) => p.tier === "combo").length).toBeGreaterThan(0);
  });

  it("a dry bucket borrows from the nearest bucket (b−1 first), keeping the donor's group", () => {
    // Bucket 2 has nothing; buckets 0/1 have surplus.
    const pool = [
      ...Array.from({ length: 8 }, () => rec({ costValue: 0 })),
      ...Array.from({ length: 8 }, () => rec({ costValue: 1 })),
    ];
    const draft = buildShell(input({ pool, basePool: [land()], slots: 8 }));
    // needBase 3 (1 ranked + 2 filler), curve needs [2,3,2] scaled to 5 → borrowing fills bucket 2's share.
    expect(draft.shortLabels).toEqual([]);
    const total = draft.picks.filter((p) => p.group.startsWith("curve-")).length;
    expect(total).toBe(5);
    expect(draft.picks.every((p) => p.group !== "curve-2")).toBe(true);
  });

  it("colorless-identity base picks stop at the cap", () => {
    const draft = buildShell(
      input({
        ciMask: 3,
        basePool: [
          land({ ciMask: 0 }),
          land({ ciMask: 0 }),
          land({ ciMask: 0 }),
          land({ ciMask: 1 }),
        ],
        pool: bigPool(),
      }),
    );
    const basePicks = draft.picks.filter((p) => p.group === "base");
    expect(basePicks.filter((p) => p.tier !== "filler")).toHaveLength(2); // 1 colorless (cap) + 1 colored
    expect(draft.fillerNeed).toBe(1);
  });
});

describe("finishShell notes (the W9b-rendered vocabulary — exact strings)", () => {
  it("pins the shortfall wording, with and without a budget", () => {
    expect(shortfallNote(71, 87, ["Mana value 5", "Mana value 7+"], 1)).toBe(
      "Filled 71 of 87 — the $1-a-card budget leaves too few candidates in Mana value 5, Mana value 7+.",
    );
    expect(shortfallNote(93, 99, ["Lands"])).toBe("Filled 93 of 99 — too few candidates in Lands.");
    expect(FULL_NOTE).toBe("The deck is already full — nothing to add.");
  });

  it("reports a real shortfall with the short groups named", () => {
    // Nothing in any pool: every bucket + the base go short.
    const shell = finishShell(buildShell(input({ slots: 10 })), [], {
      zone: "main",
      budgetUsd: 1,
    });
    expect(shell.totals.picks).toBe(0);
    expect(shell.notes).toHaveLength(1);
    expect(shell.notes[0]).toContain("Filled 0 of 10 — the $1-a-card budget");
    expect(shell.notes[0]).toContain("Lands");
  });

  it("totals price the qty-weighted picks and count unpriced ones honestly", () => {
    const draft = buildShell(input({ pool: bigPool(), basePool: [] }));
    const shell = finishShell(
      draft,
      [{ cardId: "f-1", name: "Plains", qty: 3, cheapestUsd: null, why: "basic filler" }],
      { zone: "main" },
    );
    expect(shell.totals.unpriced).toBe(3);
    expect(shell.totals.estUsd).toBe(7); // 7 curve picks at $1.00
  });
});

/**
 * The fixed-seed golden (Y6b): written BEFORE goals touched the planner and
 * recorded from fb435ec's code — literal ids (no module counter), every tier
 * exercised (a locked staple, a combo completion, the sampled windows, a dry
 * bucket's borrowing, the base pool's lock order and colorless cap). With
 * goals absent the planner must keep answering exactly this.
 */
describe("the fixed-seed golden (goals absent — byte-identical since fb435ec)", () => {
  const gid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const g = (
    n: number,
    over: Partial<Recommendation> & { costValue: number | null },
  ): Recommendation => ({
    cardId: gid(n),
    name: `Golden ${n}`,
    primaryType: "Creature",
    ciMask: 1,
    cheapestUsd: "0.50",
    popularity: n,
    score: 0.5,
    confidence: "high",
    evidence: [{ source: "edhrec_rank", why: "why", with: [], howOften: null, confidence: "high" }],
    ...over,
  });
  // Bucket 0: ten cards, scores falling; the combo completion sits low (0.12).
  const bucket0 = Array.from({ length: 10 }, (_, i) =>
    g(100 + i, { costValue: 0, score: 0.6 - i * 0.01 }),
  );
  const combo = g(150, { costValue: 0, score: 0.12 });
  // Bucket 1: twelve cards with uneven scores; the locked staple sits low (0.05).
  const bucket1 = Array.from({ length: 12 }, (_, i) =>
    g(200 + i, {
      costValue: 1,
      score: [0.55, 0.4, 0.52, 0.38, 0.5, 0.49, 0.47, 0.3, 0.45, 0.44, 0.43, 0.42][i],
    }),
  );
  const staple = g(250, { costValue: 1, score: 0.05 });
  // Bucket 2 (2+) is dry: one card, so its share borrows from bucket 1 first.
  const bucket2 = [g(300, { costValue: 4, score: 0.8 })];
  const lands = [
    g(400, { primaryType: "Land", costValue: null, ciMask: 1, score: 0.9 }),
    g(401, { primaryType: "Land", costValue: null, ciMask: 0, score: 0.8 }),
    g(402, { primaryType: "Land", costValue: null, ciMask: 0, score: 0.7 }),
    g(403, { primaryType: "Land", costValue: null, ciMask: 2, score: 0.6 }),
    g(404, { primaryType: "Land", costValue: null, ciMask: 2, score: 0.1 }),
  ];
  const signals = new Map<string, TournamentSignal>([
    [staple.cardId, { lists: 9, top4: 3 }],
    [lands[4].cardId, { lists: 8, top4: 1 }],
  ]);
  const golden = (seed: number): ShellInput =>
    input({
      slots: 10,
      ciMask: 3,
      pool: [...bucket0, combo, ...bucket1, staple, ...bucket2].sort((a, b) => b.score - a.score),
      basePool: [...lands],
      tournamentContext: { commanderNames: ["Golden"], lists: 12, since: null },
      tournamentsByCandidate: signals,
      comboCandidateIds: new Set([combo.cardId]),
      seed,
    });
  const shape = (seed: number) =>
    buildShell(golden(seed)).picks.map((p) => `${p.cardId.slice(-3)} ${p.group} ${p.tier}`);

  it("seeds 42, 1,234,567 and 7 plan exactly what fb435ec planned — every tier, the borrow, the base order", () => {
    expect(shape(42)).toEqual([
      "150 curve-0 combo",
      "100 curve-0 sampled",
      "250 curve-1 locked",
      "200 curve-1 sampled",
      "202 curve-1 sampled",
      "300 curve-2 sampled",
      "204 curve-1 sampled",
      "404 base locked",
      "400 base sampled",
      "401 base sampled",
    ]);
    expect(shape(1_234_567)).toEqual([
      "150 curve-0 combo",
      "100 curve-0 sampled",
      "250 curve-1 locked",
      "200 curve-1 sampled",
      "205 curve-1 sampled",
      "300 curve-2 sampled",
      "202 curve-1 sampled",
      "404 base locked",
      "400 base sampled",
      "401 base sampled",
    ]);
    expect(shape(7)).toEqual([
      "150 curve-0 combo",
      "101 curve-0 sampled",
      "250 curve-1 locked",
      "200 curve-1 sampled",
      "202 curve-1 sampled",
      "300 curve-2 sampled",
      "204 curve-1 sampled",
      "404 base locked",
      "400 base sampled",
      "401 base sampled",
    ]);
    const draft = buildShell(golden(42));
    expect(draft.fillerNeed).toBe(0);
    expect(draft.shortLabels).toEqual([]);
    const fin = finishShell(draft, [], { zone: "main" });
    expect(fin.groups).toEqual([
      { id: "base", label: "Lands", picks: 3 },
      { id: "curve-0", label: "Mana value 0", picks: 2 },
      { id: "curve-1", label: "Mana value 1", picks: 4 },
      { id: "curve-2", label: "Mana value 2+", picks: 1 },
    ]);
    expect(fin.notes).toEqual([]);
    expect(fin.totals).toEqual({ picks: 10, estUsd: 5, unpriced: 0 });
  });
});
