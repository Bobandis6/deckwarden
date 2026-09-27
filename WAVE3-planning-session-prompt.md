# Wave-3 planning session prompt — the owner's seven ideas (named 2026-09-27, P4.7 round 3)

Pull latest, then run a **planning-only** session: the `WAVE2.md` precedent (2026-09-19, "from a planning-only session against `b67ee0b` — nothing was implemented, installed, or deployed"). Wave 2 is complete (W1 → W10, 2026-09-19 → 22, tracker at the end of `WAVE2.md`) and no package is queued. In P4.7 round 3 (2026-09-27) the owner answered question (e) with **"Fresh planning session"** and, under question (b), pasted seven ideas "for a later planning session". This session turns them into a contract. **The deliverable is `WAVE3.md` plus the first package's session prompt, committed as docs.** No code, no installs, no migrations, no deploys, no DB writes.

## The owner's list (verbatim, pasted 2026-09-27 — quote it, never paraphrase it in the contract)

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

## Pre-flight, in order

1. **A warm beta signal outranks planning** (the standing rule since P2.9). Check `gh run list --workflow=nightly-ingest.yml` (a red run is P4.7 branch F), `gh issue list --state all` (one closed issue, zero open at `5238b9f`), and ask the owner whether the Magic or One Piece announcement has been posted. If anything is warm, run that round (`P2.9-session-prompt.md` / `P4.7-session-prompt.md`) instead of this session.
2. **P4.9 state.** DNS moved to Cloudflare in P4.7 round 3, and the image flip is gated on the old delegation expiring (`P4.9-session-prompt.md`). Planning does not wait for it, but any One Piece thumbnail in a search dropdown (ideas 3/5) inherits P4.9's thumbnail policy. Read its outcome in `LATER.md`'s r2.dev row (FIRED or not) and design around what shipped.
3. **Tree clean at or after this prompt's commit.** Baselines for the contract's verification section: `pnpm check` 950 tests in 119 files, the same 6 `no-unused-vars` warnings, 0 errors (at `5238b9f`, 2026-09-27); `pnpm db:size` 268.6 MB (alert 350); 27 user decks (26 Magic + the owner's one One Piece fixture), 181 precons, 1 user.

## What exists today (verified 2026-09-27 against `5238b9f` — re-verify any pin you build a decision on)

**(1) My decks → sign-in.**
- The header nav is Build · Browse · My decks (`src/components/site-header.tsx` 41–47).
- The My decks href comes from `useMyDecksHref` (`src/components/site-nav.tsx` 45–49): `data ? "/account" : "/#your-decks"`. The session is read client-side, and the server HTML always carries the guest href, because the (site) layout must not read request data (ISR; `src/app/(site)/layout.tsx` 10–15).
- **Signed-out behavior is a deliberate choice, not an oversight** (`REDESIGN.md` 92, `WAVE2.md` 199): guests own server-side anonymous decks. The link lands on home's `YourDecks` (`src/app/(site)/page.tsx` 107), which POSTs the browser's claim tokens to `/api/decks/mine` (`src/components/deck/your-decks.tsx` 40–53). That section renders null with no tokens (41, 64), so a brand-new guest lands on home with no deck section and no sign-in prompt. That is probably the experience the owner hit.
- Sign-in is the signed-out branch of `/account` (`src/app/(site)/account/page.tsx` 98–109). The header's guest "Sign in" also links there (`src/components/auth/account-slot.tsx` 54–61).
- **No return URL exists anywhere.** `callbackURL: "/account"` is hard-coded (`src/components/auth/sign-in-buttons.tsx` 26), and `/account` is the landing spot on purpose, because `ClaimDecks` runs there (`account/page.tsx` 216).
- Pinned by `src/components/site-header.test.tsx` (56–57, 154).

**(2) Combo → suggested deck list.** Most of this already exists in the editor, for Magic only. The discoverability and entry points are the gap.
- The editor's Combos tab renders `ComboRadarPanel`, which shows 5 commander combos (`LEADER_COMBOS_SHOWN`, `src/components/editor/combo-radar-panel.tsx` 52) out of the API's top 10.
- Each row has **"Add N pieces"** and **"Build around"**: `addComboPieces(combo, openSheet)` (178–207) resolves the missing pieces in one POST, adds them, and for Build around opens the autofill sheet.
- The sheet POSTs `/api/decks/autofill` with every entry as `keep` (`src/components/editor/autofill-sheet.tsx` 139–152), adds up to `COMBO_PICK_CAP` 6 combo completions (`src/lib/recommend/autofill.ts` 23), and applies as one whole-list swap with Undo (238–251). The route writes nothing and is limited to 20/min and 200/h.
- Hub (`/c/[slug]`) and card-page combo lists are **read-only** (`src/components/combos/combo-list.tsx` 26–67).
- There is no `?combo=` latch on `/decks/new` (`src/app/decks/new/new-deck-chooser.tsx` 30–48). The precon `?from=` seed is the precedent for "a whole list into a draft" (`deck-editor.tsx` 552–624).
- One Piece has no autofill (LATER's flagged row, WAVE2 §F: no popularity signal and no leader×card aggregate).

**(3)/(5) Predictive search.**
- **No dropdown typeahead exists on any browse surface, and the header has no search box.** The JSON-LD SearchAction points at `/cards?q=` (`src/lib/seo/jsonld.tsx` 29–31).
- `/commanders` and `/leaders` use plain GET forms (`src/app/(site)/commanders/page.tsx` 112–120; `leaders/page.tsx` 102–112) with a server-side `name_norm LIKE` (`src/lib/hub/queries.ts` 48–52).
- `/cards` searches as you type, with a 250 ms debounce into a 60-card image grid (`src/components/cards/card-search.tsx` 154–159).
- The editor's search pane is the closest thing to a typeahead: a `role="combobox"` over a 20-row listbox with a 200 ms debounce (`src/components/editor/search-pane.tsx`).
- `/api/cards/search` has **no rate limit** and is edge-cached `public, s-maxage=300, stale-while-revalidate=3600` (`route.ts` 138). Its name match is `LIKE '%v%' OR % v` over the trigram index (`src/lib/search/translate.ts` 100–103). Rows carry `isLeaderCandidate`, but there is no commanders-only param.
- There is no combobox component in `src/components/ui/`. Base UI 1.7 ships unused `combobox` and `autocomplete` primitives.

**(4) Search by released Magic set.**
- **No set filter exists.** The Magic adapter's search fields (`src/lib/games/mtg/adapter.ts` 24–84) have no set field. Translator targets are identity columns and attrs paths only (`src/lib/games/types.ts` 167–179, `translate.ts` 27–36). There is no `set:` syntax and no `/sets` route.
- Search is per identity while sets hang off printings (`card_printings.set_id`, `sets` with `code`/`name`/`released_at`/`set_type`/`digital`, index `cp_by_set(set_id, collector_number)`), so a set filter is an EXISTS over printings, which means a new translator target kind.
- "Released": `card_identities.is_preview` = `released_at > today` at Magic ingest (`src/lib/games/mtg/scryfall-map.ts` 299). One Piece sets carry NULL `released_at`/`set_type`. The only set-based UI today is the card page's per-card "Filter sets…" box in the printings gallery.

**(6) Account name → top of `/account`.**
- The menu's name is a static `DropdownMenuLabel` (`src/components/auth/account-slot.tsx` 96). The four links are `ACCOUNT_MENU_LINKS` (43–48): `/account#decks`, `#bookmarks`, `#collection`, `#settings`.
- The top of `/account` is an id-less `<section>` holding the avatar, the `<h1>` name and the @username (`account/page.tsx` 184–211).
- Pinned by `site-header.test.tsx` 100–113 and `account-nav.test.tsx` 16–20.
- Related: WAVE2 §F deferred a "Public profile ↗" menu item because the client session carries no `username`. `/account` needs no username, so this idea doesn't hit that wall.

**(7) Avatar broken + change picture. The black circle is a BUG, verified 2026-09-27.**
- The owner's stored `users.image` is a `cdn.discordapp.com/avatars/<id>/<hash>.png` URL that now returns **404** (the Discord avatar has most likely changed since sign-up on 2026-08-30).
- Better Auth refreshes provider info on sign-in only with `overrideUserInfoOnSignIn`, which `src/lib/auth.ts` (52–61) doesn't set. The URL is frozen at sign-up, and signing out and back in won't heal it.
- `/account` renders a plain `<img>` with no `onError` and no background (`account/page.tsx` 185–194), so a 404 shows the near-black page through the bordered circle. `/u/[username]` uses the same pattern.
- The header uses Base UI `Avatar`, which falls back to the initial when the image fails, so it looks fine there.
- **Two separable parts:** the bug (a fallback on both `<img>`s, and optionally refreshing the image on sign-in, noting that override also rewrites `name`) is paper-cut sized. "Change picture" is a feature with real design questions. No upload path exists: no user-image route, no S3 SDK, R2 written only by scripts, and `PATCH /api/profile` accepts only `username`.

**Shared seams:**
- (3) and (5) are one feature over `/api/cards/search`.
- (6) and (7) both live in the `/account` header section and `AccountSlot`.
- (1) and (6) share the client-session nav pattern and `site-header.test.tsx`.
- (4) widens the translator.
- (2) extends W9's Build around.

## Method (how `WAVE2.md` was made — do the same)

1. **Validate before designing.** Walk each idea on prod signed out, with no creates: the deck-create limit is 10/h + 30/day per IP. The browser pane is signed out on prod AND localhost, so signed-in surfaces are RTL-only or the owner's own eyes; ask for a screenshot rather than guessing. Record corrections the way WAVE2's "validation corrections" did.
2. **Classify every idea** as bug, paper cut, feature, or LATER (with a trigger), and merge the duplicates. The bug half of (7) and all of (6) are small enough to ride one package; the W3 precedent bundled the account menu with deck actions.
3. **Ask the owner once** (one AskUserQuestion round, at most 4 questions, a recommendation first where you have one). Every option must carry its cost. The questions this list forces:
   - **(1)** A guest may own anonymous decks. A sign-in wall on My decks hides them unless the sign-in view also lists them ("sign in to keep these"). A return URL (`callbackURL`) doesn't exist yet; design it once for every sign-in prompt?
   - **(2)** Where does the owner "choose a combo": the editor's Combos tab (Build around exists — is it a discoverability problem?), the hub's read-only list, or a new combo page? Is the list W9's evidence-based starter shell seeded with the combo, or something else? Magic only, per the OP autofill row.
   - **(3/5)** Where does the dropdown live: a header search (new client island), `/commanders` + `/leaders`, `/cards`, or all three? What does picking a suggestion do: open the card page or hub, or add to a deck? What is the load budget: `/api/cards/search` is unlimited and edge-cached, so keystroke traffic needs a minimum length, debounce and cache-friendly keys, or a slimmer suggest endpoint?
   - **(4)** Is it a set picker on `/cards` (released = `released_at` ≤ today; digital-only sets in or out?) and/or `set:` syntax? Magic only.
   - **(7)** Is "change picture" an upload (user content on the public R2 bucket: moderation, size and type limits, a new rate-limited API; Neon holds only the URL), a choose-a-card-art avatar (zero uploads and on-brand, but `art_crop` must show the artist and © nearby — the CLAUDE.md rule; One Piece art stays off pending Bandai), or "use my current Discord/Google picture" only?
4. **Recommend a direction and a sequence**, with a decisions table that says WHY. Size each package so it ends deployed and `pnpm check`-green in one session. Pick a package prefix that collides with none of P / R / W.
5. **Write `WAVE3.md`** in `WAVE2.md`'s shape: Context · A. Recommended direction · B. Current-state findings · C. Prioritized idea map · D. Design specification · E. Implementation roadmap · F. Deferred work and unresolved decisions · G. First implementation package · Verification · Progress tracker. Quote the owner's list verbatim in Context. Then write the first package's session prompt. Its step 0 carries the legalizing edits (a build plan §6d, the CLAUDE.md line, LATER rows for everything deferred), as W1's did. Commit docs only and push.

## Constraints every Wave-3 package inherits (CLAUDE.md — not up for relitigation)

- The Neon free tier is a design constraint (268.6 MB of ~512, alert 350): lean rows, no raw provider JSON, no stored Magic image URLs.
- Guest decks are server-side anonymous decks with a claim token, never localStorage-as-deck-store.
- Premium never gates card data or prices.
- Card images are hotlinked unoptimized; never crop the artist/© line.
- Every Scryfall request sends a real User-Agent.
- Every new route or fetch states its caching intent.
- Plain route handlers + zod.
- No Vercel-proprietary SDKs, and `output: "standalone"` stays.
- Game logic stays in adapters: core code consumes the adapter interface only.
- The cold-start rule holds everywhere: no simulated decks, posts or metrics, ever.
- Every migration is eyeballed before applying. One package per session.

## What this session is NOT

- NOT implementation of any idea, including the paper-cut ones: they get a package in the contract, not a drive-by fix.
- NOT P4.9 (the image flip), and NOT a P2.9 / P4.7 round unless pre-flight 1 finds a warm signal.
- NOT reopening Wave 2's settled calls (`WAVE2.md` A/F are the record) unless an idea directly conflicts; then flag the conflict to the owner.
- NOT posting, sending, or seeding anything.

## Context, not tasks

- The site is still unannounced (Magic: P2.8 checklist; One Piece: `P4.6-op-beta-launch.md`), so there is no user feedback yet beyond the owner's own use.
- The owner's recent activity: two Untitled Magic decks on 2026-09-24, and a Discord sign-in plus Surprise me on 2026-09-27.
- Open LATER rows that touch these ideas, cite them where relevant: Surprise-me sheet chain and "Combo piece" labels (W9 D8 residue), the OP Surprise-me door, multi-step undo (60), card stacks (61), the claim nudge (64, which relates to idea 1's guest-deck question), the `md` drawer width (72), and the `/tournaments` index depth.
