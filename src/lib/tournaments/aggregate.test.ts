import { describe, expect, it } from "vitest";

import { normalizeCardName } from "@/lib/cards/normalize";
import { makeListCardResolver, rollUpLists, settledCutoffIso, type DatedList } from "./aggregate";

describe("makeListCardResolver", () => {
  const resolver = makeListCardResolver(
    {
      byExternalKey: new Map([["oracle-sol", "id-sol"]]),
      byNameNorm: new Map([["sol ring", "id-sol-by-name"]]),
      byFaceNorm: new Map([
        ["shatterskull smashing", "id-shatterskull"],
        ["birgi, god of storytelling", "id-birgi"],
      ]),
    },
    normalizeCardName,
  );

  it("prefers the oracle id over any name match", () => {
    expect(resolver({ name: "Sol Ring", oracleId: "oracle-sol" })).toBe("id-sol");
  });

  it("falls back to exact name_norm, then face names (DFCs written as one face)", () => {
    expect(resolver({ name: "Sol Ring" })).toBe("id-sol-by-name");
    expect(resolver({ name: "Shatterskull Smashing" })).toBe("id-shatterskull"); // back face
    expect(resolver({ name: "Birgi, God of Storytelling" })).toBe("id-birgi"); // front face
  });

  it("returns undefined (counted upstream) rather than guessing — exact only, never trgm", () => {
    expect(resolver({ name: "Sol Rang" })).toBeUndefined();
    expect(resolver({ name: "Sol Ring", oracleId: "oracle-unknown" })).toBe("id-sol-by-name");
  });
});

describe("rollUpLists", () => {
  const kinnan = ["id-kinnan"];
  const pair = ["id-kraum", "id-tymna"]; // sorted, as the mapper emits

  const lists: DatedList[] = [
    { leaderIds: kinnan, placement: 1, cardIds: ["id-sol", "id-crypt"], startDate: "2026-05-01" },
    { leaderIds: kinnan, placement: 9, cardIds: ["id-sol"], startDate: "2026-06-15" },
    { leaderIds: pair, placement: 4, cardIds: ["id-sol"], startDate: "2026-04-20" },
  ];

  it("rolls up per exact commander set: lists, top4 (placement ≤ 4), date bounds", () => {
    const { pairs, commanders } = rollUpLists(lists);

    const kinnanSol = pairs.find(
      (p) => p.leader_ids.join() === "id-kinnan" && p.card_identity_id === "id-sol",
    );
    expect(kinnanSol).toEqual({
      leader_ids: ["id-kinnan"],
      card_identity_id: "id-sol",
      lists: 2,
      top4: 1,
      first_seen: "2026-05-01",
      last_seen: "2026-06-15",
    });

    const pairSol = pairs.find(
      (p) => p.leader_ids.join() === "id-kraum,id-tymna" && p.card_identity_id === "id-sol",
    );
    expect(pairSol?.lists).toBe(1);
    expect(pairSol?.top4).toBe(1); // 4th place counts

    expect(commanders).toHaveLength(2);
    const kinnanCmd = commanders.find((c) => c.leader_ids.join() === "id-kinnan");
    expect(kinnanCmd).toEqual({
      leader_ids: ["id-kinnan"],
      lists: 2,
      first_seen: "2026-05-01",
      last_seen: "2026-06-15",
    });
  });

  it("emits increments that compose: two batches sum to the one-batch totals", () => {
    const [a, b, c] = lists;
    const whole = rollUpLists([a, b, c]);
    const batch1 = rollUpLists([a]);
    const batch2 = rollUpLists([b, c]);
    const summed = new Map<string, number>();
    for (const p of [...batch1.pairs, ...batch2.pairs]) {
      const key = `${p.leader_ids.join()}|${p.card_identity_id}`;
      summed.set(key, (summed.get(key) ?? 0) + p.lists);
    }
    for (const p of whole.pairs) {
      expect(summed.get(`${p.leader_ids.join()}|${p.card_identity_id}`)).toBe(p.lists);
    }
  });

  it("distinct commander sets never merge (exact-set key, not per-leader)", () => {
    const { commanders } = rollUpLists([
      { leaderIds: ["id-tymna"], placement: 1, cardIds: ["id-sol"], startDate: "2026-05-01" },
      {
        leaderIds: ["id-kraum", "id-tymna"],
        placement: 2,
        cardIds: ["id-sol"],
        startDate: "2026-05-01",
      },
    ]);
    expect(commanders).toHaveLength(2);
  });
});

describe("settledCutoffIso", () => {
  it("is the date exactly trailing-refetch days before the run end", () => {
    const endMs = Date.UTC(2026, 8, 2, 14, 40); // 2026-09-02T14:40Z
    expect(settledCutoffIso(endMs, 14)).toBe("2026-08-19");
  });
});
