/**
 * The MTG shape of `card_identities.attrs`, as written by ingest
 * (buildAttrs in ./scryfall-map.ts — keep the two in sync).
 *
 * Type aliases, not interfaces, on purpose: aliases get TypeScript's implicit
 * index signature, which is what lets GameAdapter<MtgAttrs> flow through the
 * registry as a plain GameAdapter.
 */
import type { MtgRoleKey } from "./roles";

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
  /**
   * Bracket facts (Y3a), sparse — absent means "not flagged" only when the
   * run's stats say the source was read (ingest_runs.stats.game_changers /
   * .tagger); nothing reads them until Y3b's engine.
   * Wizards' Game Changers list via Scryfall's `game_changer`, written only when true.
   */
  game_changer?: true;
  /** Scryfall Tagger's mass-land-denial, split clear / edge by data/mtg/tagger-overrides.json. */
  mld?: "clear" | "edge";
  /** Scryfall Tagger's extra-turn. */
  extra_turn?: true;
  /**
   * Swap Lab's roles (Y7a, WAVE4 D8): the jobs Scryfall Tagger's community
   * tags give the card, as our keys (./roles.ts), sorted; absent when none.
   * Not a bracket flag — the read never takes it.
   */
  roles?: MtgRoleKey[];
};
