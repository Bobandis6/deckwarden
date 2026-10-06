# Y4b session prompt — Your target (`0017` `decks.goals`, How it plays, Your target, the conflict callout, "Rules changed since you answered")

## Ship note — 2026-10-05, feat `3f5a6a9`, deployed (Vercel status success on the full sha, 02:24:57 Z on 2026-10-06; CI green 02:27 Z)

**Shipped. The prompt below is history. Next is `Y5-session-prompt.md` (at the table: the share page's line, "At the table", Copy for the table, the owner row, declared-only OG and tile chips).**

**Pre-flight**:
- Y4a had shipped (`aa2a29f`, docs `bbebc31`; `_journal.json` at idx 16).
- **Nightlies green** through run 37362966440 (2026-10-05, ruleset watch green; the run's 15 min was queue time, the job took 5). Tagger: `mld` unreviewed 0, `extra_turn` added 0, so rows 168 and 170 didn't fire. Gauge 285.1 MB.
- **The owner's answers**: nothing posted or arrived. Approved: read-only database access, migration `0017`, and dev writes with cleanup.
- **Baseline on `bbebc31`**: 1,544 tests / 168 files / 6 warnings / 0 errors. Census 209 deck rows = 28 user decks (16 account + 12 guest) + 181 precons, 1 user. `pnpm db:size` 285.1 MB; deck-create counters empty. The route table was saved.

**The migration**: `drizzle/0017_concerned_doctor_spectrum.sql` is exactly `ALTER TABLE "decks" ADD COLUMN "goals" jsonb;`. The snapshot differs from `0016`'s by that one column. It was applied with `pnpm db:migrate` and confirmed through `information_schema` (jsonb, nullable, no default, 0 rows set) before anything else touched the database. Size 285.1 MB before and after.

**What shipped** (decisions in WAVE4's tracker and REDESIGN.md "Y4b decisions"):
- **`src/lib/decks/goals.ts`** — the stored shape, its adapter-ranged zod, the Why sheet's pure edits, `publicGoals`, and a canonical `goalsPatchBody`.
- **The routes** — PATCH `{goals}` moves `updated_at` only beside another key; the create carries a draft's goals. `deckMetaJson` gives the owner everything and visitors the target and the exceptions.
- **The adapter's line** — "Your target: Bracket 2 · the cards say at least 3"; with answers and a call still open, "Bracket 3 or 4 — from the cards and your answers · one combo is your call". `BracketsMeta` gains `exceptionsHint`, and `BracketLineContext` gains `targetLevel`.
- **The sheet** — Your call answerable; Your target (`Segmented` 1–5 · Not set, the conflict callout, the exceptions line); How it plays (collapsed); "Rules changed since you answered" with "Keep my answers".
- **The editor** — goals' own baseline inside `save()`, the create, `isBlankDraft`, the keepalive and `hydrate`.

**Found on the way**:
- **Postgres' jsonb re-sorts object keys** (shortest first). The first dev smoke failed two checks that compared goals as strings. `goalsPatchBody` now sorts keys at every depth, so goals read back after a reload compare equal to the same goals edited in place, and the smoke compares canonically.
- **A chain of extra turns asks one question whose id joins every card's oracle id** (37 characters each). The first build capped ids at 200 characters, so any deck with six or more extra-turn cards would have had its answer refused with a 400 and its autosave stuck. Found in review before the push: ids may run to 4,000 characters, stored answers are capped at 100 and 12,000 characters (off-screen answers pruned first), and a contract test feeds the engine's real ids through the zod.
- **Six equal segments as wide as "Not set" only fit a 375 px phone with 4 px to spare**, and would have clipped on a 360 px one. `Segmented` narrows its coarse padding to 8 px past four options: at 360 the segments are 54 px and the 40 px label is whole.
- **A precon draft can't be blank.** Its seeded list differs from the empty cards baseline, so any goals edit there mints the row; "set and cleared" mints too, the same as Y2a's undone removal. The goals clause of `isBlankDraft` only decides once the list is back to empty, so it is pinned with a rolled commander cut inside the debounce.
- **The hidden pane** timed out a prod screenshot ("not compositing frames"), as the browser-pane notes warned; the prod pass ran on DOM reads. The md tier's closed Tools drawer matched a bare drawer query until the check looked at the Why dialog's own container.

**Measured**: the dev QA deck's goals (a target and one answer) weigh 148 bytes (`pg_column_size`). Thirty-three mutation checks, each caught. The goals PATCH's statement count wasn't read from `DB_LOG`; its code path is the meta PATCH's (the same bucket, the same deck select, one update).

**Dev** (signed out, the shared database):
- **A state-only Creative Energy draft** opened its sheet with zero requests: two combo questions with Yes / No / Not sure, Your target with Not set pressed, the exceptions hint, and How it plays collapsed.
- **Target 2** minted exactly one deck: one POST carrying `{"goals":{"v":1,"targetLevel":2}}` and the name, one PUT, no PATCH. The line read "Your target: Bracket 2 · the cards say 3 or 4 — two combos are your call · Why?", and the callout listed Farewell (a Game Changer) and two two-card combos, each with its cut.
- **Answering one combo "No"** was one PATCH (`keepalive` false) after the autosave debounce. `updated_at` was 02:13:52.641Z before and after, read through the API and again from the row after two more goals PATCHes.
- **A reload** kept target 2, the answer and the callout.
- **Goals written under `rulesetVersion: 0`** read "… · Rules changed since you answered · Why?", and the sheet showed the notice. "Keep my answers" sent one PATCH with `rulesetVersion: 1`, and the notice went away.
- **The viewport pass**: 360, 390, 768, 1200 and 1440 in both themes. No horizontal overflow and no clipped label; a Drawer below md and a Modal from md; every choice and the exceptions input 44 px on touch.
- **`smoke:decks`** green with ten new goals checks: the create carries goals, One Piece's 400, the 403, updatedAt untouched by goals but moved by a name, owner and visitor wires, the range 400, and null clears.
- **Cleanup**: the QA deck was deleted with its token (204, then 404). The census was re-proved at 209 deck rows, 0 with goals.

**Prod** (signed out, zero writes): the visitor deck GET answers `goals: null` with `no-store`. The share page's props carry `"goals":null`, with no budget or answers. A state-only Creative Energy draft reads as Y4a measured, and its sheet shows every Y4b block, with no request sent by opening it.

**The owner's clicks (signed in, prod) — owed**: set a target on one of your decks and answer one question in its Why sheet; reload; the line and the sheet keep both, and the deck stays where it was in `/account`.

**LATER**: new rows 174 (a ruleset bump flags every deck's answers at once), 175 (a list that has found nothing offers no Why?, so no target yet — Y6a's goals line) and 176 (the anon purge's clock is `updated_at`, which goals don't move).

---

Pull latest, then run Y4b, the seventh Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s decisions table, the deck-goals row: one nullable `decks.goals` jsonb with game-agnostic keys (`targetLevel`), saved through **its own PATCH**, which never bumps `updated_at`. The public subset is the target, the exceptions line and the answers that changed the read; the budget stays owner-only. Then the **Migrate before push** row.
2. **D0**: the copy rules (plain words, never notation; "Your call" and "Couldn't check"; no "approve"); `Segmented` for choices; adapter gating (One Piece has no target).
3. **D5**, Y4b's half:
   - the line table's "Target below the cards" row;
   - the Why sheet's **How it plays**, **Your target** and **the conflict callout**;
   - the **Goals (Y4b)** paragraph.
4. **D11**: "A declared target never hides conflicting evidence" and "A rules change prompts a review".
5. The **Y4b** block in section E, its pin-matrix row, and **Verification (whole wave)** (migrate before push; dev shares prod's database).
6. REDESIGN.md's **"Y4a decisions"**: the line's words are adapter data, the order of core's lines, the sheet's structure, the copy guard's three places.
7. Y4a's ship note at the top of `Y4a-session-prompt.md`.

Y4b lets the player say what they're aiming for, and the read answers honestly:
- **One migration**: `0017`, one `ADD COLUMN "goals" jsonb` on `decks`, and nothing else. Migrate before push.
- **Goals have their own client baseline and their own PATCH body `{goals}`.** The route bumps `updated_at` only when a key other than goals is present.
- **The sheet gains three blocks**: How it plays (four questions, each Yes / No / Not sure), Your target (`Segmented` 1–5 · Not set, plus an optional exceptions line), and the conflict callout. The open questions Y4a shows get their answer controls.
- **The line gains** the target row, and the "with answers" line for a read that still has open questions.
- **"Rules changed since you answered"** shows when `read.answersStale`.

**No new route.** The route table is unchanged. Every other surface must answer exactly as before. The share page's line is Y5's.

Pre-flight, in order.
1. **Y4a has shipped.** `WAVE4.md`'s tracker ticks Y4a (feat `aa2a29f`), and `_journal.json`'s last entry is still idx 16.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`).
   - A red ingest is P4.7 branch F and preempts everything. A red ruleset watch means the Game Changers changed: move the pin first (`bracket-ruleset.ts`).
   - `stats.tagger.counts.extra_turn.added > 0` fires LATER row 170, and `counts.mld.unreviewed > 0` fires row 168: a one-line review each, before the package.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived.
4. **Ask the owner, once, at the start, in plain words**, for three things:
   - read-only database access (the census, `pnpm db:size`, the counters);
   - **the migration's yes**, after you show them `drizzle/0017_*.sql`;
   - and say up front that the dev pass and `smoke:decks` write through the dev server (dev shares prod's database). Their decks are deleted afterwards and the census re-proved.
5. **Working tree clean**, at or after Y4a's docs commit. Another session may share this working copy: stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **empty**.
   - `pnpm check` on `aa2a29f`: 1,544 tests / 168 files / 6 warnings / 0 errors. An app-made worktree reads 5 warnings, because it has no `scripts/.tmp/`.
   - `pnpm db:size`: 284.8 MB on 2026-10-05.
   - The census: 28 user decks / 181 precons / 1 user (209 deck rows).

## What Y4b is NOT (scope fence)

- NOT the share page's line, "At the table", Copy for the table, OG or tile chips (Y5). NOT goals in Suggestions, Autofill or the Radar, the saved budget's controls, or impact flags (Y6a / Y6b).
- NOT a change to the engine's rules or the ruleset. The engine already takes `targetLevel` and `answers` (Y3b). A bug found in the engine gets a red pin first and is disclosed; anything wider goes to LATER.
- NOT a new route, and NOT a change to the facts route.
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-05 against `aa2a29f`; re-grep lines and trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **The engine already reads goals.** `assess({deck, cards, combos, freshness, targetLevel?, answers?})` (`src/lib/games/mtg/brackets.ts`):
  - `answers` is `{rulesetVersion, play?, calls?}`, the type `BracketAnswers` in `src/lib/games/types.ts`. `play` is keyed by `mtgBrackets.questions` (`theme`, `quality`, `fast`, `cedh`). `calls` is keyed by the read's question ids: `land-denial:<oracle id>`, `extra-turns:<oracle ids joined by +>` and `combo:<variant id>`.
  - **Answers only raise `suggested`.** cEDH → 5; fast → 4; quality → 3; not theme first → 2; theme first → 1. Each call's yes goes to its `raisesTo` and its no settles it.
  - **The target never changes the read.** `read.conflicts` lists the ids of the findings above `targetLevel`.
  - `read.answersStale` is true when `answers.rulesetVersion !== BRACKET_RULESET.version` (1).
- **The line** is `mtgBrackets.line(read, ctx)` (`src/lib/games/mtg/bracket-line.ts`). It already says "Bracket 4 (Optimized) — from the cards and your answers" when `suggested` is set and no call is open; that was pinned on a fixture in Y4a, and nothing renders it yet. A `review` read with answers computes its outcomes from `suggested ?? minimum`. **The target row isn't written.**
- **D5's target row reads "Your target 2 · the cards say 3+ · Why?".** "3+" is notation, which D0 forbids ("never '3+ (est.)'"). Decide the words — for example "Your target 2 · the cards say at least 3" — disclose them, and pin them.
- **Core's pieces.**
  - `BracketLine` (`src/components/deck/bracket-line.tsx`) takes `read`, `ctx`, `facts`, `onRetry` and `onWhy`. `bracketLineView` (`src/lib/brackets/line-view.ts`) orders the lines blocked → failed → draft → checking → read.
  - `BracketSheet` (`src/components/deck/bracket-sheet.tsx`) shows the read's `review` as "Your call" with no controls, under the intro "The list can't answer these — you and your table can." The assumptions block already shows "Wizards' Commander Brackets, as of {ruleset.asOf} ↗" and the Spellbook credit.
  - Core's words live in `BRACKET_COPY` (`src/lib/brackets/copy.ts`). `copy.test.ts` enumerates its builders, so a new builder must join `BUILDERS`.
- **The editor** (`src/components/editor/deck-editor.tsx`):
  - The read is computed beside `validate` (`bracketIds` / `bracketRead` / `bracketCtx`, ≈1460–1490) from `useBracketFacts`. The sheet is `EditorDialog` `"bracket"`, opened from the line, with focus going back to "Why?".
  - **Saving.** `save()` (≈430–457) PUTs the cards when `toSavePayload` changed, then PATCHes `metaPatchBody(metaRef.current)` (name / description / notes) when it differs from `lastSavedRef.current.meta`. **Goals need a third baseline** there, or their own path. `hydrate` (≈467–527) sets the refs and baselines from the deck GET, so goals load there too.
  - **`isBlankDraft()` (≈422) compares only the cards and meta baselines.** A draft whose only change is a target or an answer must NOT read as blank: D5 says setting one "is a real edit and creates the deck". Pin it.
  - **`ensureDeck`'s create body** (≈366–385) is `{game, format, name?, website: ""}`. "Seeded drafts carry goals in the POST create, as a seeded name does" (D5).
- **The routes.**
  - **PATCH** `/api/decks/[id]` (`src/app/api/decks/[id]/route.ts` ≈75–137): `PATCH_BODY` takes `name`, `description`, `notes`, `visibility` and `folderId`, all partial. The update is `.set({ ...parsed.data, updatedAt: new Date() })`, which **always bumps `updated_at`**; a goals-only body must not. Its rate limit is `deckMetaWrite`, 60/min per deck plus 180/min per IP.
  - **POST** `/api/decks` (`src/app/api/decks/route.ts`): `BODY` is `{game, format, name?, description?, visibility, website?}`, and the insert sets explicit columns.
  - Zod must take the target's range from the adapter's `brackets.levels`. One Piece declares no `brackets`, so a target there answers 400.
- **The serializer.** `deckMetaJson(deck, {isOwner})` (`src/lib/decks/serialize.ts`) is the deck wire for every deck route. `folderId` is already owner-only, which is the precedent for the budget.
  - D5: "`deckMetaJson` exposes `targetLevel`, `exceptions` and the answers that changed the read." But "the answers that changed the read" needs the read (cards plus combos), which `deckMetaJson` doesn't have. Decide: expose every answer to visitors, or leave the filtering to Y5's share page, which computes the read. Disclose the choice; the sheet says "Shown on your share page".
- **Migrate before push.**
  - `requireReadableDeck` / `requireOwnedDeck` (`src/lib/decks/route-helpers.ts` ≈30) run `db.select().from(schema.decks)`, so code ahead of its column breaks every deck route. So does `forks.ts` ≈114.
  - `forks.ts` ≈84 inserts explicit columns, so goals aren't copied on fork (D5) by construction. Pin it.
  - `DeckRow` fixtures carry every column: `src/lib/decks/serialize.test.ts` ≈5–26 (the pin matrix's row), and the deck fixtures in `deck-share-view.test.tsx`, `deck-tile.test.tsx`, `tiles.test.ts`, `browser-decks.test.tsx` and `precons-index-view.test.tsx` (`grep -rln "likesCount: 0" src`).
- **Smoke**: `smoke:decks` (`scripts/deck-api-smoke.ts`) does CRUD, ownership 403s and claim-token checks on a live server, and cleans up after itself. It creates decks, so read the deck-create counters first (`scripts/.tmp/census-y4a.ts` reads them, IPs masked).
- **The Y4a numbers to compare against**: the facts route costs 4 statements per MISS on dev, and the precons read as follows:
  - Witherbloom Pestilence "Bracket 1–2, 3 or 4 — four combos are your call";
  - Creative Energy "Bracket 3 or 4 — two combos are your call";
  - Mirror Mastery "At least Bracket 4 (Optimized)";
  - Political Puppets blocked;
  - Peace Offering "Bracket 1–2 · nothing here goes past Core".

  These state-only precon drafts are the zero-write QA decks, until an answer, which mints the row.

## Verify-first list (never from memory)

1. **The migration**: `pnpm db:generate` → `drizzle/0017_*.sql` is exactly `ALTER TABLE "decks" ADD COLUMN "goals" jsonb;`. Then the owner's yes, then `pnpm db:migrate`, then confirm the column (`information_schema.columns`) before the dev pass, the push and any dispatch.
2. **A goals PATCH leaves `updated_at` alone, and the deck's place in home's rail and `/account`'s order with it.** Read the row before and after on dev, and pin it in a route test.
3. **A target set in a draft creates exactly one deck, carrying the goals in its create**: no extra PATCH, or say why there is one. Pin it beside the create-count tests.
4. **A visitor's deck GET carries the target, the exceptions and the answers you chose to expose, never the budget.** The owner's GET carries everything.
5. **"Rules changed since you answered"**: an answer recorded under `rulesetVersion: 0` reads stale (`read.answersStale`) and still applies.
6. **Answers survive a reload** for an account deck (the owner's signed-in click) and a guest deck (the dev pass, with its token).

## Design decisions to make explicitly (disclose + pin each)

- **The goals shape and its zod**: D5's `{v: 1, targetLevel?, budget?: {perCardUsd?, totalUsd?}, answers?: {…, rulesetVersion}, exceptions?: string ≤ 200}`. Does `budget` get accepted now, with its UI in Y6a, or wait for Y6a? `null` clears; the PATCH body is `{goals}`, with the same per-deck bucket as the meta PATCH.
- **The target row's words** (D5's "3+" against D0's no-notation rule), and the line when the target is at or above the minimum.
- **How it plays** placement: optional and collapsed (D5). Each question is a `Segmented` Yes / No / Not sure. Answers are never re-asked after ordinary edits.
- **Answering "Your call" questions** inside the sheet: the same Yes / No / Not sure, keyed by question id in `answers.calls`. A question that goes away (its card is removed) keeps its stored answer, and it can come back.
- **The conflict callout**: when `targetLevel` is below `minimum`, list the findings in `read.conflicts`, each with its sentence and its change. Y7b adds "Swap…".
- **Where the goals save**: inside `save()` with a third baseline (one debounced burst), or a separate immediate PATCH. Either way a draft mints its row first, and a goals change never refetches the facts.
- **What visitors see** (the "changed the read" question above) and the sheet's "Shown on your share page" note.
- **The copy guard** for the new strings: `BRACKET_COPY` builders, plus any adapter words.

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`). Migration `0017` was applied before the push with the owner's yes, and the route table is unchanged.
- The target and the answers survive a reload. A goals save leaves the home rail and `/account`'s order alone. A target set in a draft creates exactly one deck. A visitor's deck GET never carries the budget. One Piece answers 400 to a target.
- D5's target row and the "with answers" lines are pinned in RTL; How it plays and the calls are answerable from the keyboard; the conflict callout lists `read.conflicts`; "Rules changed since you answered" shows for stale answers.
- **The dev pass**: 390 / 768 / 1200 / 1440 in both themes. The pane is signed out, so verify through the DOM: a hidden pane stalls Base UI transitions, doesn't hydrate until painted, and may screenshot a stale frame. `smoke:decks` green on dev.
- **The owner's clicks, signed in on prod**: set a target on one of your decks and answer one question; reload; the line and the sheet keep them, and the deck stays where it was in `/account`.

Docs in the same package:
- the `WAVE4.md` tracker ticked, with the sha and the deviations;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains "Y4b decisions";
- LATER rows;
- memory updated;
- **`Y5-session-prompt.md` written** the way this one was (the share page's line: the facts in the page's query batch, the private gate's client fetch, "At the table", Copy for the table, the owner row, OG and tile chips declared only).

State `pnpm db:size` before and after the migration. Nothing posted, and nothing seeded on prod.

## Session notes (environment)

- **The shell**: set PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. In zsh, a bare word starting with `=` aborts the line, and an unquoted `?` globs. Foreground `sleep` is blocked: poll in a background command.
- **Database reads**: ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/`, inside one read-only transaction that asserts `current_setting('transaction_read_only') = 'on'`. To run the real loaders read-only, use `drizzle(sql, {schema}).transaction(fn, {accessMode: "read only"})`; its raw handle is `tx.session.client` (`scripts/.tmp/y4a-measure.ts`). DB-connected scripts need `DATABASE_URL` pulled from `.env.local` with `grep`, never `source`. Mask IPs. In postgres.js, `IN ${sql(array)}` breaks in SELECT positions: write `= ANY(${array})`.
- **The dev server**: `preview_start {name: "dev-log"}`, which logs statements; stop it before `pnpm build`. Dev shares prod's Neon database: read the deck-create counters first, delete QA decks with their tokens, and re-prove the census.
- **A route handler sees a re-serialized query** (Y4a): a comma reaches `request.nextUrl.search` as `%2C`. Read the parsed parameters, never the raw string, and test the encoded form.
- **The pane**: precon drafts (`/decks/new?game=mtg&from=<slug>`) are state-only QA decks. Screenshot once to paint and hydrate a hidden tab, then poll `[data-slot=bracket-line]` for `data-facts="ready"`. Filter elements with `!el.closest('[hidden]')`. Dev shows a second, aborted twin of each effect fetch (React's development double effect); prod makes one.
- **Lint and format**: `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors. Run `pnpm exec prettier --write` on every touched file before `pnpm check`; `*.md` is prettier-ignored. After `pnpm format`, scripted exact-string edits can silently miss, so assert their anchors.
- **Scratch files** in `scripts/.tmp/` are linted but not typechecked: delete what you add, or keep it warning-free.
- **Mutation checks**: break the guarded line from a scratchpad backup (never `git checkout` a dirty file), run the one test file, and restore. A guard no test catches gets a test.
