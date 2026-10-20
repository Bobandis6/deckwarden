/**
 * @vitest-environment node
 *
 * claimDecks (S3, SECURITY-AUDIT-report.md L6): real drizzle over a fake
 * postgres.js client that records every statement and answers rows (the
 * /api/health harness). What is pinned: the UPDATE carries each row's own
 * proof — `user_id is null and claim_token = <the token that verified>` —
 * and RETURNING decides the result, so a redemption that lost a race comes
 * back empty even though the select had said the deck was claimable; a
 * token that does not verify never reaches a statement at all.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

type Call = { sql: string; params: unknown[] };
let calls: Call[] = [];
let answer: (call: Call) => unknown[][] = () => [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    const call = { sql, params };
    calls.push(call);
    const rows = answer(call);
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { claimDecks } = await import("./claim");

const USER = "0f2a6c1e-5b7d-4e8a-9c3b-1d2e3f4a5b6c";
const DECK_A = "11111111-1111-4111-8111-111111111111";
const DECK_B = "22222222-2222-4222-8222-222222222222";
const TOKEN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER = "99999999-9999-4999-8999-999999999999";

/** A row the select answers: [id, user_id, claim_token, visibility]. */
type SelectRow = [string, string | null, string | null, string];

function selectThen(rows: SelectRow[], updated: string[]) {
  answer = (call) => {
    if (call.sql.startsWith("select")) return rows;
    if (call.sql.startsWith("update")) return updated.map((id) => [id]);
    throw new Error(`unexpected statement: ${call.sql}`);
  };
}

const ONE_PROOF =
  /\("decks"\."id" = \$(\d+) and "decks"\."user_id" is null and "decks"\."claim_token" = \$(\d+)\)/g;

beforeEach(() => {
  calls = [];
  answer = () => [];
});

describe("claimDecks", () => {
  it("runs nothing for an empty credential list", async () => {
    expect(await claimDecks(USER, [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("writes one conditional proof per verified row and returns what the UPDATE returned", async () => {
    selectThen([[DECK_A, null, TOKEN_A, "unlisted"]], [DECK_A]);
    const claimed = await claimDecks(USER, [{ id: DECK_A, token: TOKEN_A }]);

    expect(claimed).toEqual([DECK_A]);
    expect(calls).toHaveLength(2);
    const [select, update] = calls as [Call, Call];
    expect(select.sql).toMatch(/^select .* from "decks" where "decks"\."id" in \(\$1\)$/);
    expect(select.params).toEqual([DECK_A]);

    expect(update.sql).toMatch(/^update "decks" set /);
    expect(update.sql).toMatch(/"user_id" = \$1/);
    expect(update.sql).toMatch(/"claim_token" = \$2/);
    expect(update.sql).toMatch(/ returning "id"$/);
    const proofs = [...update.sql.matchAll(ONE_PROOF)];
    expect(proofs).toHaveLength(1);
    const [, idParam, tokenParam] = proofs[0] as unknown as [string, string, string];
    expect(update.params[0]).toBe(USER);
    expect(update.params[1]).toBeNull();
    expect(update.params[Number(idParam) - 1]).toBe(DECK_A);
    expect(update.params[Number(tokenParam) - 1]).toBe(TOKEN_A);
  });

  it("a redemption that lost the race returns nothing: RETURNING, not the select, decides", async () => {
    // The select still sees the deck anonymous with this token; by the time
    // the UPDATE runs another claim has set user_id and NULLed the token, so
    // the conditional write matches no row.
    selectThen([[DECK_A, null, TOKEN_A, "unlisted"]], []);
    expect(await claimDecks(USER, [{ id: DECK_A, token: TOKEN_A }])).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it("two verified decks: both proofs in one statement, both ids back", async () => {
    selectThen(
      [
        [DECK_A, null, TOKEN_A, "unlisted"],
        [DECK_B, null, TOKEN_B, "private"],
      ],
      [DECK_A, DECK_B],
    );
    const claimed = await claimDecks(USER, [
      { id: DECK_A, token: TOKEN_A },
      { id: DECK_B, token: TOKEN_B },
    ]);
    expect(claimed).toEqual([DECK_A, DECK_B]);
    const update = calls[1] as Call;
    const proofs = [...update.sql.matchAll(ONE_PROOF)];
    expect(proofs).toHaveLength(2);
    expect(update.sql).toMatch(/\) or \(/);
    expect(update.params).toEqual(expect.arrayContaining([USER, DECK_A, TOKEN_A, DECK_B, TOKEN_B]));
  });

  it("a token that does not verify never reaches a statement", async () => {
    // Wrong token, an already-claimed deck, a deck that no longer exists:
    // nothing to write, so only the select runs — and a malformed token
    // (claim_token is a uuid column) never gets near Postgres.
    selectThen(
      [
        [DECK_A, null, TOKEN_A, "unlisted"],
        [DECK_B, OTHER_USER, null, "unlisted"],
      ],
      [],
    );
    const claimed = await claimDecks(USER, [
      { id: DECK_A, token: "not-a-uuid-and-not-the-token" },
      { id: DECK_B, token: TOKEN_B },
      { id: "33333333-3333-4333-8333-333333333333", token: TOKEN_A },
    ]);
    expect(claimed).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toMatch(/^select /);
  });

  it("mixed: only the verified row's token appears in the UPDATE", async () => {
    selectThen(
      [
        [DECK_A, null, TOKEN_A, "unlisted"],
        [DECK_B, null, TOKEN_B, "unlisted"],
      ],
      [DECK_A],
    );
    const claimed = await claimDecks(USER, [
      { id: DECK_A, token: TOKEN_A },
      { id: DECK_B, token: "bbbbbbbb-bbbb-4bbb-8bbb-000000000000" },
    ]);
    expect(claimed).toEqual([DECK_A]);
    const update = calls[1] as Call;
    expect([...update.sql.matchAll(ONE_PROOF)]).toHaveLength(1);
    expect(update.params).toContain(TOKEN_A);
    expect(update.params).not.toContain(TOKEN_B);
    expect(update.params).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-000000000000");
    expect(update.params).not.toContain(DECK_B);
  });
});
