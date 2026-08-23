/**
 * The MTG shape of `card_identities.attrs`, as written by ingest
 * (buildAttrs in ./scryfall-map.ts — keep the two in sync).
 *
 * Type aliases, not interfaces, on purpose: aliases get TypeScript's implicit
 * index signature, which is what lets GameAdapter<MtgAttrs> flow through the
 * registry as a plain GameAdapter.
 */

export type MtgFaceAttrs = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
};

export type MtgAttrs = {
  type_line: string;
  oracle_text: string;
  mana_cost?: string;
  keywords?: string[];
  power?: string;
  /** Pre-normalized at ingest ("*" → null) so nothing here parses dirty strings. */
  power_num?: number | null;
  toughness?: string;
  toughness_num?: number | null;
  loyalty?: string;
  faces?: MtgFaceAttrs[];
};
