/**
 * Drizzle schema v1 — card data + ingest bookkeeping.
 *
 * Every §4 decision of deckwarden-build-plan.md lives here (SQL sketches in Appendix A).
 * Design inputs, in order of weight:
 *   1. Neon free tier ~0.5GB: lean rows, no raw Scryfall JSON, no stored MTG image
 *      URLs (derived from printing id; `image_override` for the rare mismatch),
 *      current prices only.
 *   2. Identity vs printing: decks reference identities; printings are physical versions.
 *   3. Search tiers: promoted btree columns → one jsonb_path_ops GIN → (later) expression idx.
 *   4. Dated legality, exceptions only: formats carry a default; `legalities` holds
 *      validity intervals (`effective_to IS NULL` = in force).
 *
 * Deck tables (P1.1, §4 "Decks"): live relational `deck_cards` for the current
 * list + frozen JSONB snapshots in `deck_versions` (provisioned now, used M3).
 * Guest decks are server-side anonymous rows: user_id NULL + claim_token
 * (returned exactly once at create), created_ip for spam control.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/** Postgres `tsvector`; Drizzle has no built-in, so a custom type is declared. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

// ---------------------------------------------------------------------------
// Reference tables
// ---------------------------------------------------------------------------

/** One row per supported game. Ids are fixed by seed: 1 mtg, 2 optcg, 3 azuki. */
export const games = pgTable("games", {
  id: smallint("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
});

/** Card sets / expansions. `code` is the game's own set code (mtg: scryfall set code). */
export const sets = pgTable(
  "sets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    releasedAt: date("released_at"),
    setType: text("set_type"),
    /** Digital-only (Arena/MTGO) sets never win default-printing selection. */
    digital: boolean("digital").notNull().default(false),
  },
  (t) => [unique("sets_game_code").on(t.gameId, t.code)],
);

/**
 * Play formats. `defaultLegality` is what a card is when `legalities` has no row
 * for it — so the legalities table stores exceptions only.
 */
export const formats = pgTable(
  "formats",
  {
    id: smallint("id").primaryKey(),
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    defaultLegality: text("default_legality").notNull().default("not_legal"),
  },
  (t) => [
    unique("formats_game_code").on(t.gameId, t.code),
    check(
      "formats_default_legality_check",
      sql`${t.defaultLegality} in ('legal','banned','restricted','not_legal')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/**
 * The gameplay object (name, cost, colors, rules). mtg: one per oracle_id.
 * Decks reference these — never printings — so alt art can't become a phantom card.
 */
export const cardIdentities = pgTable(
  "card_identities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    /** mtg: scryfall oracle_id; optcg: 'OP01-001'; azuki: slug */
    externalKey: text("external_key").notNull(),
    name: text("name").notNull(),
    /** App-normalized (src/lib/cards/normalize.ts): lower, deaccented, '//' faces folded. */
    nameNorm: text("name_norm").notNull(),
    /** Leader candidates only; powers hub URLs. */
    slug: text("slug"),
    /** 'Creature' / 'Character' / 'Entity' — promoted cross-game filter. */
    primaryType: text("primary_type"),
    /** mana value / OP cost / IKZ */
    costValue: smallint("cost_value"),
    /** Bitmask W1 U2 B4 R8 G16 C32 (other games reuse bits). */
    colorsMask: smallint("colors_mask").notNull().default(0),
    /** Color identity, same bitmask. Fit test: (ci_mask & ~commanderCi) = 0. */
    ciMask: smallint("ci_mask").notNull().default(0),
    isLeaderCandidate: boolean("is_leader_candidate").notNull().default(false),
    /** mtg: edhrec_rank (lower = more popular). Post-pass denorm. */
    popularity: integer("popularity"),
    /** Post-pass denorm: min usd across non-removed printings. */
    cheapestUsd: numeric("cheapest_usd", { precision: 10, scale: 2 }),
    isPreview: boolean("is_preview").notNull().default(false),
    /** Soft delete — decks may still reference the row. */
    isRemoved: boolean("is_removed").notNull().default(false),
    /** Game-specific fields, numerics pre-normalized at ingest (e.g. power_num). */
    attrs: jsonb("attrs").notNull().default({}),
    searchText: tsvector("search_text").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('english', name || ' ' || coalesce(attrs->>'type_line','') || ' ' || coalesce(attrs->>'oracle_text',''))`,
    ),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [
    unique("card_identities_game_external_key").on(t.gameId, t.externalKey),
    index("ci_search_gin").using("gin", t.searchText),
    index("ci_name_trgm").using("gin", t.nameNorm.op("gin_trgm_ops")),
    index("ci_attrs_gin").using("gin", t.attrs.op("jsonb_path_ops")),
    index("ci_browse").on(t.gameId, t.primaryType, t.costValue),
    index("ci_leaders")
      .on(t.gameId, t.popularity)
      .where(sql`${t.isLeaderCandidate}`),
    uniqueIndex("ci_slug")
      .on(t.gameId, t.slug)
      .where(sql`${t.slug} is not null`),
  ],
);

/**
 * Physical versions of an identity. mtg: `id` IS the scryfall card id, which is
 * what lets image URLs be derived instead of stored.
 */
export const cardPrintings = pgTable(
  "card_printings",
  {
    id: uuid("id").primaryKey(),
    cardIdentityId: uuid("card_identity_id")
      .notNull()
      .references(() => cardIdentities.id),
    /** Denorm of the identity's game. */
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    setId: integer("set_id")
      .notNull()
      .references(() => sets.id),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity"),
    finishes: text("finishes").array().notNull().default([]),
    hasBack: boolean("has_back").notNull().default(false),
    /** NULL when the scryfall CDN URL pattern holds; ingest sample-verifies. */
    imageOverride: jsonb("image_override"),
    /** Denorm from set for "newest printing" sorts. */
    releasedAt: date("released_at"),
    isDefault: boolean("is_default").notNull().default(false),
    /** CURRENT prices only: {"usd":"1.23","usd_foil":...}. No history table, by design. */
    prices: jsonb("prices"),
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
    /** md5 over card fields EXCLUDING prices — unchanged cards cost nothing on re-ingest. */
    contentHash: text("content_hash"),
    isRemoved: boolean("is_removed").notNull().default(false),
    seenAt: timestamp("seen_at", { withTimezone: true }),
  },
  (t) => [
    index("cp_by_identity").on(t.cardIdentityId, t.releasedAt.desc()),
    uniqueIndex("cp_default_one")
      .on(t.cardIdentityId)
      .where(sql`${t.isDefault}`),
    index("cp_by_set").on(t.setId, t.collectorNumber),
  ],
);

// ---------------------------------------------------------------------------
// Legality (exceptions only, as validity intervals)
// ---------------------------------------------------------------------------

export const LEGALITY_STATUSES = ["legal", "banned", "restricted", "not_legal"] as const;
export type LegalityStatus = (typeof LEGALITY_STATUSES)[number];

export const legalities = pgTable(
  "legalities",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    formatId: smallint("format_id")
      .notNull()
      .references(() => formats.id),
    cardIdentityId: uuid("card_identity_id")
      .notNull()
      .references(() => cardIdentities.id),
    status: text("status").$type<LegalityStatus>().notNull(),
    /**
     * NULL = unconditional. Only the game adapter interprets conditions, e.g.
     * OP pair bans: {"type":"banned_with_leader","leaderIds":[...]}.
     */
    condition: jsonb("condition"),
    effectiveFrom: date("effective_from").notNull(),
    /** NULL = currently in force. */
    effectiveTo: date("effective_to"),
    /** 'scryfall' | 'bandai:2026-07-01' | 'manual' */
    source: text("source"),
    note: text("note"),
  },
  (t) => [
    check(
      "legalities_status_check",
      sql`${t.status} in ('legal','banned','restricted','not_legal')`,
    ),
    index("leg_current")
      .on(t.formatId, t.cardIdentityId)
      .where(sql`${t.effectiveTo} is null`),
    uniqueIndex("leg_current_uncond")
      .on(t.formatId, t.cardIdentityId)
      .where(sql`${t.effectiveTo} is null and ${t.condition} is null`),
  ],
);

// ---------------------------------------------------------------------------
// Auth (P2.1) — Better Auth owns these tables
// ---------------------------------------------------------------------------
//
// Column set mirrors better-auth 1.7.2's canonical schema (core/src/db/
// get-tables.ts) exactly — the adapter looks fields up by TS property name, so
// property names are better-auth's field names while DB names follow house
// snake_case. Ids are uuid so decks.user_id can be a real FK; in generateId:
// "uuid" mode (src/lib/auth.ts) better-auth omits ids on insert and relies on
// these gen_random_uuid() defaults. OAuth-only (Discord + Google): no email
// stack, and accounts.password stays NULL forever — kept because better-auth's
// column set isn't ours to prune.

/** One row per person. `email` comes from the OAuth provider (stored — privacy page says so). */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /**
   * Profile slug for /u/[username] (P2.2). Ours, not better-auth's (no
   * username plugin — OAuth-only login): nullable until chosen, stored
   * lowercase-only (username.ts validates), so plain UNIQUE is case-safe.
   * Choosing one is the opt-in that makes name/avatar publicly browsable.
   */
  username: text("username").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** One row per linked OAuth identity; `issuer` is better-auth's provider namespace key. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("accounts_issuer_account").on(t.issuer, t.accountId),
    index("accounts_user").on(t.userId),
  ],
);

/** Short-lived OAuth state/nonce storage; better-auth expires rows itself. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Decks (P1.1)
// ---------------------------------------------------------------------------

export const DECK_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type DeckVisibility = (typeof DECK_VISIBILITIES)[number];

/**
 * Deck folders (P2.2) — the shareable-folder-URL feature (§7: a known
 * Moxfield gap, "one table + one page"). Account-only: guests organize
 * nothing (their local list is proof-of-token, not storage). A deck lives in
 * at most one folder (decks.folder_id below) — directory semantics, which is
 * what "organize my decks" means and keeps this to one table. Same
 * visibility triad as decks; public folders appear on the owner's profile,
 * unlisted ones only via /f/[publicId]. Game-agnostic on purpose (a folder
 * may mix MTG and, come M4, One Piece decks).
 */
export const deckFolders = pgTable(
  "deck_folders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Slug for /f/[publicId] share URLs; same generator as decks.public_id. */
    publicId: text("public_id").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility").$type<DeckVisibility>().notNull().default("unlisted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("deck_folders_visibility_check", sql`${t.visibility} in ('public','unlisted','private')`),
    index("deck_folders_owner").on(t.userId),
    /** Case-insensitive per-user name uniqueness — duplicate folders are only ever confusion. */
    uniqueIndex("deck_folders_owner_name").on(t.userId, sql`lower(${t.name})`),
  ],
);

/**
 * One row per deck. `user_id` references Better Auth's users table (P2.1);
 * NULL = anonymous (guest-built). `claim_token` authenticates guest writes
 * and is NULLed on claim.
 */
export const decks = pgTable(
  "decks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Short slug for share URLs (P1.7); generated app-side at create. */
    publicId: text("public_id").notNull().unique(),
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    formatId: smallint("format_id")
      .notNull()
      .references(() => formats.id),
    userId: uuid("user_id").references(() => users.id),
    /** Held in the guest's localStorage; returned ONCE at create, never queryable again. */
    claimToken: uuid("claim_token"),
    /** Anon spam control (rate limits + purge policy). */
    createdIp: inet("created_ip"),
    name: text("name").notNull().default("Untitled"),
    description: text("description"),
    /**
     * Long-form primer (P2.7), deliberately separate from `description`:
     * description is the short blurb that feeds og:description + JSON-LD
     * (P2.6) and must stay unfurl-sized; notes hold the how-to-pilot essay
     * and render only on the share page. Length capped in zod, not here.
     */
    notes: text("notes"),
    /**
     * Default unlisted (Appendix A): share links must work out of the box —
     * unlisted = reachable only via the unguessable public_id, not browsable.
     * (Was private until share pages existed; P1.7 flipped it as planned.)
     */
    visibility: text("visibility").$type<DeckVisibility>().notNull().default("unlisted"),
    /** Command-zone denorm (2 entries = partners); powers "decks for commander X". */
    leaderIds: uuid("leader_ids").array().notNull().default([]),
    /** Deck color identity = OR of the leaders' ci_mask. */
    ciMask: smallint("ci_mask").notNull().default(0),
    /**
     * At most one folder per deck (P2.2); NULL = unfiled. SET NULL on folder
     * delete — deleting a folder must never delete decks. Assignment is
     * account-only: the API rejects folder_id on guest decks (user_id NULL).
     */
    folderId: uuid("folder_id").references(() => deckFolders.id, { onDelete: "set null" }),
    forkedFromDeckId: uuid("forked_from_deck_id").references((): AnyPgColumn => decks.id),
    currentVersion: integer("current_version").notNull().default(0),
    likesCount: integer("likes_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("decks_visibility_check", sql`${t.visibility} in ('public','unlisted','private')`),
    index("decks_hub").using("gin", t.leaderIds),
    index("decks_browse").on(t.gameId, t.formatId, t.visibility, t.updatedAt.desc()),
    index("decks_owner").on(t.userId, t.updatedAt.desc()),
    index("decks_folder").on(t.folderId, t.updatedAt.desc()),
    /** Home "recent public decks" rail (P2.3): cross-game, so decks_browse's game-first prefix can't serve it. */
    index("decks_recent_public")
      .on(t.updatedAt.desc())
      .where(sql`${t.visibility} = 'public'`),
  ],
);

/**
 * The live card list — the only shape relational queries ever need
 * ("public decks containing X", hub aggregation). History lives in
 * deck_versions as JSONB and never needs joins.
 */
export const deckCards = pgTable(
  "deck_cards",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    /** Adapter-defined ZoneDef id ('commander','main' / 'leader','main'); validated at the API. */
    zone: text("zone").notNull(),
    cardIdentityId: uuid("card_identity_id")
      .notNull()
      .references(() => cardIdentities.id),
    quantity: smallint("quantity").notNull().default(1),
    /** Chosen alt-art; NULL = the identity's default printing. */
    printingId: uuid("printing_id").references(() => cardPrintings.id),
    /** User categories {'Ramp','Draw'} — free text, adapter-agnostic. */
    tags: text("tags").array().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.zone, t.cardIdentityId] }),
    index("dc_by_card").on(t.cardIdentityId),
  ],
);

/**
 * Likes (P2.3) — the public "n people liked this" signal. Session-only (a
 * like is an account action; guests see counts but can't vote). PK makes the
 * toggle idempotent; decks.likes_count (provisioned P1.1) is the read-side
 * denorm and is adjusted in the same transaction as every insert/delete
 * (src/lib/decks/engagement.ts). Liking never touches decks.updated_at —
 * other people's clicks must not bump a deck up "recently updated" rails.
 */
export const deckLikes = pgTable(
  "deck_likes",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.userId] }),
    /** "decks I liked" listings + the user-delete cascade path. */
    index("deck_likes_user").on(t.userId, t.createdAt.desc()),
  ],
);

/**
 * Bookmarks (P2.3) — private "find this again" saves, surfaced only on the
 * owner's /account. No count denorm on purpose: nobody but the bookmarker
 * ever sees them, so there is nothing to display publicly.
 */
export const deckBookmarks = pgTable(
  "deck_bookmarks",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.userId] }),
    /** The /account "Bookmarks" list reads newest-first by owner. */
    index("deck_bookmarks_user").on(t.userId, t.createdAt.desc()),
  ],
);

/** Frozen snapshots for history/versioning (M3 feature; provisioned now, no migration later). */
export const deckVersions = pgTable(
  "deck_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    note: text("note"),
    /** Frozen [{cardId, zone, qty, tags, printingId}]. */
    cards: jsonb("cards").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("deck_versions_deck_version").on(t.deckId, t.version)],
);

// ---------------------------------------------------------------------------
// Combos (P2.5) — Commander Spellbook
// ---------------------------------------------------------------------------

/**
 * One row per Commander Spellbook *variant* (a concrete card set that
 * combos; MIT-licensed bulk export, re-ingested nightly). Lean by design
 * (Neon budget): pieces + produced-result names + popularity only — no
 * steps/prerequisites prose and no raw API JSON; pages link to the
 * Spellbook combo page for the walkthrough. Pure derived card data that
 * nothing else references, so the ingest sweep hard-DELETEs stale rows
 * instead of soft-deleting.
 */
export const combos = pgTable("combos", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  /** Spellbook variant id, e.g. '513-5034--46' (its card ids + template ids). */
  externalKey: text("external_key").notNull().unique(),
  /** Card pieces (= combo_pieces rows). Template requirements are on top. */
  pieceCount: smallint("piece_count").notNull(),
  /** Variant color identity (house bitmask; colorless = 0, never the C bit). */
  ciMask: smallint("ci_mask").notNull().default(0),
  /** Produced effect names; Spellbook's internal utility-tier features dropped. */
  results: text("results").array().notNull().default([]),
  /** Generic non-card requirements by name ('Permanent Castable for {C}'). */
  templates: text("templates").array().notNull().default([]),
  /** Spellbook popularity (EDHREC deck count). Display order: DESC NULLS LAST. */
  popularity: integer("popularity"),
});

/** The pieces of a combo. "Combos using card X" starts at combo_pieces_by_card. */
export const comboPieces = pgTable(
  "combo_pieces",
  {
    comboId: bigint("combo_id", { mode: "number" })
      .notNull()
      .references(() => combos.id, { onDelete: "cascade" }),
    cardIdentityId: uuid("card_identity_id")
      .notNull()
      .references(() => cardIdentities.id),
  },
  (t) => [
    primaryKey({ columns: [t.comboId, t.cardIdentityId] }),
    /** Card pages, hub shelves, and M3's Combo Radar all enter through this. */
    index("combo_pieces_by_card").on(t.cardIdentityId),
  ],
);

// ---------------------------------------------------------------------------
// Tournaments (P3.5) — Topdeck.gg
// ---------------------------------------------------------------------------

/**
 * One row per kept tournament (P3.5, plan §5 "Topdeck.gg"). Game-agnostic on
 * purpose — M4's Limitless line wants exactly this shape — so `source` scopes
 * `external_key` ('topdeck' + TID today; 'limitless' later) and every row
 * carries game_id/format_id like everything else. The event deep link is
 * derived from (source, external_key) by the adapter capability
 * (`capabilities.tournaments.eventUrl`), never stored.
 *
 * Kept bounds (disclosed on the shelf): events with ≥ 16 players, standings
 * to placement ≤ 16 ("top-16 lists" — the plan's own top-X phrase, at
 * EDHTop16's conventional X). Neon math at those bounds: a tournament row is
 * ~120B + indexes (~300B all-in); a standings row ~130B + GIN/btree (~250B
 * all-in). Even at 200 kept events/week × 16 standings for a 180-day
 * backfill (≈5.2k events, 83k standings) that is ~1.6MB + ~21MB against the
 * 350MB alert line (203.9MB measured 2026-08-31) — and real EDH volume at
 * the ≥16-player floor is expected well under that.
 */
export const tournaments = pgTable(
  "tournaments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    gameId: smallint("game_id")
      .notNull()
      .references(() => games.id),
    formatId: smallint("format_id")
      .notNull()
      .references(() => formats.id),
    /** Data source: 'topdeck' (M4: 'limitless'). */
    source: text("source").notNull(),
    /** Source's own event id (topdeck TID) — dedupe key + deep-link handle. */
    externalKey: text("external_key").notNull(),
    name: text("name").notNull(),
    /** Event date (source-reported start, UTC). Windowing uses ingest_runs, not this. */
    startDate: date("start_date").notNull(),
    playerCount: smallint("player_count").notNull(),
    /** Source-reported top cut size, when stated. */
    topCut: smallint("top_cut"),
  },
  (t) => [
    unique("tournaments_source_key").on(t.source, t.externalKey),
    /** Hub shelves and any future "recent events" rail read newest-first per game. */
    index("tournaments_game_date").on(t.gameId, t.startDate.desc()),
  ],
);

/**
 * One row per kept standing (placement ≤ 16). `leader_ids` mirrors the
 * decks.leader_ids precedent — a uuid[] of card_identities ids (2 entries =
 * partners) under a GIN index, so "top finishes for commander X" is the same
 * `@>` containment query hubs already run against decks_hub. Names resolve
 * at ingest via normalizeCardName against name_norm EXACTLY (never trgm — a
 * fuzzy wrong-card match would poison every shelf silently); unresolved
 * standings are skipped with a counted reason, spellbook-style. Card-level
 * lists are deliberately NOT stored (lean rows): `decklist_url` links out
 * when the source carries one.
 */
export const tournamentStandings = pgTable(
  "tournament_standings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    /** 1-based final placement — the merge key within an event. */
    placement: smallint("placement").notNull(),
    /** Public standings name as the source published it; display-only. */
    playerName: text("player_name"),
    /** Resolved commander identity ids (1–2, sorted for deterministic rows). */
    leaderIds: uuid("leader_ids").array().notNull(),
    /** External decklist link when the source carries a URL (Moxfield etc.); never fetched. */
    decklistUrl: text("decklist_url"),
    wins: smallint("wins"),
    draws: smallint("draws"),
    losses: smallint("losses"),
  },
  (t) => [
    unique("tournament_standings_event_place").on(t.tournamentId, t.placement),
    index("ts_by_leader").using("gin", t.leaderIds),
  ],
);

// ---------------------------------------------------------------------------
// Rate limiting (P1.8)
// ---------------------------------------------------------------------------

/**
 * Fixed-window counters for anon-write rate limits (P1.8). Postgres-backed by
 * portability rule: per-instance memory dies on serverless and Redis stays in
 * LATER.md until a measured problem. One upsert per limited request; stale
 * windows are swept by the nightly purge script.
 */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    /** e.g. 'deck-create:ip:1.2.3.4' — route scope + principal. */
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------------------------------------------------------------------------
// Ingest bookkeeping
// ---------------------------------------------------------------------------

export const INGEST_STATUSES = ["running", "succeeded", "failed"] as const;
export type IngestStatus = (typeof INGEST_STATUSES)[number];

/** One row per ingest run; `stats` carries counts, duration, and pg_database_size(). */
export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** 'scryfall' | 'spellbook' | 'topdeck' | 'punk-records' */
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<IngestStatus>().notNull().default("running"),
    stats: jsonb("stats").notNull().default({}),
    error: text("error"),
  },
  (t) => [
    check("ingest_runs_status_check", sql`${t.status} in ('running','succeeded','failed')`),
    index("ingest_runs_source_started").on(t.source, t.startedAt.desc()),
  ],
);
