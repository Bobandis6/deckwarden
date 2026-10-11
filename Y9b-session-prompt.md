# Y9b session prompt — Log at the table (the share page's owner row "Log a game", phone first; the `/account` tile ⋯ "Log a game…"; the quick log in three taps; opponents' commanders through X2's suggest box; the toast with Undo; the guest prompt)

Pull latest, then run Y9b, the fifteenth Wave-4 package and the second of the journal (ask 3). **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s journal row (account-only; opponents optional, stored as oracle ids; logging never fails) and **D10**'s Logging paragraph (Y9b's half: the owner's share-page row gains "Log a game" (phone first), the `/account` tile ⋯ gains "Log a game…"; Won / Lost / Draw logs at once with the pod size remembered per browser; the details collapsed, opponents' commanders through X2's suggest box; the toast; the signed-out owner's sentence with `?next=`).
2. The **Y9b** block in section E (three taps on a phone; the visitor row untouched; the owner's clicks), its pin-matrix row (`account-deck-tile.test.tsx` 97–104 — the ⋯ list; the owner-row tests; **must not change**: the visitor row) and **Verification (whole wave)**.
3. REDESIGN.md's **"Y9a decisions"** (the dialog, the flush-first contract, the buckets, the allowance words, Undo, the adapter's `journal`, opponents shape-checked only) and **"Y5 decisions"** (the owner's row: Open in editor · Copy ▾ · Share… · Buy; `ownerView` = the server's `isOwner` or this browser's claim token; the visitor row byte-identical).
4. LATER rows **15** (PWA offline table mode — its trigger is "games are logged from phones at stores": Y9b is what could fire it), **64** (the journal's sign-in line), **196**–**197** (Y9a's).
5. Y9a's ship note at the top of `Y9a-session-prompt.md`.

Y9b makes logging a game from a phone take three taps:
- **The share page's owner row** (`src/components/deck/owner-share-row.tsx`, rendered by `deck-share-view.tsx` when `ownerView`) gains **"Log a game"**, phone first. Decide what it opens: Y9a's `GamesDialog` reused (the share page has no autosave — the saved list IS the screen, so `onBeforeLog` is `() => true`) or a lighter quick-log sheet. The visitor row stays byte-identical (`deck-share-view.test.tsx` "the visitor row is byte-identical", ~554).
- **The `/account` tile ⋯** (`src/components/account/deck-action-items.tsx`, pinned exactly in `account-deck-tile.test.tsx` 97–104) gains **"Log a game…"**. Decide where it opens (a dialog on `/account`, or the deck's share page with a latch).
- **The quick log**: Log a game → Won → done is three taps (the players remembered per browser and game — Y9a's `deckwarden:journal-pod:<game>` key, shared).
- **Opponents through X2's suggest box** (`src/components/search/name-suggest.tsx` over `GET /api/cards/suggest`): up to pod size − 1 opponents, each one or two leaders (the adapter's `journal.opponentLeaders`: Magic 2 — partners; One Piece 1), stored as the game's **external keys** (Magic: the Scryfall oracle id, `card_identities.external_key`; One Piece: the printed id). The route already accepts `opponents` (shape-checked only: `^[A-Za-z0-9][A-Za-z0-9-]*$`, ≤ 40 characters, ≤ pod − 1 entries, ≤ `opponentLeaders` each) — decide whether Y9b resolves them server-side (a leader-candidate check) or trusts the box. The `/api/cards/suggest` contract and its bucket are X2's.
- **The guest prompt**: a guest owner on the share page (this browser holds the claim token) reads "Sign in to keep a game journal" with `?next=/d/<publicId>` (Y9a's dialog builds `?next=/decks/<id>/edit` — the share page's door returns to the share page).

Pre-flight, in order.
1. **Y9a has shipped.** `WAVE4.md`'s tracker ticks Y9a; `_journal.json`'s last entry is idx 18 (`0018_wooden_spencer_smythe`). Y9b adds **no migration** and **no route** (the route table byte-identical) unless a decision above says otherwise — say so before building.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). The Scryfall step logs `tagger roles: N fresh, N kept, N off` (anything but 17 fresh means a role kept its stored cards or was switched off); `counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168. **New since Y9a**: the nightly backup now dumps `deck_games` — **dispatch the restore drill once** (`gh workflow run restore-drill.yml`) after the first nightly that ran on or after 2026-10-11: its journal check (every game's deck and version present) ran only "skipped — dump taken before migration 0018" in Y9a, and the identity ids inside `deck_versions.cards` were checked for the first time.
3. **A warm beta signal outranks a package.** Ask first whether the r/EDH post (P2.9 round 3) went out and what came back. If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**: read-only database access (the census, `pnpm db:size`, the counters) and dev writes (dev shares prod's database: smokes and the dev pass mint and log; read the deck-create counters first — `smoke:games` mints 3 decks, `smoke:account` 2, `smoke:versions` ~4, so they don't all fit one hour's 10; delete QA decks with their tokens and re-prove the census). Say up front that the owner's clicks come at the end (signed in, prod, **on a phone**). Ask whether Y9a's owed clicks were done (and what they showed — they are also the first prod timing of the games routes).
5. **Working tree clean**, at or after Y9a's docs commit. Another session may share this working copy (`DESIGN-LAB-session-prompt.md`, untracked, is not yours). Stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table.
   - `pnpm check` after Y9a: 2,069 tests / 199 files / 6 warnings / 0 errors.
   - `pnpm db:size`: 286.0 MB after migration `0018` (285.9 before).
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); `deck_games` holds only the owner's Y9a clicks (if made).

## What Y9b is NOT (scope fence)

- NOT results, records, per-version numbers, History's "Played 3 · 2–1" rows, "No card changes since vN", editing recent games, or the first-game Warden line (Y10).
- NOT matchup statistics (the data starts here; the stats are LATER), playgroups, a public record, a guest journal, an `/account` Games section across decks, or an offline queue (LATER rows; row 15's trigger is the one to watch).
- NOT a change to Y9a's routes, hash, caps or Undo rule.
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-11 against Y9a's feat; re-grep lines and trust the shapes)

- **The routes**: `GET` / `POST /api/decks/[id]/games`, `PATCH` / `DELETE /api/decks/[id]/games/[gameId]` — gate `requireJournalDeck` (`src/lib/decks/route-helpers.ts`): session 401 "Sign in to keep a game journal" → buckets (writes `games:user` 30/min + `games:user-day` 200/day; reads `games-read:user` 60/min) → 404 / owner 403 → a guest deck 400 (same sentence) → a game without `journal` 400 → zod (`LOG_BODY`, `PATCH_BODY` in `src/lib/journal/check.ts`) → `journalIssue`. POST answers 201 `{game, version, minted, capped}`; GET `{games (≤ 50, newest first), total, playedSnapshots, playedAllowance}`; DELETE `{deleted, snapshotRemoved}`. `force-dynamic` + `no-store`.
- **The dialog**: `GamesDialog` (`src/components/editor/games-dialog.tsx`) takes `deckId, adapter, accountDeck, phone, finalFocus?, onBeforeLog, onLogged, onClose`; it renders in `SheetShell` (exported from `swap-sheet.tsx`); Players is a Segmented (`fitsSegmented`: eight short labels or six with a long one; else a select); "More details" is a Collapsible; the turn is checked 1–99 before anything is sent. A log hands `onLogged(LogResult)` to the host, which closes the dialog and raises the toast (a modal blocks a toast's Undo). The words are `JOURNAL_COPY` (`src/lib/journal/copy.ts`, guarded by `copy.test.ts` — no "approve"); the allowance number is `src/lib/journal/limits.ts` (import-free).
- **The editor's toast** (`handleLogged` in `deck-editor.tsx`): "Logged a win" + Undo (the games route's DELETE), and the capped line as the toast's description. The share page and `/account` have their own `Toaster` mounts — check which one a door would use.
- **The share page**: `ownerView = editToken !== null || deck.isOwner === true` (`deck-share-view.tsx` ~376); `OwnerShareRow` (Open in editor · Copy ▾ · Share… · Buy) — the owner-row pin is `deck-share-view.test.tsx` ~137 (`["Open in editor", "Copy", "Share…", "Buy this deck"]`), the visitor row ~126 and the byte-identical check ~554. `signInHref = accountHref("/d/<publicId>")`.
- **The `/account` tile ⋯**: `deck-action-items.tsx` (Open in editor, Open in new tab, View share page, Copy share link, Move to folder, Delete deck…) — pinned exactly in `account-deck-tile.test.tsx` 97–104.
- **The adapter's `journal`** (`JournalMeta`, `types.ts`): `pod`, `tableLevel?` (Magic reuses `brackets`' noun and levels), `seats(podSize)` → `{seat, label, phrase}`, `opponentLeaders`.
- **Measured in Y9a (dev only)**: POST 10 route statements when it mints a played snapshot, 7 when it reuses; GET 4; DELETE 6; every read index-served and under a millisecond; dev's 1.5–3.5 s wall time is round trips from the dev machine to Neon. **Prod is untimed** (session-only routes) — the owner's Y9a clicks are its first timing; three taps on a phone needs it.

## Verify-first list (never from memory)

1. **Three taps on a phone** from the share page (390 px, the owner signed in): Log a game → Won → the toast.
2. **The visitor row is byte-identical**; the owner row gains exactly "Log a game" (its place decided and pinned).
3. **The `/account` ⋯ list gains exactly "Log a game…"** (the pin rewritten, its place decided).
4. **Opponents land as external keys** (oracle ids for Magic, printed ids for One Piece), at most pod − 1, partners as one entry of two.
5. **A guest owner on the share page** reads "Sign in to keep a game journal" with `?next=/d/<publicId>`.
6. **The route table is byte-identical** (unless decided otherwise); `pnpm check` green.

## Design decisions to make explicitly (disclose + pin each)

- What the share page's "Log a game" opens, and where the toast lives there.
- What "Log a game…" on `/account` opens.
- The opponents control (how many rows show at once; partners; One Piece's single leader) and whether the route resolves the keys.
- Whether the quick log on the share page shows the recent games (Y9a's dialog does) or only the log.

## Deployable outcome

`pnpm check` green, deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), the route table as decided.
- The dev pass at 390 / 768 / 1200 / 1440 in both themes (the share page's owner row and `/account` signed in — Y9a's throwaway-session trick below); `smoke:games` and `smoke:account` green on dev.
- **The owner's clicks, signed in, prod, on a phone**: on one of your decks' share page, Log a game → Won → the toast (three taps), then Undo; from `/account`, a tile's ⋯ → Log a game… → Lost with one opponent's commander picked.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and the deviations, its status line pointing at Y10; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains "Y9b decisions"; LATER rows with triggers; memory updated; **`Y10-session-prompt.md` written** the way this one was.

## Session notes (environment)

Unchanged from `Y9a-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y9a.ts` and `counters-y9a.ts` are there to copy — note `counters-y9a.ts` also lists `games%` keys, which crowd the deck-create rows out of its 16-row limit; `counters-y8.ts` lists deck-create alone), the `dev-log` launch config, the pane usually hidden (drive it through the DOM). Run prettier on touched files before `pnpm check` (the drizzle meta files too, after a generate). Do mutation checks from a scratchpad runner (anchors asserted, files restored from memory; Y9a ran 73, all caught after two new pins) — and **never run a smoke while mutations run**: the dev server hot-reloads the mutated file.
- **New in Y9a — signed-in UI in the pane**: `scripts/.tmp/y9a-qa-fixture.ts create <x> <out.json>` makes a throwaway user + session + a 100-card account deck copied from a precon by SQL (no deck-create spent) and a One Piece account deck; set `document.cookie = "better-auth.session_token=<value>; path=/"` in the pane (localhost only), drive the real editor, then `delete <runId>` and clear the cookie. The editor's real flows (flush → POST → toast → Undo) ran this way.
- **New in Y9a**: drizzle prints a select list's columns **unqualified** — a correlated subquery in a select list (`"deck_id" = "id"`) binds to the inner table. Bind the value instead.
- **New in Y9a**: a game toast lives 5 s; on dev a flush + log takes ~3–5 s, so a script that waits for the toast and clicks Undo must poll for up to ~15 s.
- **New in Y9a**: the site defaults to dark whatever the OS scheme; light needs `localStorage.theme = "light"` (next-themes) and a reload — `resize_window`'s `colorScheme` alone doesn't switch it.
- **New in Y9a**: a Base UI ToggleGroup never presses an empty-string value — a "Not set" segment needs a word sentinel (`"none"`).
