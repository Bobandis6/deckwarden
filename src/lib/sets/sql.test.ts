/**
 * The set rules as SQL (X4a): "released", THE collector-number order, and
 * the in-set printing's derived table — rendered through the Postgres
 * dialect, so the text pinned here is what runs. The rows these produce
 * against live data (Bloomburrow: 279 cards, one printing each, collector
 * order 1 → 397) are the route's and the smoke's to prove.
 */
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { sets } from "@/db/schema";

import { collectorNumberOrder, inSetPrintings, releasedPaperSet } from "./sql";

const dialect = new PgDialect();
const render = (fragment: SQL) => dialect.sqlToQuery(fragment);

describe("releasedPaperSet", () => {
  it("is the set's own date, today or earlier in UTC, and not digital-only", () => {
    expect(render(releasedPaperSet(sets)).sql).toBe(
      `(NOT "sets"."digital" AND "sets"."released_at" <= (now() AT TIME ZONE 'UTC')::date)`,
    );
  });
});

describe("collectorNumberOrder", () => {
  it("leading integer (none → last), then the full text, then the printing id — no user value in it", () => {
    const q = render(sql.join(collectorNumberOrder(sql.raw("cn"), sql.raw("pid")), sql`, `));
    expect(q.sql).toBe(`(substring(cn from '^[0-9]+'))::numeric ASC NULLS LAST, cn ASC, pid ASC`);
    expect(q.params).toEqual([]);
  });
});

describe("inSetPrintings", () => {
  it("one row per card — DISTINCT ON the card, ordered by the collector rule — from one released set, every value bound", () => {
    const q = render(sql`${inSetPrintings(1, "blb")}`);
    expect(q.sql).toBe(
      `(select distinct on ("in_set_printing"."card_identity_id") "in_set_printing"."card_identity_id", "in_set_printing"."id", "in_set_printing"."image_override", "in_set_printing"."collector_number" from "card_printings" "in_set_printing" inner join "sets" "in_set_row" on "in_set_row"."id" = "in_set_printing"."set_id" where ("in_set_row"."game_id" = $1 and "in_set_row"."code" = $2 and (NOT "in_set_row"."digital" AND "in_set_row"."released_at" <= (now() AT TIME ZONE 'UTC')::date) and "in_set_printing"."is_removed" = $3) order by "in_set_printing"."card_identity_id", (substring("in_set_printing"."collector_number" from '^[0-9]+'))::numeric ASC NULLS LAST, "in_set_printing"."collector_number" ASC, "in_set_printing"."id" ASC) "in_set"`,
    );
    expect(q.params).toEqual([1, "blb", false]);
  });
});
