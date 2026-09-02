/**
 * Collection row → printing resolution (P3.7). Three passes, strongest key
 * first, each ONE batched query per 2k keys — never per row:
 *
 *   1. Scryfall id (ManaBox): card_printings.id IS the Scryfall card id
 *      (images.ts derives CDN URLs from it; a real export id round-trips —
 *      verified against api.scryfall.com 2026-09-02). Exact printing.
 *      Removed printings still resolve: is_removed is a soft flag and an
 *      owned card stays owned.
 *   2. Set code + collector number (Moxfield's key; ManaBox fallback) via
 *      the shared resolver in cards/resolve-printings.ts.
 *   3. Name alone → the identity's DEFAULT printing: normalizeCardName
 *      against name_norm exactly (the one shared normalizer), plus the
 *      double-faced front-face pass /api/cards/resolve runs. Ties break like
 *      the resolve route: non-preview, then most popular. Never fuzzy — a
 *      trigram near-miss would silently mark the wrong card owned.
 *
 * Every row that survives no pass is returned with the reason for its
 * STRONGEST key ("unknown-scryfall-id" beats "unknown-name"): the report
 * shows them, the UI offers the list, nothing is dropped quietly.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { schema, type DbExecutor } from "@/db";
import { normalizeCardName } from "@/lib/cards/normalize";
import {
  resolvePrintingsBySetNumber,
  setNumberKey,
  type PrintingRef,
} from "@/lib/cards/resolve-printings";
import type { CollectionRow, ResolvedBy, UnresolvedReason } from "./types";

const { cardIdentities: ci, cardPrintings: cp } = schema;

const CHUNK = 2000;

export interface ResolvedRow extends PrintingRef {
  index: number;
  by: ResolvedBy;
}

export interface ResolutionFailure {
  index: number;
  reason: UnresolvedReason;
}

export interface ResolutionResult {
  resolved: ResolvedRow[];
  unresolved: ResolutionFailure[];
}

export async function resolveCollectionRows(
  db: DbExecutor,
  gameId: number,
  rows: readonly CollectionRow[],
): Promise<ResolutionResult> {
  const resolved = new Map<number, ResolvedRow>();

  // Pass 1 — Scryfall ids.
  const idRows = rows.flatMap((r, index) => (r.scryfallId ? [{ index, id: r.scryfallId }] : []));
  const ids = [...new Set(idRows.map((r) => r.id))];
  const byId = new Map<string, PrintingRef>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const found = await db
      .select({ id: cp.id, identityId: cp.cardIdentityId, finishes: cp.finishes })
      .from(cp)
      .where(and(eq(cp.gameId, gameId), inArray(cp.id, ids.slice(i, i + CHUNK))));
    for (const f of found) {
      byId.set(f.id, { printingId: f.id, identityId: f.identityId, finishes: f.finishes });
    }
  }
  for (const { index, id } of idRows) {
    const hit = byId.get(id);
    if (hit) resolved.set(index, { index, by: "scryfallId", ...hit });
  }

  // Pass 2 — set code + collector number, for what's left.
  const snRows = rows.flatMap((r, index) =>
    !resolved.has(index) && r.setCode && r.collectorNumber
      ? [{ index, setCode: r.setCode, collectorNumber: r.collectorNumber }]
      : [],
  );
  if (snRows.length > 0) {
    const bySn = await resolvePrintingsBySetNumber(db, gameId, snRows);
    for (const { index, setCode, collectorNumber } of snRows) {
      const hit = bySn.get(setNumberKey(setCode, collectorNumber));
      if (hit) resolved.set(index, { index, by: "setNumber", ...hit });
    }
  }

  // Pass 3 — name → default printing, for what's still left.
  const nameRows = rows.flatMap((r, index) =>
    !resolved.has(index) ? [{ index, norm: normalizeCardName(r.name) }] : [],
  );
  if (nameRows.length > 0) {
    const byNorm = await resolveDefaultPrintingsByName(
      db,
      gameId,
      nameRows.map((r) => r.norm),
    );
    for (const { index, norm } of nameRows) {
      const hit = byNorm.get(norm);
      if (hit) resolved.set(index, { index, by: "name", ...hit });
    }
  }

  const unresolved: ResolutionFailure[] = [];
  rows.forEach((r, index) => {
    if (resolved.has(index)) return;
    const reason: UnresolvedReason = r.scryfallId
      ? "unknown-scryfall-id"
      : r.setCode && r.collectorNumber
        ? "unknown-set-number"
        : r.name.trim()
          ? "unknown-name"
          : "no-key";
    unresolved.push({ index, reason });
  });

  return { resolved: [...resolved.values()].sort((a, b) => a.index - b.index), unresolved };
}

interface NameRow {
  id: string;
  name: string;
  nameNorm: string;
  popularity: number | null;
  isPreview: boolean;
  printingId: string | null;
  finishes: string[] | null;
}

/** Same tie-break as /api/cards/resolve: previews last, then lowest edhrec rank. */
function better(a: NameRow, b: NameRow): NameRow {
  if (a.isPreview !== b.isPreview) return a.isPreview ? b : a;
  return (b.popularity ?? Infinity) < (a.popularity ?? Infinity) ? b : a;
}

/**
 * Exact name_norm match, then the double-faced front-face pass, each one
 * query per chunk. Returns the identity's default printing per normalized
 * name; identities without a default printing (none expected — the ingest
 * post-pass elects one) simply don't resolve.
 */
async function resolveDefaultPrintingsByName(
  db: DbExecutor,
  gameId: number,
  norms: readonly string[],
): Promise<Map<string, PrintingRef>> {
  const distinct = [...new Set(norms)].filter(Boolean);
  const best = new Map<string, NameRow>();
  const select = () =>
    db
      .select({
        id: ci.id,
        name: ci.name,
        nameNorm: ci.nameNorm,
        popularity: ci.popularity,
        isPreview: ci.isPreview,
        printingId: cp.id,
        finishes: cp.finishes,
      })
      .from(ci)
      .leftJoin(cp, and(eq(cp.cardIdentityId, ci.id), eq(cp.isDefault, true)))
      .$dynamic();
  const gameCond = and(eq(ci.gameId, gameId), eq(ci.isRemoved, false));

  for (let i = 0; i < distinct.length; i += CHUNK) {
    const rows = await select().where(
      and(gameCond, inArray(ci.nameNorm, distinct.slice(i, i + CHUNK))),
    );
    for (const row of rows) {
      const prev = best.get(row.nameNorm);
      best.set(row.nameNorm, prev ? better(prev, row) : row);
    }
  }

  const misses = distinct.filter((n) => !best.has(n));
  for (let i = 0; i < misses.length; i += CHUNK) {
    const chunk = misses.slice(i, i + CHUNK);
    const missSet = new Set(chunk);
    const patterns = sql.join(
      chunk.map((m) => sql`${m + " %"}`),
      sql`, `,
    );
    const rows = await select().where(
      and(
        gameCond,
        sql`${ci.name} LIKE '% // %'`,
        sql`${ci.nameNorm} LIKE ANY(ARRAY[${patterns}]::text[])`,
      ),
    );
    for (const row of rows) {
      const frontNorm = normalizeCardName(row.name.split(" // ")[0]);
      if (!missSet.has(frontNorm)) continue;
      const prev = best.get(frontNorm);
      best.set(frontNorm, prev ? better(prev, row) : row);
    }
  }

  const out = new Map<string, PrintingRef>();
  for (const [norm, row] of best) {
    if (!row.printingId) continue;
    out.set(norm, { printingId: row.printingId, identityId: row.id, finishes: row.finishes ?? [] });
  }
  return out;
}
