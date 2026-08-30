/**
 * The game adapter contract (deckwarden-build-plan.md §3 + Appendix B).
 *
 * Each game is a pure-function module implementing this interface. The core
 * consumes ONLY this contract — never game specifics — which is what makes
 * One Piece (M4) and Azuki (M5) new modules instead of rewrites. The OPTCG
 * stub adapter exists to keep MTG assumptions from leaking in here.
 *
 * `validate`/`analyze` are pure and IO-free: the same code runs client-side
 * in the editor for instant feedback and server-side on save. Analytics are
 * DATA (histogram/breakdown/stat/table blocks), never components — the core
 * renders them generically. Game-exclusive services live behind optional
 * `capabilities`, never in the required surface.
 */

export type GameId = "mtg" | "optcg" | "azuki";

// ---------------------------------------------------------------------------
// Formats & zones
// ---------------------------------------------------------------------------

export interface ZoneDef {
  /** 'commander' | 'main' | 'leader' | ... — stored as text on deck_cards. */
  id: string;
  label: string;
  /** Card-count bounds for the zone (commander: 1..2 for partners; leader: 1..1). */
  min: number;
  max: number | null;
  countsTowardSize: boolean;
  /**
   * Per-card copy limit within the deck, or null = the adapter's own
   * copy-exemption logic decides (e.g. MTG basics / "any number" cards).
   */
  defaultCopyLimit: number | null;
  /**
   * The command zone (MTG 'commander', OP 'leader'). Cards here feed the
   * decks.leader_ids / ci_mask denorms — the core's only zone-role knowledge.
   */
  isLeaderZone?: boolean;
}

export interface FormatDef {
  code: string;
  label: string;
  zones: ZoneDef[];
  /** Total across countsTowardSize zones. Commander 100/100; OP 50 + leader. */
  deckSize: { min: number; max: number | null };
}

// ---------------------------------------------------------------------------
// Card data (the shape the core hands to adapters — already fetched, no IO)
// ---------------------------------------------------------------------------

export interface LegalityEntry {
  status: "legal" | "banned" | "restricted" | "not_legal";
  /**
   * NULL/absent = unconditional. Only the game adapter interprets conditions
   * (e.g. OP pair bans); the core just fetches rows.
   */
  condition?:
    { type: "banned_with_leader"; leaderIds: string[] } | { type: string; [k: string]: unknown };
}

export interface CardData<A = Record<string, unknown>> {
  id: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  /** Bitmask W1 U2 B4 R8 G16 C32 (other games reuse bits). */
  colorsMask: number;
  /** Color identity, same bitmask. Fit test: (ciMask & ~leaderCi) === 0. */
  ciMask: number;
  isLeaderCandidate: boolean;
  isPreview: boolean;
  cheapestUsd: number | null;
  popularity: number | null;
  /** Game-typed attrs (MtgAttrs | OptcgAttrs | ...), as written by ingest. */
  attrs: A;
  /** Pre-filtered by the CORE to the deck's format + date. Exceptions only — empty = format default. */
  legality: LegalityEntry[];
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export interface DeckEntry {
  cardId: string;
  qty: number;
  /** User categories ("ramp", "wincon") — free text, adapter-agnostic. */
  tags: string[];
  /** Chosen alt-art printing, if any. */
  printingId?: string;
}

export interface DeckSnapshot {
  gameId: GameId;
  formatCode: string;
  /** ISO date for dated legality evaluation; absent = today. */
  asOf?: string;
  /** Keyed by ZoneDef.id. */
  zones: Record<string, DeckEntry[]>;
}

// ---------------------------------------------------------------------------
// Validation & analytics (pure outputs)
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** 'DECK_SIZE' | 'COLOR_IDENTITY' | 'BANNED' | 'BANNED_PAIR' | 'COPY_LIMIT' | 'NOT_RELEASED' | ... */
  code: string;
  /** Preview cards → warning, not error. */
  severity: "error" | "warning";
  message: string;
  cardIds?: string[];
  zone?: string;
}

export type AnalyticsBlock =
  | {
      kind: "histogram";
      id: string;
      title: string;
      buckets: { label: string; value: number; colorVar?: string }[];
    }
  | {
      kind: "breakdown";
      id: string;
      title: string;
      slices: { label: string; value: number; colorVar?: string }[];
    }
  | {
      kind: "stat";
      id: string;
      title: string;
      value: string;
      hint?: string;
      tone?: "ok" | "warn" | "bad";
    }
  | { kind: "table"; id: string; title: string; columns: string[]; rows: (string | number)[][] };

// ---------------------------------------------------------------------------
// Search fields (declarative — core translates whitelisted targets to SQL,
// so there is no injection surface and no per-game query code)
// ---------------------------------------------------------------------------

/** The explicit index contract: a promoted real column, or a JSONB path with its index tier. */
export type FieldTarget =
  | {
      column:
        | "name_norm"
        | "search_text" // generated tsvector column; only valid with match: 'fts'
        | "primary_type"
        | "cost_value"
        | "colors_mask"
        | "ci_mask"
        | "cheapest_usd"
        | "popularity";
    }
  | { jsonbPath: string[]; indexed: "gin" | "expression" | "post-filter" };

export type SearchFieldDef =
  | {
      key: string;
      label: string;
      kind: "text";
      target: FieldTarget;
      match: "fts" | "trgm" | "exact";
    }
  | {
      key: string;
      label: string;
      kind: "number";
      target: FieldTarget;
      ops: ("eq" | "lte" | "gte")[];
    }
  | {
      key: string;
      label: string;
      kind: "multiselect";
      target: FieldTarget;
      mode: "any" | "all";
      options: { value: string; label: string }[] | "distinct-from-db";
    }
  /** Mask semantics chosen at query time: exactly | within | including. */
  | { key: string; label: string; kind: "colorset"; target: FieldTarget };

// ---------------------------------------------------------------------------
// Optional capabilities (game-exclusive services — absent = feature hidden)
// ---------------------------------------------------------------------------

export interface ComboHit {
  id: string;
  /** Deck cards participating in the combo. */
  cardIds: string[];
  /** Empty = complete in deck; one entry = "one card away". */
  missingCardIds: string[];
  description: string;
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export interface GameAdapter<A extends Record<string, unknown> = Record<string, unknown>> {
  id: GameId;
  name: string;
  formats: FormatDef[];
  searchFields: SearchFieldDef[];

  // PURE — no IO. Same code runs client-side (live editor) and server-side (on save).
  validate(deck: DeckSnapshot, cards: ReadonlyMap<string, CardData<A>>): ValidationIssue[];
  analyze(deck: DeckSnapshot, cards: ReadonlyMap<string, CardData<A>>): AnalyticsBlock[];

  /**
   * Tokenize only — name → id resolution is CORE (name_norm exact, then trgm
   * fuzzy), using the one shared normalizer. zoneHint/setHint are free text the
   * core matches against ZoneDef ids / set codes as best effort.
   */
  parseDecklist(text: string): {
    lines: { rawName: string; qty: number; zoneHint?: string; setHint?: string }[];
    warnings: string[];
  };
  serializeDecklist(deck: DeckSnapshot, cards: ReadonlyMap<string, CardData<A>>): string;

  display: {
    /** Mana pips / DON!! cost / IKZ — an HTML string, rendered by the core. */
    costHtml(card: CardData<A>): string;
    /** 'Legendary Creature — Elf' / 'Character — Straw Hat Crew'. */
    subtitle(card: CardData<A>): string;
    /** Rules/effect text for card pages — plain text ("" when none); faces separated by blank lines. */
    bodyText(card: CardData<A>): string;
    /** Small stat suffix ('4/4', loyalty, OP power), or null when not applicable. */
    statLine?(card: CardData<A>): string | null;
    defaultGroupBy: "primaryType" | "costValue" | "tags";
    /** 'Commander' / 'Leader'. */
    leaderNoun: string;
  };

  /**
   * Leader-hub template (P2.4): editorial starting-point role counts for the
   * game's leader format, rendered on /c/[slug] hub pages and labeled as a
   * template — advice computed/curated from card knowledge, never faked
   * community stats (cold-start rule). Absent = hubs show card data only.
   */
  hub?: {
    /** Which format the template describes, e.g. "A typical Commander deck". */
    templateTitle: string;
    roles: { label: string; count: number; hint?: string }[];
  };

  capabilities: {
    /** MTG M2: Commander Spellbook. The one intentionally non-pure surface (IO behind core). */
    combos?: { findForDeck(cardIds: string[], ciMask: number): Promise<ComboHit[]> };
    /** MTG M3: Topdeck.gg. */
    tournaments?: boolean;
  };
}
