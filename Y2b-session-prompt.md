# Y2b session prompt — Start doors (Pick a commander · Paste a list · Start from a precon · Surprise me; Suggestions in drafts; first-approval Share)

## Ship note — 2026-10-01, feat `bb4b1e2`, deployed (Vercel status success on the full sha, 15:26 Z; CI green)

**Shipped. The prompt below is history. Next is `Y3a-session-prompt.md` (bracket data — migration `0016`).**

**Pre-flight**: Y2a ticked and `0015` the last migration; row 161 had landed (`01b2232`, `dce142e`; this working copy was three commits behind origin and was fast-forwarded to `0d6c722`); nightlies green (the 2026-09-30 scheduled run; today's 07:38 Z red was P4.9's flaky GET, re-dispatched green at 07:57 Z). The owner's answers at the start: **nothing new posted, no feedback** and **read-only database access granted**. Baseline on `0d6c722`: 1,282 tests / 150 files / 6 warnings / 0 errors; `pnpm db:size` 271.2 MB; census 209 deck rows = 28 user decks (16 account + 12 guest) + 181 precons, 1 user. **One user deck more than Y2a's 27: the owner's own account deck** (public, 72 cards, created 14:23 Z from one of the owner's usual ranges) — not a stranger.

**Results.** `pnpm check` **1,339 tests in 156 files**, the same 6 warnings, 0 errors (new files: the snapshot route's `route.test.ts`, `start-doors.test.ts`, `share-offers.test.ts`, `use-first-approval.test.ts`, `recommendations-panel.test.tsx` — the panel's first RTL — and `new-deck-chooser.test.tsx`; new cases in `deck-editor.test.tsx` (10), `validation-panel.test.tsx`, `panel-view.test.ts`, `rate-limit.test.ts` — every window at most a day, the snapshot's own bucket — and both display tests). The zero-POST pins for combo and Surprise seeds, every `data-status` pin and the create-count tests stayed green untouched. A mutation check broke the doors, the Share wiring and the Keep condition in turn; each failed its tests. Route table: exactly one added line, `ƒ /api/recommendations` (`/decks/new`, `/precons`, `/sets` stay `○`). Census unchanged after the dev pass; `pnpm db:size` 271.2 MB. No migration, no dependency.

**What changed** (D2's Y2b paragraphs):
- **Start doors.** `src/lib/decks/start-doors.ts` gives one order and one vocabulary off the adapter — Pick a commander / leader (`display.leaderBrowse`), Paste a list (every game), Start from a precon (a new optional `display.preconBrowse`, Magic's `/precons`), Surprise me (where `recommend.autofill` is declared). The picker's cards carry them as a link row; the empty draft carries Paste a list, the precon door and Surprise me after Add cards (Paste a list for any empty deck; the other two only for a draft whose leader zone is empty; none while a URL seed lands).
- **`?import=1`**: the chooser's one-shot latch, stripped with `surprise` and `autofill`; the editor opens the Import dialog once, after any seed settles. Home → Build a deck → Paste a list is the two-click path.
- **Surprise me in place**: W9c's seeder became `rollLeader`, shared by `?surprise=1` and the door; a door-rolled draft offers Keep this deck.
- **`POST /api/recommendations`** (`src/app/api/recommendations/route.ts`): a draft's snapshot (ids and copies), facts read server-side, `recommendForSnapshot`, its own bucket, `force-dynamic` + `no-store`, One Piece 400. The Suggestions panel asks it while no row exists and only while its tab is open; the GET takes over once the row mints.
- **First approval**: "Share this deck" under the Warden line (`ValidationPanel`'s `approvalAction`), offered once per deck per browser (`useFirstApproval`, `deckwarden:share-offered`), opening the existing Share dialog.
- **`smoke:recommend`** gained a snapshot section that creates nothing.

**Decisions and deviations** (also in `WAVE4.md`'s tracker and REDESIGN.md's "Y2b decisions"):
1. **Deviation — the snapshot body carries copies**: `entries: [{cardId, qty}]` (≤ 500, 1–99 — the cards PUT's limits) instead of WAVE4's `entryIds`, because the curve evidence counts copies; `leaderIds` 1–2; `budget` in USD. The answer is the GET's minus what a draft lacks: `{count, recommendations}` — no `deckId`, no `owned` (LATER row 165). Bucket `recommendSnapshot`: 30/min + 200/hour per IP. Nine statements per call; 2.7 s on dev, 0.73 s on prod.
2. The panel keys a draft like the GET (entries hash + budget + owned + nonce, the body a memoized string): an unchanged draft never asks twice, and minting the row doesn't refetch — `smoke:recommend` proves the snapshot answers exactly what the deck GET answers for the same cards.
3. The picker's cards grow the doors; W9c's "Surprise me — random commander" becomes "Surprise me"; the cards lost `flex-1` (the 1200 dev pass caught a stretched card).
4. The empty draft leaves Pick out — the empty leader zone's Browse link right above is that door.
5. "Keep this deck" shows for any draft holding cards it never edited (`draftSeed === null || seedSettled`), which covers a door-rolled draft.
6. First approval: born at the false → true transition, never on a mount at zero or a load; a draft that approves before its row waits for it (a precon draft: Keep this deck, then the link); "per deck" = the deck id once it exists; the flag is a capped list of deck ids recorded when the offer is made.
7. **Found, not fixed (LATER row 164)**: removing a seeded card back to an empty list mints an empty deck row (`save()` runs `ensureDeck` before it compares) — Surprise me then "remove to roll again" leaves one. Also new: rows 165 (a draft's "Only cards I own") and 166 (home's import sentence as a door); row 103 annotated.

**Dev pass** (signed out, against prod data): 1440 dark — a fresh Magic draft's row reads Add cards · Paste a list · Start from a precon → `/precons` · Surprise me, Browse commanders stays the leader zone's, and Paste a list opens the Import dialog with focus in the textarea and no API call but the session's; home → Build a deck → Paste a list = the Import dialog on a draft in two clicks, zero `/api/decks` requests. 1200 light — the picker's door rows for both games (the stretched card fixed there). `?game=optcg&import=1` → the Import dialog with One Piece's placeholder, the URL left at `?game=optcg`. 768 light — One Piece's empty draft: Add cards · Paste a list, Browse leaders in the leader zone. 375 (coarse) and 390 dark — two rows of 44 px doors, one Add cards, no keyboard hint, no horizontal overflow. 1440 dark — the Surprise me door rolled Liberator, Urza's Battlethopter (one GET, no POST), Keep this deck appeared and the row became Autofill a starter shell · Add cards · Paste a list; the Suggestions tab sent one `POST /api/recommendations` → 25 rows; closing and reopening the tab asked nothing, "≤ $1 a card" asked once more; the slot still read "Draft". First approval — the Calling All Angels precon draft approved on its seed with no link (no row); Keep this deck → POST 201 + PUT 200 → "Share this deck" under the Warden line, outside it, with the id in `deckwarden:share-offered` → the Share dialog (Unlisted, its `/d/` link); light theme checked in place; a reload showed the approved line and no link. That deck was deleted with its token (204, then 404) and the pane's storage cleared; `smoke:recommend` deleted its two. Hidden-pane notes: a streamed Suspense boundary stays unrevealed (`<div hidden id="S:0">` beside the fallback) until a screenshot paints the pane, and a `querySelector` can hit that hidden, un-hydrated copy first — filter with `!el.closest('[hidden]')`; later in the session screenshots failed outright while the pane wasn't displayed ("not compositing frames"), and DOM reads carried the prod pass. Reduced motion could not be toggled.

**Prod pass** (signed out, zero creates): `/decks/new?game=mtg` shows the four doors; at 1024 Paste a list opens "Import decklist" (the closed md Tools drawer is also a `dialog` — match by name); `/decks/new` shows both games' door rows; Surprise me rolled Ojer Taq, Deepest Foundation // Temple of Civilization, Keep this deck appeared, and the Tools drawer's Suggestions tab answered from `POST /api/recommendations` (200, 25 rows: Sol Ring, Arcane Signet, Swords to Plowshares…) with the slot still "Draft". By curl: the Talrand + Basalt Monolith + Counterspell snapshot → 200 in 0.73 s, `no-store`, keys `count, recommendations`, 25 rows with Rings of Brighthearth; One Piece → 400. Census re-proved after: unchanged.

---

Pull latest, then run Y2b — the third Wave-4 package. **`WAVE4.md` is the contract.** Read, in this order: **D0** (reuse, don't add; copy rules); **D2**'s Y2b paragraphs (start doors, Suggestions in drafts, first approval); the **Y2b** block in section E, its row in E's **pin matrix** and the route-table row (`+ ƒ /api/recommendations`); and Y2a's ship note at the top of `Y2a-session-prompt.md` (what Y2a changed, its deviations, and LATER rows 161–162).

Y2b puts the fastest ways into a deck on the first screen, lets a seeded draft see Suggestions without minting a row, and offers "Share this deck" the first time the Warden approves. **No migration, no new dependency. Exactly one new route: `ƒ /api/recommendations`.**

Pre-flight, in order.
1. **Y2a has shipped.** `WAVE4.md`'s tracker ticks Y2a (feat `4fd9b10`), and `drizzle/meta/_journal.json`'s last entry is still idx 15.
2. **LATER row 161 (the per-render keepalive PUT) LANDED 2026-10-01** (`01b2232`, test teardown `dce142e`; the row is FIRED). A saved deck's edits wait out the 1 s debounce again: one PUT per burst, sent by the debounced save that drives `saveStatus`; a keepalive PUT leaves only on pagehide or unmount. `deck-editor.test.tsx`'s `afterEach` now unmounts before it unstubs `fetch`; keep that order, because a test that ends mid-debounce on a live deck flushes on unmount. Nothing to ask; row 163 (what pagehide can't cover) isn't Y2b's.
3. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
4. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived; a warm signal gets its own P2.9 / P4.7 round first.
5. **Ask for read-only database access once, at the start**, in plain words: the census before and after (users, user decks, precons), nothing written. Y2b's doors mint nothing; `smoke:recommend`'s new snapshot section must create nothing either.
6. **Working tree clean** at or after Y2a's docs commit. Another session may share this working copy: stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` immediately before editing them.
7. **State your baseline**: `pnpm check` = Y2a's count plus row 161's (1,282 tests / 150 files / 0 errors on `dce142e`; row 161 left the warnings unchanged) and `pnpm db:size`. Save `pnpm build`'s route table; the diff at the end must be **exactly one added line**, `ƒ /api/recommendations`.

## What Y2b is NOT (scope fence)

- NOT anything bracket-shaped (Y3a onward); the Warden's approval line stays legality-only and the new Share link sits under it, not in it.
- NOT a change to the recommendation engine's scores, weights or filters — the snapshot route is a new door onto `recommendForSnapshot`, nothing more.
- NOT the share page's progress wording (LATER row 162) and NOT the keepalive fix (row 161).
- NOT URL import (Moxfield / Archidekt — LATER), NOT a new picker design ("Pick your game." stays).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-01 against `4fd9b10` — re-grep lines, trust the shapes)

- **The empty draft's EmptyState** is `src/components/editor/deck-list-pane.tsx` ≈281 ("No cards yet" — "Add them from Search."); since Y2a its action is the only Add cards on a phone, and the Autofill door shows there once a leader is set. The empty leader zone (`src/components/deck/leader-zone.tsx`) already offers Browse (`adapter.display.leaderBrowse`, `types.ts` ≈571) + Search by name.
- **`/decks/new`** is `src/app/decks/new/new-deck-chooser.tsx`: one-shot latches `?surprise=1` / `?autofill=1` (≈50–56, adjusted during render) stripped by `replaceState` (≈65–66) — the pattern `?import=1` copies. The picker's "Pick your game." is ≈98 and each game's "Surprise me — random …" link ≈132. Home's Surprise door: `src/app/(site)/page.tsx` ≈86.
- **Seeds and the editor.** `draftSeed` (from > surprise > combo > leader) and the seeders in `deck-editor.tsx`; Y2a's "Keep this deck" shows for any settled seed with cards. `?import=1` opens the existing Import dialog (`openFromHeader("import")` path, `ImportDialog` in `import-export.tsx`) — Import applies through `applyListSwap`, a real edit with Undo.
- **Suggestions today.** `RecommendationsPanel` fetches `GET /api/decks/[id]/recommendations` only when `active && leader && deckId && saveStatus === "saved"` (`recommendations-panel.tsx` ≈98). The route (`src/app/api/decks/[id]/recommendations/route.ts`) is the shape to mirror: zod query, `RATE_LIMITS.recommendations` (30/min per IP), `force-dynamic`, `no-store`, `?owned=1` with honest `owned.reason`.
- **The snapshot pieces exist.** `recommendForSnapshot(snapshot, opts)` (`src/lib/recommend/engine.ts` ≈177, returns `[]` for a game without recommend meta) and `loadEntryFacts(gameId, ids)` (`src/lib/recommend/queries.ts` ≈271, server-side facts for client ids — W9a's autofill route `src/app/api/decks/autofill/route.ts` is the precedent: ids in, facts read server-side, 400 on unknown ids, its own `deckAutofill` bucket).
- **Rate limits** live in `src/lib/rate-limit.ts` (`RATE_LIMITS`); every window is ≤ 1 day (the nightly sweeps counters older than 2 days). The new route gets its own bucket.
- **First approval.** `ValidationPanel`'s settle (`validation-panel.tsx` ≈73–76) is R3's F1 false→true transition — the moment the link appears. The `deckwarden:*` localStorage pattern with a `useSyncExternalStore` reader is `src/lib/theme/appearance.ts` (`useAppearance`, ≈105); other keys: `deckwarden:deck-view`, `deckwarden:leader-pick-intent`, `deckwarden:index-view`.
- **Zero-POST pins** for seeded drafts: `deck-editor.test.tsx` ≈1003 (combo without `?autofill=1`: no POST at all) and ≈1313 (Surprise me: literally zero POSTs). Y2a's Keep / progress / Undo tests are at ≈1410–1545.

## Verify-first list (never from memory)

1. Paste a list is two clicks from home (home → a door → the Import dialog open on a draft) and creates nothing until Apply.
2. A seeded draft's Suggestions answer from `POST /api/recommendations` with **zero `POST /api/decks`** — the combo and Surprise zero-POST pins stay green, and the census is unchanged after a dev pass.
3. The panel calls the snapshot route only while its tab is active, and never once a deck row exists (the existing GET takes over).
4. One Piece shows Browse leaders and Paste a list, no precon / Surprise / Suggestions doors, and `POST /api/recommendations` answers 400 for it.
5. "Share this deck" appears once per deck per browser on the first approval, never on mount at zero (a loaded legal deck), and not again after it was shown.

## Design decisions to make explicitly (disclose + pin each)

- The doors' order and wording per game on `/decks/new` and in the empty draft (WAVE4: Pick a commander · Paste a list · Start from a precon · Surprise me; the existing Autofill door once a leader is set) — and whether the picker's game cards grow the doors or the doors live on the editor's empty state only.
- The snapshot route's body limits (max ids, leader count), its bucket numbers, and its response shape (the GET's, minus what needs a deck row).
- How the panel keys its draft fetch (entries hash vs. settled-edit count) so an unchanged draft never refetches.
- The first-approval flag's key and what "per deck" means for a draft that mints mid-session (the deck id once it exists).
- Where the Share link opens (the existing Share dialog; a draft that approves before any row exists has nothing to share — decide what shows).

## Deployable outcome

`pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`). `smoke:recommend` gains a snapshot section (dev) that creates nothing. Dev pass at 390 / 768 / 1200 / 1440 in both themes: the empty draft's doors in both games, `?import=1` from home, a Surprise draft's Suggestions, the first approval's Share link. Prod, signed out, zero creates: the doors render and `POST /api/recommendations` answers a seeded draft. The route table gains exactly `ƒ /api/recommendations`.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and deviations; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains the Y2b decisions; LATER rows annotated; memory updated; **`Y3a-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. The shell is zsh: a bare `====` (or any word starting with `=`) aborts the whole command line — don't echo separators like that. Ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/` inside one `read only` transaction (`scripts/.tmp/census-y2a.ts` is the census: decks − 181 precons = user decks).
- Dev server: `preview_start {name: "dev-log"}`; stop it before `pnpm build`. Dev shares prod's Neon DB — any deck a check creates must be deleted (its token is in the pane's localStorage: `DELETE /api/decks/<id>` with `x-deck-token`) and the census re-proved.
- The browser pane is signed out and usually hidden: seeds, fades and drawer exits stall until a screenshot paints it; a covered button can be clicked with `element.click()` in `javascript_tool`. Light theme: `localStorage.theme = "light"` then reload; remove it after.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors; `react/no-unescaped-entities` flags a bare `'` in JSX text. Run `pnpm exec prettier --write` on every touched file before `pnpm check`. Some source files contain a NUL byte, so the system `grep` calls them binary — use `grep -a`.
