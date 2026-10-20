import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { mtgAdapter } from "@/lib/games/mtg/adapter";
import type { SQL } from "drizzle-orm";
import {
  SEARCH_MULTISELECT_MAX_VALUES,
  SEARCH_VALUE_MAX_CHARS,
  translateSearch,
} from "./translate";

const dialect = new PgDialect();
const render = (fragment: SQL) => dialect.sqlToQuery(fragment);
const fields = mtgAdapter.searchFields;

describe("translateSearch", () => {
  it("ignores unrelated params and empty values", () => {
    const t = translateSearch(fields, { limit: "50", offset: "0", game: "mtg", name: "  " });
    expect(t.conditions).toEqual([]);
    expect(t.rank).toBeNull();
    expect(t.warnings).toEqual([]);
  });

  it("translates trgm name search with the shared normalizer and a similarity rank", () => {
    const t = translateSearch(fields, { name: "Lörièn // Split" });
    expect(t.conditions).toHaveLength(1);
    const q = render(t.conditions[0]);
    expect(q.sql).toBe(
      '("card_identities"."name_norm" LIKE $1 OR "card_identities"."name_norm" % $2)',
    );
    expect(q.params).toEqual(["%lorien split%", "lorien split"]);
    expect(render(t.rank!).sql).toContain("similarity");
  });

  it("escapes LIKE's wildcards in the name arm's bound value only — no ESCAPE clause (X2)", () => {
    for (const [typed, pattern] of [
      ["_", "%\\_%"],
      ["100%", "%100\\%%"],
      ["a\\b", "%a\\\\b%"],
      ["\\", "%\\\\%"],
    ] as const) {
      const q = render(translateSearch(fields, { name: typed }).conditions[0]);
      expect(q.sql).toBe(
        '("card_identities"."name_norm" LIKE $1 OR "card_identities"."name_norm" % $2)',
      );
      expect(q.params).toEqual([pattern, typed]);
    }
  });

  it("translates FTS text search over the tsvector column", () => {
    const t = translateSearch(fields, { text: "draw a card" });
    const q = render(t.conditions[0]);
    expect(q.sql).toBe('"card_identities"."search_text" @@ websearch_to_tsquery(\'english\', $1)');
    expect(q.params).toEqual(["draw a card"]);
    expect(render(t.rank!).sql).toContain("ts_rank");
  });

  it("translates number ranges and rejects unknown ops", () => {
    const t = translateSearch(fields, { mv: "gte:2,lte:4,nope:9,eq:abc" });
    expect(t.conditions).toHaveLength(2);
    expect(render(t.conditions[0]).sql).toBe('"card_identities"."cost_value" >= $1');
    expect(render(t.conditions[1]).sql).toBe('"card_identities"."cost_value" <= $1');
    expect(t.warnings).toHaveLength(2);
  });

  it("translates JSONB number targets with a cast", () => {
    const t = translateSearch(fields, { power: "gte:8" });
    const q = render(t.conditions[0]);
    expect(q.sql).toBe('("card_identities"."attrs"->>\'power_num\')::numeric >= $1');
    expect(q.params).toEqual([8]);
  });

  it("translates multiselect on a promoted column to IN", () => {
    const t = translateSearch(fields, { type: "Creature,Instant" });
    const q = render(t.conditions[0]);
    expect(q.sql).toBe('"card_identities"."primary_type" in ($1, $2)');
    expect(q.params).toEqual(["Creature", "Instant"]);
  });

  it("translates JSONB multiselect (mode all) to a single @> containment", () => {
    const t = translateSearch(fields, { keywords: "Flying,Haste" });
    const q = render(t.conditions[0]);
    expect(q.sql).toBe('"card_identities"."attrs" @> $1::jsonb');
    expect(q.params).toEqual(['{"keywords":["Flying","Haste"]}']);
  });

  it("translates colorset modes: within (fit test), including, exactly", () => {
    const within = render(translateSearch(fields, { ci: "WUG" }).conditions[0]);
    expect(within.sql).toBe('("card_identities"."ci_mask" & $1) = 0');
    expect(within.params).toEqual([~(1 | 2 | 16)]);

    const including = render(translateSearch(fields, { colors: "including:R" }).conditions[0]);
    expect(including.sql).toBe('("card_identities"."colors_mask" & $1) = $2');
    expect(including.params).toEqual([8, 8]);

    const exactly = render(translateSearch(fields, { ci: "exactly:WU" }).conditions[0]);
    expect(exactly.sql).toBe('"card_identities"."ci_mask" = $1');
    expect(exactly.params).toEqual([3]);
  });

  it("warns instead of emitting SQL for malformed colorset values", () => {
    const t = translateSearch(fields, { ci: "within:WUX" });
    expect(t.conditions).toEqual([]);
    expect(t.warnings).toHaveLength(1);
  });

  it("set (X4a): a bound EXISTS over printings in one released set, the code lowercased, and the scope", () => {
    const t = translateSearch(fields, { set: " BLB " });
    expect(t.warnings).toEqual([]);
    expect(t.scope).toEqual({ field: "set", code: "blb" });
    expect(t.conditions).toHaveLength(1);
    const q = render(t.conditions[0]);
    expect(q.sql).toBe(
      `exists (select 1 from "card_printings" "set_printing" inner join "sets" "set_row" on "set_row"."id" = "set_printing"."set_id" where ("set_printing"."card_identity_id" = "card_identities"."id" and "set_printing"."is_removed" = $1 and "set_row"."game_id" = "card_identities"."game_id" and "set_row"."code" = $2 and (NOT "set_row"."digital" AND "set_row"."released_at" <= (now() AT TIME ZONE 'UTC')::date)))`,
    );
    expect(q.params).toEqual([false, "blb"]);
  });

  it("set (X4a): a malformed code warns and scopes to nothing — never widens to every card", () => {
    for (const bad of ["bl%b", "b", "blb;drop", "a".repeat(13)]) {
      const t = translateSearch(fields, { set: bad });
      expect(t.scope).toBeUndefined();
      expect(t.warnings).toEqual([`set: "${bad}" is not a set code`]);
      expect(t.conditions).toHaveLength(1);
      const q = render(t.conditions[0]);
      expect(q.sql).toBe("false");
      expect(q.params).toEqual([]);
    }
  });

  it("set (X4a): no set, no scope — the translation's shape is what it was", () => {
    const t = translateSearch(fields, { name: "sol", set: "  " });
    expect(Object.keys(t)).toEqual(["conditions", "rank", "warnings"]);
  });

  it("bounds (S4, M6): a value past 200 characters is refused — named, with no SQL built from it", () => {
    expect(SEARCH_VALUE_MAX_CHARS).toBe(200);
    const long = "a".repeat(300);
    const t = translateSearch(fields, { name: long, text: long, mv: "3" });
    expect(t.refused).toEqual([
      "name: 300 characters, the limit is 200",
      "text: 300 characters, the limit is 200",
    ]);
    expect(t.warnings).toEqual([]);
    // Only the in-bounds filter made SQL — and none of it carries the value.
    expect(t.conditions).toHaveLength(1);
    expect(render(t.conditions[0]).sql).toBe('"card_identities"."cost_value" = $1');
    expect(t.rank).toBeNull();
  });

  it("bounds (S4, M6): exactly 200 characters is inside the bound; the 201st is out", () => {
    const edge = translateSearch(fields, { name: "b".repeat(200) });
    expect(edge.refused).toBeUndefined();
    expect(edge.conditions).toHaveLength(1);
    const over = translateSearch(fields, { name: "b".repeat(201) });
    expect(over.refused).toEqual(["name: 201 characters, the limit is 200"]);
    expect(over.conditions).toEqual([]);
  });

  it("bounds (S4, M6): a multiselect past 20 values is refused; 20 translate", () => {
    expect(SEARCH_MULTISELECT_MAX_VALUES).toBe(20);
    const twenty = Array.from({ length: 20 }, (_, i) => `K${i}`);
    const ok = translateSearch(fields, { keywords: twenty.join(",") });
    expect(ok.refused).toBeUndefined();
    expect(render(ok.conditions[0]).params).toEqual([JSON.stringify({ keywords: twenty })]);
    const over = translateSearch(fields, {
      keywords: [...twenty, "K20"].join(","),
      type: "Creature",
    });
    expect(over.refused).toEqual(["keywords: 21 values, the limit is 20"]);
    expect(over.conditions).toHaveLength(1);
    expect(render(over.conditions[0]).sql).toBe('"card_identities"."primary_type" in ($1)');
  });

  it("bounds (S4, M6): a translation inside the bounds carries no `refused` key — its shape is what it was", () => {
    expect(Object.keys(translateSearch(fields, { name: "sol" }))).toEqual([
      "conditions",
      "rank",
      "warnings",
    ]);
  });

  it("binds every user value as a parameter — nothing user-supplied lands in SQL text", () => {
    const evil = "'; DROP TABLE card_identities; --";
    const t = translateSearch(fields, { name: evil, text: evil, type: evil, set: "zzz9" });
    for (const c of t.conditions) {
      const q = render(c);
      expect(q.sql).not.toContain("DROP TABLE");
      expect(q.sql).not.toContain("zzz9");
      expect(
        q.params.some(
          (p) =>
            String(p).includes("drop table") ||
            String(p).includes("DROP TABLE") ||
            String(p) === "zzz9",
        ),
      ).toBe(true);
    }
  });
});
