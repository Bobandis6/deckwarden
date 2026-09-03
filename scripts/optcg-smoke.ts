/**
 * Curl-level smoke for the P4.1 One Piece corpus surface — read-only on
 * purpose (no deck creation, no rate-limit budget consumed beyond one
 * resolve POST):
 *   - /api/cards/search?game=optcg (trgm name, FTS text, format=standard —
 *     the format row that un-400s the M0 fire drill)
 *   - /api/cards/resolve pass 0 (card-id import resolution)
 *   - /cards/<uuid> rendering an OP card with image + © line + statement link
 *
 *   pnpm smoke:optcg
 *   BASE_URL=https://deckwarden.gg pnpm smoke:optcg
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

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

interface SearchResult {
  id: string;
  name: string;
  attrs: Record<string, unknown>;
  image: string | null;
  isLeaderCandidate: boolean;
}

async function getJson(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log(`optcg smoke against ${BASE}`);

  // Name search (trgm over name_norm — dots stay literal, trgm absorbs them).
  const byName = await getJson("/api/cards/search?game=optcg&name=luffy&limit=10");
  const nameResults = (byName.json as { results?: SearchResult[] })?.results ?? [];
  check("search?game=optcg&name=luffy → 200", byName.status === 200, byName.status);
  check("…returns results", nameResults.length > 0);
  check(
    "…all results are Luffy-ish with attrs.category",
    nameResults.every((r) => /luffy/i.test(r.name) && typeof r.attrs?.category === "string"),
    nameResults[0],
  );
  // Bandai's CORP: same-site makes hotlinks unrenderable, so pre-R2-flip the
  // wire honestly carries null; post-flip it must be the R2 mirror URL.
  check(
    "…image is null (pre-R2) or a non-Bandai https URL (post-flip), never a broken hotlink",
    nameResults.every(
      (r) =>
        r.image === null ||
        (typeof r.image === "string" &&
          /^https:\/\//.test(r.image) &&
          !r.image.includes("onepiece-cardgame.com")),
    ),
    nameResults[0]?.image,
  );

  // FTS over the type_line/oracle_text keys punk-map writes.
  const byText = await getJson("/api/cards/search?game=optcg&text=rested%20DON&limit=5");
  const textResults = (byText.json as { results?: SearchResult[] })?.results ?? [];
  check(
    "search?game=optcg&text=… (FTS) → 200 with results",
    byText.status === 200 && textResults.length > 0,
    byText.status,
  );

  // The format row (seed-data optcgStandard) — this 400'd before P4.1.
  const withFormat = await getJson(
    "/api/cards/search?game=optcg&format=standard&name=zoro&limit=5",
  );
  check("search?game=optcg&format=standard → 200", withFormat.status === 200, withFormat.status);

  // Leader filter sanity: a known Leader resolves as leader candidate.
  const resolveRes = await fetch(`${BASE}/api/cards/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game: "optcg", names: ["OP01-001", "st01-001", "OP99-999"] }),
  });
  const resolveJson = (await resolveRes.json().catch(() => null)) as {
    results?: Array<{ input: string; match: SearchResult | null }>;
  } | null;
  check("resolve → 200", resolveRes.status === 200, resolveRes.status);
  const r = resolveJson?.results ?? [];
  const op01 = r.find((x) => x.input === "OP01-001");
  const st01 = r.find((x) => x.input === "st01-001");
  const miss = r.find((x) => x.input === "OP99-999");
  check(
    "resolve OP01-001 by card id → Roronoa Zoro, leader",
    op01?.match?.name === "Roronoa Zoro" && op01?.match?.isLeaderCandidate === true,
    op01?.match?.name,
  );
  check(
    "resolve is case-insensitive on ids",
    st01?.match?.name === "Monkey.D.Luffy",
    st01?.match?.name,
  );
  check("unknown id gets no match", miss !== undefined && miss.match === null);

  // Card page: image + © line + sourcing statement link.
  const cardId = op01?.match?.id;
  check("have a card uuid for the page check", typeof cardId === "string");
  if (cardId) {
    const pageRes = await fetch(`${BASE}/cards/${cardId}`);
    const html = await pageRes.text();
    check("/cards/<uuid> → 200", pageRes.status === 200, pageRes.status);
    check("…renders the card name", html.includes("Roronoa Zoro"));
    check("…renders the © line", html.includes("Eiichiro Oda/Shueisha"));
    check("…links the sourcing statement", html.includes("/legal#one-piece"));
    check(
      "…renders the image slot honestly (mirror image or the coming-soon placeholder)",
      /\/optcg\/images\//.test(html) || html.includes("Card image coming soon"),
    );
  }

  // The statement itself.
  const legal = await fetch(`${BASE}/legal`);
  const legalHtml = await legal.text();
  check(
    "/legal carries the One Piece statement",
    legal.status === 200 &&
      legalHtml.includes("One Piece Card Game data") &&
      legalHtml.includes("punk-records"),
    legal.status,
  );

  console.log(failures === 0 ? "\nall optcg smoke checks passed" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
