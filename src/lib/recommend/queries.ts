/**
 * Recommendation data access (P3.1) — the engine's ONE batched IO layer
 * (hub/queries.ts style): a handful of set-based queries, no N+1, reading
 * only existing tables (card_identities popularity/prices, legalities, and
 * combos via the shared detection layer in combos/queries.ts) — no
 * migration. Game specifics arrive as parameters (numeric
 * game/format ids off the deck row, the adapter's declarative exclude
 * rules); nothing here imports a game module.
 *
 * The deterministic candidate filter lives here as ONE condition builder
 * shared by both entry points (popularity pool + combo-candidate recheck),
 * so "legal / color-fit / budget / not-in-deck" cannot drift apart.
 *
 * Swap Lab (Y7a, WAVE4 D8) narrows the same filter, never a second one: a
 * `cost_value` window joins the scope whitelist, and `roles` keeps the cards
 * that share at least one of the swapped card's roles — matched with `@>`
 * per role, which the jsonb_path_ops GIN (ci_attrs_gin) serves (`?|` would
 * not) — while the pool orders the closest matches first.
 */
import { and, asc, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { loadCombosNearDeck } from "@/lib/combos/queries";
import type { BracketsMeta, RecommendMeta } from "@/lib/games/types";
import type { TournamentContext, TournamentSignal } from "./rank";
import type { CandidateCard, CandidateCombo } from "./types";

const { cardIdentities, commanderCardStats, commanderStats, deckCards, legalities } = schema;

export interface CandidateFilter {
  gameId: number;
  formatId: number;
  /** Deck color identity; candidates must satisfy (ci & ~deckCi) = 0. */
  deckCiMask: number;
  /** Cards already in the deck (leaders included) — never recommended. */
  excludeCardIds: readonly string[];
  /** Budget: only cards with a KNOWN price at or under this (USD). */
  maxPriceUsd?: number;
  /**
   * Collections hook (wired in P3.7 by the recommendations route's opt-in
   * `?owned=1`; the signature predates it from P3.1). When set, the pool is
   * restricted to owned cards (an empty set = empty pool, not "hook off");
   * undefined = hook off. The ROUTE is what guarantees a guest or a user
   * with no collection gets undefined, never an empty set.
   */
  ownedCardIds?: ReadonlySet<string>;
  /** Adapter's never-advise rules (MTG: basic lands). */
  exclude?: RecommendMeta["exclude"];
  /**
   * Column scope (W9a): restricts the pool by WHITELISTED columns, the way
   * `exclude` goes through this builder — never string-built SQL. The
   * autofill route derives it from the adapter's `autofill.base.scope`
   * (curve pool `ne` Land, base pool `eq` Land). `ne` is IS DISTINCT FROM,
   * so NULL-typed cards stay in the `ne` pool (they are not Lands). Y7a: a
   * list ANDs its scopes, and `cost_value` takes an inclusive `between`
   * (Swap Lab's window; a card without a cost never falls inside one).
   */
  scope?: CandidateScope | readonly CandidateScope[];
  /**
   * Shared roles (Y7a): only cards holding at least one of `any` in the
   * adapter's declared single-segment attrs path (`swap.rolesPath`). An
   * empty `any` matches nothing — a card with no role has no alternatives.
   */
  roles?: { path: string; any: readonly string[] };
}

/** One whitelisted column scope (W9a; Y7a adds the cost window). */
export type CandidateScope =
  | { column: "primary_type"; op: "eq" | "ne"; value: string }
  | { column: "cost_value"; op: "between"; min: number; max: number };

/** The scope whitelist: every column a CandidateFilter.scope may name. */
const SCOPE_COLUMNS = {
  primary_type: cardIdentities.primaryType,
  cost_value: cardIdentities.costValue,
} as const;

const JSONB_KEY_RE = /^[a-z0-9_]+$/;

/** A role key as adapters declare them (kebab-case) — checked before it reaches a parameter. */
const ROLE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function scopeCondition(scope: CandidateScope): SQL {
  if (!Object.hasOwn(SCOPE_COLUMNS, scope.column)) {
    throw new Error(`Invalid scope column: ${scope.column}`);
  }
  if (scope.column === "cost_value") {
    const { op, min, max } = scope;
    if (op !== "between" || !Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new Error("Invalid scope on cost_value: an integer between min and max");
    }
    return sql`${SCOPE_COLUMNS.cost_value} BETWEEN ${min} AND ${max}`;
  }
  const column = SCOPE_COLUMNS.primary_type;
  if (scope.op === "eq") return sql`${column} = ${scope.value}`;
  if (scope.op === "ne") return sql`${column} IS DISTINCT FROM ${scope.value}`;
  throw new Error(`Invalid scope op on primary_type: ${String((scope as { op: unknown }).op)}`);
}

/** The containment document for one role — `{"roles": ["mana-rock"]}`, a bound parameter. */
function roleDocument(path: string, role: string): string {
  if (!JSONB_KEY_RE.test(path)) throw new Error(`Invalid roles path: ${path}`);
  if (!ROLE_KEY_RE.test(role)) throw new Error(`Invalid role: ${role}`);
  return JSON.stringify({ [path]: [role] });
}

/**
 * How many of `roles.any` a card holds (Y7a) — one `@>` per role, summed.
 * Exported for tests; the pool orders by it, the closest matches first.
 */
export function sharedRolesCount(roles: NonNullable<CandidateFilter["roles"]>): SQL<number> {
  if (roles.any.length === 0) return sql<number>`0`;
  const terms = roles.any.map(
    (r) => sql`(${cardIdentities.attrs} @> ${roleDocument(roles.path, r)}::jsonb)::int`,
  );
  return sql<number>`(${sql.join(terms, sql` + `)})`;
}

/** Shares a role: an OR of `@>` per role — each one a ci_attrs_gin bitmap scan. */
function rolesCondition(roles: NonNullable<CandidateFilter["roles"]>): SQL {
  if (roles.any.length === 0) return sql`false`;
  const terms = roles.any.map(
    (r) => sql`${cardIdentities.attrs} @> ${roleDocument(roles.path, r)}::jsonb`,
  );
  return sql`(${sql.join(terms, sql` OR `)})`;
}

/** Exported for tests: the deterministic filter, one condition list. */
export function candidateConditions(f: CandidateFilter): SQL[] {
  const conditions: SQL[] = [
    sql`${cardIdentities.gameId} = ${f.gameId}`,
    sql`${cardIdentities.isRemoved} = false`,
    sql`${cardIdentities.isPreview} = false`,
    // ::int disambiguates ~ (bitwise NOT) from ~ (regex) on the untyped param.
    sql`(${cardIdentities.ciMask} & ~${f.deckCiMask}::int) = 0`,
    sql`NOT EXISTS (
      SELECT 1 FROM ${legalities} l
      WHERE l.card_identity_id = ${cardIdentities.id}
        AND l.format_id = ${f.formatId}
        AND l.effective_to IS NULL AND l.condition IS NULL
        AND l.status IN ('banned', 'not_legal'))`,
  ];
  if (f.excludeCardIds.length > 0) {
    conditions.push(notInArray(cardIdentities.id, [...f.excludeCardIds]));
  }
  for (const rule of f.exclude ?? []) {
    const key = rule.jsonbPath[0];
    if (!JSONB_KEY_RE.test(key)) throw new Error(`Invalid exclude path: ${key}`);
    conditions.push(
      sql`coalesce(${cardIdentities.attrs}->>${sql.raw(`'${key}'`)}, '') NOT LIKE ${rule.likePattern}`,
    );
  }
  if (f.maxPriceUsd !== undefined) {
    conditions.push(sql`${cardIdentities.cheapestUsd} IS NOT NULL`);
    conditions.push(sql`${cardIdentities.cheapestUsd} <= ${f.maxPriceUsd}`);
  }
  if (f.ownedCardIds !== undefined) {
    conditions.push(
      f.ownedCardIds.size === 0 ? sql`false` : inArray(cardIdentities.id, [...f.ownedCardIds]),
    );
  }
  const scopes: readonly CandidateScope[] =
    f.scope === undefined ? [] : Array.isArray(f.scope) ? f.scope : [f.scope as CandidateScope];
  for (const scope of scopes) conditions.push(scopeCondition(scope));
  if (f.roles !== undefined) conditions.push(rolesCondition(f.roles));
  return conditions;
}

/** The adapter's declared bracket flags (Y6a): single-segment attrs paths, `brackets.flagPaths`. */
export type FlagPaths = BracketsMeta["flagPaths"];

/**
 * The declared flags as one jsonb column (Y6a) — `{game_changer: true}`,
 * absent keys dropped, `{}` for a card that has none or a game that
 * declares none. Exported for tests. Each path faces exclude's key check
 * before it reaches `sql.raw`, so a declaration can never smuggle SQL.
 */
export function flagsColumn(flagPaths: FlagPaths | undefined): SQL<Record<string, unknown>> {
  if (!flagPaths || flagPaths.length === 0) return sql<Record<string, unknown>>`'{}'::jsonb`;
  const pairs = flagPaths.map(([key]) => {
    if (!JSONB_KEY_RE.test(key)) throw new Error(`Invalid flag path: ${key}`);
    return sql`${sql.raw(`'${key}'`)}, ${cardIdentities.attrs}->${sql.raw(`'${key}'`)}`;
  });
  return sql<
    Record<string, unknown>
  >`jsonb_strip_nulls(jsonb_build_object(${sql.join(pairs, sql`, `)}))`;
}

/**
 * A card's roles (Y7a) as the declared path holds them — a jsonb array, or
 * null for a card with none. Exported for tests; the path faces exclude's
 * key check before `sql.raw`.
 */
export function rolesColumn(path: string): SQL<unknown> {
  if (!JSONB_KEY_RE.test(path)) throw new Error(`Invalid roles path: ${path}`);
  return sql<unknown>`${cardIdentities.attrs}->${sql.raw(`'${path}'`)}`;
}

/** Role keys off a jsonb value: strings only, anything else none. */
export function roleKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((r): r is string => typeof r === "string") : [];
}

/**
 * The candidate rows' columns — with the adapter's flags (Y6a) and the
 * external key the read's questions use; with the filter's roles path
 * (Y7a), each card's roles too.
 */
function candidateProjection(flagPaths: FlagPaths | undefined, rolesPath?: string) {
  return {
    id: cardIdentities.id,
    name: cardIdentities.name,
    primaryType: cardIdentities.primaryType,
    costValue: cardIdentities.costValue,
    ciMask: cardIdentities.ciMask,
    cheapestUsd: cardIdentities.cheapestUsd,
    popularity: cardIdentities.popularity,
    externalKey: cardIdentities.externalKey,
    flags: flagsColumn(flagPaths),
    ...(rolesPath !== undefined ? { roles: rolesColumn(rolesPath) } : {}),
  };
}

/** Rows to CandidateCards: the roles column, when selected, becomes plain keys. */
function toCandidates(
  rows: (Omit<CandidateCard, "roles"> & { roles?: unknown })[],
): CandidateCard[] {
  return rows.map(({ roles, ...row }) =>
    roles === undefined ? row : { ...row, roles: roleKeys(roles) },
  );
}

/**
 * The popularity-ranked candidate pool (the staples query, parameterized).
 * Requires a popularity value — this pool IS the popularity signal; cards
 * without one can still enter through combo participation. With `roles`
 * (Y7a) the cards sharing the most roles come first, then by popularity, so
 * the cut keeps the closest matches.
 */
export async function loadCandidatePool(
  filter: CandidateFilter,
  limit: number,
  flagPaths?: FlagPaths,
): Promise<CandidateCard[]> {
  const rows = await getDb()
    .select(candidateProjection(flagPaths, filter.roles?.path))
    .from(cardIdentities)
    .where(and(...candidateConditions(filter), sql`${cardIdentities.popularity} IS NOT NULL`))
    .orderBy(...candidatePoolOrder(filter))
    .limit(limit);
  return toCandidates(rows);
}

/** The pool's order (exported for tests): the most shared roles first (Y7a), then popularity, then id. */
export function candidatePoolOrder(filter: CandidateFilter): SQL[] {
  return [
    ...(filter.roles ? [desc(sharedRolesCount(filter.roles))] : []),
    asc(cardIdentities.popularity),
    asc(cardIdentities.id),
  ];
}

/** Combo-sourced candidates re-checked through the SAME deterministic filter. */
export async function loadCandidateRows(
  filter: CandidateFilter,
  ids: readonly string[],
  flagPaths?: FlagPaths,
): Promise<CandidateCard[]> {
  if (ids.length === 0) return [];
  const rows = await getDb()
    .select(candidateProjection(flagPaths, filter.roles?.path))
    .from(cardIdentities)
    .where(and(...candidateConditions(filter), inArray(cardIdentities.id, [...ids])));
  return toCandidates(rows);
}

/**
 * Cards that would complete the CARD requirements of a combo with the deck:
 * combos color-fit to the deck where exactly one card piece is missing (the
 * candidate), pivoted candidate-first for the ranker. Template requirements
 * are disclosed in evidence, not resolved (P3.3: deckComboStatus is the one
 * classifier — a template combo is never "complete" on cards alone).
 *
 * The detection SQL is THE shared layer (combos/queries.ts, P3.3) — the
 * Combo Radar runs the same query with `includeComplete: true`; this stays a
 * pure pivot so the two surfaces can never drift apart.
 *
 * Y6a: each combo carries what the goals check reads — its key, the
 * source's rating and "relevant" mark, its piece count and whether one of
 * `leaderIds` is a piece — and `truncated` (the scan cap was reached, so a
 * rarer combo a candidate completes may not be here; the routes disclose it).
 */
export async function loadComboSignals(
  deckCardIds: readonly string[],
  deckCiMask: number,
  leaderIds: readonly string[] = [],
): Promise<{ byCandidate: Map<string, CandidateCombo[]>; truncated: boolean }> {
  const byCandidate = new Map<string, CandidateCombo[]>();
  const leaders = new Set(leaderIds);
  const found = await loadCombosNearDeck(deckCardIds, deckCiMask, { includeComplete: false });
  for (const combo of found.combos) {
    if (combo.missingPieces.length !== 1) continue; // one-away mode guarantees this
    const candidateId = combo.missingPieces[0].id;
    const list = byCandidate.get(candidateId) ?? [];
    list.push({
      key: combo.externalKey,
      withPieces: combo.inDeckPieces.map((p) => ({ cardId: p.id, name: p.name })),
      results: combo.results,
      templates: combo.templates,
      popularity: combo.popularity,
      tag: combo.tag,
      relevant: combo.relevant,
      pieceCount: combo.inDeckPieces.length + 1,
      usesLeader: combo.inDeckPieces.some((p) => leaders.has(p.id)),
    });
    byCandidate.set(candidateId, list);
  }
  return { byCandidate, truncated: found.truncated };
}

/**
 * The deck's leader set as the aggregate keys it: SORTED. decks.leader_ids
 * keeps command-zone entry order (leaderDenorm) while the Topdeck mapper
 * sorts — never compare the arrays raw.
 */
const sortedLeaders = (leaderIds: readonly string[]): string[] => [...leaderIds].sort();

/**
 * Tournament signals for a deck's EXACT commander set (P3.8): the
 * denominator context (null = no aggregated lists — the honest-absence
 * contract: callers then emit no tournament evidence at all) and per-
 * candidate list counts. Two queries on the aggregate tables plus one name
 * lookup for the evidence sentences.
 */
export async function loadTournamentSignals(
  leaderIds: readonly string[],
  candidateIds: readonly string[],
): Promise<{ context: TournamentContext | null; byCandidate: Map<string, TournamentSignal> }> {
  const byCandidate = new Map<string, TournamentSignal>();
  if (leaderIds.length === 0) return { context: null, byCandidate };
  const sorted = sortedLeaders(leaderIds);

  const [totals] = await getDb()
    .select({ lists: commanderStats.lists, firstSeen: commanderStats.firstSeen })
    .from(commanderStats)
    .where(eq(commanderStats.leaderIds, sorted));
  if (!totals) return { context: null, byCandidate };

  // Display order (the deck's own), not the aggregate's sorted key.
  const nameRows = await getDb()
    .select({ id: cardIdentities.id, name: cardIdentities.name })
    .from(cardIdentities)
    .where(inArray(cardIdentities.id, sorted));
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const commanderNames = leaderIds
    .map((id) => nameById.get(id))
    .filter((n): n is string => n !== undefined);

  if (candidateIds.length > 0) {
    const rows = await getDb()
      .select({
        cardId: commanderCardStats.cardIdentityId,
        lists: commanderCardStats.lists,
        top4: commanderCardStats.top4,
      })
      .from(commanderCardStats)
      .where(
        and(
          eq(commanderCardStats.leaderIds, sorted),
          inArray(commanderCardStats.cardIdentityId, [...candidateIds]),
        ),
      );
    for (const r of rows) byCandidate.set(r.cardId, { lists: r.lists, top4: r.top4 });
  }

  return {
    context: { commanderNames, lists: totals.lists, since: totals.firstSeen },
    byCandidate,
  };
}

/**
 * Tournament-sourced candidates (P3.8): the cards most played with the
 * deck's exact commander set, re-checked through the SAME deterministic
 * filter as every other source. This is the third candidate source — the
 * whole point is commander-specific tech the global popularity pool never
 * surfaces (and such cards often have no edhrec popularity at all).
 */
export async function loadTournamentCandidates(
  filter: CandidateFilter,
  leaderIds: readonly string[],
  limit: number,
  flagPaths?: FlagPaths,
): Promise<CandidateCard[]> {
  if (leaderIds.length === 0) return [];
  const rows = await getDb()
    .select(candidateProjection(flagPaths, filter.roles?.path))
    .from(commanderCardStats)
    .innerJoin(cardIdentities, eq(cardIdentities.id, commanderCardStats.cardIdentityId))
    .where(
      and(
        eq(commanderCardStats.leaderIds, sortedLeaders(leaderIds)),
        ...candidateConditions(filter),
      ),
    )
    .orderBy(desc(commanderCardStats.lists), asc(cardIdentities.id))
    .limit(limit);
  return toCandidates(rows);
}

/**
 * What a card holds for the server-side bracket read (Y6a): the declared
 * flags and the identity facts beside them — `attrs` is never selected
 * whole (the read takes only `flagPaths` from it), and legality stays the
 * candidate filter's and validate's.
 */
export interface ReadFacts {
  name: string;
  externalKey: string;
  colorsMask: number;
  ciMask: number;
  isLeaderCandidate: boolean;
  isPreview: boolean;
  cheapestUsd: string | null;
  popularity: number | null;
  flags: Record<string, unknown>;
}

function readFactsColumns(flagPaths: FlagPaths | undefined) {
  return {
    name: cardIdentities.name,
    externalKey: cardIdentities.externalKey,
    colorsMask: cardIdentities.colorsMask,
    ciMask: cardIdentities.ciMask,
    isLeaderCandidate: cardIdentities.isLeaderCandidate,
    isPreview: cardIdentities.isPreview,
    cheapestUsd: cardIdentities.cheapestUsd,
    popularity: cardIdentities.popularity,
    flags: flagsColumn(flagPaths),
  };
}

/**
 * Facts for a client-sent card list (W9a): the autofill route takes ids
 * only — every fact (type, cost, color identity) comes from the server, so
 * a crafted body can never smuggle a wrong ciMask past the filter. Missing
 * ids simply aren't returned; the caller 400s on the difference. Y6a: with
 * the read's facts too (the snapshot route's goals check), in the same
 * statement.
 */
export async function loadEntryFacts(
  gameId: number,
  ids: readonly string[],
  flagPaths?: FlagPaths,
  /** Y7a: the adapter's roles path — each card's roles ride the same statement. */
  rolesPath?: string,
): Promise<
  Map<
    string,
    ReadFacts & { primaryType: string | null; costValue: number | null; roles?: string[] }
  >
> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      id: cardIdentities.id,
      primaryType: cardIdentities.primaryType,
      costValue: cardIdentities.costValue,
      ...readFactsColumns(flagPaths),
      ...(rolesPath !== undefined ? { roles: rolesColumn(rolesPath) } : {}),
    })
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, gameId),
        eq(cardIdentities.isRemoved, false),
        inArray(cardIdentities.id, [...new Set(ids)]),
      ),
    );
  return new Map(
    rows.map(({ roles, ...r }) => [
      r.id,
      rolesPath !== undefined ? { ...r, roles: roleKeys(roles) } : r,
    ]),
  );
}

/**
 * Filler rows by exact name (W9a: the adapter's declared basics). Legality-
 * checked like every candidate, but DELIBERATELY not run through
 * candidateConditions — the adapter's `exclude` rules make basic lands
 * never-advise for the ranked pools, while the land template explicitly
 * fills with them.
 */
export async function loadFillerRows(
  gameId: number,
  formatId: number,
  names: readonly string[],
): Promise<CandidateCard[]> {
  if (names.length === 0) return [];
  const rows = await getDb()
    .select(candidateProjection(undefined))
    .from(cardIdentities)
    .where(
      and(
        eq(cardIdentities.gameId, gameId),
        eq(cardIdentities.isRemoved, false),
        eq(cardIdentities.isPreview, false),
        inArray(cardIdentities.name, [...names]),
        sql`NOT EXISTS (
          SELECT 1 FROM ${legalities} l
          WHERE l.card_identity_id = ${cardIdentities.id}
            AND l.format_id = ${formatId}
            AND l.effective_to IS NULL AND l.condition IS NULL
            AND l.status IN ('banned', 'not_legal'))`,
      ),
    );
  return toCandidates(rows);
}

/**
 * The deck's cards with the fields curve bucketing reads (all zones) — and,
 * Y6a, each entry's zone and the read's facts (ReadFacts), still one
 * statement.
 */
export async function loadDeckEntries(
  deckId: string,
  flagPaths?: FlagPaths,
): Promise<
  {
    cardId: string;
    zone: string;
    qty: number;
    primaryType: string | null;
    costValue: number | null;
    facts: ReadFacts;
  }[]
> {
  const rows = await getDb()
    .select({
      cardId: deckCards.cardIdentityId,
      zone: deckCards.zone,
      qty: deckCards.quantity,
      primaryType: cardIdentities.primaryType,
      costValue: cardIdentities.costValue,
      ...readFactsColumns(flagPaths),
    })
    .from(deckCards)
    .innerJoin(cardIdentities, eq(cardIdentities.id, deckCards.cardIdentityId))
    .where(eq(deckCards.deckId, deckId));
  return rows.map(({ cardId, zone, qty, primaryType, costValue, ...facts }) => ({
    cardId,
    zone,
    qty,
    primaryType,
    costValue,
    facts,
  }));
}
