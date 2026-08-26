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

  it("never grants token ownership of a user-owned deck (session auth is P2.1)", () => {
    expect(isDeckOwner(anonDeck({ userId: "some-user" }), TOKEN)).toBe(false);
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
