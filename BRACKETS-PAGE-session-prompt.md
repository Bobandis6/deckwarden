# BRACKETS-PAGE session prompt — a public `/brackets` explainer built from deckwarden's own rules

*Status: not run yet.* Written 2026-10-21 at GATE 2 of the DECKCHECK study (`DECKCHECK-STUDY.md` §2.2 is the evidence). Anchors verified against `25a75c9`; re-grep lines, trust the shapes. Add a dated ship note at the top of this file when the package ships.

**What it is.** Deckwarden explains brackets only inside the editor's sheet. A visitor who searches "Commander brackets" lands nowhere on deckwarden.gg; deckcheck's front door for its bracket feature is exactly such a guide page. This package adds one public page, `/brackets`, built from **deckwarden's own data**: the five levels from the versioned ruleset the read applies, the **current** Game Changers list from the database (always what the nightly last checked), what deckwarden's read checks and what it deliberately does not, the measured precon spread as the honest example, and a door into the editor's import. Nothing from deckcheck's page enters it (the study's boundary): not its wording, its layout, its FAQ or its claims.

**Size M.** **One new route** (`/brackets`; the route table gains exactly that entry), one new loader, one sitemap entry. No migration, no dependency, no new nav label unless the owner says so at pre-flight.

Pre-flight, in order.
1. **Main is green.** `pnpm check` = 2,734 tests / 264 files / the same 6 warnings at `25a75c9`.
2. **Nightlies green**; **a warm beta signal outranks a package**; **working tree clean** (stage explicit paths; re-read `LATER.md` and `MEMORY.md` before editing them).
3. **Ask the owner two things once, in plain words, before code**: (a) whether `/brackets` joins the Browse menu (default **no**: the menu's labels and order are pinned in `src/components/site-nav.tsx:44-53`, `site-header.test.tsx:125-139` and `:301-310`, and `scripts/sets-smoke.ts:345-354`; the page is reached from the bracket sheet's links, `/precons` and the sitemap instead); (b) the page title and the h1 (default "Commander brackets").
4. **Database reads go to the Neon `dev` branch**; scratch scripts carry both guards.
5. **Baseline**: `pnpm build`'s route table (74 app-path entries at `1e1576b`; the diff at the end must be exactly `+ ● /brackets` or `○`, nothing else).

## What this package is NOT (scope fence)

- NOT a bracket checker on the page: no list input, no read. The door is the editor's import (`startDoorHref({ kind: "paste" }, "mtg")` gives `/decks/new?game=mtg&import=1`, `src/lib/decks/start-doors.ts:53-59`; handled at `src/app/decks/new/new-deck-chooser.tsx:58-61`, `:75` and `src/components/editor/deck-editor.tsx:1666-1681`).
- NOT a restatement of Wizards' text as if it were ours: every allowance comes from `BRACKET_RULESET` (`src/lib/games/mtg/bracket-ruleset.ts:57-103`) and is linked to Wizards' page (`sources`, `:112-115`; `MTG_BRACKET_LINKS`, `src/lib/games/mtg/bracket-line.ts:398`), with the ruleset's `asOf` (2025-11-05) and the list's revision (2026-02-09) shown.
- NOT a claim that precons belong in Bracket 2: the ruleset text the repo holds says precons are no longer tied to Core (`bracket-ruleset.ts:11-12`, `WAVE4.md:128`). The precon spread is shown as what deckwarden's read finds, with the reasons.
- NOT One Piece (no brackets).
- NOT JSON-LD beyond what the model pages carry (they carry none; `src/lib/seo/jsonld.tsx` has `JsonLd` `:17` and `breadcrumbJsonLd` `:36` if the owner wants a breadcrumb later).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit

**The model pages.** `src/app/(site)/sets/page.tsx` (the caching-intent comment `:10-17`, `revalidate = 86400` `:31`, metadata and canonical `:33-38`, `<main id="main" className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">` `:44`, the `.type-title` h1 `:45`, the credit footer `:60-66`) and `src/app/(site)/precons/page.tsx` (`:8-16`, `revalidate` `:38`, metadata `:40-45`, `Promise.all([loadPreconIndex(), loadPreconBracketFacts(adapter)])` `:51-54`, credits ending in the Fan Content sentence `:119-129`). Their tests run in the node environment, mock the loaders, render with `renderToString(await Page())` and pin `revalidate`, the title, the canonical and `Page.length === 0` (no request data): `sets/page.test.tsx:83-94`, `precons/page.test.tsx:109-134`. `.type-title` is `globals.css:547`, `.type-section` `:554` (used on `/privacy`, `src/app/(site)/privacy/page.tsx:40`).

**The Game Changers in the database.** Sparse `card_identities.attrs.game_changer: true` (`src/lib/games/mtg/attrs.ts:33-39`, written at `scryfall-map.ts:241`). **No app query lists them yet.** `ci_attrs_gin` is `jsonb_path_ops` (`src/db/schema.ts:156`), which serves only containment: query with `attrs @> '{"game_changer": true}'` (the precedent is `src/lib/recommend/queries.ts:114-123`), never `attrs ? 'game_changer'`. The flag path comes from the adapter (`MTG_BRACKET_FLAG_PATHS`, `brackets.ts:842`), not a hard-coded key in core. Images: `embeddablePrintingImageUrl` / `thumbnailUrl` (`src/lib/cards/images.ts:68`, `:148`) through the default printing join (`src/lib/hub/queries.ts:335-338`); card links are `/cards/${identityId}` (e.g. `src/components/hub/staples-table.tsx:102`). The pinned count is 53 (`bracket-ruleset.ts:104-110`); the page shows the database's list and states the count it found.

**The precon spread.** `loadPreconBracketFacts(adapter)` (`src/lib/decks/precons.ts:258`, 3 statements: cards with flags and legality, complete combos, freshness) and `preconBracket(...)` (`src/lib/decks/precon-brackets.ts:35`, returns `{ line, bands }` or null). The live spread at the study (182 precons): minimum 1 → 148, 2 → 5, 3 → 28, 4 → 1; 145 read exactly "1 to 2". Compute it at render (revalidate time), never hard-code it.

**The words the editor already uses** (the page must not contradict them): "Bracket 1 to 2 · nothing here goes past Core" (`bracket-line.ts:12`, built at `:288`); Exhibition and Core differ only by intent (`:78`); `MTG_TABLE_NOTE` "Reads the card list only; combos via Commander Spellbook." (`:328`); `assumptionsFor` (`brackets.ts:328-341`: the turn expectations 9, 8, 6 and 4; tutors and fast mana don't change the read; land denial and extra turns are Scryfall community tags, not Wizards lists); `BRACKET_SOURCES` (`brackets.ts:159-164`); `BRACKET_COPY` (`src/lib/brackets/copy.ts:17-60`). Copy rules: zero em or en dashes, at most one middle dot a line, ranges as "to" (`WAVE5.md:178`, `:333-337`); the guard pattern is `bracket-line.test.ts:577-661`.

**Freshness on an ISR page.** `loadBracketFreshness(adapter)` (`src/lib/brackets/freshness.ts:49`, one statement) decides "stale" at revalidate time (`freshness.ts:10`: callers decide caching). Show the list's last check date from it; if the feed is stale at render, say so plainly rather than hide the list.

**The ISR budget** (memory `isr-write-budget-live`): 8 KB units, every deploy empties ISR, Next 16 HTML is not byte-stable so each regeneration writes. One daily-revalidated page with no params is the accepted shape (`/sets`, `/precons`); about one write a day. Never probe an ISR route on production (a probe writes).

**Site plumbing.** `src/app/sitemap.ts:54-69` (`staticPages`; `sitemap.test.ts:34-46` pins the exact 11-path list with `toEqual`: add `/brackets` there); `robots.ts` needs nothing; `scripts/seo-smoke.ts` (the `page(path)` pattern with status 200 and `hasCanonical`, `:87`, `:336-338`; the sitemap `includes("/sets</loc>")` checks `:201-203`): add `/brackets` to both.

## The page (decide and disclose the details)

1. **Route** `src/app/(site)/brackets/page.tsx`: ISR, `revalidate = 86400`, no searchParams, headers or cookies; the caching-intent comment in the model pages' words (statements per revalidation: the Game Changers list 1, the precon facts 3, freshness shared or 1; zero per visit). Metadata: title, a one-sentence description, canonical `/brackets`. `data-game="mtg"`.
2. **Sections** (serif h2s on `.type-section`, one layout family each):
   - the h1 and one sentence on what brackets are for (a shared vocabulary before a game, Wizards' framework);
   - **the five brackets** from `BRACKET_RULESET.levels`: name, Game Changers allowed, land denial, extra turns, two-card combos, the turns Wizards expects; one row or card per level, generated from the data (a ruleset version bump updates the page);
   - **the Game Changers**: the current list from the database, small card images (lazy below the fold, hotlinked through the project's helpers, never cropped) linking to `/cards/<id>`, with the count found, the list's revision and the last check;
   - **how deckwarden reads a deck**: what the read checks, what it leaves to the owner (intent questions, tutors and fast mana; if BRACKET-SPEED has shipped, its facts), "Reads the card list only; combos via Commander Spellbook.", and the precon spread with the reasons the firm 3s are 3 (a Game Changer, a two-card combo);
   - **the door**: "Check a deck" (or the label the owner picks) to the paste door's href (`startDoorHref({ kind: "paste" }, "mtg")`, or the literal it returns), and the precons link;
   - sources: Wizards' brackets page and Game Changers list, Scryfall, Commander Spellbook; the site's Fan Content line if the model pages carry it.
3. **Links in**: the bracket sheet's source links (`MTG_BRACKET_LINKS`) gain "How brackets work" → `/brackets` (moves the sheet's link pins; say so), and `/precons`' bracket filter area links it. The Browse menu only if the owner said yes at pre-flight.

## Tests and checks

- `brackets/page.test.tsx` (node env, mocked loaders, `renderToString`): `revalidate` 86400, the title and canonical, `Page.length === 0`, the five levels rendered from the ruleset (mutate one allowance in a mocked ruleset and see the page change), the Game Changers rendered from the mocked loader with `/cards/` links, the door's exact href (`/decks/new?game=mtg&import=1`), the precon spread computed from the mocked facts, a stale feed shown as stale, the copy guard over every new string.
- The loader's test: the SQL uses `@>` with the adapter's flag path (a recording fake, the `src/lib/og/data.test.ts` shape) and returns name, identity id and image; one statement.
- `sitemap.test.ts` (12 paths), `seo-smoke` (the page, its canonical, the sitemap entry), the sheet's link pins moved.
- On a production build (`pnpm build && pnpm start`): the page at 1440 and 390 in both themes, no horizontal overflow at 360, 0 contrast failures (the helper), Lighthouse SEO and a11y 100, LCP and CLS recorded; `pnpm build`'s route table `+ /brackets` only.
- After the deploy: the page answers 200 with `x-nextjs-prerender` (read the headers; do not loop-probe it), the sitemap lists it.

## LATER rows this package touches or opens

- Opens: the Browse menu entry (if the owner said no at pre-flight; trigger: the page draws search traffic in Vercel's analytics); a breadcrumb JSON-LD (trigger: the owner asks).
- Touches: row 151 (the precon spread now has a public home).

## Session notes

- The measuring browser is Chrome for Testing through the chrome-devtools MCP (`u10a-form-primitives-live`); helpers as `*.js.txt`; never `cd`.
- Base UI menu items are in no server HTML (`x4b-sets-page-live`): if the Browse menu gains the page, check the header's JS chunk as `sets-smoke` does.
