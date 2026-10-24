/**
 * The MTG game adapter — pure functions only (build plan §3, Appendix B).
 * Commander first; other formats are LATER (legality model already supports them).
 */
import { COLOR_BIT, maskToLetters } from "../colors";
import type { CardData, GameAdapter, SearchFieldDef } from "../types";
import type { MtgAttrs } from "./attrs";
import { analyzeMtg } from "./analyze";
import { mtgBrackets } from "./brackets";
import { mtgBuy } from "./buy";
import { parseMtgDecklist, serializeMtgDecklist } from "./decklist";
import { MTG_FORMATS } from "./formats";
import { mtgImportLeaderGuess } from "./import-guess";
import { mtgRecommend } from "./recommend";
import { mtgTokenCaption, mtgTokenLinks } from "./tokens";
import { MTG_TYPE_ORDER } from "./type-order";
import { validateMtg } from "./validate";

type MtgCard = CardData<MtgAttrs>;

/** "1st", "2nd", "3rd", "4th" … — a seat in turn order (pods top out at 8). */
function ordinal(n: number): string {
  return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
}

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
  // X4a: one released paper set (`set=blb`) — served by sets_game_code and
  // cp_by_set. This one declaration is the Set group's gate on /cards and
  // `?set=`'s: remove it and both are gone (WAVE3.md E, Rollback).
  { key: "set", label: "Set", kind: "set", target: { printing: "set_code" } },
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
 *
 * The string is tokenised and EVERY part escaped (S8, SECURITY-AUDIT-report.md
 * L10): the brace groups always were, but text between them — a split
 * card's " // " today — reached `dangerouslySetInnerHTML` raw, which was the
 * missing backstop against a mis-parsed or compromised upstream cost.
 */
export function manaCostHtml(manaCost: string | undefined): string {
  if (!manaCost) return "";
  return manaCost
    .split(/(\{[^}]+\})/)
    .map((part) => {
      const sym = /^\{([^}]+)\}$/.exec(part)?.[1];
      if (sym === undefined) return escapeHtml(part);
      const cls = sym.toLowerCase().replace(/\//g, "");
      return `<span class="pip pip-${escapeHtml(cls)}">${escapeHtml(sym)}</span>`;
    })
    .join("");
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
  // Positional Moxfield-shape guess (P2.8b) — never per-card promotion.
  importLeaderGuess: mtgImportLeaderGuess,
  // DECK-TOKENS: the tokens a card makes or uses, from Scryfall's all_parts.
  tokenLinks: mtgTokenLinks,

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
    // Ambient fallback (R2, G7): the identity's colors as the shared
    // `--mana-*` variables in WUBRG order; a colorless identity paints the
    // neutral C pastel so a deck's identity is never invisible (the same
    // rule ciPipsHtml applies to pips).
    colorSwatches: (mask: number) => {
      const letters = maskToLetters(mask & ~COLOR_BIT.C);
      return letters.length > 0
        ? letters.map((c) => `var(--mana-${c.toLowerCase()})`)
        : ["var(--mana-c)"];
    },
    defaultGroupBy: "primaryType",
    typeOrder: MTG_TYPE_ORDER,
    leaderNoun: "Commander",
    // W4: the empty leader zone's browse destination (D3).
    leaderBrowse: { href: "/commanders", label: "Browse commanders" },
    // Y2b: the start doors' precon door (the W8b index, then a product's
    // "Start from this precon").
    preconBrowse: { href: "/precons", label: "Start from a precon" },
    // DECK-TOKENS: P/T, colors, first keywords — token names don't tell tokens apart.
    tokenCaption: mtgTokenCaption,
    searchPlaceholder: "Add cards: try “4 Sol Ring”",
    importPlaceholder:
      "1 Sol Ring\n1 Arcane Signet (AFC) 95\n…paste from Moxfield, Arena, Archidekt, anywhere.",
  },

  /**
   * Hub role template (P2.4): the widely-taught Commander skeleton. Counts
   * sum to 99 (commander is the 100th). Editorial by design — the honest
   * zero-corpus signal is "here's the shape people teach", not fake stats.
   */
  hub: {
    templateTitle: "A typical Commander deck",
    roles: [
      { label: "Lands", count: 37, hint: "36 to 38 for most decks; fewer with cheap curves" },
      { label: "Ramp", count: 10, hint: "mana rocks, dorks, land ramp, mostly 2 to 3 mana" },
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

  // The bracket read (Y3b): Wizards' ruleset as data, Spellbook's MIT deck
  // ladder adjusted to Wizards' text, pure in ./brackets.ts; IO is core
  // (loadCompleteCombos, the freshness loader).
  brackets: mtgBrackets,

  // The game journal (Y9a, WAVE4 D10): Commander pods of 2–8, the table's
  // bracket (left empty unless picked), seats in turn order, partner pairs.
  journal: {
    pod: { min: 2, max: 8, default: 4 },
    tableLevel: { noun: mtgBrackets.noun, levels: mtgBrackets.levels },
    seats: (podSize) =>
      Array.from({ length: podSize }, (_, i) => ({
        seat: i + 1,
        label: ordinal(i + 1),
        phrase: `went ${ordinal(i + 1)}`,
      })),
    opponentLeaders: 2,
  },

  capabilities: {
    // Ambient artwork (R2): Scryfall's art_crop with the artist credit
    // beside it, resolved by printing id in src/lib/cards/art.ts.
    ambientArt: { kind: "art_crop" },
    // Combo data: Commander Spellbook (P2.5 ingest; P3.3 Radar). Detection IO
    // is core (src/lib/combos/) — this is attribution + the walkthrough link,
    // matching the recommend.sources credit.
    combos: {
      sourceLabel: "Commander Spellbook",
      sourceHref: "https://commanderspellbook.com",
      externalUrl: (externalKey) =>
        `https://commanderspellbook.com/combo/${encodeURIComponent(externalKey)}/`,
    },
    // Tournament results: Topdeck.gg (P3.5 ingest). Query IO is core
    // (src/lib/tournaments/); the visible credit + event link are the API's
    // hard attribution requirement, rendered wherever the data appears.
    tournaments: {
      sourceLabel: "Topdeck.gg",
      sourceHref: "https://topdeck.gg",
      // /event/{TID} verified against a live raw-TID event page 2026-09-01.
      eventUrl: (externalKey) => `https://topdeck.gg/event/${encodeURIComponent(externalKey)}`,
    },
    // Buy links (W7): TCGplayer Mass Entry + name search, strings only —
    // link-building/menus are core (src/lib/buy/), IO is the reader's browser.
    buy: mtgBuy,
  },
};
