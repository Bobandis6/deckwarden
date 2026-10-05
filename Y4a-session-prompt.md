# Y4a session prompt — Bracket line + Why sheet (`GET /api/combos/complete`, `BracketLine`, what the cards show, what the read assumes)

## Ship note — 2026-10-05, feat `aa2a29f`, deployed (Vercel status success on the full sha, 07:58 Z; CI green)

**Shipped. The prompt below is history. Next is `Y4b-session-prompt.md` (your target: migration `0017` `decks.goals`, How it plays, the conflict callout).**

**Pre-flight**:
- Y3b had shipped (`3320ad6`; `_journal.json` still at idx 16).
- **Nightlies green**: the first scheduled run after `3320ad6` (37131226473, 2026-10-03 14:52 Z) applied the extra-turn edit, with `extra_turn` at tagged 64, flagged 61, removed 3, added 0, and `mld` unreviewed 0. The ruleset watch was green, and both stayed green on 2026-10-04 (37213178954; database gauge 284.9 MB). Rows 168 and 170 didn't fire.
- **The owner's answers**: nothing new posted or arrived, and read-only database access plus dev writes were approved.
- **Baseline on `d839272`**: 1,442 tests / 159 files / 6 warnings / 0 errors. Census: 209 deck rows = 28 user decks (16 account + 12 guest) + 181 precons, 1 user. `pnpm db:size` 284.8 MB. The route table was saved.

**What shipped** (decisions in WAVE4's tracker and REDESIGN.md "Y4a decisions"):
- **`GET /api/combos/complete?game=mtg&ids=<sorted, comma-joined>`** answers `{combos, freshness}`: `loadCompleteCombos` plus `loadBracketFreshness`, nothing more.
  - One spelling per set: `game` then `ids`, at most 200 lowercase uuids, sorted and unique. Anything else answers 400, and so does One Piece.
  - Edge-cached like X3's route. Its own bucket, `comboFacts`: 60/min plus 600/hour per IP.
- **The adapter's `brackets` gains `line(read, ctx)` and `links`.** Magic's words are in `src/lib/games/mtg/bracket-line.ts`. Core holds `src/lib/brackets/{facts,copy,line-view}.ts`, `src/components/deck/{use-bracket-facts.ts,bracket-line.tsx,bracket-sheet.tsx}`, and `addMorePhrase` in `progress.ts`.
- **The editor**: the read is computed beside `validate`. The line renders directly after `ValidationPanel` through the deck pane's new `bracket` slot, and the sheet is `EditorDialog` `"bracket"`.

**Found on the way**:
- **Next re-serializes the query before a route handler runs**, so a comma arrives as `%2C`. The first build compared the raw query to the canonical string, passed its unit test (a `NextRequest` built by hand keeps the literal comma), and refused every multi-card request on dev. The check now reads the parsed parameters (exactly `game` then `ids`), and the route test pins the server's encoded form.
- **On touch, the 44 px "Why?" made the line box tall** and the glyph floated above the text (the 375 px pass). The glyph now sits on the first line's baseline at the shield's size.
- **The first mutation round missed five guards**, so five tests were added:
  - a debounced request's abort;
  - combos after a set that failed;
  - an answer whose body lands after its set moved on;
  - an aborted request marking a set failed;
  - no facts without a commander.

  All 38 checks on the shipped code then failed as they should.

**Measured** (`scripts/.tmp/y4a-measure.ts`, one read-only transaction, the real loaders; then dev with `DB_LOG`, then prod):

| Set | Ids → combos | Statement time (server) | Dev, warm | Prod MISS → HIT |
|---|---|---|---|---|
| Kiki-Jiki + Zealous Conscripts (a combo-seeded draft) | 2 → 1 | 1.9 ms | ~1.1 s | 1.20 s → 0.47 s, 0.38 s |
| Witherbloom Pestilence (heaviest precon) | 86 → 4 | 23.8 ms | ~1.1 s | 0.68 s → 0.40 s |
| The 100 most combo-dense ids (stress) | 100 → 445 | 101.5 ms (2.4 MB sort spill) | 1.1–1.6 s (185 KB) | — |

On dev, `DB_LOG` shows 4 statements per MISS: the bucket's two upserts, then the combos and the freshness read (0.2 ms). The plans are Y3b's: a bitmap scan on `combo_pieces_by_card`, grouped, then hash-joined to `combos`.

**Dev and prod** (signed out, state-only drafts, zero creates):
- **A combo-seeded draft** shows "Bracket: add 98 more cards · 1 combo so far · Why?" before any save, after one facts GET and no POST, with the slot still "Draft". Its sheet shows the combo (Commander Spellbook rates the live row R), with its results, "2 cards" and How it works ↗.
- **The QA precons** read as Y3b measured:
  - Witherbloom Pestilence: "Bracket 1–2, 3 or 4 — four combos are your call" (four template questions);
  - Creative Energy: "Bracket 3 or 4 — two combos are your call";
  - Mirror Mastery: "At least Bracket 4 (Optimized)";
  - Political Puppets: "Bracket read needs a legal list · 1 banned card", with no button;
  - Peace Offering: "Bracket 1–2 · nothing here goes past Core".
- **One Piece** shows no line, no "bracket" anywhere, and no facts GET.
- **Focus**: Escape returns focus to "Why?" (dev; RTL pins it too).
- **One GET per set.** Prod made exactly one facts GET per page. Dev shows a second, aborted twin: React's development double effect.
- **The viewport pass**: 375/390, 768, 1200 and 1440 in both themes, with no overflow: a Drawer below md, a Modal from md, and "Why?" 44×44 on touch.
- **Smoke and sweep**: `smoke:combos` is green on dev with nine new facts-route checks. The prod sweep returned 200 for `/`, `/commanders`, `/precons`, `/sets`, `/cards`, `/decks/new?game=mtg`, `/leaders`, a hub and `/tournaments`.
- **Census unchanged**: 209 deck rows, 1 user; 284.8 MB.

**LATER**: new rows 171 (the "Checking combos…" swap), 172 (lists over 200 distinct cards) and 173 (Retry and `Retry-After`).

---

Pull latest, then run Y4a — the sixth Wave-4 package and the first a player sees. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s decisions table: the bracket lives **on the legality line** with one sheet (a Drawer on phones, a Modal from md), no new tab; combo facts come from **one GET keyed by the sorted card ids**, fetched once per settled snapshot whenever a commander is present, drafts included; plain words, never notation; "approves" stays legality-only.
2. **D0**: copy rules (bracket numbers lead; "Your call" vs "Couldn't check"; Spellbook's tag names only in its credit link), attribution (Game Changers: "Wizards' Game Changers list (via Scryfall)"; land denial and extra turns: "community-tagged on Scryfall Tagger", linked to the tag; combos: the existing Commander Spellbook credit), adapter gating (One Piece shows nothing and no apology copy).
3. **D4**'s out shape, then REDESIGN.md's **"Y3b decisions"** — they define what you render (statuses and their precedence, "Couldn't check", per-question answers, the sentences as adapter data).
4. **D5**: the facts route, the `BracketLine` table, the Why sheet's first two blocks (Y4a's half — "How it plays", "Your target" and the conflict callout are Y4b's).
5. **D11**: the criteria Y4a proves (every finding names its cards and reason; a read that may be out of date says so).
6. The **Y4a** block in section E, its pin-matrix row, and the route-table row (`+ ƒ /api/combos/complete`).
7. The **Verification (whole wave)** "Query packages" and browser-pane bullets.
8. Y3b's ship note at the top of `Y3b-session-prompt.md`.

Y4a renders the read Y3b built:
- `GET /api/combos/complete` answers `{combos, freshness}` for an id set — the core loaders, nothing more;
- `BracketLine` (adapter-gated, directly after `ValidationPanel`) computes `assess` client-side from the wires and the facts;
- "Why?" opens an `EditorDialog` `"bracket"` with **What the cards show** and **What this read assumes**; "your call" items show as open questions (no answer controls — answers are stored from Y4b);
- D0's copy guard extends to every new string.

**No migration. One new route.** Every other surface must answer exactly as before.

Pre-flight, in order.
1. **Y3b has shipped.** `WAVE4.md`'s tracker ticks Y3b (feat `3320ad6`); `_journal.json`'s last entry is still idx 16.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`), and the first scheduled run after `3320ad6` (2026-10-03, ~16:30 Z or later) applied the extra-turn edit: its Scryfall run's `stats.tagger.counts.extra_turn` reads `flagged: 61`, `removed: 3`, and the ruleset watch is green.
   - A red ingest is P4.7 branch F and preempts everything; a red watch means the Game Changers changed — move the pin first (see `bracket-ruleset.ts`).
   - `counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168. A one-line review each, before the package.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived.
4. **Ask the owner, once, at the start, in plain words** for read-only database access (the census, `pnpm db:size`, the route's plan and timings) — and say up front that the dev pass and any smoke that seeds a deck write through the dev server (dev shares prod's database), deleted after, census re-proved.
5. **Working tree clean** at or after Y3b's docs commit. Another session may share this working copy: stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table; the diff at the end must be **exactly** `+ ƒ /api/combos/complete`.
   - `pnpm check`: 1,442 tests / 159 files / 6 warnings / 0 errors on `3320ad6` (an app-made worktree reads 5 warnings — no `scripts/.tmp/`).
   - `pnpm db:size`: 284.3 MB (after the 2026-10-02 scheduled nightly).
   - The census: 28 user decks / 181 precons / 1 user (209 deck rows).

## What Y4a is NOT (scope fence)

- NOT targets, answer storage, `decks.goals`, "How it plays", "Your target", the conflict callout or "Rules changed since you answered" (Y4b). NOT the share page, "At the table", OG or tile chips (Y5). NOT goals in recommendations (Y6a).
- NOT a change to the engine's rules or the ruleset (Y3b's). A bug found in the engine gets a red pin first and is disclosed; anything wider goes to LATER.
- NOT a runtime call to Spellbook's `/estimate-bracket` or to Tagger. NOT a migration.
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-03 against `3320ad6` — re-grep lines, trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **The read** (`src/lib/games/mtg/brackets.ts`, reached as `adapter.brackets.assess`): `assess({deck, cards, combos, freshness, targetLevel?, answers?})` → `BracketRead`:
  - `status`: `blocked` → `draft` → `unavailable` → `review` → `read` (that precedence).
  - `minimum` (1 when nothing is flagged), `suggested` (null until something is answered — always null in Y4a).
  - `factors[{id, sentence, cards, source, atLeast, change, combo?}]` — `atLeast: null` marks a "Couldn't check" line (ids `unchecked:<feed>`, `unchecked:combo:<key>`, `unchecked:cards`). Sentences already name their cards and reason.
  - `assumptions[]` — D5's seven fixed lines, the Game Changers date from ingest.
  - `review[{id, question, because, cards, source, raisesTo, answer, combo?}]` — only questions whose yes would raise the read; `raisesTo` is the level a yes means.
  - `blockedBy` (card ids), `conflicts` (empty without a target), `ruleset {version: 1, asOf: "2026-02-09"}`, `answersStale`.
  - `combos: null` = facts not loaded → a "Couldn't check combos." line and `unavailable` (but `draft` and `blocked` outrank it).
- **The declaration** (`mtgAdapter.brackets`, `src/lib/games/types.ts` `BracketsMeta`): `noun` "bracket", `levels` 1–5 with Wizards' names (Exhibition, Core, Upgraded, Optimized, cEDH), `ruleset`, `questions` (How it plays — Y4b's), `freshnessSources` `["scryfall", "spellbook"]`, `freshness(runs, readAt)`, `assess`. `optcgAdapter.brackets` is undefined.
- **The loaders** (core): `loadCompleteCombos(cardIds, db?)` (`src/lib/combos/queries.ts`) — one statement, 25 ms server on the heaviest precon, 101 ms for the 100 most combo-dense identities; `loadBracketFreshness(adapter, db?, now?)` (`src/lib/brackets/freshness.ts`) — one statement, 0.2 ms; both take a `DbExecutor`. The answer depends on the id set alone (no identity filter; complete combos fit by construction). The engine re-checks every combo against the snapshot, so facts fetched for an older snapshot can't count a combo that's gone.
- **Freshness** is `{readAt, feeds: {gameChangers, landDenial, extraTurns, combos}}`, each `{state: ok | stale | missing | off, asOf, detail?}`; stale = not refreshed for more than 7 days at `readAt`.
- **The line table** (D5) covers nothing flagged, a minimum of 3, a minimum of 4, your call pending, with answers, the target (Y4b), draft, banned, loading and failure. **Not in it**: a minimum of 2 (one extra-turn card, a C-tagged combo — 6 precons read 2) and `unavailable` other than the combos fetch failing (a stale or switched-off feed, an unknown tag, a card whose data didn't load).
- **The draft line** ("Bracket: add 34 more cards · 1 Game Changer so far") reuses `deckProgress` / `toGoPhrase` (`src/lib/decks/progress.ts` ≈27–45 — "one helper owns the phrase").
- **The client already holds the flags**: `attrs` rides whole on the deck wire (`src/lib/decks/deck-cards-wire.ts`) and the search / resolve wire (`src/lib/cards/wire.ts` `toWire`), legality included, so `cards` in the editor is exactly `assess`'s input. The editor runs `load.adapter.validate(snapshot, cards)` over one memoized `snapshot` (`src/components/editor/deck-editor.tsx` ≈1422–1430); `assess` belongs beside it.
- **Where it renders**: `ValidationPanel` at `src/components/editor/deck-list-pane.tsx` ≈246 (with `progress` and `approvalAction`); `BracketLine` (new, `src/components/deck/bracket-line.tsx`) goes directly after it. `EditorDialog` (`src/components/editor/editor-header.tsx` ≈55–56) is `"details" | "import" | "autofill" | "export" | "buy" | "share" | "history" | "shortcuts"`; the sheet joins it as `"bracket"`. `AutofillSheet` is the Drawer-on-phones / Modal-from-md precedent (`useTier`, `src/components/editor/use-tier.ts`; `ModalFinalFocus` for focus return).
- **Refetch policy**: `deckStateKey` (`src/lib/decks/panel-view.ts` ≈28) keys the panels on `(cardId, zone, qty)` so tag and printing edits never refetch, and `hasLeader` gates on a leader-zone card. The facts route needs only the id **set** (zones and copies don't change complete combos).
- **The route precedent**: `src/app/api/combos/[key]/route.ts` (X3) — `force-dynamic`, `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`, zod params, **no rate limit** ("a GET bounded by real keys and edge-cached"), an unknown key's 404 cached too. D5 asks for "its own per-IP bucket, sized for one call per settled edit"; buckets live in `RATE_LIMITS` (`src/lib/rate-limit.ts`, e.g. `deckCombos` 30/min, `recommendSnapshot` 30/min + 200/hour) and each counted call upserts counter rows.
- **The zero-POST pins**: the seeded-draft tests in `deck-editor.test.tsx` (≈1008 "no POST at all", ≈1318 "literally zero POSTs", ≈926, ≈1045, ≈1363) filter on `method === "POST"`: a GET keeps them green, a POST breaks them.
- **Attribution links**: the ruleset's `sources` (`bracket-ruleset.ts`: Wizards' `#brackets` and `#gamechangers` anchors); Scryfall Tagger's tag pages `https://tagger.scryfall.com/tags/card/mass-land-denial` and `…/extra-turn` (both 200 on 2026-10-03); a combo's walkthrough is `adapter.capabilities.combos.externalUrl(key)`.
- **The copy guard** lives in `src/lib/games/mtg/brackets.test.ts` (every string the engine can produce; `/approv/i` and Spellbook's tag names). Y4a's own strings need the same guard.
- **The precon spread** (Y3b): minimum 1 → 146 · 2 → 6 · 3 → 28 · 4 → 1; review 17; blocked 2 (Dockside Extortionist, Trade Secrets). Good QA decks: Witherbloom Pestilence (four template questions), Creative Energy (two-card combos with and without the commander), Mirror Mastery (land denial), Political Puppets (blocked), Peace Offering (Perch Protection: reads 1 once the edit applies).

## Verify-first list (never from memory)

1. The nightly after `3320ad6` applied the extra-turn edit (`flagged 61, removed 3`); `scripts/.tmp/y3b-calibrate.ts` re-reads the spread if you want it post-edit (Peace Offering 2 → 1).
2. The route's plan, warm time and `DB_LOG` statement count on dev (expected: the two loaders' statements, plus the bucket's upserts if you add one), and on prod a MISS then a HIT for the same id set.
3. The facts route's answer for a combo-seeded draft (the hub door's `?leader=&combo=`) — it shows its combo before any save.
4. The line table's strings against D5, character for character, and the two lines you add.
5. How `useTier` and `ModalFinalFocus` hand focus back for a dialog opened from the deck pane (not the More menu).

## Design decisions to make explicitly (disclose + pin each)

- **The route**: `GET /api/combos/complete?game=mtg&ids=<sorted, comma-joined>` — at most 200 ids, uuid shape; unsorted or duplicated ids answer 400 (one URL per set keeps the CDN honest) or are canonicalized; a game without `brackets` answers 400; the response `{combos, freshness}`; caching intent stated (dynamic, edge-cached like X3's route). **A bucket or not**: D5 says a bucket; X3's stance says an edge-cached GET bounded by real ids needs none, and every counted call writes counter rows. Decide, and say why.
- **When the editor asks**: once per settled snapshot (which settle — the autosave burst, or its own debounce?), keyed by the sorted id set, gated on a leader-zone card, drafts included, never a POST; an in-flight request for an older set is dropped.
- **The lines D5 doesn't cover**: a minimum of 2, and `unavailable` beyond the combos fetch failing (what it says, whether it offers Retry). "Checking combos…" while the facts load — text, no spinner.
- **The sheet**: the order of factors, Couldn't-check lines and open questions; how a combo row shows what it does, its piece count and "How it works ↗"; the credit lines (D0); where the ruleset's as-of date and the source links sit.
- **The copy guard** for the new strings: a table-driven RTL test, or an exported string table guarded beside the engine's.
- **One Piece**: renders nothing — no line, no dialog, no apology.

## Deployable outcome

`pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`). No migration, no dependency; the route table gains exactly `ƒ /api/combos/complete`.
- D5's line table pinned in RTL, plus the two lines you add; a combo-seeded draft shows its combo; the zero-POST pins hold.
- "Why?" opens from the keyboard and returns focus; 44 px on touch (`pointer-coarse:min-h-11`); One Piece renders nothing.
- The route: plan, warm time and `DB_LOG` count recorded; MISS then HIT on prod for the same id set.
- A dev pass at 390 / 768 / 1200 / 1440 in both themes (the pane is signed out; verify sheets through the DOM — a hidden pane stalls Base UI transitions and doesn't hydrate until painted).
- `smoke:combos` green on dev (it may gain a section for the facts route).

Docs in the same package:
- the `WAVE4.md` tracker ticked with the sha and deviations;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains the Y4a decisions;
- LATER rows;
- memory updated;
- **`Y4b-session-prompt.md` written** the way this one was (migration `0017`: migrate before push).

State `pnpm db:size`. Nothing posted or seeded on prod.

## Session notes (environment)

- **The shell**: set PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. zsh: a bare `====` (any word starting with `=`) aborts the line, and an unquoted `?` globs (`'/decks/new?game=mtg'`). Foreground `sleep` is blocked: poll in a background command.
- **Database reads**: ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/`, inside one read-only transaction that asserts `current_setting('transaction_read_only') = 'on'`. To run the real loaders read-only: `drizzle(sql, {schema}).transaction(fn, {accessMode: "read only"})`, the transaction's raw handle for EXPLAIN is `tx.session.client` (`scripts/.tmp/y3b-measure.ts`); a raw `sql.begin` transaction can't host a drizzle instance. DB-connected scripts need `DATABASE_URL` pulled from `.env.local` with `grep`, never `source`. Mask IPs in anything printed.
- **The dev server**: `preview_start {name: "dev-log"}` (it logs statements); stop it before `pnpm build`. Dev shares prod's Neon DB: read the deck-create counters first (`scripts/.tmp/counters-y2b.ts`), delete QA decks, re-prove the census.
- **Lint and format**: `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors. Run `pnpm exec prettier --write` on every touched file before `pnpm check`; `*.md` is prettier-ignored.
- **Scratch files** in `scripts/.tmp/` are linted (not typechecked): delete what you add, or keep it warning-free.
