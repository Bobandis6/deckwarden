/**
 * Curl-level checks for X4a's set filter (WAVE3.md D4): GET /api/sets, the
 * set scope on GET /api/cards/search, and /cards?set= — and X4b's /sets
 * page (every released set a link, the default filter, ISR on Vercel) and
 * its Browse entry. Every count and
 * fixture is read from the database with the contract's own rules — never a
 * literal — because set membership moves when Scryfall adds printings and a
 * new set appears on its release date. Reads only, inside one explicit
 * read-only transaction; creates nothing.
 *
 *   pnpm smoke:sets                                  # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:sets
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import postgres from "postgres";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
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

async function getJson<T>(
  path: string,
): Promise<{ status: number; json: T; cache: string; edge: string | null }> {
  const res = await fetch(`${BASE}${path}`);
  return {
    status: res.status,
    json: (await res.json()) as T,
    cache: res.headers.get("cache-control") ?? "",
    // Vercel rewrites an API's Cache-Control to bare `public` for the client;
    // its own cache verdict is the header to trust there.
    edge: res.headers.get("x-vercel-cache"),
  };
}

interface SetRow {
  code: string;
  name: string;
  releasedAt: string;
  setType: string;
  group: "main" | "other";
  cards: number;
  ordinal: number | null;
}

interface SearchBody {
  results: { id: string; name: string; image: string | null; printingId?: string }[];
  total: number;
  warnings?: string[];
}

/** "Released", as src/lib/sets/sql.ts states it. */
const RELEASED = `NOT s.digital AND s.released_at <= (now() AT TIME ZONE 'UTC')::date`;

async function main() {
  console.log(`X4a + X4b set smoke against ${BASE}\n`);
  const sql = postgres(DB_URL!, { max: 1, prepare: false });
  try {
    await sql.begin("read only", async (tx) => {
      const [{ ro }] = await tx<{ ro: string }[]>`
        SELECT current_setting('transaction_read_only') AS ro`;
      check("the smoke's reads run read-only", ro === "on", ro);

      // ---- GET /api/sets -----------------------------------------------------
      const released = await tx.unsafe<{ code: string; set_type: string; cards: number }[]>(`
        SELECT s.code, s.set_type, count(DISTINCT p.card_identity_id)::int AS cards
        FROM sets s
        JOIN card_printings p ON p.set_id = s.id AND NOT p.is_removed
        JOIN card_identities ci ON ci.id = p.card_identity_id AND NOT ci.is_removed
        WHERE s.game_id = 1 AND ${RELEASED}
        GROUP BY s.id`);
      const hidden = await tx.unsafe<{ code: string }[]>(`
        SELECT s.code FROM sets s
        WHERE s.game_id = 1 AND NOT (${RELEASED})`);

      const sets = await getJson<{ sets: SetRow[] }>("/api/sets?game=mtg");
      check("/api/sets?game=mtg 200", sets.status === 200, sets.status);
      if (sets.edge === null) {
        check(
          "/api/sets asks for a day at the edge",
          sets.cache.includes("s-maxage=86400"),
          sets.cache,
        );
      } else {
        const again = await getJson<{ sets: SetRow[] }>("/api/sets?game=mtg");
        check("/api/sets is served from the edge cache on a repeat", again.edge === "HIT", {
          first: sets.edge,
          second: again.edge,
        });
      }
      const rows = sets.json.sets ?? [];
      check(
        "/api/sets lists every released paper set with a live card",
        rows.length === released.length,
        {
          api: rows.length,
          db: released.length,
        },
      );
      const codes = new Set(rows.map((r) => r.code));
      const leaked = hidden.filter((h) => codes.has(h.code)).map((h) => h.code);
      check("no upcoming or digital-only set is listed", leaked.length === 0, leaked);
      const sorted = rows.every((r, i) => i === 0 || rows[i - 1].releasedAt >= r.releasedAt);
      check("/api/sets is newest first", sorted);
      const mainTypes = [
        "expansion",
        "core",
        "masters",
        "commander",
        "draft_innovation",
        "eternal",
        "masterpiece",
      ];
      const dbMain = released.filter((r) => mainTypes.includes(r.set_type) || r.code === "sld");
      check(
        "main sets = the owner's lines + Eternal + bonus sheets + Secret Lair Drop",
        rows.filter((r) => r.group === "main").length === dbMain.length,
        { api: rows.filter((r) => r.group === "main").length, db: dbMain.length },
      );
      const cardsMatch = rows.every(
        (r) => released.find((d) => d.code === r.code)?.cards === r.cards,
      );
      check("every row's card count is its live cards", cardsMatch);

      // The ordinal, recomputed independently: after the same-day skip each
      // line keeps one set per day, so a set's place is the number of
      // distinct release days in its line up to its own.
      const emn = rows.find((r) => r.code === "emn");
      const [{ days }] = await tx.unsafe<{ days: number }[]>(`
        SELECT count(DISTINCT s.released_at)::int AS days
        FROM sets s
        WHERE s.game_id = 1 AND s.set_type = 'expansion' AND ${RELEASED}
          AND s.released_at <= (SELECT released_at FROM sets WHERE game_id = 1 AND code = 'emn')
          AND EXISTS (SELECT 1 FROM card_printings p JOIN card_identities ci ON ci.id = p.card_identity_id
                      WHERE p.set_id = s.id AND NOT p.is_removed AND NOT ci.is_removed)`);
      check(
        `Eldritch Moon's place = its line's release days up to it (${days}; the owner's "71st")`,
        emn?.ordinal === days,
        emn,
      );
      check(
        "core sets carry no number",
        rows.filter((r) => r.setType === "core").every((r) => r.ordinal === null),
      );

      const op = await getJson<{ sets: SetRow[] }>("/api/sets?game=optcg");
      check(
        "/api/sets?game=optcg is an honest empty list",
        op.status === 200 && op.json.sets?.length === 0,
        op.json,
      );

      // ---- The set scope on /api/cards/search ---------------------------------
      // Fixture: the newest released expansion, with the most printings per card.
      const [fixture] = await tx.unsafe<{ code: string; cards: number; printings: number }[]>(`
        SELECT s.code, count(DISTINCT p.card_identity_id)::int AS cards, count(*)::int AS printings
        FROM sets s
        JOIN card_printings p ON p.set_id = s.id AND NOT p.is_removed
        JOIN card_identities ci ON ci.id = p.card_identity_id AND NOT ci.is_removed
        WHERE s.game_id = 1 AND s.set_type = 'expansion' AND ${RELEASED}
        GROUP BY s.id ORDER BY s.released_at DESC LIMIT 1`);
      const walk: SearchBody["results"] = [];
      let total = -1;
      for (let offset = 0; offset < fixture.cards + 100; offset += 100) {
        const page = await getJson<SearchBody>(
          `/api/cards/search?game=mtg&limit=100&offset=${offset}&set=${fixture.code}&sort=number`,
        );
        if (offset === 0) total = page.json.total;
        if (!page.json.results.length) break;
        walk.push(...page.json.results);
      }
      check(
        `set=${fixture.code}: total = its live cards (${fixture.cards}; ${fixture.printings} printings)`,
        total === fixture.cards,
        total,
      );
      check(
        `set=${fixture.code}: one row per card across the pages`,
        walk.length === fixture.cards && new Set(walk.map((r) => r.id)).size === walk.length,
        walk.length,
      );
      const printingIds = walk.map((r) => r.printingId ?? "");
      const inSet = await tx<{ id: string; collector_number: string }[]>`
        SELECT p.id::text AS id, p.collector_number
        FROM card_printings p JOIN sets s ON s.id = p.set_id
        WHERE s.game_id = 1 AND s.code = ${fixture.code} AND NOT p.is_removed
          AND p.id = ANY(${printingIds}::uuid[])`;
      check(
        `set=${fixture.code}: every row shows a live printing from the set, its image derived from it`,
        inSet.length === walk.length &&
          walk.every((r) => r.printingId && r.image?.includes(r.printingId)),
        { inSet: inSet.length, rows: walk.length },
      );
      // Collector order, by THE rule: leading integer (none last), then the text.
      const numberOf = new Map(inSet.map((p) => [p.id, p.collector_number]));
      const key = (cn: string) => {
        const lead = /^[0-9]+/.exec(cn)?.[0];
        return [lead === undefined ? Infinity : Number(lead), cn] as const;
      };
      const ordered = printingIds.every((id, i) => {
        if (i === 0) return true;
        const [a, at] = key(numberOf.get(printingIds[i - 1]) ?? "");
        const [b, bt] = key(numberOf.get(id) ?? "");
        return a < b || (a === b && at <= bt);
      });
      check(`set=${fixture.code}: sort=number is collector-number order`, ordered);
      // Each card shows its LOWEST-numbered printing in the set.
      const lowest = await tx<{ id: string }[]>`
        SELECT DISTINCT ON (p.card_identity_id) p.id::text AS id
        FROM card_printings p JOIN sets s ON s.id = p.set_id
        WHERE s.game_id = 1 AND s.code = ${fixture.code} AND NOT p.is_removed
        ORDER BY p.card_identity_id,
          (substring(p.collector_number from '^[0-9]+'))::numeric ASC NULLS LAST,
          p.collector_number ASC, p.id ASC`;
      const lowestIds = new Set(lowest.map((l) => l.id));
      check(
        `set=${fixture.code}: each card shows its lowest-numbered printing in the set`,
        printingIds.every((id) => lowestIds.has(id)),
      );

      const strip = await getJson<SearchBody>(
        `/api/cards/search?game=mtg&limit=12&set=${fixture.code}&sort=pop`,
      );
      check(
        `set=${fixture.code}&sort=pop&limit=12: the "Most popular" request answers from the set`,
        strip.status === 200 && strip.json.results.length > 0 && strip.json.total === fixture.cards,
        { status: strip.status, total: strip.json.total },
      );

      // Codes the scope refuses: each an honest empty answer with its reason.
      const [digital] = await tx<{ code: string }[]>`
        SELECT code FROM sets WHERE game_id = 1 AND digital LIMIT 1`;
      const [upcoming] = await tx<{ code: string }[]>`
        SELECT code FROM sets WHERE game_id = 1 AND NOT digital
          AND released_at > (now() AT TIME ZONE 'UTC')::date LIMIT 1`;
      const refused: [string, string][] = [
        ["zzz", 'no set has the code "zzz"'],
        ["bl%25b", '"bl%b" is not a set code'],
        ...(digital ? ([[digital.code, "is a digital-only set"]] as [string, string][]) : []),
        ...(upcoming ? ([[upcoming.code, "is not released yet"]] as [string, string][]) : []),
      ];
      for (const [code, reason] of refused) {
        const r = await getJson<SearchBody>(`/api/cards/search?game=mtg&limit=60&set=${code}`);
        check(
          `set=${decodeURIComponent(code)}: empty, with "${reason}"`,
          r.status === 200 &&
            r.json.total === 0 &&
            !!r.json.warnings?.some((w) => w.includes(reason)),
          r.json.warnings,
        );
      }
      const upper = await getJson<SearchBody>(
        `/api/cards/search?game=mtg&limit=1&set=${fixture.code.toUpperCase()}`,
      );
      check(
        "a code in capitals scopes the same",
        upper.json.total === fixture.cards,
        upper.json.total,
      );

      // One Piece declares no set field: the parameter changes nothing.
      const opPlain = await fetch(`${BASE}/api/cards/search?game=optcg&limit=60&sort=name`);
      const opSet = await fetch(`${BASE}/api/cards/search?game=optcg&limit=60&sort=name&set=op01`);
      check(
        "One Piece ignores set= (byte-identical answer)",
        (await opPlain.text()) === (await opSet.text()),
      );

      // ---- /cards?set= ----------------------------------------------------------
      const page = await fetch(`${BASE}/cards?set=${fixture.code}`);
      const html = await page.text();
      check(`/cards?set=${fixture.code} 200`, page.status === 200, page.status);
      check(
        "/cards?set= canonicalizes to bare /cards",
        /rel="canonical" href="[^"]*\/cards"/.test(html),
      );

      // ---- /sets (X4b) ----------------------------------------------------------
      const setsPage = await fetch(`${BASE}/sets`);
      const setsHtml = await setsPage.text();
      check("/sets 200", setsPage.status === 200, setsPage.status);
      const linked = new Set(
        [...setsHtml.matchAll(/href="\/cards\?set=([a-z0-9]+)"/g)].map((m) => m[1]),
      );
      const unlinked = released.filter((r) => !linked.has(r.code)).map((r) => r.code);
      check(
        `/sets links every released paper set with a live card (${released.length}), each to /cards?set=`,
        unlinked.length === 0 && linked.size === released.length,
        { linked: linked.size, db: released.length, unlinked: unlinked.slice(0, 5) },
      );
      const others = released.length - dbMain.length;
      const hiddenRows = setsHtml.match(/<li hidden=""><a /g)?.length ?? 0;
      check(
        `"Main sets only" is on in the server HTML: the ${others} other products are hidden, not dropped`,
        hiddenRows === others && /<input type="checkbox"[^>]*checked=""/.test(setsHtml),
        { hidden: hiddenRows, others },
      );
      const years = [...setsHtml.matchAll(/<h2[^>]*>(\d{4})<\/h2>/g)].map((m) => m[1]);
      check(
        "/sets groups by year, newest first",
        years.length > 0 && years.every((y, i) => i === 0 || years[i - 1] > y),
        years.slice(0, 5),
      );
      check("/sets canonical is /sets", /rel="canonical" href="[^"]*\/sets"/.test(setsHtml));
      const setsEdge = setsPage.headers.get("x-vercel-cache");
      if (setsEdge !== null) {
        check(
          "/sets is prerendered (ISR)",
          setsPage.headers.get("x-nextjs-prerender") === "1",
          setsPage.headers.get("x-nextjs-prerender"),
        );
        const again = await fetch(`${BASE}/sets`);
        await again.arrayBuffer();
        const repeat = again.headers.get("x-vercel-cache");
        check(
          "/sets is served from the cache on a repeat",
          repeat === "HIT" || repeat === "PRERENDER" || repeat === "STALE",
          { first: setsEdge, second: repeat },
        );
      }

      // The Browse menu renders its items only when opened, so no server HTML
      // carries them; the header's own JS must list Sets right after Cards.
      const home = await (await fetch(`${BASE}/`)).text();
      const scripts = [...home.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
      let browse: string | undefined;
      for (const src of scripts) {
        const js = await (await fetch(new URL(src, BASE))).text();
        if (/href:\s*"\/sets",\s*label:\s*"Sets"/.test(js)) {
          browse = js;
          break;
        }
      }
      const cardsAt = browse?.search(/href:\s*"\/cards",\s*label:\s*"Cards"/) ?? -1;
      const setsAt = browse?.search(/href:\s*"\/sets",\s*label:\s*"Sets"/) ?? -1;
      const preconsAt = browse?.search(/href:\s*"\/precons",\s*label:\s*"Precons"/) ?? -1;
      check(
        "the header's Browse menu lists Sets after Cards (and before Precons)",
        cardsAt >= 0 && cardsAt < setsAt && setsAt < preconsAt,
        { scripts: scripts.length, cardsAt, setsAt, preconsAt },
      );
    });
  } finally {
    await sql.end();
  }

  if (failures) {
    console.error(`\n${failures} set check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll set checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
