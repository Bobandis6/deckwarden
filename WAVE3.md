# Deckwarden — Wave 3 plan (X-series): the owner's seven ideas

**Status:** drafted from the owner's answers of 2026-09-27 (four questions, recorded under Context). The defaults in section F are still open to change, except the dropdown's order, which the owner kept (prefix-first, 2026-09-27). X1 shipped on 2026-09-27 (`e42d6ad`), X2 the same night (`d88c70e`); X3 is next — the progress tracker is at the end of this file.
**Saved:** September 27, 2026, from a planning-only session against `8a4b501`. Nothing was implemented, installed, migrated or deployed. The production database was read (with the owner's approval) and never written.
**Canonical copy:** `WAVE3.md` in the repo root (this file).
**Working rules:** the CLAUDE.md session protocol applies unchanged — one package per session, deployed and `pnpm check`-green or not done, anything out of scope to `LATER.md` with a trigger. X1's step 0 adds build plan §6d, the CLAUDE.md line, the REDESIGN.md addendum and the LATER rows that make X-packages legal sessions.

> Verified when written: the repo is `/Users/danielson/Documents/Claude/deckwarden` (HEAD `8a4b501`, clean, level with origin). `pnpm check` = 959 tests in 121 files, the same 6 `no-unused-vars` warnings, 0 errors. Nightly ingest green through 2026-09-27 15:16 Z. One closed issue, zero open. Census unchanged: 27 user decks (26 Magic, 12 of them guest-owned, plus the owner's One Piece fixture), 181 precons, 1 user. Database 269.5 MB (alert 350). The owner confirmed nothing new was posted and no feedback arrived since the morning's P2.9 round 2. P4.9 (the image flip) has not run; its gate is not before 2026-09-28 07:17 Z.

## Context

Wave 2 finished on 2026-09-22 (W1 → W10). In P4.7 round 3 the owner asked for a fresh planning session and pasted seven ideas. This is that list, verbatim:

```text
* When you click my decks tab at the top have it take you to the sign in   page if you are not signed in yet 
* Once you choose a combo have a whole suggested deck list appear to quick add to your deck
* A predictive search drop down when you are searching commanders or cards when you start typing the first few letters
* Be able to search by magic sets that have been released
* have predictive  search when searching cards ( drop down menu when starting to type the first few letters of whatever you are searching )
* Have that top account name when clicking on the account name make it clickable to go to the top of the profile page (when you click the other options it takes it auto orientates to that section) but I want that to be the one that takes you to the very top of the page so it shows your name and everything.
* When on my account my discord profile seems to be the auto picture but its blacked out have an option to change the profile picture (like a little pencil icon when you hover over your profile picture on the account page
```

Numbering used below: (1) My decks → sign-in, (2) combo → suggested list, (3) predictive search for commanders and cards, (4) search by released sets, (5) predictive card search, which is (3) again, (6) account name → top of `/account`, (7) avatar broken + change picture.

Checked against the code, the database and the live site, the seven ideas are five pieces of work in three themes:

1. **Getting into your account** — My decks, the name in the menu, the profile picture (ideas 1, 6, 7).
2. **Finding things** — a predictive dropdown, search by set (ideas 3/5, 4).
3. **Starting from a combo** — a full suggested list from a chosen combo (idea 2).

Two of them were already partly done before this plan:

- **Idea 7's bug half is fixed** (`a508283`, P2.9 round 2). The empty circle was a dead Discord link with no fallback. `/account` and `/u/` now show the initial. What remains is the feature: change the picture.
- **Idea 2 is Wave-2 idea 3**, shipped in W9c as the editor's "Build around" button. What is missing is a way in from outside the editor, and a name that says what the button does.

**Decisions you confirmed on 2026-09-27:**

| Question | Your answer |
|---|---|
| What a signed-out visitor sees on My decks | The sign-in page, with this browser's decks listed under the buttons |
| Where the predictive dropdown appears | The Commanders and Leaders filter boxes, and the Cards page. Not the header, not the editor's list |
| Where "build a full list around this combo" is offered | Commander hub pages, and a clearer button in the editor. Not card pages |
| What "change picture" offers | Your Discord/Google picture, any Magic card's art, or your initial. No uploads |

---

## A. Recommended direction

**Build three things, in this order.**

1. **Fix the account paths first (X1).** My decks, the name in the menu, and getting back to where you were after signing in. Each is small, and together they are what a stranger meets in their first five minutes. The site is about to be announced, so these go first.
2. **One ranked name matcher, many boxes (X2, reused by X4a and X5).** The predictive dropdown is one slim endpoint and one autocomplete component. The set picker and the avatar's card-art picker reuse the component, so the second and third boxes cost much less than the first.
3. **Doors into what already exists (X3).** The combo list exists. The work is a button on the hub, a draft that opens already seeded, and a sheet that shows the combo it was built around.

**The decisions that matter most**

| Decision | Why |
|---|---|
| My decks always opens `/account`; the signed-out view lists this browser's decks | It does what you asked and keeps a guest's decks one click away. It also removes the header's session check: the link is the same string on the server and after hydration, so nothing swaps. |
| Signing in returns you to where you were, by way of `/account` | Today every sign-in prompt drops you on `/account` and forgets the deck you wanted to like. The claim of this browser's decks runs only on `/account`, so the return goes through it, never around it. The return path is validated by one pure helper; Better Auth validates the callback too. |
| Suggestions rank by play, inside match classes. Search's own default order is untouched | Measured: typing `atr` today ranks Atraxa's Fall, Atraxi Warden and Temple of Atropos first, and Atraxa, Praetors' Voice is not in the first eight. Ranked by play, `sol` gives Sol Ring, Solemn Simulacrum, Solphim. You chose to leave the editor's list alone, and its keyboard flow is pinned by tests. |
| A separate slim suggest route, not search with a small limit | A search row carries the card's full rules text (483 bytes for Sol Ring) and no hub slug, and its order is similarity. A suggest row needs a name, a link and a thumbnail. |
| No rate limit on suggest | It is a GET the edge caches for an hour (measured on search today: MISS, then HIT). A limiter costs one database write per uncached request, which is more load than the query it guards (2–15 ms). It gets a LATER row with a trigger. |
| "Released" is the set's own date, never `is_preview` | 202 of the 655 cards flagged as previews already have a released printing. The flag comes from whichever printing the bulk file lists first. |
| The set filter works on printings and shows that set's printing | Search is per card, and sets hang off printings. A Bloomburrow search should show the Bloomburrow printing and open the card page on it. 85 of Bloomburrow's 279 cards have more than one printing in the set, so the rule for which one to show is part of the contract. |
| The combo door seeds a draft. Nothing is saved until you accept | Deck creation is limited to 10 an hour and 30 a day per IP, and the product promise is "the first real edit creates exactly one deck". The door follows the `?leader=` and `?from=` precedent. |
| Combo pieces are pinned in the sheet | Today, unticking "Keep my N cards" and pressing Apply removes the very pieces the list was built around. |
| The chosen picture lives in its own column | Refreshing the provider picture at sign-in rewrites `users.image`. A choice stored there would be lost at the next sign-in. |
| Card-art pictures store a printing id and the artist's name, never a URL | The Neon rule (no stored Magic image URLs) and the Scryfall rule (the artist and © must be visible nearby). The URL is derived from the printing id; the credit line is built from the stored artist. |
| No uploads | An upload path needs a storage client, size and type checks, re-encoding, and a way to take down a stranger's image. None of that exists, and the site is about to be announced. |

---

## B. Current-state findings

**Who it serves.** A stranger arriving from a shared deck link who wants to like, fork or keep a deck. A brewer who knows part of a name. A player looking at a new set. A brewer who has found a combo and wants a deck around it. A signed-in user who wants the account to look like theirs.

**Verified against code, the database and the live site** (three read-only explorers at `8a4b501`; a signed-out prod pass with no rows minted; read-only queries inside one `read only` transaction):

| Idea | What exists today | Gap |
|---|---|---|
| 1 My decks | `useMyDecksHref` (`src/components/site-nav.tsx` 45–49) returns `/account` with a session and `/#your-decks` without. The phone menu uses the same hook (81, 104–106). `id="your-decks"` is rendered by the guest component `YourDecks` only after a client fetch returns at least one deck (`src/components/deck/your-decks.tsx` 64–68), and by `ContinueBuilding` for a session. **On prod a guest with no deck tokens lands on plain home: the HTML has no `id="your-decks"` and no sign-in prompt.** Signed-out `/account` is the sign-in page (`src/app/(site)/account/page.tsx` 101–112). | The link target, and a sign-in view that also shows a guest's decks. |
| 1 Return path | None. `callbackURL: "/account"` is hard-coded (`src/components/auth/sign-in-buttons.tsx` 26) and `SignInButtons` takes no props. Every prompt links bare `/account`: Like and Bookmark (`src/components/deck/engagement-buttons.tsx` 54–55, 63–64), Fork (`src/components/deck/fork-button.tsx` 34–35), the header's Sign in (`src/components/auth/account-slot.tsx` 58–60), home's copy, the editor's collection hint. `ClaimDecks` runs only on signed-in `/account` (page 202). | A validated return path that still passes through `/account`. |
| 2 Combo → list | The editor's Combos tab lists "With your commander" rows (5 of the API's top 10) with **Add N pieces** and **Build around** (`src/components/editor/combo-radar-panel.tsx` 497–510). Build around adds the missing pieces and opens the autofill sheet. "In your deck" rows have no buttons; "One card away" rows have a single Add. Hub and card-page lists are a read-only server component (`src/components/combos/combo-list.tsx`). No route looks a combo up by its key, and the autofill request cannot name a combo. The sheet shows no combo context, and its "Keep my N cards" box can drop the pieces. | A door on the hub, a lookup route, a seeded draft, pinned pieces, a clearer label. |
| 3/5 Predictive search | No dropdown on any browse surface. `/commanders` and `/leaders` are GET forms named `q` (`commanders/page.tsx` 112–128; `leaders/page.tsx` 102–118) over a plain `LIKE` (`src/lib/hub/queries.ts` 48–53). `/cards` updates a 60-card grid as you type (250 ms). The editor's search pane is a hand-rolled combobox over 20 rows (200 ms). Base UI 1.7.0 ships `autocomplete` and `combobox`, unused; `src/components/ui/` has neither. | The endpoint, the component, three boxes. |
| 4 Search by set | No set filter anywhere. Typing `set:blb` into `/cards` returns 0 cards (it is read as a name). `FieldTarget` can name an identity column or a JSONB path, not a printing (`src/lib/games/types.ts` 166–179). No sets route, loader or page exists. | A new filter kind, a sets list, a picker, the in-set image. |
| 6 Account name | The menu's first row is a static `DropdownMenuLabel` (`account-slot.tsx` 96). The four links go to `/account#decks`, `#bookmarks`, `#collection`, `#settings` (43–48). The top of `/account` is an id-less `<section>` (page 187–197). The in-page nav is plain `<a href="#…">` anchors (`src/components/account/account-nav.tsx` 24). | The name as a link that always lands at the top. |
| 7 Change picture | The display bug is fixed. `users.image` is written once, at sign-up: `src/lib/auth.ts` 53–62 sets no per-provider options. The owner's stored link still answers 404, so the profile shows "B". `PATCH /api/profile` accepts only `username`. Better Auth's `/update-user` is closed (`src/lib/auth-disabled-paths.ts`). No upload path, storage client or image dependency exists. The art resolver exists: `fetchScryfallArtMeta` and `artCredit` (`src/lib/cards/art.ts`). | A column, a route, a dialog, three render sites, a credit line. |

**Measured on 2026-09-27** (read-only; times include cold buffers on the first touch):

| What | Number |
|---|---|
| Live cards | 35,349 Magic (3,020 with no EDHREC rank) · 2,785 One Piece (none ranked) |
| Leaders | 4,064 Magic (489 with no rank) · 142 One Piece. **Every one has a hub slug** |
| Magic sets | 1,053 in the table · 61 digital-only · 12 not yet released · 773 carry live cards |
| Released paper sets with cards | **706.** Expansion 116, core 23, commander 43, masters 18, draft innovation 17 (= 217 "main"); promo 271, memorabilia 57, token 26, duel deck 26, box 23, funny 22 and 10 smaller types make up the rest |
| Collector numbers | 109,848 live Magic printings: 92,529 are digits only, 9,453 are digits plus a suffix, 7,630 start with something else. Bloomburrow's 397 are all digits |
| Set codes | Magic: lowercase letters and digits, 3–6 characters. One Piece: 60 sets, Bandai labels (`OP-01`, `EB-01`), every release date NULL |
| `is_preview` | 655 cards flagged; 202 of them have a released printing |
| Bloomburrow | 279 cards; 85 have more than one printing in the set (up to 6) |
| Combos | 66,135, all ranked; 2–10 card pieces (mean 3.33); 3,012 also need a non-card requirement |
| Suggest-shaped queries | whole-text prefix 2.4–15.5 ms · word prefix 2.9–7.7 ms · leaders only 0.2–3.8 ms, all through `ci_name_trgm` |
| Today's search shape | 6.1 ms for `sol r` |
| Set filter | 73 ms cold for all of Bloomburrow in name order; 18.6 ms with a name |
| Search row size | 483 bytes for Sol Ring (full `attrs`) |
| Edge cache on `/api/cards/search` | MISS, then HIT with `age: 1` on the same URL |

**Validation corrections** (what the planning prompt and its addendum had wrong, or had not measured)

- "A leader can still have a NULL slug" is true of the schema and false of the data: 0 of 4,064 and 0 of 142.
- "`atraxa praetors` likely cannot match on `/commanders`" is now measured: no match, and `kiki jiki` fails too. The normalizer keeps commas, apostrophes and hyphens, and the hub filter is a bare `LIKE`. The search API does find both, through its trigram arm.
- The hub's combo total moves with the nightly ingest: Kiki-Jiki read 73 in the morning's walk and 69 in the evening's. Tests must pin the sentence, never the number.
- The "Start with a starter shell" anchor is in the hub's server HTML. The byte-identical rule covers the pinned "Build with this commander" anchor and keeps "Use for …" out of server HTML. It does not freeze the row.
- No smoke checks any W9c page surface (the starter-shell anchor, Surprise me, "With your commander", Build around). Only the API sections of `smoke:autofill` cover W9c.
- `hub-build-cta.tsx`'s comment cites `seo-smoke:339-343`; the One Piece check is at 351–357 now.
- Card-page combo lists are not filtered by color identity; only the hub and the editor pass a fit mask. A card-page door would need its own commander step.
- `AccountNav` has three entries and no Bookmarks. `#bookmarks` is a block nested inside `#decks`.
- The search translator's name match does not escape `%`, `_` or `\`. The hub filter does.
- The header's initial uses `charAt(0)`; `UserAvatar` uses the first code point (LATER row 110).
- A signed-in user at `md` and wider sees "My decks" twice: the nav link (`/account`) and the menu item (`/account#decks`).
- Better Auth 1.7.2 validates `callbackURL`. A root-relative path passes when it has no `//`, no backslash, no control character and no encoded separator in its path part (`better-auth/dist/auth/trusted-origins.mjs` 66–76, `isSafeRelativeURL`). A return path can ride in the query: `/account?next=%2Fd%2Fabc` passes.
- The installed Base UI Autocomplete accepts `filter={null}` and `mode="none"` for lists filtered by the server, and has `submitOnItemClick` (default off).

**Strengths to preserve (non-negotiable in every package)**

- Everything in WAVE2.md section B's list still holds: the keyboard script; "the first real edit creates exactly one deck"; ISR on `/c/`, `/l/`, `/cards/[id]`; evidence or nothing; adapter purity; the smoke-pinned strings; the Neon budget.
- The `(site)` layout and the header never read request data. Header islands read the session through the Better Auth client only, and the guest branch never calls `useRouter` (the error and 404 shells render it without a router).
- `/account` stays the landing spot of every sign-in, because the claim runs there.
- A GET parameter alone never edits a saved deck. Seeds are state only and live in drafts.
- The search API's default order, its row shape and its One Piece card-number pass stay as they are. Additions are additive.
- No recommendation without a named source. The sheet stays "a starter shell, not a tuned list".
- Card images are hotlinked unoptimized. An art crop never renders without its artist and © line.

**Assumptions and limits**

- Signed-in surfaces were read from source and from their tests, not seen live: the browser pane is signed out on prod and on localhost. X1 and X5 each end with a short list of clicks for the owner.
- Query times are single cold runs on Neon's pooler. Each package re-measures its own query warm and records the plan.
- The scroll-to-top behavior of a same-page link was read from Next 16.3.2's source (`#top` is special-cased in `layout-router.js`), not tested in a browser. X1 states the outcome and proves the mechanism.
- Whether refreshing the provider profile at sign-in can fail on a changed email (the column is unique) is unverified. X5 tests it against Better Auth's in-memory adapter before it touches the config.
- One Piece thumbnails in a dropdown follow whatever P4.9 decides. `thumbnailUrl()` is the single gate, so X2 needs no One Piece image decision of its own.

---

## C. Prioritized idea map

Effort: **S** < ½ session · **M** ½–1 session · **L** > 1 session (split). Priority: **Now** = before you announce the site · **Next** = the following run of sessions · **Later** = trigger-gated in `LATER.md`.

| # | Your idea | Treatment | Package | Priority | Effort | Depends on | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | My decks → sign-in when signed out | **Include, refined**: one link for everyone; the sign-in page also lists this browser's decks | X1 | Now | S | — | Your ask, without hiding a guest's decks. Fixes the dead end a new guest hits today. |
| 6 | The account name goes to the top of the account page | **Include** | X1 | Now | S | — | One menu row. The only care needed is landing at the top when you are already on the page. |
| 7a | Picture shows blacked out | **Done** (`a508283`) | — | — | — | — | Fixed in P2.9 round 2. |
| 3, 5 | Predictive dropdown for commanders and cards | **Include, merged**: one suggest endpoint, one component, three boxes | X2 | Now | M | — | The hub index has 4,064 commanders. Finding one by typing three letters is the fastest path on the site. |
| 2 | Choose a combo → a whole suggested list | **Include, refined**: a hub door into a seeded draft; pinned, labeled pieces; a button that says what it does, on every combo row in the editor | X3 | Next | M | — | The list exists since W9c. The gap is the way in and the wording. |
| 4 | Search by released Magic sets | **Include, split**: a filter and picker on `/cards` first; a browsable Sets page second | X4a, X4b | Next | M + S–M | X2's component | A new filter kind in the search contract. The page is the cheap half once the list exists. |
| 7b | Change the profile picture | **Include, refined**: provider picture, card art, or initial; pencil on hover, focus and touch | X5 | Next | M–L | X2 | The card-art picker is X2's dropdown with a different action. |
| 3, 5 | — in the site header, on every page | **Defer** (your choice) | Later | Later | M | X2 | A client island on every page. Worth it once people search from pages that have no box. |
| 3, 5 | — in the editor's quick-add list | **Defer** (your choice) | Later | Later | M | X2 | Changes a keyboard flow that tests pin. |
| 2 | — on card pages | **Defer** (your choice) | Later | Later | M–L | X3 | A card page has no commander; the door needs a "choose one that fits" step. |
| 7b | — upload your own image | **Defer** (your choice) | Later | Later | L | — | Needs moderation and a storage path that do not exist. |
| 4 | — One Piece sets, digital-only sets, typed `set:` syntax | **Defer, flagged** | Later | Later | S each | X4a | You asked for released Magic sets. One Piece has no release dates; typed syntax would be the first of its kind here. |

**My additional recommendations** (labeled; all small)

| Id | Recommendation | Benefit | Effort | Tradeoff | Where |
|---|---|---|---|---|---|
| REC-1 | A return path after sign-in: Like, Bookmark and Fork send `?next=` and the account page sends you back once this browser's decks are claimed | A stranger who signs in to like a deck ends up on that deck, not on an empty account page | S–M | One validated parameter on `/account`; the header's own Sign in link stays plain | X1 |
| REC-2 | The `/cards` grid uses the same order as its dropdown, through a new `sort` value | The first tile matches the first suggestion | S | One more sort key in the search API; the default order and the editor are untouched | X2 |
| REC-3 | The `/commanders` and `/leaders` filter uses the shared matcher | `atraxa praetors` and `kiki jiki` find their commanders; today both return nothing | S | W4's `LIKE` filter is replaced; its test pins move | X2 |
| REC-4 | A Sets page (`/sets`) and a Browse entry | "Search by set" becomes something you can browse, and a page search engines can index | S–M | One more nav entry; two header-test arrays change again | X4b |
| REC-5 | `username` in the client session and "Public profile ↗" in the account menu | Fires LATER row 80 for the cost of one more field; X5 adds the session fields anyway | S | The menu grows by one row | X5 |
| REC-6 | Close the three unused Better Auth token routes | LATER row 108's own trigger is "before the r/EDH post"; X1 ships first, so it is the package surest to land before the post | S | Three more entries in `AUTH_DISABLED_PATHS`; both existing pins extend naturally | X1 |
| REC-7 | Smoke pins for the hub's combo door and the W9c anchors | W9c's page surfaces have no smoke today | S | A few more greps in `smoke:hubs` | X3 |
| REC-8 | Land the contract in the repo first | Matches how the R- and W-series ran; X1 supersedes two recorded decisions and must say so | S | Docs time | X1 step 0 |

---

## D. Design specification

### D0. Shared rules

**Retain** everything in WAVE2.md D0: tokens, the primary button's gold hairline, Literata for titles and Geist for controls and data, the states vocabulary, the icon set, the motion policy. Wave 3 adds no color, no font and no layout change.

**One new primitive: `ui/autocomplete.tsx`.** Hand-written over `@base-ui/react/autocomplete` (installed, 1.7.0), reusing the dropdown popup classes — the W3 `ui/context-menu.tsx` precedent, no `shadcn add`. Parts used: Root, Input, Portal, Positioner, Popup, List, Item, Empty, Status, Group, GroupLabel.

**Popup rules, for every box that uses it**

- It opens at two typed characters and shows at most 8 rows.
- It is as wide as its input, never narrower than 18 rem. Rows are 44 px on coarse pointers.
- While a request is in flight the previous rows stay. No spinner, no flicker.
- Nothing matched: one row, "No matches". A failed request closes the popup quietly; the box underneath still works.
- ↓ and ↑ move. Enter picks the highlighted row. **Enter with no row highlighted does what the box did before** (submits the form, or nothing). Esc closes and keeps the text. Nothing is highlighted until an arrow key is pressed.
- A `role="status"` line announces the count.

**Icons** (lucide, installed): change picture `Pencil` · sets `Layers` · search `Search` · the combo door reuses Autofill's `WandSparkles`. Always beside a text label, except the pencil (`aria-label="Change picture"`).

**Words.** "Starter shell" and "every pick shows why" stay. A button names its outcome.

### D1. Account paths (X1)

Purpose: get to my decks, get to my account, and get back to what I was doing.

```text
HEADER (every page, signed in or not)
[crest] Deckwarden   Build   Browse ▾   My decks ──► /account        one href for everyone; no session check

/account, signed out                          /account, signed in
┌───────────────────────────────────┐          ( B )  Bobandis6                  ← the top of the page
│             Sign in               │                 @bobandis6
│ An account keeps your decks       │          Decks · Collection import · Settings
│ across browsers and devices. …    │          …
│ [ Sign in with Discord ]          │
│ [ Sign in with Google  ]          │
│                                   │
│ ON THIS BROWSER · 2 decks         │  ← client island; renders only when this browser holds deck tokens
│ Sign in to keep them on every     │
│ device.                           │
│ [tile] Untitled deck              │     tiles open the editor, as they do on home
│ [tile] Krenko — Mob Rule          │
└───────────────────────────────────┘

ACCOUNT MENU (signed in)
┌───────────────────────────┐
│ Bobandis6                 │ ← now a link: /account, landing at the very top
├───────────────────────────┤
│ My decks                  │ /account#decks
│ Bookmarks                 │ /account#bookmarks
│ Collection                │ /account#collection
│ Profile & settings        │ /account#settings
├───────────────────────────┤
│ Sign out                  │
└───────────────────────────┘

RETURN PATH (REC-1)
/d/abc123 ── Like, signed out ──► /account?next=%2Fd%2Fabc123 ── Sign in with Discord ──► Discord
   ──► /account?next=%2Fd%2Fabc123, signed in ── this browser's decks are claimed ──► /d/abc123
```

- **My decks.** `MyDecksLink` and the phone menu link `/account`. `useMyDecksHref` and its session read are deleted. Home keeps its guest section and its `id="your-decks"`; it is content, no longer a nav target.
- **The signed-out account page.** The sign-in block is unchanged: the h1, the copy, the two buttons. Under it sits the island "On this browser · N decks" with the line "Sign in to keep them on every device." It reads the token store, POSTs the existing `/api/decks/mine`, and renders `DeckTile`s. With no tokens, or when the request fails, it renders nothing.
- **The name row.** First in the menu, a link, the name alone. Choosing it lands at `scrollY` 0 from anywhere — from another page, from `/account#settings` reached through the in-page nav, and on a second click in a row. The mechanism is the package's to prove. Two candidates: `href="/account#top"` (which Next special-cases), or `href="/account"` plus a scroll to the top on click when the path is already `/account`.
- **The return path.** `next` is a root-relative path checked by one pure helper, `safeNextPath()`: one leading `/`, no `//`, no backslash, no control character, not `/account`, not `/api/`, at most 200 characters. An invalid value is ignored silently. Like, Bookmark and Fork pass the deck's own path. The header's Sign in stays `/account`: adding the current path there would mean a router hook in the guest header, which the error and 404 shells render without a router.
- **After sign-in with a valid `next`.** The claim runs first. Then the page replaces itself with `next`, under a `role="status"` line "Signed in — taking you back…" with the link beside it. With no tokens to claim the return is immediate.
- Phone: nothing special. Tiles stack; the menu is the same menu.

### D2. Predictive dropdown (X2)

Purpose: find a commander or a card by typing the start of its name. Primary action: pick a row.

```text
/commanders                                            /cards
[ atr|                          ]  All (W)(U)(B)…       Name
┌───────────────────────────────────────┐               [ sol|                       ]
│ [▮] Atraxa, Praetors' Voice    (WUBG) │ → /c/<slug>    ┌──────────────────────────────────────┐
│ [▮] Atraxa, Grand Unifier      (WUBG) │                │ [▮] Sol Ring              Artifact   │ → /cards/<id>
│ [▮] Atreus, Impulsive Son      (…)    │                │ [▮] Solemn Simulacrum     Artifact … │
│ [▮] Atris, Oracle of Half-Truths (…)  │                │ [▮] Solphim, Mayhem Dominus  …       │
│ [▮] Ulalek, Fused Atrocity     (…)    │                │ [▮] Solve the Equation    Sorcery    │
│ [▮] Ixhel, Scion of Atraxa     (…)    │                │ [▮] Solitude              …          │
│ ───────────────────────────────────── │                └──────────────────────────────────────┘
│ Show every commander matching “atr” ↵ │ = the form     N cards        ← the grid keeps updating as you type
└───────────────────────────────────────┘
   (both lists are the measured result of the ranking below, 2026-09-27)
```

- **What picking does.** On `/commanders` and `/leaders` a row opens that hub. On `/cards` a row opens the card page, for leaders too (the card page links to the hub).
- **What Enter does.** With no row highlighted, `/commanders` and `/leaders` submit the form and filter the list, as today. On `/cards` the grid is already live.
- **Without JavaScript** the two forms still work: the island renders the same `<input name="q">` on the server.
- **A row** is a 26 × 36 thumbnail (the `small` rendition, lazy), the name, and one quiet detail: color chips for a leader, the type line for a card, the card number for One Piece. One Piece thumbnails follow `thumbnailUrl()`: a spacer until P4.9 decides their size.

**The ranking contract** (one shared module; the endpoint, the hub filter and the `/cards` grid all read it)

1. The name is exactly what was typed.
2. The name starts with what was typed.
3. Every word typed starts a word in the name. A word starts after a space or a hyphen, so `jiki` finds Kiki-Jiki.
4. Every word typed appears somewhere in the name, inside a word included. **The filter and the grid accept this class, ranked last. The dropdown does not**: `atr` would otherwise offer Rakdos, P*atr*on of Chaos.
5. Only if fewer than 8 rows were found and at least 4 characters were typed: near misses, by trigram similarity. This is what finds Urza's Saga from `urzas saga`.

Inside a class, Magic orders by EDHREC rank (most played first, unranked last), then by name. One Piece has no rank: leaders first, then name, then card number. A One Piece card-number prefix (`OP01-02`) takes the existing id pass and lists by number.

**Acceptance examples.** "Today" is the live site on 2026-09-27. "After X2" is the contract above run against the live data the same day, read-only.

| Typed | Today | After X2 |
|---|---|---|
| `atr` on `/cards` | Atraxa's Fall, Atraxi Warden, Temple of Atropos lead; Atraxa, Praetors' Voice is not in the first 8 | Atraxa, Praetors' Voice · Atraxa, Grand Unifier · Atreus, Impulsive Son |
| `sol` | Sol Ring, Sol Grail, Soliton, Sol Talisman | Sol Ring · Solemn Simulacrum · Solphim, Mayhem Dominus · Solve the Equation |
| `opt` | — | Opt first: an exact name outranks everything |
| `kr` on `/commanders` | the form filters on Enter only | Krenko, Tin Street Kingpin · Krenko, Mob Boss |
| `atraxa praetors` on `/commanders` | "No commanders match" | Atraxa, Praetors' Voice |
| `kiki jiki` on `/commanders` | "No commanders match" | Kiki-Jiki, Mirror Breaker |
| `urzas saga` on `/cards` | Urza's Saga first (through the trigram arm) | Urza's Saga first (class 5) |
| `at` | 4,405 matches led by Atog and At the Zoo | Atarka, World Render · Atsushi, the Blazing Sky · Atomize |
| `ring` | — | Rings of Brighthearth first. **Sol Ring needs `sol`**: names that start with the text come before names that contain the word (section F) |
| `zoro` on One Piece | — | Zoro-Juurou (both printings), then the Roronoa Zoro leaders, each row with its card number |
| `a` | — | no request, no popup |

**The endpoint.** `GET /api/cards/suggest?game=mtg|optcg&scope=cards|leaders&q=…` → `{ q, results }`, at most 8 rows of `{ id, name, slug, isLeader, typeLine, colorsMask, ciMask, externalKey, image }`.

- Caching intent: dynamic rendering (query-string driven) with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Card names change once a night.
- The client sends the text already normalized (the shared normalizer is a pure function), so `Sol`, `sol` and `sol ` are one cache key.
- Fewer than two characters: an empty 200 and no query.
- One statement. A second, the trigram pass, runs only for class 5.
- `scope=leaders` means leader candidates with a slug. Banned commanders stay in: their hubs exist for reference.
- No rate limit (section A).

**Debounce** 150 ms. Stale requests are aborted.

### D3. Combo doors (X3)

Purpose: go from a combo to a deck. Primary action: **Build around this combo**.

```text
/c/kiki-jiki-mirror-breaker
Combos with Kiki-Jiki, Mirror Breaker
The 10 most-played of 69 combos using this commander that fit its color identity, from Commander Spellbook.
┌──────────────────────────────────────────────────────────────────────────┐
│ Kiki-Jiki, Mirror Breaker + Zealous Conscripts                           │
│ (what the combo produces, as today)                                      │
│ How it works on Commander Spellbook ↗        [ Build around this combo ] │ ← new: a plain link in server HTML
└──────────────────────────────────────────────────────────────────────────┘
   └► /decks/new?game=mtg&leader=<oracle id>&combo=<spellbook id>&autofill=1
        the draft opens with Kiki-Jiki as commander and Zealous Conscripts in the deck — state only, no deck row
        and the sheet opens:

Build around this combo                                                      [×]
Kiki-Jiki, Mirror Breaker + Zealous Conscripts. The rest comes from real play data — every pick shows why.
Budget (All)(≤ $5 a card)(≤ $1 a card)                            [⟲ Reroll]
┌──────────────────────────────────────────────────────────────────────────┐
│ Combo pieces · 1                                          always kept    │
│   ✓ Zealous Conscripts      Combo piece                            $…    │
│ ☑ Lands · 37                                                             │
│ ☑ Mana value 2 · 13                                                      │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
Also needs: (any non-card requirement, as today)
A starter shell, not a tuned list …                   [Cancel]  [Add 98 cards]

EDITOR · Combos tab
WITH YOUR COMMANDER
  Kiki-Jiki ✓ + Zealous Conscripts            In N decks · How it works ↗
  [ Add 1 piece ]   [ Suggest full list ]         ← was "Build around"
IN YOUR DECK
  … complete                                  [ Suggest full list ]      ← new
ONE CARD AWAY
  … [ Add ]                                   [ Suggest full list ]      ← new; adds the missing piece first
```

- **The hub door** renders only where "Build with this commander" renders: a legal commander, and an adapter that declares autofill. It is server HTML, so the hub stays ISR. Card pages pass no door.
- **Seeding** is one GET. The combo route returns the pieces as full card wires. The piece whose key is the `leader` parameter goes to the command zone and the rest go to the deck. The sheet waits for the seed to settle, as it does for `?leader=`. A `combo` with no `leader`, an unknown key, or a leader that is not one of the pieces seeds nothing and says so in a toast — the unknown-`from=` precedent.
- **Pinned pieces.** The sheet takes the combo as context. Its pieces are always sent as `keep`, always survive Apply, and show in their own group labeled "Combo piece". "Keep my N cards" governs the other cards only.
- **The editor's button** reads "Suggest full list", with the title "Keeps these pieces and suggests the rest of the deck". In the editor the adds stay real edits, as they are today: the pieces save, and cancelling the sheet leaves them in the deck.
- One Piece: no combos, no door, no apology copy.

### D4. Set search (X4a) and the Sets page (X4b)

Purpose: see the cards of one set. Primary action: choose a set.

```text
/cards
Name                     Type           Color identity        Set                     ← new group, Magic only
[ Search card names… ]   [Any type ▾]   (W)(U)(B)(R)(G)(C)    [ Any set          ▾ ]
                                                               ┌───────────────────────────────┐
                                                               │ [ blo|                      ] │
                                                               │ MAIN SETS                     │
                                                               │ Bloomburrow           BLB 2024│
                                                               │ Bloomburrow Commander BLC 2024│
                                                               │ OTHER PRODUCTS                │
                                                               │ Bloomburrow Promos   PBLB 2024│
                                                               └───────────────────────────────┘
[ Set: Bloomburrow (BLB) × ]   Clear all
279 cards                        ← in collector-number order; every tile shows its Bloomburrow printing
[tile][tile][tile] …             → /cards/<id>?printing=<that printing>

/sets                                                          (X4b)
Sets   (serif h1)                                  [Magic: The Gathering]
Every released Magic set, newest first. Pick one to see its cards.
[ Filter sets… ]    ☑ Main sets only
2026 ────────────────────────────────────────────────────────────
The Hobbit                     HOB   Expansion    Aug 14, 2026   N cards →
Marvel Super Heroes            MSH   Expansion    Jun 26, 2026   N cards →
2025 ────────────────────────────────────────────────────────────
```

- **"Released"** means the set's date is today or earlier (UTC), the set is not digital-only, and it carries at least one live card. 706 sets qualify today. The 12 upcoming sets appear on their date.
- **Main sets** are expansion, core, masters, commander and draft innovation (217 today). Everything else is listed under "Other products".
- **The picker** is built on X2's `ui/autocomplete.tsx`, filtering a local list by name or code. The list is fetched the first time the picker opens.
- **The URL** is `/cards?set=blb`, read once at load like the page's other parameters.
- **The image and the link.** With a set chosen, each tile shows that set's printing and links to `/cards/<id>?printing=<id>`. Where a card has several printings in the set, the one with the lowest collector number shows (numeric first, then text).
- **Order.** With a set and no name: collector number. With a name: relevance.
- **Cards not yet released** stay findable by name, as today. They are simply not reachable through the picker.
- **The Sets page** is one static ISR page (`revalidate = 86400`) with a client filter island — the `/precons` pattern. Every row links to `/cards?set=<code>`.

### D5. Change picture (X5)

Purpose: make the account look like mine. Primary action: choose a picture.

```text
/account, signed in
 ┌─────┐
 │  B ✎│   Bobandis6                ← the picture is a button. The pencil shows on hover and on focus,
 └─────┘   @bobandis6                  and always on touch screens.
           Picture: Sol Ring · Art: {artist} · ™ & © Wizards of the Coast      ← only when card art is chosen

Change picture                                                        [×]
( ● ) Discord picture     [photo]   Updates each time you sign in.   [ Refresh now ]
( ○ ) Card art            [ art ]   [ Search a Magic card…        ]
( ○ ) Just my initial     [  B  ]
                                                   [ Cancel ]   [ Save ]
```

- **Where the picture shows:** `/account` (48 px), `/u/<username>` (64 px) and the header (24 px). Deck bylines are text.
- **The credit line** sits under the name on `/account` and `/u/`, and as one quiet line under the name inside the account menu. It is built by `artCredit`, the one builder the ambient art already uses. No artist, no art.
- **What is stored.** A new column, `users.avatar` (jsonb, nullable). NULL means the provider picture. `{"kind":"initial"}` means the initial. `{"kind":"art","printingId":…,"cardName":…,"artist":…}` means card art. No URL is stored; the image is derived from the printing id.
- **The provider picture** is refreshed whenever you sign in. "Refresh now" is that same sign-in round trip. The refresh must change the picture only: the name and the email stay as they are unless X5 proves a wider refresh harmless.
- **Card art** is the default printing's art crop, front face, Magic only. One Piece art stays off until Bandai answers. The search box lists Magic cards, with no apology copy.
- **The header** needs the choice without a server read. It rides in the client session as a Better Auth additional field that clients cannot write. After Save the client refetches the session with the cookie cache bypassed, so the header changes at once.
- **Save** goes through a new route, `PUT /api/profile/avatar`, signed-in only and limited per user. Better Auth's `/update-user` stays closed.
- Keyboard: the picture is a tab stop; Enter opens the dialog; the three choices are a radio group; Esc cancels. Touch: the pencil badge is always visible, 44 px target.

### D6. Before → after

| Moment | Before | After |
|---|---|---|
| A new visitor clicks My decks | Lands on the home page with nothing about decks and no way to sign in | The sign-in page, with any decks built on this browser listed under the buttons |
| A stranger signs in to like a shared deck | Ends on an empty account page; the deck is gone from view | Signs in and is back on the deck, ready to like it |
| You click your name in the menu | Nothing: it is a label | The top of your account, name and picture in view |
| A brewer types `atr` | Atraxa's Fall, Atraxi Warden, Temple of Atropos | Atraxa, Praetors' Voice, one keypress from her hub |
| A player wants Bloomburrow's cards | No way to ask; `set:blb` finds nothing | Choose Bloomburrow; 279 tiles in collector order, each showing its Bloomburrow printing |
| A brewer finds a combo on a commander's page | Reads it, opens Commander Spellbook, starts from nothing | **Build around this combo** opens a draft with the commander, the pieces and a full suggested list |
| Your profile picture | "B", because the stored Discord link died | Your current Discord picture, any card's art with its artist credited, or the initial by choice |

---

## E. Implementation roadmap

Session protocol is unchanged (CLAUDE.md): one package per session, deployed and `pnpm check`-green or not done, out-of-scope items to `LATER.md` with a trigger, every migration eyeballed, caching intent stated on every new route. Paths marked **(new)** are proposals; every other path was verified in the repo at `8a4b501`.

```text
NOW    X1 Account paths ─► X2 Suggest endpoint + browse dropdowns
NEXT   X3 Combo doors ─► X4a Set filter + picker ─► X4b Sets page ─► X5 Change picture
LATER  header search / ⌘K · editor quick-add order · combo door on card pages · picture uploads ·
       One Piece sets · digital-only sets · typed set: syntax · suggest rate limit · choose-a-printing art
```

X3, X4 and X5 do not depend on each other. X4a and X5 need X2's component. Reorder them at the owner's word; a warm beta signal still outranks any package.

### X1 — Account paths (M) → detailed in section G

### X2 — Suggest endpoint + browse dropdowns (M)

- **Objective**: typing two letters in the Commanders, Leaders or Cards box offers the most-played matches, and picking one opens it.
- **Prereqs**: none. No migration.
- **Steps**
  1. **(new)** `src/lib/search/name-match.ts` (pure, unit-tested): tokenizing a normalized query, LIKE escaping, the match condition, the rank-class expression. It is the only place the D2 ranking contract lives.
  2. **(new)** `src/app/api/cards/suggest/route.ts` — zod `{ game, scope, q }`; the One Piece id pass through the existing `searchIdPrefix`; the slim select with the default-printing join; `thumbnailUrl()` for the image; the caching intent from D2.
  3. **(new)** `src/components/ui/autocomplete.tsx` (D0).
  4. **(new)** `src/components/search/name-suggest.tsx` (client): the input and the popup, with props for game, scope, the input's `name`, the row's href and an optional footer row. It owns the debounce, the abort and the normalized request key.
  5. `/commanders` and `/leaders`: the island replaces `<Input>` inside the same GET form (`commanders/page.tsx` 112–128, `leaders/page.tsx` 102–118). The label, the placeholder, the hidden `colors` input and the pick banner stay.
  6. `/cards`: the Name box in `src/components/cards/card-search.tsx` (216–224) becomes the island, still controlled by `q`. `autoFocus` stays.
  7. REC-3: `nameNormLikeCondition` (`src/lib/hub/queries.ts` 48–53) becomes the shared match condition. REC-2: `sort=best` in the search route, sent by `/cards` when a name is typed. The translator's name arm gains the LIKE escape.
- **Acceptance**: D2's table, row by row. `/api/cards/suggest` answers in one statement (two for class 5), counted with `DB_LOG=1`, with the plan and the warm time recorded. A second identical request is an edge HIT on prod. `/commanders?q=atraxa praetors` lists Atraxa, Praetors' Voice. With scripts disabled the `/commanders` form still filters. The editor's search pane returns byte-identical results for `sol`, `atr` and `OP01-02` before and after (the default order is untouched). `/c/`, `/l/` and `/cards/[id]` stay `●`; the route table gains exactly one `ƒ`.
- **Checks**: `pnpm check`; `smoke:hubs`, `smoke:optcg`, `smoke:seo` on dev; `search:canned`; RTL for the island (opens at two characters, Enter with no highlight submits the form, a pick navigates, Esc keeps the text, a failed request closes quietly).
- **Risks**: Base UI popups in a hidden browser pane (verify through the DOM and RTL); a two-letter query matching thousands of rows (the limit is in SQL, and the plan is recorded); relevance surprises where an obscure exact name loses to a popular near match (class 1 outranks everything).

### X3 — Combo doors (M)

- **Objective**: from a combo on a commander's page to a draft with the commander, the pieces and a suggested list, in one click; and an editor button that says what it does.
- **Prereqs**: none. No migration.
- **Steps**
  1. `src/lib/combos/queries.ts`: **(new)** `loadComboByKey(externalKey)` returning the `ComboView`.
  2. **(new)** `src/app/api/combos/[key]/route.ts` — `GET`; the key validated against the stored shape; **caching intent: dynamic rendering with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`**, the miss cache for an unknown key; returns `{ combo, cards }` with the pieces as card wires through `loadCardWires` (`src/lib/cards/wire.ts` 68); no rate limit (the `cards/[id]/combos` stance).
  3. `src/components/combos/combo-list.tsx`: an optional `buildHref(combo)` prop. The hub passes it (`c/[slug]/page.tsx` 312–328) under the same two conditions as its build CTA (214–221).
  4. `src/app/decks/new/new-deck-chooser.tsx` latches `combo` beside `leader` (34–35). `DeckEditor` gains `draftComboKey`. **One seeder** places the leader and the pieces from the combo route's response, state only, and sets `seedSettled` once. `seedExpected` (`deck-editor.tsx` 1013–1017) learns the new prop.
  5. `src/components/editor/autofill-sheet.tsx`: a `pinned` prop (piece ids and a title). Pinned ids are always in `keep` (148) and always in the list Apply builds (243–250). They render as the "Combo pieces" group. The title and the lead sentence follow D3.
  6. `src/components/editor/combo-radar-panel.tsx`: the label change (507), the button on "In your deck" and "One card away" rows, and the pinned context passed when the sheet opens.
  7. REC-7: `smoke:hubs` pins the door's anchor and the hub's "Start with a starter shell" anchor; `smoke:seo` pins home's "Surprise me" link; `smoke:autofill` gains a combo-route section. LATER row 104 is rewritten as fired.
- **Acceptance**: D3, plus — the door opens a draft and **no `POST /api/decks`** fires until Apply or a first edit; the sheet's POST sends the pieces as `keep`; unticking "Keep my N cards" and applying still leaves every piece in the deck; Apply is one edit with Undo; a crafted `?combo=` with no leader, or with a key that does not exist, seeds nothing and says so; `/c/<slug>` stays `●` and its pinned CTA text and href are untouched; the One Piece editor and `/l/` show no door.
- **Checks**: `pnpm check`; `combo-radar-panel.test.tsx` and `autofill-sheet.test.tsx` updated; new `deck-editor.test.tsx` cases beside the `?from=` ones (727–816); `smoke:combos`, `smoke:hubs`, `smoke:autofill`, `smoke:recommend` on dev.
- **Risks**: the sheet opening before the pieces land (one seeder, one settle flag); a piece outside the commander's colors (the hub list is already filtered by fit, and the route's `issues` would show it); a Spellbook key that left the nightly export (an honest 404 and the toast).

### X4a — Set filter + picker (M)

- **Objective**: choose a released Magic set on `/cards` and see its cards, in that set's printing.
- **Prereqs**: X2 (the component). No migration.
- **Steps**
  1. `src/lib/games/types.ts`: `FieldTarget` gains `{ printing: "set_code" }` and `SearchFieldDef` gains the kind `"set"`. The Magic adapter declares one such field (`src/lib/games/mtg/adapter.ts` 23–87). One Piece declares none.
  2. `src/lib/search/translate.ts`: the new kind emits a bound `EXISTS` over `card_printings` and `sets`, and returns the scope so the route can choose the printing.
  3. `src/app/api/cards/search/route.ts`: with a scope, the default-printing join (111) becomes the in-set printing by the D4 rule, and rows carry `printingId`. New sort value `number`. Both are additive.
  4. **(new)** `src/lib/sets/queries.ts` `loadReleasedSets(gameId)` and **(new)** `GET /api/sets?game=` — **caching intent: dynamic rendering with `Cache-Control: public, s-maxage=86400, stale-while-revalidate=86400`**; rows of `{ code, name, releasedAt, setType, group, cards }`.
  5. `src/app/(site)/cards/page.tsx` reads `set`. `card-search.tsx` gains the Set group, the chip and the tile link with `?printing=`.
- **Acceptance**: D4, plus — `/cards?set=blb` shows 279 cards in collector order, each image a Bloomburrow printing, each link opening the card page on it; a set plus a name narrows inside the set; an unknown code is an honest empty result with a warning in the response; upcoming and digital-only sets are absent from the picker; without `set` the route's responses are byte-identical to today's; One Piece shows no Set group; the plan and the warm time of the scoped query are recorded.
- **Checks**: `pnpm check`; translator tests for the new kind; `smoke:seo`, `smoke:optcg` on dev; `search:canned`.
- **Risks**: the collector-number sort — 16 % of live printings are not plain digits (9,453 carry a suffix, 7,630 start with a letter or symbol), so the rule is stated and pinned: leading integer first, then the full text, and numbers with no leading digit last; a card whose only in-set printing is removed; the picker's list size (706 rows, fetched once, cached a day).

### X4b — Sets page (S–M)

- **Objective**: a page that lists every released Magic set and leads into `/cards?set=`.
- **Steps**: **(new)** `src/app/(site)/sets/page.tsx` (static, `revalidate = 86400`, no `searchParams`) with a client filter island; `BROWSE_LINKS` (`src/components/site-nav.tsx` 36–43) gains Sets after Cards; both arrays in `site-header.test.tsx` (80–86, 147–155); the sitemap lists the page.
- **Acceptance**: every row of `loadReleasedSets` is a link in the server HTML; "Main sets only" is on by default and hides nothing from crawlers; the page is `○` in the build; the filter never touches the URL (the `/precons` decision).

### X5 — Change picture (M–L)

- **Objective**: choose your provider picture, a card's art or your initial, from a pencil on the account page.
- **Prereqs**: X2. One migration.
- **Steps**
  1. **Verify first**, in Vitest against Better Auth's in-memory adapter: what a provider refresh at sign-in writes, whether it can be narrowed to the picture, what happens when the provider's email collides with another user's, that an additional field with `input: false` reaches `useSession`, and that a session refetch with the cookie cache bypassed re-issues the cookie.
  2. `src/db/schema.ts` → **eyeball `drizzle/0015_*.sql`**; expected shape: `ALTER TABLE "users" ADD COLUMN "avatar" jsonb;` and nothing else.
  3. `src/lib/auth.ts`: the refresh on both providers (53–62) and the additional fields.
  4. **(new)** `src/app/api/profile/avatar/route.ts` — `PUT`; zod union of the three kinds; signed-in only, then a per-user limit (the `profileWrite` order of checks); for card art: the printing exists, is not removed, belongs to a game that declares ambient art, and `fetchScryfallArtMeta` returns an artist; **caching intent: force-dynamic, `no-store`**.
  5. `src/components/profile/user-avatar.tsx` takes the choice. `/account`, `/u/[username]` and the header render through it (LATER row 110 fires). The credit line appears in the three places D5 names.
  6. **(new)** `src/components/profile/change-picture.tsx` — the pencil button and the dialog. The card box is X2's island with `scope=cards`, `game=mtg`.
  7. REC-5: `username` as a second additional field and "Public profile ↗" in the menu (LATER row 80 fires).
- **Acceptance**: D5, plus — signing in again replaces a dead provider link with a live one and changes neither name nor email; choosing card art shows it in all three places with its credit, and a printing with no resolvable artist is refused with a sentence; "Just my initial" survives a later sign-in; the header changes within one refetch of Save, not five minutes later; `/api/auth/update-user` still answers 404; a signed-out `PUT` answers 401 and writes nothing.
- **Checks**: `pnpm check`; `user-avatar.test.tsx` extended; `auth-disabled-paths.test.ts` green untouched; `smoke:account`, `smoke:profile` on dev; `pnpm db:size` before and after.
- **Risks**: the email collision (step 1 decides the mechanism); the cookie cache (step 1); Scryfall's API unreachable at Save (the choice is refused, the current picture stays).

### Appendix to E

**Test and smoke pin matrix**

| Package | Must update | Must stay green |
|---|---|---|
| X1 | `site-header.test.tsx` 56–58, 109–115, 154 and its docblock; `auth-disabled-paths.test.ts` and `account-delete-smoke.ts` 161–183 (REC-6) | `site-header.test.tsx` 95; `account-nav.test.tsx`; `deck-share-view.test.tsx` 118, 298–305 (labels only); `account-delete-smoke.ts` 141–149, 242–245; `engagement-smoke.ts` 253–262, 275–279; `versions-forks-smoke.ts` 507–510 |
| X2 | the hub filter's query tests; new `name-match.test.ts`, route and island tests | the search-pane wire pin; `optcg-smoke` exact / case / prefix / miss / legality; `hubs-smoke` 75–84, 100–109 |
| X3 | `combo-radar-panel.test.tsx` (label, new buttons); `autofill-sheet.test.tsx` (pinned) | `deck-editor.test.tsx` create-count tests (191–292) and the W9 cases (819–1057); `combos-smoke` 111–159; `hub-build-cta.test.tsx` |
| X4a | translator tests; `card-search` tests | the search route's responses without `set`; `seo-smoke` |
| X4b | `site-header.test.tsx` 80–86, 147–155 | `seo-smoke` sitemap and robots checks |
| X5 | `user-avatar.test.tsx`; `site-header.test.tsx` (avatar, menu) | `auth-disabled-paths.test.ts`; `account-delete-smoke.ts` 161–183; `profile-folders-smoke.ts` |

**Rollback**: X1, X2, X3, X4a and X4b add UI and routes only → `git revert`. X3's doors render only where the adapter declares autofill. X4a's filter exists only while the Magic adapter declares the field; removing that one declaration hides it. X5's migration is additive → revert the code and drop the column; stored choices are lost and every picture falls back to the provider's.

---

## F. Deferred work and unresolved decisions

**Deferred (each becomes a `LATER.md` row with its trigger in X1 step 0)**

| Item | Why deferred | Revisit when |
|---|---|---|
| **Header search on every page, and the ⌘K palette** — *flagged: offered and not chosen on 2026-09-27* | A client island on every page, a phone popup and a hotkey decision. REDESIGN.md deferred ⌘K with no row written; this is that row. | X2 is live and someone searches from a page with no box, or a user asks |
| **The editor's quick-add list ordered by play** — *flagged: offered and not chosen* | It changes a keyboard flow pinned by tests, and "first result" is what Enter adds | A user reports a popular card buried in quick-add, or X2's order proves itself on the browse pages |
| **Combo door on card pages** — *flagged: offered and not chosen* | A card page has no commander and its combo list is not filtered by color fit; the door needs a "choose a commander that fits" step | The hub door sees use, or someone asks |
| **Upload your own picture** — *flagged: offered and not chosen* | Needs a storage client, size and type checks, re-encoding, and a report and takedown path | There is a moderation path and users ask |
| One Piece sets in the picker | You asked for Magic sets; One Piece set codes are Bandai labels and every release date is NULL (LATER row 55) | Row 55 fires, or a One Piece player asks |
| Digital-only sets (Arena, MTGO) in the picker | A paper-first site; 61 sets | Someone asks |
| Typed `set:blb` syntax | It would be the first in-string syntax; each filter is its own parameter today | A user types it and reports the miss, or asks for Scryfall-style syntax |
| A rate limit on `/api/cards/suggest` | A limiter costs a database write per uncached request; the edge absorbs repeats | Suggest traffic shows in Neon compute, or an abuse pattern appears |
| Choosing which printing's art is the picture | X5 uses the default printing | Someone asks (W6's printing list exists to reuse) |
| One Piece card art as a picture | The Bandai posture: One Piece art stays off | Bandai answers |
| "Refresh now" without the sign-in round trip | It would mean using stored provider tokens, which expire | Users find the round trip confusing |
| A return path from the header's Sign in | Needs a router hook in the guest header, which the error and 404 shells render without a router | REC-1 sees use and someone signs in from a page they wanted to stay on |

**Rows this wave changes rather than adds**: 64 (the claim nudge — X1 adds the account-page list; the editor and share-page nudge stays open), 80 (fires in X5 with REC-5), 104 (fires in X3), 108 (fires in X1 with REC-6), 110 (fires in X5).

**Unresolved decisions (defaults chosen; tell me if you disagree)**

| Decision | Default in this plan | What would change it |
|---|---|---|
| The Sets page (X4b) | Built, after the picker | If the picker alone is what you meant by "search by set", strike X4b |
| Return after sign-in | Automatic, once the claim settles | If you would rather see a "Back to the deck" link and click it yourself |
| Closing the token routes in X1 (REC-6) | Closed | If you plan a feature that needs a provider token in the browser |
| What the refresh at sign-in changes | The picture only | If you want the display name to follow Discord or Google too |
| The dropdown's order | Names that start with what you typed come first, so `ring` lists Rings of Brighthearth before Sol Ring | If you would rather have any matching word, most played first (`ring` → Sol Ring): one line in the ranking module |
| "Main sets" | Expansion, core, masters, commander, draft innovation | If Secret Lair, Un-sets or the six small "Eternal" companion sets (The Hobbit Eternal, Transformers, …) should sit with them |
| Order inside a set | Collector number | If most-played first reads better to you |
| The editor's button | "Suggest full list" | If you prefer "Build around" with the new tooltip |
| The credit line in the header menu | One quiet line under the name | If the profile pages alone satisfy you; Scryfall's wording is "elsewhere in the same interface" |
| Package order after X2 | X3 → X4a → X4b → X5 | Any order you like; X4a and X5 need only X2 |

---

## G. First implementation package — X1 "Account paths"

**Why first**: it is the smallest package with the widest reach. Every visitor sees the header, every sign-in passes through `/account`, and the site is about to be announced. It needs no migration and no new dependency, and it adds no route.

**Expected visible result**: My decks opens the account page for everyone. Signed out, that page offers sign-in and lists the decks built on this browser. Your name in the account menu is a link that lands at the top of your account. Signing in from a Like, Bookmark or Fork prompt brings you back to the deck.

**Scope (in order)**

0. **Contract**: build plan §6d (the X-series table, mirroring §6c); one CLAUDE.md line under Session protocol — "Wave-3 packages (Xn from `WAVE3.md`, build plan §6d) count as work packages under the same rules"; a REDESIGN.md addendum recording that **X1 supersedes** §2's "My decks leads … to the browser's guest-deck section on home for guests" and WAVE2.md D1's two notes ("Bobandis6 ← label, not an item"; "guests need it for `/#your-decks`"), and that **X2 will supersede** W4's `LIKE` filter; section F as `LATER.md` rows. (`*.md` is in `.prettierignore`.)
1. **My decks**: `src/components/site-nav.tsx` — both links go to `/account`; delete `useMyDecksHref` and the file's session import if nothing else uses it; rewrite the docblock. Update `site-header.tsx`'s docblock (8–14): only the account slot reads the session now.
2. **On this browser**: extract the token-and-fetch logic of `your-decks.tsx` into a hook; `YourDecks` keeps its exact output. **(new)** `src/components/account/browser-decks.tsx` renders the D1 section under `SignInButtons` in the signed-out branch (`account/page.tsx` 101–112).
3. **The name row**: `account-slot.tsx` 96 becomes a `DropdownMenuLinkItem`. Prove the landing (D1) and pin it.
4. **REC-1, the return path**: **(new)** `src/lib/auth/next-path.ts` (pure, tested). `SignInButtons` takes `next` and builds `callbackURL`. The account page reads `searchParams.next` (it is already force-dynamic). `ClaimDecks` takes `next` and returns after the claim settles. Like, Bookmark and Fork send the deck's path.
5. **REC-6, the token routes**: `/get-access-token`, `/refresh-token` and `/account-info` join `AUTH_DISABLED_PATHS`; both pins extend.

**Out of scope**: the picture (X5), "Public profile ↗" (X5), any change to `/api/decks/mine` or `/api/decks/claim`, a return path from the header's Sign in, a claim nudge in the editor or on share pages (LATER row 64), ⋯ actions on the new tiles (LATER row 87).

**Completion checklist**

- [ ] Step 0 committed on its own.
- [ ] `pnpm check` green — `site-header.test.tsx` rewritten where the matrix says; new tests for the island (tokens → tiles; none → nothing; a failed request → nothing), for `safeNextPath` (accepts `/d/abc`; rejects `//evil.example`, `/\evil`, `https://…`, `/account`, `/api/…`, control characters, 201 characters), for the prompts' hrefs, for `SignInButtons`' `callbackURL`, for the return after a claim, and for the name row.
- [ ] `grep -rn "#your-decks" src` → no hits: the hash link is gone. The two components still render the id.
- [ ] Dev pass, signed out, both themes, 390 and 1440: My decks on home, on a hub and in the phone menu; `/account` with no tokens; `/account` with one guest deck made on dev (dev shares prod's database — delete the deck afterwards and re-prove the census); `/account?next=//evil.example` behaves exactly like `/account`.
- [ ] `pnpm build`: the route table is unchanged; `/account` stays `ƒ`; `/c/[slug]`, `/l/[slug]`, `/cards/[id]` stay `●`.
- [ ] `smoke:account`, `smoke:engagement`, `smoke:versions`, `smoke:profile` green on dev (`counters:reset` between them if the local counters fill).
- [ ] Deployed; Vercel status success (GitHub commit status, context "Vercel", the full sha). Prod pass, signed out, zero creates: the header's My decks href in the server HTML of home and of one hub; `/account`; the Like prompt's href on one public deck; the three token routes answer 404.
- [ ] Three clicks handed to the owner, signed in on prod: the name row from `/account#settings`; the name row twice in a row; signing out, then Like on a deck → sign in → back on the deck.
- [ ] Ship note, `LATER.md` rows, tracker tick, memory, and `X2-session-prompt.md` written.

---

## Verification (whole wave)

- Every package: `pnpm check`; the listed smokes on **dev** (never `smoke:seo` against prod — it mints fixtures; read the deck-create counters before any prod smoke; `pnpm counters:reset` clears local loopback counters); the `pnpm build` route-table diff (ISR routes stay `●`); a dev pass at 390 / 768 / 1200 / 1440 in both themes with reduced motion toggled; deploy; confirm through the GitHub commit status.
- Database reads need the owner's OK, asked once at the start of a session. Dev shares prod's database: a deck made on dev is a real row. Delete QA decks and re-prove the census (27 user decks, 181 precons, 1 user on 2026-09-27).
- Browser-pane caveats already learned: a hidden pane pauses rAF, never fires `matchMedia` change events, stalls Base UI transitions, and does not hydrate a tab until it is painted. Verify menus, popups and toasts through the DOM or in jsdom. The pane is signed out everywhere: signed-in flows are RTL plus the owner's own clicks.
- Query packages (X2, X4a): the plan and the warm time recorded; statements counted with `DB_LOG=1`. X5: `pnpm db:size` before and after.
- Traceability: idea 1 → X1 · 2 → X3 (card pages deferred) · 3 and 5 → X2 (header and editor deferred) · 4 → X4a, X4b (One Piece, digital-only sets and typed syntax deferred) · 6 → X1 · 7 → `a508283` for the bug, X5 for the feature (uploads deferred).

---

## Progress tracker

Tick a package with its date and sha when it ships; record deviations from this contract beside the tick, not by rewriting the sections above.

- [x] Owner's answers recorded; contract landed in the repo with `X1-session-prompt.md` (2026-09-27).
- [x] X1 — Account paths (2026-09-27: step 0 `6e70a7d`, feat `e42d6ad`, Vercel status success on the full sha — My decks → `/account` for everyone with no session read in the nav; "On this browser · N decks" under the sign-in buttons through `useBrowserDecks` + `BrowserDeckTiles`, home's guest section byte-for-byte what it was; the name row as a link that scrolls to the top in the same click; `safeNextPath` + `accountHref` (`src/lib/auth/next-path.ts`), `?next=` on Like / Bookmark / Fork, the return after the claim settles; the three token routes closed, prod 401 → 404. 1,045 tests in 126 files (from 959 in 121), the same 6 warnings, 0 errors; route table unchanged; db 269.5 MB; census unchanged at 27 user decks / 181 precons / 1 user. **Deviations and decisions, recorded here and in `X1-session-prompt.md`'s ship note:** (1) signed in with a valid `next`, `/account` renders ONLY the claim step and its status line — the account's six queries never run for a page the visitor is leaving; (2) the name row scrolls on every primary click, not only when the path is already `/account` — measured: a Link to the current path scrolls only when the page's top edge is out of view (from `scrollY` 40 it stays at 40), and `/account#top` does not scroll on a second click; (3) `safeNextPath` is stricter than D1's list — it also refuses `//` anywhere in the value, applies every rule to the percent-decoded form as well, and returns the parsed form so what is followed is what was checked; (4) the two LATER rows X1 changes were rewritten with this ship note, not in step 0, so "FIRED" carries a sha; section F's twelve rows were appended at the end of `LATER.md` (rows 111–122) so the row numbers cited above stay put; (5) the island reads in the singular for one deck — "On this browser · 1 deck", "Sign in to keep it on every device." **Still owed by the owner:** the three signed-in clicks in the ship note — the pane is signed out everywhere.)
- [x] X2 — Suggest endpoint + browse dropdowns (2026-09-27: feat `d88c70e`, Vercel status success on the full sha — `src/lib/search/name-match.ts` holds the ranking (with `name-key.ts`, the client-safe request key); `GET /api/cards/suggest` (one statement, two for near misses, none under two characters; edge MISS → HIT on prod); `ui/autocomplete.tsx` over Base UI; the `NameSuggest` island in the `/commanders` and `/leaders` GET forms and the `/cards` Name box; REC-3 (`atraxa praetors`, `kiki jiki` find their commanders on prod) and REC-2 (`sort=best`, ORDER BY only); the translator's LIKE escape (`_` matched all 35,349 cards, now 15). The editor's `sol` / `atr` / `OP01-02` responses byte-identical before and after on prod. 1,094 tests in 129 files (from 1,045 in 126), the same 6 warnings, 0 errors; the route table gained exactly `ƒ /api/cards/suggest`; db 269.5 MB; census unchanged. **Deviations, recorded here and in `X2-session-prompt.md`'s ship note:** (1) a word also starts after a period, a double quote or "(" — measured: 273 One Piece names join words with a period, and under D2's rule `luffy` offered none of the 17 Luffys; (2) inside a class, leaders come first after play (One Piece's order; among Magic it decides only unranked rows); (3) the hub filter also accepts near misses from four characters, so its list always contains the dropdown; (4) the island renders an invisible default submit button in a form — Base UI's Root adds a second, unnamed text input and HTML implicit submission then ignores Enter (found in the pane, invisible to jsdom); (5) the primitive's input has an `unstyled` escape and no Separator part.)
- [ ] X3 — Combo doors (hub door, seeded draft, pinned pieces, "Suggest full list")
- [ ] X4a — Set filter + picker (`set` on the search API, `GET /api/sets`, the in-set printing)
- [ ] X4b — Sets page (`/sets`, Browse entry, sitemap)
- [ ] X5 — Change picture (`users.avatar`, the refresh at sign-in, card art with credit, the pencil dialog)
