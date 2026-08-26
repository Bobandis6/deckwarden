import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { atraxa, cardMap, island, solRing } from "@/lib/games/mtg/test-fixtures";
import { validateMtg } from "@/lib/games/mtg/validate";
import type { ValidationIssue } from "@/lib/games/types";
import { countIssues, issueSeverityByCard, toDeckSnapshot, type SnapshotEntry } from "./validation";

function entry(cardId: string, zone: string, qty = 1): SnapshotEntry {
  return { cardId, zone, qty, tags: [] };
}

describe("toDeckSnapshot", () => {
  it("buckets entries by zone and carries game/format", () => {
    const snap = toDeckSnapshot("mtg", COMMANDER, [
      entry(atraxa.id, "commander"),
      entry(solRing.id, "main"),
      entry(island.id, "main", 30),
    ]);
    expect(snap.gameId).toBe("mtg");
    expect(snap.formatCode).toBe("commander");
    expect(snap.zones.commander).toHaveLength(1);
    expect(snap.zones.main.map((e) => e.qty)).toEqual([1, 30]);
  });

  it("includes every format zone even when empty, so zone minimums fire", () => {
    const snap = toDeckSnapshot("mtg", COMMANDER, [entry(solRing.id, "main")]);
    expect(snap.zones.commander).toEqual([]);
    const codes = validateMtg(snap, cardMap([solRing])).map((i) => i.code);
    expect(codes).toContain("ZONE_SIZE"); // the empty commander zone
  });

  it("passes zones the format doesn't define through, so ZONE_UNKNOWN fires", () => {
    const snap = toDeckSnapshot("mtg", COMMANDER, [entry(solRing.id, "sideboard")]);
    expect(snap.zones.sideboard).toHaveLength(1);
    const codes = validateMtg(snap, cardMap([solRing])).map((i) => i.code);
    expect(codes).toContain("ZONE_UNKNOWN");
  });

  it("keeps printingId only when present", () => {
    const snap = toDeckSnapshot("mtg", COMMANDER, [
      { cardId: solRing.id, zone: "main", qty: 1, tags: [], printingId: "p-1" },
      entry(island.id, "main"),
    ]);
    expect(snap.zones.main[0]).toHaveProperty("printingId", "p-1");
    expect(snap.zones.main[1]).not.toHaveProperty("printingId");
  });
});

describe("issueSeverityByCard", () => {
  const issues: ValidationIssue[] = [
    { code: "NOT_RELEASED", severity: "warning", message: "", cardIds: ["a", "b"] },
    { code: "BANNED", severity: "error", message: "", cardIds: ["b", "c"] },
    { code: "DECK_SIZE", severity: "error", message: "" }, // no cardIds — deck-level
  ];

  it("maps each flagged card to its worst severity (error wins)", () => {
    const map = issueSeverityByCard(issues);
    expect(map.get("a")).toBe("warning");
    expect(map.get("b")).toBe("error");
    expect(map.get("c")).toBe("error");
    expect(map.size).toBe(3);
  });

  it("error sticks even when a warning is seen after", () => {
    const map = issueSeverityByCard([
      { code: "BANNED", severity: "error", message: "", cardIds: ["x"] },
      { code: "NOT_RELEASED", severity: "warning", message: "", cardIds: ["x"] },
    ]);
    expect(map.get("x")).toBe("error");
  });
});

describe("countIssues", () => {
  it("tallies errors and warnings", () => {
    expect(
      countIssues([
        { code: "A", severity: "error", message: "" },
        { code: "B", severity: "warning", message: "" },
        { code: "C", severity: "error", message: "" },
      ]),
    ).toEqual({ errors: 2, warnings: 1 });
    expect(countIssues([])).toEqual({ errors: 0, warnings: 0 });
  });
});
