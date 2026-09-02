/**
 * Import planning (P3.7) — the pure half of the write path. Given rows (from
 * the parser client-side, or resolved to printings server-side) these
 * decide what gets written, and every decision is a returned COUNT the UI
 * can disclose: merged duplicates, adjusted finishes, cap truncation.
 * No IO here; store.ts runs the transaction.
 */
import { COLLECTION_LIMITS, type CollectionRow, type Finish, type ImportMode } from "./types";

/** The key a row resolves by, strongest first — same order the server resolves in. */
export function rowKey(row: CollectionRow): string {
  if (row.scryfallId) return `id:${row.scryfallId}`;
  if (row.setCode && row.collectorNumber) return `sn:${row.setCode}#${row.collectorNumber}`;
  return `nm:${row.name.trim().toLowerCase()}`;
}

/**
 * Fold lines that share a key + finish (ManaBox writes one line per
 * binder/condition/language; the same printing appears many times).
 * Quantities SUM within one file; the later SET-on-conflict upsert is what
 * keeps a re-import from double counting. Order of first appearance kept.
 */
export function foldRows<R extends CollectionRow>(
  rows: readonly R[],
): { rows: R[]; merged: number; quantityClamped: number } {
  const byKey = new Map<string, R>();
  let merged = 0;
  let quantityClamped = 0;
  for (const row of rows) {
    const key = `${rowKey(row)}|${row.finish}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      continue;
    }
    merged++;
    const sum = prev.quantity + row.quantity;
    if (sum > COLLECTION_LIMITS.maxQuantity) quantityClamped++;
    prev.quantity = Math.min(sum, COLLECTION_LIMITS.maxQuantity);
  }
  return { rows: [...byKey.values()], merged, quantityClamped };
}

const FINISH_PREFERENCE: readonly Finish[] = ["nonfoil", "foil", "etched"];

/**
 * The finish a row is stored under. A printing that comes in the requested
 * finish keeps it; otherwise the printing's own finishes win (nonfoil first)
 * and the caller counts the adjustment — the user still OWNS the card, the
 * finish is cosmetic, and inventing a foil printing that never existed would
 * be a lie in the other direction. An empty finishes array (a handful of
 * printings) keeps the request as-is.
 */
export function pickFinish(
  requested: Finish,
  available: readonly string[],
): { finish: Finish; adjusted: boolean } {
  if (available.length === 0 || available.includes(requested)) {
    return { finish: requested, adjusted: false };
  }
  const fallback = FINISH_PREFERENCE.find((f) => available.includes(f)) ?? requested;
  return { finish: fallback, adjusted: fallback !== requested };
}

export interface PlannedWrite {
  printingId: string;
  finish: Finish;
  quantity: number;
}

export interface ImportPlan {
  writes: PlannedWrite[];
  /** Resolved rows folded into an earlier row with the same printing + finish. */
  merged: number;
  quantityClamped: number;
  capped: { limit: number; dropped: number } | null;
}

/**
 * Fold resolved rows by (printing, finish), then apply the per-user cap:
 * updates to keys the user already holds never grow the table and always
 * go through; NEW keys are admitted in input order until the cap, and the
 * rest are dropped and COUNTED (`capped`). Replace mode starts from an
 * empty table, so every key is new.
 */
export function planImport(
  resolved: readonly PlannedWrite[],
  existingKeys: ReadonlySet<string>,
  mode: ImportMode,
  limit: number = COLLECTION_LIMITS.perUser,
): ImportPlan {
  const byKey = new Map<string, PlannedWrite>();
  let merged = 0;
  let quantityClamped = 0;
  for (const row of resolved) {
    const key = writeKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row });
      continue;
    }
    merged++;
    const sum = prev.quantity + row.quantity;
    if (sum > COLLECTION_LIMITS.maxQuantity) quantityClamped++;
    prev.quantity = Math.min(sum, COLLECTION_LIMITS.maxQuantity);
  }
  const held = mode === "replace" ? 0 : existingKeys.size;
  let room = Math.max(0, limit - held);
  const writes: PlannedWrite[] = [];
  let dropped = 0;
  for (const [key, write] of byKey) {
    if (mode === "merge" && existingKeys.has(key)) {
      writes.push(write);
      continue;
    }
    if (room > 0) {
      room--;
      writes.push(write);
    } else {
      dropped++;
    }
  }
  return { writes, merged, quantityClamped, capped: dropped > 0 ? { limit, dropped } : null };
}

/** The (printing, finish) identity of a stored row. */
export function writeKey(row: { printingId: string; finish: Finish }): string {
  return `${row.printingId}|${row.finish}`;
}
