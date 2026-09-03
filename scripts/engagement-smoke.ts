/**
 * Curl-level tests for the P2.3 surface: like/bookmark toggles (idempotency,
 * the likes_count denorm, the 401/404/403 contract), bookmark privacy on
 * /account, and the home "recent public decks" rail's visibility rules.
 * Runs against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:engagement                                  # http://localhost:3000
 *   BASE_URL=http://localhost:3111 pnpm smoke:engagement   # another port
 *
 * Sessions are minted the same way profile-folders-smoke.ts does: throwaway
 * users + session rows inserted directly, cookies signed with
 * BETTER_AUTH_SECRET using better-call's scheme. Cleanup in `finally`.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) throw new Error("BETTER_AUTH_SECRET is not set — see .env.example.");
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is not set.");

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
  opts: { cookie?: string; deckToken?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.deckToken ? { "x-deck-token": opts.deckToken } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (pages, 204s) is fine */
  }
  return { status: res.status, json, text };
}

/** Loose JSON accessor for smoke assertions — shape mistakes fail the checks, not the compile. */
const j = <T = Record<string, unknown>>(v: unknown): T => (v ?? {}) as T;

/**
 * Abort the run (cleanup still runs) when a deck create didn't return an id —
 * almost always the per-IP deck-create limiter (10/hour, 30/day). Recording an
 * undefined id would only crash later, in cleanup, with the cause lost
 * (profile-folders-smoke learned this in prod on 2026-09-02).
 */
function requireDeckId(
  label: string,
  res: { status: number; json: unknown; text: string },
  id: unknown,
): string {
  if (typeof id === "string" && id.length > 0) return id;
  throw new Error(
    `${label} failed (HTTP ${res.status}${res.status === 429 ? " — the per-IP deck-create limiter; see rate_limit_counters" : ""}): ${res.text.slice(0, 200)}`,
  );
}

async function main() {
  console.log(`engagement smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  const run = randomBytes(4).toString("hex");
  const cleanup = { userIds: [] as string[], deckIds: [] as string[] };

  try {
    // ---- mint two users + sessions straight into the DB -------------------
    const mkUser = async (tag: string) => {
      const [user] = await sql`
        insert into users (name, email) values
          (${`P23 Smoke ${tag} ${run}`}, ${`p23-smoke-${tag}-${run}@smoke.invalid`})
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

    // ---- a public deck to engage with -------------------------------------
    const deckRes = await api("POST", "/api/decks", {
      cookie: alice.cookie,
      body: { game: "mtg", format: "commander", name: `Engage Smoke ${run}` },
    });
    const deck = j<{ id: string; publicId: string }>(j(deckRes.json).deck);
    cleanup.deckIds.push(requireDeckId("session deck create", deckRes, deck.id));
    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });

    // ---- signed-out gates -------------------------------------------------
    check(
      "PUT like signed out → 401",
      (await api("PUT", `/api/decks/${deck.id}/like`)).status === 401,
    );
    check(
      "PUT bookmark signed out → 401",
      (await api("PUT", `/api/decks/${deck.id}/bookmark`)).status === 401,
    );

    // ---- like toggle + count denorm ---------------------------------------
    const [{ updated_at: updatedBefore }] =
      await sql`select updated_at from decks where id = ${deck.id}`;

    const like1 = await api("PUT", `/api/decks/${deck.id}/like`, { cookie: bob.cookie });
    check(
      "bob likes → 200 {liked, likesCount: 1}",
      like1.status === 200 && j(like1.json).liked === true && j(like1.json).likesCount === 1,
      like1.json,
    );
    const like2 = await api("PUT", `/api/decks/${deck.id}/like`, { cookie: bob.cookie });
    check("double-like idempotent → still 1", j(like2.json).likesCount === 1, like2.json);
    const like3 = await api("PUT", `/api/decks/${deck.id}/like`, { cookie: alice.cookie });
    check("second liker (deck owner) → 2", j(like3.json).likesCount === 2, like3.json);

    const [{ likes_count: dbCount }] =
      await sql`select likes_count from decks where id = ${deck.id}`;
    check("decks.likes_count denorm matches → 2", Number(dbCount) === 2, dbCount);

    const [{ updated_at: updatedAfter }] =
      await sql`select updated_at from decks where id = ${deck.id}`;
    check(
      "likes never bump decks.updated_at",
      new Date(updatedBefore as string).getTime() === new Date(updatedAfter as string).getTime(),
      { updatedBefore, updatedAfter },
    );

    const unlike = await api("DELETE", `/api/decks/${deck.id}/like`, { cookie: bob.cookie });
    check(
      "unlike → {liked: false, likesCount: 1}",
      j(unlike.json).liked === false && j(unlike.json).likesCount === 1,
      unlike.json,
    );
    const unlike2 = await api("DELETE", `/api/decks/${deck.id}/like`, { cookie: bob.cookie });
    check("double-unlike idempotent → still 1", j(unlike2.json).likesCount === 1, unlike2.json);

    // ---- id + visibility contract -----------------------------------------
    check(
      "unknown deck id → 404",
      (await api("PUT", `/api/decks/${randomUUID()}/like`, { cookie: bob.cookie })).status === 404,
    );
    check(
      "malformed deck id → 404",
      (await api("PUT", "/api/decks/not-a-uuid/like", { cookie: bob.cookie })).status === 404,
    );

    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "private" },
    });
    check(
      "stranger likes a private deck → 403",
      (await api("PUT", `/api/decks/${deck.id}/like`, { cookie: bob.cookie })).status === 403,
    );
    check(
      "owner still can → 200",
      (await api("PUT", `/api/decks/${deck.id}/like`, { cookie: alice.cookie })).status === 200,
    );
    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });

    // ---- bookmarks: toggle + /account privacy -----------------------------
    const bm = await api("PUT", `/api/decks/${deck.id}/bookmark`, { cookie: bob.cookie });
    check("bob bookmarks → {bookmarked: true}", j(bm.json).bookmarked === true, bm.json);
    await api("PUT", `/api/decks/${deck.id}/bookmark`, { cookie: bob.cookie });
    const [{ n: bmRows }] = await sql`
      select count(*)::int as n from deck_bookmarks
      where deck_id = ${deck.id} and user_id = ${bob.id}`;
    check("double-bookmark stays one row", Number(bmRows) === 1, bmRows);

    const bobAccount = await api("GET", "/account", { cookie: bob.cookie });
    check(
      "bookmarked deck on bob's /account",
      bobAccount.status === 200 && bobAccount.text.includes(`Engage Smoke ${run}`),
    );
    const aliceAccount = await api("GET", "/account", { cookie: alice.cookie });
    check(
      "alice's Bookmarks stays empty (bookmarks are per-user)",
      aliceAccount.text.includes("No bookmarks yet"),
    );

    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "private" },
    });
    check(
      "bookmark of a now-private deck hidden from bob's /account",
      !(await api("GET", "/account", { cookie: bob.cookie })).text.includes(`Engage Smoke ${run}`),
    );
    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });
    check(
      "reopened public → bookmark reappears",
      (await api("GET", "/account", { cookie: bob.cookie })).text.includes(`Engage Smoke ${run}`),
    );

    const unbm = await api("DELETE", `/api/decks/${deck.id}/bookmark`, { cookie: bob.cookie });
    check("remove bookmark → {bookmarked: false}", j(unbm.json).bookmarked === false, unbm.json);
    check(
      "removed bookmark gone from bob's /account",
      !(await api("GET", "/account", { cookie: bob.cookie })).text.includes(`Engage Smoke ${run}`),
    );

    // ---- home rail: real data only ----------------------------------------
    const homePublic = await api("GET", "/");
    check(
      "public deck on the home rail",
      homePublic.status === 200 && homePublic.text.includes(`Engage Smoke ${run}`),
    );
    check("rail shows the like count", homePublic.text.includes("♥"), "no ♥ in home HTML");

    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "unlisted" },
    });
    check(
      "unlisted deck off the rail immediately",
      !(await api("GET", "/")).text.includes(`Engage Smoke ${run}`),
    );

    // ---- share page carries count + sign-in affordance --------------------
    const share = await api("GET", `/d/${deck.publicId}`);
    check(
      "share page SSRs the like count (signed out)",
      share.status === 200 && share.text.includes("Like · 1"),
    );

    // ---- signed-in engagement on a guest-built deck -----------------------
    const guestRes = await api("POST", "/api/decks", {
      body: { game: "mtg", format: "commander", name: `Engage Guest ${run}` },
    });
    const guest = j<{ id: string }>(j(guestRes.json).deck);
    const guestToken = j(guestRes.json).claimToken as string;
    cleanup.deckIds.push(requireDeckId("guest deck create", guestRes, guest.id));
    await api("PATCH", `/api/decks/${guest.id}`, {
      deckToken: guestToken,
      body: { visibility: "public" },
    });
    const guestLike = await api("PUT", `/api/decks/${guest.id}/like`, { cookie: bob.cookie });
    check(
      "signed-in user likes a guest-built deck → 200",
      guestLike.status === 200 && j(guestLike.json).likesCount === 1,
      guestLike.json,
    );

    // ---- deck delete cascades engagement rows -----------------------------
    check(
      "owner deletes deck → 204",
      (await api("DELETE", `/api/decks/${guest.id}`, { deckToken: guestToken })).status === 204,
    );
    const [{ n: orphans }] = await sql`
      select count(*)::int as n from deck_likes where deck_id = ${guest.id}`;
    check("deck delete cascades its likes", Number(orphans) === 0, orphans);
  } finally {
    // Only real ids reach the DELETEs: an undefined here once crashed the
    // cleanup itself and left the fixtures behind.
    const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;
    const deckIds = cleanup.deckIds.filter(isId);
    const userIds = cleanup.userIds.filter(isId);
    if (deckIds.length > 0) {
      await sql`delete from decks where id in ${sql(deckIds)}`;
    }
    if (userIds.length > 0) {
      // Sessions + their remaining likes/bookmarks go with the users (FK cascade).
      await sql`delete from users where id in ${sql(userIds)}`;
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
