# MTG Replace — Feature, Algorithm & API Teardown (for Deckwarden)

> **Corrections added 2026-09-30, when Wave 4 was planned (`WAVE4.md`).** (1) §8.5 says Scryfall Tagger tags "aren't in the bulk files". Scryfall now publishes an `oracle_tags` bulk file (about 6 MB gzipped, 4,559 tags, updated daily); Wave 4 reads it for land-denial and extra-turn flags and for Swap Lab's roles. (2) §8.4's top-~200 neighbors per card would take roughly 0.46–0.8 GB in Deckwarden's Postgres — more than the whole Neon free tier — and text embeddings or regex role tags conflict with Deckwarden's rule that roles are never inferred from card text. Swap Lab (`WAVE4.md` Y7a) matches by shared Tagger tags instead, filtered by the deck's commander identity, goals and budget. The observations below are 2026-09-30 snapshots of a third-party site: link to MTG Replace, never copy its curated notes or scores.

> **Site:** https://mtgreplace.com
> **Explored:** 30 Sep 2026 — live browsing, the site's own public JavaScript, its network calls, sitemaps and ~60 card pages
> **Why this doc exists:** a reference to come back to when deciding which "find a replacement card" features to build into **Deckwarden**, and whether to integrate with MTG Replace or build the capability yourself.
> **Confidence legend:** ✅ observed directly · 🔍 inferred from evidence (reasoning shown) · ❓ not verified
> Prices and counts below are snapshots from the visit date.

## Contents

0. [TL;DR](#0-tldr)
1. [Site map](#1-site-map)
2. [Features in detail](#2-features-in-detail)
3. [How the similarity engine works (reverse-engineered)](#3-how-the-similarity-engine-works-reverse-engineered)
4. ["API" reference (unofficial)](#4-api-reference-unofficial)
5. [Tech stack](#5-tech-stack)
6. [Strengths & weaknesses](#6-strengths--weaknesses)
7. [Feature backlog for Deckwarden](#7-feature-backlog-for-deckwarden)
8. [Build-it-yourself blueprint](#8-build-it-yourself-blueprint)
9. [Legal & attribution checklist](#9-legal--attribution-checklist)
10. [Appendix: evidence, selectors, design tokens, open questions](#10-appendix)

---

## 0. TL;DR

- **What it is:** a single-purpose tool. Type a card name, get a page of up to ~20 "similar" cards you could swap in, each with a similarity %, a USD price and buy/reference links. No accounts, no deck import, no filters, no settings. ✅
- **Card universe:** 32,297 unique cards — effectively **every card currently legal in Commander** (banned cards are missing; the two cards unbanned in Feb 2026 are present). 🔍
- **How similarity works:** pre-computed, symmetric text similarity over each card's type line + rules text (very likely embeddings), filtered to the searched card's **color identity**, capped at 20. On top sits a small **hand-curated "override" layer** (fed by a public suggestion form) that pins human-picked replacements with a human score and a written note. 🔍
- **Quality:** great when a card has functional twins (Sol Ring → Thran Dynamo, Counterspell → Cancel). Weak when shared *reminder text* or the card's *own name* dominates the text (Cyclonic Rift → every Overload card; Lightning Bolt → cards with "Lightning"/"Bolt" in the name; Path to Exile → land-fetchers). 🔍
- **API:** exactly one JSON endpoint — `GET /api/search?q=` (name autocomplete, max 10 results). Alternatives are HTML-only. No CORS, no auth, no docs, and the Terms grant a **personal, non-commercial** use license → don't build Deckwarden on top of it. The safe integration is a plain deep link to `https://mtgreplace.com/cards/<slug>`. ✅
- **Recommendation:** replicate and improve it with Scryfall bulk data + embeddings + a curated-override table. The step-by-step blueprint is in §8; a prioritized feature backlog is in §7.

---

## 1. Site map

| Path | What it is | Notes |
|---|---|---|
| `/` | Home: title, one-line pitch, card-name search box with autocomplete, three static example links (Lightning Bolt, Rhystic Study, Counterspell) | ✅ Examples never change |
| `/cards/:slug` | Alternatives page for one card | ✅ Unknown slug → HTTP 404 "Card Not Found" page |
| `/cards` and `/cards?page=N` | "Complete Card List": all 32,297 names A→Z, 100 per page, 323 pages | ✅ No search, filter or letter-jump on this page |
| `/api/search?q=` | JSON name autocomplete | ✅ The only JSON endpoint |
| `/privacy`, `/terms` | Legal pages ("Last Updated: December 7, 2025") | ✅ |
| `/robots.txt` | `Allow: /` for all agents + sitemap pointer | ✅ |
| `/sitemap.xml` | Sitemap index → `/sitemaps/pages.xml` (4 URLs), `/sitemaps/cards-1.xml` (25,000 URLs), `/sitemaps/cards-2.xml` (7,297 URLs) | ✅ `lastmod` was only minutes old → regenerated on a schedule or on request |
| `/up` | Rails health check (blank green page) | ✅ |
| `tally.so/r/2EDjRp` | "Suggest a replacement" form (third-party Tally), linked from the header | ✅ Opens in a new tab |
| `/cards/:slug.json`, `/api/cards/...`, `/manifest.json` | Don't exist | ✅ `.json` → 406 Not Acceptable; the others → 404 |

Global chrome on every page: header (logo → home, "Suggest a replacement" link) and footer ("Data from Scryfall", All Cards, Privacy Policy, Terms of Service). Dark theme only; English only.

---

## 2. Features in detail

### 2.1 Card-name search (autocomplete)

**Client behavior** — read from the page's own Stimulus controller (`card-search`) and confirmed by hand ✅

- Fires only when the trimmed input is **≥ 2 characters**; **300 ms debounce** (typing "counter" quickly produced exactly one request).
- States: "Searching…" while waiting → list of up to **10** names (scrollable) → "No cards found" for an empty result → "Error loading results" on a network error.
- Keyboard: ↑/↓ moves the highlight (item scrolls into view), **Enter** opens the highlighted item — or the **first** item when nothing is highlighted — and **Esc** closes the list. Clicking outside also closes it.
- Combined with the ranking below, that produces a real gotcha: typing `rhystic` and pressing Enter opens **Rhystic Tutor**, not Rhystic Study.
- The ⚔ icon inside the input is a **"go" button** (opens the first suggestion). It looks like a clear/close button — a small UX trap.
- Choosing a result does a full page load to `/cards/<slug>` (not a Turbo visit).
- Names are HTML-escaped before being injected into the dropdown.

**Server matching behavior** — tested directly against `/api/search` ✅

| Query | What came back | Takeaway |
|---|---|---|
| `bolt` vs `BOLT` | identical 10 results | case-insensitive |
| `Aether` vs `Æther` | identical results | ligature folding |
| `Lim-D` | the Lim-Dûl cards | accent-insensitive |
| `ligthning bolt` | Lightning Bolt (+ an MDFC containing "Lightning Bolt") | typo-tolerant (transposed letters) |
| `cunterspell` | Counterspell | typo-tolerant (missing letter) |
| `bolt lightning`, `study rhystic` | Lightning Bolt / Rhystic Study | word order doesn't matter; every word must match |
| `sol ring` vs `sol-ring` | Sol Ring vs a list of "Soaring …" cards | a hyphen is **not** treated like a space |
| `sol` | Sol Talisman, Sol Ring, Sol Grail, Winter Soldier… | no "exact / prefix match first" ranking |
| `counter` | Legolas, Counter of Kills; Gimli, Counter of Kills; Flash Counter… | Counterspell isn't in the top 10 |
| `%`, `_`, `"` | 10 arbitrary cards (reverse-alphabetical) | punctuation-only input isn't rejected |
| empty, whitespace, no `q` | `[]` | empty guard |
| `a` (1 char) | 10 results | the 2-char minimum is client-side only |

Response shape: `[{"name":"Sol Ring","slug":"sol-ring"}]` — no IDs, images or other fields. Server time ≈ 10 ms (`x-runtime`), ≈ 200 ms round trip.

### 2.2 Card alternatives page (`/cards/:slug`)

**Layout, top to bottom** ✅

1. "← Back to Search" link.
2. Heading: **"Alternatives to <Card>"**. A curated card can get a custom editorial headline instead — seen only on Rhystic Study.
3. The searched card: Scryfall "normal" image with a green USD **price badge**, plus a parchment-styled **oracle panel** — name, mana cost as SVG symbols, type line, rules text with inline symbols, flavor text.
4. Count sentence: "Here are N cards you can replace X with in your deck." (The same count is reused in the meta description.)
5. A responsive grid of alternative tiles (3 columns on desktop; `repeat(auto-fill, minmax(200px, 1fr))` at ≤ 768 px). Each tile has:
   - the card image (lazy-loaded) linking to **that card's own alternatives page**, so users can hop card → card;
   - a price badge (USD; missing when there is no price);
   - the name (h3 link);
   - a **"Similarity" bar** with an integer %;
   - an optional **curated note** (override entries only — see §2.3);
   - four outbound links, all `target="_blank" rel="noopener nofollow"`: **Scryfall** (a specific printing's page), **EDHREC** (via EDHREC's `/route/` redirect), **TCGPlayer (Affiliate Link)**, **Cardmarket**.
6. "← Back to Search" again at the bottom.

**How many results?** ✅

| Card | Tiles | Similarity range |
|---|---|---|
| Counterspell | 20 | 100 → 76 |
| Lightning Bolt | 20 | 71 → 43 |
| Cyclonic Rift | 20 | 94 → 30 |
| Rhystic Study | 22 (3 curated + 19 algorithmic) | 90 → 52 |
| Sol Ring | 16 | 100 → 75 |
| Doubling Season | 16 | 84 → 28 |
| Swords to Plowshares | 13 | 92 → 49 |
| Path to Exile | 12 | 87 → 68 |
| Smothering Tithe | 9 | 74 → 65 |
| Forest | 8 | 83 → 58 |
| The One Ring | 3 | 44 → 23 |

Sorting: curated overrides first (by their human-assigned %), then algorithmic results by similarity, descending.

**Multi-face cards** ✅ — the name, type line and rules text of both faces are shown joined with " // ". Mana costs of both faces are concatenated without a separator (Bonecrusher Giant // Stomp shows `{2}{R}{1}{R}`; Esika // The Prismatic Bridge shows eight symbols in a row) — a display bug. Only the front image is shown; there's no flip control.

**SEO** ✅ — per-card `<title>` "X Alternatives - MTG Replace", a meta description that includes the result count and "with prices", OpenGraph + Twitter tags (**no `og:image`**), a canonical tag on the home page, no JSON-LD, no HTTP caching (`cache-control: max-age=0, private`).

### 2.3 Curated overrides + "Suggest a replacement"

**The form** (Tally, `tally.so/r/2EDjRp`) ✅ asks for four required fields, with a reminder to type exact card names:

1. Card to replace
2. Replacement
3. How similar it is, on a 1–100 scale
4. A description for players — shown under the alternative on the site

**What it becomes on the site** ✅

- Override tiles get an extra `.card-override-note` paragraph with the human-written note.
- They're **pinned first** and show the **human score**, not the algorithm's. Proof: Insight shows **75%** on Rhystic Study's page, but Insight's own page lists Rhystic Study at **69%** — the algorithmic, symmetric value.
- Rhystic Study's page is the only one among ~20 popular cards checked that had overrides (Mystic Remora 90%, Insight 75%, Consecrated Sphinx 70%). The notes weigh mana value, how conditional the effect is, price, how easy it is to answer, and Commander **bracket / Game Changer** status. So the layer exists but is still small.
- The same page also has the custom headline, so curation can touch page copy too.

### 2.4 "All Cards" index (`/cards`)

✅ Alphabetical list with letter dividers (including `"`, `+` and `7` groups for names like "+2 Mace" and "70,000 Light-Years from Home"), 100 names per page, Kaminari-style pagination (« First ‹ Prev 1 2 3 4 5 … Next › Last »), `?page=N`, 323 pages (the last has 97). There's no search, filter or letter jump — it's essentially a crawl hub for search engines.

### 2.5 Prices, buy links & monetization

- **USD only.** The badge shows the price of the **one printing the site stored for that name** — not the cheapest printing. ✅🔍
- When the stored printing is **MTGO-only** (Masters Edition III/IV, Vintage Masters, Tempest Remastered) or brand new, the badge is simply missing — e.g., Mana Prism, Remove Soul, Boomerang, Lightning Blast, In the Eye of Chaos. ✅
- **Revenue:** TCGplayer affiliate links on the Impact network — `https://partner.tcgplayer.com/c/{publisherId}/{adId}/{campaignId}?u=<encoded product URL>` — plus an `impact-site-verification` meta tag. The Cardmarket link looks like a plain product link. No ads. ✅🔍
- The link text itself says **"(Affiliate Link)"** — clean disclosure worth copying.

### 2.6 Legal, privacy & analytics

- **Terms** ✅: use license limited to **personal, non-commercial** purposes; card data and images credited to Scryfall; the standard "not affiliated with Wizards of the Coast" line; similarity scores are "algorithmically generated" and may not reflect gameplay equivalence; terms can change without notice.
- **Privacy** ✅: says no personal information is collected and searches are not stored or logged; contact is "through GitHub issues", but no repository is linked (and none turned up in web searches).
- **Scripts actually loaded** ✅: a self-hosted Umami instance, Ahrefs Web Analytics and the Cloudflare Web Analytics beacon — all cookie-less, privacy-friendly analytics.

---

## 3. How the similarity engine works (reverse-engineered)

### 3.1 Card universe = currently Commander-legal cards 🔍

| Card(s) | Commander status | On MTG Replace? |
|---|---|---|
| Dockside Extortionist · Mana Crypt · Jeweled Lotus · Nadu, Winged Wisdom · Primeval Titan · Golos · Hullbreacher · Leovold · Sylvan Primordial · Griselbrand · Iona, Shield of Emeria · Sundering Titan · Emrakul, the Aeons Torn · Flash · Black Lotus · Mox Pearl · Time Vault · Ring of Ma'rûf · Shahrazad · Chaos Orb · Falling Star | banned | ❌ absent |
| Biorhythm · Lutri, the Spellchaser | **unbanned 9 Feb 2026** | ✅ present |
| Urza, Academy Headmaster (silver-bordered) · Power Play (draft-only Conspiracy card) | not legal | ❌ absent |
| Unfinity non-acorn cards (e.g. Comet, Stellar Pup) · Universes Beyond (Marvel, Final Fantasy, Avatar, The Hobbit…) | legal | ✅ present |

→ Almost certainly built from Scryfall data filtered on `legalities.commander == "legal"`, de-duplicated by card name, and refreshed at least occasionally (it picked up the Feb 2026 unbans). The whole site is implicitly **Commander-first**.

### 3.2 One stored printing per name — sometimes the wrong one ✅

- **Llanowar Elves** is stored as the Time Spiral Remastered **token** printing (`ttsr/12`), so its page shows the type line "Token Creature — Elf Druid" and no mana cost.
- Many names are stored as MTGO-only printings → no USD price (see §2.5).
- Lesson for Deckwarden: pick printings deliberately (paper only, no tokens; cheapest or most recent).

### 3.3 Filter: the searched card's color identity ✅🔍

- **Dovin's Veto** (W/U) → all 20 results are mono-W, mono-U or W/U (Lapse of Certainty, Negate, Swift Silence, Supreme Verdict…).
- **Sol Ring** and **The One Ring** (colorless) → only colorless-identity results; no Signets or Talismans (colorless artifacts whose identity is colored).
- The filter uses the **searched card's** identity, not your commander's — in a 3-color deck, the pool for a mono-colored card is needlessly narrow.

### 3.4 Cap of 20, and "missing" results 🔍

- The algorithmic list never exceeds 20.
- Many cards get fewer than 20 even though thousands of cards share their identity (Sol Ring 16, Smothering Tithe 9, The One Ring 3). That fits "take a fixed global top-K nearest-neighbor list, **then** drop cards outside the color identity" rather than "search within the identity". Result: short, oddly thin lists for colorless and mono-colored cards. Deckwarden should filter first (or over-fetch).

### 3.5 What the score responds to

| Observation | Evidence | Inference |
|---|---|---|
| Symmetric | Soul Barrier ↔ Rhystic Study 72% both ways; Insight ↔ Soul Barrier 60% both ways; Counterspell ↔ Cancel 100% both ways | a pairwise metric such as cosine similarity |
| Mana cost and P/T ignored | Sol Ring = Thran Dynamo = Ur-Golem's Eye = 100%; Grizzly Bears = Alpine Grizzly (a 4/2 for three) = 100%; Counterspell = Cancel = 100% | cost and P/T aren't in the compared text |
| Mana amounts inside rules text flattened | Llanowar Elves = Llanowar Tribe (adds GGG) = 100%; Mana Leak = Force Spike = Convolute = Quench = 100% | symbols stripped/normalized, or scores capped at 100 |
| Type line contributes (most visible on short texts) | Forest vs Snow-Covered Forest 83% despite identical rules text; Consecrated Sphinx's list is mostly other Sphinxes; yet Arcane Signet (artifact) ↔ Command Tower (land) 96% | type line is part of the text but outweighed by distinctive rules text |
| **Shared reminder text dominates** | Cyclonic Rift → six Overload cards at 80–94%, then a cliff to 34%; Mystic Remora → cumulative-upkeep cards at 89–92%; Smothering Tithe → mostly Treasure makers; Toph, the First Metalbender → earthbend cards | reminder text isn't stripped |
| **The card's own name leaks in** | Lightning Bolt → Lightning Strike, Lightning Blast, Wizard's Lightning, Puncture Bolt, Homing Lightning…; Chain Lightning, Burst Lightning and Shock don't make the list | self-references ("Lightning Bolt deals 3 damage…") aren't neutralized |
| Multi-face structure dominates | Fire // Ice → Expansion // Explosion, Invert // Invent, Dead // Gone at 100%; Esika → other double-faced gods (Reidane, Birgi, Kolvori…); Bonecrusher Giant → other Adventure creatures | both faces concatenated with " // " |
| Function/role not modeled | Path to Exile → Evolving Wilds, Terramorphic Expanse, Wayfarer's Bauble; Swords to Plowshares → lifegain spells; Doubling Season → Vorinclex only 38% | no role tags (removal, ramp, draw…) |
| Precomputed | card pages render in ≈ 28 ms server time | neighbors are computed offline |

**Best guess** 🔍: cosine similarity of text embeddings of (type line + rules text, faces joined, mana symbols stripped), rescaled to 0–100 and capped, neighbors precomputed, color-identity post-filter, top 20. The exact model and scaling are unknown ❓.

### 3.6 The curated override layer ✅🔍

- Data per row: (card, replacement, score 1–100, note) — mirrors the Tally form exactly.
- Merge rule: overrides first (sorted by human score), then the algorithmic top 20 minus duplicates. Rhystic Study = 3 overrides + 20 algorithmic − 1 duplicate (Insight, which is also in its algorithmic top 20 at 69%) = **22 tiles**.

---

## 4. "API" reference (unofficial)

There's no documented API. This is everything that's reachable, as observed.

### 4.1 `GET /api/search?q=<text>` — name autocomplete ✅

```http
GET https://mtgreplace.com/api/search?q=sol%20ri
→ 200 OK, application/json
[{"name":"Sol Ring","slug":"sol-ring"}]
```

- One parameter, `q`. Returns at most **10** `{name, slug}` objects. No pagination, IDs, images or prices.
- Matching behavior: see the table in §2.1.
- Headers: `cache-control: max-age=0, private, must-revalidate`; Cloudflare `cf-cache-status: DYNAMIC`; **no `Access-Control-Allow-Origin`** (a browser on another domain can't call it — you'd need a server-side proxy); **no rate-limit headers**; no auth.

### 4.2 `GET /cards/<slug>` — alternatives (HTML only) ✅

- `/cards/<slug>.json` → **406 Not Acceptable**; sending `Accept: application/json` still returns HTML. Alternatives are only available as server-rendered HTML (~46 KB per page).
- Data available per page: searched card (name, mana cost, type line, rules text, flavor, price, Scryfall image ID) and, per alternative, name, slug, similarity %, price, the stored printing's set code and collector number (from the Scryfall link path `/card/<set>/<number>/<name>`), image ID and any curated note.
- DOM map, for reference (it will break whenever they redesign):

| Data | Selector |
|---|---|
| Searched card name | `.card-oracle-panel__name` |
| Mana cost | `.card-oracle-panel__mana img` (the `alt` is `{1}`, `{U}`, …) |
| Type line | `.card-oracle-panel__type` |
| Rules text | `.card-oracle-panel__content p` (symbols are `img.mana-symbol` with `alt="{T}"` etc.) |
| Flavor text | `.card-flavor-text` |
| Searched card price | `.searched-card .price-badge` |
| Searched card image | `.searched-card-image` (Scryfall CDN `…/normal/front/<a>/<b>/<scryfall_id>.jpg`) |
| Count sentence | `.alternatives-count` |
| Alternative tile | `.cards-grid .card-item` |
| Alternative name + slug | `.card-title a` (`href="/cards/<slug>"`) |
| Alternative similarity | `.similarity-percent` (e.g. `88%`) |
| Alternative price | `.card-image-wrapper .price-badge` |
| Curated note | `.card-override-note` |
| Outbound links | `.card-ext-links a.card-ext-link` (buy links add `.card-ext-link--buy`) |

### 4.3 Other reachable resources ✅

- `/cards?page=N` — 100 names per page (HTML).
- `/sitemaps/cards-1.xml` + `/sitemaps/cards-2.xml` — every card URL (32,297 slugs).
- `/up` — health check.

### 4.4 Slug rules (useful for deep links) ✅

Slugs are Rails' `String#parameterize`: transliterate accents, lowercase, turn every run of characters other than `a–z 0–9 - _` into a single `-`, then trim leading/trailing dashes. Faces of multi-face cards are joined (`fire-ice`).

```ts
// Reproduces MTG Replace slugs, e.g. for a "Find alternatives on MTG Replace" link.
export function mtgReplaceSlug(name: string): string {
  return name
    .replace(/Æ/g, "AE").replace(/æ/g, "ae")   // ligatures NFKD won't split
    .normalize("NFKD").replace(/\p{M}/gu, "")   // strip accents: û → u, ü → u, Ó → O
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export const mtgReplaceUrl = (name: string) =>
  `https://mtgreplace.com/cards/${mtgReplaceSlug(name)}`;
```

| Card name | Slug on the site |
|---|---|
| Gonti's Aether Heart | `gonti-s-aether-heart` |
| Lim-Dûl's Vault | `lim-dul-s-vault` |
| Fire // Ice | `fire-ice` |
| Jace, Vryn's Prodigy // Jace, Telepath Unbound | `jace-vryn-s-prodigy-jace-telepath-unbound` |
| +2 Mace | `2-mace` |
| 70,000 Light-Years from Home | `70-000-light-years-from-home` |
| _____ Balls of Fire | `_____-balls-of-fire` (underscores are kept) |
| Óin the Brave | `oin-the-brave` |

Unknown slugs return 404, so a deep link for a card that isn't Commander-legal (or that they haven't imported yet) will land on "Card Not Found" — only show the button for Commander-legal cards.

### 4.5 Should Deckwarden depend on it?

| Option | Verdict | Why |
|---|---|---|
| "Find alternatives on MTG Replace" deep link from each card | ✅ Fine | It's just an outbound link — no data taken. |
| Call `/api/search` from Deckwarden's server for autocomplete | ⚠️ Pointless | You already have every name from Scryfall; their license is personal/non-commercial; no SLA; no CORS. |
| Scrape `/cards/<slug>` for alternatives | ❌ Don't | Terms grant personal, non-commercial use only; HTML breaks on redesigns; Cloudflare may block bots; the curated notes and scores are their original content. |
| Partnership / official API | 💬 Ask first | No contact channel is published (the privacy page mentions GitHub issues but links no repo). The suggestion form is the only visible inbound channel. |
| **Build your own** | ✅ Recommended | Same data source (Scryfall), no dependency, and room to fix their weak spots — §8. |

---

## 5. Tech stack

| Layer | What they use | Evidence |
|---|---|---|
| Backend | **Ruby on Rails 7.1+**, probably Rails 8 🔍 | `/up` health check; `x-runtime` / `x-request-id` headers; short digest-stamped `/assets/*` URLs typical of Propshaft |
| Frontend | **Hotwire** (Turbo + Stimulus) via **importmap** — no JS build step | import map lists `@hotwired/turbo-rails`, `@hotwired/stimulus`, `stimulus-loading`; the generator's default `hello_controller.js` is still shipped |
| Client JS | one Stimulus controller, `card-search` (methods: search, performSearch, showLoading, showError, displayResults, navigate, triggerSearch, updateSelection, selectResult, goToCard, hideResults, escapeHtml) | runtime inspection |
| Pagination | Kaminari 🔍 | class names `pagination`, `page current`, `gap`, `next`, `last` |
| Slugs | `String#parameterize` | "Gonti's" → `gonti-s`, underscores kept |
| Search backend | unknown ❓ — fuzzy, accent-folding, typo-tolerant, order-independent (Postgres `pg_trgm` + `unaccent`, or a search engine) | behavior in §2.1 |
| Similarity | precomputed neighbors, likely text embeddings 🔍 | §3 |
| Hosting / CDN | behind **Cloudflare** (proxy, NEL reporting); HTML isn't edge-cached | response headers |
| Card images | hot-linked from **Scryfall's image CDN** (`normal` size, front face) | image URLs; privacy page confirms |
| Mana symbols | self-hosted SVGs at `/symbols/<SYMBOL>.svg` | image URLs |
| Similarity bar | two stacked `.webp` images; the fill is clipped with `clip-path: inset(0 <100−pct>% 0 0)` | DOM |
| Fonts | Google Fonts **Cinzel** (display) + **Roboto** (body); Georgia for rules text | computed styles |
| Forms | Tally (hosted) | header link |
| Analytics | Umami (self-hosted), Ahrefs Web Analytics, Cloudflare Web Analytics | loaded scripts |
| Affiliate | TCGplayer via Impact | meta tag + link format |

Minor code note: the controller's `disconnect()` calls `removeEventListener` with a freshly bound function, so the document-level click listener is never actually removed. Harmless here (every navigation is a full page load), but a classic Stimulus pitfall to avoid if Deckwarden uses Turbo.

---

## 6. Strengths & weaknesses

**Strengths (worth copying)**

- Zero-friction flow: type → pick → results, keyboard-friendly, fast (server work is ~10–30 ms).
- A static-feeling page for **every** legal card plus sitemaps → strong long-tail SEO ("<card> alternatives").
- Card-to-card hopping: every result links to its own alternatives page.
- A **curated layer with human notes** on top of the algorithm — the notes are the most useful content on the site.
- Honest affiliate disclosure in the link text; cookie-less analytics; tiny, cheap-to-run stack.

**Weaknesses (Deckwarden's openings)**

- **No filters at all**: price, mana value, card type, bracket / Game Changers, "cheaper than the original", owned cards.
- **No deck context**: color identity comes from the searched card, not your commander; no decklist import; no "already in my deck" exclusion.
- **Similarity quirks**: reminder text and self-names dominate; no notion of role (removal, ramp, draw); lists are sometimes very short (The One Ring: 3).
- **No explanation** of *why* a card is similar.
- **Data bugs**: token printing stored for Llanowar Elves; MTGO-only printings leave prices blank; multi-face mana costs run together; no back-face image.
- **USD only**, even though a Cardmarket link is shown.
- **No JSON API**, no `og:image` for social shares, no JSON-LD.
- **Autocomplete ranking**: exact/prefix matches aren't boosted ("sol" doesn't put Sol Ring first; "counter" doesn't surface Counterspell; "rhystic" + Enter lands on Rhystic Tutor); a hyphenated query fails.
- The search icon looks like a "clear" button but acts as "go".

---

## 7. Feature backlog for Deckwarden

Effort: S ≈ a day or two, M ≈ a week, L ≈ multiple weeks (solo dev, rough).

| Priority | Feature | Gap it closes / why | Effort |
|---|---|---|---|
| P0 | Card-name autocomplete: fuzzy + accent-folding, **exact → prefix → fuzzy** ranking, hyphen = space, ≥2 chars, 150–300 ms debounce, ↑/↓/Enter/Esc | Parity, but better ranking than theirs | S |
| P0 | "Alternatives" panel/page per card: image, similarity %, price, Scryfall/EDHREC/buy links, click-through to the alternative's own alternatives | Parity | M |
| P0 | Commander-legal universe + color-identity filter | Parity | S |
| P0 | **Commander-aware identity**: filter by the deck's commander identity, not the card's | Their biggest functional gap for deck builders | S |
| P0 | Curated overrides with notes + a moderated suggestion form (in-app, not an external form) | Parity; the notes are the real value | M |
| P1 | Filters: max price, "cheaper than original", mana value range, card type, exclude Game Changers / target bracket, hide cards already in the deck | Not available on MTG Replace | M |
| P1 | **Deck-wide swaps**: run the whole decklist → per-card suggestions ("budget this deck", "drop this deck a bracket") | Unique to a deck app — MTG Replace can't do it | M–L |
| P1 | Better similarity: strip reminder text, neutralize self-names, role tags, keyword/type/mana-value features, hybrid score | Fixes Overload/Lightning-Bolt-style misses | M |
| P1 | "Why similar" chips (shared role tags, keywords, same type) | Trust and explainability | S–M |
| P1 | Always return enough results (filter before top-K, or over-fetch) | Their lists go as low as 3 | S |
| P1 | Correct printings and prices: paper only, no tokens, cheapest printing (optionally a printing picker) | Their token and MTGO-only price bugs | S |
| P1 | Proper multi-face display: per-face mana costs, back-face image flip | Their display bug | S |
| P2 | Thumbs up/down on each suggestion → feedback table → re-rank / feed the overrides queue | Learning signal they don't collect | M |
| P2 | Owned-cards / collection filter ("alternatives I already own") | Only possible if Deckwarden tracks collections | M |
| P2 | EUR prices (Cardmarket) and price trend | They're USD-only | S |
| P2 | Side-by-side compare (rules text diff, mana value, P/T, price) | Helps the swap decision | S–M |
| P2 | Popularity signal (EDHREC rank) as an optional sort | Surfaces proven staples | S |
| P2 | Public/partner JSON API, `og:image` social cards, JSON-LD | They offer none | M |

---

## 8. Build-it-yourself blueprint

### 8.1 Architecture

```
Scryfall bulk files (daily)
   │
   ▼
ingest job ──► Postgres: cards, printings, prices, legality, identity bitmask
   │
   ├─► normalize rules text ─► embed ─► neighbors table (top ~200 per card)
   ├─► role tags (rules + optional one-time LLM pass)
   │
Deckwarden API ◄── filters (deck identity, budget, bracket, owned) + curated overrides
   │
   ▼
UI: autocomplete · alternatives panel · deck-wide "swap suggestions"
```

### 8.2 Ingest from Scryfall

- **Bulk files, not per-card API calls.** `GET https://api.scryfall.com/bulk-data` lists the daily files; download from the `download_uri` (hosted on `*.scryfall.io`, which isn't rate-limited).
  - `oracle_cards` — one object per card (Oracle ID): rules text, legality, identity, keywords, EDHREC rank, `game_changer`.
  - `default_cards` — every English printing: use it to pick the **cheapest paper price** per Oracle ID (skip `digital: true`).
- **Keep:** `oracle_id`, `name`, `card_faces[]` (per-face `name`, `mana_cost`, `type_line`, `oracle_text`, `image_uris`), `cmc`, `type_line`, `oracle_text`, `keywords`, `color_identity`, `legalities`, `edhrec_rank`, `game_changer`, `image_uris`, `scryfall_uri`, `related_uris.edhrec`, `purchase_uris`, `prices.usd/usd_foil/eur`.
- **Drop layouts** `token`, `double_faced_token`, `emblem`, `art_series` — that's exactly how MTG Replace ended up with a token Llanowar Elves.
- **Keep `legalities.commander` as a column** instead of deleting rows, so Deckwarden can show "banned" badges and react instantly to banlist changes.
- **Scryfall rules:** send a descriptive `User-Agent` **and** an `Accept` header on API calls (now required); keep 50–100 ms between API requests (~10/s) or expect HTTP 429s; cache everything for at least 24 h (prices update once a day).
- **Color identity bitmask:** W=1, U=2, B=4, R=8, G=16 → subset test is `(card & ~deck) = 0`.

### 8.3 Normalize the text before embedding (the fix for MTG Replace's quirks)

```python
import re

REMINDER = re.compile(r"\s*\([^()]*\)")   # "(…reminder text…)"
SYMBOL = re.compile(r"\{([^}]+)\}")

def face_text(face: dict) -> str:
    """Text we embed for one face of a Scryfall card object."""
    name = face["name"]
    text = face.get("oracle_text") or ""
    # 1) Neutralize self-references so a card's own name can't drive similarity.
    #    "Toph, the First Metalbender" also refers to itself as "Toph".
    for alias in sorted({name, name.split(",")[0]}, key=len, reverse=True):
        text = re.sub(rf"(?<!\w){re.escape(alias)}(?!\w)", "CARDNAME", text)
    # 2) Drop reminder text so shared keywords (Overload, Treasure, earthbend…) don't dominate.
    text = REMINDER.sub("", text)
    # 3) Canonicalize mana: keep the kind of mana, drop the amount.
    def canon(m):
        s = m.group(1)
        return "{N}" if s.isdigit() or s in ("X", "Y", "Z") else "{" + s + "}"
    text = SYMBOL.sub(canon, text)
    return f"{face.get('type_line', '')}\n{text}".strip()

def card_text(card: dict) -> str:
    faces = card.get("card_faces") or [card]
    return "\n---\n".join(face_text(f) for f in faces)
```

Because mana value and P/T are left out of the text on purpose, add them back as separate score features (§8.5) — that's how "Sol Ring vs Thran Dynamo" stops being a 100% match.

### 8.4 Embed and precompute neighbors

- **Model:** a small hosted text-embedding model, or a free local sentence-transformers model (e.g. `BAAI/bge-small-en-v1.5` or `all-MiniLM-L6-v2`). About 32k short texts ≈ 2–3 M tokens total — pennies on a hosted model, a few minutes on a laptop CPU locally.
- **Precompute** the top ~200 neighbors per card offline and store them. The data only changes when a set releases, so there's no need for live vector search on every page view.

```python
import numpy as np

E = np.load("embeddings.npy").astype(np.float32)        # (n_cards, dim)
E /= np.linalg.norm(E, axis=1, keepdims=True)            # cosine == dot product
K = 200
rows = []
for start in range(0, len(E), 1024):                     # chunked to bound memory
    sims = E[start:start + 1024] @ E.T                   # (chunk, n_cards)
    for i, row in enumerate(sims):
        row[start + i] = -1.0                            # exclude the card itself
        top = np.argpartition(-row, K)[:K]
        top = top[np.argsort(-row[top])]
        rows.extend((start + i, int(j), float(row[j])) for j in top)
# bulk-insert rows into card_neighbors(card_idx, neighbor_idx, cosine)
```

- Why K ≈ 200 and not 20: filters (deck identity, budget, bracket, "already in deck") are applied at request time, so over-fetching guarantees a full list — the fix for MTG Replace's 3-result pages.
- Alternative: Postgres + pgvector. At ~32k rows even an exact (index-free) scan is fast; if you add an HNSW index, pgvector ≥ 0.8 supports `SET hnsw.iterative_scan = strict_order;` so filtered queries keep scanning until the `LIMIT` is filled.

### 8.5 Hybrid score (starting weights — tune them)

```
score = 0.60 · cosine(text embeddings)
      + 0.15 · jaccard(role tags)        # removal, ramp, draw, counterspell, tutor, wipe, protection, recursion…
      + 0.10 · jaccard(keywords)
      + 0.10 · shared card types         # creature / instant / artifact …
      + 0.05 · mana-value closeness      # 1 − min(|Δmv|, 4) / 4
```

- **Role tags** — pick one or combine:
  1. Scryfall Tagger oracle tags via search (`otag:removal`, `otag:ramp`, …). As far as I know they aren't in the bulk files, so you'd page through search results for a curated tag list while respecting the rate limits.
  2. Your own regex rules ("destroy target creature" → removal; "search your library for a basic land" → ramp).
  3. A one-time LLM classification pass over all cards, stored in a table and re-run only for new sets.
- Use the shared tags to power **"why similar"** chips in the UI.
- Show `round(100 × score)` as the similarity %.

### 8.6 Request-time query (neighbors table + filters)

```sql
-- cards.color_identity is a bitmask: W=1, U=2, B=4, R=8, G=16
SELECT c.slug, c.name, n.score, c.price_usd
FROM card_neighbors n
JOIN cards c ON c.id = n.neighbor_id
WHERE n.card_id = $1
  AND c.commander_legal
  AND (c.color_identity & ~$2::int) = 0          -- $2 = the deck's COMMANDER identity
  AND ($3::numeric IS NULL OR c.price_usd <= $3)   -- optional budget
  AND NOT (COALESCE($4, false) AND c.game_changer) -- optional "no Game Changers"
  AND c.id <> ALL($5::uuid[])                      -- cards already in the deck
ORDER BY n.score DESC
LIMIT 20;
```

### 8.7 Curated overrides (their best idea — copy it, with moderation)

```sql
CREATE TABLE card_overrides (
  card_id        uuid NOT NULL REFERENCES cards(id),
  replacement_id uuid NOT NULL REFERENCES cards(id),
  score          smallint NOT NULL CHECK (score BETWEEN 1 AND 100),
  note           text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  submitted_by   uuid,                               -- Deckwarden user, nullable
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, replacement_id)
);
```

- Merge: approved overrides first (by score), then algorithmic results minus the override IDs.
- Apply the **same filters** to overrides (a curated pick outside the deck's identity or budget must still be hidden).
- Collect suggestions in-app (you know the user and the deck context), and add 👍/👎 on every suggestion — that feedback is what eventually lets you tune the weights in §8.5.

### 8.8 Deckwarden API sketch

```http
GET /api/v1/cards/search?q=sol%20ri&limit=10
→ [{ "id": "…", "name": "Sol Ring", "slug": "sol-ring" }]

GET /api/v1/cards/sol-ring/alternatives?identity=WUG&max_price=5&exclude_game_changers=true&limit=20
→ {
    "card": { "name": "Sol Ring", "price_usd": 1.48, "color_identity": [] },
    "alternatives": [
      { "name": "Thran Dynamo", "slug": "thran-dynamo", "score": 0.93,
        "why": ["mana rock", "adds colorless"], "price_usd": 3.91,
        "curated": false, "note": null }
    ]
  }

POST /api/v1/decks/{deckId}/swap-suggestions
body: { "mode": "similar" | "budget" | "lower-bracket", "max_price_per_card": 2 }
→ per-card suggestion lists for the whole deck
```

### 8.9 Autocomplete (fixing their ranking)

- **Option A — client-side, instant:** ship the list of legal card names (well under 1 MB before compression) and search it in the browser with a fuzzy library such as MiniSearch or Fuse.js (prefix + fuzzy + accent folding). No server round trip at all.
- **Option B — Postgres:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- search_name = lower(unaccent(name)), stored column; escape % and _ in $1 in app code
CREATE INDEX cards_search_trgm ON cards USING gin (search_name gin_trgm_ops);

SELECT name, slug
FROM cards
WHERE search_name LIKE '%' || $1 || '%'      -- substring
   OR search_name % $1                        -- trigram similarity → typo tolerance
ORDER BY (search_name = $1) DESC,             -- exact first
         (search_name LIKE $1 || '%') DESC,   -- then prefix
         similarity(search_name, $1) DESC,
         name
LIMIT 10;
```

- Treat `-` like a space in the query, and AND the words for order-independence (their best behavior worth keeping).

### 8.10 UI patterns worth borrowing

- The 300 ms-debounced dropdown with ↑/↓/Enter/Esc. Improve one thing: only let Enter auto-open the first result when it's an exact (or clearly best) match — otherwise you recreate their "rhystic" → Rhystic Tutor problem.
- Tile = image + price badge + name + similarity bar + note + reference/buy links; every tile links to that card's own alternatives.
- "(Affiliate Link)" in the link text itself.
- One indexable page per card + sitemap, if Deckwarden wants search traffic.

### 8.11 Measure quality before and after

Build a small gold set (e.g. 50 staples with the swaps you'd accept — Sol Ring → Arcane Signet/Mind Stone/Thran Dynamo, Swords to Plowshares → Path to Exile, Rhystic Study → Mystic Remora, …) and track "hit rate in the top 20" as you change normalization and weights. Approved curated overrides can keep growing that gold set over time.

---

## 9. Legal & attribution checklist

- **Scryfall:** credit Scryfall as the data source; don't paywall Scryfall data or require payment, surveys or subscriptions to reach it; don't simply repackage, republish or proxy it (Deckwarden must add value — deck building does); don't imply Scryfall endorses you; don't crop, distort, blur, watermark or otherwise alter card images (if you ever use art crops, credit the artist); required headers + rate limits (§8.2).
- **Wizards Fan Content Policy:** fan content must be **free to access** (no payments, subscriptions or email registration to use it); ads, donations and sponsorships are allowed; no Wizards logos or trademarks without written permission; display the required notice — "[Title] is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC." **If Deckwarden ever plans paid tiers, check this policy first.**
- **Affiliate links:** if you add TCGplayer/Cardmarket affiliate links, join their programs yourself and label the links, as MTG Replace does.
- **MTG Replace itself:** its Terms allow personal, non-commercial use only; its curated notes and scores are its own content — link to it, don't copy it.

---

## 10. Appendix

### A. Evidence snapshots (30 Sep 2026)

**Sol Ring** (16 results): Ur-Golem's Eye 100% ($2.27) · Thran Dynamo 100% ($3.91) · Sisay's Ring 100% ($0.32) · Krark-Clan Ironworks 88% ($17.02) · Ashnod's Altar 87% ($16.79) · Worn Powerstone 81% ($0.38) · Mana Prism 80% (no price) · Prismatic Lens 80% · Mind Stone 80% · Pristine Talisman 78% · Hedron Archive 78% · Dreamstone Hedron 78% · Celestial Prism 75% · Manalith 75% · Gilded Lotus 75% · Mana Cylix 75%.
*Missing: Signets and Talismans (outside the colorless identity); Arcane Signet (≤ 60%) and Fellwar Stone (≤ 56%) because their text reads differently. Mind Stone makes it at 80%.*

**Counterspell** (20): Cancel 100% · Remove Soul 98% · False Summoning 98% · Essence Scatter 98% · Preemptive Strike 98% · Flash Counter 95% · Dispel 95% · Extinguish 90% · Envelop 90% · Mystic Denial 89% · Essence Capture 88% · Ceremonious Rejection 87% · Contradict 84% · Dismiss 84% · Exclude 83% · Bone to Ash 83% · Annul 82% · Nullify 81% · Halt Order 78% · Unified Will 76%.
*Negate (75%) misses the cutoff by one point; Mana Leak (< 76%) doesn't make it either.*

**Lightning Bolt** (20): Lightning Strike 71% · Lightning Blast 61% · Wizard's Lightning 53% · Puncture Bolt 52% · Homing Lightning 52% · Lightning, Security Sergeant 50% · Judgment Bolt 50% · Lightning Dart 50% · Radiating Lightning 49% · Electrostatic Bolt 49% · Jagged Lightning 49% · Precision Bolt 49% · Lightning Storm 48% · Lightning Axe 46% · Blastfire Bolt 46% · Harnessed Lightning 46% · Rhystic Lightning 46% · Feedback Bolt 46% · Twin Bolt 45% · Forked Lightning 43%.
*Name-driven: Chain Lightning, Burst Lightning and Shock are absent.*

**Rhystic Study** (22; ★ = curated override with note): ★Mystic Remora 90% · ★Insight 75% · ★Consecrated Sphinx 70% · Soul Barrier 72% · Cephalid Shrine 71% · In the Eye of Chaos 66% · Lunar Force 62% · Hesitation 61% · Isolation Cell 60% · Memory Erosion 60% · Runeboggle 59% · Aether Barrier 57% · Unifying Theory 57% · Veil of Birds 54% · Veiled Apparition 53% · Forced Fruition 53% · Frightful Delusion 53% · Force Void 52% · Disrupt 52% · Rakshasa's Disdain 52% · Oppressive Will 52% · Soul Read 52%.

**Cyclonic Rift** (20): Blustersquall 94% · Downsize 94% · Mizzium Skin 90% · Rise and Shine 86% · Eldritch Immunity 85% · March of Progress 80% · *then a cliff* · Disperse 34% · Machine Over Matter 34% · Gust of Wind 33% … Meddle 30%.

**Dovin's Veto** (W/U; identity check): Last Word 89% · Negate 79% · Scatter Arc 71% · Fold into Aether 69% · Memory Lapse 65% · Lapse of Certainty 65% (W) · Counterspell 65% · Cancel 65% · … · Swift Silence 63% (WU) · Permission Denied 61% (WU) · Supreme Verdict 60% (WU).

**Other quick reads**

| Card | Top results | What it shows |
|---|---|---|
| Grizzly Bears | Bear Cub, Runeclaw Bear, Ordinary Bear, Alpine Grizzly, Golden Bear, Balduvian Bears, Forest Bear — all 100% | P/T and cost ignored |
| Llanowar Elves | Fyndhorn Elves, Llanowar Tribe, Druid of the Cowl, Woodland Mystic… all 100% | mana amounts flattened; stored as a token printing |
| Mana Leak | Quench, Convolute, Force Spike, Mindstatic, Clash of Wills — 100% | "pays {X}" amounts flattened |
| Forest | Snow-Covered Forest 83%, Wastes 72%, Panoramas ~62% (8 total) | type line matters on short texts |
| Path to Exile | Erode 87%, Wayfarer's Bauble 74%, Terminal Moraine 73%, Evolving Wilds 73%… (12 total) | land-fetch text beats "exile target creature" |
| Swords to Plowshares | Last Breath 92%, Soul's Grace 69%, Illumination 64%, Condemn 64%… (13 total) | lifegain text dominates; Path to Exile absent |
| Doubling Season | Parallel Lives 84%, Branching Evolution 62%, Primal Vigor 56%… Vorinclex 38% | role not modeled |
| Mystic Remora | Mesmeric Trance 92%, Arnjlot's Ascent 90%, Breath of Dreams 89%… | cumulative-upkeep reminder text dominates |
| Toph, the First Metalbender | Earth Kingdom General 77%, Haru, Hidden Talent 73%, Earthbending Student 72%… | earthbend text dominates |
| Demonic Tutor | Diabolic Tutor 100%, Planar Portal 86%, Grim Tutor 84%, Entomb 80%… (17 total) | works well for clean functional text |
| Arcane Signet | Command Tower 96%, Commander's Sphere 94%, Hidden Hideout 78%… | cross-type matches when rules text is distinctive |
| Fire // Ice | Expansion // Explosion, Invert // Invent, Dead // Gone — 100% | split-card structure dominates |
| The One Ring | Beast of Burden 44%, Inherited Envelope 38%, Darksteel Citadel 23% (3 total) | post-filter starvation |

### B. DOM structure of an alternative tile

```html
<div class="card-item">
  <div class="card-image-wrapper">
    <a class="card-image-link" title="Alternatives to Ur-Golem's Eye" href="/cards/ur-golem-s-eye">
      <img class="card-image" loading="lazy" alt="Ur-Golem's Eye" src="(Scryfall CDN …/normal/front/…jpg)">
    </a>
    <div class="price-badge">$2.27</div>
  </div>
  <div class="card-info">
    <h3 class="card-title"><a href="/cards/ur-golem-s-eye">Ur-Golem's Eye</a></h3>
    <div class="similarity-bar-container">
      <div class="similarity-bar-label">
        <span class="similarity-label-text">Similarity</span>
        <span class="similarity-percent">100%</span>
      </div>
      <div class="similarity-bar-track">
        <img class="similarity-bar-empty-img" src="/ui/progress-bar-similarity-blue-dark.webp">
        <div class="similarity-bar-fill-wrapper" style="clip-path: inset(0 0% 0 0)">
          <img class="similarity-bar-fill-img" src="/ui/progress-bar-similarity-blue-dark.webp">
        </div>
        <img class="similarity-bar-outline" src="/ui/outline-bar-blue-dark.webp">
      </div>
    </div>
    <!-- curated entries only: <p class="card-override-note">…</p> -->
    <div class="card-ext-links">
      <a class="card-ext-link" href="(scryfall.com/card/c14/280/…)">Scryfall</a>
      <a class="card-ext-link" href="(edhrec.com/route/…)">EDHREC</a>
      <a class="card-ext-link card-ext-link--buy" href="(partner.tcgplayer.com/c/…)">TCGPlayer (Affiliate Link)</a>
      <a class="card-ext-link card-ext-link--buy" href="(cardmarket.com/en/Magic/Products…)">Cardmarket</a>
    </div>
  </div>
</div>
```

The search box: `div.search-container[data-controller="card-search"]` → `input#card-search` (`data-action="input->card-search#search keydown->card-search#navigate"`) + `div.search-icon` (`click->card-search#triggerSearch`) + `div.autocomplete-results`.

### C. Design tokens (if you want a similar look)

| Token | Value |
|---|---|
| Background / card background / secondary | `#0a0a0f` / `#0D1428` / `#1a1a2e` |
| Border | `#2d3748` |
| Text / dim text | `#e8e8e8` / `#a8a8b8` |
| Accent (gold) / bright accent | `#c9a961` / `#e6c87e` |
| Success (price badge) / error | `#48bb78` / `#f56565` |
| Display / body / rules-text fonts | Cinzel / Roboto / Georgia |
| Glow shadow | `0 0 20px rgba(201,169,97,0.3)` |
| Texture | inline SVG fractal-noise overlay |
| Breakpoint | single `max-width: 768px` |

### D. Open questions (not verified)

- Which embedding model (if any) and how the raw score is rescaled to %. ❓
- How often card data and prices refresh (the banlist change from Feb 2026 is reflected; the price date isn't shown). ❓
- Whether overrides are entered by hand from the Tally form or imported automatically. ❓
- The exact K of the global neighbor list before the color-identity filter. ❓

### E. Sources

- MTG Replace pages: [home](https://mtgreplace.com/), [All Cards](https://mtgreplace.com/cards), [Sol Ring](https://mtgreplace.com/cards/sol-ring), [Rhystic Study](https://mtgreplace.com/cards/rhystic-study), [Counterspell](https://mtgreplace.com/cards/counterspell), [Lightning Bolt](https://mtgreplace.com/cards/lightning-bolt), [Terms](https://mtgreplace.com/terms), [Privacy](https://mtgreplace.com/privacy), [sitemap](https://mtgreplace.com/sitemap.xml), [suggestion form](https://tally.so/r/2EDjRp)
- [Commander Banned and Restricted Announcement — 9 Feb 2026 (Wizards)](https://magic.wizards.com/en/news/announcements/commander-banned-and-restricted-february-9-2026)
- [Scryfall API documentation](https://scryfall.com/docs/api) and [User-Agent and Accept header now required on the API (Scryfall blog)](https://scryfall.com/blog/user-agent-and-accept-header-now-required-on-the-api-225)
- [Scryfall: Game Changers tracking, `game_changer: true` in the API](https://x.com/scryfall/status/1889394724072460312)
- [Wizards of the Coast Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)



