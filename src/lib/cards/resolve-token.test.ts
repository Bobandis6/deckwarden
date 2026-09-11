/**
 * The resolve route's pass-0 classifier (R5b): a Magic uuid resolves by
 * external key (lowercased), a name never does; the One Piece id shapes
 * (bare and trailing-parenthesized) are unchanged from P4.6; only bare ids
 * are barred from the fuzzy pass.
 */
import { describe, expect, it } from "vitest";

import { classifyResolveToken, isBareIdToken } from "./resolve-token";

const QUEZA = "c983338d-ae6b-4a15-9931-daa20fca8269";

describe("classifyResolveToken", () => {
  it("Magic: a uuid-shaped token is the oracle key, lowercased and trimmed; a name is null", () => {
    expect(classifyResolveToken("mtg", QUEZA)).toBe(QUEZA);
    expect(classifyResolveToken("mtg", `  ${QUEZA.toUpperCase()} `)).toBe(QUEZA);
    expect(classifyResolveToken("mtg", "Queza, Augur of Agonies")).toBeNull();
    expect(classifyResolveToken("mtg", "Sol Ring")).toBeNull();
    expect(classifyResolveToken("mtg", "OP01-025")).toBeNull();
    expect(classifyResolveToken("mtg", "c983338d-ae6b-4a15-9931")).toBeNull();
    expect(classifyResolveToken("mtg", `Queza (${QUEZA})`)).toBeNull();
  });

  it("One Piece: a bare id or a trailing (CODE) is the key, uppercased; a name is null", () => {
    expect(classifyResolveToken("optcg", "op01-025")).toBe("OP01-025");
    expect(classifyResolveToken("optcg", "Charlotte Pudding (OP12-071)")).toBe("OP12-071");
    expect(classifyResolveToken("optcg", "ST01-001 ")).toBe("ST01-001");
    expect(classifyResolveToken("optcg", "Monkey.D.Luffy")).toBeNull();
    expect(classifyResolveToken("optcg", QUEZA)).toBeNull();
  });
});

describe("isBareIdToken", () => {
  it("only whole-token ids: a uuid (Magic), a card code (One Piece) — not a name carrying one", () => {
    expect(isBareIdToken("mtg", QUEZA)).toBe(true);
    expect(isBareIdToken("mtg", "Sol Ring")).toBe(false);
    expect(isBareIdToken("optcg", "OP01-025")).toBe(true);
    expect(isBareIdToken("optcg", "Charlotte Pudding (OP12-071)")).toBe(false);
    expect(isBareIdToken("optcg", QUEZA)).toBe(false);
  });
});
