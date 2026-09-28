# X4b session prompt — Sets page (every released Magic set on one static page, each a way into `/cards?set=`)

Pull latest, then run X4b — the fifth Wave-3 package. **`WAVE3.md` is the contract.** Read, in this order: section A's rows on "Released" and on the set filter; **D0** (the shared rules — the `Layers` icon is named for sets and X4a left it unused) and **D4** (its `/sets` sketch is X4b's half; the owner's answers of 2026-09-28 in WAVE3.md's Context amend it — a set is shown by its place in its line); the **X4b block** in E and the X4b row of the pin matrix in its appendix; F (the Sets page is itself a default the owner has not confirmed — see pre-flight 4 — and X4a's wording defaults are a row there now). X4a is live (`335576c` + `101ff83`, docs in the commit after); its ship note at the top of `X4a-session-prompt.md` and REDESIGN.md's "X4a decisions" hold what this session inherits — `loadReleasedSets`, `GET /api/sets`, the place words, the day order, the picker's matcher.

X4b is the cheap half of idea 4 once the list exists: **one static page** (`src/app/(site)/sets/page.tsx`, ISR `revalidate = 86400`, no `searchParams`) listing every row of `loadReleasedSets(GAME_ID.mtg)` as a link to `/cards?set=<code>`, grouped by year, newest first, **with a client filter island** — a name/code box and "Main sets only", on by default — that only hides rows the server already shipped (the `/precons` pattern); **a Browse entry** ("Sets", after Cards) in the header's menus; and **the sitemap line**. No new route beyond the page, no migration, no new dependency.

Pre-flight, in order.
1. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
2. **A warm beta signal outranks a package.** Owner posted, feedback arrived, a stranger's 429, a new issue → run the `P2.9-session-prompt.md` round (Magic) or the `P4.7-session-prompt.md` round (One Piece) as its own session first. Ask the owner whether anything was posted. Baseline on 2026-09-28, after X4a: 27 user decks (26 Magic, 12 of them guest-owned, plus the owner's One Piece fixture), 181 precons, 1 user; likes 2 · bookmarks 0 · folders 1 · versions 1 · collections 0; one closed issue, zero open.
3. **Ask for read-only database access once, at the start**, in plain words. X4b reads the `sets` table and printings (public card data) through `loadReleasedSets` and `smoke:sets`, plus the census and `pnpm db:size`. Say also that `smoke:seo` on dev writes fixture rows it cleans up (dev shares prod's database). X4b itself creates no deck.
4. **Two owner questions worth asking up front** (AskUserQuestion, one call):
   - **Build the Sets page at all?** It is WAVE3 F's first default — "If the picker alone is what you meant by 'search by set', strike X4b". The owner has now seen the picker live. If struck: tick X4b as struck in the tracker with the owner's words, move the Browse entry and the sitemap line to a LATER row, and write the X5 prompt instead.
   - **X4a's wording defaults** (WAVE3 F, the row added 2026-09-28): masters read "reprint set", core sets carry no number, The List stays a main set, the Un-sets stay other products. If the owner changes any, it is one line in `src/lib/sets/lines.ts` (and its pins in `lines.test.ts`) — do it in X4b, since `/sets` shows the same words.
5. **Working tree clean** at or after the commit that landed this prompt. Another session may share this working copy: stage explicit paths only, never `git add -A`; re-read `LATER.md`, `WAVE3.md`, `REDESIGN.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` = **1,163 tests / 136 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-28 on `101ff83`; the X4a docs commit after it changes no test), `pnpm db:size` 269.5 MB (alert 350). Save `pnpm build`'s route table; the diff at the end must be **exactly one new line, `○ /sets` with `1d 1y`** (the `/precons` line's shape: `├ ○ /precons   1d   1y`). `/cards` stays `ƒ`; `/c/[slug]`, `/l/[slug]`, `/cards/[id]` stay `●`; `/api/sets` stays `ƒ`.
7. **P4.9 is independent.** Its gate (2026-09-28 07:17 Z) has passed; if the owner wants the image flip first, it gets its own session.

## What X4b is NOT (scope fence)

- NOT a change to `GET /api/sets`, `loadReleasedSets`' SQL, the search route or the `/cards` picker — X4b reads them. (Pure helpers in `src/lib/sets/lines.ts` may grow, e.g. a year label; nothing there may change an existing pin.)
- NOT One Piece sets (LATER row 115), NOT digital-only sets (116), NOT typed `set:` syntax (117), NOT per-set pages (`/sets/<code>` — the owner's "a chosen set shows its place, its 12 most played, then the full list" lives at `/cards?set=`; a server-rendered set page with its own canonical is a separate SEO decision → LATER row).
- NOT the gallery's 250-row fallback (LATER row 88 — W5's code), NOT `/cards`' same-page re-seed (row 129), NOT the picker's release-day lag (row 130).
- NOT a URL writer: the filter island's state is ephemeral, like `/precons` (LATER row 89) — no `searchParams`, no hash.
- NOT a migration, NOT a new dependency, NOT X5.
- Anything else → `LATER.md` with a trigger.

## Corrections to the contract (found while writing this prompt — read before the pin matrix)

1. **WAVE3's X4b citations have drifted.** `BROWSE_LINKS` is `src/components/site-nav.tsx` **33–40** (Commanders, Leaders, Cards, Precons, Tournaments — the comment at 37 names "Precons after Cards, Tournaments (W10) last"); the header test's two arrays are `src/components/site-header.test.tsx` **93–99** (the Browse menu) and **204–212** (the phone menu, which adds Build first and My decks last); the core sitemap's hand list is `staticPages` in `src/app/sitemap.ts` **53–66**. WAVE3 E says 36–43, 80–86 and 147–155.
2. **D4's `/sets` sketch predates the owner's answers.** Its row is "The Hobbit HOB Expansion Aug 14, 2026 N cards →"; since X4a every `/api/sets` row carries `ordinal` and `group`, and `setPlaceShort` words it ("114th expansion set", "core set", "bonus sheet"). The owner asked that a set show "its place in its line" — decide whether the row says "Expansion" (D4) or the place (X4a's words); the latter keeps `/sets`, the picker rows and the `/cards` header one vocabulary.
3. **"Every row of `loadReleasedSets` is a link in the server HTML" costs bytes twice if the island gets the rows as props.** The `/precons` precedent passes every item to a client island (181 tiles → 700,107 bytes of HTML, 46,036 gzipped on prod, 2026-09-28: the RSC payload repeats each item). 706 rows passed the same way would repeat ~95 KB of row data (the `/api/sets` body is 94,741 bytes). Decide: rows as island props (simplest, the precedent), or rows rendered by the server with `data-` attributes and an island that only hides them (lighter; the filter reads the DOM or a slim index). Measure the page's bytes either way and record them.
4. **The island's text match should be the picker's.** `matchSets` (client-safe, `src/lib/sets/lines.ts`) ranks the exact code, then name starts, word starts, code starts, name contains; `/precons` uses a plain `includes` over a normalized haystack. On a page grouped by year, ranking reorders nothing across groups — decide whether the box keeps year order and only hides (the `/precons` behavior) or shows a flat best-first list while text is typed.
5. **"Main sets only" on by default hides 465 of 706 rows** — and "hides nothing from crawlers" means the server HTML carries all 706. A no-JS visitor sees every row; the default filter is applied after hydration. Decide how the first paint reads before hydration (all rows, or the main rows with the others collapsed by CSS the island removes) and prove there is no hydration mismatch.
6. **The page is Magic only.** One Piece has no released sets to list (row 115). `/precons` shows the precedent: a disabled "One Piece — soon" pill with a hint, never a dead link, static markup (not `GameSwitch`). D4 draws a single "[Magic: The Gathering]" label. Decide and write the words (no apology copy — D0).
7. **`Layers` has no home yet.** D0 names it for sets; X4a used no icon. The Browse entries carry text only (`BROWSE_LINKS` is `{ href, label }`), so the icon, if any, belongs to the page (the heading line or the empty state), always beside text.
8. **`/cards?set=<code>` costs one edge-cached `/api/sets` fetch on landing** (the chip and the header need the name) — the list `/sets` itself was built from. A click from `/sets` into a set is a route change, so `/cards` mounts fresh; LATER row 129 (a same-page navigation keeps old filters) does not fire from `/sets`.

## Facts you inherit (verified 2026-09-28 against `101ff83` — re-grep lines, trust the shapes)

- **`loadReleasedSets(gameId)`** (`src/lib/sets/queries.ts`): ONE statement — a `count(DISTINCT card_identity_id)` per set over live printings of live cards, in a subquery joined to `sets` under `releasedPaperSet` — 135–145 ms warm; then `placeSets` (TypeScript) groups and numbers the rows and orders each day by line (`DAY_ORDER`: expansion, core, draft innovation, masters, commander, Eternal, bonus sheet, then Secret Lair Drop, then other products; the larger set first inside a line). Rows: `{ code, name, releasedAt, setType, group, cards, ordinal }`, newest first. **706 rows on 2026-09-28: main 241, other 465**; the newest is The Zeta Set (`slz`, a `box`, other) on 2026-09-02; the oldest main set is Limited Edition Alpha (1993-08-05). Called at build and at each daily revalidation only — zero statements per visit.
- **The words** (`src/lib/sets/lines.ts`, pinned by `lines.test.ts`): `setPlace` ("the 71st expansion set"), `setPlaceShort` ("71st expansion set", "core set", "bonus sheet", "Secret Lair series"), `SET_GROUP_LABEL` ("Main sets", "Other products"), `matchSets` / `setMatchClass`, `setGroup`, `setFieldKey`. Ordinals come from `ordinal` in `src/lib/tournaments/format.ts` (the one shared copy; its `eventDateLabel` gives "Jul 22, 2016", UTC-pinned).
- **`GET /api/sets?game=mtg`** (`src/app/api/sets/route.ts`): `force-dynamic`, `s-maxage=86400, stale-while-revalidate=86400`; prod MISS → HIT; `game=optcg` → `{ "sets": [] }`, no statement. X4b's page reads `loadReleasedSets` directly, never its own API.
- **`/precons`** (`src/app/(site)/precons/page.tsx`, 106 lines): `export const revalidate = 86400`, static metadata with `alternates.canonical`, `max-w-browse` main, a serif h1 and a one-line lead, the disabled One Piece pill (71–89), the island `PreconsIndexView` (`src/components/deck/precons-index-view.tsx`, 221 lines — native `<select>`s, `normalizeCardName` haystack, year groups newest first), the attribution footer. Its test pins "filtering never touches the URL" (`precons-index-view.test.tsx` 136–145). On prod: `x-nextjs-prerender: 1`, `x-vercel-cache: PRERENDER`, `Cache-Control: public, max-age=0, must-revalidate`.
- **The header**: `BROWSE_LINKS` feeds both the md+ Browse dropdown (`site-nav.tsx` 62–66) and the phone menu; `site-header.test.tsx` pins both arrays (93–99, 204–212). The header's guest branch renders inside the error and 404 shells without a router — a static link list keeps that true.
- **The sitemap**: `src/app/sitemap.ts` `staticPages` (53–66) lists `/`, `/commanders`, `/leaders`, `/precons`, `/cards`, `/cards?game=optcg`, `/tournaments` (+ `?game=optcg`), `/legal`, `/privacy`. `smoke:seo` pins "core sitemap lists /commanders" and `/tournaments` (`seo-smoke.ts` 186–199); `/cards?set=` canonicalizes to bare `/cards` (pinned by `smoke:sets`).
- **`smoke:sets`** (`scripts/sets-smoke.ts`, new in X4a): read-only (one explicit read-only transaction), every count from the database; checks `/api/sets` against the rule, the scope on the newest released expansion, the refused codes, One Piece's byte-identical answer, `/cards?set=` and its canonical; trusts `x-vercel-cache` on Vercel. X4b's checks belong here.
- **Proving ISR** (the hub-pages lesson): `pnpm build` shows `○ … 1d 1y`; on Vercel `x-nextjs-prerender: 1` and `x-vercel-cache` PRERENDER/HIT; a layout or page that reads `searchParams`, `headers()` or `cookies()` silently makes it dynamic.
- **LATER rows X4b touches** (row N = line N of `LATER.md`, 131 lines after X4a): **115–117** (stay deferred — note X4b listed Magic only); **89** (the `/precons` ephemeral-filter decision X4b copies — cite it); **129** (does not fire from `/sets`, Correction 8); **131** (Scryfall's line oddities show on `/sets` too — The List under Main sets). Append new rows at the end.

## Verify-first list (never from memory)

1. **Next's docs for a static page with ISR** (`node_modules/next/dist/docs/` — the `revalidate` route segment config and the ISR guide): the page exports `revalidate = 86400` and reads no request data; state the caching intent in its docblock.
2. **The route table** before and after: exactly `○ /sets  1d  1y` added.
3. **The server HTML** (curl, `--compressed`): every `/api/sets` row's code appears as an `href="/cards?set=<code>"` link — count them against the database (the rule's count, read in `smoke:sets`, never a literal); the page's total bytes and gzip bytes recorded.
4. **The island in RTL**: "Main sets only" on by default; typing `blo` shows the Bloomburrow sets (and `blb` finds Bloomburrow); unticking shows Other products; "No sets match" for nothing; the URL never changes (the `/precons` pin, copied).
5. **No hydration warning** in the pane on a clean load (HMR mid-load fakes one — reload before believing it); both themes at 390 and 1440, no horizontal overflow.
6. **The header**: Browse lists Sets after Cards at md+, the phone menu likewise; both test arrays updated.
7. **The sitemap** lists `/sets` (`smoke:seo` gains the check); robots unchanged.
8. **Smokes on dev**: `smoke:sets` (+ the page's checks), `smoke:seo`, `smoke:hubs` if the header's markup moved; `pnpm counters:reset` before `smoke:seo`; never retry into a 429.
9. **Prod, signed out, zero creates**: `/sets` 200 with `x-nextjs-prerender: 1`; a second request PRERENDER/HIT; the header's Browse entry in server HTML of home; `/sitemap.xml` lists `/sets`; one row's link lands on `/cards?set=<code>` naming its set.
10. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel".

## Design decisions to make explicitly (disclose + pin each)

- **Build it or strike it** (pre-flight 4).
- **The row**: name · code · place in its line (or D4's type word) · date · "N cards" → `/cards?set=<code>`; the phone layout of a row (two lines, like the picker's rows).
- **Grouping**: by year, newest first (D4); within a year, the list's own order (newest first, a day's sets by line). Year headings as `h2`s under the serif `h1` "Sets".
- **The island**: text box + "Main sets only" (default on); the match rule (Correction 4); how rows reach it (Correction 3); what shows before hydration (Correction 5); the empty state's words.
- **The game line** (Correction 6) and **`Layers`** (Correction 7).
- **Metadata**: title "Sets", a description naming Magic sets, `alternates.canonical: "/sets"`, the site's default OG image.
- **The Browse entry's position** ("Sets" after "Cards" per WAVE3 E) and its label.
- **The sitemap line** beside `/cards` in `staticPages`.

## Deployable outcome

`pnpm check` green and deployed. The route table gains exactly `○ /sets` (`1d 1y`); `/cards` stays `ƒ`; `/c/[slug]`, `/l/[slug]`, `/cards/[id]` stay `●`.

Verified **on dev**: `/sets` lists every released paper set with a live card (the rule's count from the database), grouped by year, newest first, each row a link to `/cards?set=<code>` with the set's place in its line; "Main sets only" on by default (241 shown today), off shows all; the filter box finds `blo` and `blb`; the URL never changes; the header's Browse and phone menus list Sets after Cards; the sitemap lists `/sets`; both themes at 390 and 1440; no hydration warning; `smoke:sets`, `smoke:seo` green; the census unchanged.

Verified **on prod, signed out, zero creates**: `/sets` 200, prerendered (`x-nextjs-prerender: 1`), cached on a repeat; `/sitemap.xml` lists it; home's server HTML carries the Browse entry; a row's link opens `/cards?set=<code>` with its header.

Tests: the page's server render (every row a link; grouped by year; the words), the island (default filter, text match, the URL untouched), the header's two arrays, the sitemap's list; `smoke:sets` grows the page checks, `smoke:seo` the sitemap line.

Docs in the same package: the `WAVE3.md` tracker ticked with the sha and any deviation beside it; an "X4b decisions" section in REDESIGN.md's Wave-3 addendum; a dated ship note at the top of this file; `LATER.md` — new rows for anything fenced (per-set pages first); memory updated; **`X5-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated on prod.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted — delete what you add), inside one explicit `read only` transaction, body wrapped in `async function main()`.
- `.env.local`'s `DATABASE_URL` is prod's pooler: **dev shares prod's database.** `source .env.local` fails in zsh; scripts load it with dotenv.
- zsh aborts a whole command on an unmatched glob — **quote every URL with a `?`** in shell loops (X4a lost five minutes to an unquoted `until curl …?game=…` loop) and quote `--include='*.tsx'`.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`. Stop it before `pnpm build` — they share `.next`. `next dev` may re-add the AGENTS.md block; commit it with your work if it does. An edit landing between a page's server render and its hydration shows a hydration mismatch in dev — reload before believing one.
- The browser pane is signed out on prod and on localhost, and usually hidden: clicks and scroll are swallowed, rAF is paused (Base UI's list navigation never highlights on ↓ — pin keys in RTL), Base UI enter animations stall at opacity 0 (set `window.BASE_UI_ANIMATIONS_DISABLED = true` before opening and strip `data-starting-style` for a screenshot), HMR does not repaint, and a screenshot is what paints and hydrates a tab — poll for a `__reactFiber` key before clicking. A Base UI text box opens on a `mousedown` (a plain `click` does not open it); menus open from a plain JS `click`. `performance.getEntriesByType('resource')` counts one document's requests; the network tool's log spans several loads.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree: a fetch-then-set lives inside the async function; synchronous resets belong in event handlers.
- RTL: Base UI inputs open only on an `input` event with an `inputType`; `fireEvent.change` reads as autofill (X2). Base UI toasts carry `role="dialog"` — query dialogs by name (X3).
- Drizzle: an aliased table interpolated into a raw `sql` template renders as its alias alone — build subqueries with `QueryBuilder` (X4a). A route test can run the real builders over a fake postgres.js client (`src/app/api/sets/route.test.ts`).
- Prettier reflows scripted-edit anchors after `pnpm format`, and does not reflow comments; `*.md` is prettier-ignored.
- Prod: curls need `--compressed`; Vercel rewrites an API's `Cache-Control` to `public` for the client — trust `x-vercel-cache`; the deck-create budget is 10 an hour and 30 a day per IP, and X4b creates no prod decks.

## Context, not tasks

- Sequence after X4b: X5 change picture (M–L, one migration). X5 reuses X2's `ui/autocomplete.tsx` (now with `Collection`).
- The owner's answers of 2026-09-27 and 2026-09-28 stand (WAVE3.md, Context), plus X2's (the dropdown stays prefix-first) and X3's ("Suggest full list"). The other defaults in WAVE3.md section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the X-series and get their own round, never a slice of an X-session. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds: no simulated decks, posts or metrics.
- Set membership changes when Scryfall adds printings, and a new set appears on its release date: pin rules and sentences — "every released paper set with a live card is a link", "Main sets only is on" — and read counts from the database in the smoke, never as literals.
