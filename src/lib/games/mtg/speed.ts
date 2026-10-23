/**
 * How fast a Commander list looks (BRACKET-SPEED, DECKCHECK-STUDY §2.2 and
 * §2.3): three facts anyone holding the list can check — fast mana, tutors,
 * the curve with the land count — shown beside the bracket read and never
 * part of it. The read (./brackets.ts) ignores tutors and fast mana by
 * design ("Tutors and fast mana don't change the read. Wizards dropped
 * tutor limits in October 2025."), and `assess` reads nothing here: these
 * are what the sheet and "At the table" say so the pod can weigh it, and
 * what opens the owner's cEDH question when they look tuned.
 *
 * The definitions are the calibration's, unchanged (2026-10-21, 182 precons
 * and 11,556 cEDH-named Topdeck lists through 2026-09-01):
 *
 * - the main zone is every zone but the format's leader zone; counts are
 *   by copy;
 * - a card is a land when the FRONT face of its type line contains "Land"
 *   — never `primaryType`, which ranks Creature, Artifact and Enchantment
 *   above Land (scryfall-map.ts), so an artifact land and Dryad Arbor are
 *   lands here; a modal double-faced card with a spell front is a spell;
 * - fast mana: a nonland main-zone card at mana value 1 or less with any
 *   of the roles ramp, mana rock, mana dork (./roles.ts; there is no
 *   fast-mana role);
 * - tutors: a main-zone card with the role tutor (Tagger's land tutors are
 *   a separate tag the role already leaves out);
 * - average mana value: the mean mana value of the nonland main-zone cards,
 *   by copy, two decimals; lands: the land count by copy.
 *
 * Pure, no IO; a null mana value counts as 0, as the calibration counted it.
 */
import type {
  BracketSpeedFacts,
  BracketSpeedMeta,
  BracketSpeedRow,
  CardData,
  DeckSnapshot,
} from "../types";
import type { MtgAttrs } from "./attrs";
import { mtgFormat } from "./formats";
import type { MtgRoleKey } from "./roles";

type MtgCard = CardData<MtgAttrs>;

export interface MtgSpeedFacts {
  /** Nonland main-zone cards at mana value 1 or less with a ramp, mana-rock or mana-dork role, by copy. */
  fastMana: number;
  /** Main-zone cards with the tutor role, by copy. */
  tutors: number;
  /** The mean mana value of the nonland main-zone cards, by copy, two decimals; 0 with no spells. */
  averageManaValue: number;
  /** Main-zone cards whose front face is a Land, by copy. */
  lands: number;
}

/** The roles a fast-mana card may carry (no role says "fast mana" itself). */
export const FAST_MANA_ROLES: ReadonlySet<MtgRoleKey> = new Set<MtgRoleKey>([
  "ramp",
  "mana-rock",
  "mana-dork",
]);

/** The most a fast-mana card costs. */
export const FAST_MANA_MAX_MANA_VALUE = 1;

/**
 * The cuts that make a list look tuned (`mtgSpeedLooksTuned`): past either,
 * the owner is asked the cEDH question. Both are cuts no precon crosses,
 * from the calibration (DECKCHECK-STUDY §2.3; `.claude/deckcheck-study-
 * evidence/calibration/RESULTS.md`, local):
 *
 * - fast mana 6 or more: precons' median 2, cEDH lists' 12, AUC 0.997;
 *   0 of 182 precons past it, 98 % of cEDH lists past it;
 * - lands 33 or fewer: precons' median 38, cEDH lists' 26, AUC 0.983;
 *   0 of 182 precons past it, 97 % of cEDH lists past it.
 *
 * Of the 64 cEDH-named lists the read leaves below a firm 4, lands catch
 * 51 and fast mana 24. The curve is shown and never used to ask: its best
 * cut (2.96 or less) has a known false positive, a Bracket 2 Marchesa list
 * at 2.95; tutors (4 or more) pass 3 precons.
 */
export const MTG_SPEED_CUTS = {
  /** Tuned when `fastMana >= fastMana`. */
  fastMana: 6,
  /** Tuned when `lands <= lands`. */
  lands: 33,
} as const;

/** A land by the front face of its type line — never `primaryType`. */
export function mtgIsLand(attrs: Pick<MtgAttrs, "type_line">): boolean {
  return (attrs.type_line ?? "").split(" // ")[0].includes("Land");
}

/** The three facts; null for a list with no main-zone cards the map knows. */
export function mtgSpeedFacts(
  deck: DeckSnapshot,
  cards: ReadonlyMap<string, MtgCard>,
): MtgSpeedFacts | null {
  const format = mtgFormat(deck.formatCode);
  const leaderZones = new Set(
    format ? format.zones.filter((z) => z.isLeaderZone).map((z) => z.id) : ["commander"],
  );
  let fastMana = 0;
  let tutors = 0;
  let lands = 0;
  let spells = 0;
  let manaValueSum = 0;
  let counted = 0;
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    if (leaderZones.has(zoneId)) continue;
    for (const e of entries) {
      const card = cards.get(e.cardId);
      if (!card) continue;
      counted += e.qty;
      const roles = card.attrs.roles ?? [];
      const manaValue = card.costValue ?? 0;
      if (mtgIsLand(card.attrs)) {
        lands += e.qty;
      } else {
        spells += e.qty;
        manaValueSum += manaValue * e.qty;
        if (manaValue <= FAST_MANA_MAX_MANA_VALUE && roles.some((r) => FAST_MANA_ROLES.has(r))) {
          fastMana += e.qty;
        }
      }
      if (roles.includes("tutor")) tutors += e.qty;
    }
  }
  if (counted === 0) return null;
  return {
    fastMana,
    tutors,
    averageManaValue: spells > 0 ? Math.round((manaValueSum / spells) * 100) / 100 : 0,
    lands,
  };
}

/** Past either cut (`MTG_SPEED_CUTS`): fast mana 6 or more, or lands 33 or fewer. */
export function mtgSpeedLooksTuned(facts: MtgSpeedFacts): boolean {
  return facts.fastMana >= MTG_SPEED_CUTS.fastMana || facts.lands <= MTG_SPEED_CUTS.lands;
}

// --- The words -------------------------------------------------------------------------------

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "12 fast mana" — the phrase players use, one or many. */
const fastManaPhrase = (n: number) => `${n} fast mana`;
const landsPhrase = (n: number) => count(n, "land", "lands");
const curvePhrase = (facts: MtgSpeedFacts) =>
  `average mana value ${facts.averageManaValue.toFixed(2)}`;

/** The sheet's rows: each fact, and what it counts where the label alone would not say. */
export function mtgSpeedRows(facts: MtgSpeedFacts): BracketSpeedRow[] {
  return [
    {
      id: "fast-mana",
      label: "Fast mana",
      value: String(facts.fastMana),
      meaning: "mana sources costing 1 or less",
    },
    {
      id: "tutors",
      label: "Tutors",
      value: String(facts.tutors),
      meaning: "cards that search for other cards, land tutors aside",
    },
    {
      id: "curve",
      label: "Curve",
      value: `${curvePhrase(facts)}, ${landsPhrase(facts.lands)}`,
    },
  ];
}

/** "At the table"'s line: "12 fast mana, 10 tutors, average mana value 2.07, 26 lands". */
export function mtgSpeedLine(facts: MtgSpeedFacts): string {
  return [
    fastManaPhrase(facts.fastMana),
    count(facts.tutors, "tutor", "tutors"),
    curvePhrase(facts),
    landsPhrase(facts.lands),
  ].join(", ");
}

/**
 * The owner's nudge, naming only the facts that crossed a cut — "12 fast
 * mana and 26 lands look like a cEDH list. If it is, say so below." — null
 * when neither did. It claims nothing about the read: the cEDH answer is
 * what raises it, and only the owner can give it.
 */
export function mtgSpeedNudge(facts: MtgSpeedFacts): string | null {
  const crossed: string[] = [];
  if (facts.fastMana >= MTG_SPEED_CUTS.fastMana) crossed.push(fastManaPhrase(facts.fastMana));
  if (facts.lands <= MTG_SPEED_CUTS.lands) crossed.push(landsPhrase(facts.lands));
  if (crossed.length === 0) return null;
  const subject = crossed.join(" and ");
  return `${subject} look like a cEDH list. If it is, say so below.`;
}

/** The facts, said — what core renders (types.ts' BracketSpeedFacts). */
export function mtgSpeedSaid(facts: MtgSpeedFacts): BracketSpeedFacts {
  return {
    rows: mtgSpeedRows(facts),
    line: mtgSpeedLine(facts),
    tuned: mtgSpeedLooksTuned(facts),
    nudge: mtgSpeedNudge(facts),
  };
}

/** The "How it plays" question tuned-looking facts open (MTG_BRACKET_QUESTIONS' key). */
export const MTG_SPEED_ASKS = "cedh";

/** "At the table"'s label: the roles are Scryfall Tagger's; the counts are the list's. */
export const MTG_SPEED_LABEL = "Speed (Scryfall Tagger roles)";

/** The adapter's declaration (BracketsMeta.speed). */
export const mtgBracketSpeed: BracketSpeedMeta<MtgAttrs> = {
  facts(deck, cards) {
    const facts = mtgSpeedFacts(deck, cards);
    return facts ? mtgSpeedSaid(facts) : null;
  },
  label: MTG_SPEED_LABEL,
  asks: MTG_SPEED_ASKS,
};
