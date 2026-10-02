# Y3a session prompt — Bracket data (Game Changers, Tagger land-denial and extra-turn flags with overrides and a fallback, combo tags + relevant, the ruleset watch; migration `0016`)

## Ship note — 2026-10-02, feat `884c62f`, deployed (Vercel status success on the full sha, 04:53 Z; CI green)

**Shipped. The prompt below is history. Next is `Y3b-session-prompt.md` (the bracket engine; no migration).**

**Pre-flight**:
- Y2b and row 164 had shipped, and `_journal.json` ended at idx 15. This working copy was two commits behind origin and was fast-forwarded to `9eb689d`.
- Nightlies were green: the 2026-10-01 scheduled run at 17:07 Z.
- The owner's answers at the start: **nothing new posted, no feedback**, and **read-only database access granted**. I said up front that the migration SQL would come back for a yes and that the package ends with one dispatch.
- Baseline on `9eb689d`: 1,342 tests / 156 files / 6 warnings / 0 errors; `pnpm db:size` 271.2 MB; census 209 deck rows = 28 user decks (16 account + 12 guest) + 181 precons, 1 user.
- Measured before any change: 66,592 combos (heap 22.3 MB, total 29.1 MB), and no identity carrying any of the three new keys. The route table was saved.

**Step 0 (one read of each bulk, 2026-10-01)**:
- **oracle_tags**: 4,559 tags, 234,991 taggings, weights `median` / `strong` / `very_strong`, some taggings with an `annotation`.
  - `mass-land-denial` = `cd12a44c-1aee-4ece-b8ea-3eb118ef0230`: 113 taggings (Armageddon the only `very_strong`). 111 are our cards; the other two are Dovin Baan's emblem and a Japanese-only card, both skipped by the ingest.
  - `extra-turn` = `03b17ebf-f5d3-4063-bfd4-1ae156a16a8f`: 64 taggings (Time Walk the only `very_strong`).
  - Neither tag has descendants. WAVE4's 58 extra-turn cards were Scryfall search's count, which leaves out schemes, planes and vanguards; Commander-legal, both lists match WAVE4 (106 and 53).
- **default_cards**: `game_changer` is a boolean on all 118,467 objects (508 printings true, no card inconsistent across printings). 53 Game Changers after the ingest's first-printing rule, md5 `38ff92800a67529ee6b9fa81f4203033`.
- **Spellbook's bulk**:
  - **The URL**: the documented `json.commanderspellbook.com` URL answers the real User-Agent with the same S3 object as the old bucket URL (identical ETag, Last-Modified and version id).
  - **The root**: reads `timestamp`, `version`, `variants`, then a trailing array.
  - **The letters**: E S R O P C, plus B on exactly the 1,527 Commander-banned variants. Spellbook's own source (`SpaceCowMedia/commander-spellbook-backend`, `backend/spellbook/models/variant.py`, commit `190735d9abe0`) names them Ruthless, Spicy, Powerful, Oddball, Core, Exhibition, Banned, and its "relevant" is exactly "any Standalone feature".

**The split** (`data/mtg/tagger-overrides.json`, rule in its `$comment`): **42 clear / 69 edge**, all 111 listed (39 / 67 Commander-legal).
- **Clear**: Wizards' five examples, the same-effect cards (Magus of the Moon, Harbinger of the Seas, Back to Basics, Winter Moon, Static Orb, Stasis, Hokori, Rising Waters, Contamination, Infernal Darkness, Ritual of Subdual, Storm Cauldron), and every destroy / exile / bounce-all-lands reset or "keep a few lands" sweep.
- **Edge**: planeswalker ultimates, one land type / snow / color, X or threshold or storm, board-dependent balance effects, random piles, and one-land-at-a-time attrition.

**Results**:
- **Checks**: `pnpm check` **1,376 tests in 158 files**, the same 6 warnings, 0 errors.
  - New files: `tagger.test.ts`, `ruleset-watch.test.ts`.
  - New cases: `scryfall-map.test.ts` (game_changer only when true, the flags passed, an unflagged card's attrs exactly as before, the digest pinned by a literal), `spellbook-map.test.ts` (the full `ComboRow` gains both fields; each letter, any other letter → null; relevant only on S), `json-array-stream.test.ts` (root scalars at every chunk size, nested values skipped, an unparsable scalar skipped, a value closed by the root's brace).
  - The never-played pin stayed green untouched.
- **Mutation checks**: twelve, each caught — game_changer on non-true, an unsorted digest, unreviewed → clear, an empty fallback, no stale carry, an empty tag counted fresh, no roll-up, disabled cards ignored, relevant on H, B accepted, no root-brace close, a count-only watch.
- **Dry run before any write**, all through the real code: the live Tagger read (5.3 s), the mapper over the downloaded `default_cards` (53 / md5 = pin, 111 / 64 flagged, 0 unreviewed, 0 unknown override ids), and the Spellbook mapper over its bulk.
- **The SQL, read-only**: the stored-flags read is GIN-served (BitmapOr, 405 ms cold), and the new merge plans with both columns in its conflict filter (EXPLAIN only).
- **The route table**: byte-identical.

**Migrate before push**: generate → `drizzle/0016_lyrical_dazzler.sql`, exactly two `ADD COLUMN` lines (the snapshot diff showed nothing else) → shown to the owner → **their yes** → `pnpm db:migrate` → both columns confirmed (66,592 rows NULL / NULL; 271.2 MB). I ran it a second time to read its full output; that run was a no-op ("already exists" notices only). Only then came the dev pass: `smoke:combos`, `smoke:hubs`, `smoke:recommend` (two QA decks created and deleted) and `smoke:autofill`, all green on dev; census unchanged. Then the owner's yes for the push and one dispatch.

**The dispatch** (run 36966549562, 2026-10-02 04:53:53 → 04:59:19 Z, every step green):
- **Scryfall run #253**, 16.6 s:
  - `stats.game_changers {count 53, md5 = the pin}`.
  - `stats.tagger`: both flags `fresh`, `stale_since` null, bulk of 2026-10-01T21:00:32Z. `mld`: tagged 113 → matched 111 → flagged 111 (clear 42, edge 69, unreviewed 0). `extra_turn`: 64 → 64 → 64. Error null.
  - The database holds 53 `game_changer`, 111 `mld` (42 clear / 69 edge) and 64 `extra_turn` = **228 identities** (no overlaps); 16 of the flagged cards are banned or not legal in Commander.
  - 575 identities updated: the 228, plus 346 cards with a printing released 2026-10-02 leaving preview (counted read-only; 301 default printings moved with them), and one other content change.
- **Spellbook run #255**, 14.9 s: 66,881 kept, and every row tagged — C 194 · E 49,369 · O 2,161 · P 1,624 · R 4,288 · S 9,245, unknown `{}` — with 50,296 relevant. `source_version` 7.1.3, `source_timestamp` 2026-10-02T03:11:44.888977Z. The one-time rewrite: 66,464 updated (every row that stayed), 417 inserted, 128 swept.
- **The watch step**: green — "Game Changers match the ruleset: 53 cards as of 2026-02-09 (run #253 …)". The gauge read 284.3 MB.
- **The smokes**: the four, again on dev after the dispatch — green. Census unchanged after both passes.

**Sizes**: 271.2 MB before, 284.3 MB after the dispatch (+13.1 MB).
- **The combos heap** grew 22.3 → 34.5 MB (total 29.1 → 41.9 MB). Its 61,056 dead tuples were autovacuumed within minutes (`n_dead_tup` 0), so that space is free inside the table for later updates rather than returned.
- **The new data itself** is ~0.4 MB: two narrow columns on 66,881 rows, plus a few keys on 228 identities.
- **Owed**: `pnpm db:size` after the next **scheduled** nightly; Y3b's pre-flight records it.

**Decisions** (also in `WAVE4.md`'s tracker and REDESIGN.md's "Y3a decisions"):
1. **The ruleset**: the pin lives in a data-only `src/lib/games/mtg/bracket-ruleset.ts` that Y3b grows. The watch (`pnpm ruleset:watch`) sits after the backups and before the keepalive, `if: !cancelled()`, so the keepalive stays last. It reads the latest **successful** Scryfall run and compares the md5 only.
2. **`game_changer` presence** is asserted on every mapped object; a miss throws before the first card write.
3. **The Tagger read**: the bulk is read whole (`fetch` + `arrayBuffer` + `gunzip`, 2-minute timeout, one catch), and its fallback is per flag: fresh / kept / disabled. A kept flag re-splits the stored cards by today's file, and `stale_since` is carried from run to run.
4. **The overrides file** is keyed by flag name, pins each tag by UUID, and lists both halves of the split. An unreviewed card reads edge and is logged (LATER row 168). The unknown-id check runs against this run's staged identities.
5. **Spellbook**: `bracket_tag text` (no `char(n)` in the schema), and `jsonArrayElements` gains `onRootValue` for the bulk's `version` / `timestamp`.
6. **The wire**: the keys ride payloads that already carry `attrs` whole (search, deck cards, card pages' props), unrendered.

**Found for Y3b**:
- Spellbook's classifier patterns (land denial, infinite turns, skip turns, control of opponents, "lock") match only features our `results` store: 0 utility-only matches over the kept combos.
- Three `extra-turn` cards give the turn to an opponent (Eon Frolicker, Perch Protection's gift, Emrakul, the Promised End). Spellbook's own combo flag excludes such turns.

**LATER**: row 48 annotated (the floor stays); new rows 168 (land-denial cards nobody has reviewed) and 169 (`ingest_runs.source`'s stale comment).

---

Pull latest, then run Y3a — the fourth Wave-4 package and the first with a migration. **`WAVE4.md` is the contract.** Read, in this order: section **A**'s decisions table (named sources only; "a failing source never lowers the read"; the popularity floor stays; **migrate before push**); **D0**'s attribution paragraph; **D3** (bracket data) and D4's first paragraph (the ruleset is Y3b's, but the Game Changer hash it pins comes from Y3a's stats); the **Y3a** block in section E, its row in E's **pin matrix** and the migration table's `0016` row; the **Verification (whole wave)** "Migrate before push" bullet; and Y2b's ship note at the top of `Y2b-session-prompt.md`.

Y3a stores what the bracket advisor will read — Wizards' Game Changers (via Scryfall), Scryfall Tagger's mass-land-denial and extra-turn flags, Commander Spellbook's combo bracket tag and "relevant" flag — lean, from named sources, with honest freshness. **One migration (`0016`: two `ADD COLUMN`s on `combos`), no route, no UI, no new dependency.** Nothing reads the new data yet (Y3b's engine does); every existing surface must answer exactly as before.

Pre-flight, in order.
1. **Y2b has shipped.** `WAVE4.md`'s tracker ticks Y2b (feat `bb4b1e2`), and `drizzle/meta/_journal.json`'s last entry is still idx 15 (`0015_striped_scream`).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived; a warm signal gets its own P2.9 / P4.7 round first.
4. **Ask the owner, once, at the start, in plain words** for (a) read-only database access — the census, `pnpm db:size`, row counts on `combos` and flagged `card_identities`, the latest `ingest_runs.stats`; nothing written by you — and (b) say up front that you will come back with the migration SQL for their yes before `pnpm db:migrate`, and that the package ends with one `workflow_dispatch` of the nightly (it writes, as every nightly does). Never migrate, push or dispatch on an assumed yes.
5. **Working tree clean** at or after Y2b's docs commit. Another session may share this working copy: stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` = Y2b's count plus LATER row 164's (1,342 tests / 156 files / 6 warnings / 0 errors on `e283d74`; row 164 added three cases to `deck-editor.test.tsx` and no file, and an app-made worktree reads 5 warnings because it lacks the gitignored `scripts/.tmp/`), `pnpm db:size` (271.2 MB on 2026-10-01), the census (28 user decks / 181 precons / 1 user) and the counts you will compare against after the dispatch. Save `pnpm build`'s route table; the diff at the end must be **empty**.

## What Y3a is NOT (scope fence)

- NOT the engine, the ruleset's allowances, `loadCompleteCombos` or the calibration (Y3b), and NOT any UI — no bracket line, no sheet, no copy (Y4a). Nothing reads the new columns or keys this package.
- NOT a change to the popularity floor (`spellbook-map.ts`'s `popularity === 0` skip stays — LATER row 48), to the Radar, Suggestions, Autofill or hub combo totals, or to Autofill / Cut Coach roles (Tagger roles for Swap Lab are Y7a's).
- NOT a runtime call to Spellbook's `/estimate-bracket` or to Tagger — ingest only.
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-01 against `bb4b1e2` — re-grep lines, trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **Scryfall, live (2026-10-01).** `GET https://api.scryfall.com/bulk-data` lists `oracle_cards`, `unique_artwork`, `default_cards`, `all_cards`, `rulings`, `art_tags` and **`oracle_tags`**, each with a `jsonl_download_uri`. The card API answers `"game_changer": true` for Rhystic Study. WAVE4 measured 53 Game Changers on 2026-09-30 — re-measure; never hard-code it.
- **The Scryfall mapper** (`src/lib/games/mtg/scryfall-map.ts`): `ScryfallCard` (≈32–60) has **no `game_changer`**. `buildAttrs` (≈203, not exported; its only caller is `mapIdentity` ≈284–302) writes `type_line`, `oracle_text`, `mana_cost`, `keywords` (non-empty only), `power`/`power_num`, `toughness`/`toughness_num`, `loyalty`, `faces`; `MtgAttrs` (`src/lib/games/mtg/attrs.ts` ≈20–32) mirrors it and says to keep the two in sync. The mapper returns no counters (`skipReason` ≈69–74 is the only one). `scryfall-map.test.ts` checks attrs keys one at a time, never the whole object.
- **The Scryfall ingest** (`scripts/ingest/scryfall.ts`): reads **`default_cards`** (≈178–179) through `jsonl_download_uri`, line by line (`cardLines` ≈126–133), into TEMP staging tables (`createStaging` ≈112–123); identities come from the first printing seen per oracle id. The identity upsert's `IS DISTINCT FROM` tuple **includes `ci.attrs`** (≈282–288) — so a sparse key rewrites only the identities that carry it, once. `Stats` ≈135–157, written to `ingest_runs` at ≈448–450; any throw marks the run failed and exits 1 (≈452–460); unknown sets only warn. `USER_AGENT` ≈41 is `Deckwarden/1.0 (https://deckwarden.gg)`.
- **The Spellbook mapper** (`src/lib/games/mtg/spellbook-map.ts`): `SpellbookVariant` (≈26–35) already types `produces[].feature.status` (results keep statuses S / H / C, ≈59 and ≈89) and has **no `bracketTag`**. `ComboRow` (≈39–46) = `external_key, piece_count, ci_mask, results, templates, popularity`. The floor is the literal `if (v.popularity === 0) return { ok: false, skip: "never_played" }` (≈75) — no named constant despite the doc comment. The matrix's pins are exact: `spellbook-map.test.ts` 50–64 (the full `ComboRow`, must update) and 140–147 (the never-played skip, must stay green).
- **The Spellbook ingest** (`scripts/ingest/spellbook.ts`): `BULK_URL` (≈41) is still the S3 URL (`spellbook-prod.s3.us-east-2.amazonaws.com/variants.json.gz`); the stage tables ≈87–90; the merge ≈146–158 with its tuple at ≈154–157; `Stats` ≈52–61 (`source_last_modified` is the Last-Modified header). `jsonArrayElements` (`src/lib/ingest/json-array-stream.ts`) yields only the `variants` array — **the bulk's root `version` / `timestamp` need new reading code**.
- **Schema** (`src/db/schema.ts`): `combos` ≈689–703 (`id`, `external_key` unique, `piece_count`, `ci_mask`, `results`, `templates`, `popularity`; no other index); `combo_pieces` ≈706–721; `ingest_runs` ≈905–921 (`stats` jsonb NOT NULL default `{}`; the source comment is stale — precons and limitless write rows too); `card_identities.attrs` jsonb with GIN `ci_attrs_gin` (jsonb_path_ops).
- **The nightly** (`.github/workflows/nightly-ingest.yml`): one cron, `37 10 * * *`, plus `workflow_dispatch`. Ingests run Scryfall → precons → Spellbook → punk-records → Limitless → Topdeck and **carry no `if:`, so a failed ingest skips every later ingest** — the Tagger read must never fail the Scryfall step (D3). Then the `!cancelled()` steps (R2 mirror, Topdeck archive, the DB gauge ≈112–116 — red through `db-size.ts`'s exit code above 350 MB —, the purge dry-run, the pg client, backups) and **the keepalive (`if: always()`) is last today** (≈149–153).
- **The overlay precedent**: `data/` holds only `data/optcg/legalities.json`; `scripts/ingest/optcg-legalities.ts` ≈60 throws `overlay: unknown card numbers: …` before any write ("a typo must fail the run, never half-apply"). There is no `data/mtg/` yet.
- **Nothing to collide with**: no `game_changer`, `oracle_tags`, `tagger` or `ruleset` anywhere in `src/`, `scripts/` or `.github/` (`progress.ts` ≈5 mentions Y4a's bracket line). `src/lib/combos/queries.ts`'s `loadCombosNearDeck` matches `count(*) >= piece_count - 1` (Radar) or `= piece_count - 1` (Suggestions); no complete-only query exists yet (Y3b's).
- **Migrations**: the last is `0015_striped_scream.sql` (`users.avatar`); yours is `0016`.

## Verify-first list (never from memory)

1. **Step 0 is a read, not code**: one download of the `oracle_tags` bulk → its record shape, the tag UUIDs for `mass-land-denial` and `extra-turn` and their descendants, and every flagged card with its weight. Decide the clear / edge land-denial split from that list and Wizards' examples (Armageddon, Ruination, Sunder, Winter Orb, Blood Moon clear; planeswalker ultimates and Liliana of the Veil-style edges edge) before writing `data/mtg/tagger-overrides.json`.
2. `game_changer` is present on every `default_cards` object (null is not false) — the run asserts it; record `stats.game_changers = {count, md5 of the sorted oracle ids}`.
3. Spellbook's bulk: which `bracketTag` letters occur, and the documented `https://json.commanderspellbook.com/variants.json.gz` answers the same shape to the real User-Agent.
4. `drizzle/0016_*.sql` is exactly two `ADD COLUMN` lines on `combos`, nothing else — eyeballed and shown to the owner before `pnpm db:migrate`.
5. After the dispatch: the Game Changer count, the flagged land-denial and extra-turn counts (the measured list minus the overrides), kept combos carrying tags (unknown letters counted), freshness in both runs' stats — and the Radar, Suggestions, Autofill and hub totals unchanged (`smoke:combos`, `smoke:recommend`, `smoke:autofill`, `smoke:hubs` on dev).

## Design decisions to make explicitly (disclose + pin each)

- **Where the pinned Game Changer hash lives before Y3b's ruleset exists** (WAVE4 says "the adapter's ruleset"): a minimal, data-only ruleset module Y3b grows (version, the Game Changers' as-of date and md5), and what the watch reads (the latest successful Scryfall run's `stats.game_changers.md5`).
- **The watch step's place**: "the nightly's last step" while the keepalive (`if: always()`) must keep running — after the backups and before the keepalive, or after it with its own condition; its failure message is D3's sentence.
- **The Tagger fallback's mechanism**: the identity upsert rewrites `attrs` whole, so "keep the flags already stored" means reading the stored `mld` / `extra_turn` before staging and re-applying them when the Tagger read fails, a pinned UUID is missing or the parse fails; `stats.tagger = {stale_since, tag_ids, counts}`; the Scryfall step stays green.
- **The overrides file's shape** (keyed by oracle id or tag UUID; the clear / edge split, disabled tags, disabled cards) and the unknown-id failure (the overlay precedent: fail before any write).
- **The column types**: the tag as a nullable one-character text (no CHECK — an unknown letter becomes NULL and is counted) and `relevant` as a nullable boolean (true when any produced feature has status S); how both join the stage table, the INSERT and the tuple — and the disclosed one-time rewrite of every combo row on the first tagged run.
- **Reading the Spellbook bulk's root `version` / `timestamp`** without a second download.

## Deployable outcome

**Migrate before push**: generate → eyeball the SQL → the owner's yes → `pnpm db:migrate` → confirm both columns exist → only then the dev pass, the push and the one `workflow_dispatch`. `pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`); the dispatch green, the watch step green on it; `pnpm db:size` before, after the dispatch, and after the next scheduled nightly (new data ≤ ~6 MB; the combos rewrite's dead tuples disclosed). The four smokes green on dev. The route table diff is empty.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and deviations; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains the Y3a decisions; LATER rows annotated (row 48's floor stays); memory updated; **`Y3b-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. The shell is zsh: a bare `====` (or any word starting with `=`) aborts the whole command line. Ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/` inside one `sql.begin("read only", …)` that asserts `current_setting('transaction_read_only') = 'on'` (`scripts/.tmp/census-y2b.ts` is the census; mask IPs in anything printed). DB-connected scripts need `DATABASE_URL` pulled from `.env.local` with `grep`, never `source` (an unquoted `&` breaks zsh).
- The nightly: `gh workflow run nightly-ingest.yml`, then `gh run watch <id>`; one flaky upstream GET has cost P4.9 a second dispatch — read the failing step before re-dispatching. Scryfall wants a real User-Agent and `Accept: application/json`.
- Dev server: `preview_start {name: "dev-log"}` (it logs statements); stop it before `pnpm build`. Dev shares prod's Neon DB: the smokes create and delete decks through it (read the deck-create counters first; never retry into a 429), and a migration applied for dev is applied for prod — hence migrate before push.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors. Run `pnpm exec prettier --write` on every touched file before `pnpm check`; `*.md` is prettier-ignored.
