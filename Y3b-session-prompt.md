# Y3b session prompt — Bracket engine (the ruleset, `assessBracket`, `loadCompleteCombos`, the freshness loader, D11's fixtures, the precon spread)

Pull latest, then run Y3b — the fifth Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s decisions table: the cards prove a minimum, the read's assumptions are shown, never one authoritative number; Wizards' text beats Spellbook's in both directions; "a failing source never lowers the read"; tutors never raise it; plain words.
2. Section **B**'s official-rules table and its validation corrections.
3. **D0**'s copy rules and attribution: the ported ladder's file carries Spellbook's MIT notice, and no bracket string says "approve".
4. **D4** in full: the ruleset, `assessBracket`'s in/out, the evidence table, answers, the core loaders, the calibration.
5. **D11**: the criteria and the fixtures.
6. The **Y3b** block in section E and its pin-matrix row ("new `brackets.test.ts`" / "all").
7. The **Verification (whole wave)** "Query packages" bullet.
8. Y3a's ship note at the top of `Y3a-session-prompt.md`.

Y3b builds the pure, attributed, versioned read:
- the ruleset grows from Y3a's pin into D4's data;
- `assessBracket` ports Spellbook's MIT deck ladder, adjusted to Wizards' text, as a pure MTG-adapter function;
- core gains `loadCompleteCombos` and a freshness loader;
- D4's table is proven row by row and D11's fixtures in Vitest;
- one read-only script records the spread over the 181 precons.

**No migration, no route, no UI, no dependency.** Nothing renders the read yet (Y4a does). Every existing surface must answer exactly as before.

Pre-flight, in order.
1. **Y3a has shipped.** `WAVE4.md`'s tracker ticks Y3a (feat `884c62f`), and `drizzle/meta/_journal.json`'s last entry is idx 16 (`0016_lyrical_dazzler`).
2. **Nightlies green, and the first scheduled one since Y3a read.** Run `gh run list --workflow=nightly-ingest.yml` and check two runs: the 2026-10-02 dispatch (run 36966549562, all green) and the first **scheduled** run after it, whose "Ruleset watch" step must be green.
   - A red ingest is P4.7 branch F and preempts everything.
   - A red watch means Wizards' Game Changers changed: read the announcement and move the pin in `src/lib/games/mtg/bracket-ruleset.ts` first (the watch prints Scryfall's count and md5).
   - A Tagger flag reading `kept` in `stats.tagger.status` means the read failed that night; read `stats.tagger.error` before trusting the counts.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived; a warm signal gets its own P2.9 / P4.7 round first.
4. **Ask the owner, once, at the start, in plain words** for read-only database access. Nothing is written by you. The reads:
   - the census and `pnpm db:size`; **Y3a owes the size after the first scheduled nightly**, so record it, with the combos heap and its dead tuples;
   - the latest `ingest_runs.stats`;
   - `loadCompleteCombos`' plans and timings (EXPLAIN ANALYZE of a SELECT inside a read-only transaction);
   - the calibration over the 181 precons.
5. **Working tree clean** at or after Y3a's docs commit. Another session may share this working copy: stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline** and save `pnpm build`'s route table; the diff at the end must be **empty**.
   - `pnpm check`: 1,376 tests / 158 files / 6 warnings / 0 errors on `884c62f`. The docs commit after it changed no test. An app-made worktree reads 5 warnings because it lacks the gitignored `scripts/.tmp/`.
   - `pnpm db:size`: 284.3 MB right after the dispatch.
   - The census: 28 user decks / 181 precons / 1 user.

## What Y3b is NOT (scope fence)

- NOT the bracket line, the Why sheet, `GET /api/combos/complete` or any page copy (Y4a). NOT targets, answers' storage, `decks.goals` or the conflict callout (Y4b). NOT the share page (Y5).
- NOT a change to Y3a's data path: the ingests, `data/mtg/tagger-overrides.json` (one exception: the opponent extra-turn decision below may be a data edit), the watch, the popularity floor (LATER row 48), or the Radar, Suggestions, Autofill and hub totals.
- NOT a runtime call to Spellbook's `/estimate-bracket` or to Tagger.
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-02 against `884c62f` — re-grep lines, trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **Card facts in `attrs`** (`src/lib/games/mtg/attrs.ts` ≈33–42): `game_changer?: true`, `mld?: "clear" | "edge"`, `extra_turn?: true`.
  - **Sparse**: absent means "not flagged" only when the run's stats say the source was read.
  - **After the dispatch**: 53 / 111 (42 clear, 69 edge) / 64 identities = 228, no overlaps.
  - **The banned ones**: 16 flagged land-denial / extra-turn cards are banned or not legal in Commander (a banned card already blocks the read).
  - **Already client-side**: the keys ride the card wire because `attrs` travels whole (`src/lib/cards/wire.ts`, `src/lib/decks/deck-cards-wire.ts`), so the editor already holds them.
- **Combo facts** (`src/db/schema.ts` `combos` ≈689–711):
  - `bracket_tag text` (R S P O C E; NULL = not ingested, or a letter the read doesn't know) and `relevant boolean` (any Standalone result; NULL = not ingested).
  - **After the dispatch**, all 66,881 rows carry both: C 194 · E 49,369 · O 2,161 · P 1,624 · R 4,288 · S 9,245; relevant 50,296.
  - `SPELLBOOK_BRACKET_TAGS`, `SpellbookBracketTag` and `bracketTagOf` are exported from `src/lib/games/mtg/spellbook-map.ts` ≈62–68.
  - `results` stores feature names of status S / H / C only (HU / PU dropped); `templates` stores template names; `piece_count` counts cards only.
- **Spellbook's own ladder** (MIT): `SpaceCowMedia/commander-spellbook-backend`, `backend/spellbook/models/variant.py`, `estimate_bracket` ≈539–646, read at commit `190735d9abe0` (2026-09-30).
  - **Tag → bracket**: R 4, S 3, P 3, O 2, C 2, E 1 (B = banned).
  - **Per combo it classifies**:
    - relevant (any S) and borderline_relevant (any S or C);
    - definitely / arguably two-card (commander-aware; library-zone pieces skipped; notable prerequisites and a non-borderline result add "arguable" cards);
    - speed from `mana_value_needed` (0 → 5, ≤ 4 → 4, ≤ 6 → 3, ≤ 8 → 2, else 1; +1 when the minimum isn't accurate);
    - the regex flags (`variant.py` ≈24–30): `MASS_LAND_DENIAL_PATTERN`, `EXTRA_TURN_PATTERN` minus `EXTRA_TURN_FOR_OPPONENT_PATTERN`, `SKIP_TURNS_PATTERN`, `CONTROL_ALL_OPPONENTS_PATTERN`, `CONTROL_SOME_OPPONENTS_PATTERN`, and "lock" in a feature name.
  - **The deck ladder**: B if any card is banned. R for 4+ Game Changers, 2+ extra-turn cards, any extra-turn or land-denial combo or card, control of all opponents, or a fast relevant definitely-two-card combo. Then S, P, O, C, E, in that order.
  - **What our rows don't store**: `mana_value_needed`, prerequisites and zone locations. WAVE4 chose to read Spellbook's stored tag instead of recomputing speed.
- **Measured on the 2026-10-01 bulk**: Spellbook's patterns match only features our `results` keep — 0 utility-only matches for every pattern. Combos matching each: land denial 360 · infinite turns (own) 3,166 · skip turns 11 · control of all opponents 8 · some 0 · "lock" 4,353. So the stored `results` with Spellbook's own regexes lose nothing today.
- **The ruleset** (`src/lib/games/mtg/bracket-ruleset.ts`): `BRACKET_RULESET = {version: 1, gameChangers: {asOf: "2026-02-09", count: 53, md5}}`, data only. The watch (`src/lib/games/mtg/ruleset-watch.ts`, `scripts/ruleset-watch.ts`, the nightly's last step before the keepalive) reads `gameChangers` only — keep that path and shape.
- **Freshness in `ingest_runs.stats`**: read the latest **succeeded** run per source; the `ingest_runs_source_started` index serves it.
  - **Scryfall runs** carry `game_changers {count, md5}` and `tagger` (`TaggerStats`, exported from `src/lib/games/mtg/tagger.ts` ≈272): `bulk_updated_at`, `tag_ids`, `status {mld, extra_turn}` (each `fresh` | `kept` | `disabled`), `stale_since {…}` (null when fresh or disabled), `counts`, `error`.
  - **Spellbook runs** carry `source_version` ("7.1.3"), `source_timestamp`, `source_last_modified`, `bracket_tags`, `bracket_tags_unknown` and `relevant`.
- **Opponents' extra turns**: three of the 64 `extra-turn` cards give the turn to an opponent — Eon Frolicker, Perch Protection (its gift), Emrakul, the Promised End. Spellbook's own combo flag excludes "… for … opponent" turns. D4 reads one extra-turn card as "at least 2". `extra_turn.disabledCards` in the overrides file drops a card with one data edit, and the next nightly removes its key through the tuple compare.
- **Core combo queries** (`src/lib/combos/queries.ts`):
  - `loadCombosNearDeck` (≈192–273) enters through `combo_pieces_by_card`, aggregates `count(*) >= piece_count - 1` (Radar) or `= piece_count - 1` (Suggestions), color-fits with `(ci_mask & ~deckCi::int) = 0`, caps at `COMBO_SCAN_LIMIT` (200) by popularity, then fetches the pieces in a second statement.
  - No complete-only, uncapped query exists: `loadCompleteCombos` is new, and D4 wants it as **one statement**.
  - `src/lib/combos/view.ts` `deckComboStatus` (≈26): a template combo is never "complete".
- **The adapter** (`src/lib/games/types.ts`, `GameAdapter` ≈487): optional declarations sit beside `hub?` (≈598) and `recommend?` (≈608). One Piece's adapter declares neither, and `brackets` follows that pattern (One Piece declares nothing).
- **Precons**: `precon_products.deck_id` → the precon's deck row (181 rows, `user_id` NULL).
- **Migrations**: the last is `0016_lyrical_dazzler.sql`; Y3b adds none.

## Verify-first list (never from memory)

1. Spellbook's `estimate_bracket` at its current commit. If it changed since `190735d9abe0`, port the current one and say so. Copy the repository's LICENSE notice verbatim to the top of `src/lib/games/mtg/brackets.ts`.
2. The live `results` names each pattern matches (one read-only query): the fixtures quote real feature names, not invented ones.
3. Wizards' bracket page and Game Changers list: the ruleset's `asOf` dates (bracket text 2025-11-05, Game Changers 2026-02-09) and the allowances in WAVE4 B's table. Read the pages; don't trust the dates.
4. `loadCompleteCombos`: plan, warm time and `DB_LOG` statement count on the largest precon and on a 100-card list holding Thassa's Oracle + Demonic Consultation and a template combo.
5. After the calibration: the spread of minimums and "your call" counts over the 181 precons, which decides whether a `/precons` filter ever earns a package (LATER row 151).

## Design decisions to make explicitly (disclose + pin each)

- **The adapter's `brackets` declaration**: its shape (the ruleset plus the pure assess function?) and the game-agnostic core names (`targetLevel`, the level range from the adapter).
- **Staleness → "Couldn't check"**: what makes a factor read "Couldn't check". Is it any `kept` flag, or a `stale_since` older than N days? A `disabled` flag, a NULL `bracket_tag` / `relevant`, no successful run? Pin each.
- **The two-card rule**: the read's "relevant two-card combo" counts at most two cards besides your commander and no template. Our rows don't store zone locations or "must be commander", so `usesCommander` = the deck's commander is a piece, and that is also "your call" per D4.
- **The results rules** (land-denial combo, infinite turns, control of every opponent): match with Spellbook's regexes ported verbatim (under the notice).
- **Opponents' extra turns**: keep Tagger's tag as is, disable the three cards in the overrides file (a reviewed data edit with its reason), or a rule in the engine.
- **Where the factor sentences live** (engine data vs Y4a's copy), and whether D0's "approve" guard (`src/lib/brackets/copy.test.ts` or beside the strings) lands now.
- **The ruleset `version`**: stay at 1 or bump to 2 when the allowances land. Y4b compares answers against it.
- **`loadCompleteCombos`**: uncapped per D4. Measure the worst case and say what bounds it.

## Deployable outcome

`pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`). No migration, no dependency, and the route table byte-identical.
- D4's table row by row in Vitest, plus D11's fixtures.
- One Piece declares nothing.
- `loadCompleteCombos` is one statement, with its plan, warm time and `DB_LOG` count recorded.
- The calibration's spread recorded in the ship note: a read-only script in `scripts/.tmp/`, one transaction, after the owner's OK.
- `smoke:combos` and `smoke:recommend` green on dev if anything in `src/lib/combos/` changed.

Docs in the same package:
- the `WAVE4.md` tracker ticked with the sha and deviations;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains the Y3b decisions;
- LATER rows;
- memory updated;
- **`Y4a-session-prompt.md` written** the way this one was.

State `pnpm db:size`. Nothing posted, seeded or simulated.

## Session notes (environment)

- **The shell**: set PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. The shell is zsh, where a bare `====` (or any word starting with `=`) aborts the whole command line, and foreground `sleep` is blocked: wait with a background command.
- **Database reads**: ad-hoc SQL goes through `pnpm exec tsx` on a file in `scripts/.tmp/`, inside one `sql.begin("read only", …)` that asserts `current_setting('transaction_read_only') = 'on'`. `scripts/.tmp/census-y3a.ts` is the census plus the Y3a counts. Mask IPs in anything printed. DB-connected scripts need `DATABASE_URL` pulled from `.env.local` with `grep`, never `source` (an unquoted `&` breaks zsh).
- **The dev server**: `preview_start {name: "dev-log"}` (it logs statements); stop it before `pnpm build`. Dev shares prod's Neon DB.
- **Lint and format**: `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors. Run `pnpm exec prettier --write` on every touched file before `pnpm check`; `*.md` is prettier-ignored.
- **Scratch files** in `scripts/.tmp/` are linted: delete what you add, or keep it warning-free.
