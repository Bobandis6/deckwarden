/**
 * End-to-end smoke for the recommendation engine (P3.1): builds a real guest
 * deck through the public API, then asserts the dark route's evidence
 * contract against live data. Runs outside `pnpm check` (live server + DB).
 *
 *   pnpm smoke:recommend                                  # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:recommend   # against a deploy
 *
 * Covers: every recommendation carries evidence (no bare scores) · sources
 * are the real ones (edhrec_rank / spellbook / curve-template) · deck cards
 * and basic lands never come back · color-identity fit · combo participation
 * names its deck partners (Basalt Monolith → Rings of Brighthearth) · budget
 * and limit params · tiny-deck curve evidence degrades to low confidence ·
 * no-store caching. Cleans up its deck even on failure.
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
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { "x-deck-token": opts.token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON is fine */
  }
  return { status: res.status, json, headers: res.headers };
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

interface Evidence {
  source: string;
  why: string;
  with: { cardId: string; name: string }[];
  howOften: string | null;
  confidence: string;
}
interface Rec {
  cardId: string;
  name: string;
  ciMask: number;
  cheapestUsd: string | null;
  score: number;
  confidence: string;
  evidence: Evidence[];
}

const SOURCES = new Set(["edhrec_rank", "spellbook", "curve-template"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

async function main() {
  console.log(`recommend smoke against ${BASE}`);
  const commander = await findCard("talrand sky summoner");
  const monolith = await findCard("basalt monolith");
  const counterspell = await findCard("counterspell");
  console.log(`  commander "${commander.name}", in-deck combo piece "${monolith.name}"`);

  const created = await api("POST", "/api/decks", {
    body: { game: "mtg", format: "commander", name: "Recommend smoke deck" },
  });
  const createdJson = created.json as { deck: { id: string }; claimToken?: string };
  const deckId = createdJson?.deck?.id;
  const token = createdJson?.claimToken;
  if (created.status !== 201 || !deckId || !token) throw new Error("deck create failed; aborting");

  try {
    const put = await api("PUT", `/api/decks/${deckId}/cards`, {
      token,
      body: {
        cards: [
          { cardId: commander.id, zone: "commander", qty: 1, tags: [] },
          { cardId: monolith.id, zone: "main", qty: 1, tags: [] },
          { cardId: counterspell.id, zone: "main", qty: 1, tags: [] },
        ],
      },
    });
    const deckCi = (put.json as { ciMask?: number })?.ciMask ?? 0;
    check("PUT cards → 200 with ci_mask", put.status === 200 && deckCi > 0, put.json);
    const inDeck = new Set([commander.id, monolith.id, counterspell.id]);

    const res = await api("GET", `/api/decks/${deckId}/recommendations`);
    check("GET recommendations → 200", res.status === 200, res.json);
    check("response is no-store", res.headers.get("cache-control") === "no-store");
    const recs = (res.json as { recommendations?: Rec[] })?.recommendations ?? [];
    check("returns recommendations", recs.length > 0);

    check(
      "every recommendation carries evidence — never a bare score",
      recs.every((r) => Array.isArray(r.evidence) && r.evidence.length > 0),
    );
    check(
      "evidence names real sources with honest fields",
      recs.every((r) =>
        r.evidence.every(
          (e) =>
            SOURCES.has(e.source) &&
            e.why.length > 0 &&
            CONFIDENCES.has(e.confidence) &&
            Array.isArray(e.with) &&
            (e.howOften === null || e.howOften.length > 0),
        ),
      ),
    );
    check(
      "overall confidence present and scores in [0,1]",
      recs.every((r) => CONFIDENCES.has(r.confidence) && r.score >= 0 && r.score <= 1),
    );
    check(
      "never recommends cards already in the deck",
      recs.every((r) => !inDeck.has(r.cardId)),
    );
    check(
      "color-identity fit on every recommendation",
      recs.every((r) => (r.ciMask & ~deckCi) === 0),
    );
    check(
      "basic lands are never advice",
      recs.every((r) => !BASICS.has(r.name)),
    );
    check(
      "tiny deck → any curve-template evidence degrades to low confidence",
      recs.every((r) =>
        r.evidence.every((e) => e.source !== "curve-template" || e.confidence === "low"),
      ),
    );

    // Combo participation: Basalt Monolith in deck → Rings of Brighthearth
    // (colorless, CI-fits) should surface with spellbook evidence naming it.
    const rings = recs.find((r) => r.name === "Rings of Brighthearth");
    check("combo candidate Rings of Brighthearth surfaces", rings !== undefined);
    const ringsEvidence = rings?.evidence.find((e) => e.source === "spellbook");
    check(
      "spellbook evidence names the deck partner (with what)",
      ringsEvidence !== undefined && ringsEvidence.with.some((w) => w.cardId === monolith.id),
      rings?.evidence,
    );

    const limited = await api("GET", `/api/decks/${deckId}/recommendations?limit=5`);
    const limitedRecs = (limited.json as { recommendations?: Rec[] })?.recommendations ?? [];
    check("limit=5 respected", limited.status === 200 && limitedRecs.length <= 5);

    const budget = await api("GET", `/api/decks/${deckId}/recommendations?budget=2`);
    const budgetRecs = (budget.json as { recommendations?: Rec[] })?.recommendations ?? [];
    check(
      "budget=2 → only cards with a known price ≤ $2",
      budget.status === 200 &&
        budgetRecs.length > 0 &&
        budgetRecs.every((r) => r.cheapestUsd !== null && parseFloat(r.cheapestUsd) <= 2),
    );

    check(
      "invalid budget → 400",
      (await api("GET", `/api/decks/${deckId}/recommendations?budget=-3`)).status === 400,
    );
  } finally {
    const del = await api("DELETE", `/api/decks/${deckId}`, { token });
    check("cleanup: deck deleted", del.status === 200 || del.status === 204);
  }

  console.log(failures === 0 ? "\nrecommend smoke: all green" : `\n${failures} FAILURE(S)`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
