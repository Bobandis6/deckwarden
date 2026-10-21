# DECKCHECK-STUDY session prompt: what to take from deckcheck.co, proven on deckwarden's own build

> **RAN 2026-10-21 (UTC) — results in `DECKCHECK-STUDY.md`; the intro's build prompt is `HOME-INTRO-session-prompt.md`; GATE 2 decided the same day: session prompts for all four proposed packages (HOME-INTRO, BRACKET-SPEED, BRACKETS-PAGE, DECK-PREVIEW-BRACKET).** One correction to this prompt: §2.2's premise that the ruleset text places an unmodified precon in Bracket 2 is wrong; the text the repo holds says precons are no longer tied to Core (`bracket-ruleset.ts:11-12`, `WAVE4.md:128`), see the study's §2.2. And the tournament population is not cEDH by construction: the Topdeck feed's "EDH" format mixes casual, budget, bracket-capped and precon events (LATER row 296).

Rewritten 2026-10-20 from the owner's request ("reverse engineer deckcheck.co; I like the deck images, the bracket features, the threat index, and the home-page intro animation, which should play once per visit and not on every return to home"). Baseline `main` = `1e1576b`; record HEAD when you start. This is a docs-only study session: nothing under `src/` changes here. The one build it specifies (the home intro) is the next package, with its own prompt written by this session.

## 0. Read before anything

CLAUDE.md, `deckwarden-build-plan.md` §6f, REDESIGN.md "U5 decisions", WAVE5.md D6, DESIGN-LAB.md §D4, LATER rows 27, 49, 50, 210, 230, 249, 251.

Code: `src/app/(site)/page.tsx` (the h1 at 96, `HeroFan` at 117, `force-dynamic`), `src/components/home/hero-fan.tsx`, `.home-fan` in `src/app/globals.css` (725 to 758), the U2 tokens (94 to 160) and the reduced-motion backstop (438 to 446), `src/components/cards/card-image.tsx` (priority = no fade), `src/lib/decks/leader-pick-intent.ts` (the sessionStorage discipline: `useSyncExternalStore`, a null server snapshot, a pure parser), `src/components/theme/theme-provider.tsx` (the pre-paint script precedent), `next.config.ts` line 97 (`script-src 'self' 'unsafe-inline'`, pinned verbatim in `src/lib/next-config.test.ts`), `src/app/(site)/page.test.tsx` (`fanAndShelf` pins the fan's server HTML), `src/lib/games/mtg/{brackets,bracket-line,bracket-ruleset}.ts`, `src/lib/decks/precon-brackets.ts`, `src/lib/og/`.

Memory notes: u5-home-b-live, u3a-deck-pane-bones-live (the LCP and layout-shift recipes), u1-controls-live and u10a-form-primitives-live (the measuring browser is Chrome for Testing through the chrome-devtools MCP), csp-enforcing-live, browser-pane-hidden-input, deckcheck-reference-boundaries.

## 1. The boundary (settled; not for discussion)

deckcheck.co's Terms of Service (`/tos`, read 2026-10-20) prohibit access "through scraping, crawling, spidering, browser automation, bots, scripts, data mining, bulk extraction, automated account creation, reverse engineering, undocumented endpoints, or any other automated method" beyond robots.txt indexing, and grant no right to copy or to build derivative products from its content. Its `robots.txt` disallows `/api/`. Therefore:

- The OWNER opens deckcheck pages by hand, in the built-in browser pane or their own Chrome. The session never navigates to, clicks on, fetches or scripts deckcheck.co; runs no REA browser tool against it (`capture_browser_scenario`, `observe_web_session`, `export_web_scripts`, `analyze_web_bundle` are for deckwarden's own build, §3); touches no `/api/` path; walks no sitemap; creates no account.
- The session reads only what the owner's one browser session already received: `read_page`, `get_page_text`, and `javascript_tool` for `document.getAnimations()` and computed styles on the page the owner opened. Pages worth opening, all public: `/`, `/commander-brackets`, `/blog/deckcheck-threat-index`, `/blog/on-power`, `/app/precons`, and one public deck page the owner picks. That is the whole list.
- Nothing from deckcheck enters the repo: no copy, no CSS, no benchmark names or tiers, no share-image look, no timings copied as such. The ledger records measurements, structure, and the question each feature answers; deckwarden's version is designed from deckwarden's own material (§2).
- Every deckcheck page opened goes in the ledger with who opened it and when. Eleven requests were made with curl on 2026-10-20 by the session that wrote this prompt, before it had read the terms (the home page, robots, three sitemap files, the terms, the brackets page, the threat-index post, one deck page, the stylesheet, the deck-card script). List them as such; do not repeat them.
- GATE 1: the session reaches this far, records the baseline numbers (§2.1), and stops for the owner before any deckcheck page is opened.

## 2. The four questions

Each is answered with observation, inference and unknown kept apart (REA's discipline), from the raw material named, with the external check named.

### 2.1 The home intro (the one build this study specifies)

Raw material. Deckcheck: the inline stylesheet its home page sends to every visitor, which the owner's browser already holds: six keyframes; each h1 word 600 ms (a 6 px blur and a 0.25 em rise to clear) at 200 ms steps; the accent word's sweep, glow and sparks at 1250 ms; the lede's 700 ms rise at 2000 ms; the buttons and the "newest deck" card 800 ms at 2400 ms with a 140 ms stagger (a 10 px blur, scale 0.92, an accent ring), ending near 3.3 s; `animation: none` and the sparks `display: none` under reduced motion; no once-gate, because every visit there is a full document load (a multi-page site). Deckwarden: `hero-fan.tsx` and `.home-fan` (three `priority` cards in an explicit-height box, side cards 14 % lower so the center never covers an artist/© strip), the h1's per-tier max-width (the font-swap reflow fix, row 251), U2's `--ease-settle-*` curves and `dw-in`, the 0.01 ms reduced-motion backstop, the `force-dynamic` home (every client-side return to `/` refetches the page and remounts `HeroFan`), the CSP (`'unsafe-inline'` allowed), next-themes' pre-paint script, and the server-HTML pins in `page.test.tsx`.

Baseline first (GATE 1 input). On a production build (`pnpm build && pnpm start`, never dev) in Chrome for Testing through the chrome-devtools MCP, at `1440x900x1` and `390x844x3,mobile,touch`: a trace of the first load (the LCP element and time from the `largestContentfulPaint::Candidate` events; every layout-shift entry with its source node, as U3a did), then a client return (the header wordmark to `/`), a reload, and a bfcache back; `document.getAnimations().length` after each; the same under `emulate` with `prefersReducedMotion`. Add the cold production numbers after the next deploy (row 249: about 1.9 to 2.0 s at 1440 cold, 720 ms warm).

Method. REA on deckwarden's own build: `list_browser_targets` on the DevTools Chrome, then `inspect_web_page` or `observe_web_session` on `/` to record what hydrates and what animates on the first load and on the return; `analyze_web_bundle` on the home chunk to confirm no new dependency (no Motion, no GSAP: CSS only). Decide the gate with evidence, from three candidates: (a) a module-level flag plus sessionStorage behind a `useSyncExternalStore` store (the `leader-pick-intent.ts` pattern) whose SERVER snapshot is "play", so the server HTML is unchanged and the client return is silent, but a reload replays unless (b) a pre-paint inline script reads sessionStorage and sets `data-intro="done"` on `<html>` (next-themes already runs one; the CSP allows it; the fan's markup and its test pins are untouched); (c) a session cookie the server reads (no flash and no inline script, but a new cookie the privacy page must list). The replay matrix the chosen gate must satisfy: first load in a tab = play; client return = no; reload = no; bfcache back = no; new tab = play; reduced motion = never. Say which candidate wins and why, with a screenshot sequence at 4x CPU as the flash evidence.

Spec constraints the next package inherits: transform and opacity only, with no `filter: blur` on the 280 px cards (argue the h1's 6 px blur in or out with a trace, not with taste); the fan cards never start at opacity 0 and never carry a delay (the rotated side card is the LCP element at 1440, the h1 at 390); the whole choreography ends inside 1.2 s with the "Build a deck" button usable from the first frame (deckcheck's 3.3 s is the thing not to copy; Taste §4.7 and the repo's 250/400 ms slots agree); U2 tokens only; the side cards' artist/© strips never covered mid-motion (U5's elementFromPoint check, run at the midpoint); no CLS (the fan box keeps its explicit height); the h1 keeps its max-widths.

External check. The production-build trace before and after: the LCP element unchanged and its time within run-to-run noise of the baseline; CLS unchanged; `document.getAnimations()` = the intro set on the first load and 0 on return, reload and bfcache, 0 under reduced motion; Lighthouse on the same build; vitest pins (the gate as a pure function fed raw sessionStorage strings, like `parsePickIntent`; `page.test.tsx`'s server-HTML pins untouched); `pnpm check`; the route table unchanged.

Deliverable. `HOME-INTRO-session-prompt.md`: the baseline numbers, the gate decision, the keyframes in the repo's tokens (duration, delay and curve per element), the replay matrix as the test list, and the LATER rows it closes or opens (230 is adjacent). Not implemented here.

### 2.2 Brackets: what deckcheck's bracket surface does that deckwarden's does not, judged against the official text

Raw material. The official Commander Brackets text and the Game Changers list as the repo holds them (`bracket-ruleset.ts`; `BRACKET_SOURCES`, the feeds and the freshness rule in `brackets.ts`), not either site's explainer; deckwarden's read (`assessBracket`, `mtgBracketLine`, `mtgBracketBands`, `mtgBracketTable`, the bracket sheet, `MTG_BRACKET_QUESTIONS`) and its two labeled populations in the database: the precon lists (`precon_products`; the ruleset text places an unmodified precon in Bracket 2, so quote that clause) and the tournament lists the Topdeck ingest stores (`tournaments`, schema.ts 839; cEDH by construction). Deckcheck, as a user: `/commander-brackets` (five levels, the Game Changers list, an FAQ, a per-level template) and the level, written breakdown and gates on the deck page the owner picks.

Method. A scratch script in `scripts/.tmp/` (first import `../smoke/guard`; `guardDatabaseUrl()` on the line after `loadEnv`; `.env.local` names the Neon dev branch) runs the read over every precon (the /precons loader from row 151 already does; reuse it) and every tournament list, and tabulates status, minimum, suggested and open calls. The calibration: precons read 2 or "1 to 2", tournament lists 4 or 5; list every misordering with its cause (a missing attribute, a stale feed, an open call). Spot check: the owner runs two or three of the same lists through deckcheck by hand and the session writes their level beside deckwarden's. That is a spot check, not a dataset.

External check. The official text and the two populations. Deckcheck's "more accurate than other sites" claim is not evidence; the same lists are.

Deliverable. In `DECKCHECK-STUDY.md`: one table of what each surface shows (level, explanation, gates, sources, freshness, what it asks the owner), the calibration result, and at most two proposed packages with triggers.

### 2.3 Threat index: decide whether deckwarden wants a number before designing one

Raw material. Deckcheck's own public description (the owner opens the post): twelve benchmarks in five groups, each graded in tiers by an AI scan, summed with weights into a 0 to 100 index, gates that raise bracket placement, and a median across scans because scans of the same list disagree. That grader is not observable and not reproducible; there is nothing to reverse engineer, only a shape (a few named axes, tiers rather than decimals, an explanation and a card list per axis, tied to the official bracket). Deckwarden's raw material for axes of its own: the Y3a attributes (game_changer, mld, extra_turn), the 17 Tagger roles (Y7a), Spellbook combos, curve and colour data, `commander_stats`, the goals (Y4b), and the two populations of 2.2.

Method. The same scratch script computes three to five candidate deterministic axes over both populations; an axis earns its place only if it separates precons from tournament lists and moves the right way on a known upgrade (a precon against an upgraded list of the same commander in the database, where one exists). Tiers in the table voice (Y5), Y1's honest-labels stance, U9's copy policy.

External check. The two populations; the no-paywall rule (card data and prices never gated); "Reads the card list only" stays true of whatever is proposed.

Deliverable. A one-page decision memo in `DECKCHECK-STUDY.md`: build deterministic axes, do not build, or defer, with the numbers and with what a player would DO with the result that "At the table" and the bracket line do not already let them do. No code.

### 2.4 Deck images

Raw material, as a user. Deckcheck's per-deck share image (a generated PNG under a template name) and its deck card tile (the commander's art crop, lazy, empty alt, no artist line anywhere in the renderer). Deckwarden: `src/lib/og/` (JPEG previews, the generic image for a private deck, off ISR since 847e999), DeckTile (R5a), SurfaceHeader's credit (R5b), the art resolver (R2), D0's artist/© rule, rows 27, 49 and 50, the ISR write budget (8 KB units; every deploy wipes ISR), the img host's immutable keys.

Method. A side-by-side spec of the tile and the share image (dimensions, crop ratio, type, where the credit sits) against deckwarden's current preview for a deck of the same shape; cost each option against the ISR budget and the Scryfall image guidelines.

External check. D0 (artist and © visible near any art crop; the treatment seen on deckcheck is not available to deckwarden), the budget numbers, the guidelines.

Deliverable. One proposed package, or a LATER row with its trigger.

## 3. Tools and their scope

- The chrome-devtools MCP on Chrome for Testing for every number (traces, `emulate`, `lighthouse_audit`, `evaluate_script` with helpers saved as `*.js.txt`). The built-in pane is hidden-input-prone (screenshot first, measure after) and is the owner's window onto deckcheck, nothing more.
- REA for deckwarden's own shipped artifact only (§2.1); every conclusion cites Evidence IDs; observed, inferred and unknown stay separate.
- Skills: `design-taste-frontend` for the home page read (§11, preserve mode; it excludes product UI, so not the deck page or the bracket sheet); `emil-design-eng` and `apple-design` for the motion spec (the repo animates with CSS and U2's tokens, so Taste's Motion and GSAP skeletons do not apply); `web-design-guidelines` once over the finished spec.
- Scratch scripts in `scripts/.tmp/` with both guards; never `cd`; evidence under `.claude/deckcheck-study-evidence/`; production database reads need the owner's OK in the chat.

## 4. Deliverables and gates

1. `DECKCHECK-STUDY.md`: the ledger (every deckcheck page opened, by whom, when; the eleven earlier requests), §2.1 to §2.4 with their evidence, the proposed packages with triggers, the LATER rows added.
2. `HOME-INTRO-session-prompt.md` (§2.1).
3. LATER rows for anything out of scope; one CLAUDE.md line under Hard rules recording the §1 boundary, if the owner says yes at GATE 2.
4. One docs commit on `main`; `pnpm check` green; no change under `src/`.

GATE 1 after §1 and the baseline. GATE 2 after §2, where the owner picks which packages get prompts. A package ends deployed and `pnpm check`-green or it is not done; this study ends at GATE 2 with its prompt(s) written.
