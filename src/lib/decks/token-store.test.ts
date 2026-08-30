import { beforeEach, describe, expect, it } from "vitest";

import { getDeckToken, listDeckTokens, removeDeckToken, setDeckToken } from "./token-store";

describe("token-store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a token", () => {
    expect(getDeckToken("deck-a")).toBeNull();
    expect(setDeckToken("deck-a", "tok-a")).toBe(true);
    expect(getDeckToken("deck-a")).toBe("tok-a");
  });

  it("lists only deckwarden token keys", () => {
    setDeckToken("deck-a", "tok-a");
    setDeckToken("deck-b", "tok-b");
    window.localStorage.setItem("deckwarden:deck-view", '{"view":"grid"}');
    window.localStorage.setItem("unrelated", "x");

    const listed = listDeckTokens();
    expect(listed).toHaveLength(2);
    expect(new Map(listed.map((t) => [t.deckId, t.token]))).toEqual(
      new Map([
        ["deck-a", "tok-a"],
        ["deck-b", "tok-b"],
      ]),
    );
  });

  it("lists empty when nothing is stored", () => {
    expect(listDeckTokens()).toEqual([]);
  });

  it("removes a token (post-claim, P2.1) and leaves the rest", () => {
    setDeckToken("deck-a", "tok-a");
    setDeckToken("deck-b", "tok-b");
    removeDeckToken("deck-a");
    removeDeckToken("deck-never-stored");
    expect(getDeckToken("deck-a")).toBeNull();
    expect(listDeckTokens()).toEqual([{ deckId: "deck-b", token: "tok-b" }]);
  });
});
