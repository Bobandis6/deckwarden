/**
 * Test-only fixtures: real-shaped CardData for the MTG adapter tests, mirroring
 * what ingest writes (masks W1 U2 B4 R8 G16 C32; attrs per ./attrs.ts).
 * Not a test file itself — imported by *.test.ts neighbors.
 */
import type { CardData, DeckEntry, DeckSnapshot } from "../types";
import type { MtgAttrs } from "./attrs";

export type MtgCard = CardData<MtgAttrs>;

let uuidCounter = 0;

export function card(
  over: Partial<MtgCard> & { name: string; attrs?: Partial<MtgAttrs> },
): MtgCard {
  const attrs: MtgAttrs = {
    type_line: "Creature — Test",
    oracle_text: "",
    ...over.attrs,
  };
  return {
    id: over.id ?? `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
    primaryType: "Creature",
    costValue: 2,
    colorsMask: 0,
    ciMask: 0,
    isLeaderCandidate: false,
    isPreview: false,
    cheapestUsd: null,
    popularity: null,
    legality: [],
    ...over,
    attrs,
  };
}

export const atraxa = card({
  name: "Atraxa, Praetors' Voice",
  primaryType: "Creature",
  costValue: 4,
  colorsMask: 1 | 2 | 4 | 16,
  ciMask: 1 | 2 | 4 | 16,
  isLeaderCandidate: true,
  cheapestUsd: 18.5,
  attrs: {
    type_line: "Legendary Creature — Phyrexian Angel Horror",
    oracle_text:
      "Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.",
    mana_cost: "{G}{W}{U}{B}",
    keywords: ["Flying", "Vigilance", "Deathtouch", "Lifelink", "Proliferate"],
    power: "4",
    power_num: 4,
    toughness: "4",
    toughness_num: 4,
  },
});

export const thrasios = card({
  name: "Thrasios, Triton Hero",
  costValue: 2,
  colorsMask: 2 | 16,
  ciMask: 2 | 16,
  isLeaderCandidate: true,
  attrs: {
    type_line: "Legendary Creature — Merfolk Wizard",
    oracle_text:
      "{4}: Scry 1, then reveal the top card of your library…\nPartner (You can have two commanders if both have partner.)",
    mana_cost: "{G}{U}",
    keywords: ["Partner", "Scry"],
  },
});

export const tymna = card({
  name: "Tymna the Weaver",
  costValue: 3,
  colorsMask: 1 | 4,
  ciMask: 1 | 4,
  isLeaderCandidate: true,
  attrs: {
    type_line: "Legendary Creature — Human Cleric",
    oracle_text:
      "Lifelink\nAt the beginning of your postcombat main phase…\nPartner (You can have two commanders if both have partner.)",
    mana_cost: "{1}{W}{B}",
    keywords: ["Partner", "Lifelink"],
  },
});

export const wilson = card({
  name: "Wilson, Refined Grizzly",
  costValue: 3,
  colorsMask: 16,
  ciMask: 16,
  isLeaderCandidate: true,
  attrs: {
    type_line: "Legendary Creature — Bear Warrior",
    oracle_text:
      "Vigilance, reach, ward {1}\nChoose a Background (You can have a Background as a second commander.)",
    mana_cost: "{2}{G}",
    keywords: ["Vigilance", "Reach", "Ward", "Choose a Background"],
  },
});

export const raisedByGiants = card({
  name: "Raised by Giants",
  primaryType: "Enchantment",
  costValue: 3,
  colorsMask: 16,
  ciMask: 16,
  attrs: {
    type_line: "Legendary Enchantment — Background",
    oracle_text: "Commander creatures you own have base power and toughness 10/10 and are Giants…",
    mana_cost: "{2}{G}",
  },
});

export const solRing = card({
  name: "Sol Ring",
  primaryType: "Artifact",
  costValue: 1,
  cheapestUsd: 1.2,
  attrs: { type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", mana_cost: "{1}" },
});

export const lightningBolt = card({
  name: "Lightning Bolt",
  primaryType: "Instant",
  costValue: 1,
  colorsMask: 8,
  ciMask: 8,
  attrs: {
    type_line: "Instant",
    oracle_text: "Lightning Bolt deals 3 damage to any target.",
    mana_cost: "{R}",
  },
});

export const island = card({
  name: "Island",
  primaryType: "Land",
  costValue: 0,
  ciMask: 2,
  attrs: { type_line: "Basic Land — Island", oracle_text: "({T}: Add {U}.)" },
});

export const relentlessRats = card({
  name: "Relentless Rats",
  costValue: 3,
  colorsMask: 4,
  ciMask: 4,
  attrs: {
    type_line: "Creature — Rat",
    oracle_text:
      "Relentless Rats gets +1/+1 for each other creature named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.",
    mana_cost: "{1}{B}{B}",
  },
});

export const sevenDwarves = card({
  name: "Seven Dwarves",
  costValue: 2,
  colorsMask: 8,
  ciMask: 8,
  attrs: {
    type_line: "Creature — Dwarf",
    oracle_text:
      "Seven Dwarves gets +1/+1 for each other creature named Seven Dwarves.\nA deck can have up to seven cards named Seven Dwarves.",
    mana_cost: "{1}{R}",
  },
});

export const flash = card({
  name: "Flash",
  primaryType: "Instant",
  costValue: 2,
  colorsMask: 2,
  ciMask: 2,
  legality: [{ status: "banned" }],
  attrs: {
    type_line: "Instant",
    oracle_text: "You may put a creature card from your hand onto the battlefield…",
    mana_cost: "{1}{U}",
  },
});

export const previewCard = card({
  name: "Spoiled Newcomer",
  costValue: 3,
  colorsMask: 1,
  ciMask: 1,
  isPreview: true,
  legality: [{ status: "not_legal" }],
  attrs: { type_line: "Creature — Human", oracle_text: "", mana_cost: "{2}{W}" },
});

/** n distinct colorless artifact filler cards (fit any commander's identity). */
export function fillers(n: number): MtgCard[] {
  return Array.from({ length: n }, (_, i) =>
    card({
      name: `Filler Trinket ${i + 1}`,
      primaryType: "Artifact",
      costValue: (i % 6) + 1,
      cheapestUsd: 0.1,
      attrs: { type_line: "Artifact", oracle_text: "", mana_cost: `{${(i % 6) + 1}}` },
    }),
  );
}

export function cardMap(cards: MtgCard[]): Map<string, MtgCard> {
  return new Map(cards.map((c) => [c.id, c]));
}

export function entry(card: MtgCard, qty = 1): DeckEntry {
  return { cardId: card.id, qty, tags: [] };
}

export function commanderDeck(commanders: MtgCard[], main: DeckEntry[]): DeckSnapshot {
  return {
    gameId: "mtg",
    formatCode: "commander",
    zones: { commander: commanders.map((c) => entry(c)), main },
  };
}

/** A fully legal 100-card Atraxa deck plus its card map. */
export function legalDeck(): { deck: DeckSnapshot; cards: Map<string, MtgCard> } {
  const fill = fillers(69);
  const main = [entry(solRing), entry(island, 29), ...fill.map((c) => entry(c))];
  return {
    deck: commanderDeck([atraxa], main),
    cards: cardMap([atraxa, solRing, island, ...fill]),
  };
}
