import { describe, expect, it } from "vitest";

import { identityToMask, mapVariant, type SpellbookVariant } from "./spellbook-map";

const ORACLE_TO_ID: Record<string, string> = {
  "oracle-kiki": "id-kiki",
  "oracle-conscripts": "id-conscripts",
  "oracle-solring": "id-solring",
};
const resolve = (oid: string) => ORACLE_TO_ID[oid];

/** Modeled on the live bulk shape (probed 2026-08-30), trimmed to read fields. */
function variant(overrides: Partial<SpellbookVariant> = {}): SpellbookVariant {
  return {
    id: "1-2",
    status: "OK",
    identity: "R",
    popularity: 1234,
    legalities: { commander: true, legacy: true },
    uses: [
      { card: { oracleId: "oracle-kiki", name: "Kiki-Jiki, Mirror Breaker" }, quantity: 1 },
      { card: { oracleId: "oracle-conscripts", name: "Zealous Conscripts" }, quantity: 1 },
    ],
    requires: [],
    produces: [
      { feature: { name: "Infinite hasty tokens", status: "S" }, quantity: 1 },
      { feature: { name: "Infinite ETB", status: "H" }, quantity: 1 },
      { feature: { name: "Kiki untapped", status: "HU" }, quantity: 1 },
      { feature: { name: "Some public utility", status: "PU" }, quantity: 1 },
    ],
    ...overrides,
  };
}

describe("identityToMask", () => {
  it("maps WUBRG letters to the house bitmask", () => {
    expect(identityToMask("W")).toBe(1);
    expect(identityToMask("WUBRG")).toBe(31);
    expect(identityToMask("gr")).toBe(24);
  });

  it("maps colorless ('C') and absent identity to 0, matching card ci_mask rows", () => {
    expect(identityToMask("C")).toBe(0);
    expect(identityToMask(undefined)).toBe(0);
    expect(identityToMask("")).toBe(0);
  });
});

describe("mapVariant", () => {
  it("maps a clean card-only variant", () => {
    const res = mapVariant(variant(), resolve);
    expect(res).toEqual({
      ok: true,
      combo: {
        external_key: "1-2",
        piece_count: 2,
        ci_mask: 8,
        results: ["Infinite hasty tokens", "Infinite ETB"],
        templates: [],
        popularity: 1234,
      },
      pieceIds: ["id-kiki", "id-conscripts"],
    });
  });

  it("drops utility-tier features (HU/PU) from results but keeps S/H/C", () => {
    const res = mapVariant(variant(), resolve);
    if (!res.ok) throw new Error("expected ok");
    expect(res.combo.results).not.toContain("Kiki untapped");
    expect(res.combo.results).not.toContain("Some public utility");
  });

  it("keeps template requirements by name without counting them as pieces", () => {
    const res = mapVariant(
      variant({
        uses: [{ card: { oracleId: "oracle-solring" }, quantity: 1 }],
        requires: [
          { template: { name: "Permanent Castable for {C}" }, quantity: 1 },
          { template: { name: "Permanent Castable for {C}" }, quantity: 1 },
        ],
      }),
      resolve,
    );
    expect(res).toMatchObject({
      ok: true,
      combo: { piece_count: 1, templates: ["Permanent Castable for {C}"] },
      pieceIds: ["id-solring"],
    });
  });

  it("skips non-OK statuses", () => {
    for (const status of ["D", "E", "N", "NR"]) {
      expect(mapVariant(variant({ status }), resolve)).toEqual({ ok: false, skip: "status" });
    }
  });

  it("skips variants not legal in Commander (or with no legality map)", () => {
    expect(mapVariant(variant({ legalities: { commander: false } }), resolve)).toEqual({
      ok: false,
      skip: "not_commander_legal",
    });
    expect(mapVariant(variant({ legalities: undefined }), resolve)).toEqual({
      ok: false,
      skip: "not_commander_legal",
    });
  });

  it("skips variants with an unresolvable or missing oracle id", () => {
    const unknown = variant({ uses: [{ card: { oracleId: "oracle-nope" } }] });
    expect(mapVariant(unknown, resolve)).toEqual({ ok: false, skip: "unknown_card" });
    const missing = variant({ uses: [{ card: {} }] });
    expect(mapVariant(missing, resolve)).toEqual({ ok: false, skip: "unknown_card" });
  });

  it("skips variants with no card pieces at all", () => {
    expect(mapVariant(variant({ uses: [] }), resolve)).toEqual({ ok: false, skip: "no_cards" });
  });

  it("dedupes repeated pieces and results, keeping first-seen order", () => {
    const res = mapVariant(
      variant({
        uses: [
          { card: { oracleId: "oracle-kiki" } },
          { card: { oracleId: "oracle-kiki" }, quantity: 2 },
        ],
        produces: [
          { feature: { name: "Infinite tokens", status: "S" } },
          { feature: { name: "Infinite tokens", status: "S" } },
        ],
      }),
      resolve,
    );
    expect(res).toMatchObject({
      ok: true,
      combo: { piece_count: 1, results: ["Infinite tokens"] },
      pieceIds: ["id-kiki"],
    });
  });

  it("skips never-played variants (popularity 0) but keeps unsynced NULLs", () => {
    expect(mapVariant(variant({ popularity: 0 }), resolve)).toEqual({
      ok: false,
      skip: "never_played",
    });
    const unsynced = mapVariant(variant({ popularity: undefined }), resolve);
    expect(unsynced).toMatchObject({ ok: true, combo: { popularity: null } });
  });

  it("normalizes popularity (floats rounded, negatives clamped to 0 but kept)", () => {
    const neg = mapVariant(variant({ popularity: -5 }), resolve);
    if (!neg.ok) throw new Error("expected ok");
    expect(neg.combo.popularity).toBe(0);
    const float = mapVariant(variant({ popularity: 12.6 }), resolve);
    if (!float.ok) throw new Error("expected ok");
    expect(float.combo.popularity).toBe(13);
  });
});
