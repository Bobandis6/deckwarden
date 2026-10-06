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
  /**
   * Progress, not a problem (Y2a, WAVE4 D2): the deck is merely unfinished —
   * a leader zone under its minimum (empty) or the deck under its minimum
   * size. Still an error for legality (the Warden never approves it); the
   * editor renders flagged issues as one neutral progress line. Client-side
   * only: the cards PUT strips it (`toWireIssues`) so its wire is unchanged.
   */
  progress?: true;
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
  | {
      kind: "table";
      id: string;
      title: string;
      columns: string[];
      rows: (string | number)[][];
      /** One quiet line under the table on how it was counted (Y1). */
      hint?: string;
    };

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

/**
 * A printing-level target (X4a): the set of a card's printings, by the
 * set's code. Its own type, not a FieldTarget variant — every other kind
 * narrows FieldTarget by `"column" in`, and a set is neither an identity
 * column nor a JSONB path. The translator turns it into a bound EXISTS
 * over card_printings and sets (src/lib/search/translate.ts).
 */
export type SetTarget = { printing: "set_code" };

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
  | { key: string; label: string; kind: "colorset"; target: FieldTarget }
  /**
   * One released set, by code (X4a: `set=blb`). Scopes the rows to cards
   * with a live printing in that set, and the search route shows that
   * printing. A game that declares none has no set filter (One Piece).
   */
  | { key: string; label: string; kind: "set"; target: SetTarget };

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
// Brackets (Y3b, WAVE4 D4) — a deck's power-level read
// ---------------------------------------------------------------------------
//
// What the cards prove (a minimum), what only the player can decide (open
// questions) and what couldn't be checked (a missing, stale or switched-off
// source) — never one authoritative number. The read is pure and runs on
// both sides; its IO is core: src/lib/combos/queries.ts loadCompleteCombos
// (the combo facts) and src/lib/brackets/freshness.ts (each source's latest
// successful ingest run). Core names are game-agnostic — `brackets`, a
// "level", `targetLevel`; the word players use is the adapter's `noun`.

/** One combo whose every card piece is in the list (core's loadCompleteCombos). */
export interface CompleteCombo {
  /** The source's id for the combo (Commander Spellbook's variant id) — its walkthrough link. */
  key: string;
  /** Every card piece, identity ids, sorted. */
  cardPieces: string[];
  /** Named non-card requirements: the list alone can't confirm the combo. */
  templates: string[];
  /** The source's own rating of the combo alone; null = not ingested, or a value the adapter doesn't know. */
  tag: string | null;
  /** The source's "relevant" mark (Spellbook: any Standalone result); null = not ingested. */
  relevant: boolean | null;
  /** What it produces, by name. */
  results: string[];
  popularity: number | null;
}

/** One source's latest successful ingest run — core loads it, the adapter reads `stats`. */
export interface IngestRunFacts {
  source: string;
  id: number;
  /** ISO date-time. */
  startedAt: string;
  stats: unknown;
}

/** How usable one evidence feed is, as the adapter judges it from the runs. */
export interface FeedFreshness {
  /** ok = usable · stale = not refreshed within the adapter's window · missing = never recorded · off = switched off */
  state: "ok" | "stale" | "missing" | "off";
  /** When the feed last refreshed (ISO date-time); null when missing or off. */
  asOf: string | null;
  /** A source detail worth showing ("53 cards", "bulk 7.1.3"). */
  detail?: string;
}

export interface BracketFreshness {
  /** When the runs were read (ISO) — what "stale" is measured against. */
  readAt: string;
  /** Keyed by the adapter's feed names. */
  feeds: Record<string, FeedFreshness>;
}

export type BracketAnswer = "yes" | "no" | "unsure";

/** The player's answers (Y4b keeps them in decks.goals). They only ever raise the read. */
export interface BracketAnswers {
  /** The ruleset version they were given under; a newer ruleset flags them, never drops them. */
  rulesetVersion: number;
  /** "How it plays", keyed by the adapter's question keys. */
  play?: Readonly<Record<string, BracketAnswer>>;
  /** The read's open questions, keyed by their ids. */
  calls?: Readonly<Record<string, BracketAnswer>>;
}

export interface BracketInput<A = Record<string, unknown>> {
  deck: DeckSnapshot;
  /** Same map validate/analyze take — legality pre-filtered by the core. */
  cards: ReadonlyMap<string, CardData<A>>;
  /** The list's complete combos; null = not loaded or couldn't load — the read says so. */
  combos: readonly CompleteCombo[] | null;
  /** null = couldn't load: every feed reads "Couldn't check". */
  freshness: BracketFreshness | null;
  /** The player's declared level. It never changes the read; it only names the conflicts. */
  targetLevel?: number | null;
  answers?: BracketAnswers | null;
}

/**
 * blocked = a banned or not-legal card (the read needs a legal list) ·
 * draft = under the format's minimum (what's found so far stays listed) ·
 * unavailable = something couldn't be checked, so `minimum` is only a floor ·
 * review = a question only the player can answer could raise it · read.
 * That is also the precedence.
 */
export type BracketStatus = "draft" | "read" | "review" | "blocked" | "unavailable";

export interface BracketFactor {
  /** Stable key (lists, tests). */
  id: string;
  /** One plain sentence: what the cards show, or what couldn't be checked. */
  sentence: string;
  /** The cards behind it (identity ids, name order); empty for a "Couldn't check" line. */
  cards: string[];
  /** The named source. */
  source: string;
  /** The lowest level this evidence allows; null = couldn't check. */
  atLeast: number | null;
  /** What would change it ("Remove Rhystic Study and Cyclonic Rift to fit Bracket 2."). */
  change: string | null;
  /** The combo's key when the factor is one combo. */
  combo?: string;
}

export interface BracketQuestion {
  /** Stable across ordinary edits — answers key on it. */
  id: string;
  question: string;
  /** Why it's asked, in plain words. */
  because: string;
  cards: string[];
  source: string;
  /** The level a "yes" means. */
  raisesTo: number;
  /** The player's answer, when given. */
  answer: BracketAnswer | null;
  combo?: string;
}

export interface BracketRead {
  status: BracketStatus;
  /** The lowest level the cards prove — 1 when nothing is flagged. */
  minimum: number;
  /** The level the cards and the answers point to; null until something is answered. */
  suggested: number | null;
  factors: BracketFactor[];
  /** What the read assumes, in plain words (fixed text, the dates from ingest). */
  assumptions: string[];
  /** Questions whose "yes" would raise the read above `minimum` (answered ones included). */
  review: BracketQuestion[];
  /** Cards that block the read: banned, or not legal in the format. */
  blockedBy: string[];
  /** Factor ids above the declared target — the target never hides them. */
  conflicts: string[];
  ruleset: { version: number; asOf: string };
  /** Answers given under an older ruleset: still applied, flagged for a second look. */
  answersStale: boolean;
}

/** What the deck pane's bracket line (Y4a) knows beside the read itself. */
export interface BracketLineContext<A = Record<string, unknown>> {
  /** The snapshot the read was assessed from. */
  deck: DeckSnapshot;
  cards: ReadonlyMap<string, CardData<A>>;
  /**
   * A draft's progress, in core's words ("add 34 more cards" —
   * src/lib/decks/progress.ts owns the phrase); null when not a draft.
   */
  progress: string | null;
  /**
   * The player's declared level (Y4b, decks.goals.targetLevel); null or
   * absent = not set. The line shows it beside the read, never instead of it.
   */
  targetLevel?: number | null;
  /**
   * Who the line speaks to (Y5): "owner" (the editor — "Your target …",
   * "your answers", "your call"; the default) or "table" (the share page,
   * read by the pod — "Played as …", "the owner's answers", "the owner's
   * call"). Same read, same facts; only the person changes.
   */
  voice?: "owner" | "table";
}

/**
 * One evidence row of "At the table" (Y5, WAVE4 D6) — "Game Changers
 * (Wizards' list): Rhystic Study, Cyclonic Rift". The adapter's words; core
 * renders the names (CardNamePreview on the page) and joins them in the
 * copied text.
 */
export interface BracketTableRow {
  /** Stable key (lists, tests). */
  id: string;
  /** The row's name with its source: "Game Changers (Wizards' list)". */
  label: string;
  /** Each item's card ids — one card, or a combo's pieces (joined with " + "). */
  items: string[][];
  /** What the row says with no items: "none", "none found", or that it couldn't check. */
  empty: string;
}

/**
 * A game's power-level read (Y3b). Optional — a game without it shows no
 * bracket anywhere, with no apology copy (One Piece declares none).
 */
export interface BracketsMeta<A = Record<string, unknown>> {
  /** The word players use for a level ("bracket"). */
  noun: string;
  /** The levels, lowest first — `targetLevel`'s range and the names a read quotes. */
  levels: readonly { level: number; name: string }[];
  /** The ruleset the read applies; answers record `version`. */
  ruleset: { version: number; asOf: string };
  /**
   * "How it plays" — the questions whose answers raise `suggested`, by key.
   * `table` (Y5) says a yes or a no to the pod, under its own label: "Pace
   * (owner): doesn't usually win before turn 6".
   */
  questions: readonly {
    key: string;
    question: string;
    table?: { label: string; yes: string; no: string };
  }[];
  /**
   * The Why sheet's table-exceptions line, by example (Y4b) — "e.g. one
   * thematic Game Changer, ask me". The adapter's words: core names no
   * card kind.
   */
  exceptionsHint: string;
  /** ingest_runs sources whose latest successful run the freshness loader reads. */
  freshnessSources: readonly string[];
  /** Pure: those runs → each evidence feed's freshness, as of `readAt`. */
  freshness(runs: readonly IngestRunFacts[], readAt: string): BracketFreshness;
  /** Pure: the read. */
  assess(input: BracketInput<A>): BracketRead;
  /**
   * Pure: the read in one line (Y4a, WAVE4 D5) — "At least Bracket 3
   * (Upgraded)", "Bracket 3 or 4 — one combo is your call", "Bracket: add 34
   * more cards · 1 Game Changer so far". The adapter's words, like the read's
   * sentences; core adds "Why?" and its own lines while the combo facts load
   * or fail.
   */
  line(read: BracketRead, ctx: BracketLineContext<A>): string;
  /**
   * Pure: "At the table"'s evidence rows (Y5, WAVE4 D6), each with its
   * named source — what the pod should know before the game. Never empty
   * where a feed couldn't be checked: the row says so.
   */
  table(read: BracketRead): BracketTableRow[];
  /** The copied text's closing line: what the read reads, and its combo source. */
  tableNote: string;
  /** Where the Why sheet links (Y4a): the rules' own page, and an evidence line's source by its id. */
  links: {
    rules: { label: string; href: string };
    /** A factor's or question's source page by its id; null = none (a combo links its walkthrough instead). */
    source(id: string): string | null;
  };
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
     * The official precon lists to start from (Y2b, WAVE4 D2): the "Start
     * from a precon" door on /decks/new and in the empty draft —
     * "/precons" · "Start from a precon" for Magic. Absent = no door (One
     * Piece has no precon data).
     */
    preconBrowse?: { href: string; label: string };
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

  /**
   * The power-level read (Y3b, WAVE4 D4). Absent = no bracket anywhere for
   * this game. Pure data + pure functions; the IO is core.
   */
  brackets?: BracketsMeta<A>;

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
