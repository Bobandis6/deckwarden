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
// Recommendation signal metadata (P3.1)
// ---------------------------------------------------------------------------
//
// The scoring/evidence MACHINE is core (src/lib/recommend/) and shared across
// games — "explainable suggestions" is the platform identity, not a game
// feature. What lives here is only what the core cannot know: what the
// generic `popularity` column MEANS for this game, the editorial target
// curve and which cards count toward it, combo-source naming, and the
// evidence sentences in the game's own English. Everything is pure data +
// pure builders (no IO, no SQL) — the searchFields philosophy: adapters
// declare, core translates.

/** The card fields curve bucketing reads — a structural subset of CardData. */
export type CurveCardInput = Pick<CardData, "primaryType" | "costValue">;

/** Which side of a cut tradeoff an evidence line argues (P3.4 Cut Coach). */
export type CutSide = "cut" | "keep";

/**
 * Cut Coach phrasing (P3.4) — the cut-direction face of RecommendMeta. Each
 * block phrases a signal whose DATA the sibling declarations already carry:
 * `popularity`/`curve`/`combos` reuse those blocks' sources and predicates
 * (declare cuts.popularity only alongside popularity, etc.); `roles` reads
 * the hub template (adapter.hub.roles) against user tags. The machine is
 * core (src/lib/recommend/cuts.ts): weights, evidence assembly, confidence,
 * and ordering are shared across games — only the sentences live here.
 */
export interface CutsMeta {
  /**
   * Tradeoff phrasing per popularity tier, over the sibling `popularity`
   * source. `side` is the adapter's tier call: "keep" where the data says
   * the card earns its slot (cutting costs the deck something), "cut"
   * beyond. The machine's price signal keys off this side.
   */
  popularity?: {
    evidence(rank: number): { why: string; howOften: string; side: CutSide };
  };
  /** Bucket-overload phrasing over the sibling `curve` template (buckets/bucketOf reused). */
  curve?: {
    evidence(i: { bucketLabel: string; current: number; target: number }): { why: string };
  };
  /**
   * Role-overload phrasing vs the hub template. Counts cover ONLY cards the
   * user tagged with a role label (case-insensitive exact match) — roles are
   * never inferred from card text, and untagged cards get no role evidence.
   */
  roles?: {
    /** Evidence-source slug (editorial, like the curve template). */
    source: string;
    evidence(i: { role: string; tagged: number; target: number }): { why: string };
  };
  /** "Cutting breaks it" phrasing over the sibling `combos` source (complete combos only). */
  combos?: {
    evidence(i: { withNames: string[]; results: string[]; popularity: number | null }): {
      why: string;
      howOften: string | null;
    };
  };
  /**
   * Price-vs-contribution phrasing. The machine fires it only when the
   * card's popularity evidence came back side "cut" (measured weak play)
   * AND cheapestUsd ≥ minUsd — a price with nothing to weigh it against is
   * a fact, not a tradeoff (cold-start rule).
   */
  price?: {
    source: string;
    minUsd: number;
    evidence(i: { usd: string }): { why: string };
  };
}

export interface RecommendMeta {
  /**
   * What CardData.popularity is for this game (MTG: edhrec_rank). Absent =
   * the game has no popularity signal yet — the engine then simply emits no
   * popularity evidence (cold-start rule: a missing signal is missing, never
   * faked with a neutral score).
   */
  popularity?: {
    /** Real data-source name, shown in evidence payloads (e.g. "edhrec_rank"). */
    source: string;
    evidence(rank: number): { why: string; howOften: string };
  };
  /**
   * Editorial target curve — the recommend-side face of the hub template
   * (adapter.hub): bucket counts for a COMPLETE deck's curve slots, using the
   * analytics histogram convention (index = cost, last bucket = "N+"). For
   * MTG these sum with the hub roles' land count to the deck size.
   */
  curve?: {
    source: string;
    buckets: readonly number[];
    /** Which bucket a card fills; null = outside curve logic (lands, no cost). */
    bucketOf(card: CurveCardInput): number | null;
    evidence(i: { bucketLabel: string; current: number; target: number }): { why: string };
  };
  /** Combo participation (MTG: Commander Spellbook). Absent = no combo signal. */
  combos?: {
    source: string;
    evidence(i: {
      withNames: string[];
      results: string[];
      templates: string[];
      popularity: number | null;
    }): { why: string; howOften: string | null };
  };
  /**
   * Display metadata for evidence sources, keyed by the source slugs above
   * (P3.2's panel): human name + optional credit link, so attribution is a
   * game declaration, not a core-side lookup table. Purely presentational —
   * payloads keep carrying the raw slug, and a slug without an entry renders
   * as-is (honest, just unpolished).
   */
  sources?: Readonly<Record<string, { label: string; href?: string }>>;
  /**
   * Cut Coach phrasing (P3.4). Absent = no Cut Coach for this game. Sits
   * inside RecommendMeta (not beside it) because every block scopes to a
   * sibling declaration here — same sources, same tier boundaries, same
   * curve predicate — and the sources display map above covers both
   * directions.
   */
  cuts?: CutsMeta;
  /**
   * Cards that are never advice (MTG: basic lands — "Forest is not advice").
   * Declarative single-segment attrs paths the core translates to SQL
   * (`attrs->>key NOT LIKE pattern`), so adapters stay SQL-free.
   */
  exclude?: readonly { jsonbPath: [string]; likePattern: string }[];
}

// ---------------------------------------------------------------------------
// Optional capabilities (game-exclusive services — absent = feature hidden)
// ---------------------------------------------------------------------------

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

  /**
   * Recommendation signal metadata (P3.1). Absent = no recommendations for
   * this game. Pure data + pure builders; the engine is src/lib/recommend/.
   */
  recommend?: RecommendMeta;

  capabilities: {
    /**
     * Combo data exists for this game (MTG: Commander Spellbook, P2.5).
     * Declarative only — the tables are game-agnostic (combo_pieces →
     * card_identities) and ALL detection IO is core (src/lib/combos/), the
     * searchFields/RecommendMeta seam: adapters declare, core translates.
     * (P3.3 replaced an unimplemented `findForDeck` IO stub with this.)
     * What lives here is only what core can't know: attribution and the
     * per-combo walkthrough deep link — step-by-step lines are deliberately
     * not stored (lean rows), the link IS the credit.
     */
    combos?: {
      /** Display name for credit lines, e.g. "Commander Spellbook". */
      sourceLabel: string;
      /** The data source's home page (credit link). */
      sourceHref: string;
      /** Deep link to one combo's external walkthrough page. */
      externalUrl(externalKey: string): string;
    };
    /** MTG M3: Topdeck.gg. */
    tournaments?: boolean;
  };
}
