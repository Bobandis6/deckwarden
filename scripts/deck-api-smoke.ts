/**
 * Curl-level CRUD + ownership tests for the deck API (P1.1's "done when").
 * Runs against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:decks                                  # against http://localhost:3000
 *   SMOKE_ALLOW_REMOTE=1 BASE_URL=https://deckwarden.gg pnpm smoke:decks   # a deploy, on purpose
 *
 * Covers: create returns claim_token exactly once · wrong/missing token 403s
 * on reads-of-private and all writes · claim_token never re-exposed · zone /
 * duplicate / unknown-card validation 400s · leader denorms · delete cascade.
 * Y4b: goals ride the create; the goals PATCH `{goals}` leaves updatedAt
 * alone (a name PATCH still moves it); a visitor's GET carries the target
 * and the exceptions, never the budget or the answers; Magic's range and
 * One Piece's no-target answer 400.
 * PRECON-OWNED: a create with `fromPrecon` stores the lineage (an unknown
 * slug 400s); the owner's GET carries `deck.precon` (the precon's own list
 * in its own quantities, unanswered); the answer's PATCH `{ownsPrecon}`
 * leaves updatedAt alone; a visitor's GET carries none of it; a deck that
 * didn't start from a precon answers 400.
 * Cleans up after itself (the deck is deleted at the end even on failure).
 */
import { BASE } from "./smoke/guard"; // first import: a non-local BASE_URL exits 1 here

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { "x-deck-token": opts.token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. 204) is fine */
  }
  return { status: res.status, json, text };
}

/** Keys sorted at every depth: jsonb hands objects back in its own key order. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => [k, canon((value as Record<string, unknown>)[k])]),
  );
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function findCard(query: string): Promise<{ id: string; name: string }> {
  const { status, json } = await api(
    "GET",
    `/api/cards/search?game=mtg&name=${encodeURIComponent(query)}&limit=1`,
  );
  const results = (json as { results?: { id: string; name: string }[] })?.results ?? [];
  if (status !== 200 || results.length === 0) {
    throw new Error(`Card search for "${query}" failed (status ${status})`);
  }
  return results[0];
}

/** A slug minted once and stable forever (it is the public URL), on every branch since W8a. */
const PRECON_SLUG = "breed_lethality_c16";

/**
 * PRECON-OWNED's chain: create → GET → PATCH → visitor GET, on a deck of its
 * own (deleted at the end even on failure); `plain` is the main smoke deck,
 * which started from no precon.
 */
async function preconChain(plain: { deckId: string; token: string }) {
  type PreconWire = {
    slug: string;
    name: string;
    owns: boolean | null;
    cards: { cardId: string; qty: number }[];
  };
  type Wire = { deck?: { updatedAt?: string; precon?: PreconWire | null } };
  const seed = await api("GET", `/api/precons/${PRECON_SLUG}`);
  const seedJson = seed.json as {
    deck?: { name: string };
    cards?: {
      cardId: string;
      zone: string;
      qty: number;
      tags: string[];
      printingId: string | null;
    }[];
  };
  check("precon seed GET → 200", seed.status === 200, seed.status);
  if (seed.status !== 200 || !seedJson.cards) return;
  const copies = new Map<string, number>();
  for (const c of seedJson.cards) {
    if (c.zone === "commander" || c.zone === "main") {
      copies.set(c.cardId, (copies.get(c.cardId) ?? 0) + c.qty);
    }
  }

  check(
    "create with an unknown fromPrecon → 400",
    (
      await api("POST", "/api/decks", {
        body: { game: "mtg", format: "commander", fromPrecon: "no_such_precon_x", website: "" },
      })
    ).status === 400,
  );
  const created = await api("POST", "/api/decks", {
    body: {
      game: "mtg",
      format: "commander",
      name: seedJson.deck?.name ?? "Smoke precon deck",
      fromPrecon: PRECON_SLUG,
      website: "",
    },
  });
  const createdJson = created.json as { deck?: { id: string }; claimToken?: string };
  check("create with fromPrecon → 201", created.status === 201, created.json);
  check(
    "the create's wire never names the precon",
    !/ownsPrecon|preconDeckId|"precon"/.test(created.text),
  );
  const id = createdJson?.deck?.id;
  const token = createdJson?.claimToken;
  if (!id || !token) return;
  try {
    const put = await api("PUT", `/api/decks/${id}/cards`, {
      token,
      body: {
        cards: seedJson.cards.map(({ cardId, zone, qty, tags, printingId }) => ({
          cardId,
          zone,
          qty,
          tags,
          ...(printingId ? { printingId } : {}),
        })),
      },
    });
    check("PUT the precon's list → 200", put.status === 200, put.json);

    const first = (await api("GET", `/api/decks/${id}`, { token })).json as Wire;
    const precon = first?.deck?.precon;
    check(
      "owner GET carries deck.precon, unanswered",
      precon?.slug === PRECON_SLUG && precon?.owns === null,
      precon,
    );
    check(
      "deck.precon.cards are the precon's own copies, per identity",
      precon?.cards?.length === copies.size &&
        precon.cards.every((c) => copies.get(c.cardId) === c.qty) &&
        precon.cards.reduce((n, c) => n + c.qty, 0) === 100,
      precon?.cards?.length,
    );

    check(
      "PATCH {ownsPrecon} without the token → 403",
      (await api("PATCH", `/api/decks/${id}`, { body: { ownsPrecon: true } })).status === 403,
    );
    const answered = await api("PATCH", `/api/decks/${id}`, { token, body: { ownsPrecon: true } });
    check("PATCH {ownsPrecon: true} owner → 200", answered.status === 200, answered.json);
    const after = (await api("GET", `/api/decks/${id}`, { token })).json as Wire;
    check("the answer reads back", after?.deck?.precon?.owns === true, after?.deck?.precon?.owns);
    check(
      "the answer's PATCH leaves updatedAt alone",
      typeof first?.deck?.updatedAt === "string" && after?.deck?.updatedAt === first.deck.updatedAt,
      { before: first?.deck?.updatedAt, after: after?.deck?.updatedAt },
    );

    const visitor = await api("GET", `/api/decks/${id}`);
    check("visitor GET (unlisted) → 200", visitor.status === 200);
    check(
      "visitor GET carries no precon, no lineage, no answer",
      !/"precon"|ownsPrecon|preconDeckId/.test(visitor.text) && !visitor.text.includes(PRECON_SLUG),
    );

    check(
      "PATCH {ownsPrecon} on a deck from no precon → 400",
      (
        await api("PATCH", `/api/decks/${plain.deckId}`, {
          token: plain.token,
          body: { ownsPrecon: true },
        })
      ).status === 400,
    );
  } finally {
    check(
      "DELETE the precon deck → 204",
      (await api("DELETE", `/api/decks/${id}`, { token })).status === 204,
    );
  }
}

async function main() {
  console.log(`deck-api smoke against ${BASE}`);
  const commander = await findCard("atraxa praetors voice");
  const staple = await findCard("sol ring");
  console.log(`  using commander "${commander.name}", staple "${staple.name}"`);

  // Create — with a target, as a draft's first goals edit sends it (Y4b).
  const created = await api("POST", "/api/decks", {
    body: {
      game: "mtg",
      format: "commander",
      name: "Smoke test deck",
      goals: { v: 1, targetLevel: 3 },
    },
  });
  const createdJson = created.json as {
    deck: { id: string; visibility: string; isOwner: boolean; goals?: unknown };
    claimToken?: string;
  };
  check("create → 201", created.status === 201, created.json);
  check(
    "create carries its goals (Y4b)",
    same(createdJson?.deck?.goals, { v: 1, targetLevel: 3 }),
    createdJson?.deck?.goals,
  );
  const token = createdJson?.claimToken;
  const deckId = createdJson?.deck?.id;
  check("create returns claimToken", typeof token === "string" && token!.length > 0);
  // P1.7 flipped the create default private → unlisted (share links work out of the box).
  check("create defaults to unlisted", createdJson?.deck?.visibility === "unlisted");
  if (!deckId || !token) throw new Error("create failed; aborting");

  try {
    // Bad-format create
    const badCreate = await api("POST", "/api/decks", { body: { game: "mtg", format: "modern" } });
    check("create with unseeded format → 400", badCreate.status === 400);
    // One Piece declares no brackets: a target answers 400 and mints nothing (Y4b).
    const opTarget = await api("POST", "/api/decks", {
      body: { game: "optcg", format: "standard", goals: { v: 1, targetLevel: 2 } },
    });
    check("One Piece create with a target → 400", opTarget.status === 400, opTarget.json);

    // Ownership on reads: flip private first (creates default to unlisted since P1.7).
    // A private deck a caller can't read or edit is the unknown id's 404 on every
    // gate (route-helpers.ts, the 2026-10-30 security audit's deck-oracle record):
    // the uuid a reader kept must not tell "made private" from "deleted".
    await api("PATCH", `/api/decks/${deckId}`, { token, body: { visibility: "private" } });
    const unknownRead = await api("GET", `/api/decks/${crypto.randomUUID()}`);
    const privateRead = await api("GET", `/api/decks/${deckId}`);
    check(
      "read private, no token → 404, the unknown id's answer",
      privateRead.status === 404 &&
        unknownRead.status === 404 &&
        privateRead.text === unknownRead.text,
      [privateRead.status, privateRead.text, unknownRead.text],
    );
    check(
      "read private, wrong token → 404",
      (await api("GET", `/api/decks/${deckId}`, { token: crypto.randomUUID() })).status === 404,
    );
    const ownerRead = await api("GET", `/api/decks/${deckId}`, { token });
    check("read private, owner token → 200", ownerRead.status === 200);
    check("claim token never re-exposed (GET)", !ownerRead.text.includes(token));
    check(
      "owner read has isOwner: true",
      (ownerRead.json as { deck?: { isOwner?: boolean } })?.deck?.isOwner === true,
    );

    // Ownership on writes — still private here, so the refusal is the same 404;
    // the unlisted deck's 403s are pinned below (goals, cards, DELETE).
    check(
      "PATCH private without token → 404",
      (await api("PATCH", `/api/decks/${deckId}`, { body: { name: "x" } })).status === 404,
    );
    check(
      "PATCH private with a wrong token → 404",
      (
        await api("PATCH", `/api/decks/${deckId}`, {
          token: crypto.randomUUID(),
          body: { name: "x" },
        })
      ).status === 404,
    );
    const patched = await api("PATCH", `/api/decks/${deckId}`, {
      token,
      body: { name: "Smoke test deck v2", visibility: "unlisted" },
    });
    check("PATCH owner → 200", patched.status === 200, patched.json);
    check("claim token never re-exposed (PATCH)", !patched.text.includes(token));

    // Notes round-trip (P2.7): long-form field, separate from description
    const notes = "Mulligan aggressively for ramp.\n\nLine two of the primer.";
    const notesPatch = await api("PATCH", `/api/decks/${deckId}`, { token, body: { notes } });
    check(
      "PATCH notes → 200 and echoed",
      notesPatch.status === 200 &&
        (notesPatch.json as { deck?: { notes?: string } })?.deck?.notes === notes,
      notesPatch.json,
    );
    check(
      "PATCH over-cap notes → 400",
      (await api("PATCH", `/api/decks/${deckId}`, { token, body: { notes: "x".repeat(20001) } }))
        .status === 400,
    );
    const publicRead = await api("GET", `/api/decks/${deckId}`);
    check("unlisted readable without token → 200", publicRead.status === 200);
    check(
      "notes round-trip on GET",
      (publicRead.json as { deck?: { notes?: string } })?.deck?.notes === notes,
    );
    check(
      "non-owner read has isOwner: false",
      (publicRead.json as { deck?: { isOwner?: boolean } })?.deck?.isOwner === false,
    );

    // Card list writes
    const list = {
      cards: [
        { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
        { cardId: staple.id, zone: "main", qty: 1, tags: ["Ramp"] },
      ],
    };
    check(
      "PUT cards without token → 403",
      (await api("PUT", `/api/decks/${deckId}/cards`, { body: list })).status === 403,
    );
    const putCards = await api("PUT", `/api/decks/${deckId}/cards`, { token, body: list });
    const putJson = putCards.json as { count?: number; leaderIds?: string[]; ciMask?: number };
    check("PUT cards owner → 200", putCards.status === 200, putCards.json);
    check("leader_ids denorm has the commander", putJson?.leaderIds?.[0] === commander.id);
    check("deck ci_mask denorm is non-zero", (putJson?.ciMask ?? 0) > 0);

    check(
      "PUT with unknown zone → 400",
      (
        await api("PUT", `/api/decks/${deckId}/cards`, {
          token,
          body: { cards: [{ cardId: staple.id, zone: "sideboard", qty: 1, tags: [] }] },
        })
      ).status === 400,
    );
    check(
      "PUT with duplicate (zone,card) → 400",
      (
        await api("PUT", `/api/decks/${deckId}/cards`, {
          token,
          body: {
            cards: [
              { cardId: staple.id, zone: "main", qty: 1, tags: [] },
              { cardId: staple.id, zone: "main", qty: 2, tags: [] },
            ],
          },
        })
      ).status === 400,
    );
    check(
      "PUT breaking commander-zone max → 400",
      (
        await api("PUT", `/api/decks/${deckId}/cards`, {
          token,
          body: {
            cards: [{ cardId: commander.id, zone: "commander", qty: 3, tags: [] }],
          },
        })
      ).status === 400,
    );
    check(
      "PUT with unknown card id → 400",
      (
        await api("PUT", `/api/decks/${deckId}/cards`, {
          token,
          body: { cards: [{ cardId: crypto.randomUUID(), zone: "main", qty: 1, tags: [] }] },
        })
      ).status === 400,
    );

    // Goals (Y4b, WAVE4 D5): their own PATCH body — a setting, never an
    // edit — so updatedAt (every "recent" order) stays where it was.
    type Wire = { deck?: { updatedAt?: string; goals?: unknown } };
    const goals = {
      v: 1,
      targetLevel: 2,
      exceptions: "One thematic Game Changer — ask me",
      budget: { perCardUsd: 5 },
      answers: { rulesetVersion: 1, play: { fast: "no" } },
    };
    const beforeGoals = (await api("GET", `/api/decks/${deckId}`, { token })).json as Wire;
    check(
      "PATCH {goals} without token → 403",
      (await api("PATCH", `/api/decks/${deckId}`, { body: { goals } })).status === 403,
    );
    const goalsPatch = await api("PATCH", `/api/decks/${deckId}`, { token, body: { goals } });
    check(
      "PATCH {goals} owner → 200, echoed whole",
      goalsPatch.status === 200 && same((goalsPatch.json as Wire)?.deck?.goals, goals),
      goalsPatch.json,
    );
    const ownerGoals = (await api("GET", `/api/decks/${deckId}`, { token })).json as Wire;
    check(
      "a goals PATCH leaves updatedAt alone",
      typeof beforeGoals?.deck?.updatedAt === "string" &&
        ownerGoals?.deck?.updatedAt === beforeGoals.deck.updatedAt,
      { before: beforeGoals?.deck?.updatedAt, after: ownerGoals?.deck?.updatedAt },
    );
    check(
      "owner GET carries every goal",
      same(ownerGoals?.deck?.goals, goals),
      ownerGoals?.deck?.goals,
    );
    const visitorGoals = await api("GET", `/api/decks/${deckId}`);
    check(
      "visitor GET: the target and the exceptions, never the budget or the answers",
      same((visitorGoals.json as Wire)?.deck?.goals, {
        v: 1,
        targetLevel: 2,
        exceptions: goals.exceptions,
      }) && !/budget|answers|rulesetVersion/.test(visitorGoals.text),
      (visitorGoals.json as Wire)?.deck?.goals,
    );
    check(
      "PATCH a target out of range → 400",
      (
        await api("PATCH", `/api/decks/${deckId}`, {
          token,
          body: { goals: { v: 1, targetLevel: 6 } },
        })
      ).status === 400,
    );
    const cleared = await api("PATCH", `/api/decks/${deckId}`, { token, body: { goals: null } });
    check(
      "PATCH {goals: null} clears",
      cleared.status === 200 && (cleared.json as Wire)?.deck?.goals === null,
      cleared.json,
    );
    const renamed = await api("PATCH", `/api/decks/${deckId}`, {
      token,
      body: { name: "Smoke test deck v3" },
    });
    check(
      "a name PATCH still moves updatedAt",
      (renamed.json as Wire)?.deck?.updatedAt !== beforeGoals?.deck?.updatedAt,
      (renamed.json as Wire)?.deck?.updatedAt,
    );

    const afterPut = await api("GET", `/api/decks/${deckId}`, { token });
    const afterJson = afterPut.json as {
      deck?: { leaderIds?: string[] };
      cards?: { cardId: string; card: { name: string } }[];
    };
    check("GET returns 2 card entries", afterJson?.cards?.length === 2, afterJson?.cards?.length);
    check(
      "GET card entries join card data",
      afterJson?.cards?.some((c) => c.card?.name === staple.name) === true,
    );

    // A deck started from a precon (PRECON-OWNED), beside this one.
    await preconChain({ deckId, token });

    // Delete
    check(
      "DELETE without token → 403",
      (await api("DELETE", `/api/decks/${deckId}`)).status === 403,
    );
  } finally {
    const deleted = await api("DELETE", `/api/decks/${deckId}`, { token });
    check("DELETE owner → 204", deleted.status === 204);
    check(
      "deleted deck GET → 404",
      (await api("GET", `/api/decks/${deckId}`, { token })).status === 404,
    );
  }

  check(
    "unknown deck id → 404",
    (await api("GET", `/api/decks/${crypto.randomUUID()}`)).status === 404,
  );
  check("malformed deck id → 404", (await api("GET", "/api/decks/not-a-uuid")).status === 404);

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nall deck-api smoke checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
