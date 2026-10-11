# Y10 session prompt — Results (the Games dialog's record: "N games · W–L–D", pod splits with the baseline, per version with `diffSummary`, a percentage only from 10 games, "Too few games to compare" below 5; recent games editable; History's "Played 3 · 2–1"; Save version's "No card changes since vN"; the first-game Warden line)

## Ship note — 2026-10-11, feat `694f67e`, deployed (Vercel status success on the full sha at 03:39:21 Z; CI green)

**Shipped. The prompt below is history. Wave 4 is complete — there is no Y11.** What comes next is the owner's call: a wave-5 planning session, P2.9 round 3 when the r/EDH post lands (it hadn't gone out at this session's start), or a LATER trigger.

**Pre-flight**: Y9b's docs at `4b2d935`; `_journal.json` at idx 18; nightlies green through run 38072279069 (`tagger roles: 17 fresh, 0 kept, 0 off`; `extra_turn.added` 0, `mld.unreviewed` 0). **The restore drill is still owed**: no nightly had run since migration `0018` (the 2026-10-11 run lands ~15–17 Z), and the 01:03 Z drill (run 38100533913) restored the 2026-10-10 17:39 dump — "journal check skipped". Read-only database access and dev writes approved. Y9b's owed clicks: done on a phone, all worked. Baseline on `4b2d935`: 2,093 tests / 200 files / 6 warnings — `pnpm check` exited 1 on an unhandled teardown error (fixed here, below); the route table saved (73 lines); census 209 deck rows (16 account + 12 guest + 181 precons, 1 user), `deck_games` 2; `pnpm db:size` 286.1 MB.

**What shipped** (decisions in WAVE4's tracker and REDESIGN.md "Y10 decisions"):
- **The Games dialog's record** — "13 games · 6–7 · won 46%" (a percentage only from 10 games; draws shown when there are some), "By players" with the table's baseline ("4 players · won 6 of 12 · 50% · an even table wins 1 in 4"; One Piece says "An even table wins 1 in 2." once), "By list" — the newest 10 lists played, each "since" the list played before in `diffSummary`'s words ("v8, since v5: +2 · -2 · won 3 of 7"), "Too few games to compare" below 5, "No list kept" as its own row, "and N earlier lists". Counted on the server over every game (one grouped statement); worded by `src/lib/journal/record.ts`.
- **Recent games named and editable** — "vs Atraxa, Praetors' Voice; Kraum, Ludevic's Opus + Tymna the Weaver" (LATER row 199, fired and closed: the GET reads the names in one statement); Edit opens the game as stored in the log's own fields, saves only what changed (PATCH), or deletes it (asked first); the list and the record reload; focus returns.
- **History** — "Played 3 · 2–1" on every version a game was played with; Save version says "No card changes since v8 (tags and printings aren't compared)." when the screen hashes like the newest version (the versions GET sends its hash), and stays enabled.
- **The Warden's first-game line** — "The Warden keeps this deck's record from here." as the toast's description on a deck's first game (the POST's `first`), on all three doors.
- No migration, **no route — the route table byte-identical**; the games GET (`record`, `lists`, `names`), the versions GET (`record` per version, `latestListHash`) and the games POST (`first`) grew.

**Found by the checks**: (1) the baseline check's red exit — Y9b's owner-row preload of the lazy Games dialog outliving `private-share-gate.test.tsx`'s environment under a full run; the three test files whose components preload it now import it up front; (2) History's RTL suite found Restore saying "1 card no longer exist" — the verb agrees now; (3) the dev pass found the 44 px Edit targets sitting low beside one-line games — the rows center.

**Verified**: `pnpm check` 2,154 tests / 203 files / the same 6 warnings / 0 errors; fifty mutation checks, all fifty caught on the first run; **the route table byte-identical**; `smoke:games` (63 checks) and `smoke:versions` (48) green on dev; the dev pass at 375 / 768 / 1200 / 1440 in both themes on a throwaway harness (public rows only — no QA user, no dev write); the measure deck deleted, census re-proved at 209. **Prod** (signed out, after the deploy): a share page carries none of the record's words; the games GET answers 401 with `no-store`; the versions GET refuses a stranger (403, no record in the body). The signed-in flows wait for the owner's clicks.

**Owed — the owner's clicks** (signed in, prod): on a deck with a few games, **More → Games…** — the record (the numbers; "Too few games to compare" under a list with fewer than 5 games), then **Edit** on one recent game, change one thing, **Save changes**; **More → History** — the "Played …" rows, and with no edits since the newest version, "No card changes since vN" under Save version. **And the restore drill**: after the 2026-10-11 nightly, `gh workflow run restore-drill.yml` — its journal check should finally read the games (2 today, plus whatever the clicks leave).

Pull latest, then run Y10, the sixteenth and last Wave-4 package and the third of the journal (ask 3). **`WAVE4.md` is the contract.** Read these, in this order:

1. **D10**'s **Results (Y10)** paragraph (the numbers, the per-version rows, the 10-game percentage floor, "Too few games to compare" below 5 per version, recent games editable, History's rows, "No card changes since vN", one restrained Warden line, everything owner-only) and section **A**'s stats row ("honest sample sizes").
2. The **Y10** block in section E, its pin-matrix row (new `HistoryDialog` RTL; **must stay green**: `versions-forks-smoke.ts`) and **Verification (whole wave)**. Note: E's "RTL tests for `HistoryDialog` (none exist)" is stale — Y9a added three (`history-dialog.test.tsx`, played snapshots).
3. REDESIGN.md's **"Y9b decisions"** (three doors open one dialog; `returnPath`; account-only = no claim token; opponents as keys in picked order; the shared toast) and **"Y9a decisions"** (the hash, reuse, the caps, the 409 on a version a game uses, PATCH's rules, the buckets, the allowance words).
4. LATER rows **196** (games at the played allowance keep no list — "no list kept" in Y10's per-version numbers), **197** (no legality gate — illegal lists in per-version rows), **199** (recent games don't name opponents — **its trigger is Y10's editable recent games**), **200** (a typed-but-unpicked opponent stops the log), **145** (matchup statistics — NOT Y10), **15** (offline — NOT Y10).
5. Y9b's ship note at the top of `Y9b-session-prompt.md`.

Y10 makes the record tell the truth about small numbers:
- **The Games dialog's numbers** (`src/components/editor/games-dialog.tsx`, the same dialog behind all three doors): "N games · W–L–D"; split by pod size with the baseline ("an even 4-player table wins 1 in 4" — Magic's pods vary, One Piece is 1v1); per version ("v8, since v7: +2 −2 · 3 of 7" — `diffSummary` in `src/lib/decks/diff.ts` today prints "+3 · -2 · 1 qty · 1 moved"; decide whether D10's example is a new format or the existing one); a percentage only from 10 games; "Too few games to compare" below 5 per version; games logged with no list (row 196) say so.
- **Recent games, editable** — PATCH exists (Y9a: details only, the adapter's checks over the whole game, `null` clears a detail). Row 199 fires: an edit must show what it edits, so opponents need names (the GET returns keys) — decide: the GET joins `card_identities` on `external_key` (one statement over the page's keys), or opponents stay read-only in an edit.
- **History's rows** (`src/components/editor/history-dialog.tsx`) gain "Played 3 · 2–1" per version.
- **Save version says "No card changes since vN"** when the live list's hash matches the newest version's (`playableListHash` is isomorphic — the editor can hash the screen).
- **The first logged game earns one restrained Warden line** (copy in `src/lib/warden-copy.ts` + `warden-copy.test.ts`; the journal's words stay in `JOURNAL_COPY`, guarded by `copy.test.ts` — no "approve").

Pre-flight, in order.
1. **Y9b has shipped.** `WAVE4.md`'s tracker ticks Y9b; `_journal.json`'s last entry is idx 18 (`0018_wooden_spencer_smythe`). Y10 adds **no migration** and **no route** unless a decision below says otherwise — response shapes may grow (the versions GET's `listHash` or per-version counts, the games GET's names or aggregates): say which before building, and keep the route table byte-identical.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`): `tagger roles: 17 fresh, 0 kept, 0 off`; `counts.extra_turn.added > 0` fires LATER row 170, `counts.mld.unreviewed > 0` row 168. **Owed since Y9a: dispatch the restore drill once** (`gh workflow run restore-drill.yml`) after the first nightly that ran on or after 2026-10-11 (its backup is the first with `deck_games`): the journal check ("every game's deck and version present") has only ever said "skipped — dump taken before migration 0018". Record its counts.
3. **A warm beta signal outranks a package.** Ask first whether the r/EDH post (P2.9 round 3) went out and what came back. If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**: read-only database access (the census, `pnpm db:size`, the counters) and dev writes (dev shares prod's database: smokes and the dev pass mint and log; read the deck-create counters first — `smoke:games` mints 3 decks, `smoke:account` 2, `smoke:versions` ~4; they don't all fit one hour's 10; delete QA decks and re-prove the census). Say up front that the owner's clicks come at the end (signed in, prod). Ask whether Y9b's owed clicks were done (on a phone; what they showed — the first prod timing of the games routes from a phone).
5. **Working tree clean**, at or after Y9b's docs commit. Another session may share this working copy (`DESIGN-LAB-session-prompt.md`, untracked, is not yours). Stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table.
   - `pnpm check` after Y9b: 2,093 tests / 200 files / 6 warnings / 0 errors.
   - `pnpm db:size`: 286.09 MB.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); `deck_games` holds only the owner's clicks (1 after Y9a's, plus whatever Y9b's clicks left).

## What Y10 is NOT (scope fence)

- NOT matchup statistics (row 145 — opponents are collected, the stats wait), playgroups, a public record (nothing on the share page, tiles or OG), a guest journal, an `/account` Games section across decks, or an offline queue (row 15).
- NOT a change to Y9a's hash, caps, Undo rule or the routes' gates; NOT Y9b's doors or the opponents control (except names for editing, if row 199's decision says so).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-11 against Y9b's feat `f1e53f5`; re-grep lines and trust the shapes)

- **The routes** (Y9a, unchanged by Y9b): `GET` / `POST /api/decks/[id]/games`, `PATCH` / `DELETE …/games/[gameId]` — gate `requireJournalDeck` (session 401 "Sign in to keep a game journal" → buckets `games:user` 30/min + `games:user-day` 200/day, reads `games-read:user` 60/min → 404 / 403 → guest deck 400 → no journal 400 → zod (`LOG_BODY`, `PATCH_BODY` in `src/lib/journal/check.ts`) → `journalIssue`). GET answers `{games (≤ 50, newest first), total, playedSnapshots, playedAllowance}` (`listGames`, `src/lib/journal/games.ts` ~85); a game is `{id, version, playedOn, podSize, result, endTurn, tableLevel, seat, opponents (keys or null), notes, createdAt}`. `force-dynamic` + `no-store`.
- **The versions GET** (`src/app/api/decks/[id]/versions/route.ts`, `listVersions` in `src/lib/decks/versions.ts` ~140) returns `version, note, kind, createdAt, cardCount` per version — **no `listHash`** and no game counts; the cap counts `saved` only.
- **The dialog** (`GamesDialog`): props `deckId, adapter, accountDeck, phone, returnPath?, finalFocus?, onBeforeLog, onLogged, onClose`; the recent list shows `RECENT_SHOWN` = 10 lines (`JOURNAL_COPY.gameLine`: "Oct 10 · Won · 4 players · went 1st · v12", "no list kept"); "More details" is a controlled Collapsible; the opponents field is `opponents-field.tsx`. Three doors: the editor's More → Games… (flushes first), the share page's "Log a game" and `/account`'s "Log a game…" (both through `log-game-door.tsx`'s lazy `log-game-dialog.tsx`; `onBeforeLog` answers true). The toast is `showLoggedToast` (`logged-toast.ts`) — "Logged a win · Undo", the capped line as its description (a place a first-game Warden line could ride).
- **History** (`history-dialog.tsx`): Compare (the pure diff to the live list), Restore (confirmed), Delete (saved versions only — played snapshots have none; a version a game uses answers 409). RTL: three tests (Y9a).
- **The adapter's `journal`**: `pod {min, max, default}` (Magic 2–8 default 4; One Piece 2), `tableLevel?`, `seats(pod)`, `opponentLeaders`; `adapter.display.leaderNoun` ("Commander" / "Leader").

## Verify-first list (never from memory)

1. **Fixture numbers pinned**: W–L–D; the pod split and its baseline line; version rows with their diff; a percentage only from 10 games; "Too few games to compare" below 5 per version; "no list kept" games counted honestly.
2. **History's rows** read "Played 3 · 2–1" (played snapshots and saved versions both).
3. **Save version** says "No card changes since vN" exactly when the hash matches (a printing or tag change keeps the hash — Y9a's pin).
4. **The first-game Warden line** shows once, and no journal string says "approve".
5. **Recent games are editable** (PATCH), and what an edit shows is what it saves.
6. **Nothing public**: the share page, tiles and the OG image show no record.
7. **The route table** as decided; `pnpm check` green; `smoke:versions` (and `smoke:games`) on dev.

## Design decisions to make explicitly (disclose + pin each)

- Where the numbers are computed: from the ≤ 50 games the GET already returns (client) or an aggregate in the GET (server — the totals beyond 50 need it).
- How History learns its counts (a per-version join in the versions GET, or the games GET).
- How "No card changes since vN" knows the newest hash (`listHash` in the versions GET, or a flag from Save's own POST).
- Row 199: names for opponents in an edit (the GET join) or opponents read-only in an edit.
- Where the Warden line lives (the toast's description on the first game, or the dialog).

## Deployable outcome

`pnpm check` green, deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), the route table as decided.
- The dev pass at 390 / 768 / 1200 / 1440 in both themes (the dialog's record and History — on the harness, see below); `smoke:versions` and `smoke:games` green on dev.
- **The owner's clicks, signed in, prod**: the Games dialog's record on a deck with a few games (the numbers, "Too few games to compare"), History's "Played …" rows, Save version on an unchanged list ("No card changes since vN"), editing one recent game.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and the deviations, **its status line saying Wave 4 is complete**; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains "Y10 decisions"; LATER rows with triggers; memory updated. There is no Y11 — say what comes next (the owner's call: a wave-5 planning session, P2.9 round 3 when the post lands, or LATER triggers) instead of writing a next prompt.

## Session notes (environment)

Unchanged from `Y9a-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y9b.ts` is there to copy: census + journal + deck-create counters; `--shapes` checks opponent keys), the `dev-log` launch config, the pane usually hidden (drive it through the DOM). Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad runner (anchors asserted, files restored from memory — the runner's exit handler restores every file it touched, so **never edit a mutated file until it exits**); never run a smoke while mutations run.
- **New in Y9b — no session cookie in the pane.** The permission classifier refuses to print a throwaway session cookie ("Credential Materialization"), so Y9a's `document.cookie` trick is gone; don't work around it. Instead: a **throwaway harness page** under `src/app/(site)/qa-<pkg>/` (never committed, deleted before `pnpm check` and the build): a server page loading the QA fixture's rows (`scripts/.tmp/y9b-qa-fixture.ts create <x> <out.json>` / `delete <run>` — no deck-create spent) with the owner flag forced, inside a client shim that answers the session-only routes (`fetch` patched in a `useState` initializer; everything else passes through). The real POST paths are `smoke:games`' and RTL's.
- **New in Y9b — hidden-pane input.** Once a hidden pane stops compositing, `computer` `type` fails; set the value through the native setter and dispatch `new InputEvent("input", { bubbles: true, inputType: "insertText" })` (Base UI ignores a change without `inputType`). The share page's streamed boundary never hydrates in a hidden pane (a guest owner's row never swaps in there); a Base UI menu's exit freezes, so a menu-to-dialog focus handoff can't be judged there (RTL pins it).
- **New in Y9b — lazy chunks.** The Turbopack dev server writes every `next/dynamic` chunk's script into the HTML; measure on a production build — `.next/dev` isolates dev from `pnpm build`, and `pnpm exec next start -p 3111` serves the build beside dev (stop it after). Prod chunks live under `/_next/static/immutable/chunks/`. `scripts/.tmp/y9b-chunks.mjs <manifest> <marker…>` lists a page's entry chunks and where a marker lives.
- **New in Y9b**: `isDeckOwner` is true for a guest deck whose claim token matches — the private gate's `deck.isOwner` is true for a token holder; "owned through the session" is "no claim token in this browser".
- **From Y9a, still true**: drizzle prints a select list's columns unqualified (bind values in correlated subqueries); a game toast lives 5 s; the site defaults to dark (`localStorage.theme = "light"` + reload for light); a Base UI ToggleGroup never presses `""`.
