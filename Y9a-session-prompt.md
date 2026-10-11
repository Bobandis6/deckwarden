# Y9a session prompt — Journal core (migration `0018`: `deck_games`, `deck_versions.kind` and `list_hash`; the playable-list hash; played snapshots with their own allowance; the games routes; the Games dialog from More; migrate before push)

## Ship note — 2026-10-11, feat `99c3621`, deployed (Vercel status success on the full sha at 01:03:12 Z; CI green)

**Shipped. The prompt below is history. Next is `Y9b-session-prompt.md` (Log at the table — no migration expected). The r/EDH post (P2.9 round 3) hadn't gone out at this session's start; it stays the owner's to schedule.**

**Pre-flight**: Y8's docs at `51bdc74`; `_journal.json` at idx 17; nightlies green through run 38072279069 (`tagger roles: 17 fresh, 0 kept, 0 off`; `extra_turn.added` 0, `mld.unreviewed` 0; the ruleset watch green). Read-only database access and dev writes approved; **the migration approved separately**, on its SQL. Y8's owed click: done, it worked. Baseline on `51bdc74`: 1,985 tests / 191 files / 6 warnings / 0 errors; the route table saved. Census 209 deck rows (16 account + 12 guest + 181 precons, 1 user); `pnpm db:size` 285.9 MB.

**Migrated before the push**: `drizzle/0018_wooden_spencer_smythe.sql` — `deck_games` (D10's columns, the result CHECK, ON DELETE CASCADE from `decks`, one index `(deck_id, played_on desc)`), `deck_versions.list_hash` and `kind` (DEFAULT 'saved', no rewrite) plus a `kind` CHECK (not in D10 — disclosed with the SQL; the owner said yes to it). `pnpm db:migrate` → the 13 columns, the index, both CHECKs and the FK confirmed read-only before the dev pass; `pnpm db:size` 285.9 → 286.0 MB.

**What shipped** (decisions in WAVE4's tracker and REDESIGN.md "Y9a decisions"):
- **`playableListHash`** (`src/lib/decks/list-hash.ts`) — cyrb128 over the canonical `[zone, cardId, qty]` payload, `h1:`-prefixed; pinned equal exactly when `isEmptyDiff` says no card changes (2,000 seeded pairs), a printing or tag change keeping it, the digest itself.
- **Versions** — `insertVersion` stamps the hash and counts its own kind (`saved` → the 50 cap; `played` → the 100 allowance, `src/lib/journal/limits.ts`); a version a logged game uses can't be deleted (409); History counts saved versions only and shows played lists without Delete.
- **The routes** — `GET`/`POST /api/decks/[id]/games`, `PATCH`/`DELETE …/[gameId]` (`requireJournalDeck`: session 401 → buckets → 404 / 403 → guest 400 → no journal 400 → zod → `journalIssue`); POST is one transaction (lock → hash → stamp unhashed versions → reuse the newest match or mint "Played {date}" → insert) answering `{game, version, minted, capped}`; DELETE takes a played snapshot with its last game.
- **The adapters' `journal`** — Magic: pods 2–8, the bracket as table level, seats 1st…8th, partners; One Piece: 1v1, went first / second, no table level.
- **The Games dialog** (More → Games…, live decks) — Log a game at the top (Players remembered per browser and game; Won / Lost / Draw log at once after the autosave flush; details folded), the allowance line, the ten newest games; a log closes the dialog for "Logged a win · Undo".
- **Lifecycle** — `USER_TABLES`, the privacy page and the account page's danger zone, the `delete-account.ts` / `forks.ts` comments, `smoke:account`'s "her games gone", the new `smoke:games`, the restore drill's checks (identity ids inside `deck_versions.cards`; every game's deck and version).

**Found by the checks**: (1) a route test caught drizzle printing a select list's columns unqualified — GET's counts would have correlated `deck_games.deck_id` with `deck_games.id`; the deck id is bound instead; (2) the dev pass found Players' one-digit segments 24 px wide on a phone — Segmented's touch items are now at least 44 px wide; (3) a turn outside 1–99 would have reached the route as "Invalid body" — the dialog says so itself now.

**Verified**: `pnpm check` 2,069 tests / 199 files / the same 6 warnings / 0 errors; 73 mutation checks, 71 caught on the first run, the two survivors (the gate's no-journal branch; `fitsSegmented`'s eight-segment bound) pinned and caught on the rerun; the route table gained exactly the two lines; `smoke:games` (44 checks), `smoke:account` and `smoke:versions` green on dev; `DB_LOG`: POST 10 route statements when it mints, 7 when it reuses, GET 4, DELETE 6, every read index-served and sub-millisecond (dev wall time 1.5–3.5 s is the dev machine's round trips to Neon); the dev pass at 390 / 768 / 1200 / 1440 in both themes, signed in on a throwaway localhost session (an edit then Won sent `PUT /cards` before `POST /games`; Undo removed the game and the snapshot it minted; One Piece logged 1v1, went second); every QA user, deck and game deleted — census re-proved at 209 deck rows, 0 games. **Prod** (signed out): `GET`/`POST /api/decks/[id]/games` and `DELETE …/games/1` answer 401 "Sign in to keep a game journal" with `no-store`; the privacy page carries the journal sentence. **The restore drill** (run 38100533913, after the push) restored the 2026-10-10 17:39 dump — 209 decks, 16,543 deck_cards rows, 0 dangling identity refs now counting the ids inside `deck_versions.cards` — and said "deck_games absent from this dump (taken before migration 0018) — journal check skipped"; its first real journal check comes with the next nightly backup (Y9b's pre-flight dispatches it).

**Owed — the owner's clicks** (signed in, prod; they are also the games routes' first prod timing): on one of your decks, More → **Games…** → **Won** → the toast "Logged a win · Undo" → **Undo**; then **Won** twice on the same list (History shows one "Played …" list, "0 / 50" saved); then edit a card and log again (a second "Played …" list).


Pull latest, then run Y9a, the fourteenth Wave-4 package and the first of the journal (ask 3). **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s journal rows (the `deck_games` row, "Played" snapshots with **their own allowance** via `deck_versions.kind`, the stats row) and the **migrate-before-push** row.
2. **D10** in full — the adapter `journal` declarations, the schema (`deck_games` and its one index, ~210 bytes a row; `deck_versions` gains `list_hash text NULL` and `kind text NOT NULL DEFAULT 'saved'`), the list hash, played snapshots, the routes, logging, the lifecycle.
3. The **Y9a** block in section E, its pin-matrix row (`versions.test.ts` hash stamping and `kind`; `account-delete-smoke.ts` "games gone"; `editor-header.test.tsx` live-deck More list with `toContain`; **must not change**: the draft More list (exact) and `versions-forks-smoke.ts`), the rollback line (revert and drop `deck_games`, `list_hash`, `kind` — logged games are lost, the owner's call) and **Verification (whole wave)**.
4. REDESIGN.md's **"Y8 decisions"** (the newest editor dialog, `"fit"`; the focus return after the closing commit) and **"Y7b decisions"** (`closeFocusRef`, Base UI's `finalFocus` timing).
5. LATER rows **46** (history stays owner-only — played snapshots included), **64** (the journal's sign-in prompt is one more quiet line), **15** (PWA offline table mode — re-deferred) and the rows Y8 added (191–195).
6. Y8's ship note at the top of `Y8-session-prompt.md`.

Y9a makes a logged game always know the exact list it was played with:
- **`playableListHash`** (new, pure, isomorphic — no `node:crypto`): a canonical `[zone, cardId, qty]` payload, duplicates merged as `diff.ts` merges them, sorted. Pinned: equal exactly when `isEmptyDiff` says no card changes; a printing or tag change keeps the hash.
- **Migration `0018`** (step 2 — generate, eyeball, the owner's yes, migrate, confirm the columns, only then the dev pass and the push): `deck_games` (D10's columns; `ON DELETE CASCADE` from `decks`; one index `(deck_id, played_on desc)`), `deck_versions.list_hash` and `kind`.
- **`insertVersion` stamps the hash; the 50 cap counts `saved` only**; `played` snapshots get their own allowance (100 per deck, disclosed). Save version and Restore are never blocked by played snapshots.
- **The routes**: `GET` / `POST /api/decks/[id]/games`, `PATCH` / `DELETE /api/decks/[id]/games/[gameId]` — session (401) → a per-user bucket (windows ≤ 1 day) → owner (403) → a guest deck answers 400 "Sign in to keep a game journal" → zod → the adapter's `journal` checks; `force-dynamic` + `no-store`. POST is one transaction: lock the deck → hash the live list → reuse the newest version with that hash or mint a `played` snapshot noted "Played {date}" → insert the game; the response says `{version, minted, capped}`. The route table gains **exactly** those two lines.
- **The Games dialog** from More ("Games…", live decks only — the draft More list stays exact), "Log a game" at the top; the editor flushes autosave first so the snapshot equals the screen; Won / Lost / Draw logs at once; the toast "Logged a win · Undo" (Undo deletes the game and the snapshot it minted if no other game uses it).
- **Lifecycle**: `deck_games` joins `USER_TABLES` in `scripts/backup-user-tables.sh`, the privacy page's deletion sentence, the comments in `delete-account.ts` and `forks.ts` (forks copy no games), a "her games gone" check in `smoke:account`, a new `smoke:games`, and the restore drill's dangling-reference check (which also learns the identity ids inside `deck_versions.cards`).

Pre-flight, in order.
1. **Y8 has shipped.** `WAVE4.md`'s tracker ticks Y8; `_journal.json`'s last entry is idx 17 (Y9a writes 18).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red ingest is P4.7 branch F and preempts everything; a red ruleset watch means the Game Changers changed. The Scryfall step logs `tagger roles: N fresh, N kept, N off` — anything but 17 fresh means a role kept its stored cards or was switched off. `counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** Ask first whether the r/EDH post (P2.9 round 3) went out and what came back. If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**: read-only database access (the census, `pnpm db:size` before and after, the counters), dev writes (dev shares prod's database: smokes and the dev pass mint and log; read the deck-create counters first; delete QA decks with their tokens and re-prove the census), and — separately — **the migration**: Y9a is migrate-before-push, so the owner's yes on the eyeballed `drizzle/0018_*.sql` comes before `pnpm db:migrate`, and the push waits for the column check. Say up front that the owner's clicks come at the end (signed in, prod). Ask whether Y8's owed click was done.
5. **Working tree clean**, at or after Y8's docs commit. Another session may share this working copy (`DESIGN-LAB-session-prompt.md`, untracked, is not yours). Stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table.
   - `pnpm check` after Y8: 1,985 tests / 191 files / 6 warnings / 0 errors (on `c12c6c8`).
   - `pnpm db:size`: 285.9 MB on 2026-10-10.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); one deck with goals (Nelson & Murdock: target 3, ≤ $5 a card — plus whatever total the owner's Y8 click saved).

## What Y9a is NOT (scope fence)

- NOT the share page's or `/account`'s log doors, the quick log at the table, opponents through X2's suggest box (Y9b). NOT results, records or History rows (Y10).
- NOT matchup statistics, playgroups, a public record, a guest journal or an `/account` Games section (WAVE4 F — LATER rows).
- NOT a change to Save version's or Restore's behavior beyond the cap counting `saved` only.
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-10 against `c12c6c8`; re-grep lines and trust the shapes)

- **Versions** (`src/lib/decks/versions.ts`): `MAX_VERSIONS_PER_DECK = 50` (52); `insertVersion(tx, deckId, cards, note)` (194) counts **every** row for the cap (`count(*)` — Y9a narrows it to `kind = 'saved'`), bumps `decks.current_version` (never reused) and inserts; writers hold `lockDeck`. `saveVersion` = lock → `loadLiveFrozen` → `insertVersion`. Frozen shape `[{cardId, zone, qty, tags, printingId}]`. Restore's safety snapshot and a fork's baseline also go through `insertVersion`.
- **Schema** (`src/db/schema.ts`): `deckVersions` (580) has `id`, `deckId` (cascade), `version`, `note`, `cards` jsonb, `createdAt`, unique `(deck_id, version)`. The name **`games` is taken** by the card-game registry (`schema.ts` 56) — hence `deck_games`.
- **The diff** (`src/lib/decks/diff.ts`): `isEmptyDiff` (131) is the hash's equality oracle; "No card changes" (142).
- **Routes**: `src/app/api/decks/[id]/` holds `bookmark`, `cards`, `combos`, `fork`, `like`, `recommendations`, `upstream`, `versions` (+ `[version]`, `restore`). The History dialog (`src/components/editor/history-dialog.tsx`) reads `/versions` and shows `atCap` from `list.cap`.
- **The editor's More** (`editor-header.tsx`): Details, Import, Autofill…, **Fit my budget…** (Y8), Export, Buy this deck…, History (live decks only), Keyboard shortcuts. The exact list is pinned in `editor-header.test.tsx` ("More lists …"); History joins with `toContain` — "Games…" follows that precedent (live decks only).
- **Lifecycle files**: `scripts/backup-user-tables.sh` 22 (`USER_TABLES="users decks deck_folders deck_cards deck_versions deck_likes deck_bookmarks collections precon_products"`); `src/lib/profile/delete-account.ts` (the cascade comment); `src/lib/decks/forks.ts`; `.github/workflows/restore-drill.yml` (restores the latest dump and remaps identity refs); smokes in `scripts/*-smoke.ts` (`account-delete-smoke.ts`, `versions-forks-smoke.ts`).
- **The editor's dialog slot** (`EditorDialog`): `"fit"` joined in Y8; focus returns through `closeFocusRef` after the closing commit when a door needs it (Y7b, Y8).

## Verify-first list (never from memory)

1. **Two logs on an unchanged list → one played snapshot; a changed list → a new one** (route tests and `smoke:games` on dev).
2. **Save version and Restore are never blocked by played snapshots**; at the played allowance a game still logs, `version` NULL, and the dialog says so.
3. **Deleting the deck or the account removes its games** (`smoke:account`'s new check; the cascade).
4. **A guest deck gets "Sign in to keep a game journal"**; a signed-out owner the same with `?next=`.
5. **One Piece logs 1v1 with went-first / went-second; no table level.**
6. **The route table gains exactly the two lines**; `pnpm check` green; the draft More list exact.
7. **`pnpm db:size` before and after the migration** (the table is empty; the size moves by its index).

## Design decisions to make explicitly (disclose + pin each)

- The Games dialog's shape (the dialog slot `"games"`; a Drawer on phones, a Modal from md) and where "Log a game" sits.
- The flush-before-log contract (what happens when the flush fails).
- The per-user bucket's numbers (windows ≤ 1 day).
- The played allowance's disclosure words, and the "capped" sentence.
- Undo: which snapshot goes with the game, and when it stays.

## Deployable outcome

`pnpm check` green, **migrated before the push** (the owner's yes on the eyeballed SQL, `pnpm db:migrate`, the columns confirmed), deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table as decided.
- The dev pass at 390 / 768 / 1200 / 1440 in both themes; `smoke:games`, `smoke:account`, `smoke:versions` green on dev; the restore drill's dangling-reference check learns the new table.
- **The owner's clicks, signed in, prod**: on one of your decks, More → Games… → Log a game → Won → the toast's Undo; log twice on the same list (one played snapshot in History); edit a card and log again (a second one).

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and the deviations, its status line pointing at Y9b; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains "Y9a decisions"; LATER rows with triggers; memory updated; **`Y9b-session-prompt.md` written** the way this one was.

## Session notes (environment)

Unchanged from `Y8-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y8.ts` and `counters-y8.ts` are there to copy), the `dev-log` launch config, the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL — the journal is account-only, so most of Y9a's UI proof is RTL plus the owner's clicks. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup (the anchor asserted, the file restored after — Y8's runner ran 61).
- **New in Y8:** a fetch wrapper installed by a script that then fails stays installed — the next script's wrapper stacks on it and every call logs twice. Count requests with `read_network_requests` (or guard the wrapper) before believing a doubled count.
- **New in Y8:** in dev, StrictMode's mount twin re-asks a sheet's first batch (the aborted asks still reach the server and its bucket); prod mounts once. Count prod asks for the real number.
- **New in Y8:** after a scripted apply, wait for the save slot to read "saved" (not just for a PUT to start) before reading the deck back — a GET can race the second PUT.
- **New in Y8:** a hidden pane can screenshot a disabled-looking button that the DOM reports enabled (a stale frame); trust `button.disabled`.
