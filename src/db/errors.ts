/**
 * Driver-error sniffing. drizzle-orm wraps postgres.js errors in
 * DrizzleQueryError with the original PostgresError on `.cause` (pg-core/
 * session.js), so SQLSTATE lives one level down; the top-level check stays
 * for raw client calls that bypass drizzle.
 */

/** SQLSTATE 23505 — unique constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null | undefined)?.code;
  return (
    code(err) === "23505" ||
    code((err as { cause?: unknown } | null | undefined)?.cause) === "23505"
  );
}
