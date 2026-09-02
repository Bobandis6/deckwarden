import { describe, expect, it } from "vitest";

import { schema } from "@/db";
import { foldRows, pickFinish, planImport, rowKey, writeKey } from "./plan";
import { COLLECTION_LIMITS, FINISHES, type CollectionRow } from "./types";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

describe("finish vocabulary", () => {
  it("is one list in the schema and in the client-safe types module", () => {
    expect([...schema.COLLECTION_FINISHES]).toEqual([...FINISHES]);
  });
});

describe("rowKey / foldRows", () => {
  it("keys by the strongest key present: scryfall id, then set+number, then name", () => {
    expect(
      rowKey({
        scryfallId: P1,
        name: "x",
        setCode: "a",
        collectorNumber: "1",
        finish: "foil",
        quantity: 1,
      }),
    ).toBe(`id:${P1}`);
    expect(
      rowKey({ name: "x", setCode: "a", collectorNumber: "1", finish: "foil", quantity: 1 }),
    ).toBe("sn:a#1");
    expect(rowKey({ name: " Sol Ring ", setCode: "a", finish: "foil", quantity: 1 })).toBe(
      "nm:sol ring",
    );
  });

  it("sums duplicates per key + finish, keeps first-seen order, counts merges and clamps", () => {
    const rows: CollectionRow[] = [
      { scryfallId: P1, name: "A", finish: "nonfoil", quantity: 2 },
      { scryfallId: P1, name: "A", finish: "foil", quantity: 1 },
      { scryfallId: P1, name: "A", finish: "nonfoil", quantity: 3 },
      { name: "B", setCode: "s", collectorNumber: "9", finish: "nonfoil", quantity: 9_998 },
      { name: "B", setCode: "s", collectorNumber: "9", finish: "nonfoil", quantity: 5 },
    ];
    const out = foldRows(rows);
    expect(out.rows.map((r) => [rowKey(r), r.finish, r.quantity])).toEqual([
      [`id:${P1}`, "nonfoil", 5],
      [`id:${P1}`, "foil", 1],
      ["sn:s#9", "nonfoil", COLLECTION_LIMITS.maxQuantity],
    ]);
    expect(out.merged).toBe(2);
    expect(out.quantityClamped).toBe(1);
    // Input untouched.
    expect(rows[0].quantity).toBe(2);
  });
});

describe("pickFinish", () => {
  it("keeps a finish the printing comes in, falls back nonfoil → foil → etched otherwise, and says so", () => {
    expect(pickFinish("foil", ["nonfoil", "foil"])).toEqual({ finish: "foil", adjusted: false });
    expect(pickFinish("foil", ["nonfoil"])).toEqual({ finish: "nonfoil", adjusted: true });
    expect(pickFinish("nonfoil", ["foil"])).toEqual({ finish: "foil", adjusted: true });
    expect(pickFinish("nonfoil", ["etched"])).toEqual({ finish: "etched", adjusted: true });
    expect(pickFinish("etched", ["nonfoil", "foil"])).toEqual({
      finish: "nonfoil",
      adjusted: true,
    });
    // No finish data at all (a handful of printings): trust the request.
    expect(pickFinish("foil", [])).toEqual({ finish: "foil", adjusted: false });
  });
});

describe("planImport", () => {
  const w = (printingId: string, finish: "nonfoil" | "foil", quantity: number) => ({
    printingId,
    finish,
    quantity,
  });

  it("folds by (printing, finish) after resolution — two ids that resolved to one printing sum", () => {
    const plan = planImport(
      [w(P1, "nonfoil", 1), w(P1, "nonfoil", 2), w(P1, "foil", 1)],
      new Set(),
      "merge",
    );
    expect(plan.writes).toEqual([w(P1, "nonfoil", 3), w(P1, "foil", 1)]);
    expect(plan.merged).toBe(1);
    expect(plan.capped).toBeNull();
  });

  it("merge: updates to held keys never count against the cap; new keys admitted in order, the rest dropped and counted", () => {
    const held = new Set([writeKey({ printingId: P1, finish: "nonfoil" })]);
    const plan = planImport(
      [w(P2, "nonfoil", 1), w(P1, "nonfoil", 7), w(P2, "foil", 1), w(P1, "foil", 1)],
      held,
      "merge",
      2, // limit: one slot free
    );
    expect(plan.writes).toEqual([w(P2, "nonfoil", 1), w(P1, "nonfoil", 7)]);
    expect(plan.capped).toEqual({ limit: 2, dropped: 2 });
  });

  it("replace: the table starts empty, so held keys don't exempt anything", () => {
    const held = new Set([
      writeKey({ printingId: P1, finish: "nonfoil" }),
      writeKey({ printingId: P2, finish: "nonfoil" }),
    ]);
    const plan = planImport(
      [w(P1, "nonfoil", 1), w(P2, "nonfoil", 1), w(P2, "foil", 1)],
      held,
      "replace",
      2,
    );
    expect(plan.writes).toEqual([w(P1, "nonfoil", 1), w(P2, "nonfoil", 1)]);
    expect(plan.capped).toEqual({ limit: 2, dropped: 1 });
  });

  it("a user already at the cap can still update what they hold", () => {
    const held = new Set([
      writeKey({ printingId: P1, finish: "nonfoil" }),
      writeKey({ printingId: P2, finish: "nonfoil" }),
    ]);
    const plan = planImport([w(P1, "nonfoil", 4), w(P2, "foil", 1)], held, "merge", 2);
    expect(plan.writes).toEqual([w(P1, "nonfoil", 4)]);
    expect(plan.capped).toEqual({ limit: 2, dropped: 1 });
  });
});
