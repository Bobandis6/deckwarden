/**
 * Collection import v1 (P3.7) — the shared vocabulary between the client-side
 * CSV parser (parse.ts, pure), the import API (/api/collection), and the
 * read surfaces (owned badges, "you own N/100", the Suggestions "only cards
 * I own" filter). Kept dependency-free so client components can import it
 * without dragging the Drizzle schema into the bundle; the schema's
 * COLLECTION_FINISHES mirrors FINISHES and a test pins the two equal.
 */

export const FINISHES = ["nonfoil", "foil", "etched"] as const;
export type Finish = (typeof FINISHES)[number];

export const COLLECTION_LIMITS = {
  /**
   * Distinct (printing, finish) rows one account may hold. 20k printings is
   * a serious paper collection (~2.6MB on disk at ~130B/row — the Neon math
   * in schema.ts). The import truncates to fit and DISCLOSES the truncation
   * (`capped` in the report) rather than refusing the whole file.
   */
  perUser: 20_000,
  /** Rows per POST body after the client-side fold — ~2.5MB of JSON at the cap (Vercel's request-body ceiling is 4.5MB). */
  rowsPerImport: 20_000,
  /** Copies per row; smallint-safe, and no binder holds ten thousand of one printing. */
  maxQuantity: 9_999,
  nameMax: 200,
  setCodeMax: 10,
  collectorNumberMax: 20,
  /** Unresolved rows echoed back in the report (the total is always reported). */
  unresolvedEcho: 1_000,
} as const;

export type ImportMode = "merge" | "replace";

/**
 * One normalized collection line — what the client parses out of a CSV and
 * what it POSTs. Keys in resolution order: `scryfallId` (ManaBox — exact
 * printing), then `setCode` + `collectorNumber` (Moxfield's key), then
 * `name` alone (identity's default printing). Quantity is per line; the
 * fold sums lines that share a key + finish.
 */
export interface CollectionRow {
  scryfallId?: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  finish: Finish;
  quantity: number;
}

/** What GET /api/collection reports (and every import returns after writing). */
export interface CollectionSummary {
  rows: number;
  printings: number;
  identities: number;
  updatedAt: string | null;
}

export type ResolvedBy = "scryfallId" | "setNumber" | "name";
export type UnresolvedReason =
  "unknown-scryfall-id" | "unknown-set-number" | "unknown-name" | "no-key";

export interface UnresolvedRow {
  /** Index into the POSTed rows array. */
  index: number;
  name: string;
  scryfallId?: string;
  setCode?: string;
  collectorNumber?: string;
  reason: UnresolvedReason;
}

/** The POST /api/collection response — every count the UI discloses. */
export interface ImportReport {
  mode: ImportMode;
  received: number;
  resolved: number;
  resolvedBy: Record<ResolvedBy, number>;
  unresolvedTotal: number;
  /** First COLLECTION_LIMITS.unresolvedEcho unresolved rows, in input order. */
  unresolved: UnresolvedRow[];
  /** Rows whose requested finish the printing doesn't come in — stored under the printing's finish instead. */
  finishAdjusted: number;
  /** Input rows folded into an earlier row with the same printing + finish (quantities summed). */
  merged: number;
  inserted: number;
  updated: number;
  /** Replace mode: rows wiped before the insert. */
  deleted: number;
  /** Non-null when the per-user cap truncated the import. */
  capped: { limit: number; dropped: number } | null;
  summary: CollectionSummary;
}
