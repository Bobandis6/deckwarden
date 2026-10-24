/**
 * The token catalog's SQL guards (DECK-TOKENS) — the convention itself is
 * ./tokens.ts'. Server-only by import (drizzle), so client code takes the
 * flag test from ./tokens.ts without pulling this in.
 *
 * Containment both ways with the document bound as a parameter (the
 * brackets/list.ts precedent): `tokenSql` rides ci_attrs_gin (jsonb_path_ops
 * serves @> only); the negation is a row filter over what the other
 * conditions found.
 */
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { TOKEN_DOC } from "./tokens";

/** "This identity is a token-catalog object", over an attrs column. */
export function tokenSql(attrs: AnyPgColumn): SQL {
  return sql`${attrs} @> ${TOKEN_DOC}::jsonb`;
}

/** Its negation: every deck-card query's guard. */
export function notTokenSql(attrs: AnyPgColumn): SQL {
  return sql`NOT (${attrs} @> ${TOKEN_DOC}::jsonb)`;
}
