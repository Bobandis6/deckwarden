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
      SELECT name, slug, external_key FROM card_identities
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
    // Build with this commander (R5b — LATER's /c/ CTA row): the words and the
    // ?leader= oracle-id href, mirroring seo-smoke's /l/ pin. A banned
    // most-played commander would carry the banner instead of the action.
    check(
      "hub build CTA seeds the commander by oracle id (R5b)",
      hub.text.includes("Banned in Commander") ||
        (hub.text.includes("Build with this commander") &&
          (hub.text.includes(`/decks/new?game=mtg&amp;leader=${top.external_key as string}`) ||
            hub.text.includes(`/decks/new?game=mtg&leader=${top.external_key as string}`))),
    );
    // The artwork header (R5b, G3): the crop banner is never unattributed.
    check(
      "hub art banner, when present, carries the visible artist / © credit",
      !hub.text.includes("art_crop") || hub.text.includes("Wizards of the Coast"),
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

    const missing = await page("/c/zz-no-such-commander-zz");
    check("unknown slug → 404", missing.status === 404);
    // The Warden 404 (R5b, F8) carries the site header so a lost visitor can
    // navigate. A notFound() inside an ISR route streams the not-found subtree
    // as an RSC fallback (NEXT_HTTP_ERROR_FALLBACK;404) that hydrates client-
    // side, so the header's props reach the HTML flight-encoded — accept both.
    check(
      "404 page renders the Warden line, the site header and the Search cards action",
      missing.text.includes("The Warden finds no such page.") &&
        missing.text.includes("Search cards") &&
        (missing.text.includes('aria-label="Deckwarden"') ||
          missing.text.includes('\\"aria-label\\":\\"Deckwarden\\"')),
    );
    check("malformed slug → 404", (await page("/c/Not%20A%20Slug!")).status === 404);

    // ---- Top finishes shelf (P3.5) ----------------------------------------
    // Honest in both states: with tournament rows, the busiest leader's hub
    // must render the shelf + the required Topdeck credit; with none (key not
    // yet minted), the shelf must be ABSENT (never an empty shell).
    const [finisher] = await sql`
      SELECT ci.name, ci.slug, count(*)::int AS finishes
      FROM tournament_standings ts
      JOIN tournaments t ON t.id = ts.tournament_id AND t.game_id = 1
      JOIN card_identities ci ON ci.id = ANY(ts.leader_ids)
      WHERE ci.slug IS NOT NULL
      GROUP BY ci.name, ci.slug ORDER BY count(*) DESC LIMIT 1`;
    if (finisher) {
      const finisherHub = await page(`/c/${finisher.slug as string}`);
      check(
        `top finishes shelf renders for "${finisher.name as string}" (${finisher.finishes} finishes)`,
        finisherHub.status === 200 && finisherHub.text.includes("Top finishes"),
      );
      check(
        "top finishes shelf carries the Topdeck.gg credit + event link",
        finisherHub.text.includes("Topdeck.gg") &&
          finisherHub.text.includes("https://topdeck.gg/event/"),
      );
    } else {
      console.log("  (no tournament rows yet — dormant; asserting the shelf stays hidden)");
      check("no tournament rows → no Top finishes shelf", !hub.text.includes("Top finishes"));
    }

    // ---- Meta Lens table (P3.10) ------------------------------------------
    // Both states pinned, fixtures from live aggregate rows: the leader with
    // the largest union of settled lists renders the section, the top card's
    // exact "n of N" share literal and the ranked-by-lists wording; a leader
    // whose union sits under the disclosed ≥5-list floor — and one with no
    // aggregate rows at all — renders NO section (honest absence, never
    // padding).
    const [rich] = await sql`
      WITH per_leader AS (
        SELECT l.leader_id, sum(cs.lists)::int AS total
        FROM commander_stats cs, LATERAL unnest(cs.leader_ids) AS l(leader_id)
        GROUP BY l.leader_id)
      SELECT ci.id, ci.name, ci.slug, p.total
      FROM per_leader p JOIN card_identities ci ON ci.id = p.leader_id
      WHERE ci.game_id = 1 AND ci.slug IS NOT NULL
      ORDER BY p.total DESC LIMIT 1`;
    if (rich) {
      const [topCard] = await sql`
        SELECT sum(ccs.lists)::int AS lists
        FROM commander_card_stats ccs
        WHERE ccs.leader_ids IN (
          SELECT cs.leader_ids FROM commander_stats cs
          WHERE cs.leader_ids @> ARRAY[${rich.id as string}]::uuid[])
        GROUP BY ccs.card_identity_id ORDER BY 1 DESC LIMIT 1`;
      const richHub = await page(`/c/${rich.slug as string}`);
      check(
        `Meta Lens renders for "${rich.name as string}" (${rich.total} union lists)`,
        richHub.status === 200 &&
          richHub.text.includes("Most played with") &&
          richHub.text.includes("ranked by lists played"),
      );
      check(
        "Meta Lens top row carries the literal n-of-N share",
        richHub.text.includes(`${topCard.lists} of ${rich.total}`),
      );
      check("Meta Lens page carries the Topdeck.gg credit", richHub.text.includes("Topdeck.gg"));
      const [underFloor] = await sql`
        WITH per_leader AS (
          SELECT l.leader_id, sum(cs.lists)::int AS total
          FROM commander_stats cs, LATERAL unnest(cs.leader_ids) AS l(leader_id)
          GROUP BY l.leader_id)
        SELECT ci.name, ci.slug, p.total
        FROM per_leader p JOIN card_identities ci ON ci.id = p.leader_id
        WHERE ci.game_id = 1 AND ci.slug IS NOT NULL AND p.total < 5
        ORDER BY p.total DESC LIMIT 1`;
      if (underFloor) {
        const floorHub = await page(`/c/${underFloor.slug as string}`);
        check(
          `under-floor leader ("${underFloor.name as string}", ${underFloor.total} lists) hides Meta Lens`,
          floorHub.status === 200 && !floorHub.text.includes("Most played with"),
        );
      }
      const [noRows] = await sql`
        SELECT ci.name, ci.slug FROM card_identities ci
        WHERE ci.game_id = 1 AND ci.is_leader_candidate AND NOT ci.is_removed
          AND ci.slug IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM commander_stats cs WHERE cs.leader_ids @> ARRAY[ci.id])
        ORDER BY ci.popularity ASC NULLS LAST LIMIT 1`;
      if (noRows) {
        const quietHub2 = await page(`/c/${noRows.slug as string}`);
        check(
          `no-aggregate leader ("${noRows.name as string}") hides Meta Lens`,
          quietHub2.status === 200 && !quietHub2.text.includes("Most played with"),
        );
      }
    } else {
      console.log("  (no commander aggregate rows yet — asserting Meta Lens stays hidden)");
      check("no aggregate rows → no Meta Lens section", !hub.text.includes("Most played with"));
    }

    // ---- OP Top finishes shelf on /l/ (P4.5) ------------------------------
    // The /c/ block above, mirrored for the Limitless pipeline. Both states
    // pinned: the busiest OP finisher's hub renders the shelf + the required
    // Limitless credit + event deep link; a leader with no finishes renders
    // NO shelf (hubs without data change not one pixel — the cold-start rule).
    const [opFinisher] = await sql`
      SELECT ci.name, ci.slug, count(*)::int AS finishes
      FROM tournament_standings ts
      JOIN tournaments t ON t.id = ts.tournament_id AND t.game_id = 2
      JOIN card_identities ci ON ci.id = ANY(ts.leader_ids)
      WHERE ci.slug IS NOT NULL
      GROUP BY ci.name, ci.slug ORDER BY count(*) DESC LIMIT 1`;
    if (opFinisher) {
      const opHub = await page(`/l/${opFinisher.slug as string}`);
      check(
        `OP finishes shelf renders for "${opFinisher.name as string}" (${opFinisher.finishes} finishes)`,
        opHub.status === 200 && opHub.text.includes("Top finishes"),
      );
      check(
        "OP finishes shelf carries the Limitless credit + event link",
        opHub.text.includes("Limitless") &&
          opHub.text.includes("https://play.limitlesstcg.com/tournament/"),
      );
    } else {
      console.log("  (no OP tournament rows yet — asserting the /l/ shelf stays hidden)");
    }
    const [opQuiet] = await sql`
      SELECT ci.name, ci.slug FROM card_identities ci
      WHERE ci.game_id = 2 AND ci.is_leader_candidate AND NOT ci.is_removed
        AND ci.slug IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tournament_standings ts WHERE ts.leader_ids @> ARRAY[ci.id])
      ORDER BY ci.external_key LIMIT 1`;
    if (opQuiet) {
      const quietHub = await page(`/l/${opQuiet.slug as string}`);
      check(
        `OP leader without finishes ("${opQuiet.name as string}") renders no shelf`,
        quietHub.status === 200 && !quietHub.text.includes("Top finishes"),
      );
    }

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
