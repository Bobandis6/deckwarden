/**
 * Curl-level CRUD + ownership tests for the deck API (P1.1's "done when").
 * Runs against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:decks                                  # against http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:decks   # against a deploy
 *
 * Covers: create returns claim_token exactly once · wrong/missing token 403s
 * on reads-of-private and all writes · claim_token never re-exposed · zone /
 * duplicate / unknown-card validation 400s · leader denorms · delete cascade.
 * Cleans up after itself (the deck is deleted at the end even on failure).
 */
export {}; // import-free file: stay a module so `main` doesn't collide with other scripts

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

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

async function main() {
  console.log(`deck-api smoke against ${BASE}`);
  const commander = await findCard("atraxa praetors voice");
  const staple = await findCard("sol ring");
  console.log(`  using commander "${commander.name}", staple "${staple.name}"`);

  // Create
  const created = await api("POST", "/api/decks", {
    body: { game: "mtg", format: "commander", name: "Smoke test deck" },
  });
  const createdJson = created.json as {
    deck: { id: string; visibility: string; isOwner: boolean };
    claimToken?: string;
  };
  check("create → 201", created.status === 201, created.json);
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

    // Ownership on reads: flip private first (creates default to unlisted since P1.7)
    await api("PATCH", `/api/decks/${deckId}`, { token, body: { visibility: "private" } });
    check(
      "read private, no token → 403",
      (await api("GET", `/api/decks/${deckId}`)).status === 403,
    );
    check(
      "read private, wrong token → 403",
      (await api("GET", `/api/decks/${deckId}`, { token: crypto.randomUUID() })).status === 403,
    );
    const ownerRead = await api("GET", `/api/decks/${deckId}`, { token });
    check("read private, owner token → 200", ownerRead.status === 200);
    check("claim token never re-exposed (GET)", !ownerRead.text.includes(token));
    check(
      "owner read has isOwner: true",
      (ownerRead.json as { deck?: { isOwner?: boolean } })?.deck?.isOwner === true,
    );

    // Ownership on writes
    check(
      "PATCH without token → 403",
      (await api("PATCH", `/api/decks/${deckId}`, { body: { name: "x" } })).status === 403,
    );
    check(
      "PATCH wrong token → 403",
      (
        await api("PATCH", `/api/decks/${deckId}`, {
          token: crypto.randomUUID(),
          body: { name: "x" },
        })
      ).status === 403,
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
