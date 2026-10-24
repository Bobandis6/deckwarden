/**
 * The playable list (DECK-TOKENS): which zones the deck is PLAYED from, and
 * the two readers that make everything downstream token-free —
 * toDeckSnapshot (validate, analyze, the bracket read, the export) and
 * splitLeaderEntries (the groups, the sample hand). One Piece's Leader is
 * the trap the zone census found: it counts toward no size, yet it is played.
 */
import { describe, expect, it } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";
import { cardMap, card, legalDeck } from "@/lib/games/mtg/test-fixtures";
import { mtgAdapter } from "@/lib/games/mtg/adapter";
import { optcgAdapter } from "@/lib/games/optcg/adapter";

import { isPlayableZone, playableEntries, playableZoneIds, tokenZoneOf } from "./playable";
import { toDeckSnapshot } from "./validation";
import { splitLeaderEntries } from "./view-model";

const OP_STANDARD = optcgAdapter.formats[0];

describe("the playable list (DECK-TOKENS)", () => {
  it("Magic plays from the command zone and main, never from Tokens", () => {
    expect(playableZoneIds(COMMANDER)).toEqual(["commander", "main"]);
    expect(isPlayableZone(COMMANDER, "tokens")).toBe(false);
    expect(tokenZoneOf(COMMANDER)?.id).toBe("tokens");
  });

  it("One Piece's Leader is played though it counts toward no size; the game has no token zone", () => {
    const leader = OP_STANDARD.zones.find((z) => z.isLeaderZone)!;
    expect(leader.countsTowardSize).toBe(false);
    expect(isPlayableZone(OP_STANDARD, leader.id)).toBe(true);
    expect(playableZoneIds(OP_STANDARD)).toEqual(OP_STANDARD.zones.map((z) => z.id));
    expect(tokenZoneOf(OP_STANDARD)).toBeUndefined();
  });

  it("a zone the format doesn't define stays playable, so ZONE_UNKNOWN still sees it", () => {
    expect(isPlayableZone(COMMANDER, "sideboard")).toBe(true);
    const snapshot = toDeckSnapshot("mtg", COMMANDER, [
      { cardId: "x", zone: "sideboard", qty: 1, tags: [] },
    ]);
    expect(Object.keys(snapshot.zones)).toEqual(["commander", "main", "sideboard"]);
  });

  it("playableEntries keeps order and drops only the tokens", () => {
    const entries = [
      { cardId: "t", zone: "tokens" },
      { cardId: "c", zone: "commander" },
      { cardId: "m", zone: "main" },
    ];
    expect(playableEntries(entries, COMMANDER).map((e) => e.cardId)).toEqual(["c", "m"]);
  });

  it("a legal 100 with not-legal tokens beside it still validates clean, and analyze never counts them", () => {
    const { deck, cards } = legalDeck();
    const treasure = card({
      name: "Treasure",
      primaryType: "Artifact",
      costValue: 0,
      attrs: { type_line: "Token Artifact — Treasure", oracle_text: "", is_token: true },
      legality: [{ status: "not_legal" }],
    });
    const all = new Map([...cards, ...cardMap([treasure])]);
    const entries = [
      ...Object.entries(deck.zones).flatMap(([zone, list]) =>
        list.map((e) => ({ cardId: e.cardId, zone, qty: e.qty, tags: e.tags })),
      ),
      { cardId: treasure.id, zone: "tokens", qty: 7, tags: [] },
    ];
    const snapshot = toDeckSnapshot("mtg", COMMANDER, entries);
    expect(Object.keys(snapshot.zones)).toEqual(["commander", "main"]);
    expect(mtgAdapter.validate(snapshot, all)).toEqual([]);
    // Analytics with seven Treasures beside the 100 are exactly the analytics without them.
    const without = toDeckSnapshot(
      "mtg",
      COMMANDER,
      entries.filter((e) => e.zone !== "tokens"),
    );
    expect(mtgAdapter.analyze(snapshot, all)).toEqual(mtgAdapter.analyze(without, all));
    // The export is the playable list too: no Treasure line.
    expect(mtgAdapter.serializeDecklist(snapshot, all)).not.toContain("Treasure");
  });

  it("One Piece's leader stays in the snapshot (the trap): an empty-leader issue never appears for a full deck", () => {
    const snapshot = toDeckSnapshot("optcg", OP_STANDARD, [
      { cardId: "leader", zone: "leader", qty: 1, tags: [] },
    ]);
    expect(snapshot.zones.leader).toEqual([{ cardId: "leader", qty: 1, tags: [] }]);
  });

  it("splitLeaderEntries sets the tokens aside: the groups and the sample hand read `rest`", () => {
    const { leader, rest, aside } = splitLeaderEntries(
      [
        { cardId: "c", zone: "commander" },
        { cardId: "m", zone: "main" },
        { cardId: "t", zone: "tokens" },
      ],
      COMMANDER,
    );
    expect([leader, rest, aside].map((l) => l.map((e) => e.cardId))).toEqual([["c"], ["m"], ["t"]]);
    const op = splitLeaderEntries([{ cardId: "l", zone: "leader" }], OP_STANDARD);
    expect(op.leader.map((e) => e.cardId)).toEqual(["l"]);
    expect(op.aside).toEqual([]);
  });
});
