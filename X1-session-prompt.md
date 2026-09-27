# X1 session prompt — Account paths (My decks, this browser's decks, the name row, the way back after sign-in)

Pull latest, then run X1 — the first Wave-3 package. **`WAVE3.md` is the contract** (drafted from the owner's answers of 2026-09-27, landed in the same commit as this prompt). Read it before anything else: all of A, B's "Validation corrections" and "Strengths to preserve", **D0** and **D1** (the ASCII spec is the design), the X1 row of the pin matrix in the appendix to E, F, and **G** (this package). Step 0 of this session adds the docs that make X-packages legal sessions under the CLAUDE.md protocol — build plan §6d, the CLAUDE.md line, the REDESIGN.md addendum, the LATER rows — the way W1's step 0 did for the W-series.

X1 is five small changes in one package: **My decks opens `/account` for everyone**; **the signed-out account page lists this browser's decks** under the sign-in buttons; **the name in the account menu is a link** that lands at the top of `/account`; **signing in from Like, Bookmark or Fork returns you to the deck** (REC-1); and **three unused Better Auth token routes are closed** (REC-6). No migration, no new dependency, no new route.

Pre-flight, in order.
1. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
2. **A warm beta signal outranks a package.** Owner posted, feedback arrived, a stranger's 429, a new issue → run the `P2.9-session-prompt.md` round (Magic) or the `P4.7-session-prompt.md` round (One Piece) as its own session first. Ask the owner whether anything was posted. Baseline on 2026-09-27: 27 user decks (26 Magic, 12 of them guest-owned, plus the owner's One Piece fixture), 181 precons, 1 user; likes 1 · bookmarks 0 · folders 1 · versions 1 · collections 0; one closed issue, zero open.
3. **Ask for read-only database access once, at the start**, in plain words: what is read, and that nothing is written. X1 needs it for the census before and after the dev pass.
4. **Working tree clean** at or after the commit that landed `WAVE3.md` and this prompt (`git log --oneline -1 -- WAVE3.md`; its parent is `8a4b501`). Another session may share this working copy: stage explicit paths only, never `git add -A`.
5. **State your baseline**: `pnpm check` = **959 tests / 121 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-27 on `8a4b501`), and `pnpm db:size` (269.5 MB on 2026-09-27, alert 350). Save `pnpm build`'s route table; the diff at the end must be empty.
6. **P4.9 is independent.** If its gate has passed (not before 2026-09-28 07:17 Z) and the owner wants the image flip first, it gets its own session.

## What X1 is NOT (scope fence)

- NOT the picture, the pencil or the avatar column (X5), and NOT "Public profile ↗" in the menu (X5, REC-5).
- NOT a return path from the header's own **Sign in** link. It stays `/account`. The guest branch of the header renders inside the error and 404 shells without a router, so it may not call `useRouter` or `usePathname`.
- NOT a claim nudge in the editor or on share pages (LATER's claim-nudge row stays open), and NOT ⋯ actions on the new tiles (LATER's home-rail row).
- NOT any change to `/api/decks/mine`, `/api/decks/claim` or `PATCH /api/profile`.
- NOT a redesign of `/account`: the three sections, their ids and the in-page nav stay as they are.
- NOT the predictive dropdown, the set filter or the combo door (X2, X4a, X3).
- NOT new dependencies. Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-27 against `8a4b501` — re-grep lines, trust the shapes)

- **My decks.** `src/components/site-nav.tsx`: `useMyDecksHref` (45–49) returns `/account` with a session and `/#your-decks` without; `MyDecksLink` (51–58) and `MobileNavMenu` (80–110; the hook at 81, the item at 104–106) both call it. The `authClient` import (32) serves only that hook. `src/components/site-header.tsx` renders the nav at 41–47 and its docblock (8–14) says two islands read the session.
- **`SiteHeader` renders in four places**: `src/app/(site)/layout.tsx` 28, `src/app/error.tsx` 37, `src/app/not-found.tsx` 20, `src/app/decks/new/new-deck-chooser.tsx` 87.
- **Home keeps its section.** `src/app/(site)/page.tsx` is `force-dynamic` (41) and renders `ContinueBuilding` for a session or `YourDecks` for a guest (107). Both components render `id="your-decks"` themselves. On prod the guest HTML has no such id: `YourDecks` mounts its section only after a client fetch returns at least one deck.
- **`YourDecks`** (`src/components/deck/your-decks.tsx`): the effect is 38–62 (tokens from `listDeckTokens()`, an early return at 41 with none, `POST /api/decks/mine` at 46–53, every failure swallowed); it renders null at 64; the section is 68 with the h2 "Continue building" at 69–71; tiles are `DeckTile`s linking `/decks/<id>/edit` with a "Share page" action (72–98).
- **The token store**: `src/lib/decks/token-store.ts` — keys `deckwarden:deck-token:<deckId>` (13), `listDeckTokens` (55–69).
- **`POST /api/decks/mine`**: 1–100 `{id, token}` pairs (29–34), `decksMine` 30 a minute per IP (37), rows carry `leaderImage` (71).
- **The account page** (`src/app/(site)/account/page.tsx`): `force-dynamic` (51); the signature takes no props (98); the session read is 99; **the signed-out branch is 101–112** (h1 "Sign in", the copy, `<SignInButtons />` at 109); the signed-in header is an id-less `<section>` (187–197); `AccountNav` is 199; **`ClaimDecks` mounts at 202**. The docblock (1–20) ends "The signed-out page is untouched" — X1 changes that sentence.
- **`SignInButtons`** (`src/components/auth/sign-in-buttons.tsx`): no props (19); `callbackURL: "/account"` (26); its only render site is the account page.
- **`ClaimDecks`** (`src/components/auth/claim-decks.tsx`): one attempt per mount (23, 27–28); early returns with no tokens (30), a non-OK response (40) and nothing claimed (42); tokens removed and `router.refresh()` on success (43–45); the status line at 52–57.
- **The account menu** (`src/components/auth/account-slot.tsx`): the guest branch is 54–62 and must stay byte-identical; `AccountMenu` is its own component (72–119) so the guest branch never touches the router; the name is a `DropdownMenuLabel` at 96; the four links are `ACCOUNT_MENU_LINKS` (43–48), mapped at 98–102.
- **The in-page nav** (`src/components/account/account-nav.tsx`) is plain `<a href="#…">` anchors (24), three entries, no Bookmarks. The router never hears about those hash changes.
- **The sign-in prompts.** `src/components/deck/engagement-buttons.tsx` 47–70: Like (title 54, href 55) and Bookmark (title 63, href 64). `src/components/deck/fork-button.tsx` 28–39 (title 34, href 35). **Both components receive `deckId`, the uuid, not the public id.** `src/components/deck/deck-share-view.tsx` holds `publicId` (88) and mounts them at 358 and 371, so the href is passed down from there.
- **Better Auth 1.7.2 validates `callbackURL`** on POST (`node_modules/better-auth/dist/api/middlewares/origin-check.mjs` 48–66). A root-relative path passes `isSafeRelativeURL` (`dist/auth/trusted-origins.mjs` 66–76): one leading `/`, no `//`, no backslash, no control character, and no encoded separator **in the path part**. `/account?next=%2Fd%2Fabc` passes, because `%2F` sits in the query.
- **The closed-route list**: `src/lib/auth-disabled-paths.ts` 18 holds `["/update-user"]`. The library defines `/get-access-token`, `/refresh-token` and `/account-info`, and nothing under `src/` or `scripts/` calls them (grep, 2026-09-27). Pins: `src/lib/auth-disabled-paths.test.ts` 42–68 and `scripts/account-delete-smoke.ts` 161–183.
- **Test pins** in `src/components/site-header.test.tsx`: the guest My decks href (56–58), the signed-in one (95), the account menu's items by full `toEqual` (109–115), the phone menu by full `toEqual` with My decks last (147–155). The file's docblock (1–12) describes the two hrefs.
- **Smoke pins that must stay green**: `account-delete-smoke.ts` 141–149 (the sections and their ids) and 242–245 ("Sign in" on signed-out `/account` — a loose pin, the header's own link satisfies it); `engagement-smoke.ts` 253–262 ("Continue building" on signed-in home, absent from signed-out home) and 275–279; `versions-forks-smoke.ts` 507–510 ("Sign in to fork decks"). `deck-share-view.test.tsx` 118 and 298–305 pin the action row's labels, not its hrefs.

## Verify-first list (never from memory)

1. **Next's own docs on links and scrolling** (AGENTS.md): `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` — "scroll" (230–236) and "Scrolling to an `id`" (687–702). Then the source: `node_modules/next/dist/client/components/layout-router.js` 130–137, where `#top` is special-cased.
2. **The name row's landing, in a real browser.** The pane is signed out, so reproduce the mechanism on a signed-out page on dev: open `/commanders`, scroll down, set `location.hash` by hand the way a plain anchor would, then choose Browse → Commanders (a Next `Link` to the path you are on). Read `scrollY` and the URL. Do it twice in a row. Whatever that shows decides between the two candidates in D1. Pin the choice in RTL.
3. **The header hydrates clean.** With one href for everyone the server HTML and the first client render are the same string. Check home and one hub on dev for hydration warnings.
4. **The guest header is still router-free.** `src/app/error.test.tsx` and `src/app/not-found.test.tsx` render it without a router and must stay green untouched.
5. **`callbackURL` with a query survives the library.** Build Better Auth in Vitest with no database (omit `database` → the in-memory adapter; put nothing new in `src/lib/auth.ts`, which needs env at load) and POST `/sign-in/social` with `callbackURL: "/account?next=%2Fd%2Fabc"` and an `Origin` header. It must not answer 403. Without the `Origin` header the origin check answers first and the test proves nothing.
6. **The closed routes, pinned three ways** (the P2.9 round 2 lesson): on an open instance each of the three paths answers 401 signed out; on the closed instance each answers 404; and every listed path is one the library really defines (`Object.values(auth.api).map((e) => e.path)`). A 404 alone would also pass after an upstream rename.
7. **`safeNextPath`** with the table in G's checklist, plus: a value that decodes to `//`, a value with `%5C`, an empty string, and `/account#decks`.
8. **The OAuth round trip cannot be driven in the pane** — that would mean entering credentials. The return path is proven by RTL (the buttons build the callback; `ClaimDecks` returns once the claim settles, with tokens and without) and by the owner's three clicks after deploy.
9. **A guest deck on dev is a real row.** Dev shares prod's database. Make one draft edit on `/decks/new?game=mtg`, check `/account` lists it under "On this browser", then delete the deck from the editor and re-prove the census (27 user decks).
10. **Smokes on dev**: `smoke:account`, `smoke:engagement`, `smoke:versions`, `smoke:profile`, with `pnpm counters:reset` between them if the local counters fill. Never retry into a 429.
11. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel". Then the prod pass in "Deployable outcome".

## Design decisions to make explicitly (disclose + pin each)

- **The island's words.** The contract gives "On this browser · N decks" and "Sign in to keep them on every device." Keep them or improve them, and pin the result. The tiles match home's: the same link, the same "Share page" action.
- **The name row's mechanism**: `/account#top`, or `/account` plus a scroll to the top on click when the path is already `/account`. Say which, and why.
- **The name row's text**: the name alone (the default), or the name with a quiet "Account" hint.
- **The return**: automatic once the claim settles (the default), with the `role="status"` line and the link as the fallback. Decide what a failed claim does — the default is to return anyway; the claim retries on the next visit to `/account`.
- **What `next` may be**: any safe root-relative path except `/account` and `/api/` (the default), or a list of allowed prefixes.
- **Which prompts send `next`**: Like, Bookmark and Fork (the default). Home's copy and the editor's collection hint stay plain unless you see a reason.
- **Signed-in My decks**: `/account` (the contract — one href for everyone). The menu's own "My decks" still goes to `/account#decks`.

## Deployable outcome

**Step 0 first, in its own commit** (`WAVE3.md` is already in the repo with its tracker — do not re-land it):
- Build plan §6d: the X-series table, mirroring §6c, one row per package with "Deliverable" and "Done when".
- One CLAUDE.md line under Session protocol: "Wave-3 packages (Xn from `WAVE3.md`, build plan §6d) count as work packages under the same rules."
- A REDESIGN.md addendum: **X1 supersedes** §2's "My decks leads to `/account` for signed-in users and to the browser's guest-deck section on home for guests" and WAVE2.md D1's two notes (the name as "label, not an item"; "guests need it for `/#your-decks`"). **X2 will supersede** W4's `LIKE` filter on `/commanders` and `/leaders`.
- `WAVE3.md` section F as `LATER.md` rows, each with its trigger. Rewrite the rows X1 itself changes: the claim-nudge row gains "X1 added the account-page list; the editor and share-page nudge stays open", and the token-routes row becomes fired.

**Then X1**: `pnpm check` green and deployed.

Verified **on prod, signed out, zero creates**:
- The header's My decks href is `/account` in the server HTML of home and of one hub, and in the phone menu.
- `/account` shows the sign-in block. With no deck tokens nothing else renders.
- The Like prompt on one public deck links `/account?next=…` with that deck's path.
- `/account?next=//evil.example` is served exactly like `/account`.
- The three token routes answer 404, signed out. `/api/auth/update-user` still answers 404.
- The route table diff is empty; `/account` stays `ƒ`; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`.

Verified **on dev**: the island with one guest deck (then deleted, census re-proven); both themes at 390 and 1440; no hydration warning.

**Handed to the owner, signed in on prod — three clicks:**
1. Go to Profile & settings from the menu, then choose your name in the menu. You should be at the very top, name and picture in view.
2. Scroll down and choose your name again, twice in a row. Same result both times.
3. Sign out. Open a public deck, choose Like, sign in. You should end on that deck.

Tests: `site-header.test.tsx` rewritten where the pin matrix says; new RTL for the island, the name row, the buttons' callback, the return after a claim and the prompts' hrefs; `next-path.test.ts`; `auth-disabled-paths.test.ts` extended.

Docs in the same package: the `WAVE3.md` tracker ticked with the sha and any deviation beside it; a dated ship note at the top of this file; memory updated; **`X2-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted — delete it when done), inside one `read only` transaction, body wrapped in `async function main()`.
- `.env.local`'s `DATABASE_URL` is prod's pooler. `source .env.local` fails in zsh; scripts load it with dotenv.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN` (a server on 3000 is reused). Stop it before `pnpm build` — they share `.next`. `next dev` re-adds the AGENTS.md block; commit it with your work.
- The browser pane is signed out on prod and on localhost. A hidden pane pauses rAF, stalls Base UI transitions and does not hydrate a tab until it is painted: verify menus through the DOM or in jsdom. Base UI menus in RTL need pointerDown + mouseDown + click (the `open()` helper in `site-header.test.tsx`); in the pane a bare click event opens them.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree. The island's fetch-then-set lives inside the async function, as `your-decks.tsx` does it.
- Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.
- Prod: curls need `--compressed`; ISR pages lag a deploy by up to an hour; the deck-create budget is 10 an hour and 30 a day per IP, and X1 creates no prod decks.

## Context, not tasks

- Sequence after X1: X2 suggest endpoint + browse dropdowns → X3 combo doors → X4a set filter + picker → X4b Sets page → X5 change picture. X3, X4 and X5 are reorderable at the owner's word; X4a and X5 need X2.
- The owner's answers of 2026-09-27 stand (WAVE3.md, Context). The defaults in WAVE3.md section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the X-series and get their own round, never a slice of an X-session. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds: no simulated decks, posts or metrics. Premium never gates card data.
- The owner's stored Discord picture link is dead, so the profile shows "B" until X5. That is expected, not a regression.
