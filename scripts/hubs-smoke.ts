/**
 * Curl-level tests for the P2.4 surface: /commanders index (popularity
 * order, exact-CI color filter, pagination) and /c/[slug] hubs (staples CI
 * fit, basics/banned exclusions, banned-leader banner, role template).
 * Fixtures are picked from the live DB, not hardcoded, so meta shifts and
 * re-ingests can't rot the script. No auth — hubs are public card data.
 *
 *   pnpm smoke:hubs
 *   BASE_URL=http://localhost:3111 pnpm smoke:hubs
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

async function page(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, text: await res.text() };
}

async function main() {
  console.log(`hubs smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });

  try {
    // ---- fixtures from the live DB ---------------------------------------
    const [top] = await sql`
      SELECT name, slug FROM card_identities
      WHERE game_id = 1 AND is_leader_candidate AND slug IS NOT NULL AND NOT is_removed
      ORDER BY popularity ASC NULLS LAST LIMIT 1`;
    const [monoW] = await sql`
      SELECT name, slug FROM card_identities
      WHERE game_id = 1 AND is_leader_candidate AND slug IS NOT NULL AND NOT is_removed
        AND ci_mask = 1 AND popularity IS NOT NULL
      ORDER BY popularity ASC LIMIT 1`;
    const [banned] = await sql`
      SELECT ci.name, ci.slug FROM card_identities ci
      JOIN legalities l ON l.card_identity_id = ci.id
        AND l.format_id = 1 AND l.effective_to IS NULL AND l.condition IS NULL
        AND l.status = 'banned'
      WHERE ci.game_id = 1 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
      ORDER BY ci.popularity ASC NULLS LAST LIMIT 1`;
    console.log(
      `  using top="${top?.name}" monoW="${monoW?.name}" banned="${banned?.name ?? "(none)"}"`,
    );

    // ---- /commanders index ------------------------------------------------
    const index = await page("/commanders");
    check(
      "index 200 + most-played commander on page 1",
      index.status === 200 && index.text.includes(top.name as string),
    );
    check("index links hub slugs", index.text.includes(`/c/${top.slug as string}`));

    const monoWhite = await page("/commanders?colors=w");
    check(
      "exact-CI filter: mono-white page shows the top mono-white leader",
      monoWhite.status === 200 && monoWhite.text.includes(monoW.name as string),
    );
    check(
      "exact-CI filter: multi-color top leader absent from mono-white page",
      (top.slug as string) === (monoW.slug as string) ||
        !monoWhite.text.includes(`/c/${top.slug as string}"`),
    );

    const page2 = await page("/commanders?page=2");
    check(
      "pagination: page 2 renders and drops page-1 leader",
      page2.status === 200 && !page2.text.includes(`/c/${top.slug as string}"`),
    );

    // ---- hub page ---------------------------------------------------------
    const hub = await page(`/c/${top.slug as string}`);
    check("hub 200 + commander name", hub.status === 200 && hub.text.includes(top.name as string));
    check("hub staples include Sol Ring (colorless fits every CI)", hub.text.includes("Sol Ring"));
    check(
      "hub renders the role template",
      hub.text.includes("A typical Commander deck") && hub.text.includes("Lands"),
    );
    check("hub renders the staples curve", hub.text.includes("Curve of these staples"));
    check(
      "hub credits Scryfall + EDHREC",
      hub.text.includes("Scryfall") && hub.text.includes("EDHREC"),
    );

    const monoWhiteHub = await page(`/c/${monoW.slug as string}`);
    check(
      "CI fit: mono-white hub has no blue staple (Rhystic Study)",
      monoWhiteHub.status === 200 && !monoWhiteHub.text.includes("Rhystic Study"),
    );
    check("staples exclude basic lands", !monoWhiteHub.text.includes(">Plains<"));

    if (banned) {
      const bannedHub = await page(`/c/${banned.slug as string}`);
      check(
        "banned commander hub shows the banner",
        bannedHub.status === 200 && bannedHub.text.includes("Banned in Commander"),
      );
    }

    check("unknown slug → 404", (await page("/c/zz-no-such-commander-zz")).status === 404);
    check("malformed slug → 404", (await page("/c/Not%20A%20Slug!")).status === 404);

    // ---- slug hygiene (DB-level) -----------------------------------------
    const dupes = await sql`
      SELECT slug FROM card_identities WHERE game_id = 1 AND slug IS NOT NULL
      GROUP BY slug HAVING count(*) > 1 LIMIT 1`;
    check("no duplicate slugs", dupes.length === 0, dupes[0]?.slug);
    const [{ n: unslugged }] = await sql`
      SELECT count(*)::int AS n FROM card_identities
      WHERE game_id = 1 AND is_leader_candidate AND NOT is_removed AND slug IS NULL AND name ~ '[a-zA-Z0-9]'`;
    check("every sluggable leader has a slug", Number(unslugged) === 0, unslugged);
  } finally {
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
