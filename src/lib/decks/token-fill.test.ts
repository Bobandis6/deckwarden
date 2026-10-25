/**
 * The token fill (TOKEN-FILL): the derivation the editor and the share page
 * share — stored rows win, hidden keys leave the shown set and join the
 * chips only while linked, the leader's cards make tokens, a token in the
 * token zone makes nothing, makers read in name order — and the hidden
 * keys' normalization and PATCH body.
 */
import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";

import {
  HIDDEN_TOKENS_MAX,
  hiddenTokensPatchBody,
  hiddenTokensSchema,
  normalizeHiddenTokens,
  tokenFill,
} from "./token-fill";

const mtg = getAdapter("mtg");
const optcg = getAdapter("optcg");

const KEY = {
  treasure: "aaaaaaaa-0000-4000-8000-000000000001",
  soldier: "aaaaaaaa-0000-4000-8000-000000000002",
  emblem: "aaaaaaaa-0000-4000-8000-000000000003",
  angel: "aaaaaaaa-0000-4000-8000-000000000004",
};
const brago = card({
  name: "Brago, King Eternal",
  isLeaderCandidate: true,
  attrs: { type_line: "Legendary Creature", oracle_text: "", tokens: [KEY.soldier] },
});
const tithe = card({
  name: "Smothering Tithe",
  attrs: { type_line: "Enchantment", oracle_text: "", tokens: [KEY.treasure] },
});
const dockside = card({
  name: "Dockside Extortionist",
  attrs: { type_line: "Creature — Goblin Pirate", oracle_text: "", tokens: [KEY.treasure] },
});
const elspeth = card({
  name: "Elspeth, Sun's Champion",
  attrs: {
    type_line: "Legendary Planeswalker",
    oracle_text: "",
    tokens: [KEY.soldier, KEY.emblem],
  },
});
const solRing = card({ name: "Sol Ring", attrs: { type_line: "Artifact", oracle_text: "" } });
const treasure = card({
  name: "Treasure",
  externalKey: KEY.treasure,
  attrs: { type_line: "Token Artifact — Treasure", oracle_text: "", is_token: true },
});
/** A token that itself links a token (Scryfall links some helpers both ways): never a maker. */
const angel = card({
  name: "Angel",
  externalKey: KEY.angel,
  attrs: {
    type_line: "Token Creature — Angel",
    oracle_text: "",
    is_token: true,
    tokens: [KEY.treasure],
  },
});
const cards = new Map(
  [brago, tithe, dockside, elspeth, solRing, treasure, angel].map((c) => [c.id, c]),
);

const list = [
  { cardId: brago.id, zone: "commander" },
  { cardId: tithe.id, zone: "main" },
  { cardId: dockside.id, zone: "main" },
  { cardId: elspeth.id, zone: "main" },
  { cardId: solRing.id, zone: "main" },
];
const fill = (over: Partial<Parameters<typeof tokenFill>[0]> = {}) =>
  tokenFill({ adapter: mtg, format: COMMANDER, entries: list, cards, ...over });

describe("tokenFill", () => {
  it("the union of the playable cards' links, each with its makers in name order, keys sorted", () => {
    const out = fill();
    expect([...out.shown]).toEqual([
      [KEY.treasure, ["Dockside Extortionist", "Smothering Tithe"]],
      [KEY.soldier, ["Brago, King Eternal", "Elspeth, Sun's Champion"]],
      [KEY.emblem, ["Elspeth, Sun's Champion"]],
    ]);
    expect(out.hidden.size).toBe(0);
  });

  it("a stored token row wins: its key is derived no more, hidden or not", () => {
    const entries = [...list, { cardId: treasure.id, zone: "tokens" }];
    expect([...fill({ entries }).shown.keys()]).toEqual([KEY.soldier, KEY.emblem]);
    const out = fill({ entries, hidden: [KEY.treasure] });
    expect([...out.shown.keys()]).toEqual([KEY.soldier, KEY.emblem]);
    expect(out.hidden.size).toBe(0);
  });

  it("a hidden key leaves the shown set and joins the hidden set while its makers stay", () => {
    const out = fill({ hidden: [KEY.treasure, KEY.angel] });
    expect([...out.shown.keys()]).toEqual([KEY.soldier, KEY.emblem]);
    // KEY.angel: hidden, but no card links it — nothing to show, nothing to restore.
    expect([...out.hidden]).toEqual([
      [KEY.treasure, ["Dockside Extortionist", "Smothering Tithe"]],
    ]);
  });

  it("a hidden key whose makers left the deck is neither shown nor a chip", () => {
    const entries = list.filter((e) => e.cardId !== tithe.id && e.cardId !== dockside.id);
    const out = fill({ entries, hidden: [KEY.treasure] });
    expect([...out.shown.keys()]).toEqual([KEY.soldier, KEY.emblem]);
    expect(out.hidden.size).toBe(0);
  });

  it("a token in the token zone makes nothing, even when Scryfall links it onward", () => {
    const out = fill({ entries: [{ cardId: angel.id, zone: "tokens" }], cards });
    expect(out.shown.size).toBe(0);
  });

  it("a card the lookup doesn't know, or one without links, contributes nothing", () => {
    const out = fill({
      entries: [
        { cardId: "missing", zone: "main" },
        { cardId: solRing.id, zone: "main" },
      ],
    });
    expect(out.shown.size).toBe(0);
    expect(out.hidden.size).toBe(0);
  });

  it("takes a lookup function as well as a map", () => {
    const out = fill({ cards: (id) => cards.get(id) });
    expect(out.shown.size).toBe(3);
  });

  it("a game without a token zone or links fills nothing (One Piece)", () => {
    const op = optcg.formats[0];
    const out = tokenFill({ adapter: optcg, format: op, entries: list, cards });
    expect(out.shown.size).toBe(0);
    expect(out.hidden.size).toBe(0);
  });
});

describe("hidden keys", () => {
  it("normalize: sorted, de-duplicated, null when empty", () => {
    expect(normalizeHiddenTokens(["b", "a", "a"])).toEqual(["a", "b"]);
    expect(normalizeHiddenTokens([])).toBeNull();
    expect(normalizeHiddenTokens(null)).toBeNull();
    expect(normalizeHiddenTokens(undefined)).toBeNull();
  });

  it("the PATCH body is canonical: order and repeats never make a different string", () => {
    expect(hiddenTokensPatchBody(["b", "a"])).toBe(hiddenTokensPatchBody(["a", "b", "b"]));
    expect(hiddenTokensPatchBody([])).toBe('{"hiddenTokens":null}');
    expect(hiddenTokensPatchBody(null)).toBe('{"hiddenTokens":null}');
  });

  it("the schema bounds the array and each key", () => {
    expect(hiddenTokensSchema.safeParse([KEY.treasure]).success).toBe(true);
    expect(hiddenTokensSchema.safeParse([]).success).toBe(true);
    expect(hiddenTokensSchema.safeParse(Array(HIDDEN_TOKENS_MAX + 1).fill("k")).success).toBe(
      false,
    );
    expect(hiddenTokensSchema.safeParse(["x".repeat(65)]).success).toBe(false);
    expect(hiddenTokensSchema.safeParse([""]).success).toBe(false);
    expect(hiddenTokensSchema.safeParse("k").success).toBe(false);
  });
});
