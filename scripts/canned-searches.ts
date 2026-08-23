/**
 * P0.6 acceptance harness: 10 canned searches against /api/cards/search, with
 * correctness assertions on real ingested data plus a warm-p95 latency check
 * (budget: < ~150ms). Run against local dev or the deployment:
 *
 *   pnpm search:canned                              # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm search:canned
 *
 * Note: p95 measured here includes network RTT to the target; the budget is
 * meant for warm server-side latency, so run against the nearest target when
 * a number looks suspicious.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

interface Result {
  id: string;
  name: string;
  primaryType: string | null;
  costValue: number | null;
  ciMask: number;
  cheapestUsd: number | null;
  image: string | null;
}

interface SearchResponse {
  results: Result[];
  total: number;
}

interface Canned {
  label: string;
  params: string;
  assert: (r: SearchResponse) => string | null; // null = pass, string = failure reason
}

const W = 1;
const WU = 3;

const CANNED: Canned[] = [
  {
    label: "exact-ish name → Sol Ring first",
    params: "name=sol ring",
    assert: (r) => (r.results[0]?.name === "Sol Ring" ? null : `first was ${r.results[0]?.name}`),
  },
  {
    label: "typo name (trgm) → finds Lightning Bolt",
    params: "name=lighting bolt",
    assert: (r) =>
      r.results.some((x) => x.name === "Lightning Bolt") ? null : "Lightning Bolt not in results",
  },
  {
    label: "FTS text + type filter → instants that draw",
    params: "text=draw a card&type=Instant&limit=100",
    assert: (r) => {
      if (r.total < 100) return `only ${r.total} results`;
      const bad = r.results.find((x) => x.primaryType !== "Instant");
      return bad ? `${bad.name} is ${bad.primaryType}` : null;
    },
  },
  {
    label: "promoted columns: cheap white creatures (mv<=2, ci within W)",
    params: "type=Creature&mv=lte:2&ci=within:W&limit=100",
    assert: (r) => {
      const bad = r.results.find(
        (x) => x.primaryType !== "Creature" || (x.costValue ?? 0) > 2 || (x.ciMask & ~W) !== 0,
      );
      return bad ? `${bad.name} violates filters` : r.total > 500 ? null : `only ${r.total}`;
    },
  },
  {
    label: "JSONB keywords containment (all): Flying+Haste creatures",
    params: "keywords=Flying,Haste&type=Creature",
    assert: (r) => (r.total > 50 ? null : `only ${r.total} results`),
  },
  {
    label: "colorset exactly:WU",
    params: "ci=exactly:WU&type=Creature&limit=100",
    assert: (r) => {
      const bad = r.results.find((x) => x.ciMask !== WU);
      return bad ? `${bad.name} has ciMask ${bad.ciMask}` : null;
    },
  },
  {
    label: "price filter: everything at or under $0.50",
    params: "price=lte:0.5&limit=100",
    assert: (r) => {
      const bad = r.results.find((x) => x.cheapestUsd === null || x.cheapestUsd > 0.5);
      return bad ? `${bad.name} costs ${bad.cheapestUsd}` : null;
    },
  },
  {
    label: "JSONB numeric post-filter: power >= 8 finds Ghalta",
    params: "power=gte:8&type=Creature&limit=100",
    assert: (r) =>
      r.results.some((x) => x.name.startsWith("Ghalta"))
        ? null
        : "no Ghalta in top 100 by popularity",
  },
  {
    label: "FTS: proliferate cards include Contagion Clasp",
    params: "text=proliferate&sort=name&limit=100",
    assert: (r) =>
      r.results.some((x) => x.name === "Contagion Clasp") ? null : "Contagion Clasp missing",
  },
  {
    label: "sort=price desc is monotonic",
    params: "sort=price&dir=desc&limit=50",
    assert: (r) => {
      const prices = r.results.map((x) => x.cheapestUsd).filter((p): p is number => p !== null);
      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > prices[i - 1]) return `not monotonic at index ${i}`;
      }
      return prices.length ? null : "no priced results";
    },
  },
];

async function timedFetch(params: string): Promise<{ body: SearchResponse; ms: number }> {
  const url = `${BASE_URL}/api/cards/search?${params.replaceAll(" ", "+")}`;
  const start = performance.now();
  const res = await fetch(url);
  const body = (await res.json()) as SearchResponse;
  const ms = performance.now() - start;
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${JSON.stringify(body)}`);
  return { body, ms };
}

async function main() {
  console.log(`Canned searches against ${BASE_URL}\n`);
  const timings: number[] = [];
  let failures = 0;

  for (const canned of CANNED) {
    await timedFetch(canned.params); // cold warmup, untimed
    const runs = [await timedFetch(canned.params), await timedFetch(canned.params)];
    timings.push(...runs.map((r) => r.ms));
    const failure = canned.assert(runs[0].body);
    const ms = Math.round(Math.min(...runs.map((r) => r.ms)));
    if (failure) {
      failures++;
      console.error(`✗ ${canned.label}: ${failure}`);
    } else {
      console.log(`✓ ${canned.label} (${runs[0].body.total} results, warm ${ms}ms)`);
    }
  }

  timings.sort((a, b) => a - b);
  const p95 = timings[Math.ceil(0.95 * timings.length) - 1];
  const median = timings[Math.floor(timings.length / 2)];
  console.log(
    `\nwarm latency over ${timings.length} requests: median ${Math.round(median)}ms, p95 ${Math.round(p95)}ms`,
  );
  if (p95 >= 150)
    console.warn("⚠ p95 above the ~150ms budget (includes network RTT — see header note)");

  if (failures) {
    console.error(`\n${failures}/${CANNED.length} canned searches FAILED`);
    process.exit(1);
  }
  console.log(`\nAll ${CANNED.length} canned searches passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
