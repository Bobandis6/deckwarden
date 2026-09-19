# Deckwarden — Wave 2 plan (W-series): crest rebrand + ten feature ideas

**Status:** approved by the owner 2026-09-19; no package has shipped — the progress tracker is at the end of this file.
**Saved:** September 19, 2026, from a planning-only session against `b67ee0b` (nothing was implemented, installed, or deployed in that session). The body below is the approved plan verbatim; only this header, one note in section G, and the tracker were added when it landed.
**Canonical copy:** `WAVE2.md` in the repo root (this file). The copy under `~/.claude/plans/` is the planning session's snapshot.
**Working rules:** the CLAUDE.md session protocol applies unchanged — one package per session, deployed and `pnpm check`-green or not done, anything out of scope to `LATER.md` with a trigger. W1's step 0 adds build plan §6c, the CLAUDE.md line and the REDESIGN.md addendum that make W-packages legal sessions.

> Verified when written: the active repo is `/Users/danielson/Documents/Claude/deckwarden` (HEAD `b67ee0b`, clean). Its `REDESIGN.md` is canonical and records the R-series as **complete**; the codex `MASTER-REDESIGN.md` declares itself a historical snapshot in its first lines (and its "Implementation not started" status is stale). The new crest exists only outside the repo: `/Users/danielson/Documents/codex/Deckwarden/assets/brand/deckwarden-crest-v2.png` (raster, ivory background, no vector; palette recorded beside it: green `#23483c`, gold `#ba9b61`, charcoal `#242c2f`, ivory `#f7f4ee`).

## Context

The R-series left Deckwarden with a finished structure (site shell, three-tier builder, art-led hubs, evidence-first Suggestions / Combos / Cut Coach) on an **indigo** brand, and the site is still unannounced (the P2.9 / P4.7 response rounds ran cold: unposted). You now have a green/gold crest and ten ideas. Checked against the code and the live site, the ideas collapse into four themes:

1. **Identity** — the crest, its palette, a serif voice (idea 10).
2. **Starting a deck** — browse to a commander, autofill a shell, random deck, build around a combo, start from a precon (ideas 2, 3, 6, 7, 8a).
3. **Looking at cards and results** — printings/variants, tournament results and lists (ideas 1, 8b).
4. **Owning and buying** — account menu, deck quick actions, buy links (ideas 4, 5, 9).

Decisions you confirmed on 2026-09-19: buy links ship **plain (non-affiliate) now**; precons are a **separate official library** kept out of community rails; "random deck" is an **evidence-based starter shell**; the brand is a **full re-key with dark still the default**.

---

## A. Recommended direction

**Build three things, in this order.**

1. **Re-key the brand before anything else (W1–W2).** The site is unannounced, every later surface should be born on final tokens, and the blast radius is measured and small (indigo literals in six files; `bg-primary`/`text-primary` in a dozen places). No layout moves. Direction: *Warden Studio, re-keyed* — keep the R-series structure and interaction language; swap indigo for the crest's forest green / muted gold / charcoal / ivory; add one serif (Literata) for the wordmark and titles. The builder stays dense sans.
2. **One engine, many doors (W9).** Ideas 3, 6 and 8a are one capability: a draft-safe **Autofill** service returning an evidence-carrying "starter shell", plus one **review sheet** to accept it. Doors: the empty deck state, "Surprise me" (random commander), the hub CTA, "Build around this combo". It reuses the recommendation engine the way its own docblock anticipates ("feed a snapshot through a POST body into this same engine, not a second engine" — `src/lib/recommend/engine.ts:18-22`).
3. **Lean data, honest labels (W7, W8, W10).** Precons are real product lists: published as ownerless `kind='precon'` rows, never counted as community activity. Tournament browsing ships from tables you already have; full on-site decklists wait for a zero-Neon-bytes design. Buy links are plain URLs now; one env var turns on affiliate wrapping the day you leave Vercel Hobby.

**The decisions that matter most**

| Decision | Why |
|---|---|
| Gold is the dark-theme brand *text/focus* color; green is the *fill*, and the primary button's gold hairline is structural | Logo green measures 1.84:1 on the dark page (1.49 on popovers): it cannot carry text or stand alone as a fill. Gold `#c9a96a` is 8.3:1 as text and 4.5:1 on the green, so the hairline is what makes the button a visible control (WCAG 1.4.11), not decoration. |
| One Piece keeps teal in dark mode; only its **light** value moves (→ cyan `#0a6587`) | The clash with a green brand exists only in light mode (brand text `#23483c` vs today's `#0f766e`). A blue accent would collide with One Piece's own card color Blue `#1565c0` on `/leaders` chips — breaking the rule that accents mark context, never card data. Bonus: no OG or token-test churn for the dark value. |
| No role inference in Autofill | `src/lib/games/types.ts` (CutsMeta.roles) records "roles are never inferred from card text". The shell is shaped by the editorial **curve template** (62 nonland slots) and land count, and filled from measured play (exact-commander top-16 aggregate → combo pieces → EDHREC-ranked pool). Every pick carries evidence; it is labeled a *starter shell*, never a tuned list. |
| Nothing mints a deck row until the user accepts | Deck creation is limited to 10/h + 30/day per IP and the product promise is "the first real edit creates exactly one deck". Autofill, Surprise me and Start-from-precon all run on **draft state**; rerolls are free. |
| Honor "Choose commander → browse page" literally, with a safe way back | A fresh draft loses nothing by navigating. A saved deck leaves a short-lived **pick intent** in sessionStorage so the hub can offer "Use for ‘{deck}’" and return to the same editor. A GET param alone must never edit a deck (crafted-link risk), so the editor applies `?leader=` only with a matching intent and an empty zone. |
| Precons are **ownerless** rows, not a fake user's decks | `isDeckOwner` is already false for everyone when `user_id` and `claim_token` are NULL (`src/lib/decks/access.ts:37-44`). No synthetic account, no `/u` page, no account-delete edge cases. Cost: two scripts must learn about `kind` (purge, backup). |
| Precon detail pages reuse `/d/[publicId]` with deterministic ids (`/d/p_breed_lethality_c16`) | The share page already renders artwork header, list, analytics, sample hand, copy, fork, OG. Readable ids come free from the ingest. |

---

## B. Current-state findings

**Who it serves.** Commander brewers on desktop (keyboard-first: `/`, `4 Sol Ring`, Enter, Ctrl+Enter), One Piece players (phone-capable builder, Limitless imports), link recipients (Discord unfurls, share pages), and search visitors landing on ISR hubs and card pages. Your ideas touch four journeys: *starting from a blank page*, *inspecting a card*, *managing my decks*, *going from list to purchase*.

**Verified against code and the live site** (signed-out prod pass at 800 px and 375 px; no rows minted):

| Idea | What exists today | Gap |
|---|---|---|
| 1 Printings | `/cards/[id]` renders a static table — Set / # / Rarity / USD / Foil, "(shown)" on the default (`src/app/(site)/cards/[id]/page.tsx:191-237`). Sol Ring: **136** rows, none interactive; basic lands have several hundred. `card_printings.id` is the Scryfall id, so every printing's image URL is derivable (`src/lib/cards/images.ts`). `deck_cards.printing_id` exists, is validated by `PUT /api/decks/[id]/cards`, and round-trips — but **no UI ever sets it**. The editor's `CardDetailPane` shows no printings. No printings API (only `/api/cards/[id]/art`). Hover precedent: `src/components/deck/card-name-preview.tsx` (Base UI PreviewCard, 300/150 ms). | Interactivity, per-row image, an endpoint, a setter for `printingId`. |
| 2 Choose commander | `LeaderZone` empty state → "Choose commander" → `focusSearch` only (`leader-zone.tsx:72-89`, `deck-editor.tsx:546-559`). `/commanders`: force-dynamic, 60/page, color filter, **no name search** across 4,012 commanders. Hub CTA → `/decks/new?game=mtg&leader=<oracle id>` seeds a **draft only** (`deck-editor.tsx:398-431` returns early for saved decks). | Navigation, a way back for saved decks, a name filter. |
| 3 Combo → list | Combo Radar lists "In your deck" / "One card away" with a single-card Add, and fetches nothing without a saved deck (`combo-radar-panel.tsx:82`). Hubs list "Combos with {commander}" read-only. No "choose a combo", no multi-add; the only bulk path is Import. | A commander-combos list in the editor, multi-piece add, a list generator. |
| 4 Account menu | `AccountSlot` is a plain link to `/account`; Sign out exists only in `/account` settings. `ui/dropdown-menu.tsx` (with `DropdownMenuLinkItem`) is ready. The client session carries **no `username`** (no Better Auth `additionalFields`). | The menu. |
| 5 Deck quick actions | `/account` tiles: Edit (tile link), a folder `<select>`, a "Share page" link. `PATCH /api/decks/[id]` (`visibility`, `folderId`) and `DELETE` **already exist**, owner-gated. Delete UI lives only in the editor (`window.confirm`); visibility only in the editor's Share dialog. `@base-ui/react/context-menu` is installed and re-exports the Menu parts. | UI only. |
| 6 Random deck | Nothing. Ingredients exist: CI-fit popularity pool, exact-commander tournament aggregate (~990 commander sets), combo signals, curve template `[2,8,13,13,10,7,5,4]` (= 62 = 99 − 37 lands), `ci_leaders` index. One Piece has **no** popularity, aggregate, or recommend meta. | Engine + UI; One Piece cannot be honest yet. |
| 7 Precons | Nothing — no table, column, route, ingest. The cold-start rule forbids *simulated* content (precons are real products). | Everything; needs a migration. |
| 8 After choosing a leader | Hubs show "Top finishes" (8 rows; event names link **out**; "Decklist" links out when the source has one). `tournament_standings` stores `decklist_url` only — card lists are deliberately not stored (`schema.ts:728-730`); raw Topdeck JSON is archived to R2. No `/tournaments` route. | Browse pages (no new data); on-site lists (needs a storage design). |
| 9 Buy | Zero buy code. Prices: `card_printings.prices` + `card_identities.cheapest_usd`; no `tcgplayer_id`. Build plan §8 + LATER row 80: first affiliate dollar forces the Hobby → VPS move. | Link builders, UI, a policy switch. |
| 10 Brand | Indigo: tokens in `src/app/globals.css` mirrored by `src/lib/theme/tokens.ts`, pinned by `tokens.test.ts` (deep-equal both blocks; lowercase `#rrggbb` only; OG accent literals). Mark = `src/app/icon.svg` + hand-inlined `src/components/brand-mark.tsx` (7 render sites, one at 16 px). Geist only. OG images draw a text wordmark in satori's default Inter. No apple icon, no manifest. Five dead Create-Next-App SVGs in `public/`. | Vector crest, tokens, serif, icons, OG. |

**Strengths to preserve (non-negotiable in every package)**

- The keyboard script; "first real edit creates exactly one deck"; theme/tab/appearance changes never mark dirty.
- ISR on `/c/`, `/l/`, `/cards/[id]`: the `(site)` layout and those pages never read `headers()`, cookies, server `searchParams`, or `useSearchParams` (CSR bailout). Never enable `cacheComponents` (an empty `generateStaticParams` then fails the build).
- Evidence or nothing: no recommendation without a named source; absent data stays absent.
- Adapter purity: game vocabulary and rules live in `src/lib/games/<game>/`; new adapter fields are **optional** so One Piece needs no changes.
- One stretched link per `DeckTile` with `actions` above it; Undo toasts as real edits; 44 px coarse-pointer targets; `motion-safe:` everywhere.
- Attribution and smoke-pinned strings stay byte-identical in server HTML ("Build with this commander" / "Build with this leader" + hrefs, the external Topdeck/Limitless event URLs on hub shelves, "Top finishes", "Danger zone", the hero, `aria-label="Deckwarden"`, ©BANDAI, "Card image coming soon", no `>USD<` on One Piece card pages).
- Neon budget (~261 MB used, alert at 350 MB): lean rows, no stored image URLs, no per-standing card lists in Postgres.

**Assumptions and limits**

- Signed-in surfaces (`/account`, the signed-in header) were verified from source, not live (the browser pane is signed out on prod). No build, tests or smokes were run during planning.
- TCGplayer Mass Entry (`https://www.tcgplayer.com/massentry?productline=<Line>&c=<qty name||qty name>`) is confirmed from third-party code, not TCGplayer docs (their help page returned 403). W7 carries a live click-through check; One Piece lines ship only after it.
- MTGJSON deck files are documented with `count`, `isFoil`, `setCode`, `number`, `identifiers`; that `identifiers` carries `scryfallId` / `scryfallOracleId`, and how DFC sides appear, must be confirmed on the first real file in W8a.
- Topdeck's terms for *rendering full lists* on-site are unverified → on-site lists stay deferred (F).

---

## C. Prioritized idea map

Effort: **S** < ½ session · **M** ½–1 session · **L** > 1 session (split). Priority: **Now** = before you announce the site · **Next** = the following run of sessions · **Later** = trigger-gated in `LATER.md`.

| # | Your idea | Treatment | Package | Priority | Effort | Depends on | Rationale |
|---|---|---|---|---|---|---|---|
| 10 | New logo as icon; wording colors; theme/font recommendations | **Include, expanded**: vector crest (2 variants), full token re-key, Literata titles, favicon / apple icon / manifest, OG wordmark | W1, W2 | Now | M + M | — | Unannounced site = cheapest moment; everything after inherits final tokens. |
| 4 | Account dropdown (logout, other things) | **Include** | W3 | Now | S | W1 | Sign out is buried in `/account` settings; the primitive exists. |
| 5 | Right-click decks: delete, public/private | **Include, refined**: same items on a visible ⋯ button (touch, keyboard, discoverability); visibility as one-click radios; AlertDialog for delete; Undo toast | W3 | Now | M | W1 | APIs already exist — pure UI. Right-click alone is invisible and absent on phones. |
| 2 | "Choose commander" → commander browse page | **Include as asked, refined**: navigate; pick-intent return path for saved decks; keep "Search by name" as the secondary action; add a name filter to `/commanders` | W4 | Now | M | — | The literal ask is one link; the refinements keep it from stranding a saved deck or a player who knows the name. |
| 1 | Click printings, hover sample, click to swap the main image | **Include, split**: card page first (W5, with the printings API); editor pane + "Use this printing in deck" second (W6) | W5, W6 | Now / Next | M / M | W6 needs W5's route + rows | The card page is where the list already is; the editor half turns a viewer into a feature (`printing_id` is persisted end to end already). |
| 9 | Buy card / buy full deck on TCGplayer, pre-loaded | **Include** with plain links; affiliate behind an env var that stays empty on Hobby; "only cards I'm missing" | W7 | Next | M | collection (exists) | High user value, low cost; fires the buy-link half of LATER rows 22/66 without breaking the hosting clause. |
| 7 | Publish every precon + explore page + menu item | **Include, refined**: MTG **Commander** precons (the only MTG format the site validates) from MTGJSON; ownerless `kind='precon'`; `/precons`; "Start from this precon"; generated factual summaries, never WotC marketing copy | W8a, W8b | Next | L (split) | migration | Biggest content + SEO win with deterministic data; the honest answer to an empty community. |
| 6 | Full random deck (picks commander too) | **Include, refined** → "Surprise me": random legal commander + starter shell; reroll; per-card budget | W9a–c | Next | L (split) | W9a | One engine serves 6, 8a and 3. |
| 8a | After choosing a commander/leader: button/menu for the random full list | **Combine with 6**: "Autofill a starter shell" in the empty deck state, the More menu, and the hub CTA row | W9b, W9c | Next | — | W9a | Same engine, different door. |
| 3 | Choose a combo → suggested full list to quick-add | **Combine with 6**: "With your commander" combos + "Add N pieces" + "Build around" (= Autofill seeded with the pieces) | W9c | Next | M | W9a, W9b | Today's Radar only sees combos you are ≤ 1 card from; a fresh deck sees nothing. |
| 8b | Easier tournament navigation; view deck lists | **Include v1 / defer v2**: `/tournaments` + event pages + hub links from existing tables now; on-site lists later | W10 / Later | Next / Later | M / L | — | v1 needs no new data. v2 needs zero-Neon-byte storage and a terms check. |
| — | One Piece halves of 6 / 7 / 8a | **Defer, flagged**: random *leader* only; autofill waits for LATER row 59 (leader×card aggregate); starter decks wait for a hand-entered list file | Later | Later | — | data | No One Piece popularity or play data exists; faking it breaks the cold-start rule. |

**My additional recommendations** (labeled; all small)

| Id | Recommendation | Benefit | Effort | Tradeoff | Where |
|---|---|---|---|---|---|
| REC-1 | Fix the default-printing heuristic: deprioritize `set_type='box'` (Secret Lair) and printings with no USD price in the ingest post-pass ORDER BY (`scripts/ingest/scryfall.ts:341-354`) | Sol Ring's sitewide image is a licensed-crossover Secret Lair (SLD 2783, no nonfoil price) because "newest paper printing" wins; every tile, hub and thumbnail improves | S | One nightly run re-points defaults; ambient art for decks with no chosen printing may change | W5 |
| REC-2 | Name filter on `/commanders` (`?q=`) | Makes "browse to choose" workable across 4,012 commanders | S | One more indexed query path (the trgm index exists) | W4 |
| REC-3 | ⋯ menu beside right-click (one shared item list) | Touch, keyboard, discoverability | S | Replaces the folder `<select>` | W3 |
| REC-4 | "Start from this precon" as **draft seeding** (`/decks/new?game=mtg&from=<precon code>`) | Guests start from a precon without minting a row; Suggestions + Cut Coach become the upgrade guide for free | S–M | Keeps your account-only Fork decision: `from=` resolves precon codes only | W8b |
| REC-5 | `manifest.ts` + apple icon with the crest | Home-screen install for a phone-capable builder; correct icon in iOS share sheets | S | Two more brand assets | W2 |
| REC-6 | Land the contract in the repo first (`WAVE2.md`, build plan §6c, a CLAUDE.md line, LATER rows) | Matches how the R-series ran. W1 contradicts REDESIGN.md §1 ("Typography stays Geist", "the indigo shield IS the brand") and must record that it supersedes them | S | Docs time | W1 step 0 |

---

## D. Design specification

### D0. Shared rules — "Warden Studio, re-keyed"

**Retain**: layouts, containers (reading 42 / browse 64 / wide 80 rem), breakpoints (`md` 768, `wide:` 1200), 12 px panels / 8 px controls, lucide icons, the motion policy (120 ms controls, 250 ms crossfades, all `motion-safe:`), the per-game accent through `data-game` → `--accent-game` → `--ring`, tabular numbers, the Warden voice. **Refine**: palette family, titles, the mark. **Replace**: indigo, the single-card shield, the Inter OG wordmark.

**Tokens** (pairs measured with the WCAG formula on 2026-09-19; lowercase `#rrggbb` because `tokens.test.ts` enforces it — no alpha, no `color-mix` inside the two blocks):

| Token | Dark (default) | Light | Contrast notes |
|---|---|---|---|
| `--background` / `--card` / `--popover` | `#0f1314` / `#171c1e` / `#20272a` | `#f7f4ee` / `#fffdf8` / `#ffffff` | the crest's charcoal family; light = the crest's ivory |
| `--foreground` | `#f3f1ea` | `#242c2f` | 16.5:1 / 13.0:1 |
| `--muted-foreground` | `#a9b0ad` | `#565e5b` | dark 8.5 (6.9 on popover, 5.9 on hover) · light 6.1 (5.2 on hover) |
| `--secondary` / `--muted` / `--accent` (hover) | `#252d30` / `#20272a` / `#2a3336` | `#ece7dc` / `#f0ebe1` / `#e9e3d6` | |
| `--border` / `--input` | `#2b3437` / `#2b3437` | `#e0d9ca` / `#cfc6b2` | same relative weight as today |
| `--primary` / `--primary-foreground` | `#23483c` / `#f7f4ee` | `#23483c` / `#f7f4ee` | label 9.3:1; **fill-only uses are forbidden** (1.84:1 on the dark page) |
| `--brand` (links, brand text, meters/avatars) | `#c9a96a` | `#23483c` | 8.3 (6.8 on popover) / 9.3 |
| `--ring` | `#c9a96a` | `#23483c` | still overridden by `[data-game]` |
| `--gold` **(new)** — hairlines, decorative rules | `#c9a96a` | `#ba9b61` | 8.3:1 on the dark page, 4.5:1 on the green; **decorative only** on light (2.4:1) |
| `--accent-mtg` | `#b5a2ff` | `#5246cf` | 8.5 / 5.6 on muted |
| `--accent-optcg` | `#62d6c5` (**unchanged**) | `#0a6587` | 10.6 / 5.9 (5.5 on muted) |
| `--destructive` | `#f87171` | `#b91c1c` | 6.8 / 5.9 (unchanged) |
| `--chart-1…5` | `#c9a96a #8b9391 #62d6c5 #b5a2ff #a9b0ad` | `#23483c #6f746f #0a6587 #5246cf #565e5b` | chart-2 stays the neutral fallback bar |
| `og.accentGeneric` (W2) | `#c9a96a` | — | OG always paints dark |
| mana `--mana-*`, status amber/emerald utilities | unchanged | unchanged | amber-700 on ivory = 4.57:1 (passes, thin — re-check in W2) |

**Color roles.** Gold = brand voice on dark (links, focus, hairlines). Green = action (primary buttons; light-theme links). Game accents = *context only* (active tab, selected row, leader ring, focus inside `[data-game]`) — never card data, never brand. Status never relies on color alone.

**Primary button.** Default variant = `bg-primary text-primary-foreground border-gold/70` (added after the base classes so tailwind-merge beats `border-transparent`; `focus-visible:border-ring` stays; the hairline must survive `hover:`). On dark it reads as one of the crest's cards: green face, gold edge. Anything that used `bg-primary` as a bare fill (`ui/progress.tsx:39`, `ui/meter.tsx:43`, `ui/avatar.tsx:55`) moves to `bg-brand`; `text-primary` in the two `link` variants (`ui/button.tsx:20`, `ui/badge.tsx:17`) moves to `text-brand`.

**Typography.** Add **Literata** (Google, OFL, variable with optical sizes) through `next/font/google`. Per the installed docs (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`) a variable font takes no `weight`: `{ variable: "--font-literata", subsets: ["latin"], display: "swap", axes: ["opsz"] }`; set 600/700 in CSS. New token `--font-display: var(--font-literata)` in `@theme inline`. Rule: **titles are serif, controls and data are sans, numbers are tabular.** Apply the `font-display` utility explicitly to: the header wordmark (18 px / 600), the ~17 `<h1>` sites and the section `<h2>`s on site pages (at the R1b scale's existing sizes — 30/36 and 18 — so nothing shifts), `EmptyState` titles, and the Warden lines (approval line, 404, error). **`--font-heading` stays sans in W1**: it feeds dialog / sheet / drawer / alert-dialog titles that the builder opens, and the builder stays Geist; whether modal titles go serif is a one-line decision recorded in W2's audit. Body Geist 14; meta 12; eyebrow 12 uppercase.

**The mark.** `BrandMark` gains `variant`:
- `crest` (default, ≥ 28 px): three forest-green cards with gold outlines fanned behind a charcoal shield with a gold border and a gold downward sword. Both headers `size-8`; 404 / error / empty states `size-14`.
- `shield` (≤ 20 px): shield + sword only — the validation line (`size-4`), `icon.svg`, `favicon.ico`. Three cards turn to mud at 16 px.
- Colors stay **literal** (`#23483c`, `#ba9b61`, `#242c2f`) so the mark is identical in both themes, as the current docblock prescribes. On the dark page the charcoal shield is 1.3:1 against the background — its gold border (7.1:1) is the silhouette; document that.
- Starting geometry, scaled from measurements of the PNG (emblem ≈ 575×570 px → 96-unit box; shield peak 48,27.5 · shoulders 18.5/77.5,40.7 · point 48,95; centre card x 27.5–68.5 from y≈0; side cards ±20° with outer top corners at 0.3/95.8,17.4; guard y≈51 spanning 38–58; blade 45.4–50.8; tip 87.5). A scaffold to tune at 16 / 32 / 56 / 180 px against the PNG, not final art:
  ```svg
  <svg viewBox="0 0 96 96" fill="none">
    <g fill="#23483c" stroke="#ba9b61" stroke-width="2.4" stroke-linejoin="round">
      <rect x="8.9"  y="8.65" width="41" height="57.3" rx="3" transform="rotate(-20 29.4 37.3)"/>
      <rect x="46.1" y="8.65" width="41" height="57.3" rx="3" transform="rotate(20 66.6 37.3)"/>
      <rect x="27.5" y="1.5"  width="41" height="57.3" rx="3"/>
    </g>
    <path d="M48 27.5C56.5 33.5 66.5 37.8 77.5 40.7V54C77.5 71 66.5 84 48 95C29.5 84 18.5 71 18.5 54V40.7C29.5 37.8 39.5 33.5 48 27.5Z"
          fill="#242c2f" stroke="#ba9b61" stroke-width="2.4" stroke-linejoin="round"/>
    <g fill="#ba9b61">
      <path d="M48 34.5l2.6 3.2-2.6 3.2-2.6-3.2Z"/>                              <!-- pommel -->
      <rect x="46.6" y="40.5" width="2.8" height="9"/>                           <!-- grip -->
      <path d="M38 49.5c6.5-2.2 13.5-2.2 20 0l-1 3.2c-5.8-1.8-12.2-1.8-18 0Z"/>  <!-- guard -->
      <path d="M45.4 52.5h5.2V80L48 87.5 45.4 80Z"/>                             <!-- blade, tip down -->
    </g>
  </svg>
  ```
  The `shield` variant is the shield path + sword group in a tight crop. At `size-8` a 2.4-unit stroke is ≈ 0.8 px — thicken if it shimmers.
- Keep F13's hover micro-tilt. Lockup = mark + "Deckwarden" in Literata 600; clear space ≥ ¼ mark width.

**Brand details worth adding (small, systematic, no textures):** a 1 px `--gold` rule at 30 % under `SurfaceHeader` bands; the generic (no-game) band gradient becomes green → charcoal; `::selection` = gold at 30 %; one `themeColor` `#0f1314` (the theme is class-based with a dark default, so a `prefers-color-scheme` pair would be wrong); OG footer = small crest + "Deckwarden" in Literata with `.gg` in the surface accent. No confetti, no parchment textures, no second theme family (REDESIGN §0's fun ceiling stands).

**States vocabulary (all new surfaces).** Loading = `Skeleton` rows (never spinners on lists). Empty = `EmptyState` with the mark, a serif title, one hint, one action. Error = one sentence + **Retry**, in place, `role="alert"`. Success = Toast with **Undo** when reversible, else a `role="status"` line. Disabled = visible, with the reason in `title`/hint. 429 = its own sentence ("Too many … — try again in a minute").

**Icons** (lucide, installed): ⋯ `MoreHorizontal` · delete `Trash2` · copy link `Link2` · visibility `Globe` / `Link2` / `Lock` · folder `Folder` · sign out `LogOut` · buy `ShoppingCart` · Surprise me `Dices` · Autofill `WandSparkles` · reroll `RotateCcw` · flip `FlipHorizontal2` · tournaments `Trophy` · precons `Package`. Always beside a text label except ⋯ (`aria-label="Deck actions for {name}"`).

### D1. Header + account menu (W3)

Purpose: reach my stuff, and sign out, from anywhere. Primary action: My decks.

```text
[crest] Deckwarden   Build   Browse ▾   My decks            (B) Bobandis6 ▾   ◐ Appearance   ≡(phone)
                              ├ Commanders                   ┌───────────────────────────┐
                              ├ Leaders                      │ Bobandis6                 │ ← label, not an item
                              ├ Cards                        ├───────────────────────────┤
                              ├ Precons      (added in W8b)  │ My decks                  │ /account#decks
                              └ Tournaments  (added in W10)  │ Bookmarks                 │ /account#bookmarks (new id)
                                                             │ Collection                │ /account#collection
                                                             │ Profile & settings        │ /account#settings
                                                             ├───────────────────────────┤
                                                             │ Sign out                  │
                                                             └───────────────────────────┘
```

- Trigger: a real `<button>` (avatar + name; name `sr-only` below `sm`), 44 px on coarse pointers. Base UI names the popup after its trigger, so the menu is announced as the user's name — consistent with "Browse" / "Menu".
- Navigation items are `DropdownMenuLinkItem render={<Link/>} closeOnClick` (the `site-nav.tsx:66-70` pattern — real anchors: Enter, middle-click, new-tab all work). **Sign out** is a `DropdownMenuItem`: label flips to "Signing out…", calls `authClient.signOut()` then `router.refresh()`; on failure the menu stays open and the item reads "Couldn't sign out — try again".
- No "Public profile ↗" item in v1: the client session has no `username`. Adding it means Better Auth `additionalFields` + a session refetch after the username form (F).
- Guests: the "Sign in" link is unchanged. "My decks" stays in the top nav (most frequent destination; guests need it for `/#your-decks`). Appearance stays separate (guests need it).

### D2. Account deck tiles: ⋯ + right-click (W3)

Purpose: manage a deck without opening the editor. Primary action stays "open in builder" (the tile link).

```text
┌──────────────────────────────────────────────────┐
│ [leader]  Krenko — Mob Rule                 [⋯]  │  ⋯ lives in the tile's `actions` slot (already z-10)
│           Magic · Commander · Public             │  the visibility word stays in the HTML
│           Updated Sep 15 · ♥ 1      Share page   │
│▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁│
└──────────────────────────────────────────────────┘
 right-click (desktop) · ⋯ (everywhere)  →  ONE shared item list
┌─────────────────────────┐
│ Open in builder         │
│ Open in new tab         │  ← replaces the native link menu that ContextMenu suppresses
│ View share page         │
│ Copy share link         │
├─────────────────────────┤
│ VISIBILITY              │
│ ● Public                │  radio group at top level: a change is ONE click (items close on click)
│ ○ Unlisted              │  hint: "Unlisted: anyone with the link"
│ ○ Private               │
├─────────────────────────┤
│ Move to folder        ▸ │  radio submenu: No folder + your folders (replaces the <select>)
├─────────────────────────┤
│ Delete deck…            │  destructive text + Trash2
└─────────────────────────┘
```

- Visibility: local state → `PATCH {visibility}` → toast "“Krenko — Mob Rule” is now private · **Undo**" (5 s). **No `router.refresh()`**: the PATCH bumps `updated_at` and a refresh would reorder the grid under the pointer. Failure reverts and toasts the error. The share page denies others immediately (it is force-dynamic for exactly this reason).
- Delete: `AlertDialog` — "Delete “Krenko — Mob Rule”?" / "This permanently deletes the deck, its version history and its share page. Forks keep their cards." **Cancel** has initial focus; **Delete deck** is destructive. Success → `router.refresh()`, toast "Deck deleted". No Undo (hard delete) — the dialog is the guard.
- Copy link writes `https://deckwarden.gg/d/<publicId>`; on a private deck the item reads "Copy share link (private — only you can open it)".
- Keyboard: ⋯ is the tab stop after the tile link; arrows/typeahead inside; Esc returns focus to ⋯. Touch: ⋯ at 44 px is the path (iOS long-press on an anchor opens Safari's preview, so the context menu is treated as desktop-only).
- Density: tile height unchanged; the `<select>` leaves, so the row gets lighter.

### D3. Leader zone → browse → back (W4)

```text
COMMANDER 0
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
            No commander yet                      (serif)
   Pick one from the full list, or press
   Ctrl+Enter on a search result.
   [ Browse commanders → ]   [ Search by name ]   primary link · ghost button (= today's focusSearch)
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

```text
fresh draft (no row) ── Browse commanders ──► /commanders ─► /c/<slug> ─► "Build with this commander"
                                                                        └► /decks/new?game=mtg&leader=<key>      (exists today)

saved deck ── Browse commanders ── writes pick intent {deckId, deckName, game, at} to sessionStorage, flushes autosave
   ─► /commanders   banner island: "Choosing a commander for ‘Krenko — Mob Rule’ · Back to deck · Cancel"
   ─► /c/<slug>     CTA island adds  [ Use for ‘Krenko — Mob Rule’ ]  above the unchanged default CTA
   ─► /decks/<deckId>/edit?leader=<key>
        editor applies it ONLY IF the intent matches this deck, is < 30 min old, and the leader zone is empty
        ─► real edit ─► toast "Added X as Commander · Undo" ─► intent cleared, param stripped
```

- Labels and hrefs come from the adapter (`display.leaderBrowse?: { href, label }` — "/commanders" · "Browse commanders"; "/leaders" · "Browse leaders"). Not under `hub` (absent for One Piece, and it gates template rendering).
- Hub CTA: server HTML stays byte-identical (smoke pins). The client island reads the intent through `useSyncExternalStore` (the `src/lib/hub/index-view.ts` style) — never `useSearchParams`, never set-state-in-effect.
- A crafted `…/edit?leader=<key>` link with no matching intent changes nothing. A non-empty zone changes nothing and says why on the pane's live line.
- `/commanders` gains "Filter by name…" (`?q=`, GET form) left of the color chips; results keep popularity order; empty → `EmptyState` "No commanders match “…” · Clear filter".
- Phone: both buttons stack full-width at 44 px; the round trip is ordinary page navigation.

### D4. Card page printings gallery (W5)

Purpose: see every version of a card. Primary action: click a printing to see it large.

```text
md and up
┌────────────┐  Sol Ring ①                                   (serif h1)
│            │  Artifact
│ HERO IMAGE │  {T}: Add {C}{C}.
│ = pinned   │  Legality  [Commander: legal]
│ printing   │
│            │  Printings · 136                         [ Filter sets… ]
└────────────┘  ┌───────────────────────────────────────────────────────────┐
 Commander      │▌[▮] Commander Masters      CMM 410    Unc.  $2.89   $4.69  │ ← pinned: aria-pressed, accent rule, "Shown"
 Masters        │ [▮] Secret Lair Drop       SLD 2783   Rare    —    $129.95 │ ← hover/focus: highlight + PreviewCard (w-56)
 CMM · #410     │ [▮] Reality Fracture Cmdr  FRC 21     Unc.    —       —    │
 Unc. · 2023    │  …                          [ Show all 136 printings ]     │ ← first 100 inline; the rest from the API
 Default        └───────────────────────────────────────────────────────────┘
 [⟲ Flip]
 (sticky top-4)

phone
┌──────────────────────────┐      tap a row → bottom Drawer
│ HERO (not sticky)        │      ┌──────────────────────────┐
│ Sol Ring ① · Artifact …  │      │      large image         │
│ Printings · 136          │      │ Commander Masters        │
│ [▮] Commander Masters  ✓ │      │ CMM · #410 · Unc. · 2023 │
│ [▮] Secret Lair Drop     │      │ $2.89 · foil $4.69       │
│ [▮] Reality Fracture…    │      │ [ Buy ↗ ]  (W7)          │
└──────────────────────────┘      └──────────────────────────┘
```

- The left column becomes `md:sticky md:top-4 self-start`, so the main image stays visible while a long table scrolls — this is what makes "click → shows in the main spot" legible.
- Row: keep `<table>` semantics. The Set cell holds a `<button aria-pressed>` with a 26×36 lazy thumbnail (`small` rendition) + set name; an `after:absolute after:inset-0` stretch makes the whole row the target. Pinned row: `bg-muted` + 2 px left rule in `--accent-game` + the word "Shown". Hover: `bg-accent` in 120 ms.
- Hover/focus preview: the existing PreviewCard wrapper at 300 / 150 ms, `normal` image at `w-56`, caption "CMM · #410 · Unc.". Keyboard focus opens it; Esc closes; taps never open it.
- Click / Enter / Space: decode the new image off-screen, crossfade the hero (250 ms, `motion-safe:`), update the caption, `history.replaceState` writes `?printing=<id>` (restored on load by the island; canonical unchanged); an `aria-live="polite"` line announces the printing. A failed image keeps the selection and shows the existing fallback text. Pin-vs-drawer is decided at click time with `matchMedia("(min-width: 48rem)")`.
- Payload: the page passes **at most 100 slim rows with no URLs** (the client derives them with the pure helpers in `src/lib/cards/images.ts`); "Show all N printings" fetches the rest. Basic lands no longer ship hundreds of rows twice.
- "Default" badge; "Reset to default" when another is pinned; **Flip** only when `has_back`; "Filter sets…" only above 12 printings. One Piece: still no price columns; thumbnails stay blank spacers until the `img.deckwarden.gg` flip (same rule as search rows).

### D5. Editor card pane printings (W6)

```text
[ card image ]                     ← previews the clicked printing
Sol Ring ①  ·  Artifact
{T}: Add {C}{C}.
[tags]
from $1.33 · Buy ↗ · Card page →
▸ Printings · 136                  ← Collapsible, closed by default, fetched on first open only
   [▮] Commander Masters   CMM 410   $2.89
   [▮] Secret Lair Drop    SLD 2783    —
   In deck: default printing
   [ Use this printing in deck ]   ← enabled when the card is in the deck and the selection differs
```

- Fetch-on-open keeps R2's rule ("never enrich every search result"). Choosing a printing is a **real edit** (autosaves; toast "Krenko now uses SLD 2783 · Undo"). The commander's ambient art follows automatically (`useLeaderArt` keys on `printingId`). The list/grid image follows because the package also updates the in-memory card image.
- "Est. price" keeps using cheapest printings, and the pane says so. Version diffs ignoring printing swaps stays LATER row 45.

### D6. Buy controls (W7)

- Share page action row: `♡ Like · Bookmark · Fork · Copy decklist · [ Buy this deck ▾ ]`. Items are real links (`target="_blank" rel="noopener"`): **Whole deck (100)** · **Without basic lands (63)** · **Only cards I'm missing (41)** (only when the viewer has a collection). Footer label: "Opens TCGplayer Mass Entry in a new tab · prices via Scryfall, updated daily."
- Card page: "Buy on TCGplayer ↗" under the hero caption. Editor: "Buy ↗" in the card pane footer; "Buy this deck…" in **More**.
- Over-long URL (≈ 6,000+ chars, measured on the final URL) → copy the list, open bare Mass Entry, toast "List copied — paste it into Mass Entry". This is a first-class path, not an error.
- When `NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE` is set (never on Hobby): links wrap through it, gain `rel="sponsored"`, and a one-line disclosure appears in the menu footer, the site footer and `/legal`.

### D7. Precons (W8)

```text
/precons
Precons   (serif h1)                                   [Magic: The Gathering]  [One Piece — soon]
Every Commander preconstructed deck, card for card. Start from one and make it yours.
[ Search decks or commanders… ]   (W)(U)(B)(R)(G)(C)   Year [All ▾]   Sort [Newest ▾]

2026 ──────────────────────────────────────────────────────────────
[tile] [tile] [tile] [tile]     tile = DeckTile: commander image · deck name · set · CI strip · "Precon" badge · est. price
2025 ──────────────────────────────────────────────────────────────
```

- One static ISR page (all ~200 tiles in the HTML, images lazy) with a **client-side** filter island — no server `searchParams`, zero DB reads per visit, every precon link crawlable.
- Detail = the existing share page at a readable id (`/d/p_breed_lethality_c16`) with: a **Precon** badge beside the format chip; a meta line "Preconstructed deck · Commander 2016 (C16) · Released Nov 2016"; a generated summary (colors, commander(s), curve, est. price today, five priciest cards); byline "Official product list · data via MTGJSON"; primary CTA **Start from this precon** beside Fork.
- Hubs: "Precons led by {commander}" above "Decks with this commander" (renders only when non-empty). Precons never appear in "Recent public decks", Continue building, or community counts. Their timestamps are the release date, so they never look "recent" anywhere.
- Empty filter → `EmptyState` "No precons match · Clear filters". The One Piece pill is disabled with the hint "One Piece starter decks are coming." (the real reason lives in `LATER.md`, not in UI copy).

### D8. Autofill review sheet + its doors (W9)

```text
Autofill a starter shell                                                    [×]
Built from real play data for Atraxa, Praetors' Voice — every pick shows why.
Budget (All)(≤ $5 a card)(≤ $1 a card)     ☑ Keep my 12 cards     [⟲ Reroll]
41 from top-16 lists with Atraxa · 21 EDHREC staples in WUBG · 37 lands (template)
┌──────────────────────────────────────────────────────────────────────────┐
│ ☑ Lands · 37                                           [ basics only ]   │
│   ☑ Command Tower     A Commander staple by EDHREC play data · #2   $0.23│
│   ☑ Breeding Pool     Played in 62% of top-16 lists with Atraxa     $9.39│
│ ☑ Mana value 2 · 13                                                      │
│   ☑ Arcane Signet     …                                             $0.43│
└──────────────────────────────────────────────────────────────────────────┘
A starter shell, not a tuned list — swap in your commander's synergy pieces.
Est. total $412 (cheapest printings)                  [Cancel]  [Add 87 cards]
```

- Dialog (wide) from `md`; full-height Drawer on phones; groups are Collapsibles; each row: checkbox, name with hover/focus preview, first evidence sentence ("+2 more" expands), price. The apply button always states the live count.
- Apply = **one** edit → toast "Added 87 cards · **Undo**" (restores the previous list). Reroll never touches the deck. Loading = skeleton rows; error = sentence + Retry; a short fill says why ("Filled 71 of 87 — the $1 budget leaves too few cards at 5+ mana").
- Doors: (1) the empty-deck `EmptyState` gains **Autofill a starter shell** once a commander is set, and **More → Autofill…** always; (2) the Magic card on `/decks/new` and on home gets **Surprise me** → the draft opens the sheet with "Your commander: Krenko, Mob Boss · Reroll commander"; (3) the hub CTA row gains "Start with a starter shell" (opens the sheet, never auto-applies); (4) the Combos tab gains **With your commander** rows — `[Add 2 pieces]` and `[Build around]` (the sheet opens with the pieces pinned, labeled "Combo piece").
- One Piece: "Surprise me" picks a random **leader** into a normal draft; no autofill door renders (the adapter declares none), with no apology copy.

### D9. Tournaments (W10)

```text
/tournaments                                           /tournaments/<id>
Tournaments (serif)   [Magic] [One Piece]              Liga Mesão Presencial S2-E6   (serif)
Top-16 results at 16+ player events.                   May 15, 2026 · 36 players · on Topdeck.gg ↗
Sep 4   Commander Casual – Barcelona   25 players      #   Player        Commander            Record   List
        1st: Kinnan, Bonder Prodigy                    1   A. Silva      Kinnan (GU)          4–0–1    Decklist ↗
Aug 29  …                                              5   M. Rocha      Atraxa (WUBG) → hub  1–0–1    Decklist ↗
```

- Index rows link to the internal event page; commander names link to hubs with `ColorChip`s. Hub "Top finishes" rows link the event name internally **and keep the external event link on every row** (the smoke pins and the attribution rule both require it), plus "All {n} finishes →" (`/tournaments?leader=<slug>`).
- Event pages are `noindex` in v1 (thin pages carrying player names — an explicit decision to revisit). Source credit on both pages.

### D10. Before → after

| Moment | Before | After |
|---|---|---|
| New player opens a Magic draft | "No commander yet" + a button that only focuses a search box they don't know what to type into | **Browse commanders** → ranked, filterable list → hub → one click back into a seeded draft; then **Autofill a starter shell** shows 87 explained picks and one **Add 87 cards** with Undo |
| Collector opens Sol Ring | A crossover Secret Lair as the only image, and 136 rows of text | A sensible default printing, thumbnails on every row, hover previews, click to pin any printing in a sticky main image, shareable `?printing=` |
| Owner wants a deck private | Open editor → Share → radio → back | Right-click (or ⋯) → **Private**. Toast with Undo |
| Reader likes a shared list | Copy decklist, open TCGplayer, find Mass Entry, paste | **Buy this deck ▾ → Without basic lands** opens Mass Entry pre-filled |

---

## E. Implementation roadmap

Session protocol is unchanged (CLAUDE.md): one package per session, deployed and `pnpm check`-green or not done, out-of-scope items to `LATER.md` with a trigger, every migration eyeballed, caching intent stated on every new route. Paths marked **(new)** are proposals; every other path was verified in the repo.

```text
NOW    W1 Brand foundation ─► W2 Brand completion ─► W3 Account menu + deck actions ─► W4 Choose-commander flow ─► W5 Card-page printings (+ API)
NEXT   W6 Editor printings ─► W7 Buy links ─► W8a Precons data ─► W8b Precons surfaces ─► W9a Autofill engine ─► W9b Review sheet ─► W9c Doors ─► W10 Tournaments v1
LATER  on-site tournament lists · One Piece starter decks / autofill · affiliate switch-on · exact-printing buy links · in-editor commander picker · profile link in the account menu
```

### W1 — Brand foundation (M) → detailed in section G

### W2 — Brand completion (M)

- **Objective**: unfurls, home-screen icons and both themes carry the crest; the re-key is *audited*, not assumed.
- **In**: OG footer = crest + "Deckwarden" in Literata; `og.accentGeneric` → gold (`src/lib/theme/tokens.ts:99`; literals at `tokens.test.ts:90` and `src/lib/og/labels.test.ts:30`). **(new)** `assets/fonts/Literata-SemiBold.ttf` + `OFL.txt` and **(new)** `src/lib/og/fonts.ts`: satori needs a static TTF (no woff2, no variable fonts) — load with the documented `readFile(join(process.cwd(), "assets/fonts/…"))` pattern and a literal path so standalone tracing copies it; cache the promise at module level; try/catch → fall back to Inter so an OG route can never 500. Pass `fonts` at all **eight** `ImageResponse(` call sites across the four `opengraph-image.tsx` routes. **(new)** `src/app/apple-icon.tsx` and `src/app/manifest.ts` (docblock: static) + 192/512 PNGs; a single `themeColor: "#0f1314"` in the root `viewport` (the editor pages export their own `viewport` — verify the meta there too). `SurfaceHeader` gold rule + generic gradient. Both-theme audit at 390 / 768 / 1200 / 1440 over home, `/cards`, a card page, a hub per game, a deck page, `/account`, the editor per game, one dialog; fix findings; decide serif modal titles (`--font-heading`); write the measured table into the REDESIGN.md addendum.
- **Out**: layout changes; One Piece ambient art (off until Bandai answers).
- **Acceptance**: each OG route returns a PNG with the crest and serif wordmark; One Piece unfurls stay artless; renaming the TTF locally still yields a 200 (Inter fallback); `/manifest.webmanifest` is served and iOS "Add to Home Screen" shows the crest; every audited text pair ≥ 4.5:1 (≥ 3:1 for large titles) and recorded; focus visible on every control in both themes.
- **Checks**: `pnpm check`; `smoke:seo`, `smoke:hubs`, `smoke:optcg` on dev; `pnpm build` route table unchanged for `/c/`, `/l/`, `/cards/[id]` and their OG routes. Note: OG `revalidate = 86400` means old unfurls linger for a day.

### W3 — Account menu + deck quick actions (M)

- **Objective**: sign out and reach account sections from anywhere; change visibility or delete a deck without opening the editor.
- **Prereqs**: W1. No API or schema work — `PATCH` / `DELETE /api/decks/[id]` exist (`src/app/api/decks/[id]/route.ts:88,140`).
- **Steps**
  1. **(new)** `src/components/ui/context-menu.tsx` by hand (~40 lines: Root, Trigger, Content reusing the dropdown popup classes). `@base-ui/react/context-menu` re-exports the Menu parts, so the existing `DropdownMenu*` item wrappers render inside it — no `shadcn add`, no CLI quirks.
  2. `src/components/auth/account-slot.tsx`: signed-in branch → `DropdownMenu` (D1); share sign-out logic with `src/components/auth/sign-out-button.tsx` through one hook.
  3. `src/components/deck/deck-tile.tsx`: spread `...rest` onto its `<li>` root (it stays directive-free) so `ContextMenuTrigger render={<DeckTile …/>}` keeps valid `ul > li` markup.
  4. `src/app/(site)/account/page.tsx`: `id="bookmarks"`; `DeckItem` renders **(new)** `src/components/account/account-deck-tile.tsx` (client; `tile` computed on the server and passed as plain data) with ⋯ in `actions`; both menus render one **(new)** `deck-action-items.tsx`. The folder `<select>` (`src/components/folders/deck-folder-select.tsx`) becomes the submenu; "Share page" stays.
  5. **(new)** delete dialog on `ui/alert-dialog.tsx`; one `<Toaster/>` in the island (`toast` is a module-level manager, `ui/toast.tsx:17`).
  6. Visibility: local state resynced to props with the adjust-during-render pattern (`new-deck-chooser.tsx:38` precedent) → `PATCH` → Undo toast; no refresh. Delete → `DELETE` → `router.refresh()`.
- **Acceptance**: D1/D2, plus — right-click never navigates; the tile's anchor still stretches and is titled "Edit {name}"; setting a deck private then opening `/d/<publicId>` in a private window shows the denial shell immediately and the grid order did not jump; deleting a deck with forks succeeds and the forks keep their cards; the header shows "Sign in" within one refresh after **Sign out** from any page.
- **Checks**: rewrite `site-header.test.tsx:77-84` (the slot is a `button` named after the user; add an open-menu test with the file's `open()` helper — pointerDown + mouseDown + click; the `:52` negative regex stays safe because the popup is portaled); RTL for the item list (radio reflects visibility; PATCH body; rollback; delete confirm → DELETE); `deck-tile.test.tsx` unchanged; `smoke:account`, `smoke:profile`, `smoke:engagement` green.
- **Risks**: `RadioItem` does not close on click by default — set it; `react-hooks/refs` forbids reading a ref during render.

### W4 — Choose-commander flow (M)

- **Steps**
  1. `src/lib/games/types.ts`: optional `display.leaderBrowse`; implement in `src/lib/games/mtg/adapter.ts` and `src/lib/games/optcg/adapter.ts`; extend both `display.test.ts` files.
  2. `src/components/deck/leader-zone.tsx`: primary styled `<Link>` (the `account-slot.tsx:26-31` link-not-button pattern) + ghost "Search by name" calling the unchanged `onChooseLeader`. Update `leader-zone.test.tsx:36-52`. Wire through `src/components/editor/deck-list-pane.tsx` and `deck-editor.tsx:1101`.
  3. **(new)** `src/lib/decks/leader-pick-intent.ts` (sessionStorage + `useSyncExternalStore`, pure helpers unit-tested): written on click only when a saved deck id exists; 30-minute TTL; cleared on apply or Cancel.
  4. **(new)** `src/components/hub/hub-build-cta.tsx` (client) at `c/[slug]/page.tsx:195-207` and `l/[slug]/page.tsx:207-215`: server output = today's exact anchor; a fresh same-game intent adds the primary "Use for ‘{name}’" → `/decks/<id>/edit?leader=<key>`. **(new)** pick banner island on `/commanders` and `/leaders`.
  5. `src/app/decks/[id]/edit/page.tsx` passes `searchParams.leader` (already force-dynamic) → `DeckEditor`: after hydration, a one-shot effect (the `seededLeaderRef` shape, `deck-editor.tsx:398-431`; every `setState` inside the async IIFE like `combo-radar-panel.tsx:84-86`) applies **only** with a matching intent and an empty leader zone → resolve (pass 0) → `handleAdd` (Undo built in) → `history.replaceState` → clear intent.
  6. REC-2: `q` on `src/app/(site)/commanders/page.tsx` + `loadLeaderIndex` (`src/lib/hub/queries.ts:269`), normalized with `src/lib/cards/normalize.ts`, `name_norm LIKE %q%` on the trgm index.
- **Acceptance**: fresh Magic draft → **Browse commanders** → type "krenko" → only matching commanders, popularity order → hub → **Build with this commander** → draft shows Krenko and **no** `POST /api/decks` fires before the first edit. Saved deck with 40 cards → **Browse** → banner names the deck → hub shows **Use for ‘…’** → the *same* deck id reopens with the commander added, a toast offers Undo, the URL has no `?leader=`. Pasting `/decks/<id>/edit?leader=<key>` in a fresh tab changes nothing. `/c/<slug>` stays `●` ISR (second local hit `x-nextjs-cache: HIT`); the server HTML of both hubs still contains the pinned CTA text + href (`hubs-smoke:103-108`, `seo-smoke:339-343`) and index hrefs are untouched (`hubs-smoke:75-84`).

### W5 — Card-page printings gallery + printings API (M) + REC-1

- **Steps**
  1. **(new)** `src/app/api/cards/[id]/printings/route.ts` — copy the `art/route.ts` shape: `GET`, zod uuid, **caching intent: `force-dynamic` + `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`** (404s get the miss cache); excludes `isRemoved`; capped at 250 rows with `total` and `truncated`; reads through `cp_by_identity`; no rate limit (same stance as art).
  2. `src/app/(site)/cards/[id]/card.ts`: also select `hasBack`. The page passes ≤ 100 slim rows (no URLs; `imageOverride` only when non-null).
  3. **(new)** `src/app/(site)/cards/[id]/printings-gallery.tsx` (client): one provider owning `selectedPrintingId` around the hero (replacing `page.tsx:126-137`, keeping `priority` for the default image and the "Card image coming soon" fallback) and the table (replacing `:191-237`, same columns and One Piece price rule); phone Drawer; `?printing=` read via `useSyncExternalStore` with a null server snapshot, written via `history.replaceState`.
  4. Widen `src/components/deck/card-name-preview.tsx` to `{ name, image }` and reuse its delays.
  5. REC-1: in `scripts/ingest/scryfall.ts:341-354` add `(st.set_type = 'box') ASC` and `((p.prices->>'usd') IS NULL) ASC` ahead of `released_at DESC`; note it in the run's `stats`.
- **Acceptance**: D4, plus — the route stays `●`; the hero remains the LCP element; only visible thumbnails load; `?printing=<id>` reproduces the view on reload and is absent from the canonical tag; reduced motion = instant swap; a basic land's HTML carries 100 rows, not hundreds, and "Show all" reaches the rest (or says "Showing 250 of N — newest first"); One Piece pins hold (`optcg-smoke:167`, `seo-smoke:374`). After the next ingest Sol Ring's default is a regular set printing with a USD price.
- **Risks**: ~100 PreviewCard roots — the same order as share pages today; fallback is one shared floating preview. Default-printing change shifts ambient art for decks with no chosen printing — say so in the ship note.

### W6 — Editor printings (M)

- **Steps**: Collapsible "Printings" in `src/components/editor/card-detail-pane.tsx`, fetched on first open from W5's route, reusing its rows; **(new)** pure `setPrinting()` in `src/lib/decks/editor-state.ts` (+ tests) → `applyEdit`; the entry is selected the way `tagging` is (`deck-editor.tsx:792-804`); **also update `cards` and `preview`** with the chosen image (`EditorCard.image` is per card — lists would otherwise show the default until reload; `deck-cards-wire.ts:88-90` already resolves the choice on load). Update LATER row 45's trigger text.
- **Acceptance**: D5; choosing a printing for the commander crossfades the ambient art; reload keeps it; the `deck-editor.test.tsx` create-count tests stay green (previewing a printing never mints a deck).

### W7 — Buy links (M)

- **Steps**
  1. `src/lib/games/types.ts`: optional `capabilities.buy?: { vendor; productLine; massEntryLine(card, qty): string; cardUrl(card): string; skipByDefault?(card): boolean }`; **(new)** `src/lib/games/mtg/buy.ts` — `skipByDefault` = `type_line` contains "Basic"; `massEntryLine` keeps the full name when the top-level `mana_cost` contains ` // ` (split cards — `MtgAttrs` has no `layout`), else the front-face name. One Piece declares nothing, so the feature is hidden there.
  2. **(new)** `src/lib/buy/links.ts` + tests: `massEntryUrl()`, `deckBuyOptions(entries, cards, owned?)`, `withPartner()` reading `NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE` (`.env.example`: **must stay empty on Vercel Hobby**), length measured on the *final* URL.
  3. **(new)** `src/components/deck/buy-deck-menu.tsx` in `DeckShareView`'s action row (`src/components/deck/deck-share-view.tsx:~304`; it already receives `owned`) and the editor's More menu (`src/components/editor/editor-header.tsx:133-148` — update the exact menu array pinned at `editor-header.test.tsx:129`); card link on `cards/[id]/page.tsx` (built server-side from a build-time env — ISR-safe) and `card-detail-pane.tsx:76-82`.
  4. `/legal` "Buying cards" paragraph; LATER rows 22 / 66: buy-link half fired, affiliate half tied to row 80.
- **Acceptance**: on `/d/db5d4d5843ps` **Whole deck** opens Mass Entry in a new tab listing 100 cards with "33 Mountain" as one line; **Without basic lands** omits it; a signed-in viewer with a collection sees **Only cards I'm missing (N)** where N = 100 − the page's "You own N/100"; no Deckwarden server ever calls TCGplayer; with the env var unset there is no `sponsored` rel and no disclosure line.
- **Manual**: click through three real decks (mono-color; five-color with DFCs; one with split/adventure cards) — ≥ 95 % of lines must parse; record misses and adjust `massEntryLine`.
- **Note for the affiliate day**: an Impact `?u=` wrapper double-encodes the list (`%20` → `%2520`), so long decks will hit the copy-list path more often.

### W8a — Precons data (M–L)

- **Steps**
  1. `src/db/schema.ts` → **eyeball `drizzle/0014_*.sql`**; expected shape:
     ```sql
     ALTER TABLE "decks" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;
     ALTER TABLE "decks" ADD CONSTRAINT "decks_kind_check" CHECK ("kind" in ('user','precon'));
     ALTER TABLE "decks" ADD CONSTRAINT "decks_precon_unowned" CHECK ("kind" <> 'precon'
       OR ("user_id" IS NULL AND "claim_token" IS NULL AND "folder_id" IS NULL AND "forked_from_deck_id" IS NULL));
     DROP INDEX "decks_recent_public";
     CREATE INDEX "decks_recent_public" ON "decks" ("updated_at" DESC) WHERE "visibility"='public' AND "kind"='user';
     CREATE TABLE "precon_products" ("deck_id" uuid PRIMARY KEY REFERENCES "decks"("id") ON DELETE CASCADE,
       "code" text NOT NULL UNIQUE, "slug" text NOT NULL UNIQUE, "set_code" text NOT NULL,
       "release_date" date, "product_name" text NOT NULL, "blurb" text, "source_hash" text NOT NULL);
     ```
  2. **(new)** pure mapper `src/lib/games/mtg/mtgjson-map.ts` + fixture test: `type === "Commander Deck"`; `commander[]` → commander zone (≤ 2; extras to main); `mainBoard[].count`; `identifiers.scryfallOracleId` → `external_key`; `identifiers.scryfallId` → `printing_id` when that printing exists (else NULL, counted); dedupe DFC sides by oracle id; tokens / sideboard ignored with a warning; zod-parse only the subset used.
  3. **(new)** `scripts/ingest/precons.ts` (`pnpm ingest:precons`): `DeckList.json` → deck files for new/changed codes only (250 ms gap, `User-Agent: Deckwarden/1.0`); batched identity resolution; `writeDeckCards` (`src/lib/decks/save-cards.ts`) for denorms; deterministic `public_id = 'p_' + slug` (fits `^[a-z0-9_]{4,32}$`, `route-helpers.ts:38`), upsert on it; `created_at` = `updated_at` = release date; generated factual description; `source_hash` skips unchanged decks; `ingest_runs` row. Weekly (or dispatch) step in `.github/workflows/nightly-ingest.yml` after Scryfall.
  4. `kind` everywhere it matters — see the appendix. Two are critical: `scripts/purge-anon-decks.ts:47-55` (or precons die after 12 months) and `scripts/backup-user-tables.sh:19` (add `precon_products`, or a restore orphans them and re-ingest collides on `public_id`).
- **Acceptance**: precon count = "Commander Deck" entries in `DeckList.json` minus logged skips; five spot checks (one per era, one partner pair) show the right commander(s), 100 cards and the precon's own printings; home's rail and hub community shelves unchanged; every write route answers 403 for a precon (add the case to `src/lib/decks/access.test.ts`); `pnpm db:size` growth < 6 MB; rerunning changes nothing.
- **Risks**: MTGJSON shape drift (fixture + zod); cards newer than the last Scryfall run (order the steps; unresolved → skip deck and log); legality flags on old precons are shown honestly.

### W8b — Precons surfaces (M)

- **Steps**: **(new)** `src/app/(site)/precons/page.tsx` (static, `revalidate = 86400`, no `searchParams`) + client filter island; **(new)** `GET /api/precons/[code]` — **public, `s-maxage=86400`**, returns meta + `DeckCardWire[]`, precon rows only; `DeckTile` optional `badge`; `src/app/(site)/d/[publicId]/page.tsx` joins `precon_products` and passes a `precon` prop to `DeckShareView` (badge, meta line, summary, byline swap, **Start from this precon**); hub row in `c/[slug]/page.tsx` via **(new)** `loadHubPrecons`; `BROWSE_LINKS` (`src/components/site-nav.tsx:36-40`) + both arrays in `site-header.test.tsx` (`:70-74`, `:95-101`); `/precons` in `src/app/sitemap.ts:53-62`; `new-deck-chooser.tsx` latches `from`; `DeckEditor` seeds entries **directly** from the precon endpoint (state only, no `markDirty`) — not through `applyImport`, whose merge drops `printingId` (`src/lib/decks/import.ts:148-155`).
- **Acceptance**: D7, plus — **Start from this precon** opens 100 cards with the precon's printings and no `POST /api/decks`; the first edit produces exactly one POST and one 100-entry PUT; Suggestions immediately lists upgrades; Fork still requires sign-in; an unknown `from=` code seeds nothing and says so.

### W9a — Autofill engine + API (M–L)

- **Steps**
  1. Refactor with no behavior change (`src/lib/recommend/engine.ts`): extract `gatherSignals(snapshot, opts)` (= today's lines 74–115 with `deckCardIds` from the snapshot) and `recommendForSnapshot`; `recommendForDeck` becomes a thin wrapper. `rank.test.ts`, `queries.test.ts`, `mtg/recommend.test.ts`, `smoke:recommend` stay green untouched.
  2. `src/lib/recommend/queries.ts`: `loadEntryFacts(gameId, ids)` (the client sends ids only — every fact comes from the server); `CandidateFilter.scope?: { column: "primary_type", op: "eq" | "ne", value }` whitelisted inside `candidateConditions` like `exclude`; `loadFillerRows(gameId, formatId, names)` (legality-checked; deliberately skips `exclude` so basics load). Extract `wireSelect`/`toWire` from `src/app/api/cards/resolve/route.ts:50-86` into **(new)** `src/lib/cards/wire.ts` (`loadCardWires(ids, formatId)`).
  3. Optional `RecommendMeta.autofill` (pure) in `src/lib/games/types.ts`, implemented in `src/lib/games/mtg/recommend.ts`: `base { label: "Lands", source: "land-template", count: 37, scope: primary_type = Land, isBase(card), rankedByColorCount: [6,8,16,22,26,28], maxColorlessIdentity: 8, fillers({ciMask, n, costTexts}) → basics split by color pips; Wastes for colorless }`, `lockShare = TOURNAMENT_STAPLE_SHARE`, `lockMinLists = 5`. A test asserts `37 + Σ curve buckets = 99`. No roles anywhere — only `ci_mask`, type, cost, popularity, tournament data, combos.
  4. **(new)** pure `src/lib/recommend/autofill.ts` + `rng.ts` (mulberry32) + tests:
     ```text
     1 slots = deckSize.min − Σqty(entries in countsTowardSize zones); ≤ 0 → {picks: [], notes: ["full"]}
     2 have = deckCurve(keep).counts ; haveBase = Σqty(keep where isBase)
     3 needBase = clamp(base.count − haveBase, 0, slots)
       needCurve[b] = max(0, buckets[b] − have[b]), scaled to (slots − needBase) by largest remainder   // partners (98), off-template keeps
     4 per bucket, from the score-ordered pool (every entry already has evidence):
         A locked  = tournament share ≥ lockShare with ≥ lockMinLists lists → rank order
         B combos  = completes a combo with kept cards → next, global cap 6
         C sampled = weighted sampling without replacement (w = score; Efraimidis–Spirakis; seeded) from the top ceil(left × 2)
         shortfall → nearest bucket with surplus (b−1 first) + a note
     5 base: locked first, then score; cap colorless-identity lands at maxColorlessIdentity;
         n = min(needBase, rankedByColorCount[popcount(ci)]); fillers(needBase − n) with land-template evidence
     6 budget: SQL per-card cap; report any shortfall
     7 return picks[{cardId, zone, qty, group, tier, score, evidence[]}], groups, notes, totals, seed
     ```
  5. **(new)** `src/app/api/decks/autofill/route.ts` — `POST`; zod `{ game, format, leaderIds: uuid[1..2], keep: [{cardId, zone, qty}] ≤ 500, budgetUsd?, seed? }`; 400 when the adapter declares no `autofill` (One Piece); **caching intent: force-dynamic, `no-store`** (depends on the body); **(new)** `RATE_LIMITS.deckAutofill` (20/min + 200/h per IP) in `src/lib/rate-limit.ts`; flow = facts → `cardListIssues` → ciMask → tournament candidates (200) split by `isBase` → two `gatherSignals` calls (curve pool 600 `ne` Land; base pool 150 `eq` Land) → `rankCandidates` → `buildShell` → `loadCardWires` → `adapter.validate(keep + picks)` returned as `issues`. **Writes nothing.**
- **Acceptance**: Atraxa with no kept cards → exactly 99 picks and `validate` has no errors; same seed → identical list, another seed → ≥ 15 different picks; every pick has ≥ 1 evidence entry naming a real source; a commander with no aggregate returns zero `topdeck-top16` evidence; `budgetUsd: 1` returns only cards ≤ $1 or a stated shortfall; a partner pair yields 98; a colorless commander gets Wastes; statements counted with `DB_LOG=1` (expect ~14 — the app's costliest read; record it).
- **Checks**: planner unit tests; **(new)** `scripts/autofill-smoke.ts` on dev over five commanders.
- **Risks**: generic "goodstuff" for commanders without tournament data (disclosed in the sheet; Suggestions and Cut Coach keep steering); popularity-ranked lands can over-pick five-color staples in mono decks (the colorless-identity cap, tier A's real tournament lands, and the sheet's per-group "basics only" toggle); Neon compute from rerolls — own rate bucket now, and because `buildShell` is pure a later option is returning the ranked window and rerolling client-side.

### W9b — Review sheet + editor doors (M)

- **Steps**: **(new)** `src/components/editor/autofill-sheet.tsx` (Dialog from `md`, Drawer on phones, `ModalFinalFocus` like other More-menu dialogs). Generalize `handleImport` (`deck-editor.tsx:705-718` — today it has no Undo and bypasses `applyEdit`) into `applyListSwap(entries, cards, title)` that captures the previous list and toasts an Undo that restores it with `markDirty`; Import and Autofill both use it. Doors in the empty deck `EmptyState` (`src/components/editor/deck-list-pane.tsx:245`) and the More menu (update `editor-header.test.tsx:129` again); rendered only when `adapter.recommend?.autofill` exists. Draft-safe because the API takes a snapshot.
- **Acceptance**: D8; applying to a draft mints exactly one deck on the following autosave; Undo restores the prior list and autosaves; Reroll never dirties the deck; the One Piece editor shows no Autofill door; Import gains the same Undo.

### W9c — Doors: Surprise me · hub · combos (M)

- **Steps**: **(new)** `GET /api/leaders/random?game=` — **`no-store`**, own rate bucket, legality `NOT EXISTS` filter (`loadLeaderIndex` does not exclude banned commanders, `src/lib/hub/queries.ts:274-280`); Magic samples the top N by popularity, One Piece samples uniformly. "Surprise me" on the Magic card in `src/app/decks/new/new-deck-chooser.tsx` and on home (`?surprise=1`, latched like `leader`); hub CTA row "Start with a starter shell" (`&autofill=1`, latched; opens the sheet, never auto-applies). `ComboRadarPanel` gains **With your commander**, fed by **(new)** `GET /api/cards/[id]/combos?fit=<mask>` over `loadCombosForCard` — **public, `s-maxage=3600, stale-while-revalidate=86400`**, fetched once per leader change (the `useLeaderArt` pattern), so it works in a seeded draft with no deck row and adds no per-edit request; "in deck" marks computed client-side. **Add N pieces** = **one** resolve call by `externalKey` (pass 0) — the resolve limit is 20/min — and one toast; **Build around** opens the sheet with `keep` = pieces.
- **Acceptance**: Surprise me twice gives two different legal commanders and no deck rows until Accept; "Build around" returns a shell containing every combo piece, labeled "Combo piece"; the hubs' pinned CTA text/href are untouched.

### W10 — Tournaments v1 (M)

- **Steps**: **(new)** `src/app/(site)/tournaments/page.tsx` (**force-dynamic**; `?game=`, `?leader=`; `GameSwitch` with custom hrefs; reads via `tournaments_game_date`); **(new)** `src/app/(site)/tournaments/[id]/{layout,page,loading}.tsx` (the **ISR** trio, `revalidate = 86400`, `generateStaticParams → []`, id regex `^\d{1,9}$`, `robots: { index: false }`); `src/lib/tournaments/queries.ts:54-71` selects `tournaments.id` and gains an event loader returning leader `{ name, slug }` pairs; hub shelves add the internal link and "All {n} finishes →" while **keeping the external event link on every row**; `BROWSE_LINKS` + both header-test arrays; sitemap lists the index only. Run `pnpm typecheck` (it runs `next typegen`) before relying on `PageProps<"/tournaments/[id]">`.
- **Acceptance**: D9; both pages render from `tournaments` + `tournament_standings` only; `hubs-smoke:163-166` and `:262-265` still find the Topdeck / Limitless URLs; One Piece events show the Limitless credit and ©BANDAI posture lines where leaders render.

### Appendix to E

**Where `kind` matters (W8a)**

| Place | Treatment |
|---|---|
| `src/lib/decks/collections.ts:65-70` (home rail) · `src/lib/hub/queries.ts:182-188` (hub shelf) | add `kind = 'user'` |
| `scripts/purge-anon-decks.ts:47-55` | **guard with `kind = 'user'`** — precons are ownerless by design |
| `scripts/backup-user-tables.sh:19` | add `precon_products` (forks, likes, bookmarks reference precon ids) |
| `scripts/combos-smoke.ts:162-164` | add `kind = 'user'` so it keeps matching the shelf |
| `src/lib/decks/serialize.ts` | expose `kind` on the wire |
| `src/app/sitemap.ts:29-32` · `src/lib/og/data.ts:40` | **keep precons in** — indexable pages with OG images |
| `/u`, `/f`, `/account`, sitemap profile subquery, `claim.ts`, `api/decks/mine`, `delete-account.ts`, `loadOwnerDecks` | safe by construction (owner and token are NULL); a bookmarked precon legitimately shows in `/account` bookmarks |
| `src/lib/decks/forks.ts:84-97` | inserts explicit columns → a fork of a precon is `kind = 'user'` (correct) |
| `.github/workflows/restore-drill.yml` | its identity-map coverage now spans more rows — re-run once |

**Test and smoke pin matrix**

| Package | Must update | Must stay green |
|---|---|---|
| W1 | `button.test.tsx` (+ hairline assertion); `tokens.test.ts:87-91` test name only (dark One Piece literal unchanged) | `tokens.test.ts:32-46` deep-equal + lowercase hex; `site-header.test.tsx`; `hubs-smoke` `aria-label="Deckwarden"` |
| W2 | `tokens.test.ts:90`, `og/labels.test.ts:30` | OG checks in `seo-smoke` |
| W3 | `site-header.test.tsx:77-84` + new menu tests | `:52` negative regex; `deck-tile.test.tsx`; `profile-folders-smoke` |
| W4 | `leader-zone.test.tsx:36-52`; new intent tests | `hubs-smoke:75-84, 103-108`; `seo-smoke:339-343` |
| W5 | new route + gallery tests | `seo-smoke:287-289, 374`; `optcg-smoke:167` |
| W6 | `editor-state.test.ts` (`setPrinting`) | `deck-editor.test.tsx` create-count tests |
| W7 | `editor-header.test.tsx:129` | `seo-smoke:374` |
| W8 | `site-header.test.tsx:70-74, 95-101`; `combos-smoke:162`; `access.test.ts` | `seo-smoke:172-181` robots; engagement and forks smokes |
| W9 | `editor-header.test.tsx:129`; new `recommend/autofill.test.ts` | `mtg/recommend.test.ts:15`; `rank.test.ts`; `queries.test.ts`; `smoke:recommend` |
| W10 | `site-header.test.tsx` arrays again | `hubs-smoke:163-166, 262-265` |

**Rollback**: W1/W2 are value-and-asset commits → `git revert`. W3–W6 and W10 add UI/routes only → revert. W7 is dark unless the adapter declares `capabilities.buy`; affiliate is off unless the env var is set. W8a's migration is additive → revert code, `delete from decks where kind = 'precon'` (cascades), drop column/table, restore the old index. W9's doors render only when `recommend.autofill` is declared → removing that one declaration hides the feature.

---

## F. Deferred work and unresolved decisions

**Deferred (each becomes a `LATER.md` row with its trigger in W1 step 0)**

| Item | Why deferred | Revisit when |
|---|---|---|
| **On-site tournament decklists** (the "view deck lists" half of idea 8) — *flagged: part of an explicit request* | Card lists are deliberately not stored (Neon budget). Recommended design: write each top-16 list as a small JSON sidecar to the **public R2 bucket** at ingest (backfill from the raw Topdeck archive) and render it with the read-only deck view + "Open as draft" — zero Neon bytes. Needs Topdeck's terms confirmed for rendering full lists. | W10 is live and someone asks for lists, **and** the terms allow it; ideally after `img.deckwarden.gg` replaces r2.dev |
| **One Piece starter decks in Precons** — *flagged* | No source with quantities (punk-records has set membership only) | You hand-enter ~30 lists into `data/optcg/starter-decks.json`, or a source appears |
| **One Piece autofill** — *flagged* | No popularity signal, no leader×card aggregate; faking it breaks the cold-start rule | LATER row 59 (One Piece aggregate from Limitless lists) fires |
| **Affiliate links** (TCGplayer via Impact; Card Kingdom by contact) | Vercel Hobby is non-commercial | The VPS/Pro move (LATER row 80); then one env var + disclosure |
| Exact-printing buy links (`tcgplayer_id` on `card_printings`) | Migration + mapper change + full re-map for a marginal gain over name search | W6 usage shows people choose printings, or conversion starts to matter |
| "Public profile ↗" in the account menu | The client session has no `username`; needs Better Auth `additionalFields` + a session refetch (cookie cache ≤ 300 s stale) | After W3, if you want it — S |
| In-editor commander picker dialog (no navigation) | You asked for the browse page; W4 delivers it with a way back | Players bounce on the round trip, especially on phones |
| Indexable event pages; pretty `/precons/<slug>` URLs | Thin pages with player names; `/d/p_<slug>` is already readable | Search Console shows demand |
| "Chaos mode"; total-deck budget; client-side reroll; theme hints (tribal/keyword matching) | You chose the evidence-based shell; per-card budget tiers match Suggestions; theme hints are inference from card text, adjacent to the "no role inference" rule | Someone asks twice / shell-quality feedback / Neon compute from rerolls shows up |
| Bulk multi-select on `/account` | One-at-a-time covers today's deck counts (cap 100) | A user manages dozens of decks |
| Hand-written precon blurbs | Generated factual summaries ship first; WotC marketing copy is never copied | You want editorial voice on the newest products |

**Unresolved decisions (defaults chosen; tell me if you disagree)**

| Decision | Default in this plan | What would change it |
|---|---|---|
| Serif face | **Literata** (sturdy, screen-first, close to the crest's wordmark) | You have the crest's actual font, or prefer Source Serif 4 / Fraunces — one `next/font` line + one TTF |
| Serif modal titles | **No** in W1 (`--font-heading` stays sans); decided in W2's audit | If titles-everywhere-serif looks right in the dev pass, it is one line |
| One Piece accent | Dark teal **kept**; light → cyan `#0a6587` | If you want one hue in both themes, accept a closer neighbor to either brand green or One Piece Blue |
| Header mark on phones | Crest at 32 px | If it muddies on real devices, use the `shield` variant below `sm` |
| Folder `<select>` on account tiles | Replaced by the menu's submenu | If you file decks often enough to want it one click away, keep both |
| Precon legality flags | Shown honestly (older precons may contain now-banned cards) | If you would rather hide the validation line on precons |
| `favicon.ico` | Regenerated once from the shield SVG (`pnpm dlx png-to-ico`, no new dependency) | If you prefer no binary: delete it and add an `icon.tsx` PNG via `ImageResponse` |

---

## G. First implementation package — W1 "Brand foundation"

**Why first**: the site is unannounced; every later package should be built on final tokens; and the blast radius is measured — indigo literals live in six files (`src/app/icon.svg`, `src/app/globals.css`, `src/components/brand-mark.tsx`, `src/lib/theme/tokens.ts`, `src/lib/og/elements.tsx`, `src/lib/og/labels.test.ts`), `text-primary` in two `link` variants, bare `bg-primary` fills in four places, and no component uses a `*-brand` utility directly yet.

**Expected visible result**: the header shows the green/gold crest beside a serif "Deckwarden"; the browser tab shows the shield; links and focus rings are gold on a green-charcoal dark theme; primary buttons are forest green with a gold hairline; the light theme is ivory; page titles and section headings on site pages are Literata; Magic surfaces still accent in lavender and One Piece in teal; the builder's dense UI is unchanged apart from color.

**Scope (in order)**

0. **Contract** (*landed note, 2026-09-19: `WAVE2.md` itself is already in the repo, committed with `W1-session-prompt.md`; the rest of this step is still W1's*): build plan §6c table (W1–W10); one CLAUDE.md line ("Wave-2 packages (Wn from `WAVE2.md`, build plan §6c) count as work packages"); a REDESIGN.md addendum recording that W1 **supersedes** §1's "brand is the indigo" and "Typography stays Geist", §2's "Choose commander … focuses search" (W4), and the `BrandMark` docblock; section F as `LATER.md` rows. (`*.md` is in `.prettierignore`, so docs cannot fail the format check.)
1. **Tokens**: write D0's table into `src/app/globals.css` (`:root`, `.dark`) and `src/lib/theme/tokens.ts` in the same commit; add `gold` to both token objects and both blocks, plus `--color-gold: var(--gold)` and `--font-display` in `@theme inline`. `og.accentGeneric` waits for W2. Rename the test at `tokens.test.ts:87-91` ("teal/indigo") — its One Piece literal is unchanged.
2. **Fills and links**: `src/components/ui/button.tsx` default variant gains `border-gold/70` (after the base classes); `link` variants in `button.tsx:20` and `src/components/ui/badge.tsx:17` → `text-brand`; `src/components/ui/progress.tsx:39`, `meter.tsx:43`, `avatar.tsx:55` → `bg-brand`; check `src/app/global-error.tsx:43` by eye. Add a hairline class assertion to `button.test.tsx` — a primary button that loses its border is invisible on dark.
3. **Mark**: `src/components/brand-mark.tsx` gains `variant: "crest" | "shield"` with literal crest colors (rewrite the docblock); `src/app/icon.svg` = shield; regenerate `src/app/favicon.ico` (16 + 32) once from it; `src/components/deck/validation-panel.tsx:73` uses `shield`; `site-header.tsx` and `editor-header.tsx` use `crest` at `size-8`. Delete the five unreferenced Create-Next-App SVGs in `public/` (verified zero references).
4. **Type**: load Literata in `src/app/layout.tsx` (read the installed font docs first — AGENTS.md); apply `font-display` to the wordmark (`src/components/site-header.tsx:38`, also 18 px), the ~17 `<h1>` sites and site-page section `<h2>`s, `src/components/empty-state.tsx:31`, and the Warden lines (`validation-panel.tsx`, `src/components/warden-not-found.tsx`, `src/app/error.tsx`). Leave `--font-heading` and every builder pane alone.
5. **Details**: `::selection`. Everything else (OG, manifest, apple icon, band gradient, the audit) is W2.

**Out of scope**: layout changes, OG artwork, new routes, any feature work.

**Completion checklist**

- [ ] `pnpm check` green — `tokens.test.ts` (both blocks deep-equal `tokens.ts`; lowercase hex), `button.test.tsx` (hairline), `site-header.test.tsx` (link still named "Deckwarden" → `/`), `completion-ring` / `leader-zone` tests untouched.
- [ ] `grep -rniE "#4f46e5|#4338ca|#6366f1|#818cf8|#a5b4fc|#312e81|#eef2ff|#c7d2fe|indigo" src` → hits only in OG code reserved for W2 (`og.accentGeneric` in `tokens.ts` with its two test literals, and `src/lib/og/*`).
- [ ] Dev pass, both themes, 390 and 1440: header, home, a hub per game, a card page, a deck page, the editor per game, one dialog, the 404 — crest legible at 32 px, shield legible at 16 px (tab + Warden line), focus rings visible (gold / lavender / teal by surface), primary buttons readable with the hairline, meters and avatars visible (brand fill). Spot-check one OG route: it repaints on the new dark canvas through `og.bg`.
- [ ] `pnpm build`: `/c/[slug]`, `/l/[slug]`, `/cards/[id]` still `●`; no route changed type; no header shift from the font swap (fixed line-height; `adjustFontFallback` default).
- [ ] `smoke:seo`, `smoke:hubs`, `smoke:optcg`, `smoke:engagement` green on dev (pins: hero, titles, `aria-label="Deckwarden"` on the 404, `♥`, ©BANDAI).
- [ ] Deployed; Vercel status success (GitHub commit status, context "Vercel"); prod spot-check of home, one hub, and the editor draft in both themes.
- [ ] Ship note + `LATER.md` rows written; memory updated.

---

## Verification (whole wave)

- Every package: `pnpm check`; the listed smokes on **dev** (never `smoke:seo` against prod — it mints fixtures; read the deck-create counters before any prod smoke; `pnpm counters:reset` exists for local loopback counters); `pnpm build` route-table diff (ISR routes stay `●`); a dev pass at 390 / 768 / 1200 / 1440 in both themes with reduced motion toggled; deploy; confirm via the GitHub commit status.
- Browser-pane caveats already learned: a hidden pane pauses rAF and never fires `matchMedia` change events (verify menus/toasts via DOM or jsdom; reload after resizing); Base UI menus need pointerDown + mouseDown + click in RTL.
- Data packages (W8a, W9a): `pnpm db:size` before/after, recorded; statements counted with `DB_LOG=1`.
- Traceability: idea 1 → W5, W6 · 2 → W4 · 3 → W9c · 4 → W3 · 5 → W3 · 6 → W9a–c · 7 → W8a–b (One Piece deferred) · 8 → W9b–c + W10 (on-site lists deferred) · 9 → W7 (affiliate deferred) · 10 → W1–W2.

---

## Progress tracker

Tick a package with its date and sha when it ships; record deviations from this contract beside the tick (the way `REDESIGN.md` §6 does), not by rewriting the sections above.

- [x] Plan approved by the owner; contract landed in the repo with `W1-session-prompt.md` (2026-09-19).
- [x] W1 — Brand foundation (2026-09-19: step 0 docs `4b21d00`, feat `e40342d`; D0 shipped **verbatim** — no token deviations; ship note in `W1-session-prompt.md`. Small implementation decisions recorded there: primary hover = the house color-mix idiom, Badge's unused default variant got the same hairline, avatar badge text → `text-background`, `favicon.ico` hand-assembled 16+32 PNG-in-ICO because `pnpm dlx png-to-ico` emitted a 285KB four-size file, `global-error`'s h1 stays sans — that shell loads no font variables.)
- [x] W2 — Brand completion (2026-09-19: feat `ce9d7c2`; OG crest + Literata wordmark on all four routes, `og.accentGeneric` → `dark.gold` (indigo grep over `src/` = 0), manifest + 192/512 + apple icon (committed qlmanage binaries, W1 precedent; `purpose: "any"` only — maskable to LATER), single `themeColor` in root + both editor viewports, band gold rule + generic green→charcoal via a `[[data-game]_&]` variant, both-theme audit clean, serif modal titles DECLINED (`--font-heading` stays sans). One discovery forced a plan deviation: this Next's `@vercel/og` **replaces** its default font when `fonts` is passed (`options.fonts || defaultFonts`), so `assets/fonts/` carries Geist-Regular (the bundled default's own bytes) beside Literata-SemiBold, both OFL'd. Ship note in `W2-session-prompt.md`.)
- [x] W3 — Account menu + deck quick actions (2026-09-19: feat `0da07cc`; D1 + D2 shipped — shared `useSignOut` hook, hand-written `ui/context-menu.tsx`, one `deck-action-items.tsx` behind ⋯ and right-click, visibility radios with optimistic PATCH + 5 s Undo + revert (no refresh), folder radio submenu replacing the `<select>` (file deleted), AlertDialog delete with Cancel focused. Deviations recorded in `W3-session-prompt.md`'s ship note: ⋯ sits in the tile's actions row bottom-right (the sanctioned slot; the D2 sketch drew it top-right), not the home rail; the signed-in menu is its own `AccountMenu` component so the guest branch never touches useRouter (the error/404 shells render the header routerless); folder moves toast without Undo (the refresh-regroup is the feedback); submenu triggers open on hover/keyboard only (Base UI ignores mouse clicks on them by design). Signed-in browser-pane checks disclosed as RTL-covered — no dev session existed, the R1b precedent.)
- [ ] W4 — Choose-commander flow (+ `/commanders?q=`)
- [ ] W5 — Card-page printings gallery + printings API (+ default-printing fix)
- [ ] W6 — Editor printings ("Use this printing in deck")
- [ ] W7 — Buy links (plain; affiliate env stays empty on Hobby)
- [ ] W8a — Precons data (migration, MTGJSON ingest, `kind` guards)
- [ ] W8b — Precons surfaces (`/precons`, share-page meta, Start from this precon)
- [ ] W9a — Autofill engine + API
- [ ] W9b — Review sheet + editor doors
- [ ] W9c — Doors: Surprise me · hub · combos
- [ ] W10 — Tournaments v1
