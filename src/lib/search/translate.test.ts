import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { mtgAdapter } from "@/lib/games/mtg/adapter";
import type { SQL } from "drizzle-orm";
import { translateSearch } from "./translate";

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

  it("binds every user value as a parameter — nothing user-supplied lands in SQL text", () => {
    const evil = "'; DROP TABLE card_identities; --";
    const t = translateSearch(fields, { name: evil, text: evil, type: evil });
    for (const c of t.conditions) {
      const q = render(c);
      expect(q.sql).not.toContain("DROP TABLE");
      expect(
        q.params.some((p) => String(p).includes("drop table") || String(p).includes("DROP TABLE")),
      ).toBe(true);
    }
  });
});
