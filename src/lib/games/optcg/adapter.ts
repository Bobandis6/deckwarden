/**
 * One Piece TCG adapter. The DATA half is real as of P4.1 (punk-records
 * ingest, see punk-map.ts); P4.2 landed real validation (validate.ts —
 * leader-color legality, the 4-copy card-number rule, Bandai bans and
 * banned pairs via conditional legality rows + the data/optcg/legalities.json
 * overlay). analyze stays a stub until the OP analytics package.
 */
import type { CardData, FormatDef, GameAdapter, SearchFieldDef } from "../types";
import { validateOptcg } from "./validate";

/**
 * Ingest-written attrs (punk-map.ts is the writer; changing the contract
 * means a re-ingest). `type_line`/`oracle_text` are the keys the search_text
 * generated column hardcodes (schema.ts) — the cross-game FTS contract —
 * so the type line and effect text are stored once, under those names.
 * Colors on the shared mask bits: Red 8, Green 16, Blue 2, Black 4,
 * Yellow 1 (W's bit), Purple 32 (C's bit) — punk-map.OPTCG_COLOR_BIT is
 * the one source of truth.
 */
export type OptcgAttrs = {
  category?: "leader" | "character" | "event" | "stage";
  /** "Leader — Supernovas / Straw Hat Crew" (category + traits, FTS mirror). */
  type_line?: string;
  /** The card's effect text (FTS key; OP has no "oracle" but the column contract does). */
  oracle_text?: string;
  /** [Trigger] text, kept structured for the M4 validator — not folded into oracle_text. */
  trigger_text?: string;
  traits?: string[];
  /** Battle attributes (Strike/Slash/Ranged/Special/Wisdom). */
  attributes?: string[];
  power_num?: number | null;
  counter_num?: number | null;
  /** Leaders only — punk-records' `cost` slot IS the life total (verified vs optcgapi). */
  life?: number;
  /** Bandai block number (1/2/…). */
  block?: number;
};

type OptcgCard = CardData<OptcgAttrs>;

/** 50-card deck + 1 leader outside the count; 4 copies per card id. */
const STANDARD: FormatDef = {
  code: "standard",
  label: "Standard",
  zones: [
    {
      id: "leader",
      label: "Leader",
      min: 1,
      max: 1,
      countsTowardSize: false,
      defaultCopyLimit: 1,
      isLeaderZone: true,
    },
    { id: "main", label: "Deck", min: 50, max: 50, countsTowardSize: true, defaultCopyLimit: 4 },
  ],
  deckSize: { min: 50, max: 50 },
};

const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: "name", label: "Name", kind: "text", target: { column: "name_norm" }, match: "trgm" },
  // FTS over name + type_line + oracle_text (the generated column's contract;
  // punk-map writes those keys, so OP effect text is genuinely searchable).
  { key: "text", label: "Text", kind: "text", target: { column: "search_text" }, match: "fts" },
  {
    key: "cost",
    label: "Cost",
    kind: "number",
    target: { column: "cost_value" },
    ops: ["eq", "lte", "gte"],
  },
  {
    key: "type",
    label: "Type",
    kind: "multiselect",
    target: { column: "primary_type" },
    mode: "any",
    options: [
      { value: "Leader", label: "Leader" },
      { value: "Character", label: "Character" },
      { value: "Event", label: "Event" },
      { value: "Stage", label: "Stage" },
    ],
  },
  // Colorset grammar speaks MTG letters (translate.ts COLOR_BIT): Red=R,
  // Green=G, Blue=U, Black=B, Yellow=W, Purple=C — see punk-map.OPTCG_COLOR_BIT.
  { key: "color", label: "Color", kind: "colorset", target: { column: "colors_mask" } },
  {
    key: "traits",
    label: "Traits",
    kind: "multiselect",
    target: { jsonbPath: ["traits"], indexed: "gin" },
    mode: "any",
    options: "distinct-from-db",
  },
];

export const optcgAdapter: GameAdapter<OptcgAttrs> = {
  id: "optcg",
  name: "One Piece Card Game",
  formats: [STANDARD],
  searchFields: SEARCH_FIELDS,

  validate(deck, cards) {
    if (deck.formatCode !== STANDARD.code) {
      return [
        {
          code: "FORMAT_UNKNOWN",
          severity: "error",
          message: `Unknown One Piece format "${deck.formatCode}".`,
        },
      ];
    }
    return validateOptcg(deck, cards, STANDARD);
  },

  analyze() {
    return [];
  },

  // Sim-style lists: "4xOP01-025" / "4 OP01-025" / one leader line first.
  parseDecklist(text: string) {
    const lines: { rawName: string; qty: number }[] = [];
    const warnings: string[] = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;
      const m = line.match(/^(\d+)\s*[xX]?\s*(.+)$/);
      if (!m) {
        warnings.push(`Could not parse line: "${line}"`);
        continue;
      }
      lines.push({ rawName: m[2].trim(), qty: Number(m[1]) });
    }
    return { lines, warnings };
  },

  serializeDecklist(deck, cards) {
    return Object.values(deck.zones)
      .flat()
      .map((e) => `${e.qty}x${cards.get(e.cardId)?.name ?? e.cardId}`)
      .join("\n");
  },

  display: {
    costHtml: (card: OptcgCard) =>
      card.costValue == null ? "" : `<span class="don-cost">${card.costValue}</span>`,
    subtitle: (card: OptcgCard) => {
      const cat = card.attrs.category ?? "";
      const traits = card.attrs.traits?.join(" / ") ?? "";
      return [cat.charAt(0).toUpperCase() + cat.slice(1), traits].filter(Boolean).join(" — ");
    },
    bodyText: (card: OptcgCard) => {
      const effect = card.attrs.oracle_text ?? "";
      const trigger = card.attrs.trigger_text;
      return trigger ? `${effect}${effect ? "\n" : ""}[Trigger] ${trigger}` : effect;
    },
    statLine: (card: OptcgCard) => {
      const parts: string[] = [];
      if (card.attrs.power_num != null) parts.push(`${card.attrs.power_num} Power`);
      if (card.attrs.counter_num != null) parts.push(`+${card.attrs.counter_num} Counter`);
      if (card.attrs.life != null) parts.push(`${card.attrs.life} Life`);
      return parts.length ? parts.join(" · ") : null;
    },
    defaultGroupBy: "costValue",
    leaderNoun: "Leader",
  },

  capabilities: {},
};
