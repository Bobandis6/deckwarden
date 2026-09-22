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
