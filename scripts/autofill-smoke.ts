/**
 * End-to-end smoke for the autofill engine (W9a): POSTs /api/decks/autofill
 * against live data — no deck rows are ever created (the route writes
 * nothing). Runs outside `pnpm check` (live server + DB).
 *
 *   pnpm smoke:autofill                                  # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:autofill   # against a deploy
 *
 * Five commanders, per the W9a acceptance:
 *   - Atraxa, Praetors' Voice — 99 picks, no validation errors, evidence on
 *     every pick, real sources, topdeck evidence present (aggregate-rich);
 *   - Kinnan, Bonder Prodigy — locked tier appears (1,474-list corpus);
 *   - Talrand, Sky Summoner — ZERO topdeck-top16 evidence (honest absence);
 *   - Thrasios + Tymna — partner pair fills 98;
 *   - Kozilek, Butcher of Truth — colorless: Wastes as filler.
 * Plus: seed determinism (same seed → identical picks; another seed → ≥ 15
 * different picks), budgetUsd: 1 honesty (≤ $1 or a stated shortfall note),
 * One Piece → 400, no-store caching.
 *
 * Budget: ~11 POSTs — under the 20/min deckAutofill bucket. Never retry
 * into a 429; `pnpm counters:reset` if a manual battery preceded this.
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

interface Pick {
  cardId: string;
  zone: string;
  qty: number;
  group: string;
  tier: string;
  evidence: { source: string; why: string }[];
  cheapestUsd: string | null;
}
interface ShellResponse {
  seed: number;
  picks: Pick[];
  groups: { id: string; label: string; picks: number }[];
  notes: string[];
  totals: { picks: number; estUsd: number | null; unpriced: number };
  issues: { severity: string; message: string }[];
  cards: { id: string; name: string }[];
}

async function autofill(body: unknown): Promise<{
  status: number;
  json: ShellResponse & { error?: string };
  headers: Headers;
}> {
  const res = await fetch(`${BASE}/api/decks/autofill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json()) as ShellResponse & { error?: string },
    headers: res.headers,
  };
}

async function findCard(query: string): Promise<{ id: string; name: string }> {
  const res = await fetch(
    `${BASE}/api/cards/search?game=mtg&name=${encodeURIComponent(query)}&limit=1`,
  );
  const json = (await res.json()) as { results?: { id: string; name: string }[] };
  const hit = json.results?.[0];
  if (res.status !== 200 || !hit) throw new Error(`Card search for "${query}" failed`);
  return hit;
}

const qty = (r: ShellResponse) => r.picks.reduce((n, p) => n + p.qty, 0);
const nameOf = (r: ShellResponse, id: string) => r.cards.find((c) => c.id === id)?.name ?? id;

async function main() {
  console.log(`autofill smoke against ${BASE}`);

  const [atraxa, kinnan, talrand, thrasios, tymna, kozilek] = await Promise.all(
    [
      "Atraxa, Praetors' Voice",
      "Kinnan, Bonder Prodigy",
      "Talrand, Sky Summoner",
      "Thrasios, Triton Hero",
      "Tymna the Weaver",
      "Kozilek, Butcher of Truth",
    ].map(findCard),
  );

  console.log("\nAtraxa — full shell, evidence contract, determinism:");
  const seed = 1_234_567;
  const body = { game: "mtg", format: "commander", leaderIds: [atraxa.id], seed };
  const a1 = await autofill(body);
  check("responds 200", a1.status === 200, a1.json.error);
  check("no-store", a1.headers.get("cache-control")?.includes("no-store") === true);
  check("seed echoed", a1.json.seed === seed);
  check("exactly 99 picks", qty(a1.json) === 99, qty(a1.json));
  check("totals agree", a1.json.totals.picks === qty(a1.json));
  check(
    "validate has no errors",
    a1.json.issues.every((i) => i.severity !== "error"),
    a1.json.issues.filter((i) => i.severity === "error").slice(0, 3),
  );
  check(
    "every pick carries evidence naming a source",
    a1.json.picks.every((p) => p.evidence.length >= 1 && p.evidence.every((e) => !!e.source)),
  );
  const sources = new Set(a1.json.picks.flatMap((p) => p.evidence.map((e) => e.source)));
  check(
    "sources are the real ones",
    [...sources].every((s) =>
      ["edhrec_rank", "spellbook", "curve-template", "land-template", "topdeck-top16"].includes(s),
    ),
    [...sources],
  );
  check("topdeck evidence present for an aggregate-rich set", sources.has("topdeck-top16"));
  check(
    "lands group at the template",
    a1.json.groups.find((g) => g.id === "base")?.picks === 37,
    a1.json.groups,
  );
  check("no notes on a clean fill", a1.json.notes.length === 0, a1.json.notes);

  const a2 = await autofill(body);
  check(
    "same seed → identical picks",
    JSON.stringify(a2.json.picks.map((p) => [p.cardId, p.qty])) ===
      JSON.stringify(a1.json.picks.map((p) => [p.cardId, p.qty])),
  );
  const a3 = await autofill({ ...body, seed: seed + 1 });
  const set1 = new Set(a1.json.picks.map((p) => p.cardId));
  const diff = a3.json.picks.filter((p) => !set1.has(p.cardId)).length;
  check(`another seed → ≥ 15 different picks (got ${diff})`, diff >= 15);

  console.log("\nAtraxa — budgetUsd 1:");
  const b = await autofill({ ...body, budgetUsd: 1 });
  check("responds 200", b.status === 200, b.json.error);
  const over = b.json.picks.filter((p) => p.cheapestUsd !== null && Number(p.cheapestUsd) > 1);
  check(
    "only ≤ $1 cards",
    over.length === 0,
    over.slice(0, 3).map((p) => nameOf(b.json, p.cardId)),
  );
  check(
    "full or stated shortfall",
    qty(b.json) === 99 || b.json.notes.some((n) => n.includes("budget")),
    { picks: qty(b.json), notes: b.json.notes },
  );

  console.log("\nKinnan — locked tournament tier:");
  const k = await autofill({ game: "mtg", format: "commander", leaderIds: [kinnan.id], seed });
  check("responds 200", k.status === 200, k.json.error);
  check("99 picks", qty(k.json) === 99, qty(k.json));
  check(
    "locked tier appears (1,474-list corpus)",
    k.json.picks.some((p) => p.tier === "locked"),
  );

  console.log("\nTalrand — honest absence:");
  const t = await autofill({ game: "mtg", format: "commander", leaderIds: [talrand.id], seed });
  check("responds 200", t.status === 200, t.json.error);
  check("99 picks", qty(t.json) === 99, qty(t.json));
  check(
    "zero topdeck-top16 evidence rows",
    t.json.picks.every((p) => p.evidence.every((e) => e.source !== "topdeck-top16")),
  );

  console.log("\nThrasios + Tymna — partner pair:");
  const p = await autofill({
    game: "mtg",
    format: "commander",
    leaderIds: [thrasios.id, tymna.id],
    seed,
  });
  check("responds 200", p.status === 200, p.json.error);
  check("98 picks", qty(p.json) === 98, qty(p.json));
  check(
    "no validation errors",
    p.json.issues.every((i) => i.severity !== "error"),
    p.json.issues.filter((i) => i.severity === "error").slice(0, 3),
  );

  console.log("\nKozilek — colorless identity:");
  const z = await autofill({ game: "mtg", format: "commander", leaderIds: [kozilek.id], seed });
  check("responds 200", z.status === 200, z.json.error);
  check("99 picks", qty(z.json) === 99, qty(z.json));
  const wastes = z.json.picks.find((pk) => nameOf(z.json, pk.cardId) === "Wastes");
  check("Wastes as filler", wastes !== undefined && wastes.tier === "filler", wastes);

  console.log("\nOne Piece — the adapter declares no autofill:");
  const op = await autofill({
    game: "optcg",
    format: "standard",
    leaderIds: [atraxa.id], // never reached — the adapter gate answers first
    seed,
  });
  check("responds 400", op.status === 400, op.status);
  check("names the gate", op.json.error === "No autofill for optcg", op.json.error);

  // ------------------------------------------------------------------- W9c
  interface RandomLeader {
    leader: {
      id: string;
      name: string;
      isLeaderCandidate: boolean;
      legality: { status: string; condition?: unknown }[];
    } | null;
    error?: string;
  }
  console.log("\nGET /api/leaders/random (W9c) — 3 of the 30/min bucket:");
  const roll = async (game: string) => {
    const res = await fetch(`${BASE}/api/leaders/random?game=${game}`);
    return { status: res.status, headers: res.headers, json: (await res.json()) as RandomLeader };
  };
  const [r1, r2, rOp] = [await roll("mtg"), await roll("mtg"), await roll("optcg")];
  check("mtg responds 200", r1.status === 200, r1.json.error);
  check("no-store", r1.headers.get("cache-control")?.includes("no-store") === true);
  check("a leader candidate", r1.json.leader?.isLeaderCandidate === true, r1.json.leader?.name);
  check(
    "legal as rolled (no unconditional banned/not_legal row)",
    (r1.json.leader?.legality ?? []).every(
      (l) => l.condition != null || !["banned", "not_legal"].includes(l.status),
    ),
    r1.json.leader?.legality,
  );
  check(
    `two rolls differ (${r1.json.leader?.name} / ${r2.json.leader?.name}; 1-in-100 repeat odds — rerun on a tie)`,
    r1.json.leader?.id !== r2.json.leader?.id,
  );
  check("optcg responds 200", rOp.status === 200, rOp.json.error);
  check(
    "optcg leader candidate",
    rOp.json.leader?.isLeaderCandidate === true,
    rOp.json.leader?.name,
  );

  console.log("\nGET /api/cards/[id]/combos (W9c) — Kiki-Jiki, edge-cached:");
  const kiki = await findCard("Kiki-Jiki, Mirror Breaker");
  const comboRes = await fetch(`${BASE}/api/cards/${kiki.id}/combos?fit=31`);
  const comboJson = (await comboRes.json()) as {
    total: number;
    combos: { pieces: { id: string; name: string; externalKey: string }[] }[];
    error?: string;
  };
  check("responds 200", comboRes.status === 200, comboJson.error);
  check(
    "public s-maxage cache header (Vercel may rewrite — trust x-vercel-cache in prod)",
    comboRes.headers.get("cache-control")?.includes("s-maxage") === true ||
      BASE !== "http://localhost:3000",
    comboRes.headers.get("cache-control"),
  );
  check(
    "combos found for a combo-dense anchor",
    comboJson.total > 0 && comboJson.combos.length > 0,
  );
  check(
    "every piece carries an externalKey (the Add-N-pieces resolve path)",
    comboJson.combos.every((c) => c.pieces.every((pc) => !!pc.externalKey)),
  );
  const fit0 = await fetch(`${BASE}/api/cards/${kiki.id}/combos?fit=8`);
  const fit0Json = (await fit0.json()) as { total: number };
  check(
    "fit narrows honestly (mono-R ≤ WUBRG)",
    fit0.status === 200 && fit0Json.total <= comboJson.total,
    { mono: fit0Json.total, all: comboJson.total },
  );

  console.log(failures === 0 ? "\nautofill smoke: all green" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
