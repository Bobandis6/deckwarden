/**
 * The MTG game adapter — pure functions only (build plan §3, Appendix B).
 * Commander first; other formats are LATER (legality model already supports them).
 */
import type { CardData, GameAdapter, SearchFieldDef } from "../types";
import type { MtgAttrs } from "./attrs";
import { analyzeMtg } from "./analyze";
import { parseMtgDecklist, serializeMtgDecklist } from "./decklist";
import { MTG_FORMATS } from "./formats";
import { mtgRecommend } from "./recommend";
import { validateMtg } from "./validate";

type MtgCard = CardData<MtgAttrs>;

/**
 * Declarative filters with the explicit index contract (build plan §4 tiers):
 * promoted btree columns → the one jsonb_path_ops GIN → post-filter (upgraded
 * to an expression index only if measured hot).
 */
const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: "name", label: "Name", kind: "text", target: { column: "name_norm" }, match: "trgm" },
  {
    key: "text",
    label: "Card text",
    kind: "text",
    target: { column: "search_text" },
    match: "fts",
  },
  {
    key: "type",
    label: "Type",
    kind: "multiselect",
    target: { column: "primary_type" },
    mode: "any",
    options: [
      { value: "Creature", label: "Creature" },
      { value: "Instant", label: "Instant" },
      { value: "Sorcery", label: "Sorcery" },
      { value: "Artifact", label: "Artifact" },
      { value: "Enchantment", label: "Enchantment" },
      { value: "Planeswalker", label: "Planeswalker" },
      { value: "Battle", label: "Battle" },
      { value: "Land", label: "Land" },
    ],
  },
  {
    key: "mv",
    label: "Mana value",
    kind: "number",
    target: { column: "cost_value" },
    ops: ["eq", "lte", "gte"],
  },
  { key: "ci", label: "Color identity", kind: "colorset", target: { column: "ci_mask" } },
  { key: "colors", label: "Colors", kind: "colorset", target: { column: "colors_mask" } },
  {
    key: "keywords",
    label: "Keywords",
    kind: "multiselect",
    target: { jsonbPath: ["keywords"], indexed: "gin" },
    mode: "all",
    options: "distinct-from-db",
  },
  {
    key: "price",
    label: "Price (USD)",
    kind: "number",
    target: { column: "cheapest_usd" },
    ops: ["lte", "gte"],
  },
  {
    key: "power",
    label: "Power",
    kind: "number",
    target: { jsonbPath: ["power_num"], indexed: "post-filter" },
    ops: ["eq", "lte", "gte"],
  },
  {
    key: "toughness",
    label: "Toughness",
    kind: "number",
    target: { jsonbPath: ["toughness_num"], indexed: "post-filter" },
    ops: ["eq", "lte", "gte"],
  },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * "{2}{W}{U}" → pip spans. Class is the symbol lowercased with '/' folded
 * ("{W/U}" → pip-wu, "{2}" → pip-2); theme CSS colors them. Plain string, no JSX.
 */
export function manaCostHtml(manaCost: string | undefined): string {
  if (!manaCost) return "";
  return manaCost.replace(/\{([^}]+)\}/g, (_, sym: string) => {
    const cls = sym.toLowerCase().replace(/\//g, "");
    return `<span class="pip pip-${escapeHtml(cls)}">${escapeHtml(sym)}</span>`;
  });
}

export const mtgAdapter: GameAdapter<MtgAttrs> = {
  id: "mtg",
  name: "Magic: The Gathering",
  formats: MTG_FORMATS,
  searchFields: SEARCH_FIELDS,

  validate: validateMtg,
  analyze: analyzeMtg,

  parseDecklist: parseMtgDecklist,
  serializeDecklist: serializeMtgDecklist,

  display: {
    costHtml: (card: MtgCard) => manaCostHtml(card.attrs.mana_cost),
    subtitle: (card: MtgCard) => card.attrs.type_line.split(" // ")[0],
    // Ingest folds faces with "\n//\n"; blank lines are the cross-game separator.
    bodyText: (card: MtgCard) => card.attrs.oracle_text.replace(/\n\/\/\n/g, "\n\n"),
    statLine: (card: MtgCard) => {
      const { power, toughness, loyalty } = card.attrs;
      if (power != null && toughness != null) return `${power}/${toughness}`;
      if (loyalty != null) return `Loyalty ${loyalty}`;
      return null;
    },
    defaultGroupBy: "primaryType",
    leaderNoun: "Commander",
  },

  /**
   * Hub role template (P2.4): the widely-taught Commander skeleton. Counts
   * sum to 99 (commander is the 100th). Editorial by design — the honest
   * zero-corpus signal is "here's the shape people teach", not fake stats.
   */
  hub: {
    templateTitle: "A typical Commander deck",
    roles: [
      { label: "Lands", count: 37, hint: "36–38 for most decks; fewer with cheap curves" },
      { label: "Ramp", count: 10, hint: "mana rocks, dorks, land ramp — mostly 2–3 mana" },
      { label: "Card draw", count: 10, hint: "repeatable engines beat one-shot cantrips" },
      {
        label: "Targeted removal",
        count: 6,
        hint: "answers for creatures AND artifacts/enchantments",
      },
      { label: "Board wipes", count: 3, hint: "sweepers reset boards you've lost" },
      { label: "Synergy & win conditions", count: 33, hint: "the deck's actual plan" },
    ],
  },

  // Recommendation signals (P3.1): edhrec_rank + Spellbook + the curve
  // template above, phrased in ./recommend.ts; the engine is core.
  recommend: mtgRecommend,

  // combos (Spellbook) lands in M2; tournaments (Topdeck) in M3.
  capabilities: {},
};
