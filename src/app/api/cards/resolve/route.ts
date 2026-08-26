/**
 * POST /api/cards/resolve — decklist-import name → card resolution (P1.6).
 *
 * Core's half of the adapter contract: adapters only TOKENIZE decklists;
 * resolution happens here via the one shared normalizer. Three passes, all
 * served by the ci_name_trgm index:
 *   1. exact name_norm match (ties → most popular, non-preview first)
 *   2. double-faced front-face match ("Fable of the Mirror-Breaker" pastes
 *      resolve to "… // Reflection of Kiki-Jiki")
 *   3. pg_trgm fuzzy → suggestions for the review UI, never auto-picked
 * Results are CardWire-shaped (attrs + image + legality when `format` given)
 * so the editor can drop them straight into its card map.
 *
 * Caching intent: dynamic (POST body-driven); responses are no-store — the
 * import dialog is a one-shot flow, not a hot path.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { findFormat, GAME_ID } from "@/db/seed-data";
import { printingImageUrl } from "@/lib/cards/images";
import { normalizeCardName } from "@/lib/cards/normalize";
import { fetchLegalityMap } from "@/lib/decks/legality";
import type { LegalityEntry } from "@/lib/games/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const { cardIdentities: ci, cardPrintings: cp } = schema;

const BODY = z.object({
  game: z.enum(["mtg", "optcg"]).default("mtg"),
  format: z.string().max(40).optional(),
  names: z.array(z.string().trim().min(1).max(200)).min(1).max(400),
});

/** Bound the per-request fuzzy fan-out; misses beyond it get no suggestions. */
const FUZZY_LIMIT = 50;
const SUGGESTIONS_PER_NAME = 5;

/** CardWire columns + default-printing join, shared by all three passes. */
function wireSelect(db: ReturnType<typeof getDb>) {
  return db
    .select({
      id: ci.id,
      name: ci.name,
      nameNorm: ci.nameNorm,
      primaryType: ci.primaryType,
      costValue: ci.costValue,
      colorsMask: ci.colorsMask,
      ciMask: ci.ciMask,
      cheapestUsd: ci.cheapestUsd,
      popularity: ci.popularity,
      isLeaderCandidate: ci.isLeaderCandidate,
      isPreview: ci.isPreview,
      attrs: ci.attrs,
      printingId: cp.id,
      imageOverride: cp.imageOverride,
    })
    .from(ci)
    .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)))
    .$dynamic();
}

type WireRow = Awaited<ReturnType<typeof wireSelect>>[number];

function toWire(row: WireRow, legality: Map<string, LegalityEntry[]>) {
  const { nameNorm: _nameNorm, printingId, imageOverride, cheapestUsd, ...card } = row;
  return {
    ...card,
    cheapestUsd: cheapestUsd === null ? null : Number(cheapestUsd),
    legality: legality.get(row.id) ?? [],
    image: printingId ? printingImageUrl({ id: printingId, imageOverride }, "normal") : null,
  };
}

/** Deterministic best row per name: popular first (nulls last), previews last. */
function better(a: WireRow, b: WireRow): WireRow {
  if (a.isPreview !== b.isPreview) return a.isPreview ? b : a;
  const ap = a.popularity ?? Infinity;
  const bp = b.popularity ?? Infinity;
  return bp < ap ? b : a;
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BODY.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }
  const { game, format, names } = parsed.data;

  const seededFormat = format ? findFormat(game, format) : undefined;
  if (format && !seededFormat) {
    return NextResponse.json(
      { error: `Unknown format "${format}" for ${game}` },
      { status: 400, headers: NO_STORE },
    );
  }

  const db = getDb();
  const gameCond = and(eq(ci.gameId, GAME_ID[game]), eq(ci.isRemoved, false));

  const norms = [...new Set(names.map(normalizeCardName))].filter(Boolean);

  // Pass 1: exact normalized-name match, one query for the whole paste.
  const matchByNorm = new Map<string, WireRow>();
  if (norms.length > 0) {
    const rows = await wireSelect(db).where(and(gameCond, inArray(ci.nameNorm, norms)));
    for (const row of rows) {
      const prev = matchByNorm.get(row.nameNorm);
      matchByNorm.set(row.nameNorm, prev ? better(prev, row) : row);
    }
  }

  // Pass 2: double-faced front faces. name_norm folds "//" to a space, so a
  // front-face paste is a strict prefix; confirm the exact face split in JS.
  let misses = norms.filter((n) => !matchByNorm.has(n));
  if (misses.length > 0) {
    const missSet = new Set(misses);
    // Drizzle binds a JS array as one scalar param — build the ARRAY[] literal
    // from individual params so LIKE ANY sees a real text[].
    const patterns = sql.join(
      misses.map((m) => sql`${m + " %"}`),
      sql`, `,
    );
    const rows = await wireSelect(db).where(
      and(
        gameCond,
        sql`${ci.name} LIKE '% // %'`,
        sql`${ci.nameNorm} LIKE ANY(ARRAY[${patterns}]::text[])`,
      ),
    );
    for (const row of rows) {
      const frontNorm = normalizeCardName(row.name.split(" // ")[0]);
      if (!missSet.has(frontNorm)) continue;
      const prev = matchByNorm.get(frontNorm);
      matchByNorm.set(frontNorm, prev ? better(prev, row) : row);
    }
    misses = norms.filter((n) => !matchByNorm.has(n));
  }

  // Pass 3: fuzzy suggestions for what's left — review-UI food, never auto-picked.
  const suggestionsByNorm = new Map<string, WireRow[]>();
  await Promise.all(
    misses.slice(0, FUZZY_LIMIT).map(async (miss) => {
      const rows = await wireSelect(db)
        .where(and(gameCond, sql`${ci.nameNorm} % ${miss}`))
        .orderBy(
          sql`similarity(${ci.nameNorm}, ${miss}) DESC`,
          sql`${ci.popularity} ASC NULLS LAST`,
        )
        .limit(SUGGESTIONS_PER_NAME);
      if (rows.length > 0) suggestionsByNorm.set(miss, rows);
    }),
  );

  const allIds = [
    ...new Set(
      [...matchByNorm.values(), ...[...suggestionsByNorm.values()].flat()].map((r) => r.id),
    ),
  ];
  const legality = seededFormat
    ? await fetchLegalityMap(seededFormat.id, allIds)
    : new Map<string, LegalityEntry[]>();

  const results = names.map((input) => {
    const norm = normalizeCardName(input);
    const match = matchByNorm.get(norm) ?? null;
    return {
      input,
      match: match ? toWire(match, legality) : null,
      suggestions: (suggestionsByNorm.get(norm) ?? []).map((r) => toWire(r, legality)),
    };
  });

  return NextResponse.json({ results }, { headers: NO_STORE });
}
