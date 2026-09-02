/**
 * Curl-level tests for the P2.2 surface: username claiming, folder CRUD +
 * ownership, deck→folder filing, and the /u /f /d page visibility rules.
 * Runs against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:profile                                  # against http://localhost:3000
 *   BASE_URL=http://localhost:3111 pnpm smoke:profile   # against another port
 *
 * Sessions can't come from OAuth in a script, so this mints them the way
 * better-auth would read them: two throwaway users + session rows inserted
 * directly, cookies signed with BETTER_AUTH_SECRET using better-call's
 * scheme (token + "." + base64(HMAC-SHA256(secret, token)), URI-encoded —
 * see better-call/dist/crypto.mjs). Both the plain and __Secure- cookie
 * names are sent so the server's baseURL mode doesn't matter. Everything is
 * cleaned up in `finally`, pass or fail.
 *
 * Deck creates are checked before their ids are recorded: POST /api/decks is
 * rate-limited per IP (10/hour, 30/day), and a 429 mid-run used to leave an
 * undefined id in the cleanup list — the `finally` then crashed on it
 * (postgres UNDEFINED_VALUE) and the minted users + "Smoke Deck" rows stayed
 * behind in prod (found twice on 2026-09-02). Now a failed create aborts the
 * run with the status in the message, and cleanup only ever deletes real ids.
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

/**
 * Abort the run (cleanup still runs) when a deck create didn't return an id —
 * almost always the per-IP deck-create limiter. Recording an undefined id
 * would only crash later, in cleanup, with the cause lost.
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

/** Loose JSON accessor for smoke assertions — shape mistakes fail the checks, not the compile. */
const j = <T = Record<string, unknown>>(v: unknown): T => (v ?? {}) as T;

async function main() {
  console.log(`profile+folders smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  const run = randomBytes(4).toString("hex");
  const uname = `p22-smoke-${run}`;
  const cleanup = { userIds: [] as string[], deckIds: [] as string[] };

  try {
    // ---- mint two users + sessions straight into the DB -------------------
    const mkUser = async (tag: string) => {
      const [user] = await sql`
        insert into users (name, email) values
          (${`P22 Smoke ${tag} ${run}`}, ${`p22-smoke-${tag}-${run}@smoke.invalid`})
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

    // ---- signed-out gates -------------------------------------------------
    check(
      "PATCH /api/profile signed out → 401",
      (await api("PATCH", "/api/profile", { body: { username: uname } })).status === 401,
    );
    check(
      "POST /api/folders signed out → 401",
      (await api("POST", "/api/folders", { body: { name: "x" } })).status === 401,
    );

    // ---- username claiming ------------------------------------------------
    check(
      "reserved username → 400",
      (await api("PATCH", "/api/profile", { cookie: alice.cookie, body: { username: "admin" } }))
        .status === 400,
    );
    check(
      "malformed username → 400",
      (await api("PATCH", "/api/profile", { cookie: alice.cookie, body: { username: "a_b!" } }))
        .status === 400,
    );
    const setName = await api("PATCH", "/api/profile", {
      cookie: alice.cookie,
      body: { username: uname.toUpperCase() },
    });
    check(
      "set username folds case → 200 + lowercase",
      setName.status === 200 && j(setName.json).username === uname,
      setName.json,
    );
    const taken = await api("PATCH", "/api/profile", {
      cookie: bob.cookie,
      body: { username: uname },
    });
    check("second user, same username → 409", taken.status === 409, taken.json);

    // ---- folder CRUD + ownership -----------------------------------------
    const created = await api("POST", "/api/folders", {
      cookie: alice.cookie,
      body: { name: `Smoke Folder ${run}` },
    });
    const folder = j<{ id: string; publicId: string }>(j(created.json).folder);
    check(
      "create folder → 201 (unlisted default)",
      created.status === 201 && j(j(created.json).folder).visibility === "unlisted",
      created.json,
    );
    check(
      "duplicate folder name (case-folded) → 409",
      (
        await api("POST", "/api/folders", {
          cookie: alice.cookie,
          body: { name: `SMOKE FOLDER ${run}` },
        })
      ).status === 409,
    );
    check(
      "stranger PATCH folder → 403",
      (
        await api("PATCH", `/api/folders/${folder.id}`, {
          cookie: bob.cookie,
          body: { name: "mine now" },
        })
      ).status === 403,
    );
    check(
      "unknown folder id → 404",
      (
        await api("PATCH", `/api/folders/${randomUUID()}`, {
          cookie: alice.cookie,
          body: { name: "x" },
        })
      ).status === 404,
    );

    // ---- decks into folders ----------------------------------------------
    const deckRes = await api("POST", "/api/decks", {
      cookie: alice.cookie,
      body: { game: "mtg", format: "commander", name: `Smoke Deck ${run}` },
    });
    const deck = j<{ id: string; publicId: string }>(j(deckRes.json).deck);
    cleanup.deckIds.push(requireDeckId("session deck create", deckRes, deck.id));
    check(
      "session deck created (no claim token)",
      deckRes.status === 201 && j(deckRes.json).claimToken === null,
      deckRes.json,
    );

    const filed = await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { folderId: folder.id },
    });
    check(
      "file deck into own folder → 200 + folderId echoed",
      filed.status === 200 && j(j(filed.json).deck).folderId === folder.id,
      filed.json,
    );

    const bobFolderRes = await api("POST", "/api/folders", {
      cookie: bob.cookie,
      body: { name: `Bob Folder ${run}` },
    });
    const bobFolder = j<{ id: string }>(j(bobFolderRes.json).folder);
    check(
      "file deck into a stranger's folder → 400",
      (
        await api("PATCH", `/api/decks/${deck.id}`, {
          cookie: alice.cookie,
          body: { folderId: bobFolder.id },
        })
      ).status === 400,
    );

    const guestRes = await api("POST", "/api/decks", {
      body: { game: "mtg", format: "commander", name: `Smoke Guest ${run}` },
    });
    const guest = j<{ id: string }>(j(guestRes.json).deck);
    const guestToken = j(guestRes.json).claimToken as string;
    cleanup.deckIds.push(requireDeckId("guest deck create", guestRes, guest.id));
    check(
      "guest deck into a folder → 400 (sign in first)",
      (
        await api("PATCH", `/api/decks/${guest.id}`, {
          deckToken: guestToken,
          body: { folderId: folder.id },
        })
      ).status === 400,
    );

    // ---- pages: /f, /u, /d visibility rules ------------------------------
    check("GET /u/<missing> → 404", (await api("GET", `/u/nobody-${run}`)).status === 404);
    check("GET /f/<missing> → 404", (await api("GET", "/f/zz99zz99zz99")).status === 404);

    const fAnon = await api("GET", `/f/${folder.publicId}`);
    check(
      "folder page shows unlisted deck to anon",
      fAnon.status === 200 && fAnon.text.includes(`Smoke Deck ${run}`),
    );

    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "private" },
    });
    check(
      "private deck vanishes from anon folder page",
      !(await api("GET", `/f/${folder.publicId}`)).text.includes(`Smoke Deck ${run}`),
    );
    check(
      "owner still sees it (marked private)",
      (await api("GET", `/f/${folder.publicId}`, { cookie: alice.cookie })).text.includes(
        `Smoke Deck ${run}`,
      ),
    );

    const uBefore = await api("GET", `/u/${uname}`);
    check(
      "profile live at /u/<username>",
      uBefore.status === 200 && uBefore.text.includes(`P22 Smoke a ${run}`),
    );
    check(
      "profile hides non-public decks and unlisted folders",
      !uBefore.text.includes(`Smoke Deck ${run}`) && !uBefore.text.includes(`Smoke Folder ${run}`),
    );

    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });
    await api("PATCH", `/api/folders/${folder.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });
    const uAfter = await api("GET", `/u/${uname}`);
    check(
      "public deck + folder appear on profile",
      uAfter.text.includes(`Smoke Deck ${run}`) && uAfter.text.includes(`Smoke Folder ${run}`),
    );

    check(
      "share page byline links the profile",
      (await api("GET", `/d/${deck.publicId}`)).text.includes(`/u/${uname}`),
    );

    await api("PATCH", `/api/folders/${folder.id}`, {
      cookie: alice.cookie,
      body: { visibility: "private" },
    });
    check(
      "private folder page → denial shell for anon",
      (await api("GET", `/f/${folder.publicId}`)).text.includes("This folder is private"),
    );

    // ---- delete folder keeps decks ---------------------------------------
    check(
      "DELETE folder → 204",
      (await api("DELETE", `/api/folders/${folder.id}`, { cookie: alice.cookie })).status === 204,
    );
    const afterDelete = await api("GET", `/api/decks/${deck.id}`, { cookie: alice.cookie });
    check(
      "deck survives folder delete, unfiled",
      afterDelete.status === 200 && j(j(afterDelete.json).deck).folderId === null,
      afterDelete.json,
    );
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
      // Sessions + remaining folders go with the users (FK cascade).
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
