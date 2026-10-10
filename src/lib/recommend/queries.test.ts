import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  candidateConditions,
  candidatePoolOrder,
  flagsColumn,
  roleKeys,
  rolesColumn,
  sharedRolesCount,
  type CandidateFilter,
} from "./queries";

/**
 * The deterministic filter is SQL built by one function; these tests pin its
 * CONTRACT shape without a database: which inputs add conditions and which
 * are inert. Behavior against real rows is smoke:recommend's job.
 */
const BASE: CandidateFilter = {
  gameId: 1,
  formatId: 1,
  deckCiMask: 3,
  excludeCardIds: [],
};

describe("candidateConditions", () => {
  it("owned-cards hook is off when undefined (the contract P3.7's ?owned=1 relies on)", () => {
    const off = candidateConditions(BASE);
    const alsoOff = candidateConditions({ ...BASE, ownedCardIds: undefined });
    expect(alsoOff).toHaveLength(off.length);
  });

  it("owned-cards hook restricts when provided — empty set means empty pool, not hook-off", () => {
    const off = candidateConditions(BASE);
    const restricted = candidateConditions({
      ...BASE,
      ownedCardIds: new Set(["00000000-0000-0000-0000-000000000001"]),
    });
    const emptyOwned = candidateConditions({ ...BASE, ownedCardIds: new Set<string>() });
    expect(restricted).toHaveLength(off.length + 1);
    expect(emptyOwned).toHaveLength(off.length + 1);
  });

  it("budget and deck-exclusion each add conditions; adapter exclude rules apply per rule", () => {
    const off = candidateConditions(BASE);
    // Budget adds two: price known AND price under budget (unknown price is
    // never silently "within budget").
    expect(candidateConditions({ ...BASE, maxPriceUsd: 25 })).toHaveLength(off.length + 2);
    expect(
      candidateConditions({ ...BASE, excludeCardIds: ["00000000-0000-0000-0000-000000000002"] }),
    ).toHaveLength(off.length + 1);
    expect(
      candidateConditions({
        ...BASE,
        exclude: [{ jsonbPath: ["type_line"], likePattern: "%Basic%" }],
      }),
    ).toHaveLength(off.length + 1);
  });

  it("scope goes through the whitelist like exclude — one condition per op, never string SQL", () => {
    const off = candidateConditions(BASE);
    expect(
      candidateConditions({
        ...BASE,
        scope: { column: "primary_type", op: "eq", value: "Land" },
      }),
    ).toHaveLength(off.length + 1);
    expect(
      candidateConditions({
        ...BASE,
        scope: { column: "primary_type", op: "ne", value: "Land" },
      }),
    ).toHaveLength(off.length + 1);
  });

  it("rejects a non-whitelisted scope column instead of interpolating it", () => {
    expect(() =>
      candidateConditions({
        ...BASE,
        scope: {
          column: "name; DROP TABLE" as unknown as "primary_type",
          op: "eq",
          value: "x",
        },
      }),
    ).toThrow(/Invalid scope column/);
  });

  // Y7a: Swap Lab's cost window joins the whitelist — a bound range, never string SQL.
  it("a cost_value range adds exactly one bound condition; a list of scopes ANDs one each", () => {
    const off = candidateConditions(BASE);
    const window = candidateConditions({
      ...BASE,
      scope: { column: "cost_value", op: "between", min: 0, max: 2 },
    });
    expect(window).toHaveLength(off.length + 1);
    const q = new PgDialect().sqlToQuery(window[window.length - 1]);
    expect(q.sql).toBe(`"card_identities"."cost_value" BETWEEN $1 AND $2`);
    expect(q.params).toEqual([0, 2]);
    expect(
      candidateConditions({
        ...BASE,
        scope: [
          { column: "primary_type", op: "ne", value: "Land" },
          { column: "cost_value", op: "between", min: 1, max: 3 },
        ],
      }),
    ).toHaveLength(off.length + 2);
    expect(candidateConditions({ ...BASE, scope: [] })).toHaveLength(off.length);
  });

  it("rejects a cost range of the wrong shape, and string ops on cost_value", () => {
    const bad = [
      { column: "cost_value", op: "between", min: 3, max: 1 },
      { column: "cost_value", op: "between", min: 0.5, max: 2 },
      { column: "cost_value", op: "between", min: 0 },
      { column: "cost_value", op: "eq", value: "2" },
      { column: "primary_type", op: "between", min: 0, max: 1 },
    ];
    for (const scope of bad) {
      expect(() =>
        candidateConditions({ ...BASE, scope: scope as unknown as CandidateFilter["scope"] }),
      ).toThrow(/Invalid scope/);
    }
  });

  it("shared roles add one condition — an OR of bound containment documents (the GIN's @>)", () => {
    const off = candidateConditions(BASE);
    const shared = candidateConditions({
      ...BASE,
      roles: { path: "roles", any: ["mana-rock", "ramp"] },
    });
    expect(shared).toHaveLength(off.length + 1);
    const q = new PgDialect().sqlToQuery(shared[shared.length - 1]);
    expect(q.sql).toBe(
      `("card_identities"."attrs" @> $1::jsonb OR "card_identities"."attrs" @> $2::jsonb)`,
    );
    expect(q.params).toEqual(['{"roles":["mana-rock"]}', '{"roles":["ramp"]}']);
    // No role, no candidate — never "every card".
    const none = candidateConditions({ ...BASE, roles: { path: "roles", any: [] } });
    expect(new PgDialect().sqlToQuery(none[none.length - 1]).sql).toBe("false");
  });

  it("rejects a malformed roles path or role key instead of binding it", () => {
    expect(() =>
      candidateConditions({ ...BASE, roles: { path: "roles'; --", any: ["ramp"] } }),
    ).toThrow(/Invalid roles path/);
    expect(() =>
      candidateConditions({ ...BASE, roles: { path: "roles", any: ['ramp"]}'] } }),
    ).toThrow(/Invalid role/);
  });

  it("rejects a malformed jsonb exclude key instead of interpolating it", () => {
    expect(() =>
      candidateConditions({
        ...BASE,
        exclude: [{ jsonbPath: ["bad' key"] as unknown as [string], likePattern: "%x%" }],
      }),
    ).toThrow(/Invalid exclude path/);
  });
});

/**
 * Y6a — the adapter's bracket flags as one jsonb column: built from its
 * declared paths only, each through exclude's key check before it reaches
 * the SQL, absent keys dropped (jsonb_strip_nulls), `{}` for a game that
 * declares none.
 */
describe("flagsColumn", () => {
  const dialect = new PgDialect();
  const render = (paths: Parameters<typeof flagsColumn>[0]) =>
    dialect.sqlToQuery(flagsColumn(paths));

  it("one jsonb object over the declared paths, nulls stripped, no parameters", () => {
    const q = render([["game_changer"], ["mld"], ["extra_turn"]]);
    expect(q.sql).toBe(
      `jsonb_strip_nulls(jsonb_build_object('game_changer', "card_identities"."attrs"->'game_changer', 'mld', "card_identities"."attrs"->'mld', 'extra_turn', "card_identities"."attrs"->'extra_turn'))`,
    );
    expect(q.params).toEqual([]);
  });

  it("a game that declares none reads {}", () => {
    expect(render(undefined).sql).toBe(`'{}'::jsonb`);
    expect(render([]).sql).toBe(`'{}'::jsonb`);
  });

  it("a declared path outside the key alphabet throws — never SQL", () => {
    expect(() => render([["mld'; drop table decks; --"]])).toThrow("Invalid flag path");
  });
});

/** Y7a — the roles column and the pool's closest-first order, rendered without a database. */
describe("Swap Lab's role columns", () => {
  const dialect = new PgDialect();

  it("a card's roles come off the declared path; anything but an array of strings is none", () => {
    expect(dialect.sqlToQuery(rolesColumn("roles")).sql).toBe(`"card_identities"."attrs"->'roles'`);
    expect(() => rolesColumn("roles'")).toThrow("Invalid roles path");
    expect(roleKeys(["ramp", 3, "mana-rock"])).toEqual(["ramp", "mana-rock"]);
    expect(roleKeys(null)).toEqual([]);
    expect(roleKeys("ramp")).toEqual([]);
  });

  it("the pool orders by the most shared roles first, then popularity — and only with roles", () => {
    const render = (filter: CandidateFilter) =>
      candidatePoolOrder(filter).map((o) => dialect.sqlToQuery(o).sql);
    expect(render(BASE)).toEqual([
      `"card_identities"."popularity" asc`,
      `"card_identities"."id" asc`,
    ]);
    const withRoles = render({ ...BASE, roles: { path: "roles", any: ["burn"] } });
    expect(withRoles).toEqual([
      `(("card_identities"."attrs" @> $1::jsonb)::int) desc`,
      `"card_identities"."popularity" asc`,
      `"card_identities"."id" asc`,
    ]);
  });

  it("the shared-role count sums one containment per role, 0 for none", () => {
    const q = dialect.sqlToQuery(sharedRolesCount({ path: "roles", any: ["mana-rock", "ramp"] }));
    expect(q.sql).toBe(
      `(("card_identities"."attrs" @> $1::jsonb)::int + ("card_identities"."attrs" @> $2::jsonb)::int)`,
    );
    expect(q.params).toEqual(['{"roles":["mana-rock"]}', '{"roles":["ramp"]}']);
    expect(dialect.sqlToQuery(sharedRolesCount({ path: "roles", any: [] })).sql).toBe("0");
  });
});
