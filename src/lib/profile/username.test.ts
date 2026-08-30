import { describe, expect, it } from "vitest";

import { checkUsername, isUsernameShaped, RESERVED_USERNAMES } from "./username";

describe("checkUsername", () => {
  it.each(["sol-ring", "abc", "a1b", "x".repeat(24), "42decks", "the-9th-titan"])(
    "accepts %s",
    (raw) => {
      expect(checkUsername(raw)).toEqual({ ok: true, username: raw });
    },
  );

  it("folds case and whitespace to the canonical slug", () => {
    expect(checkUsername("  UrzaMishra  ")).toEqual({ ok: true, username: "urzamishra" });
  });

  it.each([
    ["ab", "too short"],
    ["x".repeat(25), "too long"],
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["under_score", "underscore"],
    ["sp ace", "interior space"],
    ["émil", "non-ascii"],
    ["", "empty"],
  ])("rejects %s (%s)", (raw) => {
    expect(checkUsername(raw).ok).toBe(false);
  });

  it("rejects reserved names, case-insensitively", () => {
    expect(checkUsername("Admin")).toEqual({ ok: false, error: "That username is reserved." });
    for (const name of RESERVED_USERNAMES) {
      // Every reserved entry must itself be a valid slug — otherwise the
      // regex already rejects it and the reservation is dead weight.
      expect(checkUsername(name)).toEqual({ ok: false, error: "That username is reserved." });
    }
  });
});

describe("isUsernameShaped", () => {
  it("accepts canonical and mixed-case forms", () => {
    expect(isUsernameShaped("sol-ring")).toBe(true);
    expect(isUsernameShaped("Sol-Ring")).toBe(true);
  });

  it("rejects junk URL segments", () => {
    expect(isUsernameShaped("no spaces")).toBe(false);
    expect(isUsernameShaped("a")).toBe(false);
    expect(isUsernameShaped("dot.dot")).toBe(false);
  });
});
