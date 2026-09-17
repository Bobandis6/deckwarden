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
    externalKey: over.externalKey ?? `oracle-${uuidCounter}`,
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

/**
 * The owner's real Moxfield "Plain text" export (2026-09-14 phone dry run,
 * P2.8b) — verbatim, never edit. The shape under test: the commander is the
 * FIRST line, unmarked; the other 79 follow under Moxfield's locale collation
 * ("Sokka, Swordmaster" before "Sokka's Charge" — a code-unit comparator
 * inverts that pair, the canary); "The Legend of Kyoshi / Avatar Kyoshi" is
 * Moxfield's single-slash double-faced spelling.
 */
export const MOXFIELD_TLA_PASTE = `1 Toph, the First Metalbender (TLA) 247
1 Aang, Airbending Master (TLE) 74
1 Abandoned Air Temple (TLA) 263
1 Airbending Lesson (TLA) 8
1 Appa, Steadfast Guardian (TLA) 10
1 Arcane Signet (ZNC) 106
1 Avatar Kyoshi, Earthbender (TLE) 130
1 Avatar's Wrath (TLA) 12
1 Ba Sing Se (TLA) 266
1 Badgermole (TLA) 166
1 Badgermole Cub (TLA) 167
1 Beastmaster Ascension (PLST) CMA-92
1 Bender's Waterskin (TLA) 255
1 Bitter Work (TLA) 210
1 Blasphemous Act (CM2) 85
1 Bumi, Eclectic Earthbender (TLE) 248
1 Bumi, Unleashed (TLA) 211
1 Command Tower (ELD) 333
1 Cycle of Renewal (TLA) 170
1 Earth Kingdom General (TLA) 173
1 Earth Rumble (TLA) 174
1 Earthbender Ascension (TLA) 175
1 Earthbending Lesson (TLA) 176
1 Earthbending Student (TLE) 249 *F*
1 Earthshape (TLE) 67
1 Elemental Bond (C19) 163
1 Enter the Avatar State (TLA) 18
1 Evolution Sage (WAR) 159
1 Explore (JMP) 393
1 Fabled Passage (EOC) 60
1 Fire Nation Palace (TLA) 268
1 Flopsie, Bumi's Buddy (TLA) 179
10 Forest (J25) 95
1 Great Divide Guide (TLA) 181
1 Hakoda, Selfless Commander (TLA) 23
1 Haru, Hidden Talent (TLA) 182
1 Heroic Intervention (MAR) 78
1 Hour of Revelation (HOU) 15
1 Inspiring Call (ZNC) 70
1 Jasmine Dragon Tea Shop (TLA) 270
1 Katara, Heroic Healer (TLE) 269
1 Kyoshi Village (TLA) 271
1 Meteor Sword (TLA) 258
1 Momo, Playful Pet (TLA) 30
6 Mountain (J25) 90
1 Omashu City (TLA) 275
1 Origin of Metalbending (TLA) 187
7 Plains (J25) 81
1 Planetarium of Wan Shi Tong (TLA) 259
1 Return of the Wildspeaker (PLST) ELD-172
1 Rumble Arena (TLA) 277
1 Sandbenders' Storm (TLA) 34
1 Secret Tunnel (TLA) 278
1 Seismic Sense (TLA) 195
1 Seismic Tutelage (TLE) 254
1 Sokka, Swordmaster (TLE) 83
1 Sokka's Charge (TLE) 66
1 Sol Ring (C18) 222
1 Solid Ground (TLE) 142
1 Suki, Kyoshi Warrior (TLA) 243
1 Sun-Blessed Peak (TLA) 280
1 Sunbaked Canyon (WHO) 309
1 Swiftfoot Boots (C13) 263
1 Tale of Katara and Toph (TLE) 143
1 Terrasymbiosis (EOE) 210
1 The Boulder, Ready to Rumble (TLA) 168
1 The Cabbage Merchant (TLE) 134
1 The Earth King (TLA) 172
1 The Great Henge (PELD) 161p
1 The Legend of Kyoshi / Avatar Kyoshi (TLA) 186
1 The Walls of Ba Sing Se (TLA) 261
1 Toph, Earthbending Master (TLE) 145
1 Toph, Greatest Earthbender (TLE) 70
1 Toph, Hardheaded Teacher (TLA) 246
1 Toph, the Blind Bandit (TLA) 198
1 Treetop Village (DDR) 30
1 Trusty Boomerang (TLA) 260
1 Uncle Iroh (TLA) 248
1 White Lotus Tile (TLA) 262
1 Zuko, Exiled Prince (TLA) 163
`;

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
