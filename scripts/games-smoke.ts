/**
 * Curl-level tests for the Y9a game journal (WAVE4 D10) against a live
 * server and the real database — deliberately outside `pnpm check`:
 *
 *   - the gate: signed out 401, a stranger 403, a guest deck 400 with the
 *     sign-in sentence, zod and the adapter's checks 400;
 *   - the list a game keeps: the first log stamps a pre-0018 version's hash
 *     and reuses it; a changed list mints ONE played snapshot that the next
 *     logs on the same list reuse — a tag or printing change included;
 *   - History: a version a game uses can't be deleted (409); the cap counts
 *     saved versions only; at the played allowance a game still logs
 *     (version null, the hash kept) and Save version and Restore still work;
 *   - Undo: a game's DELETE takes the snapshot it minted when no other game
 *     uses it, and leaves it when one does;
 *   - PATCH: the details change, the adapter's checks hold;
 *   - One Piece: 1v1, went first / second, no table level;
 *   - deleting the deck takes its games (the cascade).
 *
 *   pnpm smoke:games                                  # http://localhost:3000
 *   BASE_URL=http://localhost:3111 pnpm smoke:games   # another port
 *
 * Mints three decks (two account decks, one guest) against the per-IP
 * deck-create limiter (10/hour, 30/day) — read the counters first. Sessions
 * are minted like engagement-smoke.ts; every fixture is deleted in `finally`.
 */
import { createHmac, randomBytes } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

import { playableListHash } from "../src/lib/decks/list-hash";

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
    /* non-JSON (204s) is fine */
  }
  return { status: res.status, json, text };
}

const j = <T = Record<string, unknown>>(v: unknown): T => (v ?? {}) as T;

function requireDeckId(label: string, res: { status: number; text: string }, id: unknown): string {
  if (typeof id === "string" && id.length > 0) return id;
  throw new Error(
    `${label} failed (HTTP ${res.status}${res.status === 429 ? " — the per-IP deck-create limiter" : ""}): ${res.text.slice(0, 200)}`,
  );
}

async function main() {
  console.log(`games smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  const run = randomBytes(4).toString("hex");
  const cleanup = { userIds: [] as string[], deckIds: [] as string[] };

  try {
    const mkUser = async (tag: string) => {
      const [user] = await sql`
        insert into users (name, email) values
          (${`Y9a Smoke ${tag} ${run}`}, ${`y9a-smoke-${tag}-${run}@smoke.invalid`})
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

    const [atraxa] = await sql`
      select id from card_identities where game_id = 1 and name = 'Atraxa, Praetors'' Voice' and not is_removed limit 1`;
    const [sol] = await sql`
      select c.id, (select p.id from card_printings p where p.card_identity_id = c.id and not p.is_default and not p.is_removed limit 1) as alt
      from card_identities c where c.game_id = 1 and c.name = 'Sol Ring' and not c.is_removed limit 1`;
    const [plains] = await sql`
      select id from card_identities where game_id = 1 and name = 'Plains' and not is_removed limit 1`;
    const [rhystic] = await sql`
      select id from card_identities where game_id = 1 and name = 'Rhystic Study' and not is_removed limit 1`;
    if (!atraxa || !sol || !plains || !rhystic) throw new Error("fixture cards missing");

    const mkDeck = async (cookie: string | undefined, game: string, format: string) => {
      const res = await api("POST", "/api/decks", {
        cookie,
        body: { game, format, name: `Games Smoke ${game} ${run}` },
      });
      const json = j<{ deck: { id: string }; claimToken: string | null }>(res.json);
      cleanup.deckIds.push(requireDeckId(`${game} deck create`, res, json.deck?.id));
      return { id: json.deck.id, token: json.claimToken };
    };
    const deck = await mkDeck(alice.cookie, "mtg", "commander");
    const games = `/api/decks/${deck.id}/games`;
    const put = async (cards: unknown[]) =>
      (await api("PUT", `/api/decks/${deck.id}/cards`, { cookie: alice.cookie, body: { cards } }))
        .status;
    const LIST_A = [
      { cardId: atraxa.id, zone: "commander", qty: 1, tags: [] },
      { cardId: sol.id, zone: "main", qty: 1, tags: [] },
      { cardId: plains.id, zone: "main", qty: 3, tags: [] },
    ];
    check("PUT list A", (await put(LIST_A)) === 200);

    // ---- the gate ------------------------------------------------------------
    const out = await api("GET", games);
    check(
      "GET signed out → 401 'Sign in to keep a game journal'",
      out.status === 401 && j(out.json).error === "Sign in to keep a game journal",
      out.json,
    );
    check("a stranger → 403", (await api("GET", games, { cookie: bob.cookie })).status === 403);
    for (const body of [
      { result: "won", podSize: 4 },
      { result: "win", podSize: 9 },
      { result: "win", podSize: 4, seat: 5 },
      { result: "win", podSize: 4, tableLevel: 6 },
    ]) {
      const res = await api("POST", games, { cookie: alice.cookie, body });
      check(`POST ${JSON.stringify(body)} → 400`, res.status === 400, res.json);
    }
    const guest = await mkDeck(undefined, "mtg", "commander");
    const guestLog = await api("POST", `/api/decks/${guest.id}/games`, {
      cookie: alice.cookie,
      deckToken: guest.token ?? undefined,
      body: { result: "win", podSize: 4 },
    });
    check(
      "a guest deck (its key, signed in) → 400 'Sign in to keep a game journal'",
      guestLog.status === 400 && j(guestLog.json).error === "Sign in to keep a game journal",
      guestLog.json,
    );
    const empty = await api("GET", games, { cookie: alice.cookie });
    check(
      "GET → 200, no games, the allowance disclosed",
      empty.status === 200 &&
        JSON.stringify(j(empty.json)) ===
          JSON.stringify({ games: [], total: 0, playedSnapshots: 0, playedAllowance: 100 }),
      empty.json,
    );

    // ---- the first log stamps an old version and reuses it -------------------
    const baseline = await api("POST", `/api/decks/${deck.id}/versions`, {
      cookie: alice.cookie,
      body: { note: "baseline" },
    });
    check("Save version → 201 v1", baseline.status === 201 && j(baseline.json).version === 1);
    const hashA = playableListHash(LIST_A);
    const [v1] =
      await sql`select list_hash, kind from deck_versions where deck_id = ${deck.id} and version = 1`;
    check(
      "v1 is stamped with list A's hash, kind saved",
      v1.list_hash === hashA && v1.kind === "saved",
      v1,
    );
    // A version from before migration 0018 has no hash: simulate one.
    await sql`update deck_versions set list_hash = null where deck_id = ${deck.id} and version = 1`;
    const first = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "win", podSize: 4 },
    });
    check(
      "first log on an unchanged list reuses v1 → 201 {version 1, minted false, capped false}",
      first.status === 201 &&
        j(first.json).version === 1 &&
        j(first.json).minted === false &&
        j(first.json).capped === false,
      first.json,
    );
    const [restamped] =
      await sql`select list_hash from deck_versions where deck_id = ${deck.id} and version = 1`;
    check("…and hashed the unhashed v1 in the same transaction", restamped.list_hash === hashA);

    // ---- a changed list mints ONE played snapshot ----------------------------
    const LIST_B = [...LIST_A.slice(0, 2), { cardId: plains.id, zone: "main", qty: 4, tags: [] }];
    check("PUT list B (Plains 3 → 4)", (await put(LIST_B)) === 200);
    const second = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "loss", podSize: 4, playedOn: "2026-10-09" },
    });
    const playedV = j(second.json).version as number;
    check(
      "a changed list mints a played snapshot → {minted true}",
      second.status === 201 && j(second.json).minted === true && playedV === 2,
      second.json,
    );
    const [v2] =
      await sql`select kind, note, list_hash from deck_versions where deck_id = ${deck.id} and version = 2`;
    check(
      "v2: kind played, noted 'Played Oct 9, 2026', list B's hash",
      v2.kind === "played" &&
        v2.note === "Played Oct 9, 2026" &&
        v2.list_hash === playableListHash(LIST_B),
      v2,
    );
    const third = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "win", podSize: 4 },
    });
    check(
      "two logs on an unchanged list → one played snapshot (reused)",
      j(third.json).version === 2 && j(third.json).minted === false,
      third.json,
    );
    const RETAGGED = LIST_B.map((c) =>
      c.cardId === sol.id
        ? { ...c, tags: ["Ramp"], ...(sol.alt ? { printingId: sol.alt } : {}) }
        : c,
    );
    check("PUT list B with a tag (and another printing)", (await put(RETAGGED)) === 200);
    const fourth = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "draw", podSize: 4 },
    });
    check(
      "a tag or printing change keeps the hash → v2 again",
      j(fourth.json).version === 2 && j(fourth.json).minted === false,
      { response: fourth.json, altPrinting: Boolean(sol.alt) },
    );
    const [{ played }] =
      await sql`select count(*)::int as played from deck_versions where deck_id = ${deck.id} and kind = 'played'`;
    check("exactly one played snapshot so far", Number(played) === 1, played);

    // ---- History: a version a game uses stays; the cap counts saved only ------
    const versions = await api("GET", `/api/decks/${deck.id}/versions`, { cookie: alice.cookie });
    const vs = j<{
      versions: { version: number; kind: string }[];
      cap: number;
      playedAllowance: number;
    }>(versions.json);
    check(
      "GET versions lists kinds; cap 50, playedAllowance 100",
      vs.cap === 50 &&
        vs.playedAllowance === 100 &&
        JSON.stringify(vs.versions.map((v) => [v.version, v.kind])) ===
          JSON.stringify([
            [2, "played"],
            [1, "saved"],
          ]),
      versions.json,
    );
    for (const v of [1, 2]) {
      const res = await api("DELETE", `/api/decks/${deck.id}/versions/${v}`, {
        cookie: alice.cookie,
      });
      check(
        `DELETE v${v} (a game was played with it) → 409`,
        res.status === 409 &&
          String(j(res.json).error).startsWith("A logged game was played with this list"),
        res.json,
      );
    }

    // ---- Undo: the snapshot goes with its last game ---------------------------
    const LIST_C = [...LIST_B, { cardId: rhystic.id, zone: "main", qty: 1, tags: [] }];
    check("PUT list C (+Rhystic Study)", (await put(LIST_C)) === 200);
    const fifth = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "win", podSize: 4 },
    });
    const fifthGame = j<{ game: { id: number } }>(fifth.json).game.id;
    const mintedV = j(fifth.json).version as number;
    check("list C mints v3", j(fifth.json).minted === true && mintedV === 3, fifth.json);
    const undo = await api("DELETE", `${games}/${fifthGame}`, { cookie: alice.cookie });
    check(
      "Undo (DELETE the game) → its snapshot removed",
      undo.status === 200 && j(undo.json).snapshotRemoved === true,
      undo.json,
    );
    const [{ n: v3left }] =
      await sql`select count(*)::int as n from deck_versions where deck_id = ${deck.id} and version = 3`;
    check("…v3 is gone", Number(v3left) === 0);
    const secondGame = j<{ game: { id: number } }>(second.json).game.id;
    const keep = await api("DELETE", `${games}/${secondGame}`, { cookie: alice.cookie });
    check(
      "deleting one of three games on v2 → the snapshot stays",
      keep.status === 200 && j(keep.json).snapshotRemoved === false,
      keep.json,
    );
    const firstGame = j<{ game: { id: number } }>(first.json).game.id;
    const savedKept = await api("DELETE", `${games}/${firstGame}`, { cookie: alice.cookie });
    check(
      "deleting the game that reused a SAVED version never removes it",
      j(savedKept.json).snapshotRemoved === false,
      savedKept.json,
    );
    const [{ n: v1left }] =
      await sql`select count(*)::int as n from deck_versions where deck_id = ${deck.id} and version = 1`;
    check("…v1 is still there", Number(v1left) === 1);

    // ---- PATCH ---------------------------------------------------------------
    const thirdGame = j<{ game: { id: number } }>(third.json).game.id;
    const patched = await api("PATCH", `${games}/${thirdGame}`, {
      cookie: alice.cookie,
      body: { endTurn: 7, seat: 2, tableLevel: 3, notes: "close one" },
    });
    check(
      "PATCH the details → 200, the version unchanged",
      patched.status === 200 &&
        j(j(patched.json).game).seat === 2 &&
        j(j(patched.json).game).version === 2,
      patched.json,
    );
    const smaller = await api("PATCH", `${games}/${thirdGame}`, {
      cookie: alice.cookie,
      body: { podSize: 2 },
    });
    check("PATCH the pod to 2 — seat 2 still fits → 200", smaller.status === 200, smaller.json);
    const strand = await api("PATCH", `${games}/${thirdGame}`, {
      cookie: alice.cookie,
      body: { seat: 3 },
    });
    check("PATCH seat 3 at a 2-player table → 400", strand.status === 400, strand.json);

    // ---- the played allowance: Save and Restore never blocked ----------------
    const [{ cv }] = await sql`select current_version as cv from decks where id = ${deck.id}`;
    const filler = Array.from({ length: 99 }, (_, i) => ({
      deck_id: deck.id,
      version: Number(cv) + 1 + i,
      note: `filler ${i}`,
      cards: sql.json([]),
      list_hash: `h1:filler${String(i).padStart(23, "0")}`,
      kind: "played",
    }));
    await sql`insert into deck_versions ${sql(filler)}`;
    await sql`update decks set current_version = ${Number(cv) + 99} where id = ${deck.id}`;
    const LIST_D = [
      LIST_C[0],
      LIST_C[1],
      LIST_C[3],
      { cardId: plains.id, zone: "main", qty: 9, tags: [] },
    ];
    check("PUT list D", (await put(LIST_D)) === 200);
    const capped = await api("POST", games, {
      cookie: alice.cookie,
      body: { result: "win", podSize: 4 },
    });
    check(
      "at 100 played snapshots a game still logs → {version null, minted false, capped true}",
      capped.status === 201 &&
        j(capped.json).version === null &&
        j(capped.json).minted === false &&
        j(capped.json).capped === true,
      capped.json,
    );
    const cappedGame = j<{ game: { id: number } }>(capped.json).game.id;
    const [cappedRow] =
      await sql`select version, list_hash from deck_games where id = ${cappedGame}`;
    check(
      "…its row keeps the hash, no version",
      cappedRow.version === null && cappedRow.list_hash === playableListHash(LIST_D),
      cappedRow,
    );
    const saveAtAllowance = await api("POST", `/api/decks/${deck.id}/versions`, {
      cookie: alice.cookie,
      body: { note: "after the allowance" },
    });
    check(
      "Save version at the played allowance → 201",
      saveAtAllowance.status === 201,
      saveAtAllowance.json,
    );
    const restore = await api("POST", `/api/decks/${deck.id}/versions/1/restore`, {
      cookie: alice.cookie,
    });
    check("Restore at the played allowance → 200", restore.status === 200, restore.json);
    const listed = await api("GET", games, { cookie: alice.cookie });
    check(
      "GET → playedSnapshots 100, total 3",
      j(listed.json).playedSnapshots === 100 && j(listed.json).total === 3,
      { playedSnapshots: j(listed.json).playedSnapshots, total: j(listed.json).total },
    );

    // ---- One Piece -----------------------------------------------------------
    const op = await mkDeck(alice.cookie, "optcg", "standard");
    const opGames = `/api/decks/${op.id}/games`;
    const opLog = await api("POST", opGames, {
      cookie: alice.cookie,
      body: { result: "loss", podSize: 2, seat: 2 },
    });
    check("One Piece logs 1v1, went second → 201", opLog.status === 201, opLog.json);
    for (const body of [
      { result: "win", podSize: 4 },
      { result: "win", podSize: 2, tableLevel: 2 },
    ]) {
      const res = await api("POST", opGames, { cookie: alice.cookie, body });
      check(`One Piece ${JSON.stringify(body)} → 400`, res.status === 400, res.json);
    }

    // ---- the cascade -----------------------------------------------------------
    const gone = await api("DELETE", `/api/decks/${deck.id}`, { cookie: alice.cookie });
    check("DELETE the deck → 204", gone.status === 204, gone.status);
    const [left] = await sql`
      select (select count(*)::int from deck_games where deck_id = ${deck.id}) as games,
             (select count(*)::int from deck_versions where deck_id = ${deck.id}) as versions`;
    check(
      "the deck's games and versions are gone (ON DELETE CASCADE)",
      Number(left.games) === 0 && Number(left.versions) === 0,
      left,
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
