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
  /** Opening-hand size for the sample-hand widget (Commander 7; OP 5). */
  openingHandSize: number;
}

// ---------------------------------------------------------------------------
// Card data (the shape the core hands to adapters — already fetched, no IO)
// ---------------------------------------------------------------------------

export interface LegalityEntry {
  status: "legal" | "banned" | "restricted" | "not_legal";
  /**
   * NULL/absent = unconditional. Only the game adapter interprets conditions
   * (e.g. OP pair bans); the core just fetches rows.
   *
   * `banned_with` (P4.2): Bandai's pair bans are symmetric card+card ("Card A
   * and Card B cannot be included in the same deck") — one live pair has no
   * leader side at all — so the condition names partner cards by external_key
   * (readable, dump/restore-stable) and is stored mirrored on both cards.
   */
  condition?: { type: "banned_with"; cardIds: string[] } | { type: string; [k: string]: unknown };
}

export interface CardData<A = Record<string, unknown>> {
  id: string;
  name: string;
  /**
   * Stable per-game key (MTG: oracle uuid; OP: the card number "OP01-025").
   * On the wire since P4.2 — OP pair-ban conditions reference partners by it.
   */
  externalKey: string;
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
      /**
       * Optional editorial target per bucket (R6, G9): drawn as an outline
       * behind the bars — same length and order as `buckets`, scaled on the
       * same max so a target never overflows a small deck's track — and
       * named by `label` in a visible legend. Computed in-process by the
       * adapter like the rest of the block; never on the wire.
       */
      target?: { label: string; values: readonly number[] };
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
   * Tournament-share tradeoff phrasing over the sibling `tournaments`
   * declaration (P3.11 — the cut side of the same aggregate, same evidence
   * input). `side` is the adapter's share-tier call: a meaningful share is
   * a keep warning (the play record is what cutting costs), a thin one
   * argues the slot is cheap by measured play. The machine fires it only
   * for cards MEASURED against the set's aggregate — a missing signal
   * stays missing, never a fabricated zero.
   */
  tournaments?: {
    evidence(i: {
      commanderNames: string[];
      lists: number;
      ofLists: number;
      share: number;
      top4: number;
      since: string | null;
    }): { why: string; howOften: string; side: CutSide };
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

/**
 * Starter-shell autofill declaration (W9a) — pure data + pure functions the
 * core planner (src/lib/recommend/autofill.ts) consumes. Optional: a game
 * without it has no autofill (the route answers 400 — One Piece's whole
 * deliverable). NO roles anywhere by owner decision (2026-09-19): only
 * color identity, type, cost, popularity, tournament data and combos.
 */
export interface AutofillMeta {
  /** The non-curve base group (MTG: the 37-land template). */
  base: {
    /** Group label the review sheet renders ("Lands"). */
    label: string;
    /** Evidence source slug for template-filled picks ("land-template"). */
    source: string;
    /** Template size for a complete deck (MTG: 37). */
    count: number;
    /**
     * Candidate scope for the base pool, threaded to the query layer's
     * whitelisted CandidateFilter.scope; the curve pool runs the negation.
     */
    scope: { column: "primary_type"; op: "eq"; value: string };
    /** Whether a kept/picked card counts against the base template. */
    isBase(card: CurveCardInput): boolean;
    /**
     * How many base slots ranked (non-filler) cards may take, indexed by
     * popcount of the deck's color identity (clamped to the last entry).
     * MTG: [6, 8, 16, 22, 26, 28] — mono decks want mostly basics.
     */
    rankedByColorCount: readonly number[];
    /** Cap on ranked base picks with colorless identity (five-color staples). */
    maxColorlessIdentity: number;
    /** Names the core pre-loads for `fillers` resolution (MTG: the basics). */
    fillerNames: readonly string[];
    /**
     * Split `n` filler slots across the declared names from the deck's
     * color identity and the chosen nonbase cards' cost texts (pip counts).
     * Pure and deterministic; `why` is the pick's template evidence.
     */
    fillers(i: {
      ciMask: number;
      n: number;
      costTexts: readonly string[];
    }): { name: string; qty: number; why: string }[];
  };
  /**
   * Tournament lock tier: a candidate played in ≥ lockShare of the set's
   * lists, itself measured in ≥ lockMinLists lists, is picked in rank order
   * before any sampling. lockShare must reference the game's staple-share
   * pin, never a second literal.
   */
  lockShare: number;
  lockMinLists: number;
  /** Cost-text accessor for `fillers` (MTG: attrs.mana_cost). */
  costTextOf(attrs: Record<string, unknown>): string | null;
  /** Review-sheet group label for a curve bucket ("Mana value 2"). */
  curveLabel(bucketLabel: string): string;
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
   * Tournament play with the deck's EXACT commander set (P3.8 — MTG: the
   * commander×card aggregate mined from Topdeck top-16 lists). Absent = no
   * tournament signal for this game. Honest absence at the data level too:
   * a commander set with no aggregated lists gets NO tournament evidence and
   * no tournament-sourced candidates — never a fabricated neutral score.
   * The `sources` entry for this slug carries the REQUIRED visible credit
   * (label + link rendered with every evidence entry — the plan's hard
   * attribution rule for tournament data).
   */
  tournaments?: {
    source: string;
    evidence(i: {
      /** The deck's commander names, display order. */
      commanderNames: string[];
      /** Lists with this commander set that played the card. */
      lists: number;
      /** All aggregated lists with this commander set (the denominator). */
      ofLists: number;
      /** lists / ofLists, in [0, 1]. */
      share: number;
      /** Of `lists`, how many placed in the top 4. */
      top4: number;
      /** ISO date of the set's first aggregated event; null = unknown. */
      since: string | null;
    }): { why: string; howOften: string };
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
   * Starter-shell autofill (W9a). Optional pure declaration — implemented
   * only where the data supports it (MTG); absent = no autofill door, 400
   * from the API, no apology copy.
   */
  autofill?: AutofillMeta;
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

  /**
   * Route an imported card to a zone the format's ZoneDefs can't infer from
   * text alone (P4.6): OP Leader-category cards are only ever legal in the
   * leader zone, so a pasted leader line lands there instead of the default
   * zone. Return null to keep the default routing. Absent = default routing
   * (MTG: a card ALONE never promotes — a legendary creature in the 99 is
   * normal; the positional, shape-gated Moxfield guess is importLeaderGuess
   * below, never this per-card hook). Takes the legality-free wire shape —
   * routing is card flavor, not format legality, and the import dialog holds
   * CardWire.
   */
  importZoneFor?(card: Omit<CardData<A>, "legality">): string | null;

  /**
   * Guess leader-zone lines from a paste's SHAPE when no text marks one
   * (P2.8b): Moxfield's plain-text export puts the commander(s) first,
   * unmarked, with the rest alphabetized — return the indexes of the lines
   * to route to the leader zone (usually [] — the guess must be positional
   * AND shape-gated, never card-alone). The core calls it only when no line
   * carries a leader-zone hint, flags the routed items `guessed`, and the
   * review step discloses them before apply; in add mode a guess yields to
   * a deck whose leader zone is already occupied. Cards align with lines
   * (null = unresolved). Absent = no guess (One Piece leaders already route
   * by category via importZoneFor).
   */
  importLeaderGuess?(
    lines: readonly { rawName: string; qty: number; zoneHint?: string; setHint?: string }[],
    cards: readonly (Omit<CardData<A>, "legality"> | null)[],
  ): number[];

  display: {
    /** Mana pips / DON!! cost / IKZ — an HTML string, rendered by the core. */
    costHtml(card: CardData<A>): string;
    /** 'Legendary Creature — Elf' / 'Character — Straw Hat Crew'. */
    subtitle(card: CardData<A>): string;
    /** Rules/effect text for card pages — plain text ("" when none); faces separated by blank lines. */
    bodyText(card: CardData<A>): string;
    /** Small stat suffix ('4/4', loyalty, OP power), or null when not applicable. */
    statLine?(card: CardData<A>): string | null;
    /**
     * Compact numbers for deck ROWS (R3, C15): One Piece's "5000 · +1000"
     * (Power · Counter, units dropped; Life stays on the leader caption via
     * statLine). Absent = rows carry no suffix — Magic's P/T belongs to the
     * detail pane, not to a hundred rows.
     */
    rowStats?(card: CardData<A>): string | null;
    /**
     * Ambient-fallback swatches (R2, G7): the CSS colors a color-identity
     * mask paints behind the builder and the share page when no artwork is
     * on screen — Magic's `--mana-*` variables, One Piece's frame hexes —
     * in the game's display order and never empty (a colorless identity
     * has a neutral of its own). Absent = no gradient for this game.
     */
    colorSwatches?(mask: number): string[];
    defaultGroupBy: "primaryType" | "costValue" | "tags";
    /** 'Commander' / 'Leader'. */
    leaderNoun: string;
    /**
     * The leader index to browse when the leader zone is empty (W4):
     * "/commanders" · "Browse commanders" / "/leaders" · "Browse leaders".
     * Deliberately NOT under `hub` — hub is absent for One Piece and gates
     * template rendering. Absent = the empty zone offers search focus only.
     */
    leaderBrowse?: { href: string; label: string };
    /**
     * Short printed-id chip ("OP15-058") for games whose names don't identify
     * a card (17 printed Enels). Rendered beside names in search results,
     * import suggestions, and the card pane — some of those hold the
     * legality-free wire shape, hence the Omit. Absent = names identify.
     */
    idBadge?(card: Omit<CardData<A>, "legality">): string | null;
    /** Search-box placeholder in the editor — game-true example syntax. */
    searchPlaceholder: string;
    /** Import-dialog textarea placeholder — game-true example lines. */
    importPlaceholder: string;
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
     * Ambient artwork behind the builder and the share page (R2, REDESIGN.md
     * §3). A declared kind resolves through src/lib/cards/art.ts —
     * `art_crop` is Scryfall's crop with the artist credit beside it.
     * Absent = the color-identity gradient only, and no art request is ever
     * made for the game's cards (One Piece; §3 records why).
     */
    ambientArt?: { kind: "art_crop" | "full_card" };
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
    /**
     * Tournament results exist for this game (MTG: Topdeck.gg, P3.5; M4:
     * Limitless). Declarative like `combos`: the tables are game-agnostic
     * (tournaments/tournament_standings → card_identities) and all query IO
     * is core (src/lib/tournaments/) — what lives here is only what core
     * can't know: the REQUIRED visible credit (the plan's risk table makes
     * "Topdeck.gg credit + link wherever tournament data appears" a hard
     * attribution rule) and the event deep link derived from external_key.
     */
    tournaments?: {
      /** Display name for credit lines, e.g. "Topdeck.gg". */
      sourceLabel: string;
      /** The data source's home page (credit link). */
      sourceHref: string;
      /** Deep link to one event's page on the source. */
      eventUrl(externalKey: string): string;
    };
    /**
     * A vendor sells this game's singles (W7: MTG via TCGplayer). Declarative
     * + pure like the rest of this block: the adapter names the vendor and
     * builds line/URL strings, core (src/lib/buy/) assembles Mass Entry links
     * and renders the menus. Links OUT only — no Deckwarden server ever calls
     * the vendor, and premium never gates any of it. The affiliate wrapper is
     * core's concern (NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE, empty on Hobby).
     * Absent = no buy surface renders anywhere for the game (One Piece), with
     * no apology copy.
     */
    buy?: {
      /** Display name for labels, e.g. "TCGplayer". */
      vendor: string;
      /** Mass Entry `productline=` value (live-verified capitalization). */
      productLine: string;
      /** One Mass Entry line, e.g. "33 Mountain" (vendor-parsable name). */
      massEntryLine(card: Omit<CardData<A>, "legality">, qty: number): string;
      /** The vendor's single-card page (name search — printings are LATER). */
      cardUrl(card: Omit<CardData<A>, "legality">): string;
      /** "Without basic lands" membership (D6); absent = nothing skippable. */
      skipByDefault?(card: Omit<CardData<A>, "legality">): boolean;
    };
  };
}
