/**
 * BRACKET-UP's power first — Magic's `toward` pinned against the real
 * `assessBracket`: on fixture lists below a target, swapping `more` Game
 * Changers in (each for a filler, as an upgrade does) makes the cards show
 * the target's level, and one fewer doesn't. One shows Bracket 3, four show
 * Bracket 4, a target of 5 asks for the same four (no list proves cEDH);
 * Bracket 2 allows none, so no count shows it; a commander that is a Game
 * Changer is one the list already holds.
 */
import { describe, expect, it } from "vitest";

import type { BracketFreshness, DeckSnapshot } from "../types";
import { mtgBrackets } from "./brackets";
import {
  basicLands,
  card,
  cardMap,
  commanderDeck,
  entry,
  fillers,
  type MtgCard,
} from "./test-fixtures";

const AT = "2026-10-04T15:29:34.768Z";
const FRESH: BracketFreshness = {
  readAt: "2026-10-05T07:00:00.000Z",
  feeds: {
    gameChangers: { state: "ok", asOf: AT },
    landDenial: { state: "ok", asOf: AT },
    extraTurns: { state: "ok", asOf: AT },
    combos: { state: "ok", asOf: AT },
  },
};

const named = (name: string, attrs: Partial<MtgCard["attrs"]> = {}, over: Partial<MtgCard> = {}) =>
  card({ ...over, name, attrs: { type_line: "Creature — Test", oracle_text: "", ...attrs } });

const commander = named("Test Commander", {}, { isLeaderCandidate: true });
const urza = named(
  "Urza, Lord High Artificer",
  { game_changer: true },
  { isLeaderCandidate: true },
);
const changers = [
  "Rhystic Study",
  "Cyclonic Rift",
  "Demonic Tutor",
  "Smothering Tithe",
  "Mana Vault",
].map((n) => named(n, { game_changer: true }));
const armageddon = named("Armageddon", { mld: "clear" });

interface List {
  deck: DeckSnapshot;
  cards: Map<string, MtgCard>;
}

/** The commander, the specials, 36 lands, fillers to 100. */
function list(lead: MtgCard, specials: MtgCard[]): List {
  const main = [...specials, ...basicLands(36), ...fillers(100 - 1 - specials.length - 36)];
  return {
    deck: commanderDeck(
      [lead],
      main.map((c) => entry(c)),
    ),
    cards: cardMap([lead, ...main]),
  };
}

const input = (l: List, target: number) => ({
  deck: l.deck,
  cards: l.cards,
  combos: [],
  freshness: FRESH,
  targetLevel: target,
});
const floor = (l: List, target: number) => {
  const r = mtgBrackets.assess(input(l, target));
  return r.suggested ?? r.minimum;
};
const towardOf = (l: List, target: number) =>
  mtgBrackets.toward!(mtgBrackets.assess(input(l, target)), input(l, target), target);

/** The list with `n` fillers swapped for the next `n` Game Changers not already in it. */
function withChangers(l: List, n: number): List {
  const cards = new Map(l.cards);
  const fresh = changers.filter((c) => !l.cards.has(c.id)).slice(0, n);
  let i = 0;
  const main = l.deck.zones.main.map((e) => {
    const c = l.cards.get(e.cardId)!;
    if (i >= fresh.length || !c.name.startsWith("Filler")) return e;
    const next = fresh[i++];
    cards.set(next.id, next);
    return { ...e, cardId: next.id };
  });
  expect(i).toBe(n);
  return { ...l, deck: { ...l.deck, zones: { ...l.deck.zones, main } }, cards };
}

describe("mtgBrackets.toward — Game Changers carry the read up to the target", () => {
  it("nothing flagged: one shows Bracket 3, four show Bracket 4, and one fewer doesn't", () => {
    const plain = list(commander, []);
    for (const [target, more] of [
      [3, 1],
      [4, 4],
    ] as const) {
      const t = towardOf(plain, target)!;
      expect(t).toMatchObject({
        factor: "game-changers",
        more,
        one: "a Game Changer",
        many: "Game Changers",
      });
      expect(floor(withChangers(plain, more), target)).toBe(target);
      expect(floor(withChangers(plain, more - 1), target)).toBeLessThan(target);
    }
  });

  it("the Game Changers a list holds count, the commander's too", () => {
    const one = list(commander, [changers[0]]);
    expect(towardOf(one, 4)?.more).toBe(3);
    expect(floor(withChangers(one, 3), 4)).toBe(4);
    expect(floor(withChangers(one, 2), 4)).toBe(3);
    expect(towardOf(list(urza, []), 4)?.more).toBe(3);
  });

  it("a target of 5 asks for the four that show Bracket 4: no list proves cEDH", () => {
    expect(towardOf(list(commander, []), 5)?.more).toBe(4);
    expect(towardOf(list(commander, changers.slice(0, 4)), 5)).toBeNull();
  });

  it("nothing to carry: Bracket 2 allows no Game Changer, and a floor at the target or above takes none", () => {
    expect(towardOf(list(commander, []), 2)).toBeNull();
    expect(towardOf(list(commander, [changers[0]]), 3)).toBeNull();
    // Land denial already shows Bracket 4: nothing for Game Changers to carry.
    expect(towardOf(list(commander, [armageddon]), 4)).toBeNull();
  });

  it("counts reads the declared flag", () => {
    const t = towardOf(list(commander, []), 4)!;
    expect(t.counts(changers[0])).toBe(true);
    expect(t.counts(armageddon)).toBe(false);
    expect(t.counts(commander)).toBe(false);
  });
});
