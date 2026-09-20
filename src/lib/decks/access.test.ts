import { describe, expect, it } from "vitest";

import { canReadDeck, clientIp, isDeckOwner, type DeckAccessRow } from "./access";

const TOKEN = "5e0bd331-93cd-4b52-9f2c-31a6f22c1e11";

function anonDeck(overrides: Partial<DeckAccessRow> = {}): DeckAccessRow {
  return { userId: null, claimToken: TOKEN, visibility: "private", ...overrides };
}

describe("isDeckOwner", () => {
  it("accepts the matching claim token on an anonymous deck", () => {
    expect(isDeckOwner(anonDeck(), TOKEN)).toBe(true);
  });

  it("rejects a missing token", () => {
    expect(isDeckOwner(anonDeck(), null)).toBe(false);
  });

  it("rejects a wrong token", () => {
    expect(isDeckOwner(anonDeck(), "5e0bd331-93cd-4b52-9f2c-31a6f22c1e12")).toBe(false);
  });

  it("rejects when the deck has no claim token (already claimed)", () => {
    expect(isDeckOwner(anonDeck({ claimToken: null }), TOKEN)).toBe(false);
  });

  it("never grants token ownership of a user-owned deck (session only, P2.1)", () => {
    expect(isDeckOwner(anonDeck({ userId: "some-user" }), TOKEN)).toBe(false);
    // Even a stale-but-correct token proves nothing after claim.
    expect(isDeckOwner(anonDeck({ userId: "some-user" }), TOKEN, "other-user")).toBe(false);
  });

  it("grants session ownership of a claimed deck to its user only", () => {
    const claimed = anonDeck({ userId: "user-1", claimToken: null });
    expect(isDeckOwner(claimed, null, "user-1")).toBe(true);
    expect(isDeckOwner(claimed, null, "user-2")).toBe(false);
    expect(isDeckOwner(claimed, null, null)).toBe(false);
  });

  it("never grants session ownership of an anonymous deck", () => {
    expect(isDeckOwner(anonDeck(), null, "user-1")).toBe(false);
  });

  /**
   * Precon rows (W8a) are userId NULL + claimToken NULL by CHECK constraint —
   * the shape below IS a precon as this module sees one. Nobody ever owns
   * one, so every write route behind requireOwnedDeck answers 403, and claim
   * can't fire (no token to match). Pinned here because the whole
   * write-refusal story rests on this function's NULL handling.
   */
  it("precon shape (user NULL, token NULL): unowned by everyone", () => {
    const precon = anonDeck({ claimToken: null, visibility: "public" });
    expect(isDeckOwner(precon, null, null)).toBe(false);
    expect(isDeckOwner(precon, TOKEN, null)).toBe(false); // forged token header
    expect(isDeckOwner(precon, null, "user-1")).toBe(false); // any signed-in user
    expect(isDeckOwner(precon, TOKEN, "user-1")).toBe(false);
  });
});

describe("canReadDeck", () => {
  it("private: owner only", () => {
    expect(canReadDeck(anonDeck(), TOKEN)).toBe(true);
    expect(canReadDeck(anonDeck(), null)).toBe(false);
    expect(canReadDeck(anonDeck(), "wrong")).toBe(false);
  });

  it("unlisted and public: readable without a token", () => {
    expect(canReadDeck(anonDeck({ visibility: "unlisted" }), null)).toBe(true);
    expect(canReadDeck(anonDeck({ visibility: "public" }), null)).toBe(true);
  });

  it("private claimed deck: session owner only", () => {
    const claimed = anonDeck({ userId: "user-1", claimToken: null });
    expect(canReadDeck(claimed, null, "user-1")).toBe(true);
    expect(canReadDeck(claimed, null, "user-2")).toBe(false);
    expect(canReadDeck(claimed, null, null)).toBe(false);
  });

  it("public precon: everyone reads (engagement stays legitimate), nobody owns", () => {
    const precon = anonDeck({ claimToken: null, visibility: "public" });
    expect(canReadDeck(precon, null, null)).toBe(true);
    expect(canReadDeck(precon, null, "user-1")).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });
});
