/**
 * Curl-level tests for the P3.6 surface: named versions (save / list / diff
 * payload / restore with its safety snapshot / delete / cap), forks (account
 * -only, credit states, the frozen v1 baseline + upstream diff payload),
 * and every fork-safe delete path (single DELETE, the purge's helper).
 * Runs against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:versions                                  # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:versions   # against prod
 *
 * Sessions are minted like engagement-smoke.ts (throwaway users + session
 * rows, cookies signed with BETTER_AUTH_SECRET). Every fixture is created
 * here and deleted in `finally` — never the owner's real decks.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

import { createDb } from "../src/db";
import { diffDeckLists, type FrozenCard } from "../src/lib/decks/diff";
import { deleteDecksForkSafe } from "../src/lib/decks/forks";

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

const j = <T = Record<string, unknown>>(v: unknown): T => (v ?? {}) as T;

async function findCard(query: string): Promise<{ id: string; name: string }> {
  const { status, json } = await api(
    "GET",
    `/api/cards/search?game=mtg&name=${encodeURIComponent(query)}&limit=1`,
  );
  const results = j<{ results?: { id: string; name: string }[] }>(json).results ?? [];
  if (status !== 200 || results.length === 0) {
    throw new Error(`Card search for "${query}" failed (status ${status})`);
  }
  return results[0];
}

type ListEntry = { cardId: string; zone: string; qty: number };
type WireCard = ListEntry & { printingId: string | null };
const frozen = (cards: WireCard[]): FrozenCard[] =>
  cards.map((c) => ({ cardId: c.cardId, zone: c.zone, qty: c.qty, tags: [], printingId: null }));
const sameList = (a: ListEntry[], b: ListEntry[]) => {
  const key = (c: ListEntry) => `${c.zone}:${c.cardId}:${c.qty}`;
  return JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort());
};

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
  console.log(`versions+forks smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  const run = randomBytes(4).toString("hex");
  const cleanup = { userIds: [] as string[], deckIds: [] as string[] };

  try {
    const mkUser = async (tag: string) => {
      const [user] = await sql`
        insert into users (name, email) values
          (${`P36 Smoke ${tag} ${run}`}, ${`p36-smoke-${tag}-${run}@smoke.invalid`})
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

    const commander = await findCard("atraxa praetors voice");
    const solRing = await findCard("sol ring");
    const rhystic = await findCard("rhystic study");
    const plains = await findCard("plains");
    console.log(`  using ${commander.name} / ${solRing.name} / ${rhystic.name} / ${plains.name}`);

    // ---- alice: a public deck with a list --------------------------------
    const created = await api("POST", "/api/decks", {
      cookie: alice.cookie,
      body: {
        game: "mtg",
        format: "commander",
        name: `Version Smoke ${run}`,
        visibility: "public",
      },
    });
    const deck = j<{ id: string; publicId: string; currentVersion: number }>(j(created.json).deck);
    cleanup.deckIds.push(requireDeckId("session deck create", created, deck.id));
    check("create → currentVersion 0", created.status === 201 && deck.currentVersion === 0);

    const listV1 = [
      { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
      { cardId: solRing.id, zone: "main", qty: 1, tags: ["Ramp"] },
      { cardId: plains.id, zone: "main", qty: 3, tags: [] },
    ];
    check(
      "PUT list v1",
      (
        await api("PUT", `/api/decks/${deck.id}/cards`, {
          cookie: alice.cookie,
          body: { cards: listV1 },
        })
      ).status === 200,
    );

    // ---- save a named version --------------------------------------------
    const saved = await api("POST", `/api/decks/${deck.id}/versions`, {
      cookie: alice.cookie,
      body: { note: "baseline" },
    });
    check(
      "POST versions → 201 v1, 5 cards",
      saved.status === 201 && j(saved.json).version === 1 && j(saved.json).cardCount === 5,
      saved.json,
    );
    check(
      "stranger can't list versions → 403",
      (await api("GET", `/api/decks/${deck.id}/versions`, { cookie: bob.cookie })).status === 403,
    );
    check(
      "signed-out can't save a version → 403",
      (await api("POST", `/api/decks/${deck.id}/versions`, { body: {} })).status === 403,
    );

    // ---- edit: remove Sol Ring, add Rhystic, Plains 3 -> 5 ---------------
    const listV2 = [
      { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
      { cardId: rhystic.id, zone: "main", qty: 1, tags: [] },
      { cardId: plains.id, zone: "main", qty: 5, tags: [] },
    ];
    await api("PUT", `/api/decks/${deck.id}/cards`, {
      cookie: alice.cookie,
      body: { cards: listV2 },
    });

    const list = await api("GET", `/api/decks/${deck.id}/versions`, { cookie: alice.cookie });
    const versions = j<{
      versions: { version: number; note: string; cardCount: number }[];
      cap: number;
      currentVersion: number;
    }>(list.json);
    check(
      "GET versions → one row, cap 50, currentVersion 1",
      list.status === 200 &&
        versions.versions.length === 1 &&
        versions.versions[0].note === "baseline" &&
        versions.cap === 50 &&
        versions.currentVersion === 1,
      list.json,
    );

    const v1 = await api("GET", `/api/decks/${deck.id}/versions/1`, { cookie: alice.cookie });
    const v1json = j<{ cards: FrozenCard[]; names: Record<string, string> }>(v1.json);
    check(
      "GET versions/1 → frozen cards + names (Sol Ring named though gone from the deck)",
      v1.status === 200 && v1json.cards.length === 3 && v1json.names[solRing.id] === solRing.name,
      v1.json,
    );
    const live = j<{ cards: WireCard[] }>(
      (await api("GET", `/api/decks/${deck.id}`, { cookie: alice.cookie })).json,
    ).cards;
    const diff = diffDeckLists(v1json.cards, frozen(live));
    check(
      "diff v1 → now: +Rhystic, -Sol Ring, Plains 3→5",
      diff.added.length === 1 &&
        diff.added[0].cardId === rhystic.id &&
        diff.removed.length === 1 &&
        diff.removed[0].cardId === solRing.id &&
        diff.qtyChanged.length === 1 &&
        diff.qtyChanged[0].from === 3 &&
        diff.qtyChanged[0].to === 5 &&
        diff.moved.length === 0,
      diff,
    );
    check(
      "unknown version → 404",
      (await api("GET", `/api/decks/${deck.id}/versions/99`, { cookie: alice.cookie })).status ===
        404,
    );
    check(
      "malformed version → 404",
      (await api("GET", `/api/decks/${deck.id}/versions/abc`, { cookie: alice.cookie })).status ===
        404,
    );

    // ---- dangling printing in the frozen snapshot -------------------------
    const dangling = v1json.cards.map((c) =>
      c.cardId === solRing.id ? { ...c, printingId: randomUUID() } : c,
    );
    await sql`update deck_versions set cards = ${sql.json(dangling as never)}
      where deck_id = ${deck.id} and version = 1`;

    // ---- restore v1: one transaction, safety snapshot first ---------------
    const restored = await api("POST", `/api/decks/${deck.id}/versions/1/restore`, {
      cookie: alice.cookie,
    });
    const r = j<{
      ok: boolean;
      restoredVersion: number;
      safetyVersion: number;
      count: number;
      printingsReset: number;
      cardsDropped: number;
      leaderIds: string[];
    }>(restored.json);
    check(
      "restore v1 → 200 {restored 1, safety 2, 3 entries, 1 printing reset, 0 dropped}",
      restored.status === 200 &&
        r.ok === true &&
        r.restoredVersion === 1 &&
        r.safetyVersion === 2 &&
        r.count === 3 &&
        r.printingsReset === 1 &&
        r.cardsDropped === 0,
      restored.json,
    );
    check(
      "restore recomputed leader_ids via the shared writer",
      r.leaderIds?.[0] === commander.id,
      r.leaderIds,
    );
    const afterRestore = j<{ cards: WireCard[]; deck: { currentVersion: number } }>(
      (await api("GET", `/api/decks/${deck.id}`, { cookie: alice.cookie })).json,
    );
    check(
      "deck list equals v1 again (Sol Ring back, Rhystic gone, Plains 3)",
      sameList(afterRestore.cards, listV1),
      afterRestore.cards,
    );
    check(
      "dangling printing fell back to default (NULL)",
      afterRestore.cards.find((c) => c.cardId === solRing.id)?.printingId === null,
    );
    check("currentVersion counter → 2", afterRestore.deck.currentVersion === 2);
    const list2 = j<{ versions: { version: number; note: string; cardCount: number }[] }>(
      (await api("GET", `/api/decks/${deck.id}/versions`, { cookie: alice.cookie })).json,
    );
    check(
      "pre-restore safety snapshot exists as v2 'Before restoring v1' with 7 cards",
      list2.versions.length === 2 &&
        list2.versions[0].version === 2 &&
        list2.versions[0].note === "Before restoring v1" &&
        list2.versions[0].cardCount === 7,
      list2.versions,
    );
    const [{ leader_ids: dbLeaders, ci_mask: dbCi }] =
      await sql`select leader_ids, ci_mask from decks where id = ${deck.id}`;
    check(
      "DB denorms after restore: leader_ids=[commander], ci_mask > 0",
      (dbLeaders as string[])[0] === commander.id && Number(dbCi) > 0,
      { dbLeaders, dbCi },
    );

    // Undo the restore by restoring the safety snapshot: always reversible.
    const undo = await api("POST", `/api/decks/${deck.id}/versions/2/restore`, {
      cookie: alice.cookie,
    });
    const afterUndo = j<{ cards: WireCard[] }>(
      (await api("GET", `/api/decks/${deck.id}`, { cookie: alice.cookie })).json,
    );
    check(
      "restoring the safety snapshot reverts the restore (safety v3 minted)",
      undo.status === 200 && j(undo.json).safetyVersion === 3 && sameList(afterUndo.cards, listV2),
      afterUndo.cards,
    );

    // ---- delete a version -------------------------------------------------
    check(
      "DELETE versions/3 → 204",
      (await api("DELETE", `/api/decks/${deck.id}/versions/3`, { cookie: alice.cookie })).status ===
        204,
    );
    check(
      "deleted version is gone → 404",
      (await api("GET", `/api/decks/${deck.id}/versions/3`, { cookie: alice.cookie })).status ===
        404,
    );
    const [{ current_version: cvAfterDelete }] =
      await sql`select current_version from decks where id = ${deck.id}`;
    check("counter never rewinds (still 3 after deleting v3)", Number(cvAfterDelete) === 3);

    // ---- guest decks version too (token proof) ----------------------------
    const guestRes = await api("POST", "/api/decks", {
      body: { game: "mtg", format: "commander", name: `Version Guest ${run}` },
    });
    const guest = j<{ id: string }>(j(guestRes.json).deck);
    const guestToken = j(guestRes.json).claimToken as string;
    cleanup.deckIds.push(requireDeckId("guest deck create", guestRes, guest.id));
    const guestSave = await api("POST", `/api/decks/${guest.id}/versions`, {
      deckToken: guestToken,
      body: { note: "guest v1" },
    });
    check("guest (claim token) saves a version → 201", guestSave.status === 201, guestSave.json);

    // ---- the cap, surfaced honestly ---------------------------------------
    const filler = Array.from({ length: 49 }, (_, i) => ({
      deck_id: guest.id,
      version: i + 2,
      note: `filler ${i + 2}`,
      cards: sql.json([]),
    }));
    await sql`insert into deck_versions ${sql(filler)}`;
    await sql`update decks set current_version = 50 where id = ${guest.id}`;
    const capped = await api("POST", `/api/decks/${guest.id}/versions`, {
      deckToken: guestToken,
      body: {},
    });
    check(
      "51st version → 409 with cap 50",
      capped.status === 409 && j(capped.json).cap === 50,
      capped.json,
    );
    const cappedRestore = await api("POST", `/api/decks/${guest.id}/versions/1/restore`, {
      deckToken: guestToken,
    });
    check(
      "restore at cap → 409 (safety snapshot needs a slot)",
      cappedRestore.status === 409,
      cappedRestore.json,
    );

    // ---- forks: account-only ---------------------------------------------
    check(
      "signed-out fork → 401",
      (await api("POST", `/api/decks/${deck.id}/fork`)).status === 401,
    );
    check(
      "guest token doesn't unlock forking → 401",
      (await api("POST", `/api/decks/${deck.id}/fork`, { deckToken: guestToken })).status === 401,
    );
    const forked = await api("POST", `/api/decks/${deck.id}/fork`, { cookie: bob.cookie });
    const fork = j<{
      id: string;
      publicId: string;
      name: string;
      visibility: string;
      currentVersion: number;
      likesCount: number;
      isOwner: boolean;
    }>(j(forked.json).deck);
    cleanup.deckIds.push(requireDeckId("fork create", forked, fork.id));
    check(
      "bob forks → 201: same name, unlisted, currentVersion 1, likes 0, owner",
      forked.status === 201 &&
        fork.name === `Version Smoke ${run}` &&
        fork.visibility === "unlisted" &&
        fork.currentVersion === 1 &&
        fork.likesCount === 0 &&
        fork.isOwner === true,
      forked.json,
    );
    const [forkRow] = await sql`
      select forked_from_deck_id, user_id, claim_token, leader_ids from decks where id = ${fork.id}`;
    check(
      "DB: fork points at upstream, owned by bob, no claim token, denorm copied",
      forkRow.forked_from_deck_id === deck.id &&
        forkRow.user_id === bob.id &&
        forkRow.claim_token === null &&
        (forkRow.leader_ids as string[])[0] === commander.id,
      forkRow,
    );
    const forkGet = j<{
      cards: WireCard[];
      deck: { forkedFrom: { state: string; publicId?: string; name?: string } | null };
    }>((await api("GET", `/api/decks/${fork.id}`, { cookie: bob.cookie })).json);
    check(
      "fork's cards equal the upstream's current list",
      sameList(forkGet.cards, listV2),
      forkGet.cards,
    );
    check(
      "GET fork → forkedFrom linked with upstream publicId + name",
      forkGet.deck.forkedFrom?.state === "linked" &&
        forkGet.deck.forkedFrom.publicId === deck.publicId &&
        forkGet.deck.forkedFrom.name === `Version Smoke ${run}`,
      forkGet.deck.forkedFrom,
    );
    const forkVersions = j<{ versions: { version: number; note: string }[] }>(
      (await api("GET", `/api/decks/${fork.id}/versions`, { cookie: bob.cookie })).json,
    );
    check(
      "fork's v1 is the frozen baseline, note 'Forked from …'",
      forkVersions.versions.length === 1 &&
        forkVersions.versions[0].version === 1 &&
        forkVersions.versions[0].note?.startsWith("Forked from"),
      forkVersions.versions,
    );
    check(
      "upstream's versions untouched by the fork (still 2)",
      j<{ versions: unknown[] }>(
        (await api("GET", `/api/decks/${deck.id}/versions`, { cookie: alice.cookie })).json,
      ).versions.length === 2,
    );

    // ---- upstream-diff payload -------------------------------------------
    const up0 = j<{
      credit: { state: string };
      baseline: FrozenCard[];
      upstream: FrozenCard[];
      names: Record<string, string>;
    }>((await api("GET", `/api/decks/${fork.id}/upstream`, { cookie: bob.cookie })).json);
    check(
      "GET upstream → linked, baseline == upstream current (no changes yet)",
      up0.credit?.state === "linked" &&
        up0.baseline.length === 3 &&
        diffDeckLists(up0.baseline, up0.upstream).added.length === 0 &&
        diffDeckLists(up0.baseline, up0.upstream).removed.length === 0,
      up0,
    );
    check(
      "stranger can't read the fork's upstream payload → 403",
      (await api("GET", `/api/decks/${fork.id}/upstream`, { cookie: alice.cookie })).status === 403,
    );
    // alice keeps brewing: adds Sol Ring back
    await api("PUT", `/api/decks/${deck.id}/cards`, {
      cookie: alice.cookie,
      body: { cards: [...listV2, { cardId: solRing.id, zone: "main", qty: 1, tags: [] }] },
    });
    const up1 = j<{
      baseline: FrozenCard[];
      upstream: FrozenCard[];
      names: Record<string, string>;
    }>((await api("GET", `/api/decks/${fork.id}/upstream`, { cookie: bob.cookie })).json);
    const upDiff = diffDeckLists(up1.baseline, up1.upstream);
    check(
      "their changes since you forked: +Sol Ring (named)",
      upDiff.added.length === 1 &&
        upDiff.added[0].cardId === solRing.id &&
        up1.names[solRing.id] === solRing.name,
      upDiff,
    );

    // ---- share page: credit + fork button ---------------------------------
    const forkShare = await api("GET", `/d/${fork.publicId}`);
    check(
      "fork's share page renders 'Forked from' linking the upstream",
      forkShare.status === 200 &&
        forkShare.text.includes("Forked from") &&
        forkShare.text.includes(`/d/${deck.publicId}`),
    );
    check(
      "upstream's share page renders the Fork button (signed out → sign-in link)",
      (await api("GET", `/d/${deck.publicId}`)).text.includes("Sign in to fork decks"),
    );

    // ---- private upstream: credit without name/link -----------------------
    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "private" },
    });
    const forkGetPrivate = j<{ deck: { forkedFrom: { state: string } | null } }>(
      (await api("GET", `/api/decks/${fork.id}`, { cookie: bob.cookie })).json,
    );
    check(
      "upstream private → forkedFrom.state 'private' for bob",
      forkGetPrivate.deck.forkedFrom?.state === "private",
    );
    const upPriv = j<{ credit: { state: string }; baseline: unknown[] | null; upstream: unknown }>(
      (await api("GET", `/api/decks/${fork.id}/upstream`, { cookie: bob.cookie })).json,
    );
    check(
      "private upstream: baseline kept, upstream list withheld",
      upPriv.credit?.state === "private" &&
        Array.isArray(upPriv.baseline) &&
        upPriv.upstream === null,
      upPriv,
    );
    const forkSharePrivate = (await api("GET", `/d/${fork.publicId}`)).text;
    check(
      "fork's share page: 'Forked from a private deck', no upstream name or link",
      forkSharePrivate.includes("Forked from a private deck") &&
        !forkSharePrivate.includes(`/d/${deck.publicId}`),
    );
    check(
      "private upstream can't be forked by a stranger → 403",
      (await api("POST", `/api/decks/${deck.id}/fork`, { cookie: bob.cookie })).status === 403,
    );
    await api("PATCH", `/api/decks/${deck.id}`, {
      cookie: alice.cookie,
      body: { visibility: "public" },
    });

    // ---- fork-safe single DELETE (the fired LATER row) --------------------
    const del = await api("DELETE", `/api/decks/${deck.id}`, { cookie: alice.cookie });
    check(
      "owner deletes an upstream with a live fork → 204 (no FK 500)",
      del.status === 204,
      del.text,
    );
    cleanup.deckIds = cleanup.deckIds.filter((id) => id !== deck.id);
    const [forkAfter] = await sql`select forked_from_deck_id from decks where id = ${fork.id}`;
    check(
      "fork survives with its upstream pointer NULLed",
      forkAfter?.forked_from_deck_id === null,
      forkAfter,
    );
    const forkGetGone = j<{ deck: { forkedFrom: unknown } }>(
      (await api("GET", `/api/decks/${fork.id}`, { cookie: bob.cookie })).json,
    );
    check("upstream gone → forkedFrom null (no broken link)", forkGetGone.deck.forkedFrom === null);
    check(
      "fork's share page drops the credit line",
      !(await api("GET", `/d/${fork.publicId}`)).text.includes("Forked from"),
    );
    check(
      "fork's frozen v1 baseline still holds the provenance",
      j<{ versions: { note: string }[] }>(
        (await api("GET", `/api/decks/${fork.id}/versions`, { cookie: bob.cookie })).json,
      ).versions[0]?.note?.startsWith("Forked from") === true,
    );

    // ---- the purge's delete path (same helper the nightly script calls) ---
    await sql`update decks set forked_from_deck_id = ${guest.id} where id = ${fork.id}`;
    const { client, db } = createDb(DB_URL as string);
    try {
      const purged = await deleteDecksForkSafe(db, [guest.id]);
      check("purge helper deletes a guest upstream with a live fork → 1", purged === 1);
    } finally {
      await client.end();
    }
    cleanup.deckIds = cleanup.deckIds.filter((id) => id !== guest.id);
    const [forkAfterPurge] = await sql`select forked_from_deck_id from decks where id = ${fork.id}`;
    check(
      "fork survives the purge path with a NULLed pointer",
      forkAfterPurge?.forked_from_deck_id === null,
    );
  } finally {
    // Only real ids reach the DELETEs: an undefined here once crashed the
    // cleanup itself and left the fixtures behind.
    const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0;
    const deckIds = cleanup.deckIds.filter(isId);
    const userIds = cleanup.userIds.filter(isId);
    if (deckIds.length > 0) {
      await sql`update decks set forked_from_deck_id = null where forked_from_deck_id in ${sql(deckIds)}`;
      await sql`delete from decks where id in ${sql(deckIds)}`;
    }
    if (userIds.length > 0) {
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
