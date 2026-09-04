/**
 * P4.2 deck-path smoke: ONE anonymous OP deck via the API, one PUT whose list
 * trips every validator rule at once, assert the issue codes, DELETE. Runs
 * against a live server + real DB — deliberately outside `pnpm check`.
 *
 *   pnpm smoke:optcg-deck                                  # localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:optcg-deck   # against prod
 *
 * Budget: exactly one deck create (prod limiter: 10/h + 30/day per IP, fixed
 * windows) — read rate_limit_counters before a prod run. The deck is deleted
 * at the end even on failure.
 *
 * Card choices ride the LIVE banlist rows (bandai:2026-04-10): Reject
 * OP06-116 (banned, Yellow), the OP07-115+EB04-058 pair (Yellow), plus a
 * searched mono-Yellow leader/filler and a mono-Red off-color card.
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
): Promise<{ status: number; json: unknown }> {
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
    /* non-JSON is fine */
  }
  return { status: res.status, json };
}

interface WireCard {
  id: string;
  name: string;
  ciMask: number;
  attrs: Record<string, unknown>;
  legality?: { status: string; condition?: { type: string } }[];
}

/** Resolve card numbers through the import path (pass 0) — also under test. */
async function resolveIds(ids: string[]): Promise<Map<string, WireCard>> {
  const { status, json } = await api("POST", "/api/cards/resolve", {
    body: { game: "optcg", format: "standard", names: ids },
  });
  const results =
    (json as { results?: { input: string; match: WireCard | null }[] })?.results ?? [];
  check("resolve (pass 0) → 200 with all matches", status === 200 && results.every((r) => r.match));
  return new Map(results.filter((r) => r.match).map((r) => [r.input, r.match!]));
}

async function search(params: string): Promise<WireCard[]> {
  const { status, json } = await api("GET", `/api/cards/search?game=optcg&${params}`);
  if (status !== 200) throw new Error(`search ${params} → ${status}`);
  return (json as { results?: WireCard[] })?.results ?? [];
}

const YELLOW = 1;
const RED = 8;

async function main() {
  console.log(`optcg deck smoke against ${BASE}`);

  // --- Cast: live banlist cards + searched fillers ---------------------------
  const byId = await resolveIds(["OP06-116", "OP07-115", "EB04-058"]);
  const reject = byId.get("OP06-116")!;
  const pairA = byId.get("OP07-115")!;
  const pairB = byId.get("EB04-058")!;
  check(
    "Reject OP06-116 carries an unconditional banned row",
    (reject.legality ?? []).some((l) => l.status === "banned" && !l.condition),
    reject.legality,
  );
  check(
    "OP07-115 carries a banned_with condition row",
    (pairA.legality ?? []).some((l) => l.condition?.type === "banned_with"),
    pairA.legality,
  );

  const leaders = await search("type=Leader&limit=60");
  const leader = leaders.find((c) => c.ciMask === YELLOW);
  if (!leader) throw new Error("no mono-Yellow leader found via search");
  const chars = await search("type=Character&limit=60");
  const yellowChar = chars.find(
    (c) => c.ciMask === YELLOW && ![reject.id, pairA.id, pairB.id].includes(c.id),
  );
  const redChar = chars.find((c) => c.ciMask === RED);
  if (!yellowChar || !redChar) throw new Error("filler characters not found via search");
  console.log(`  leader "${leader.name}", 5x "${yellowChar.name}", off-color "${redChar.name}"`);

  // --- One deck, one PUT tripping every rule ---------------------------------
  const created = await api("POST", "/api/decks", {
    body: { game: "optcg", format: "standard", name: "P4.2 smoke (delete me)", website: "" },
  });
  const createdJson = created.json as { deck?: { id: string }; claimToken?: string };
  check("create optcg/standard deck → 201", created.status === 201, created.json);
  const deckId = createdJson?.deck?.id;
  const token = createdJson?.claimToken;
  if (!deckId || !token) throw new Error("deck create gave no id/token — aborting");

  try {
    // 12 main cards (≠50 → DECK_SIZE+ZONE_SIZE), 4x banned Reject (BANNED),
    // both pair halves (BANNED_PAIR), 5x one number (COPY_LIMIT), 1 Red under
    // a Yellow leader (COLOR_IDENTITY).
    const put = await api("PUT", `/api/decks/${deckId}/cards`, {
      token,
      body: {
        cards: [
          { cardId: leader.id, zone: "leader", qty: 1, tags: [] },
          { cardId: reject.id, zone: "main", qty: 4, tags: [] },
          { cardId: pairA.id, zone: "main", qty: 1, tags: [] },
          { cardId: pairB.id, zone: "main", qty: 1, tags: [] },
          { cardId: yellowChar.id, zone: "main", qty: 5, tags: [] },
          { cardId: redChar.id, zone: "main", qty: 1, tags: [] },
        ],
      },
    });
    check("PUT cards → 200 (issues reported, never a rejection)", put.status === 200, put.json);
    const validation = (put.json as { validation?: { code: string }[] })?.validation ?? [];
    const codes = new Set(validation.map((v) => v.code));
    for (const expected of [
      "DECK_SIZE",
      "ZONE_SIZE",
      "BANNED",
      "BANNED_PAIR",
      "COPY_LIMIT",
      "COLOR_IDENTITY",
    ]) {
      check(`validation reports ${expected}`, codes.has(expected), [...codes]);
    }
    check(
      "no UNKNOWN_CARD / ZONE_UNKNOWN noise",
      !codes.has("UNKNOWN_CARD") && !codes.has("ZONE_UNKNOWN"),
      [...codes],
    );
  } finally {
    const del = await api("DELETE", `/api/decks/${deckId}`, { token });
    check("DELETE deck → 204/200", del.status === 204 || del.status === 200, del.status);
  }

  console.log(failures === 0 ? "\nall green" : `\n${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
