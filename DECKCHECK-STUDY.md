# DECKCHECK-STUDY — what to take from deckcheck.co, proven on deckwarden's own build

Run 2026-10-20/21 (UTC dates below) from `DECKCHECK-STUDY-session-prompt.md`, baseline `main` = `1e1576b` (production served the same sha: Vercel success 2026-10-21T03:06:35Z). A docs-only study: nothing under `src/` changed (a throwaway prototype was built, measured and reverted; the route table of the clean rebuild is identical to the baseline's). Raw evidence is under `.claude/deckcheck-study-evidence/` (gitignored, local to the owner's machine). Observation, inference and unknown are kept apart in each section: **Observed** is what a tool returned, **Inferred** is what the session concluded from it, **Unknown** is what neither settles.

## 0. Ledger

**The boundary held** (§1 of the prompt): deckcheck.co's Terms forbid automated access and reverse engineering, and its API page forbids using the API or the public pages to build a competing deck database, search, recommendation or analytics product without written permission. This session never navigated to, fetched, clicked or scripted deckcheck.co, touched no `/api/` path, ran no REA tool against it, and copied no CSS, copy, benchmark name or tier into the repo. It read only pages the owner opened by hand.

| When (UTC) | Who | What | How it was read |
|---|---|---|---|
| 2026-10-20, before the terms were read | the session that wrote the study prompt | eleven `curl` requests: the home page, `robots.txt`, three sitemap files, the terms, the brackets page, the threat-index post, one deck page, the stylesheet, the deck-card script | recorded in the prompt's §1 and the memory note `deckcheck-reference-boundaries`; not repeated |
| 2026-10-21 ~04:31 | the owner, by hand, in this session's browser pane | six tabs, all `/` (three different "newest deck" cards) | `get_page_text` on each; `javascript_tool` on one: `document.getAnimations()` and the deck tile's image attributes and computed styles |
| 2026-10-21 ~04:35 | the owner, by hand, re-pointing tabs 2 to 6 | `/commander-brackets`, two public deck pages (a Marchesa list, the owner's pick, and a Bello list; their ids are in the local evidence ledger, not here), `/docs/api` (not on the prompt's list; the owner opened it), `/blog/deckcheck-threat-index` | `get_page_text` on each |
| 2026-10-21 | the owner | deckcheck tabs also open in the DevTools Chrome (Chrome for Testing) | their titles appeared in the DevTools MCP's page list; the session never selected, read or scripted them |
| 2026-10-21 | this session | Claude in Chrome | one `tabs_context_mcp` call (no tab group; the extension cannot see the owner's own tabs); nothing opened or navigated |

Not opened: `/blog/on-power`, `/app/precons`. The owner asked mid-session to "explore the API"; it was explored from the documentation page only (section 2.5), never called.

## 2.1 The home intro

**Observed, deckcheck** (the owner's tab, `getAnimations()` after load, viewport 955×946×2): 17 animations, 16 of them the intro (finished, `fill: both`) and one infinite caret blink elsewhere on the page. Six headline-word animations at 200 ms steps (600 ms each, animating opacity, `filter` and transform), the accent word's sweep and glow at 1,250 ms (1,200 ms), six spark animations from 1,310 to 1,710 ms (800 ms), the lede at 2,000 ms (700 ms), the lower block at 2,400 ms (800 ms); the last ends at 3,200 ms. It is a multi-page site, so every visit is a document load and the intro replays every time; there is no once-gate to copy.

**Observed, deckwarden** (production build of `1e1576b`, Chrome for Testing 155 through the chrome-devtools MCP, 1440×900×1 and 390×844×3 touch; the full tables are `.claude/deckcheck-study-evidence/GATE1-baseline.md`):
- No intro exists: the hero runs 0 animations on first load, client return, reload, back and reduced motion at both widths. A client return re-runs CardImage's lazy fade on 23 shelf, rail and tile images; reduced motion's 0.01 ms backstop turns style changes into `transitionrun` events. Any check must count the hero, not the page.
- Home is never restored from the back/forward cache (`Cache-Control: private, no-cache, no-store…`; `notRestoredReasons`: masked, `response-cache-control-no-store`, `response-cache-control-no-store-with-js-network-request`). Back is a fresh document load.
- A client return refetches `/?_rsc=…` and remounts the hero (`cacheComponents` is off, so nothing is kept in `<Activity>`).
- LCP: a turned fan card at 1440, the H1 at 390. Local, 4x CPU + Fast 4G, cache bypassed: 1440 1,083 / 1,067 ms, 390 939 / 829 ms. Production, same throttle: 1440 cold 2,734 ms (the first hit's HTML came late: 1,511 ms load delay) and 1,700 ms, warm 512 ms; 390 cold 1,040 / 728 ms (row 249 had 1,924 / 2,036 cold and 720 warm). CLS 0.00; one 0.00002 entry when Geist moves the desktop nav 10 px.
- On a cold cache the fan's images paint 500 to 740 ms after the H1.
- REA: `inspect_web_page` on the local build (evidence `ev_6fc08212…`) listed 34 scripts (30 chunks, 4 inline: next-themes' pre-paint script first in `<body>`, the JSON-LD, Turbopack's chunk list, the RSC payload) and no storage in a clean profile; `observe_web_session` keeps only cross-document lifecycle, so it saw no document load across a client return (the DevTools reading is the evidence there); `analyze_web_bundle` closed its connection twice on this page (34 scripts, about 2.2 MB), so "no motion library" stands on a static grep instead: none in `package.json`, none of 57 built chunks names framer-motion, motion/react, gsap, animejs, react-spring or lottie.

**The gate, decided with a prototype** (throwaway code on a local production build, measured at 4x CPU with a per-frame sampler and trace filmstrips; reverted; the diff is kept as evidence):
- **(a) `useSyncExternalStore`, server snapshot "play": rejected.** On every reload and back the server HTML starts the intro and hydration cuts it: the H1 at opacity 0.775 and 6.6 px low at 714 ms, final one frame later at 765 ms; the filmstrip frame at 608 ms shows the dimmed, lowered hero that the no-intro control never shows.
- **(c) a session cookie: rejected on the matrix**: shared by every tab of the browser session (a new tab would not play), sent with every request, one more thing the privacy page must list.
- **(b) a pre-paint inline script in the root layout: chosen.** First load paints the from-state first (no flash); reload and client return show 0 hero animations with the H1 at full opacity from the first frame. The root layout is never re-created by a client navigation, which matters because React 19.2 makes a client-inserted `<script>` inert and logs an error for it in development.

**The spec** (in `HOME-INTRO-session-prompt.md`): the H1 and the sentence settle 0.3 em up from half opacity over 400 ms on `--ease-settle-400` through U2's `dw-in`, the sentence 60 ms behind; the buttons and the fan do not move; the whole thing ends at 460 ms.
- **Inferred:** the fan stays still because the intro plays on a tab's first visit, usually a cold cache, where the cards paint after a 460 ms intro is over; a uniform fan rise was measured safe anyway (0 of 124 artist and © strip points covered on each card at five points of the motion, a sampler that does find 45 covered when the drop is zeroed; LCP element unchanged).
- **Inferred:** no blur on the H1: the blur variant composited and cost nothing measurable on this Mac's GPU, but the from-state holds while hydration keeps the main thread (pending 800 to 958 ms in the 4x trace), so the LCP headline would sit blurred at first paint on a slow phone; U2 keeps motion to transform and opacity.
- **Observed:** at 390 the H1 stays the LCP element with the intro (same 45,276 px², LCP at FCP).
- **Unknown:** the blur's GPU cost on a low-end Android phone (not measured; the decision does not depend on it); how often a real first visit is warm.

The intro amends `WAVE5.md` D6 ("no entry animation") on the owner's request; the package records the amendment.

## 2.2 Brackets

**A premise corrected first.** The study prompt asked to quote "the ruleset text [that] places an unmodified precon in Bracket 2". No such text is in the repo; the text it holds says the opposite: `bracket-ruleset.ts:11-12` (read against Wizards' format page on 2026-10-02: "precons no longer tied to Core") and `WAVE4.md:128` ("precons are no longer tied to Core"), and the ruleset data has no precon field at any level. So "precons read 2 or 1 to 2" is an empirical expectation, not a rule: a precon holding a Game Changer correctly reads at least 3. (The official page itself was not re-read in this session.)

**What each surface shows.**

| | deckcheck (the owner's tabs) | deckwarden |
|---|---|---|
| Level | one bracket number and a threat score on the tile and the deck page, a band word ("low 2"), the distance to the next score band, an archetype label | the bracket line ("Bracket 1 to 2 · nothing here goes past Core", "At least Bracket 3 (Upgraded)"), a minimum from the card rules, a suggested bracket once the owner answers, bands |
| Explanation | an AI-written synopsis and a per-benchmark breakdown (not opened); a turn line ("engine ready on turn N, first must-answer threat on turn M") | the bracket sheet's table: each rule, what the list holds, which cards; "Reads the card list only; combos via Commander Spellbook." |
| Gates | the card rules as a floor; score bands; four overrides that raise placement (all AI-graded) | the card rules only: Game Changers, mass land denial, extra turns, two-card combos by Spellbook's bracket tag; tutors and fast mana never count (`brackets.ts:63`, Wizards dropped tutor limits) |
| Sources | the guide page says "Updated October 2025, per the latest WotC guidelines" and lists the 53 Game Changers | `BRACKET_SOURCES` links to Wizards' format page and list; the ruleset is versioned data (`asOf` 2025-11-05, the list pinned at its 2026-02-09 revision, md5-checked nightly) |
| Freshness | per scan (scans cost credits; a list's repeat scans are medianed) | per feed (Scryfall and Spellbook nightly), stale after 7 days, "Couldn't check" when stale |
| What it asks the owner | nothing observed; the score stands in for intent | `MTG_BRACKET_QUESTIONS` (intent: is it tuned for the cEDH metagame, do the combos come early) and the goals (Y4b) |

The five levels' allowances and minimum turns read the same on both (9, 8, 6, 4, none), as they should: both come from Wizards' page.

**The calibration** (a read-only transaction on the Neon `dev` branch; `scripts/.tmp/deckcheck-calibration.ts` with both guards; the shipped read through `tableBracket` with no answers; every feed fresh, so no result below comes from a stale feed or a missing card; parity with the /precons loader 182 of 182; full tables in `.claude/deckcheck-study-evidence/calibration/RESULTS.md`):

- **Precons (182):** 145 read exactly "1 to 2" (79.7 %), 6 more read "1 to 2" with 3 or 4 left open as a question, 29 read a firm 3 or 4, 2 are blocked by a card banned today. The 29 are the card rules working: 18 hold a Game Changer (the list as of its 2026-02-09 revision, not the precon's release date: Farewell, Seedborn Muse, Jeska's Will, Notion Thief and others), 10 hold a two-card combo Spellbook marks relevant, 1 holds clear land denial. The spread matches LATER row 151's live numbers.
- **Tournament lists: the population is not cEDH by construction.** The database stores no tournament decklists (`tournament_standings` keeps commanders and placements), so the lists came from the ingest's local raw archive (`.topdeck-raw/`, events 2026-03-05 to 2026-09-01; 20,771 lists, every card resolved). The ingest asks Topdeck for its "EDH" format, which also carries bracket-capped, budget, casual and precon events. By event name: 11,561 cEDH, 7,785 unlabeled, 1,276 casual / bracket 1 to 3 / budget, 130 precon, 19 bracket 4. Lists from events after 09-01 live only in the R2 archive, which this machine cannot reach.
- **cEDH-named lists (11,556):** 99.45 % read a firm 4; 47 reach 4 only through an open question; 17 read 3 or lower (19 at cEDH-named events, counting two lists that are half a precon). **On these lists the read is the Game Changer rule**: 99.1 % hold four or more. The 19 under-reads are 10 lists with one to three Game Changers (worst: a first-place Thrasios and Rograkh list at 3, holding 14 fast-mana cards and 9 tutors the read does not count, by design) and 9 with nothing flagged (budget-cEDH events, off-meta lists, one precon as printed at a cEDH-named event).
- **All tournament lists:** 89.2 % firm 4; of the 1,587 reading 3 or lower, 1,568 come from events that are not cEDH, where the read is right and the population label is wrong.
- **Events that state a bracket in their name** (a small, loosely enforced third population): "Bracket 2" events read "1 to 2" on 39 of 59 lists; "Bracket 3" events read 3 or "3 or 4" on 236 of 320; "Bracket 5" events read 4 on 132 of 134.

**The spot check** (the owner's two deck pages; lists saved as card names, basic counts unknown and padded to 100):

| List | deckcheck | deckwarden |
|---|---|---|
| Marchesa, the Black Rose | Bracket 2, threat 23 | "Bracket 1 to 2 · nothing here goes past Core" (minimum 1; 10 complete combos, none relevant; no open question) |
| Bello, Bard of the Brambles | Bracket 3, threat 29, "the card rules set it" | "At least Bracket 3 (Upgraded)" (minimum 3, Jeska's Will; no open question; one card did not resolve on the branch: Vibranium Dynamo) |

Both agree. Two lists are a spot check, not a dataset; the home page's three "newest deck" cards (Bracket 2, 4 and 2) had no lists to compare.

**Inferred**: deckwarden's read is right about what it reads; its two weaknesses are (1) it cannot see speed (fast mana, tutors, a lean curve), so a tuned list with few Game Changers under-reads, and (2) a "suggested" bracket exists only when the owner answers, which no list in any population had. Deckcheck answers both with an AI score; deckwarden can answer the first with facts (2.3).

**Unknown**: how the post-09-01 tournament lists read; how the read compares with deckcheck on more than two lists (a spot check by design); Wizards' current page text (not re-read).

## 2.3 Threat index: decision memo

**Decision: do not build a threat number. Build three deterministic speed facts into the bracket sheet, as facts and as a reason to ask the intent question; never as a score.**

**Observed, deckcheck** (the owner's post tab): twelve benchmarks in five groups, each graded in tiers by an AI scan, weighted and summed to a score out of 96; score bands map to brackets; four overrides raise placement; repeat scans of an unchanged list are combined by taking each benchmark's middle tier, because scans disagree. The post itself says close scores are a tie and a higher score is no promise of winning; its comment thread reports one unchanged list scanning across a 17-point range in eight scans, and a 23-point gap between the cheap and the full scan of one deck. Nothing in it can be reproduced: the grader is a model.

**Observed, deckwarden** (the calibration's axes, Tagger roles from Y7a; AUC = how often a cEDH list sits past a precon on the axis):

| Axis | Precons median | cEDH median | AUC | Best cut, precons past it | Moves the right way on a modified precon |
|---|---|---|---|---|---|
| Fast mana (ramp at mana value 1 or less) | 2 | 12 | 0.997 | 6 or more: 0 of 182 | 27 % (61 % tie) |
| Tutors | 0 | 10 | 0.992 | 4 or more: 3 | 43 % (2 % wrong) |
| Average mana value | 3.68 | 2.07 | 0.991 | 2.96 or less: 6 | **76 %** (the read: 26 %) |
| Lands | 38 | 26 | 0.983 | 33 or fewer: 0 | 64 % |
| Cheap interaction | 3 | 10 | 0.941 | 7 or more: 8 | 42 % (26 % wrong) |
| Colour count | 3 | 3 | 0.556 | — | ties |
| Interaction at any mana value | 13 | 16 | 0.619 | — | 40 % (44 % wrong) |
| Card draw | 12.5 | 9 | 0.228, the wrong way | — | — |
| *The read's minimum (reference)* | 1 | 4 | *0.997* | — | 26 % |

**Inferred**:
- The read already separates the two populations as well as the best axis (0.997), because cEDH lists hold Game Changers. A number built from these axes would mostly restate the read.
- The axes add two things the read cannot: **the gap** (of the 64 cEDH lists the read leaves below a firm 4, a lean land count catches 51 with no precon past the cut, a low curve 45) and **movement** (a modified precon's average mana value moves the right way three times as often as its bracket read does). Fast mana, tutors and the curve (lands as its twin) earn a place; cheap interaction is too noisy on upgrades; colour count, interaction at any cost and card draw do not separate.
- One false positive already shows in the spot check: Marchesa's 2.95 average mana value sits past the curve cut on a list both sites call Bracket 2. That is why the facts must stay facts.

**What a player would DO with them that the bracket line and "At the table" do not already allow**: say, at Rule 0, "it is a 3 by the cards but it is fast: 12 fast-mana cards, 26 lands, a 2.1 curve", with numbers anyone at the table can check; see a tuning pass register (the curve moves when Game Changers do not); and be asked the cEDH-intent question when the facts look tuned, so the read's "suggested" bracket finally gets an answer. None of that needs a score, an AI call or a paywall (premium never gates card data; "Reads the card list only" stays true).

**Unknown**: whether players read three numbers or skip them (only real use tells); the right wording of the nudge (Y5's table voice and U9's copy policy govern it); Tagger's coverage of fast mana (only cards Tagger tags as ramp at mana value 1 or less count).

## 2.4 Deck images

**Observed, deckcheck** (the owner's home tab, the "newest deck" card): the commander's Scryfall `art_crop` (626×457) drawn at 638×323 with `object-fit: cover` and `object-position: 50% 20%`, so the crop is cropped again; opacity 0.55 and `saturate(0.85)` under the text; `alt=""`, lazy; no artist or © text anywhere on the page (an `innerText` scan of `main` found none). The card carries the bracket level, the threat number and a price. The share image is a generated PNG under a template name (recorded on 2026-10-20 by the earlier session; not re-fetched).

**Observed, deckwarden**:
- **The share image** (`src/lib/og/elements.tsx`, `/d/[publicId]/opengraph-image`): 1200×630 JPEG (a Commander deck on the local build: 60,149 B; `src/lib/og/jpeg.ts`), the commander's `art_crop` in a 560×630 right panel (`object-fit: cover`) blended into the text column, and the credit chip "Art: … · ™ & © Wizards of the Coast" bottom right inside the image (`artCredit`). Kicker, deck name, commander, mana curve, wordmark, card count, price, and, when the owner has declared a target, a second kicker line "Bracket N (declared)" (Y5). Never the computed read: the owner decided on 2026-09-30 that tiles and link unfurls show the declared bracket only (`WAVE4.md:35`), and `src/lib/og/labels.test.ts:55-71` enforces it (the study's first draft missed this; the GATE 2 mapping found it). `force-dynamic`, never CDN-kept (`public, max-age=0, must-revalidate`), rate-limited per address (S4); a private deck gets the generic image from one statement (S8). Off ISR, so it costs no ISR write units; each unfurl is one function render.
- **The tile** (`DeckTile`, U7a): a 96 px FULL card (the `small` rendition, 96 × 134.1 px), so the artist and © line is in the pixels and nothing is cropped. LATER row 211 holds art-crop tiles: they need a batched art resolver under the statement budget and a credit chip on every crop.
- **The share page header** (U6, `SurfaceHeader`): a 280 px art-crop band with the credit chip visible: the one place deckwarden already shows a crop at size, credited.

**Inferred**: what the owner likes is the art-led look and the at-a-glance level on the card. The look is available to deckwarden only with the artist and © line in view (D0, CLAUDE.md, Scryfall's image guidelines): deckcheck's treatment (a faded, re-cropped crop with no credit) is not. Deckwarden's preview already has the credited art and the declared level; what most previews lack is a declaration, because the target lives inside the bracket sheet. **Proposal (as reshaped at GATE 2): offer the declaration where the owner shares** (the package below; putting the computed line on the image would reverse the owner's 2026-09-30 decision, and the owner kept that decision when asked on 2026-10-21), and leave art-crop tiles in LATER row 211, annotated with the owner's interest: a credited crop on a 96 px tile is the one version D0 allows, and it costs a migration (row 49's `artist` column) or a runtime artist read on every page with tiles, which a tile's size does not repay.

**Cost against the budgets**: the preview is off ISR (847e999) and the reshaped package does not touch it (no statement, no render cost added); a computed line would have added the bracket read's inputs per unfurl (about four statements); Scryfall CDN images are hotlinked (no Vercel image quota). Art-crop tiles would add the artist to every tile: either a runtime Scryfall API read per printing (data-cached daily, as the preview does) on every page with tiles, or LATER row 49's `artist` column (about 1.5 MB, a migration and a backfill), and the credit chip at 96 px is crowded. The img host's immutable-key rule only matters if a generated image is stored (deckwarden renders on demand; nothing is stored).

## 2.5 The API (the owner's question, answered from the documentation page)

**Observed** (`/docs/api`, the owner's tab): read-only JSON under `/api/external`. `GET /deck` takes a deck id or URL, needs no key (rate-limited per address; a key raises the tier) and returns one public deck: its format, colours, dates, authors, the main commander and every board with Scryfall ids, set and collector numbers, oracle text, prices from four sources and image URLs, and for Commander decks the threat score out of 96 with its twelve tier letters, the bracket as a number (no justification) and the AI write-up as HTML. `GET /deck-search` needs a key requested by email and filters public decks by name, commander and partner, format, threat range, price, colours, brackets and tags, sorted by power, recency or price. Nine formats; the score and bracket are Commander-only. Its Permitted Use clause forbids using the API or the public pages to build a competing deck database, search engine, recommendation system or analytics product without written permission, and forbids combining it with scraping or browser automation.

**Inferred**: nothing in it is reproducible except the shape already visible on the deck pages (a list plus an AI-graded score and prose). Deckwarden calls none of it; a partnership would be the owner's conversation with the operator, not a package.

## Proposed packages and LATER rows

**GATE 2, decided 2026-10-21: the owner asked for session prompts for all four.** They are `HOME-INTRO-session-prompt.md`, `BRACKET-SPEED-session-prompt.md`, `BRACKETS-PAGE-session-prompt.md` and `DECK-PREVIEW-BRACKET-session-prompt.md`; each runs as its own package under the session protocol (one per session, deployed and `pnpm check`-green or not done).

| Package | What | Size | Evidence | Trigger |
|---|---|---|---|---|
| **HOME-INTRO** | The once-per-visit home intro: a pre-paint script in the root layout, `data-slot="home-hero"`, one `dw-in` rule; the H1 and the sentence settle in 460 ms; nothing else moves | S | §2.1 | **Shipped 2026-10-22** (the commit after `b3b546f`; the ship note is at the top of `HOME-INTRO-session-prompt.md`, the decisions in `REDESIGN.md`) |
| **BRACKET-SPEED** (§2.2 + §2.3) | Fast mana, tutors and the curve (with lands) as three facts in the bracket sheet's table, from the Tagger roles every card's attributes already carry (`attrs.roles`, Y7a; `src/lib/games/mtg/attrs.ts:49`); when they look tuned (fast mana 6 or more, or lands 33 or fewer: cuts no precon crosses), the sheet asks the cEDH-intent question instead of waiting. A pure adapter function in `src/lib/games/mtg/`, no score, no migration | M | 2.3's axes: AUC 0.997 / 0.992 / 0.991; the lands cut catches 51 of the 64 cEDH lists the read leaves under a firm 4 with 0 precons past it | **Shipped 2026-10-22** (the commit after `ac981e3`; the ship note is at the top of `BRACKET-SPEED-session-prompt.md`, the decisions in `REDESIGN.md`; parity with this calibration 182 of 182 precons and 904 of 904 sampled lists) |
| **BRACKETS-PAGE** (§2.2) | A public `/brackets` explainer built from the repo's own ruleset data and the Game Changers list in the database (always current, its sources linked), with the measured precon spread as the honest example and a door into the editor's import; a new route, SEO-facing, ISR revalidated daily like `/sets` and `/precons` (about one write a day against the budget); the Browse menu entry is a pre-flight question to the owner (default no) | M | 2.2's table: deckcheck's guide page is its bracket surface's front door; deckwarden's explanation lives only inside the editor's sheet | **Shipped 2026-10-23** (the commit after `f75b5f9`; the ship note is at the top of `BRACKETS-PAGE-session-prompt.md`, the decisions in `REDESIGN.md`; not in the Browse menu by the owner's answer, LATER row 302) |
| **DECK-PREVIEW-BRACKET** (§2.4, reshaped at GATE 2) | The declared bracket, offered where the owner shares: the Share dialog says what the link preview will show about the bracket and opens the sheet at "Your target" in one step; the unfurl, its read and its guard test unchanged | S | 2.4: previews already say "Bracket N (declared)" when a target exists; the computed line is ruled out by the owner's 2026-09-30 decision, kept on 2026-10-21 | **Shipped 2026-10-23** (the commit after `3d8a36a`; the ship note is at the top of `DECK-PREVIEW-BRACKET-session-prompt.md`, the decisions in `REDESIGN.md`; 1 of 24 shared Magic decks declared at pre-flight, LATER row 305 re-counts a month on) |

**LATER rows added** (rows 296 and 297): the Topdeck "EDH" feed mixes casual, budget, bracket-capped and precon events into what deckwarden calls tournament data; and the calibration's re-run needs the post-09-01 lists that only the R2 archive holds. **Annotated**: row 211 (the owner's interest in art-led deck images; the cost of credited crops on tiles), row 246 (the lazy fade re-runs on every client return to home: 23 transitions), row 249 (today's production numbers). The HOME-INTRO package opens its own two rows (a decode-gated fan motion, a per-word H1 reveal) when it ships.

**Asked at GATE 2, not done**: one line under CLAUDE.md's Hard rules recording the boundary (another site's terms decide whether a session may automate against it; deckcheck.co's forbid it, so its pages are read only when the owner opens them, and nothing from them enters the repo).
