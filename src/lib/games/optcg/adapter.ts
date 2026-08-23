/**
 * One Piece TCG adapter — TYPED STUB (build plan P0.5: "the fire drill").
 *
 * Its whole job in M0 is to typecheck against the full GameAdapter interface,
 * proving nothing MTG-specific leaked into the contract. Real validation
 * (leader color legality, banned pairs via conditional legality rows +
 * data/optcg/legalities.json overlay) and real analytics land in M4 (P4.x).
 * Everything here is deliberately minimal, not deliberately wrong.
 */
import type { CardData, FormatDef, GameAdapter, SearchFieldDef, ValidationIssue } from "../types";

/** OP colors reuse the mask bits: Red 8, Green 16, Blue 2, Purple ?, Black 4, Yellow ? — finalized in M4. */
export type OptcgAttrs = {
  category?: "leader" | "character" | "event" | "stage";
  effect_text?: string;
  traits?: string[];
  power_num?: number | null;
  counter_num?: number | null;
  life?: number;
};

type OptcgCard = CardData<OptcgAttrs>;

/** 50-card deck + 1 leader outside the count; 4 copies per card id. */
const STANDARD: FormatDef = {
  code: "standard",
  label: "Standard",
  zones: [
    { id: "leader", label: "Leader", min: 1, max: 1, countsTowardSize: false, defaultCopyLimit: 1 },
    { id: "main", label: "Deck", min: 50, max: 50, countsTowardSize: true, defaultCopyLimit: 4 },
  ],
  deckSize: { min: 50, max: 50 },
};

const SEARCH_FIELDS: SearchFieldDef[] = [
  { key: "name", label: "Name", kind: "text", target: { column: "name_norm" }, match: "trgm" },
  {
    key: "cost",
    label: "Cost",
    kind: "number",
    target: { column: "cost_value" },
    ops: ["eq", "lte", "gte"],
  },
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

  // M4: leader-color legality, 4-copy limit, banned pairs (conditional rows +
  // the hand-maintained overlay). Stub validates nothing rather than half-validating.
  validate(): ValidationIssue[] {
    return [];
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
    defaultGroupBy: "costValue",
    leaderNoun: "Leader",
  },

  capabilities: {},
};
