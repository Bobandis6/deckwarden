/**
 * Curl-level tests for the P2.5 surface: Spellbook combos on card pages and
 * commander hubs, plus the "Decks with this commander" shelf. Fixtures are
 * picked from the live DB, not hardcoded, so meta shifts and re-ingests
 * can't rot the script. No auth — everything here is public card data.
 *
 *   pnpm smoke:combos
 *   BASE_URL=http://localhost:3111 pnpm smoke:combos
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

/** React-escape a string the way page text lands in HTML (Thassa&#x27;s Oracle). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function main() {
  console.log(`combos smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });

  try {
    // ---- DB integrity ------------------------------------------------------
    const [{ n: comboCount }] = await sql`SELECT count(*)::int AS n FROM combos`;
    check("combos ingested (> 10k rows)", Number(comboCount) > 10_000, comboCount);

    const [{ n: drift }] = await sql`
      SELECT count(*)::int AS n FROM combos c
      WHERE c.piece_count <> (SELECT count(*) FROM combo_pieces p WHERE p.combo_id = c.id)`;
    check("piece_count matches real piece rows everywhere", Number(drift) === 0, drift);

    // A combo's stored identity must cover its pieces' identities, or the
    // hub CI-fit filter could surface an unplayable combo.
    const [{ n: ciHoles }] = await sql`
      SELECT count(*)::int AS n FROM (
        SELECT c.id FROM combos c
        JOIN combo_pieces p ON p.combo_id = c.id
        JOIN card_identities ci ON ci.id = p.card_identity_id
        GROUP BY c.id, c.ci_mask
        HAVING (bit_or(ci.ci_mask) & ~c.ci_mask) <> 0
      ) x`;
    check("combo ci_mask covers every piece's color identity", Number(ciHoles) === 0, ciHoles);

    // ---- fixtures from the live DB ----------------------------------------
    const [hot] = await sql<{ id: string; name: string; n: number }[]>`
      SELECT ci.id::text AS id, ci.name, count(*)::int AS n
      FROM combo_pieces p JOIN card_identities ci ON ci.id = p.card_identity_id
      GROUP BY ci.id, ci.name ORDER BY n DESC LIMIT 1`;
    const [partner] = await sql<{ name: string }[]>`
      SELECT ci.name FROM combos c
      JOIN combo_pieces p ON p.combo_id = c.id
      JOIN card_identities ci ON ci.id = p.card_identity_id
      WHERE c.id IN (SELECT combo_id FROM combo_pieces WHERE card_identity_id = ${hot.id})
        AND ci.id <> ${hot.id}
      ORDER BY c.popularity DESC NULLS LAST, ci.name LIMIT 1`;
    const [leader] = await sql<{ id: string; name: string; slug: string; ciMask: number }[]>`
      SELECT ci.id::text AS id, ci.name, ci.slug, ci.ci_mask AS "ciMask"
      FROM card_identities ci
      WHERE ci.game_id = 1 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
        AND NOT ci.is_removed
        AND EXISTS (
          SELECT 1 FROM combo_pieces p JOIN combos c ON c.id = p.combo_id
          WHERE p.card_identity_id = ci.id AND (c.ci_mask & ~ci.ci_mask::int) = 0)
      ORDER BY ci.popularity ASC NULLS LAST LIMIT 1`;
    const [quiet] = await sql<{ id: string; name: string }[]>`
      SELECT ci.id::text AS id, ci.name FROM card_identities ci
      WHERE ci.game_id = 1 AND NOT ci.is_removed AND ci.popularity IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM combo_pieces p WHERE p.card_identity_id = ci.id)
      ORDER BY ci.popularity ASC LIMIT 1`;
    const [templated] = await sql<{ externalKey: string; template: string; pieceId: string }[]>`
      SELECT c.external_key AS "externalKey", c.templates[1] AS template,
             (SELECT p.card_identity_id::text FROM combo_pieces p
              WHERE p.combo_id = c.id LIMIT 1) AS "pieceId"
      FROM combos c
      WHERE cardinality(c.templates) > 0
      ORDER BY c.popularity DESC NULLS LAST LIMIT 1`;
    console.log(
      `  using hot="${hot?.name}" (${hot?.n} combos) leader="${leader?.name}" quiet="${quiet?.name}"`,
    );

    // ---- card page ---------------------------------------------------------
    const hotPage = await page(`/cards/${hot.id}`);
    check("hot card page 200 + combos section", hotPage.status === 200, hotPage.status);
    check("combos section heading present", hotPage.text.includes("Combos using this card"));
    check(
      "top combo partner card is listed and linked",
      partner !== undefined && hotPage.text.includes(esc(partner.name)),
      partner?.name,
    );
    const totalMatch = hotPage.text.match(/most-played of (\d+) combos/);
    check(
      "page's honest total matches the DB",
      totalMatch !== null && Number(totalMatch[1]) === hot.n,
      { page: totalMatch?.[1], db: hot.n },
    );
    check(
      "combo rows deep-link to Commander Spellbook",
      hotPage.text.includes("https://commanderspellbook.com/combo/"),
    );
    check("credit line names Commander Spellbook", hotPage.text.includes("Combo data courtesy of"));

    if (templated) {
      const tplPage = await page(`/cards/${templated.pieceId}`);
      check(
        "template requirement renders by name on its piece's page",
        tplPage.status === 200 && tplPage.text.includes(esc(templated.template)),
        templated.template,
      );
    }

    const quietPage = await page(`/cards/${quiet.id}`);
    check(
      "combo-less card page hides the section and the credit (cold-start rule)",
      quietPage.status === 200 &&
        !quietPage.text.includes("Combos using this card") &&
        !quietPage.text.includes("Commander Spellbook"),
    );

    // ---- hub page -----------------------------------------------------------
    const hubPage = await page(`/c/${leader.slug}`);
    check("hub 200 + combos section", hubPage.status === 200, hubPage.status);
    check("hub combos heading present", hubPage.text.includes("Combos with"));
    const [{ n: fitTotal }] = await sql`
      SELECT count(*)::int AS n FROM combos c
      WHERE c.id IN (SELECT combo_id FROM combo_pieces WHERE card_identity_id = ${leader.id})
        AND (c.ci_mask & ~${leader.ciMask}::int) = 0`;
    const hubTotal = hubPage.text.match(/most-played of (\d+) combos/);
    check(
      "hub total matches the DB's CI-fit count",
      Number(fitTotal) <= 10 || (hubTotal !== null && Number(hubTotal[1]) === Number(fitTotal)),
      { page: hubTotal?.[1], db: fitTotal },
    );

    // ---- "Decks with this commander" shelf (cold-start honesty) -------------
    const [{ n: hubDecks }] = await sql`
      SELECT count(*)::int AS n FROM decks
      WHERE visibility = 'public' AND leader_ids @> ARRAY[${leader.id}]::uuid[]`;
    if (Number(hubDecks) === 0) {
      check(
        "no public decks with this leader → shelf hidden",
        !hubPage.text.includes("Decks with this commander"),
      );
    } else {
      // ISR staleness makes fresh-deck presence unassertable; note and move on.
      console.log(`  note  ${hubDecks} public deck(s) exist — shelf presence not asserted (ISR)`);
    }
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
