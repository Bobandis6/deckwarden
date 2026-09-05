/**
 * Curl-level tests for the P2.6 surface: robots.txt, the three sitemaps,
 * canonical tags, robots-meta visibility policy, JSON-LD, and the OG image
 * endpoints. Fixtures are DB-picked (combos-smoke style) plus one deck the
 * script creates via the API and deletes on the way out, so the
 * public/unlisted/private transitions can be asserted deterministically.
 *
 * Meant for `next dev`, where ISR routes render fresh per request — against
 * production the sitemap assertions can lag their revalidate windows.
 *
 *   pnpm smoke:seo
 *   BASE_URL=http://localhost:3111 pnpm smoke:seo
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

/** All parsed JSON-LD blocks in a page (RSC keeps script content verbatim). */
function jsonLdBlocks(html: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      blocks.push(JSON.parse(m[1]) as Record<string, unknown>);
    } catch {
      failures++;
      console.error(`  FAIL  JSON-LD block does not parse — ${m[1].slice(0, 120)}`);
    }
  }
  return blocks;
}

/** The og:image URL's path+query, host-agnostic (metadataBase may differ from BASE). */
function ogImagePath(html: string): string | null {
  const m = html.match(/property="og:image" content="([^"]+)"/);
  if (!m) return null;
  const u = new URL(m[1], BASE);
  return u.pathname + u.search;
}

function hasCanonical(html: string, path: string): boolean {
  return new RegExp(`rel="canonical" href="[^"]*${path.replace(/[/[\]]/g, "\\$&")}"`).test(html);
}

const NOINDEX_RE = /name="robots" content="noindex"/;

async function fetchImage(path: string): Promise<{ status: number; type: string; bytes: number }> {
  const res = await fetch(`${BASE}${path}`);
  const buf = await res.arrayBuffer();
  return { status: res.status, type: res.headers.get("content-type") ?? "", bytes: buf.byteLength };
}

async function main() {
  console.log(`seo smoke against ${BASE}`);
  const sql = postgres(DB_URL as string, { max: 1, prepare: false });
  let deckId: string | undefined;
  let token: string | undefined;

  try {
    // Repeated local runs trip the anon create limiter; its localhost keys
    // (`…:ip:::1`) are meaningless outside this machine, so clear them.
    await sql`DELETE FROM rate_limit_counters WHERE key LIKE ${"deck-create:%:::1"}`;

    // ---- fixtures ----------------------------------------------------------
    const [leader] = await sql<{ slug: string; name: string }[]>`
      SELECT ci.slug, ci.name FROM card_identities ci
      WHERE ci.game_id = 1 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
        AND NOT ci.is_removed AND ci.popularity IS NOT NULL
        AND EXISTS (SELECT 1 FROM card_printings p
                    WHERE p.card_identity_id = ci.id AND p.is_default)
      ORDER BY ci.popularity ASC LIMIT 1`;
    const [card] = await sql<{ id: string; name: string }[]>`
      SELECT ci.id::text AS id, ci.name FROM card_identities ci
      WHERE ci.game_id = 1 AND NOT ci.is_removed AND NOT ci.is_leader_candidate
        AND ci.popularity IS NOT NULL
        AND EXISTS (SELECT 1 FROM card_printings p
                    WHERE p.card_identity_id = ci.id AND p.is_default)
      ORDER BY ci.popularity ASC LIMIT 1`;
    const [{ n: cardCount }] = await sql`
      SELECT count(*)::int AS n FROM card_identities WHERE NOT is_removed`;
    const [privateDeck] = await sql<{ publicId: string }[]>`
      SELECT public_id AS "publicId" FROM decks WHERE visibility = 'private' LIMIT 1`;
    console.log(`  using leader="${leader?.name}" card="${card?.name}" (${cardCount} cards)`);

    // The script's own deck: commander + a couple of spells, flipped public.
    const search = await api(
      "GET",
      `/api/cards/search?game=mtg&name=${encodeURIComponent("sol ring")}&limit=1`,
    );
    const staple = (search.json as { results?: { id: string }[] })?.results?.[0];
    const commander = await api(
      "GET",
      `/api/cards/search?game=mtg&name=${encodeURIComponent("atraxa praetors voice")}&limit=1`,
    );
    const commanderCard = (commander.json as { results?: { id: string }[] })?.results?.[0];
    const created = await api("POST", "/api/decks", {
      body: { game: "mtg", format: "commander", name: "SEO smoke deck" },
    });
    const createdJson = created.json as {
      deck?: { id: string; publicId: string };
      claimToken?: string;
    };
    deckId = createdJson?.deck?.id;
    token = createdJson?.claimToken;
    const publicId = createdJson?.deck?.publicId;
    check("fixture deck created", created.status === 201 && !!deckId && !!publicId && !!token);
    if (!deckId || !publicId || !token) throw new Error("fixture deck create failed; aborting");
    if (commanderCard && staple) {
      await api("PUT", `/api/decks/${deckId}/cards`, {
        token,
        body: {
          cards: [
            { cardId: commanderCard.id, zone: "commander", qty: 1, tags: [] },
            { cardId: staple.id, zone: "main", qty: 1, tags: [] },
          ],
        },
      });
    }
    await api("PATCH", `/api/decks/${deckId}`, { token, body: { visibility: "public" } });

    // ---- robots.txt --------------------------------------------------------
    const robots = await page("/robots.txt");
    check("robots.txt 200", robots.status === 200, robots.status);
    for (const frag of ["Disallow: /api/", "Disallow: /decks/", "Disallow: /account"]) {
      check(`robots.txt has "${frag}"`, robots.text.includes(frag));
    }
    for (const sm of ["/sitemap.xml", "/c/sitemap.xml", "/l/sitemap.xml", "/cards/sitemap/0.xml"]) {
      check(`robots.txt lists ${sm}`, robots.text.includes(sm));
    }
    // Lockstep pin (P4.4): robots' chunk count must mirror cards/sitemap.ts's
    // WHERE (MTG + OP, non-removed) — cardCount below is exactly that set.
    const expectedChunks = Math.max(1, Math.ceil(cardCount / 10_000));
    check(
      `robots.txt lists exactly ${expectedChunks} card sitemap chunks`,
      robots.text.includes(`/cards/sitemap/${expectedChunks - 1}.xml`) &&
        !robots.text.includes(`/cards/sitemap/${expectedChunks}.xml`),
    );

    // ---- sitemaps ----------------------------------------------------------
    const core = await page("/sitemap.xml");
    check("core sitemap 200 + urlset", core.status === 200 && core.text.includes("<urlset"));
    check("core sitemap lists /commanders", core.text.includes("/commanders</loc>"));
    check("core sitemap lists the public deck", core.text.includes(`/d/${publicId}</loc>`));
    if (privateDeck) {
      check(
        "core sitemap excludes private decks",
        !core.text.includes(`/d/${privateDeck.publicId}<`),
      );
    }

    const hubMap = await page("/c/sitemap.xml");
    check("hub sitemap 200", hubMap.status === 200, hubMap.status);
    check("hub sitemap lists the fixture leader", hubMap.text.includes(`/c/${leader.slug}</loc>`));

    const cardMap = await page("/cards/sitemap/0.xml");
    const locs = cardMap.text.match(/<loc>/g)?.length ?? 0;
    check("card sitemap chunk 0: 200", cardMap.status === 200, cardMap.status);
    check(
      "card sitemap chunk 0 is full (or the whole set) and under the 50k limit",
      locs === Math.min(cardCount, 10_000) && locs <= 50_000,
      { locs, cardCount },
    );

    // ---- deck page: public -------------------------------------------------
    const deckPage = await page(`/d/${publicId}`);
    check("public deck page 200", deckPage.status === 200, deckPage.status);
    check("deck canonical tag", hasCanonical(deckPage.text, `/d/${publicId}`));
    check("deck page is indexable (no noindex)", !NOINDEX_RE.test(deckPage.text));
    check(
      "deck twitter card is summary_large_image",
      deckPage.text.includes('content="summary_large_image"'),
    );
    const deckLd = jsonLdBlocks(deckPage.text);
    check(
      "deck JSON-LD CreativeWork with the deck name",
      deckLd.some((b) => b["@type"] === "CreativeWork" && b.name === "SEO smoke deck"),
      deckLd,
    );
    const deckOgPath = ogImagePath(deckPage.text);
    check("deck og:image points at the generated image", !!deckOgPath?.includes("opengraph-image"));
    if (deckOgPath) {
      const img = await fetchImage(deckOgPath);
      check(
        "deck OG image renders (200, png, >10KB)",
        img.status === 200 && img.type.startsWith("image/png") && img.bytes > 10_000,
        img,
      );
    }

    // ---- deck page: unlisted keeps unfurl, gains noindex -------------------
    await api("PATCH", `/api/decks/${deckId}`, { token, body: { visibility: "unlisted" } });
    const unlistedPage = await page(`/d/${publicId}`);
    check("unlisted deck page noindexed", NOINDEX_RE.test(unlistedPage.text));
    check(
      "unlisted deck keeps full OG metadata (the share loop)",
      unlistedPage.text.includes('content="SEO smoke deck"') && !!ogImagePath(unlistedPage.text),
    );
    const coreAfterUnlist = await page("/sitemap.xml");
    check(
      "unlisted deck drops out of the sitemap",
      !coreAfterUnlist.text.includes(`/d/${publicId}<`),
    );

    // ---- deck page: private serves the noindexed shell ---------------------
    await api("PATCH", `/api/decks/${deckId}`, { token, body: { visibility: "private" } });
    const privatePage = await page(`/d/${publicId}`);
    check("private deck shell noindexed", NOINDEX_RE.test(privatePage.text));
    check("private deck shell leaks no deck name", !privatePage.text.includes("SEO smoke deck"));
    if (deckOgPath) {
      const img = await fetchImage(deckOgPath);
      check(
        "private deck OG image degrades to the generic brand (200, png)",
        img.status === 200 && img.type.startsWith("image/png"),
        img,
      );
    }

    // ---- hub page ----------------------------------------------------------
    const hubPage = await page(`/c/${leader.slug}`);
    check("hub 200", hubPage.status === 200, hubPage.status);
    check("hub canonical tag", hasCanonical(hubPage.text, `/c/${leader.slug}`));
    check("hub description folds combos in", hubPage.text.includes("budget picks, and combos"));
    check(
      "hub JSON-LD breadcrumb",
      jsonLdBlocks(hubPage.text).some((b) => b["@type"] === "BreadcrumbList"),
    );
    const hubOgPath = ogImagePath(hubPage.text);
    check("hub og:image present", !!hubOgPath);
    if (hubOgPath) {
      const img = await fetchImage(hubOgPath);
      check(
        "hub OG image renders (200, png, >10KB)",
        img.status === 200 && img.type.startsWith("image/png") && img.bytes > 10_000,
        img,
      );
    }

    // ---- card page ---------------------------------------------------------
    const cardPage = await page(`/cards/${card.id}`);
    check("card page 200", cardPage.status === 200, cardPage.status);
    check("card canonical tag", hasCanonical(cardPage.text, `/cards/${card.id}`));
    check(
      "card meta description present",
      cardPage.text.includes("Printings, current prices, format legality"),
    );
    check(
      "card JSON-LD breadcrumb",
      jsonLdBlocks(cardPage.text).some((b) => b["@type"] === "BreadcrumbList"),
    );
    const cardOgPath = ogImagePath(cardPage.text);
    check("card og:image present", !!cardOgPath);
    if (cardOgPath) {
      const img = await fetchImage(cardOgPath);
      check(
        "card OG image renders (200, png, >10KB)",
        img.status === 200 && img.type.startsWith("image/png") && img.bytes > 10_000,
        img,
      );
    }

    // ---- OP surfaces (P4.4) ------------------------------------------------
    const [opLeader] = await sql<{ id: string; slug: string; name: string; key: string }[]>`
      SELECT ci.id::text AS id, ci.slug, ci.name, ci.external_key AS key
      FROM card_identities ci
      WHERE ci.game_id = 2 AND ci.is_leader_candidate AND ci.slug IS NOT NULL
        AND NOT ci.is_removed
        AND EXISTS (SELECT 1 FROM card_printings p
                    WHERE p.card_identity_id = ci.id AND p.is_default)
      ORDER BY ci.external_key ASC LIMIT 1`;
    check("OP fixture leader exists (slugs assigned)", !!opLeader, opLeader);
    if (!opLeader) throw new Error("no slugged OP leader; run the slug backfill first");

    const leadersPage = await page("/leaders");
    check("/leaders 200", leadersPage.status === 200, leadersPage.status);
    check("/leaders canonical tag", hasCanonical(leadersPage.text, "/leaders"));
    check(
      "/leaders links the fixture hub",
      leadersPage.text.includes(`/l/${opLeader.slug}`),
      opLeader.slug,
    );
    check("/leaders carries the Bandai posture line", leadersPage.text.includes("©BANDAI"));

    const opHub = await page(`/l/${opLeader.slug}`);
    check("OP hub 200", opHub.status === 200, opHub.status);
    check("OP hub canonical tag", hasCanonical(opHub.text, `/l/${opLeader.slug}`));
    check(
      "OP hub title carries the external key (17-Luffys disambiguation)",
      opHub.text.includes(`(${opLeader.key}) — One Piece Leader`),
    );
    check(
      "OP hub JSON-LD breadcrumb",
      jsonLdBlocks(opHub.text).some((b) => b["@type"] === "BreadcrumbList"),
    );
    check(
      "OP hub build CTA targets the OP editor deep link",
      opHub.text.includes("Build with this leader") && opHub.text.includes("/decks/new?game=optcg"),
    );
    check(
      "OP hub browse links land preset on /cards",
      opHub.text.includes("/cards?game=optcg&amp;color=within:") ||
        opHub.text.includes("/cards?game=optcg&color=within:"),
    );
    check("OP hub carries the Bandai posture line", opHub.text.includes("©BANDAI"));
    check(
      "OP hub renders no MTG-signal shelves (cold-start rule)",
      !opHub.text.includes("Staples") && !opHub.text.includes("Budget"),
    );
    const opHubOgPath = ogImagePath(opHub.text);
    check("OP hub og:image present", !!opHubOgPath);
    if (opHubOgPath) {
      const img = await fetchImage(opHubOgPath);
      check(
        "OP hub OG image renders (200, png — artless frame by design)",
        img.status === 200 && img.type.startsWith("image/png") && img.bytes > 5_000,
        img,
      );
    }

    // The OP leader's own card page: game-aware hub link + no price columns.
    const opCardPage = await page(`/cards/${opLeader.id}`);
    check("OP card page 200", opCardPage.status === 200, opCardPage.status);
    check(
      "OP card meta description (no price claims)",
      opCardPage.text.includes("Card text, printings, and format legality"),
    );
    check("OP card page links its /l/ hub", opCardPage.text.includes(`/l/${opLeader.slug}`));
    check("OP card page suppresses price columns", !opCardPage.text.includes(">USD<"));
    check("OP card page carries the Bandai posture line", opCardPage.text.includes("©BANDAI"));

    // /cards game scoping: each corpus is its own canonical (P4.4 call).
    const cardsMtg = await page("/cards");
    check("/cards (MTG) canonical stays bare", hasCanonical(cardsMtg.text, "/cards"));
    check("/cards (MTG) keeps Scryfall attribution", cardsMtg.text.includes("Scryfall"));
    const cardsOp = await page("/cards?game=optcg");
    check(
      "/cards?game=optcg canonical keeps the game param",
      /rel="canonical" href="[^"]*\/cards\?game=optcg"/.test(cardsOp.text),
    );
    check("/cards?game=optcg carries the Bandai posture line", cardsOp.text.includes("©BANDAI"));

    const lMap = await page("/l/sitemap.xml");
    check("OP hub sitemap 200", lMap.status === 200, lMap.status);
    check("OP hub sitemap lists the fixture hub", lMap.text.includes(`/l/${opLeader.slug}</loc>`));

    // The widened card sitemap really advertises OP pages: locate the fixture
    // leader's chunk by its position in the shared id order and look inside.
    const [{ before }] = await sql<{ before: number }[]>`
      SELECT count(*)::int AS before FROM card_identities
      WHERE NOT is_removed AND game_id IN (1, 2) AND id < ${opLeader.id}::uuid`;
    const opChunk = Math.floor(before / 10_000);
    const opChunkMap = await page(`/cards/sitemap/${opChunk}.xml`);
    check(
      `card sitemap chunk ${opChunk} lists the OP card page`,
      opChunkMap.status === 200 && opChunkMap.text.includes(`/cards/${opLeader.id}</loc>`),
      { status: opChunkMap.status, chunk: opChunk },
    );

    // Traits: the distinct-options endpoint and the live filter (P4.2 wire).
    const traits = await api("GET", "/api/cards/options?game=optcg&field=traits");
    const traitOptions = (traits.json as { options?: string[] })?.options ?? [];
    check(
      "traits options endpoint serves the corpus (171 distinct as of P4.4)",
      traits.status === 200 && traitOptions.length >= 100 && traitOptions.includes("Navy"),
      { status: traits.status, count: traitOptions.length },
    );
    const oneTrait = await api("GET", "/api/cards/search?game=optcg&traits=Supernovas&limit=1");
    const oneTotal = (oneTrait.json as { total?: number })?.total ?? 0;
    const twoTraits = await api(
      "GET",
      "/api/cards/search?game=optcg&traits=Supernovas,Navy&limit=1",
    );
    const twoTotal = (twoTraits.json as { total?: number })?.total ?? 0;
    check("traits filter matches cards (any-mode)", oneTotal > 0, oneTotal);
    check("two-trait list widens the match (mode any = OR)", twoTotal > oneTotal, {
      oneTotal,
      twoTotal,
    });

    // ---- home --------------------------------------------------------------
    const home = await page("/");
    // Next collapses `canonical: "/"` + metadataBase to the bare origin.
    check("home canonical tag", /rel="canonical" href="https?:\/\/[^"/]+\/?"/.test(home.text));
    check(
      "home JSON-LD WebSite + SearchAction",
      jsonLdBlocks(home.text).some(
        (b) => b["@type"] === "WebSite" && JSON.stringify(b).includes("search_term_string"),
      ),
    );
    check(
      "home links the OP surfaces (leaders + scoped card search)",
      home.text.includes("/leaders") && home.text.includes("/cards?game=optcg"),
    );
  } finally {
    if (deckId && token) {
      await api("DELETE", `/api/decks/${deckId}`, { token }).catch(() => {});
    }
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
