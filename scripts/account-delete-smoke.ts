/**
 * Curl-level tests for P2.8 account deletion: the 401/400 contract, the
 * one-transaction delete (user + decks + folders), and the two invariants
 * user deletion must not break — other people's decks keep an accurate
 * likes_count (the cascade alone would leave it high), and forks of the
 * deleted user's decks survive with their upstream pointer nulled (seeded by
 * SQL — no fork API exists until M3). P3.7: the user's imported collection
 * (collections.user_id ON DELETE CASCADE) must go with the account. Runs
 * against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:account                                  # http://localhost:3000
 *   BASE_URL=http://localhost:3111 pnpm smoke:account   # another port
 *
 * Sessions are minted the same way engagement-smoke.ts does: throwaway users
 * + session rows inserted directly, cookies signed with BETTER_AUTH_SECRET
 * using better-call's scheme. Cleanup in `finally`.
 */
import { createHmac, randomBytes } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) throw new Error("BETTER_AUTH_SECRET is not set — see .env.example.");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is not set.");

const CONFIRM = "delete my account";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function signedCookie(token: string): string {
  const sig = createHmac("sha256", SECRET as string)
    .update(token)
    .digest("base64");
  const value = encodeURIComponent(`${token}.${sig}`);
  return `better-auth.session_token=${value}; __Secure-better-auth.session_token=${value}`;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (pages) is fine */
  }
  return { status: res.status, json, text };
}

/** Loose JSON accessor for smoke assertions — shape mistakes fail the checks, not the compile. */
const j = <T = Record<string, unknown>>(v: unknown): T => (v ?? {}) as T;

async function main() {
  console.log(`account-delete smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  const run = randomBytes(4).toString("hex");
  const cleanup = { userIds: [] as string[], deckIds: [] as string[] };

  try {
    const mkUser = async (tag: string) => {
      const [user] = await sql`
        insert into users (name, email) values
          (${`P28 Smoke ${tag} ${run}`}, ${`p28-smoke-${tag}-${run}@smoke.invalid`})
        returning id`;
      cleanup.userIds.push(user.id as string);
      const token = randomBytes(24).toString("hex");
      await sql`
        insert into sessions (token, user_id, expires_at)
        values (${token}, ${user.id as string}, now() + interval '1 hour')`;
      return { id: user.id as string, cookie: signedCookie(token) };
    };
    const alice = await mkUser("a");
    const bob = await mkUser("b");

    const mkDeck = async (cookie: string, name: string) => {
      const res = await api("POST", "/api/decks", {
        cookie,
        body: { game: "mtg", format: "commander", name },
      });
      const deck = j<{ id: string; publicId: string }>(j(res.json).deck);
      cleanup.deckIds.push(deck.id);
      await api("PATCH", `/api/decks/${deck.id}`, { cookie, body: { visibility: "public" } });
      return deck;
    };
    const aliceDeck = await mkDeck(alice.cookie, `Del Smoke A ${run}`);
    const bobDeck = await mkDeck(bob.cookie, `Del Smoke B ${run}`);

    // Cross-likes: bob→A (dies with A), alice→B (must be recounted). A folder
    // and a bookmark to prove the user-scoped cascades, and a fake fork B→A
    // to prove upstream pointers get nulled instead of blocking the delete.
    await api("PUT", `/api/decks/${aliceDeck.id}/like`, { cookie: bob.cookie });
    await api("PUT", `/api/decks/${bobDeck.id}/like`, { cookie: alice.cookie });
    await api("PUT", `/api/decks/${bobDeck.id}/bookmark`, { cookie: alice.cookie });
    await api("POST", "/api/folders", { cookie: alice.cookie, body: { name: `Del ${run}` } });
    await sql`update decks set forked_from_deck_id = ${aliceDeck.id} where id = ${bobDeck.id}`;
    // A collection row (P3.7) — any real printing; the cascade must take it.
    await sql`
      insert into collections (user_id, printing_id, finish, quantity)
      select ${alice.id}, id, 'nonfoil', 2 from card_printings where is_removed = false limit 1`;
    const [{ n: collectionBefore }] =
      await sql`select count(*)::int as n from collections where user_id = ${alice.id}`;
    check("precondition: alice holds 1 collection row", Number(collectionBefore) === 1);

    const [{ n: bobLikesBefore }] =
      await sql`select likes_count as n from decks where id = ${bobDeck.id}`;
    check("precondition: bob's deck likes_count = 1", Number(bobLikesBefore) === 1, bobLikesBefore);

    // ---- contract gates ---------------------------------------------------
    check(
      "signed-in /account renders the danger zone",
      (await api("GET", "/account", { cookie: alice.cookie })).text.includes("Danger zone"),
    );
    check("DELETE signed out → 401", (await api("DELETE", "/api/account")).status === 401);
    const badConfirm = await api("DELETE", "/api/account", {
      cookie: alice.cookie,
      body: { confirm: "yes please" },
    });
    check("wrong confirm phrase → 400", badConfirm.status === 400, badConfirm.json);
    const [{ n: aliceStill }] =
      await sql`select count(*)::int as n from users where id = ${alice.id}`;
    check("wrong confirm deleted nothing", Number(aliceStill) === 1);

    // ---- the deletion -----------------------------------------------------
    const del = await api("DELETE", "/api/account", {
      cookie: alice.cookie,
      body: { confirm: CONFIRM },
    });
    check(
      "DELETE with confirm → 200 {deleted, decksDeleted: 1}",
      del.status === 200 && j(del.json).deleted === true && j(del.json).decksDeleted === 1,
      del.json,
    );

    const [{ n: aliceGone }] =
      await sql`select count(*)::int as n from users where id = ${alice.id}`;
    check("user row gone", Number(aliceGone) === 0);
    const [{ n: deckGone }] =
      await sql`select count(*)::int as n from decks where id = ${aliceDeck.id}`;
    check("her deck gone", Number(deckGone) === 0);
    const [{ n: folders }] =
      await sql`select count(*)::int as n from deck_folders where user_id = ${alice.id}`;
    check("her folders gone", Number(folders) === 0);
    const [{ n: sessions }] =
      await sql`select count(*)::int as n from sessions where user_id = ${alice.id}`;
    check("her sessions gone", Number(sessions) === 0);
    const [{ n: bookmarks }] =
      await sql`select count(*)::int as n from deck_bookmarks where user_id = ${alice.id}`;
    check("her bookmarks gone", Number(bookmarks) === 0);
    const [{ n: collectionAfter }] =
      await sql`select count(*)::int as n from collections where user_id = ${alice.id}`;
    check("her collection gone (P3.7 cascade)", Number(collectionAfter) === 0);

    // The two invariants the cascade alone would break:
    const [bobRow] = await sql`
      select likes_count, forked_from_deck_id,
        (select count(*)::int from deck_likes where deck_id = ${bobDeck.id}) as like_rows
      from decks where id = ${bobDeck.id}`;
    check(
      "bob's deck likes_count recounted to 0",
      Number(bobRow.likes_count) === 0 && Number(bobRow.like_rows) === 0,
      bobRow,
    );
    check("bob's fork survives, upstream pointer nulled", bobRow.forked_from_deck_id === null);
    const [{ n: bobFine }] = await sql`select count(*)::int as n from users where id = ${bob.id}`;
    check("bob untouched", Number(bobFine) === 1);

    // ---- dead cookie ------------------------------------------------------
    check(
      "re-DELETE with the dead cookie → 401",
      (await api("DELETE", "/api/account", { cookie: alice.cookie, body: { confirm: CONFIRM } }))
        .status === 401,
    );
    check(
      "GET /account with the dead cookie → sign-in view",
      (await api("GET", "/account", { cookie: alice.cookie })).text.includes("Sign in"),
    );
  } finally {
    if (cleanup.deckIds.length > 0) {
      await sql`delete from decks where id in ${sql(cleanup.deckIds)}`;
    }
    if (cleanup.userIds.length > 0) {
      await sql`delete from users where id in ${sql(cleanup.userIds)}`;
    }
    await sql.end();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
