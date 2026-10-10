/**
 * End-to-end smoke for Swap Lab (Y7a, WAVE4 D8): POST /api/alternatives
 * against live data. Runs outside `pnpm check` (a live server + database).
 * It creates nothing — the route is a snapshot read; it spends only its own
 * rate-limit bucket (30/min, 200/hour), so requests are paced under it.
 *
 *   pnpm smoke:alternatives                                  # http://localhost:3000
 *   BASE_URL=https://deckwarden.gg pnpm smoke:alternatives   # against a deploy
 *
 * Covers WAVE4 E's acceptance — Sol Ring in a mono-white deck offers mana
 * rocks (every row shares "mana-rock"), not lifegain; Swords to Plowshares
 * offers creature removal; One Piece answers 400 — and the route's contract
 * on live rows: inside the deck's colors and the ±1 mana-value window, never
 * a deck card or a land, the role line leading each row's evidence with its
 * credit, a CardWire per row, no-store; the honest empties (a land is not
 * offered, a card no role reaches says "no-roles"); goals (a Bracket 2
 * target hides the Game Changer rocks with their line, Bracket 4 hides
 * none). Before the first nightly with roles, every card answers
 * "no-roles" — the smoke says so and stops there.
 *
 * And the gold set: 25 staples in a deck of their own colors, each with the
 * kind of card a hit must be — judged from each row's own rules text and
 * type line, never from its tags. The hit rate over the top five is
 * printed for the ship note; below 70% fires LATER row 154 (embeddings).
 */
export {}; // import-free file: stay a module so `main` doesn't collide with other scripts

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Under the route's 30/min bucket. */
const PACE_MS = 2100;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Wire {
  id: string;
  name: string;
  ciMask: number;
  costValue: number | null;
  primaryType: string | null;
  attrs: { type_line?: string; oracle_text?: string; roles?: string[] };
  legality: unknown[];
}
interface Row {
  cardId: string;
  name: string;
  costValue: number | null;
  shared: string[];
  evidence: { source: string; why: string }[];
  conflicts: { rule: string; why: string; severity: string }[];
  card: Wire;
}
interface Answer {
  cardId: string;
  roles: string[];
  alternatives: Row[];
  hidden: Row[];
  combosTruncated: boolean;
  tradeoff: { source: string; why: string; side: string }[] | null;
  reason?: string;
}

async function findCard(name: string): Promise<{ id: string; name: string }> {
  const res = await fetch(
    `${BASE}/api/cards/search?game=mtg&name=${encodeURIComponent(name)}&limit=5`,
  );
  const json = (await res.json()) as { results?: { id: string; name: string }[] };
  const hit = json.results?.find((c) => c.name === name) ?? json.results?.[0];
  if (!res.ok || !hit) throw new Error(`Card search for "${name}" failed (status ${res.status})`);
  return hit;
}

let lastPost = 0;
async function alternatives(
  body: unknown,
): Promise<{ status: number; json: Answer; cache: string }> {
  const wait = lastPost + PACE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastPost = Date.now();
  const res = await fetch(`${BASE}/api/alternatives`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate-limited — stop here; never retry into a 429");
  return {
    status: res.status,
    json: (await res.json()) as Answer,
    cache: res.headers.get("cache-control") ?? "",
  };
}

const text = (c: Wire) => `${c.attrs.oracle_text ?? ""}`.replace(/\n/g, " | ");
const type = (c: Wire) => c.attrs.type_line ?? "";
const has = (re: RegExp) => (c: Wire) => re.test(text(c));
const MANA = /add (\{|one mana|two mana|three mana|x mana|an amount)|mana of any/i;

/** The kind of card a hit must be — rules text and type line only. */
const KIND = {
  rock: (c: Wire) => /Artifact/.test(type(c)) && !/Creature/.test(type(c)) && MANA.test(text(c)),
  dork: (c: Wire) => /Creature/.test(type(c)) && MANA.test(text(c)),
  landRamp: has(
    /search (your|their) library for [^|]*(lands?|forest|plains|island|swamp|mountain)( cards?)?\b[^|]*battlefield|put (a|up to \w+) land cards? from your hand onto the battlefield|play an additional land/i,
  ),
  spotKill: has(
    /(exile|destroy) (target|up to \w+ target) (\w+ )*?(creature|nonland permanent)|exile that creature|target creature (gets|an opponent controls gets) -\d|-\w+\/-\w+|deals? [^|.]*damage to (any target|target creature|up to \w+ target creature|each of up to)|return target (\w+ )*?creature to (its|their) owner|fights? (target|up to one target|another target)|sacrifices? (a|an) (attacking )?creature/i,
  ),
  permanent: has(
    /(exile|destroy) target (nonland |nontoken |nonland, nontoken )?permanent|target (artifact|enchantment)|(exile|destroy) target (\w+ )*(artifact|enchantment)|shuffles? it into|target nonland permanent/i,
  ),
  artEnch: has(
    /target (artifact|enchantment|noncreature)|(artifact|enchantment)s? (or|and) (artifact|enchantment)|target (nonland )?permanent|all (artifacts|enchantments)/i,
  ),
  counter: has(/counter target|counter (that|it|up to)/i),
  wipe: has(
    /(destroy|exile) (all|each) (\w+ )*(creatures?|nonland permanents?|permanents?)|all creatures get -|each creature|deals? \w+ damage to each (creature|other creature)|return all (\w+ )*(creatures|nonland permanents|permanents)|each player sacrifices/i,
  ),
  tutor: (c: Wire) =>
    /search your library for/i.test(text(c)) &&
    !/search your library for (a|an|up to \w+|two|three|any number of) (basic )?(\w+ )?(land|forest|plains|island|swamp|mountain)/i.test(
      text(c),
    ),
  draw: has(/draws? (a|an|one|two|three|four|five|x|\w+) cards?|draw cards? equal|draw that many/i),
  regrowth: has(
    /(return|put) [^|.]*(from|in) (your|a|an opponent.s|their) graveyards? (to|into|onto) (your hand|the battlefield|its owner)|cast [^|.]*from your graveyard|graveyard to your hand/i,
  ),
  reanimate: has(
    /from (a|your|their|an opponent.s|any) graveyards? (on)?to the battlefield|graveyards? onto the battlefield|return enchanted creature card to the battlefield|(return|put) (it|that card|target creature card|them) (on)?to the battlefield/i,
  ),
  protect: has(/hexproof|indestructible|protection from|phase(s)? out|shroud|ward/i),
  sacOutlet: has(/sacrifice (a|an|another|one or more|x|any number of) [^|:.]*:/i),
  burn: has(
    /deals? [^|.]*damage to (any target|target (creature|player|opponent|planeswalker|creature or planeswalker|permanent)|each opponent|any one target|target player)/i,
  ),
  tokens: (c: Wire) =>
    /create/i.test(text(c)) &&
    /token/i.test(text(c)) &&
    /at the beginning|whenever|\{t\}|:|landfall/i.test(text(c)),
  rampish: has(/treasure|add \{|add (one|two|three) mana|search your library for [^|.]*land/i),
};

/** Commanders by color, for decks of the staples' own colors. */
const COMMANDERS: Record<string, string> = {
  W: "Sram, Senior Edificer",
  U: "Talrand, Sky Summoner",
  B: "K'rrik, Son of Yawgmoth",
  R: "Krenko, Mob Boss",
  G: "Selvala, Heart of the Wilds",
  BG: "Meren of Clan Nel Toth",
};

const GOLD: [string, keyof typeof COMMANDERS, keyof typeof KIND, string][] = [
  ["Sol Ring", "W", "rock", "mana rock"],
  ["Arcane Signet", "BG", "rock", "mana rock"],
  ["Mind Stone", "R", "rock", "mana rock"],
  ["Llanowar Elves", "G", "dork", "mana dork"],
  ["Cultivate", "G", "landRamp", "land ramp"],
  ["Rampant Growth", "G", "landRamp", "land ramp"],
  ["Swords to Plowshares", "W", "spotKill", "creature removal"],
  ["Path to Exile", "W", "spotKill", "creature removal"],
  ["Beast Within", "G", "permanent", "permanent removal"],
  ["Chaos Warp", "R", "permanent", "permanent removal"],
  ["Nature's Claim", "G", "artEnch", "artifact / enchantment removal"],
  ["Counterspell", "U", "counter", "counterspell"],
  ["Wrath of God", "W", "wipe", "board wipe"],
  ["Demonic Tutor", "B", "tutor", "tutor (not for lands)"],
  ["Rhystic Study", "U", "draw", "card draw"],
  ["Harmonize", "G", "draw", "card draw"],
  ["Eternal Witness", "G", "regrowth", "recursion"],
  ["Reanimate", "B", "reanimate", "reanimation"],
  ["Heroic Intervention", "G", "protect", "protection"],
  ["Swiftfoot Boots", "W", "protect", "protection"],
  ["Ashnod's Altar", "B", "sacOutlet", "sacrifice outlet"],
  ["Viscera Seer", "B", "sacOutlet", "sacrifice outlet"],
  ["Lightning Bolt", "R", "burn", "burn"],
  ["Bitterblossom", "B", "tokens", "token maker"],
  ["Smothering Tithe", "W", "rampish", "ramp"],
];

const MASK: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const maskOf = (colors: string) => [...colors].reduce((m, c) => m | MASK[c], 0);

const body = (leaderId: string, ids: string[], cardId: string, goals?: unknown) => ({
  game: "mtg",
  format: "commander",
  leaderIds: [leaderId],
  entries: ids.map((cardId) => ({ cardId, qty: 1 })),
  cardId,
  ...(goals ? { goals } : {}),
});

async function main() {
  console.log(`smoke:alternatives against ${BASE}`);
  const leaders = new Map<string, { id: string; name: string }>();
  for (const [colors, name] of Object.entries(COMMANDERS))
    leaders.set(colors, await findCard(name));
  const sol = await findCard("Sol Ring");
  const swords = await findCard("Swords to Plowshares");
  const tower = await findCard("Command Tower");
  const bears = await findCard("Grizzly Bears");
  const sram = leaders.get("W")!;

  console.log("\n— the honest empties, the 400s");
  const land = await alternatives(body(sram.id, [sol.id, tower.id], tower.id));
  check(
    "a land is not offered (200, reason not-offered, no rows)",
    land.status === 200 &&
      land.json.reason === "not-offered" &&
      land.json.alternatives.length === 0,
    land.json,
  );
  const plain = await alternatives(body(sram.id, [bears.id], bears.id));
  check(
    "a card no role reaches says no-roles",
    plain.status === 200 && plain.json.reason === "no-roles",
    plain.json,
  );
  const op = await alternatives({
    ...body(sram.id, [sol.id], sol.id),
    game: "optcg",
    format: "standard",
  });
  check("One Piece answers 400", op.status === 400, op.json);
  const outside = await alternatives(body(sram.id, [swords.id], sol.id));
  check("a card outside the entries answers 400", outside.status === 400, outside.json);

  console.log("\n— Sol Ring in a mono-white deck (WAVE4 E)");
  const solAnswer = await alternatives(body(sram.id, [sol.id, swords.id], sol.id));
  const a = solAnswer.json;
  check(
    "200, no-store",
    solAnswer.status === 200 && solAnswer.cache === "no-store",
    solAnswer.status,
  );
  if (a.reason === "no-roles") {
    console.log(
      "\n  Sol Ring holds no role yet — the roles haven't landed (run the nightly), so nothing more to check.",
    );
    process.exit(failures > 0 ? 1 : 0);
  }
  check(
    "Sol Ring's roles are ramp · mana rock",
    JSON.stringify(a.roles) === JSON.stringify(["ramp", "mana-rock"]),
    a.roles,
  );
  check("eight alternatives", a.alternatives.length === 8, a.alternatives.length);
  check(
    "every one is a mana rock (shares mana-rock) — no lifegain, no land ramp",
    a.alternatives.every((r) => r.shared.includes("mana-rock")),
    a.alternatives.map((r) => [r.name, r.shared]),
  );
  check(
    "inside the deck's colors (white or colorless)",
    a.alternatives.every((r) => (r.card.ciMask & ~1) === 0),
  );
  check(
    "inside the mana-value window 0–2",
    a.alternatives.every((r) => r.costValue !== null && r.costValue >= 0 && r.costValue <= 2),
    a.alternatives.map((r) => r.costValue),
  );
  check(
    "never a deck card, never a land",
    a.alternatives.every(
      (r) => r.cardId !== sol.id && r.cardId !== swords.id && r.card.primaryType !== "Land",
    ),
  );
  check(
    "the role line leads each row, credited",
    a.alternatives.every(
      (r) =>
        r.evidence[0]?.source === "scryfall_tagger" &&
        r.evidence[0].why.startsWith("Both: ") &&
        r.evidence[0].why.endsWith("— community-tagged on Scryfall Tagger"),
    ),
    a.alternatives[0]?.evidence[0],
  );
  check(
    "every row carries its CardWire (legality too)",
    a.alternatives.every((r) => r.card?.id === r.cardId && Array.isArray(r.card.legality)),
  );
  check(
    "the tradeoff speaks for a staple (a keep line)",
    (a.tradeoff ?? []).some((e) => e.side === "keep"),
    a.tradeoff,
  );
  console.log(`  top: ${a.alternatives.map((r) => r.name).join(" · ")}`);

  console.log("\n— goals");
  const two = (await alternatives(body(sram.id, [sol.id], sol.id, { v: 1, targetLevel: 2 }))).json;
  const gcRocks = two.hidden.filter((h) => h.conflicts.some((c) => c.rule === "game-changers"));
  check(
    "a Bracket 2 target hides the Game Changer rocks, with their line",
    gcRocks.length > 0 &&
      gcRocks.every((h) =>
        h.conflicts.some((c) => c.severity === "hide" && /Game Changer/.test(c.why)),
      ),
    two.hidden.map((h) => [h.name, h.conflicts.map((c) => c.why)]),
  );
  check(
    "…and none of them is in the kept list",
    two.alternatives.every((r) => !gcRocks.some((h) => h.cardId === r.cardId)),
  );
  const four = (await alternatives(body(sram.id, [sol.id], sol.id, { v: 1, targetLevel: 4 }))).json;
  check(
    "a Bracket 4 target hides none",
    four.hidden.length === 0,
    four.hidden.map((h) => h.name),
  );
  console.log(`  hidden at Bracket 2: ${two.hidden.map((h) => h.name).join(", ")}`);

  console.log("\n— Swords to Plowshares (WAVE4 E)");
  const sw = (await alternatives(body(sram.id, [swords.id], swords.id))).json;
  check(
    "offers creature removal (every row shares creature-removal)",
    sw.alternatives.length > 0 &&
      sw.alternatives.every((r) => r.shared.includes("creature-removal")),
    sw.alternatives.map((r) => [r.name, r.shared]),
  );
  console.log(`  top: ${sw.alternatives.map((r) => r.name).join(" · ")}`);

  console.log("\n— the gold set (top five, judged by rules text)");
  let hits = 0;
  let shown = 0;
  const rows: string[] = [];
  for (const [name, colors, kind, label] of GOLD) {
    const card = await findCard(name);
    const leader = leaders.get(colors)!;
    const res = (await alternatives(body(leader.id, [card.id], card.id))).json;
    const top = res.alternatives.slice(0, 5);
    const ok = top.filter((r) => KIND[kind](r.card));
    hits += ok.length;
    shown += top.length;
    check(
      `${name}: within ${colors} (${maskOf(colors)})`,
      top.every((r) => (r.card.ciMask & ~maskOf(colors)) === 0),
    );
    rows.push(
      `${ok.length}/${top.length}  ${name} → ${label} [${res.roles.join(", ")}]: ` +
        top.map((r) => `${r.name}${KIND[kind](r.card) ? "" : " ✗"}`).join("; "),
    );
  }
  for (const r of rows) console.log(`  ${r}`);
  const rate = shown > 0 ? hits / shown : 0;
  console.log(`  hit rate @5: ${hits}/${shown} = ${(rate * 100).toFixed(1)}%`);
  check("the gold set's hit rate @5 is at least 70% (else LATER row 154 fires)", rate >= 0.7, rate);

  console.log(failures > 0 ? `\n${failures} check(s) FAILED` : "\nall checks passed");
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
