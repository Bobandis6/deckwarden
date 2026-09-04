/**
 * P4.2 — the OP validator against the rules verified from Bandai's own
 * documents: comprehensive rules 5-1-2-* (deck construction) and the live
 * Banned/Restricted page (banned cards + symmetric banned pairs).
 */
import { describe, expect, it } from "vitest";

import type { CardData, DeckEntry, DeckSnapshot, LegalityEntry } from "../types";
import { optcgAdapter, type OptcgAttrs } from "./adapter";

type OptcgCard = CardData<OptcgAttrs>;

let n = 0;

function card(over: Partial<OptcgCard> & { name: string; attrs?: Partial<OptcgAttrs> }): OptcgCard {
  const seq = ++n;
  const attrs: OptcgAttrs = {
    category: "character",
    type_line: "Character — Test",
    oracle_text: "",
    ...over.attrs,
  };
  return {
    id: over.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    externalKey: over.externalKey ?? `OP99-${String(seq).padStart(3, "0")}`,
    primaryType: "Character",
    costValue: 2,
    colorsMask: 8, // Red
    ciMask: 8,
    isLeaderCandidate: false,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    legality: [],
    ...over,
    attrs,
  };
}

// Red mono leader (Yellow=1, Blue=2, Black=4, Red=8, Green=16, Purple=32).
const leader = card({
  name: "Monkey.D.Luffy",
  externalKey: "OP01-001",
  primaryType: "Leader",
  costValue: null,
  colorsMask: 8,
  ciMask: 8,
  isLeaderCandidate: true,
  attrs: { category: "leader", life: 5 },
});

/** A legal 50-card main deck: 13 distinct red cards ×4 minus 2. */
function legalMain(): { entries: DeckEntry[]; cards: OptcgCard[] } {
  const cards: OptcgCard[] = [];
  const entries: DeckEntry[] = [];
  for (let i = 0; i < 13; i++) {
    const c = card({ name: `Red filler ${i}` });
    cards.push(c);
    entries.push({ cardId: c.id, qty: i === 0 ? 2 : 4, tags: [] });
  }
  return { entries, cards };
}

function snapshot(zones: Record<string, DeckEntry[]>): DeckSnapshot {
  return { gameId: "optcg", formatCode: "standard", zones };
}

function cardMap(cards: OptcgCard[]): ReadonlyMap<string, OptcgCard> {
  return new Map(cards.map((c) => [c.id, c]));
}

function validate(zones: Record<string, DeckEntry[]>, cards: OptcgCard[]) {
  return optcgAdapter.validate(snapshot(zones), cardMap(cards));
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code).sort();
}

const entry = (c: OptcgCard, qty = 1): DeckEntry => ({ cardId: c.id, qty, tags: [] });

describe("validateOptcg", () => {
  it("accepts a legal deck: 1 leader + exactly 50 in-color cards", () => {
    const { entries, cards } = legalMain();
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    expect(issues).toEqual([]);
  });

  it("flags a wrong-size main deck (50 exactly, leader excluded)", () => {
    const { entries, cards } = legalMain();
    entries[0] = { ...entries[0], qty: 1 }; // 49
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    expect(codes(issues)).toEqual(["DECK_SIZE", "ZONE_SIZE"]);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("requires exactly one leader", () => {
    const { entries, cards } = legalMain();
    const noLeader = validate({ leader: [], main: entries }, cards);
    expect(codes(noLeader)).toContain("ZONE_SIZE");
    const second = card({
      name: "Roronoa Zoro",
      externalKey: "OP01-025",
      colorsMask: 8,
      ciMask: 8,
      isLeaderCandidate: true,
      attrs: { category: "leader", life: 5 },
    });
    const two = validate({ leader: [entry(leader), entry(second)], main: entries }, [
      leader,
      second,
      ...cards,
    ]);
    expect(codes(two)).toContain("ZONE_SIZE");
  });

  it("rejects a non-Leader card in the leader zone", () => {
    const { entries, cards } = legalMain();
    const issues = validate({ leader: [entry(cards[0])], main: entries }, [leader, ...cards]);
    expect(codes(issues)).toContain("LEADER_INELIGIBLE");
  });

  it("rejects Leader-category cards in the main deck (rule 5-1-2-1)", () => {
    const { entries, cards } = legalMain();
    const strayLeader = card({
      name: "Stray Leader",
      externalKey: "OP02-001",
      attrs: { category: "leader", life: 4 },
    });
    entries[0] = { ...entries[0], qty: 1 };
    entries.push(entry(strayLeader));
    const issues = validate({ leader: [entry(leader)], main: entries }, [
      leader,
      strayLeader,
      ...cards,
    ]);
    expect(codes(issues)).toContain("LEADER_IN_MAIN");
  });

  it("caps copies at 4 per card number across zones (rule 5-1-2-3)", () => {
    const { entries, cards } = legalMain();
    entries[1] = { ...entries[1], qty: 5 };
    entries[0] = { ...entries[0], qty: 1 };
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    expect(codes(issues)).toContain("COPY_LIMIT");
    expect(issues.find((i) => i.code === "COPY_LIMIT")?.message).toContain(cards[1].externalKey);
  });

  it("caps a restricted card at 1 copy", () => {
    const { entries, cards } = legalMain();
    const restricted: LegalityEntry[] = [{ status: "restricted" }];
    cards[1] = { ...cards[1], legality: restricted };
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    const hit = issues.find((i) => i.code === "COPY_LIMIT");
    expect(hit?.message).toContain("limit 1");
  });

  it("flags off-color cards — ALL colors must be on the leader (rule 5-1-2-2)", () => {
    const { entries, cards } = legalMain();
    // Dual Red/Green card under a mono-Red leader: Green is not on the leader.
    cards[2] = { ...cards[2], colorsMask: 8 | 16, ciMask: 8 | 16 };
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    const hit = issues.find((i) => i.code === "COLOR_IDENTITY");
    expect(hit?.cardIds).toEqual([cards[2].id]);
    // The same card under a Red/Green leader is fine.
    const dualLeader = { ...leader, colorsMask: 8 | 16, ciMask: 8 | 16 };
    const ok = validate({ leader: [entry(dualLeader)], main: entries }, [dualLeader, ...cards]);
    expect(codes(ok)).not.toContain("COLOR_IDENTITY");
  });

  it("flags banned cards (unconditional rows)", () => {
    const { entries, cards } = legalMain();
    cards[3] = { ...cards[3], legality: [{ status: "banned" }] };
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    const hit = issues.find((i) => i.code === "BANNED");
    expect(hit?.severity).toBe("error");
    expect(hit?.cardIds).toEqual([cards[3].id]);
  });

  it("flags banned pairs once, from mirrored banned_with conditions", () => {
    const { entries, cards } = legalMain();
    const pairA = { ...cards[4], externalKey: "OP07-115" };
    const pairB = { ...cards[5], externalKey: "EB04-058" };
    pairA.legality = [
      { status: "banned", condition: { type: "banned_with", cardIds: ["EB04-058"] } },
    ];
    pairB.legality = [
      { status: "banned", condition: { type: "banned_with", cardIds: ["OP07-115"] } },
    ];
    cards[4] = pairA;
    cards[5] = pairB;
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    const pairs = issues.filter((i) => i.code === "BANNED_PAIR");
    expect(pairs).toHaveLength(1); // mirrored rows, deduped
    expect(pairs[0].cardIds?.sort()).toEqual([pairA.id, pairB.id].sort());
    // No pair issue when only one side is in the deck.
    const without = validate(
      { leader: [entry(leader)], main: entries.filter((e) => e.cardId !== pairB.id) },
      [leader, ...cards],
    );
    expect(codes(without)).not.toContain("BANNED_PAIR");
  });

  it("fires a pair ban against the LEADER zone too (Luffy OP11-040 pairs)", () => {
    const { entries, cards } = legalMain();
    const luffyLeader = {
      ...leader,
      externalKey: "OP11-040",
      legality: [
        { status: "banned", condition: { type: "banned_with", cardIds: ["OP11-067"] } },
      ] as LegalityEntry[],
    };
    const katakuri = {
      ...cards[6],
      externalKey: "OP11-067",
      legality: [
        { status: "banned", condition: { type: "banned_with", cardIds: ["OP11-040"] } },
      ] as LegalityEntry[],
    };
    cards[6] = katakuri;
    const issues = validate({ leader: [entry(luffyLeader)], main: entries }, [
      luffyLeader,
      ...cards,
    ]);
    const pairs = issues.filter((i) => i.code === "BANNED_PAIR");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].cardIds?.sort()).toEqual([luffyLeader.id, katakuri.id].sort());
  });

  it("does not fire a banned-pair condition against unrelated statuses or self", () => {
    const { entries, cards } = legalMain();
    // Self-referencing condition (nonsense data) must not self-match.
    cards[7] = {
      ...cards[7],
      externalKey: "OP05-001",
      legality: [{ status: "banned", condition: { type: "banned_with", cardIds: ["OP05-001"] } }],
    };
    const issues = validate({ leader: [entry(leader)], main: entries }, [leader, ...cards]);
    expect(codes(issues)).not.toContain("BANNED_PAIR");
    // A conditional row alone is not an unconditional ban.
    expect(codes(issues)).not.toContain("BANNED");
  });

  it("reports unknown cards and unknown zones like the MTG adapter", () => {
    const issues = validate(
      { leader: [entry(leader)], main: [{ cardId: "missing-id", qty: 50, tags: [] }], side: [] },
      [leader],
    );
    expect(codes(issues)).toContain("UNKNOWN_CARD");
    expect(codes(issues)).toContain("ZONE_UNKNOWN");
  });

  it("rejects an unknown format code", () => {
    const issues = optcgAdapter.validate(
      { gameId: "optcg", formatCode: "nope", zones: {} },
      new Map(),
    );
    expect(codes(issues)).toEqual(["FORMAT_UNKNOWN"]);
  });
});
