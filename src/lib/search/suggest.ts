/**
 * The suggest query (X2, WAVE3.md D2) behind GET /api/cards/suggest: at most
 * SUGGEST_LIMIT slim rows for a typed name, ranked by the shared matcher
 * (`name-match.ts`). Split from the route so the statements can be read,
 * EXPLAINed and measured by the same code that serves them.
 *
 * Statements, and only these:
 *   - a One Piece card number or prefix ("op01-02", searchIdPrefix — the
 *     search route's P4.8 pass) → ONE statement over `external_key LIKE`,
 *     in card-number order; a miss is an honest empty list (an id is not a
 *     misspelled name);
 *   - otherwise ONE statement for classes 1–3, and a SECOND — class 5, the
 *     trigram near misses — only when the first found fewer than
 *     SUGGEST_LIMIT rows and the text has NEAR_MISS_MIN_CHARS or more.
 *
 * `scope: "leaders"` is the hub scope: leader candidates WITH a slug (every
 * one has one, measured 2026-09-27; the condition is the hub's own). Banned
 * commanders stay in — their hubs exist for reference. The image is the
 * `small` thumbnail through `thumbnailUrl()`, the single gate: Scryfall's
 * `small` for Magic, the mirror's small WebP for One Piece since P4.9.
 */
import { and, eq, notInArray, sql, type SQL } from "drizzle-orm";

import { schema, type DbExecutor } from "@/db";
import { GAME_ID } from "@/db/seed-data";
import { embeddablePrintingImageUrl, thumbnailUrl } from "@/lib/cards/images";
import { searchIdPrefix } from "@/lib/cards/resolve-token";
import { NAME_MIN_CHARS, nameKey } from "@/lib/search/name-key";
import {
  nameMatchCondition,
  nameMatchOrder,
  nameNearMissCondition,
  NEAR_MISS_MIN_CHARS,
  parseNameQuery,
  SUGGEST_LIMIT,
} from "@/lib/search/name-match";

const { cardIdentities: ci, cardPrintings: cp } = schema;

export type SuggestGame = "mtg" | "optcg";
export type SuggestScope = "cards" | "leaders";

/** One dropdown row (D2's endpoint shape). */
export interface SuggestRow {
  id: string;
  name: string;
  /** The hub slug — set for leaders, null for everything else. */
  slug: string | null;
  isLeader: boolean;
  typeLine: string | null;
  colorsMask: number;
  ciMask: number;
  /** Magic: the oracle id; One Piece: the card number ("OP01-025"). */
  externalKey: string;
  /** The `small` thumbnail, or null (a card with no printing or no small rendition). */
  image: string | null;
}

export interface SuggestResponse {
  /** The normalized text the answer is for (the request key). */
  q: string;
  results: SuggestRow[];
}

export interface SuggestOptions {
  game: SuggestGame;
  scope: SuggestScope;
  /** Raw or already-normalized typed text — normalized here either way. */
  q: string;
}

function baseConditions(game: SuggestGame, scope: SuggestScope): SQL[] {
  const conditions = [eq(ci.gameId, GAME_ID[game]), eq(ci.isRemoved, false)];
  if (scope === "leaders") {
    conditions.push(eq(ci.isLeaderCandidate, true), sql`${ci.slug} IS NOT NULL`);
  }
  return conditions;
}

function slimSelect(db: DbExecutor) {
  return db
    .select({
      id: ci.id,
      name: ci.name,
      slug: ci.slug,
      isLeader: ci.isLeaderCandidate,
      typeLine: sql<string | null>`${ci.attrs}->>'type_line'`,
      colorsMask: ci.colorsMask,
      ciMask: ci.ciMask,
      externalKey: ci.externalKey,
      printingId: cp.id,
      imageOverride: cp.imageOverride,
    })
    .from(ci)
    .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)));
}

/**
 * The statements as builders (unexecuted), for the route and for EXPLAIN.
 * `plan.kind` says which path the text takes; "none" means no statement.
 */
export function suggestPlan(db: DbExecutor, opts: SuggestOptions) {
  const text = nameKey(opts.q);
  if (text.length < NAME_MIN_CHARS) return { kind: "none" as const, text };
  const base = baseConditions(opts.game, opts.scope);

  const idPrefix = searchIdPrefix(opts.game, text);
  if (idPrefix !== null) {
    // searchIdPrefix admits [A-Z0-9-] only: the pattern needs no escaping.
    const statement = slimSelect(db)
      .where(and(...base, sql`${ci.externalKey} LIKE ${idPrefix + "%"}`))
      .orderBy(sql`${ci.externalKey} ASC`)
      .limit(SUGGEST_LIMIT);
    return { kind: "id" as const, text, statement };
  }

  // nameKey(text) === text, so this parse cannot come back null.
  const query = parseNameQuery(text)!;
  const order = nameMatchOrder(query);
  const statement = slimSelect(db)
    .where(and(...base, nameMatchCondition(query, "suggest")))
    .orderBy(...order)
    .limit(SUGGEST_LIMIT);
  const nearMisses = (excludeIds: string[], limit: number) =>
    slimSelect(db)
      .where(
        and(
          ...base,
          nameNearMissCondition(query),
          excludeIds.length ? notInArray(ci.id, excludeIds) : undefined,
        ),
      )
      .orderBy(...order)
      .limit(limit);
  return { kind: "name" as const, text, statement, nearMisses };
}

type SlimRow = Omit<SuggestRow, "image"> & { printingId: string | null; imageOverride: unknown };

function toSuggestRow({ printingId, imageOverride, ...row }: SlimRow): SuggestRow {
  return {
    ...row,
    image: printingId
      ? thumbnailUrl(embeddablePrintingImageUrl({ id: printingId, imageOverride }, "normal"))
      : null,
  };
}

export async function loadSuggestions(
  db: DbExecutor,
  opts: SuggestOptions,
): Promise<SuggestResponse> {
  const plan = suggestPlan(db, opts);
  if (plan.kind === "none") return { q: plan.text, results: [] };
  const rows = await plan.statement;
  if (
    plan.kind === "name" &&
    rows.length < SUGGEST_LIMIT &&
    plan.text.length >= NEAR_MISS_MIN_CHARS
  ) {
    rows.push(
      ...(await plan.nearMisses(
        rows.map((r) => r.id),
        SUGGEST_LIMIT - rows.length,
      )),
    );
  }
  return { q: plan.text, results: rows.map(toSuggestRow) };
}
