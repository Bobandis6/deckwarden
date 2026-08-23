# Deckwarden.gg — Build Plan

**Companion to:** [deck-building-website-feature-plan.md](deck-building-website-feature-plan.md) (the feature vision — kept as reference; this document is the execution plan)
**Snapshot:** August 23, 2026
**Constraints:** solo developer, part-time (nights/weekends), building with Claude Code; running costs ~$0–20/mo until real traffic; monetization undecided but must stay possible.

> **Positioning:** Deckwarden is a multi-TCG deck lab. Version 1 promises one thing and delivers it extremely well: **the fastest way from picking a Commander to a legal, shareable deck.** The long-game identity — explainable, evidence-backed recommendations in a market flooded with black-box AI deck builders — is built on top of that foundation, not instead of it.

---

## 1. Scope and Thesis

### What ships, in what order

| Phase | Game | Why this order |
| --- | --- | --- |
| v1 (M0–M3) | **MTG Commander** | Free, high-quality, legally clean data (Scryfall, Commander Spellbook, Topdeck.gg) makes it the cheapest place to prove the entire platform. Biggest audience and SEO surface. |
| M4 | **One Piece** | Fragmented tool market with no dominant "Moxfield of One Piece" — a real opening. Community data sources exist; legality (banned pairs, dated restrictions) is exactly what our data model is built for. |
| M5 | **Azuki** (option, not promise) | ~200 total cards today, near-zero third-party tooling, community-friendly leadership. Contingent on permission outreach (started early, in M2). If blessed, Deckwarden becomes the default site for an entire game. |

The multi-game bet is protected from day one by the **game adapter architecture** (§3): One Piece and Azuki are new adapter modules and data sources, not rewrites. An OPTCG adapter *stub* is written during M0 purely to keep MTG assumptions from leaking into the core interface.

### v1 non-goals

Everything on this list is deliberately out until the builder has proven retention (tracked in [LATER.md](LATER.md)): comments/moderation, full collection manager UI, price-history charts, playtester beyond a sample-hand widget, marketplace, proxy generator, tournament organizer, AI chat interface, other MTG formats, native mobile apps.

### The cold-start rule

"See what performs" is the plan's biggest product risk: at launch there is no deck corpus. The rule is **never render an empty or faked shelf**. Commander hub pages v1 are scoped to signals that are honestly good with zero users:

- Popular staples for the commander's color identity, ranked by Scryfall's `edhrec_rank` field (a free, legal popularity signal included in bulk data)
- Complete and near-complete combos from Commander Spellbook (MIT-licensed)
- Curve/role templates and budget figures computed from card data

That page is genuinely useful and SEO-indexable on day one. Tournament evidence (Topdeck.gg) upgrades hubs in M3. Community deck shelves appear only when community decks exist.

---

## 2. Stack

One pick per slot. Total infrastructure cost: **$0/month** — the domain (~$60–70/yr at Porkbun) is the most expensive component of the entire system.

| Slot | Pick | Why |
| --- | --- | --- |
| Framework | **Next.js (App Router) + TypeScript strict** | Most-trodden path = least-hallucinated agent code. Server components for read pages (SEO), plain route handlers + zod for APIs. No tRPC — route handlers are curl-testable and portable. Keep caching explicit; App Router caching is the #1 agent-confusion zone. |
| UI | **Tailwind v4 + shadcn/ui** | Agent-fluent; components live in-repo so they can be edited, not fought. |
| Database | **Postgres on Neon (free tier)** | Chosen over Supabase: Supabase free **pauses the project after 7 idle days** — fatal for a part-time site discovered by a stranger mid-hiatus. Neon scales to zero but auto-wakes (~0.5–1s cold start, acceptable). The **~0.5GB free ceiling is a named design constraint** — see the size budget in §4. Keep `pg_dump` portability regardless. |
| ORM | **Drizzle** | SQL-first fits this project: FTS, pg_trgm, JSONB containment, staging-table merges. No engine binary (serverless-friendly). Rule: every `drizzle-kit generate` migration gets eyeballed before applying. |
| Auth | **Better Auth**, Discord + Google OAuth only | Auth.js v5 spent years in beta-limbo with docs that don't match reality — the worst environment for agent-generated code. Better Auth owns its tables in our Postgres (needed for the anonymous-deck claim flow, zero lock-in). OAuth-only means **no email provider exists in v1 at all** — no password reset, no verification service, one less thing to run. Discord is the natural login for TCG players. |
| Search | **Postgres FTS + pg_trgm** (both on Neon) | ~35k oracle cards do not justify a search service to babysit. `tsvector` generated column for rules text, trigram GIN on normalized names for typo-tolerant autocomplete. Name normalization lives in app code (shared by ingest, search, and import parsing). Meilisearch is a LATER upgrade only if proven needed. |
| Card images | **Hotlink Scryfall CDN, bypass Vercel's image optimizer** | Scryfall permits hotlinking and already serves correctly-sized variants; run `<img>`/`next/image unoptimized` because Hobby's image-transformation quota dies fast on 100-card grid pages. Image URLs are **derived from the card ID** (documented CDN pattern), so the DB stores almost nothing. Cloudflare R2 (10GB free, zero egress) enters for OP/Azuki images and later self-hosting. Attribution rules: never crop the artist/© line; `art_crop` usage requires artist + © shown in the same interface. |
| Ingestion runner | **GitHub Actions, nightly** (public repo = free minutes) | Not Vercel cron (Hobby: 2 jobs, daily-only, imprecise, serverless duration limits are wrong for streaming hundreds of MB into remote Postgres). GH Actions: 6h limit, secrets, failure emails. **Gotcha engineered around:** scheduled workflows auto-disable after 60 days without repo activity — the workflow includes a keepalive commit step. The same nightly job runs a `pg_dump` of user tables to R2 (decks are the one unrecoverable asset). |
| Hosting | **Vercel Hobby now; Hetzner + Coolify (~€5/mo) at the first dollar** | Hobby's terms are **non-commercial** — the moment an affiliate link ships, move to Pro ($20/mo, the entire cost ceiling) or the VPS. Treat Vercel as a free incubator and enforce portability from day one: no Vercel-proprietary SDKs (KV/Blob/Postgres), `output: 'standalone'` in next.config, `@vercel/og` is fine (it's satori, runs anywhere). A one-page Hetzner+Coolify runbook is written in advance; the migration is one weekend. |
| Observability | **Sentry (free dev tier) + Cloudflare Web Analytics (free)** | Errors you hear about + privacy-friendly traffic numbers, both $0. |
| Tooling | pnpm, Node 22 LTS, Vitest, a handful of Playwright smokes, ESLint + Prettier | Single repo, no monorepo tooling. `pnpm check` (typecheck + lint + test) is the agent's self-verification loop; CI runs the same command. |

### Working agreement with Claude Code (goes in the repo's CLAUDE.md at P0.1)

- One work package per session; a package ends **deployed and `pnpm check`-green** or it isn't done. Never leave main broken — next session must start with a win available.
- Anything out of scope goes to `LATER.md` without discussion.
- Portability rules (above) are non-negotiable in review.
- All Scryfall requests send a real `User-Agent` (e.g. `Deckwarden/1.0`) and `Accept` header — generic agents get 403'd.

---

## 3. Architecture

One Next.js app, one Postgres, one nightly job. No microservices, no queues, no Redis until a measured problem demands them.

```
deckwarden/
├── src/
│   ├── app/                    # routes: pages (RSC) + api route handlers
│   ├── db/schema.ts            # Drizzle schema — every §4 decision lives here
│   ├── lib/
│   │   ├── games/
│   │   │   ├── types.ts        # the adapter contract (Appendix B)
│   │   │   ├── registry.ts
│   │   │   ├── mtg/            # full adapter: validate/analyze/searchFields/parse
│   │   │   └── optcg/          # typed STUB in M0 (interface fire drill), real in M4
│   │   ├── cards/normalize.ts  # ONE name-normalization fn shared by ingest/search/import
│   │   └── search/translate.ts # SearchFieldDef -> SQL (whitelisted targets only)
│   └── components/
├── scripts/ingest/             # scryfall.ts, spellbook.ts, (M4: punk-records.ts, M3: topdeck.ts)
├── data/                       # hand-maintained overlays (e.g. optcg legalities.json)
└── .github/workflows/          # ci.yml, nightly-ingest.yml (with keepalive + backup steps)
```

**Adapter pattern (the load-bearing decision).** Each game is a pure-function module implementing a shared interface (full TypeScript sketch in Appendix B):

- `validate(deck, cards)` → issues; `analyze(deck, cards)` → declarative analytics blocks. **Pure, no IO** — the same functions run client-side in the editor for instant feedback and server-side on save.
- `searchFields` → declarative filter definitions with an explicit index contract; core translates them to SQL from whitelisted targets (no injection surface, no per-game query code).
- `parseDecklist`/`serializeDecklist`, display config (mana pips vs DON, "Commander" vs "Leader"), zone/format definitions.
- Game-exclusive services (Spellbook combos, Topdeck tournaments) live behind optional `capabilities` — never in the required interface.

Analytics are **data, not components**: adapters emit histogram/breakdown/stat/table blocks and the core renders them generically. Azuki's weird dashboard becomes new data, not a new UI framework.

---

## 4. Data Model

Full SQL sketches in Appendix A. The decisions that matter:

**Identity vs printing.** `card_identities` = the gameplay object (name, cost, colors, rules); `card_printings` = physical versions (set, collector number, rarity, finishes, prices). Decks reference identities; a nullable `printing_id` on deck rows records a chosen alt-art. Alternate art can never become a phantom second card.

**Lean rows — the 0.5GB budget is a design input.**
- **No raw Scryfall JSON stored.** Bulk files are re-downloadable; the DB stores only what queries touch.
- **No image URLs stored for MTG.** Derived from the printing ID via Scryfall's CDN pattern; a nullable `image_override` holds the rare mismatches (ingest verifies).
- English printings only; token/art-series layouts skipped.
- **Current prices only** as JSONB on the printing (Scryfall refreshes ~daily: usd/usd_foil/usd_etched/eur/eur_foil). A per-printing-per-day history table is dead on arrival (~300k rows/day). Price *trends* are a LATER feature via a weekly or deck-referenced-only side table.
- Budget: ~35k identities (~110MB with tsvector + GIN) + printings at lean width (~75–120MB + slim indexes) ≈ **250–350MB total**. Nightly `pg_database_size()` is logged with an alert threshold at ~350MB.

**Search filterability — three tiers, enforced by the adapter's `searchFields`:**
1. Promoted real columns for hot cross-game filters: `primary_type`, `cost_value`, `colors_mask`, `ci_mask` (bitmasks: W1 U2 B4 R8 G16 C32), `cheapest_usd`, `popularity` (= `edhrec_rank` for MTG). Ordinary btree indexes. Color-identity fit is `(ci_mask & ~commanderCi) = 0` — a cheap post-filter at 35k rows.
2. One GIN `jsonb_path_ops` index covers all set-membership filters (`attrs @> '{"keywords":["Flying"]}'`, traits, etc.).
3. Expression indexes added per-game only when a numeric JSONB filter proves hot. Ingest **pre-normalizes** numerics (`power` "*" → also store `power_num`; OP counter "2000" → int) so SQL never casts dirty strings.

**Dated legality, exceptions only.** Formats carry a `default_legality`; the `legalities` table stores only exceptions as validity intervals (`effective_from` / `effective_to NULL = current`). Current legality is one partial-index lookup; "was this deck legal on date D" is an interval query. Sources only publish *current* state, so history is built by **diffing at ingest**: on change, close the old row, insert the new one.
**Banned pairs are conditional rows**: `status='banned'` + `condition: {"type":"banned_with_leader","leaderIds":[...]}` — the core just fetches rows; only the game adapter interprets conditions. One Piece legality additionally gets a **hand-maintained overlay file in-repo** (`data/optcg/legalities.json`) as the authority, because community scrapers lag Bandai announcements and a wrong banned-pair is a credibility wound.

**Decks.** Live relational `deck_cards` (zone as adapter-validated text, `tags text[]` for user categories, optional printing) + **frozen JSONB snapshots** in `deck_versions` for history. Relational queries ("public decks containing X", hub aggregation) only ever need the current list; history never needs joins. `leader_ids uuid[]` denorm + GIN index powers "decks for commander X". Denormalized like counts. Likes/bookmarks are one small table each.

**Guest building = server-side anonymous decks.** `user_id NULL` + a `claim_token` returned once and held in the visitor's localStorage (plus a local "your decks" index). Share links, autosave, and claim-on-first-OAuth (`POST /api/decks/claim` with stored tokens) all fall out naturally, and there is **exactly one deck code path forever**. localStorage-as-deck-store is explicitly rejected — it collides with share links and turns claiming into a data migration. Cost: anonymous spam surface → `created_ip`, rate limits, and a purge policy (empty anon decks after 30 days, untouched anon decks after 12 months).

**Combos.** `combos` + `combo_pieces` from Commander Spellbook (MIT-licensed, public API + official TS SDK). "One card away" is a two-line GROUP BY/HAVING query — this is what makes Combo Radar cheap (Appendix A).

---

## 5. Ingestion

**Scryfall (nightly, GitHub Actions).** Initial load and nightly refresh are the *same code path* — a full-bulk upsert with hash-skip. That makes the pipeline idempotent and **self-healing**: a missed night or a bug is corrected by the next run, by construction. (Scryfall's newer `/cards/manifest` incremental endpoint is deliberately skipped in v1; adopt it only if job time or Neon compute hours become a measured problem.)

1. `GET /bulk-data` (custom User-Agent) → `default_cards` JSONL URL. Stream: fetch → gunzip → readline. O(1) memory.
2. Per line: filter (English; skip token/art-series layouts), map to identity + printing rows, pre-normalize attrs, compute `content_hash` over card fields **excluding prices**.
3. Batch ~1–2k rows into temp staging tables (per-row statements over public-net latency to Neon are unusable), then merge:
   - Card data: `INSERT … ON CONFLICT DO UPDATE … WHERE content_hash IS DISTINCT FROM excluded.content_hash` — unchanged cards cost nothing.
   - Prices: separate blind `UPDATE` (they change daily for most cards; never let them dirty the content hash).
4. Post-pass (set-based SQL): soft-delete rows not seen this run (never hard-delete — decks reference identities); recompute default printing per identity, `cheapest_usd`, `popularity`, `is_leader_candidate`; **diff legalities into dated rows**; sample-verify derived image URLs, write `image_override` on mismatch.
5. Bookkeeping: `pg_advisory_lock` around the run; one `ingest_runs` row with counts, duration, and `pg_database_size()` (the free-tier fuel gauge); `/api/health` flags price staleness > 48h.

**Spoiler seasons.** Preview cards are ingested (spoiler brewing is a traffic spike worth catching) and flagged `is_preview`; the MTG adapter turns preview+not_legal into a `NOT_RELEASED` **warning**, not an error, and the legality differ skips preview cards so ban history never records spoiler flapping. Hotlinking means placeholder→final image swaps are automatic.

**Same skeleton, other sources** (each its own `scripts/ingest/*.ts` with staging+merge+`ingest_runs`):
- **Commander Spellbook** — weekly; combos + pieces mapped via oracle_id.
- **Topdeck.gg** — M3; respect 100 req/min; archive raw responses to R2; render the required visible credit + link wherever tournament data appears.
- **punk-records** (One Piece) — M4; re-ingest on release-tag change; hand-maintained legality overlay applied after.
- **Nightly backup** — `pg_dump` of user tables (users/decks/deck_cards/deck_versions/social) to R2 in the same workflow. Neon free's restore window is short; user decks are the one thing that can't be re-downloaded. Restore is **tested once** before any public link exists (M1.P1.8).

---

## 6. Milestones

Every package ≈ one focused Claude Code session (an evening). Every session ends deployed and `pnpm check`-green. Estimates assume ~2 sessions/week; "with life applied" multipliers already included in the calendar guesses.

### M0 — Foundation (6 packages, ~3–4 weeks)

*Exit: any Magic card findable in under a second, with printings, prices, and legality, on a deployed URL.*

| Pkg | Scope | Done when |
| --- | --- | --- |
| P0.1 | Scaffold: create-next-app (TS strict), Tailwind v4 + shadcn, ESLint/Prettier/Vitest, `pnpm check`, CI, Vercel deploy, `git init` this folder, CLAUDE.md with conventions + portability rules, LATER.md seeded | Hello-world deployed; CI green |
| P0.2 | Drizzle schema v1 (games/sets/formats/card_identities/card_printings/legalities/ingest_runs) + migrations + seeds (games, `commander` format); Neon wired | Clean migrate on fresh DB; seeds present |
| P0.3 | Scryfall streaming importer: fetch→gunzip→readline, mapping + normalization, staging+merge, content-hash skip, advisory lock, `ingest_runs` row | Full load completes; immediate re-run touches ~0 card rows |
| P0.4 | Post-pass + GH Action: default printing, cheapest_usd, popularity, legality differ, soft-delete sweep; nightly workflow + keepalive + user-table backup step | Two consecutive Action runs green with stable stats |
| P0.5 | Adapter interface + MTG adapter (formats/zones/searchFields/display) + **OPTCG typed stub** (the fire drill) + registry | Both adapters typecheck; core consumes only the interface |
| P0.6 | Card search API + pages: `/api/cards/search` (trgm name, FTS text, promoted-column + JSONB filters via SearchFieldDef translation), card page (image, printings, prices, legality), minimal browse UI | 10 canned searches correct; warm p95 < ~150ms |

### M1 — The Builder (8 packages, ~5–7 weeks)

*Exit: a stranger with a link can view a deck on their phone; a visitor can build a legal 100-card Commander deck by keyboard alone, without an account, and share it. This is the beta gate.*

| Pkg | Scope | Done when |
| --- | --- | --- |
| P1.1 | Deck model + API: decks/deck_cards migrations, anonymous create with claim_token, zod-validated CRUD, token-auth middleware, purge policy | curl-level CRUD + ownership tests pass |
| P1.2 | Editor shell + quick-add: three-pane layout, search box with full keyboard flow (arrows/enter, `4 Sol Ring` quantity syntax), optimistic add/remove/qty, debounced autosave | Build a real 100-card deck keyboard-only; no data loss on refresh |
| P1.3 | Views: text view grouped by type/tags with counts + mana pips; image grid on default printings; commander-zone treatment; group/sort toggles | Both views correct against a fixture deck |
| P1.4 | Validation: MTG `validate` (size, singleton + exemptions, color identity, banned, commander-zone rules incl. Partner) surfaced inline + panel; client-side live, revalidated on save | Fixture decks trigger every issue code |
| P1.5 | Analytics: `analyze` blocks (curve, color breakdown + mana sources, type breakdown, price stat) + the generic block renderer | Numbers match hand-computed fixtures |
| P1.6 | Import/export: tolerant paste parser (qty+name lines, Moxfield/Arena-ish formats, set-code noise), unresolved-line review UI, plain-text export | 10 real lists pasted from other sites round-trip |
| P1.7 | Share: `public_id` slug page (read-only, SSR, mobile-clean), visibility setting (public/unlisted/private), local "your decks" list for anonymous users, claim plumbing behind a flag | Incognito can view; edit requires token |
| P1.8 | **Public-link gate**: rate limiting + honeypot on anon writes, Sentry wired, legal/attribution/privacy pages, custom 404/500, favicon + meta/OG basics, contact link, mobile pass, backup restore **tested once** | Gate checklist 100% (below) |

**The gate (no public link before all of it):** decks durable (server-persisted + off-provider backup) · Scryfall/WotC attribution + unofficial-project disclaimer + privacy page live · share pages clean on mobile · anon-write rate limits · Sentry · 404/500 · contact route · fast read pages with no auth wall.

### M2 — Identity & Discovery (~8 packages, ~5–7 weeks) → public beta

*Exit: accounts, profiles, likable/bookmarkable public decks, commander hub pages that are honest and indexable, OG images that unfurl beautifully in Discord.*

- P2.1 Better Auth (Discord + Google) + anonymous-deck claim flow + account page
- P2.2 Profiles (username slug, avatar, public decks) + **deck folders with shareable folder URLs** (a known Moxfield gap, cheap here)
- P2.3 Likes + bookmarks + "recent public decks" rails (real data only — cold-start rule)
- P2.4 Commander hub v1a: leader index (browse by color/popularity) + hub shell — commander card, color-identity staples via `edhrec_rank`, curve/role template, budget tiers
- P2.5 Hub v1b: Spellbook ingestion + combos on hubs and card pages ("combos using this card")
- P2.6 SEO pass: sitemaps, structured data, canonical URLs, **auto-generated OG share images** (satori/@vercel/og: commander art + name + curve) for decks/hubs/cards
- P2.7 Sample-hand simulator (client-only: draw 7, mulligan, redraw) + deck notes field
- P2.8 Beta launch package: real home page, seeding checklist executed (§10), **permission emails sent to Bandai and Azuki Labs** (months of latency — start now), beta announced

### M3 — Intelligence v1 (~9 packages, ~6–8 weeks)

*Exit: the "explainable deck lab" identity is visible — every suggestion shows its evidence.*

- Recommendation engine core: deterministic candidate filter (legality/CI/budget/owned) + weighted ranking (edhrec_rank, curve fit, combo participation, co-occurrence once corpus exists) emitting an **evidence payload** (why, with what, how often, source, confidence)
- Recommendations panel in the builder (right pane), rendering evidence — never a bare "add this"
- Combo Radar panel: in-deck combos, one-card-away (with add button), CI-legal only
- Cut Coach: over-limit ranking with explicit tradeoff text
- Deck versioning (named versions, card-by-card diff, restore) + forks with credit and upstream-diff
- Topdeck.gg ingestion → tournament results on hubs (credit + link rendered), "seen in top-X lists" as a ranking signal
- Collection import v1: ManaBox CSV (it carries Scryfall IDs — exact-printing matching; competitors' importers are notoriously buggy, do it cleanly) + Moxfield CSV → owned badges in builder + "you own N/100 of this deck, missing cost $Y"
- Optional, feature-flagged: natural-language search → structured filters via Claude API (costs money; ship only behind a flag)

### M4 — One Piece (~7–9 packages, ~6–8 weeks)

- Data: punk-records (static versioned JSON) as primary, optcgapi.com as cross-check; card images mirrored to R2; **honest gray-zone statement**: no official API exists, every OP fan site self-hosts scraped data under disclaimers; Bandai's 2026 IP enforcement targeted physical counterfeits, not fan sites; posture = disclaimers, no paywalling card content, immediate takedown compliance, permission email already sent in M2
- OPTCG adapter for real: leader/main zones, 50+1 size, 4-copy limit, leader-color legality, **banned pairs via the conditional-legality rows** + hand-maintained overlay file
- OP dashboard: cost curve by DON, 1K/2K counter totals, no-counter count, blocker count, trigger density, searcher hit rates, character/event/stage ratios
- OP search fields + card pages + Leader hubs (cold-start rule applies); Limitless tournament API if key granted (they grant to public-facing projects)
- OP beta launch into the fragmented-market opening

### M5 — Azuki (option, ~4–6 packages)

Executed **only if** permission outreach lands (or an official data path appears). ~200 cards means manual data entry is one weekend. Adapter: Leader/Gate element matching, 50-card deck, IKZ curve, Gate Power distribution, response density. If image permission is denied: text-only or shelved without regret — it's an option, not a promise.

### Calendar honesty

M0+M1 ≈ **2.5–3 months** of part-time work to a shareable beta link. M2 lands the public beta around month 4–5; M3 by month 7–8; One Piece by year one. That is the real price, and it's fine — the milestone contract (always deployed, always green, next session starts with a win) is what keeps a part-time project alive, not optimistic estimates.

---

## 7. Feature Additions Beyond the Original Doc

Adoption- and ease-of-use-focused additions, each slotted into a milestone above:

| Feature | Why it matters | Lands |
| --- | --- | --- |
| **Guest building + claim-on-signup** | People arrive from Reddit/Discord with a list in their clipboard; signup walls kill them. Server-side anon decks make "try it now" real. | M1 |
| **Auto OG share images** | Deck links that unfurl with commander art + curve in Discord/Twitter are the viral loop for deck sites. | M2 |
| **Discord OAuth** | The audience lives on Discord; lowest-friction login that exists for them. | M2 |
| **Clean ManaBox CSV import** | ManaBox is how paper players digitize collections; its CSV carries Scryfall IDs, and incumbents' importers are buggy. Cheap differentiation. | M3 |
| **Sample-hand widget** | Cheap, beloved, demo-able; pulled far forward from the original doc's Phase 3. | M2 |
| **SEO as a feature** | SSR card/commander/combo pages + sitemaps + structured data is how EDHREC/Moxfield get found. Free traffic compounding from day one. | M0–M2 |
| **Spoiler-season support** | Preview-card brewing is when TCG traffic spikes; pipeline supports it natively. | M0 |
| **Shareable deck folders** | Known Moxfield gap, loudly requested, one table + one page here. | M2 |
| **Keyboard-first quick-add** | The single interaction that makes Moxfield feel fast; it is the flagship editor experience, specified concretely (`4 Sol Ring`, arrows/enter, optimistic, undo). | M1 |
| **Mobile-first share pages** | Deck *browsing* is mobile-majority even when building isn't; both incumbents are weak here. | M1 |
| **Explainable recommendations** | The 2025–26 wave of AI deck builders is black-box; every Deckwarden suggestion shows evidence, source, and confidence. | M3 |
| **PWA / offline deck viewing** | Paper events have terrible wifi. | LATER |
| **Email digest ("3 new cards fit your decks")** | Retention hook; needs an email provider, so deferred. | LATER |
| **Collection manager UI** | Moxfield's known weak spot — but a big surface; schema is ready from M1, import lands M3, full UI waits until the editor has proven retention. | post-M5 |

---

## 8. Legal & Monetization Guardrails

- **Scryfall terms**: card data and prices must remain visible to anonymous users — **no paywalling card data, ever**. Any future premium tier gates *site features* (deck slots, folders, advanced analytics), never card data/prices. This is decided now so nothing needs re-architecting.
- **Attribution**: Scryfall credited on card pages + legal page; artist/© never cropped; art_crop only with artist + © displayed. Wizards' Fan Content Policy notice + "unofficial, not endorsed" disclaimers in the footer. Topdeck.gg visible credit + link wherever tournament data appears.
- **Monetization path that needs no closed API** (when the user decides to switch it on): prices displayed from Scryfall bulk (TCGplayer USD / Cardmarket EUR, daily) + **TCGplayer affiliate via impact.com** (first-click, whole-cart, ~3.5%, no API key required — their API is frozen to new developers, the affiliate program is not) + Card Kingdom partner-URL integration by direct contact. Buy-link URL structure keeps `partner=` params possible from day one. Reminder: first affiliate dollar triggers the Vercel Hobby → Pro/VPS move (non-commercial clause).
- **One Piece**: no official API or fan-content policy exists; the entire ecosystem operates on disclaimed self-hosted data. The plan states this risk honestly rather than pretending an authorized path exists: use community datasets (not our own scraper against Bandai), keep takedown-compliance posture, send a permission request anyway (M2).
- **Azuki**: official app ToS bars bots/scrapers; the path is permission (leadership actively promotes community tools — the CEO boosted a fan simulator) or manual entry of a tiny card pool. Outreach email in M2; M5 stays contingent.
- ToS + privacy pages before any public link (M1.8): OAuth emails stored, Sentry, analytics — say so plainly.

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Part-time attrition** — the project quietly dies at 60% of M1; the wishlist doc is a liability as much as an asset | The package table is the contract: every session ends deployed + green; scope leaks go to LATER.md without discussion; M1.8 is the only launch criterion; never leave main broken |
| **Cold start hollows the promise** — "see what performs" with zero corpus; empty SEO pages bounce forever | Hub v1 scoped to honestly-good free signals (edhrec_rank staples, Spellbook combos, prices); builder + share links are the retention product while hubs mature; Topdeck upgrades hubs in M3; never render empty shelves |
| **Upstream/ToS fragility** — Scryfall policy shifts, punk-records is one volunteer's scraper, Bandai/Azuki permission may never come | Everything enters through swappable `scripts/ingest/*` + adapters; raw source snapshots archived to R2 each run; OP legality is a hand-maintained overlay so correctness never depends on a lagging scraper; Azuki is an option, not a promise; monetize tools, never card data |
| **Free-tier ceilings hit silently** — Neon 0.5GB, Vercel non-commercial clause, GH scheduled workflows auto-disable after 60 idle days, Neon compute-hour caps | Size budget is a design input (§4) with nightly `pg_database_size()` alert at ~350MB; keepalive step in the workflow; portability rules from P0.1; written Hetzner+Coolify runbook executed at first affiliate dollar or first overage email |
| **Moxfield-class expectations vs a v1 editor** — one laggy search or one lost deck is a permanent bounce among exactly the users who'd evangelize | Narrow-and-deep: sub-150ms search, bulletproof autosave, keyboard flow, excellent share pages; leader-first hubs differentiate instead of chasing feature breadth; v1 positioned as "fastest commander-to-legal-deck," which this scope actually delivers |

---

## 10. Launch Playbook

**Domain & DNS.** deckwarden.gg stays registered at Porkbun. Move nameservers to Cloudflare (free): gives Web Analytics, R2 in the same console, and flexible DNS. Point the apex + `www` at Vercel per their DNS instructions. Porkbun's free email forwarding gives `contact@deckwarden.gg` → personal inbox (the M1.8 contact link).

**Brand hook.** "The Warden" is a usable persona: the legality checker ("The Warden approves this deck" ✓), the coach voice on recommendations, the mascot for the OG images and 404 page. Shield-and-card mark; dark mode default. Consistent master brand with a per-game accent color, per the original doc's game switcher.

**Seeding the empty site (M2.8 checklist).**
- 10–15 owner-written "featured brew" decks with real primers across popular commanders — the first shelf content
- "Import your Moxfield deck in 10 seconds" as the beta call-to-action (the paste importer is the hook)
- Soft-launch to 2–3 Commander Discords and r/EDH's self-promo lane with a genuinely useful hub page, not a bare landing page
- Ask 3–5 friends to build decks live and watch them (the cheapest usability lab that exists)
- Every share link is marketing: the OG image does the selling

**Beta invariant.** The site must be honestly useful to one person building one deck before any promotion — the gate in M1.8 is the definition of that.

---

## Appendix A — Schema Sketches (implement in Drizzle; SQL shown for review)

```sql
-- games(id smallint PK, code text UNIQUE, name text)            -- 'mtg','optcg','azuki'
-- sets(id int PK, game_id, code, name, released_at, set_type, UNIQUE(game_id, code))
-- formats(id smallint PK, game_id, code, name, default_legality text, UNIQUE(game_id, code))

CREATE TABLE card_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       smallint NOT NULL REFERENCES games,
  external_key  text NOT NULL,          -- mtg: scryfall oracle_id; optcg: 'OP01-001'; azuki: slug
  name          text NOT NULL,
  name_norm     text NOT NULL,          -- app-normalized: lower, deaccented, '//' faces folded
  slug          text,                   -- leader candidates only; hub URLs
  primary_type  text,                   -- 'Creature' / 'Character' / 'Entity'
  cost_value    smallint,               -- mana value / OP cost / IKZ
  colors_mask   smallint NOT NULL DEFAULT 0,   -- W1 U2 B4 R8 G16 C32 (OP reuses bits)
  ci_mask       smallint NOT NULL DEFAULT 0,   -- color identity
  is_leader_candidate boolean NOT NULL DEFAULT false,
  popularity    integer,                -- mtg: edhrec_rank (lower = more popular)
  cheapest_usd  numeric(10,2),          -- denorm, ingest post-pass
  is_preview    boolean NOT NULL DEFAULT false,
  is_removed    boolean NOT NULL DEFAULT false, -- soft delete; decks may reference
  attrs         jsonb NOT NULL DEFAULT '{}',   -- game-specific, pre-normalized numerics
  search_text   tsvector GENERATED ALWAYS AS (
                  to_tsvector('english', name || ' ' || coalesce(attrs->>'type_line','')
                    || ' ' || coalesce(attrs->>'oracle_text',''))) STORED,
  seen_at       timestamptz,
  UNIQUE (game_id, external_key)
);
CREATE INDEX ci_search_gin ON card_identities USING gin (search_text);
CREATE INDEX ci_name_trgm  ON card_identities USING gin (name_norm gin_trgm_ops);
CREATE INDEX ci_attrs_gin  ON card_identities USING gin (attrs jsonb_path_ops);
CREATE INDEX ci_browse     ON card_identities (game_id, primary_type, cost_value);
CREATE INDEX ci_leaders    ON card_identities (game_id, popularity) WHERE is_leader_candidate;
CREATE UNIQUE INDEX ci_slug ON card_identities (game_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE card_printings (
  id               uuid PRIMARY KEY,    -- mtg: the scryfall card id itself
  card_identity_id uuid NOT NULL REFERENCES card_identities,
  game_id          smallint NOT NULL,   -- denorm
  set_id           int NOT NULL REFERENCES sets,
  collector_number text NOT NULL,
  rarity           text,
  finishes         text[] NOT NULL DEFAULT '{}',
  has_back         boolean NOT NULL DEFAULT false,
  image_override   jsonb,               -- NULL when the scryfall CDN URL pattern holds
  released_at      date,                -- denorm from set, "newest printing" sorts
  is_default       boolean NOT NULL DEFAULT false,
  prices           jsonb,               -- {"usd":"1.23","usd_foil":...} CURRENT only
  price_updated_at timestamptz,
  content_hash     text,                -- md5 of card fields EXCLUDING prices
  is_removed       boolean NOT NULL DEFAULT false,
  seen_at          timestamptz
);
CREATE INDEX cp_by_identity ON card_printings (card_identity_id, released_at DESC);
CREATE UNIQUE INDEX cp_default_one ON card_printings (card_identity_id) WHERE is_default;

CREATE TABLE legalities (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  format_id        smallint NOT NULL REFERENCES formats,
  card_identity_id uuid NOT NULL REFERENCES card_identities,
  status           text NOT NULL CHECK (status IN ('legal','banned','restricted','not_legal')),
  condition        jsonb,               -- NULL = unconditional.
                                        -- OP pair: {"type":"banned_with_leader","leaderIds":[...]}
  effective_from   date NOT NULL,
  effective_to     date,                -- NULL = currently in force
  source           text,                -- 'scryfall' | 'bandai:2026-07-01' | 'manual'
  note             text
);
CREATE INDEX leg_current ON legalities (format_id, card_identity_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX leg_current_uncond ON legalities (format_id, card_identity_id)
  WHERE effective_to IS NULL AND condition IS NULL;

CREATE TABLE decks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id     text NOT NULL UNIQUE,           -- nanoid slug for URLs
  game_id       smallint NOT NULL,
  format_id     smallint NOT NULL,
  user_id       uuid REFERENCES users,          -- NULL = anonymous (guest-built)
  claim_token   uuid,                           -- in guest's localStorage; NULLed on claim
  created_ip    inet,                           -- anon spam control
  name          text NOT NULL DEFAULT 'Untitled',
  description   text,
  visibility    text NOT NULL DEFAULT 'unlisted'
                CHECK (visibility IN ('public','unlisted','private')),
  leader_ids    uuid[] NOT NULL DEFAULT '{}',   -- commander/leader zone denorm (2 = partners)
  ci_mask       smallint NOT NULL DEFAULT 0,
  forked_from_deck_id uuid REFERENCES decks,
  current_version int NOT NULL DEFAULT 0,
  likes_count   int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX decks_hub    ON decks USING gin (leader_ids);   -- "decks for commander X"
CREATE INDEX decks_browse ON decks (game_id, format_id, visibility, updated_at DESC);
CREATE INDEX decks_owner  ON decks (user_id, updated_at DESC);

CREATE TABLE deck_cards (
  deck_id          uuid NOT NULL REFERENCES decks ON DELETE CASCADE,
  zone             text NOT NULL,                -- adapter-defined: 'commander','main' / 'leader','main'
  card_identity_id uuid NOT NULL REFERENCES card_identities,
  quantity         smallint NOT NULL DEFAULT 1,
  printing_id      uuid REFERENCES card_printings,  -- NULL = default printing
  tags             text[] NOT NULL DEFAULT '{}',    -- user categories {'Ramp','Draw'}
  PRIMARY KEY (deck_id, zone, card_identity_id)
);
CREATE INDEX dc_by_card ON deck_cards (card_identity_id);    -- "public decks containing X"

CREATE TABLE deck_versions (                     -- M3 feature; provisioned now, no migration later
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id    uuid NOT NULL REFERENCES decks ON DELETE CASCADE,
  version    int NOT NULL,
  note       text,
  cards      jsonb NOT NULL,                     -- frozen [{cardId, zone, qty, tags, printingId}]
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, version)
);

-- Small tables, same shapes throughout:
-- deck_likes(user_id, deck_id, PK both) · deck_bookmarks(same)
-- collections(user_id, printing_id, finish, quantity)      -- schema now, UI later
-- combos(id, external_id, piece_count, ci_mask, results text[], popularity)
-- combo_pieces(combo_id, card_identity_id, PK both; INDEX on card_identity_id)
-- ingest_runs(id, source, started_at, finished_at, status, stats jsonb)
```

Combo Radar's "one card away" — the query that justifies the model:

```sql
SELECT c.id
FROM combos c
JOIN combo_pieces p ON p.combo_id = c.id
WHERE p.card_identity_id = ANY($deckCardIds)
GROUP BY c.id, c.piece_count
HAVING count(*) >= c.piece_count - 1;
-- then post-filter: (c.ci_mask & ~$deckCiMask) = 0
```

---

## Appendix B — Game Adapter Contract (TypeScript sketch)

```ts
// src/lib/games/types.ts
export type GameId = 'mtg' | 'optcg' | 'azuki';

export interface ZoneDef {
  id: string;                        // 'commander' | 'main' | 'leader' | ...
  label: string;
  min: number; max: number | null;   // commander: 1..2 (partners); leader: 1..1
  countsTowardSize: boolean;
  defaultCopyLimit: number | null;   // null = adapter's copy-exemption logic decides (basics)
}

export interface FormatDef {
  code: string; label: string;
  zones: ZoneDef[];
  deckSize: { min: number; max: number | null };   // Commander 100/100; OP 50+leader
}

export interface LegalityEntry {
  status: 'legal' | 'banned' | 'restricted' | 'not_legal';
  condition?: { type: 'banned_with_leader'; leaderIds: string[] }
            | { type: string; [k: string]: unknown };
}

export interface CardData<A = Record<string, unknown>> {
  id: string; name: string;
  primaryType: string | null; costValue: number | null;
  colorsMask: number; ciMask: number;
  isLeaderCandidate: boolean; isPreview: boolean;
  cheapestUsd: number | null; popularity: number | null;
  attrs: A;                          // game-typed: MtgAttrs | OptcgAttrs | AzukiAttrs
  legality: LegalityEntry[];         // pre-filtered by core to the deck's format + date
}

export interface DeckEntry { cardId: string; qty: number; tags: string[]; printingId?: string }
export interface DeckSnapshot {
  gameId: GameId; formatCode: string; asOf?: string;   // ISO date for dated evaluation
  zones: Record<string, DeckEntry[]>;
}

export interface ValidationIssue {
  code: string;                      // 'DECK_SIZE'|'COLOR_IDENTITY'|'BANNED'|'BANNED_PAIR'|'COPY_LIMIT'|'NOT_RELEASED'|...
  severity: 'error' | 'warning';     // preview cards -> warning, not error
  message: string;
  cardIds?: string[]; zone?: string;
}

export type AnalyticsBlock =
  | { kind: 'histogram'; id: string; title: string; buckets: { label: string; value: number; colorVar?: string }[] }
  | { kind: 'breakdown'; id: string; title: string; slices: { label: string; value: number; colorVar?: string }[] }
  | { kind: 'stat';      id: string; title: string; value: string; hint?: string; tone?: 'ok'|'warn'|'bad' }
  | { kind: 'table';     id: string; title: string; columns: string[]; rows: (string | number)[][] };

export type FieldTarget =
  | { column: 'name_norm'|'primary_type'|'cost_value'|'colors_mask'|'ci_mask'|'cheapest_usd'|'popularity' }
  | { jsonbPath: string[]; indexed: 'gin' | 'expression' | 'post-filter' };  // explicit index contract

export type SearchFieldDef =
  | { key: string; label: string; kind: 'text';   target: FieldTarget; match: 'fts'|'trgm'|'exact' }
  | { key: string; label: string; kind: 'number'; target: FieldTarget; ops: ('eq'|'lte'|'gte')[] }
  | { key: string; label: string; kind: 'multiselect'; target: FieldTarget; mode: 'any'|'all';
      options: { value: string; label: string }[] | 'distinct-from-db' }
  | { key: string; label: string; kind: 'colorset'; target: FieldTarget };   // exactly | within | including

export interface GameAdapter<A = Record<string, unknown>> {
  id: GameId; name: string;
  formats: FormatDef[];
  searchFields: SearchFieldDef[];    // core translates whitelisted targets to SQL

  // PURE — no IO. Same code runs client-side (live editor) and server-side (on save).
  validate(deck: DeckSnapshot, cards: Map<string, CardData<A>>): ValidationIssue[];
  analyze(deck: DeckSnapshot, cards: Map<string, CardData<A>>): AnalyticsBlock[];

  // Name -> id resolution is CORE (name_norm exact, then trgm fuzzy); adapters only tokenize.
  parseDecklist(text: string): {
    lines: { rawName: string; qty: number; zoneHint?: string; setHint?: string }[];
    warnings: string[];
  };
  serializeDecklist(deck: DeckSnapshot, cards: Map<string, CardData<A>>): string;

  display: {
    costHtml(card: CardData<A>): string;        // mana pips / DON cost / IKZ
    subtitle(card: CardData<A>): string;        // 'Legendary Creature — Elf' / 'Character — Straw Hat'
    defaultGroupBy: 'primaryType' | 'costValue' | 'tags';
    leaderNoun: string;                          // 'Commander' / 'Leader'
  };

  capabilities: {                                // absent = feature hidden for this game
    combos?: { findForDeck(cardIds: string[], ciMask: number): Promise<ComboHit[]> };  // MTG: Spellbook
    tournaments?: boolean;                       // MTG M3: Topdeck
  };
}
```

Notes: banned pairs are interpreted entirely inside `validate` (core stays game-ignorant); Commander-zone specialness (Partner, Background, "can be your commander") is MTG-adapter logic with a small hand-maintained exceptions list — don't schema-tize it.

---

## Sources

**MTG data**
- Scryfall API & terms: https://scryfall.com/docs/api · bulk data: https://scryfall.com/docs/api/bulk-data · rate limits: https://scryfall.com/docs/api/rate-limits · imagery: https://scryfall.com/docs/api/images · terms: https://scryfall.com/docs/terms
- Scryfall JSONL bulk migration (July 2026) + manifest endpoint: https://scryfall.com/blog/two-new-ways-to-sync-scryfall-data-236
- Required User-Agent/Accept headers: https://scryfall.com/blog/user-agent-and-accept-header-now-required-on-the-api-225
- Price provenance (TCGplayer USD / Cardmarket EUR, ~24h): https://scryfall.com/docs/faqs/where-do-scryfall-prices-come-from-7
- Commander Spellbook (MIT, open API + SDKs): https://commanderspellbook.com/about/ · https://spacecowmedia.github.io/commander-spellbook-backend/ · https://github.com/SpaceCowMedia/commander-spellbook-backend
- Topdeck.gg API (self-serve, credit required): https://topdeck.gg/docs/tournaments-v2 · EDHTop16: https://edhtop16.com/about · Melee restricted: https://melee.gg/Policy/Api
- TCGplayer affiliate (impact.com; API frozen separately): https://docs.tcgplayer.com/docs/tcgplayer-affiliate-program · Cardmarket API closed to new apps: https://help.cardmarket.com/en/cardmarket-api
- ManaBox import/export: https://www.manabox.app/guides/collection/import-export/ · community CSV header: https://github.com/StepKie/MtgCsvHelper
- WotC Fan Content Policy: https://company.wizards.com/en/legal/fancontentpolicy

**One Piece**
- Official rules & legal notice: https://en.onepiece-cardgame.com/rules/ · restrictions: https://en.onepiece-cardgame.com/news/restriction.html · 2026 IP notice (physical counterfeits): https://en.onepiece-cardgame.com/news/02_382.html
- Community data: https://github.com/Coko7/vegapull · https://github.com/buhbbl/punk-records · https://optcgapi.com/ · https://www.apitcg.com/ · Limitless dev API: https://docs.limitlesstcg.com/developer.html
- Market landscape: https://onepiecetopdecks.com/ · https://deckbuilder.egmanevents.com/ · https://onepiece.gg/ · https://gumgum.gg/ · https://onepiece.limitlesstcg.com/

**Azuki**
- Official: https://tcg.azuki.com/ · gallery: https://tcg.azuki.com/gallery · how to play: https://tcg.azuki.com/how-to-play · terms: https://tcg.azuki.com/terms-and-conditions
- TCG launch (Apr 2026, $1M presales, $100k Season 1): https://www.prnewswire.com/news-releases/azuki-enters-the-tcg-market-with-over-1m-in-presales-driven-by-direct-to-player-demand-302740220.html
- Gates Awakened set contents (148 cards): https://www.phdgames.com/2026/04/30/azuki-tcg-gate-awakens-azuki-labs/
- Official app (deck builder, events): https://apps.apple.com/us/app/azuki-tcg/id6755568569

**Competitors (2026 reference points)**
- Moxfield: https://www.patreon.com/moxfield · Archidekt: https://archidekt.com/ · TipsyMagic: https://tipsymagic.com/ · comparison landscape: https://manaforge.tools/en/blog/manaforge-vs-moxfield-vs-archidekt · https://grimdeck.com/blog/best-mtg-deck-builder-sites
