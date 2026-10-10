/**
 * Magic's Swap Lab declaration (Y7a, WAVE4 D8) — pure data + phrasing over
 * ./roles.ts, consumed by the core (src/lib/recommend/alternatives.ts, the
 * route, the Card tab). The roles are Scryfall Tagger's community function
 * tags: the evidence line says so and links each one, and nothing here says
 * two cards do exactly the same thing.
 */
import type { CardData, SwapMeta } from "../types";
import type { MtgAttrs } from "./attrs";
import { MTG_ROLES, taggerTagUrl } from "./roles";

const isGameChanger = (card: CardData) => (card.attrs as Partial<MtgAttrs>).game_changer === true;

export const mtgSwap: SwapMeta = {
  rolesPath: "roles",
  roles: MTG_ROLES.map((r) => ({ key: r.key, label: r.label, href: taggerTagUrl(r.tag.slug) })),
  source: "scryfall_tagger",
  evidence: (labels) => ({
    why: `Both: ${labels.join(" · ")} — community-tagged on Scryfall Tagger`,
  }),
  // Lands swap for lands on color and count, which roles can't see — and a
  // land-for-spell swap changes the land count. Neither ships in Y7a.
  offers: (card) => card.primaryType !== "Land",
  candidateScope: { column: "primary_type", op: "ne", value: "Land" },
  costWindow: 1,
  chips(out, candidate) {
    const chips: string[] = [];
    if (candidate.costValue !== null) chips.push(`Mana value ${candidate.costValue}`);
    if (isGameChanger(candidate)) chips.push("Game Changer (Wizards' list)");
    else if (isGameChanger(out)) chips.push("Not a Game Changer");
    return chips;
  },
};
