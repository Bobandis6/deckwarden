/**
 * Curl-level tests for the P2.4 surface: /commanders index (popularity
 * order, exact-CI color filter, pagination) and /c/[slug] hubs (staples CI
 * fit, basics/banned exclusions, banned-leader banner, role template).
 * Fixtures are picked from the live DB, not hardcoded, so meta shifts and
 * re-ingests can't rot the script. No auth — hubs are public card data.
 * X2 adds the name filter on both indexes (REC-3, the shared ranked
 * matcher) and GET /api/cards/suggest — pinned by rule (classes, word
 * starts), never by an EDHREC position. X3 (REC-7) pins the hub's W9c
 * starter-shell anchor and its combo door, "Build around this combo" — by
 * rule (one door per combo row, the most-played row first), never by a
 * combo count.
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
    // X3 (REC-7): the most-played LEGAL commander with a combo that fits
    // its identity (combos-smoke's fixture plus a legality filter — the
    // door renders only where the build CTA does), its most-played fitting
    // combo (loadCombosForCard's order), and a not-legal commander whose
    // hub still lists combos (the door must be absent there).
    const [comboHub] = await sql`
      SELECT ci.id::text AS id, ci.name, ci.slug, ci.external_key, ci.ci_mask
      FROM card_identities ci
      WHERE ci.game_id = 1 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
        AND NOT ci.is_removed
        AND NOT EXISTS (
          SELECT 1 FROM legalities l WHERE l.card_identity_id = ci.id AND l.format_id = 1
            AND l.effective_to IS NULL AND l.condition IS NULL AND l.status <> 'legal')
        AND EXISTS (
          SELECT 1 FROM combo_pieces p JOIN combos c ON c.id = p.combo_id
          WHERE p.card_identity_id = ci.id AND (c.ci_mask & ~ci.ci_mask::int) = 0)
      ORDER BY ci.popularity ASC NULLS LAST LIMIT 1`;
    const [comboTop] = await sql`
      SELECT c.external_key FROM combos c JOIN combo_pieces p ON p.combo_id = c.id
      WHERE p.card_identity_id = ${comboHub.id} AND (c.ci_mask & ~${comboHub.ci_mask}::int) = 0
      ORDER BY c.popularity DESC NULLS LAST, c.id LIMIT 1`;
    const [doorless] = await sql`
      SELECT ci.name, ci.slug FROM card_identities ci
      JOIN legalities l ON l.card_identity_id = ci.id AND l.format_id = 1
        AND l.effective_to IS NULL AND l.condition IS NULL AND l.status <> 'legal'
      WHERE ci.game_id = 1 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM combo_pieces p JOIN combos c ON c.id = p.combo_id
          WHERE p.card_identity_id = ci.id AND (c.ci_mask & ~ci.ci_mask::int) = 0)
      ORDER BY ci.popularity ASC NULLS LAST LIMIT 1`;
    console.log(
      `  using top="${top?.name}" monoW="${monoW?.name}" banned="${banned?.name ?? "(none)"}"`,
    );
    console.log(
      `  using comboHub="${comboHub?.name}" (top combo ${comboTop?.external_key}) doorless="${doorless?.name ?? "(none)"}"`,
    );

    // ---- /commanders index ------------------------------------------------
    const index = await page("/commanders");
    check(
      "index 200 + most popular commander on page 1",
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

    // ---- the name filter (W4; X2 REC-3: the shared ranked matcher) --------
    // D2's two acceptance rows: under W4's bare LIKE both answered "No
    // commanders match" (the normalizer keeps the comma, the apostrophe and
    // the hyphen). Now every typed word need only start a word.
    const acceptance = await sql`
      SELECT name, slug FROM card_identities
      WHERE game_id = 1 AND is_leader_candidate AND NOT is_removed
        AND slug IN ('atraxa-praetors-voice', 'kiki-jiki-mirror-breaker')`;
    check("REC-3 fixtures exist (Atraxa, Praetors' Voice; Kiki-Jiki)", acceptance.length === 2);
    for (const [typed, slug] of [
      ["atraxa+praetors", "atraxa-praetors-voice"],
      ["kiki+jiki", "kiki-jiki-mirror-breaker"],
    ]) {
      const filtered = await page(`/commanders?q=${typed}`);
      check(
        `/commanders?q=${typed} lists /c/${slug} (REC-3)`,
        filtered.status === 200 &&
          filtered.text.includes(`/c/${slug}"`) &&
          !filtered.text.includes("No commanders match"),
      );
    }
    // An exact name outranks every popular near match: the typed name's own
    // hub is the list's first row (the first hub link in the page).
    const exact = await page(`/commanders?q=${encodeURIComponent(top.name as string)}`);
    check(
      "the filter ranks: an exact name is the first row",
      exact.text.match(/href="\/c\/([a-z0-9-]+)"/)?.[1] === top.slug,
      exact.text.match(/href="\/c\/([a-z0-9-]+)"/)?.[1],
    );
    // Without JavaScript the island is still the form's one named field, with
    // the typed text, beside a default submit button (Base UI adds a second,
    // unnamed text input; a form with two and no button ignores Enter).
    const kikiForm =
      (await page("/commanders?q=kiki+jiki")).text.match(
        /<form[^>]*action="\/commanders"[\s\S]*?<\/form>/,
      )?.[0] ?? "";
    check(
      "the filter form works without JS: name=q with the value, and a default submit button",
      /<input[^>]*name="q"[^>]*value="kiki jiki"/.test(kikiForm) &&
        (kikiForm.match(/ name="/g) ?? []).length === 1 &&
        /<button[^>]*type="submit"/.test(kikiForm),
      kikiForm.slice(0, 300),
    );

    // /leaders runs the same matcher. A word may start after a period
    // (Monkey.D.Luffy, Edward.Newgate): the dotted leader's last word finds it.
    const [dotted] = await sql`
      SELECT name, slug, name_norm FROM card_identities
      WHERE game_id = 2 AND is_leader_candidate AND slug IS NOT NULL AND NOT is_removed
        AND name_norm ~ '[a-z]\\.[a-z]{3,}$'
      ORDER BY name, external_key LIMIT 1`;
    if (dotted) {
      const word = (dotted.name_norm as string).split(".").at(-1) as string;
      const leaders = await page(`/leaders?q=${word}`);
      check(
        `/leaders?q=${word} lists /l/${dotted.slug as string} (a word starts after a period)`,
        leaders.status === 200 && leaders.text.includes(`/l/${dotted.slug as string}"`),
      );
    }

    // ---- GET /api/cards/suggest (X2, D2) ------------------------------------
    type SuggestRow = { name: string; slug: string | null; isLeader: boolean };
    const suggest = async (query: string) => {
      const res = await fetch(`${BASE}/api/cards/suggest?${query}`);
      const body = (await res.json()) as { q?: string; results?: SuggestRow[] };
      return { res, q: body.q, rows: body.results ?? [] };
    };
    // D2's word start: the start, or after a space, hyphen, period, quote or "(".
    const startsAWord = (name: string, word: string) =>
      new RegExp(`(^|[ .\\-"(])${word}`, "i").test(
        name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'"),
      );

    const one = await suggest("game=mtg&scope=cards&q=a");
    check(
      "suggest: one letter → 200, no rows",
      one.res.status === 200 && one.rows.length === 0 && one.q === "a",
    );
    check(
      "suggest: the edge may keep it an hour (s-maxage=3600, swr a day)",
      one.res.headers.get("cache-control") ===
        "public, s-maxage=3600, stale-while-revalidate=86400",
      one.res.headers.get("cache-control"),
    );
    const opt = await suggest("game=mtg&scope=cards&q=Opt");
    check(
      "suggest: an exact name leads (Opt), and the text comes back normalized",
      opt.rows[0]?.name === "Opt" && opt.q === "opt",
      opt.rows[0]?.name,
    );
    const atr = await suggest("game=mtg&scope=cards&q=atr");
    check(
      "suggest: names that START with the text lead, and every row starts a word with it (no inside-a-word noise)",
      atr.rows.length === 8 &&
        /^atr/i.test(atr.rows[0].name) &&
        atr.rows.every((r) => startsAWord(r.name, "atr")),
      atr.rows.map((r) => r.name),
    );
    const kr = await suggest("game=mtg&scope=leaders&q=kr");
    check(
      "suggest: scope=leaders is hubs only — every row a slugged leader",
      kr.rows.length > 0 && kr.rows.every((r) => r.isLeader && r.slug),
      kr.rows.map((r) => r.slug),
    );
    const urza = await suggest("game=mtg&scope=cards&q=urzas+saga");
    check(
      "suggest: near misses from four letters (urzas saga → Urza's Saga)",
      urza.rows.some((r) => r.name === "Urza's Saga"),
      urza.rows.map((r) => r.name),
    );
    const blanks = await suggest("game=mtg&scope=cards&q=__");
    check(
      "suggest: typed wildcards match themselves (__ → only names with underscores)",
      blanks.rows.length > 0 && blanks.rows.every((r) => r.name.includes("__")),
      blanks.rows.map((r) => r.name),
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
    // ---- the W9c starter-shell anchor + the X3 combo door (REC-7) ----------
    // No smoke pinned either page surface before X3. Both are server HTML
    // (the hub is ISR); the door rides each row of the fit-filtered list,
    // under the build CTA's gate, into the ?leader= seam plus `combo` and
    // the autofill latch.
    const comboHubPage = await page(`/c/${comboHub.slug as string}`);
    const hubKey = comboHub.external_key as string;
    check(
      `combo hub (${comboHub.name as string}) 200 + its combo section`,
      comboHubPage.status === 200 && comboHubPage.text.includes("Combos with"),
    );
    check(
      "hub starter-shell anchor seeds the commander and latches the sheet (W9c)",
      new RegExp(
        `<a[^>]*href="/decks/new\\?game=mtg&amp;leader=${hubKey}&amp;autofill=1"[^>]*>Start with a starter shell</a>`,
      ).test(comboHubPage.text),
    );
    check(
      "hub combo door on the most popular fitting combo: leader + combo + autofill (X3)",
      new RegExp(
        `<a[^>]*href="/decks/new\\?game=mtg&amp;leader=${hubKey}&amp;combo=${comboTop.external_key as string}&amp;autofill=1"[^>]*>Build around this combo</a>`,
      ).test(comboHubPage.text),
    );
    const doors = comboHubPage.text.match(/>Build around this combo<\/a>/g)?.length ?? 0;
    const walkthroughs =
      comboHubPage.text.match(/>How it works on <!-- -->Commander Spellbook/g)?.length ?? 0;
    check(
      "one combo door per combo row (every walkthrough link has its door)",
      doors > 0 && doors === walkthroughs,
      { doors, walkthroughs },
    );
    check(
      "the door's words stay out of the pinned build CTA (its anchor is unchanged)",
      new RegExp(
        `<a[^>]*href="/decks/new\\?game=mtg&amp;leader=${hubKey}"[^>]*>Build with this commander</a>`,
      ).test(comboHubPage.text),
    );
    if (doorless) {
      const doorlessHub = await page(`/c/${doorless.slug as string}`);
      check(
        `not-legal commander (${doorless.name as string}) lists its combos with no door and no build CTA`,
        doorlessHub.status === 200 &&
          doorlessHub.text.includes("Combos with") &&
          !doorlessHub.text.includes("Build around this combo") &&
          !doorlessHub.text.includes("Build with this commander"),
      );
    } else {
      console.log("  note  no not-legal commander lists a fitting combo — door-absence unasserted");
    }

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
      // W10: internal event links + the "All {n} finishes" hand-off are
      // ADDITIVE — the external pins above must keep passing beside them.
      check(
        "top finishes shelf links events internally (W10)",
        finisherHub.text.includes("/tournaments/") &&
          finisherHub.text.includes(`/tournaments?leader=${finisher.slug as string}`),
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
      // W10 mirror of the /c/ pin: internal links are additive.
      check(
        "OP finishes shelf links events internally (W10)",
        opHub.text.includes("/tournaments/") &&
          opHub.text.includes(`/tournaments?game=optcg&amp;leader=${opFinisher.slug as string}`),
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
