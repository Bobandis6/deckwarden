# W8a session prompt — Precons data (migration + MTGJSON ingest + `kind` guards)

Pull latest, then run W8a — the eighth Wave-2 package and **the first W-package with a schema migration**: every `drizzle-kit generate` output gets eyeballed line-by-line before applying (CLAUDE.md hard rule — the expected SQL is printed in the contract; diff against it, don't skim). **`WAVE2.md` is the contract**; read its W8a section (steps 1–4 are the build order), D7 (the surfaces you are NOT building yet — W8b renders them; W8a only makes the data exist), the W8 row of the pin matrix, and **the Appendix to E "Where `kind` matters" table** — that table IS the step-4 checklist. W1–W7 are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`, `2c8a755`, `e1b94c1`). W8a turns MTGJSON's Commander precon lists into real, ownerless `kind='precon'` deck rows that later surfaces can render — published product lists, never counted as community activity.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run the `P2.9-session-prompt.md` round (MTG) or `P4.7-session-prompt.md` round 3 (OP) as its own session first (2026-09-20 census baseline: 25 decks — 24 MTG + 1 OP, the owner's — 1 user, likes 1 · bm 0 · folders 1). (3) Working tree clean at or after W7's docs commit (feat is `e1b94c1`). (4) State your baseline: **865 tests / 113 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-20 on `e1b94c1`), and `pnpm db:size` (263.2 MB on 2026-09-20, alert 350) — **W8a's acceptance includes growth < 6 MB, so record before AND after**.

## What W8a is NOT (scope fence)

NOT the `/precons` page, the share-page precon chrome, hub shelves, nav links, or "Start from this precon" (ALL of that is W8b — W8a ends with rows in the DB, guards in place, and every write route refusing precons), NOT One Piece starter decks (no quantity source — deferred row in `LATER.md`), NOT hand-written blurbs (generated factual summaries only; WotC marketing copy is never copied), NOT pretty `/precons/<slug>` URLs (`/d/p_<slug>` is the address; LATER row exists), NOT a Scryfall re-fetch (precon printings resolve against printings already ingested). Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-20 against `e1b94c1` — re-grep lines, trust the shapes)

- **Migration numbering**: `drizzle/` currently ends at `0013_redundant_vapor.sql` → this package generates `0014_*.sql`. The contract's expected shape (WAVE2 §W8a step 1) adds `decks.kind` (text, default 'user', NOT NULL) + two CHECK constraints (`kind in ('user','precon')`; precons unowned: `user_id`/`claim_token`/`folder_id`/`forked_from_deck_id` all NULL) + rebuilds the partial index `decks_recent_public` with `AND "kind"='user'` + creates `precon_products` (PK = deck_id FK CASCADE, `code`/`slug` UNIQUE, `set_code`, `release_date`, `product_name`, `blurb`, `source_hash`). If drizzle emits something structurally different, STOP and reconcile before applying.
- **Dev shares prod's Neon DB** — the migration applies to the live database the moment you run it. It is additive (default 'user' backfills instantly on 25 rows), but apply it deliberately, once, after the eyeball.
- **The purge would eat precons**: `scripts/purge-anon-decks.ts:47-55` selects `user_id is null` decks (untouched > 12 months, or empty > 7 days — precon rows are never "touched"). Guard with `kind = 'user'` in the SAME package as the ingest. It currently runs dry-run (nightly step gated on the `PURGE_ANON_DECKS_APPLY` repo variable) — the guard must land before anyone flips that variable.
- **Backups would orphan precons**: `scripts/backup-user-tables.sh:19` pins `USER_TABLES="users decks deck_folders deck_cards deck_versions deck_likes deck_bookmarks collections"` — add `precon_products`, or a restore drops product meta and the next ingest collides on `public_id`.
- **Write paths**: `writeDeckCards` is `src/lib/decks/save-cards.ts:27` (the denorm-owning writer — the ingest MUST reuse it, never hand-roll `deck_cards` inserts). `public_id` must match `/^[a-z0-9_]{4,32}$/` (`src/lib/decks/route-helpers.ts:38`) — deterministic `p_` + slug, upsert on it; slugs over 30 chars need truncation WITH uniqueness intact.
- **The `kind` checklist is the Appendix table** (WAVE2 "Where `kind` matters"): home rail `src/lib/decks/collections.ts:65-70`, hub shelf `src/lib/hub/queries.ts:182-188`, `combos-smoke.ts:162-164`, `serialize.ts` (expose on the wire), sitemap/OG KEEP precons in, forks stay `kind='user'` by construction. Line numbers are from the plan's 09-19 verification — re-grep each before editing.
- **MTGJSON source**: `https://mtgjson.com/api/v5/DeckList.json` (index) → per-deck files. `type === "Commander Deck"` filters the ~200 Commander precons. Real `User-Agent: Deckwarden/1.0`, 250 ms gap, new/changed codes only via `source_hash`. **(new)** pure mapper `src/lib/games/mtg/mtgjson-map.ts` + fixture test: `commander[]` → commander zone (≤ 2, extras to main + warning), `mainBoard[].count`, `identifiers.scryfallOracleId` → identity via `external_key`, `identifiers.scryfallId` → `printing_id` only when that printing exists locally (else NULL, counted), dedupe DFC sides by oracle id, tokens/sideboard ignored with a warning, zod-parse ONLY the subset used.
- **Ingest bookkeeping**: `ingest_runs` row like every other ingest (see `scripts/ingest/scryfall.ts` for the idiom); `created_at = updated_at =` release date (precons must never look "recent"); weekly-or-dispatch step in `.github/workflows/nightly-ingest.yml` AFTER the Scryfall step (`:31`) so new-set precons resolve; cards newer than the last Scryfall run → skip the deck, log it, pick it up next week.
- **Access surface**: `src/lib/decks/access.test.ts` (76 lines) is the pin-matrix "must update" — add the precon cases: every write route (PATCH/PUT/DELETE/claim/fork-source-visibility rules as applicable) answers 403/404 for a precon deck id; engagement (like/bookmark) stays ALLOWED (they reference precon ids legitimately).

## Verify-first list (never from memory)

1. **MTGJSON shapes against the live files** BEFORE writing the mapper: pull `DeckList.json` + one modern Commander deck + one 2013-era + one partner-pair deck; confirm the fields the contract names (`type`, `commander[]`, `mainBoard[].count`, `identifiers.scryfallOracleId`/`scryfallId`) and record any drift in the ship note. The fixture test uses a REAL captured (trimmed) deck file, not an invented one.
2. **The generated SQL** diffed against the contract's expected shape — paste the reconciled SQL into the ship note. Apply once; `select count(*) from decks where kind='precon'` = 0 right after (the column lands before the ingest).
3. **Ingest acceptance** (WAVE2 §W8a): precon count = "Commander Deck" entries minus logged skips; five spot checks (one per era + one partner pair) show right commander(s), 100 cards, the precon's own printings; rerun changes nothing (`source_hash`); unresolved-printing count logged, not guessed.
4. **Nothing leaks**: home rail, hub community shelves, "Recent public decks", Continue building, community counts unchanged with ~200 precons in the table (this is why the partial index rebuild + `kind='user'` predicates land in the same migration/package). `smoke:hubs`, `smoke:combos` (updated line), engagement/forks smokes green.
5. **Write-route refusals**: the new `access.test.ts` cases + one live dev check against a precon row (read-only otherwise).
6. **Purge dry-run output** on dev AFTER ingest: `pnpm purge:anon-decks` (dry-run) lists ZERO precon candidates.
7. **db:size before/after** — growth < 6 MB or explain why in the ship note.
8. **Backup script**: run `scripts/backup-user-tables.sh` once (it tolerates absent tables) and confirm `precon_products` is in the dump list.

## Design decisions to make explicitly (disclose + pin each)

- **Slug scheme** for `public_id = 'p_' + slug` (fits the 4–32 regex; collisions across yearly reprints like "Draconic Domination" need the set code in the slug).
- **The generated description** (colors, commander, release, card count — factual, no marketing voice) and where it's stored (decks.description vs precon_products.blurb).
- **Partner-pair handling** when `commander[]` has 2 (both to commander zone) vs >2 (extras to main + warning — which warning channel).
- **Where the weekly gate lives** (day-of-week check in the workflow vs in the script) — the nightly must stay under its runtime budget either way.

## Deployable outcome

`pnpm check` green and deployed; migration applied and eyeballed; ~200 precon rows in prod with `ingest_runs` evidence; every leak surface proven clean; write routes refuse precons (tests + live check); purge guard + backup line landed; `pnpm db:size` recorded before/after (< +6 MB). Docs in the same package: `WAVE2.md` tracker W8a ticked with the sha; a dated ship-note in this file (MTGJSON field drift, the reconciled SQL, ingest counts, spot-check table); LATER rows for anything fenced off; memory updated; **`W8b-session-prompt.md` written** the way this one was (it renders what W8a stored — carry the exact precon row counts and one known-good `p_` public_id forward as its test fixtures). Nothing posted, seeded beyond the official product lists, or simulated.

## Session notes (environment, updated by W7)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node/pnpm + gh); psql/aws absent — DB probes via scripts/.tmp tsx (dotenv + postgres, the db-size.ts pattern; delete probes after; note `deck_cards.card_identity_id`, `deck_folders`, users table = `users`).
- **Dev shares the ONE Neon DB with prod** — W8a's ingest writes PROD rows by design (they're the product). Test the mapper on fixtures first; run the real ingest once, against prod, deliberately.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build` (shared `.next`). `next dev` re-adds the AGENTS.md block — commit it with your work if it appears.
- Pane quirks (W7-confirmed): Base UI menus open from a plain `javascript_tool` element `.click()` but flake when the pane is hidden — retry with a ~2 s wait; the search combobox's option-click PREVIEW does not fire from JS clicks at all (highlight-driven) — signed-in and preview-dependent editor flows are RTL-only; Base UI stamps `data-slot="dropdown-menu-trigger"` over Button's `data-slot="button"` (selector pins must include both); Button-as-`<a>` keeps `role="button"` (W4).
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP (irrelevant to W8a's server-side ingest, which never goes through the API).
- Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.
- Deploy verification: GitHub commit status context "Vercel", **the sha from `git rev-parse HEAD`, never retyped**.

## Context, not tasks

Sequence after W8a: W8b precon surfaces → W9a/b/c autofill → W10 tournaments. P2.9's and P4.7's standing triggers still exist beside the W-series and get their own round, never a slice of a W-session. Owner decisions of 2026-09-19 stand (ownerless official precons was one of them). Bandai and Azuki emails unanswered — posture unchanged. Cold-start rule holds: precons are published product lists rendered AS product lists — never community activity, never "recent", timestamps = release dates. Premium never gates card data or prices. The affiliate env stays empty (W7 ship note has the switch-on runbook for the VPS day).

---

## Ship note — 2026-09-20

Shipped: feat `1b1a7c4`, test de-flake `89035ab`. Vercel success on both; nightly dispatched on `1b1a7c4` green end-to-end (precons step `unchanged: 175`, backup dump list carries `precon_products`, restore drill re-run green, 40s).

**MTGJSON field drift vs the contract (live files, 2026-09-20, api/v5 `5.3.0+20260920`):**

- `DeckList.json` = 3,059 decks, 48 types; `type === "Commander Deck"` → **191** (contract said ~200). "MTGO Commander Deck" (2) is a distinct type and stays excluded by exact match.
- **Collector's Editions**: 16 entries are the same product list in premium foils (regular vs CE lists verified identical name×count on 40K; different scryfallIds). All 16 have a same-set regular sibling (the FIC four hide the phrase mid-name: "Limit Break Collector's Edition (FINAL FANTASY VII)"). Skipped, counted — 175 products is the honest catalogue.
- **Multi-face cards are ONE row** with the full "A // B" name, `side: "a"`, `faceName` (split/aftermath/adventure observed across WOC/DRC/DSC/MOC/LCC). No two-row DFC shape found anywhere; the dedupe-by-oracle-id defense stays.
- **The same oracle id DOES recur across rows** — as different printings of a basic (TimeyWimey: Plains #196 ×2 + #197 ×1; C13 had 9 such). Merged into one entry (deck_cards PK is per identity), qty summed, the **higher-count** printing represents the entry — first-seen lost to the hash's order-independence test.
- Partner pair confirmed real: TimeyWimey_WHO `commander[]` = Tenth Doctor + Rose Tyler (2 + 98 = 100). No >2 case exists in the 191; the overflow→main branch is fixture-tested synthetically.
- WHO decks ship `planes[]` (10), DSC `schemes[]` (10), some SLD `tokens[]` — 18 mapper warnings total, all extras ignored by design.
- MTGJSON serves `.json.sha256` sidecars, but they hash raw bytes and `meta.date` changes every daily build — useless for change detection. `source_hash` = sha256 over the mapped stable subset (setCode/name/releaseDate/sorted entries).

**Reconciled SQL:** `drizzle/0014_reflective_impossible_man.sql` matched WAVE2 §W8a step 1 statement-for-statement (drizzle qualifies columns and adds `NULLS LAST`, moot on a NOT NULL column; the old 0008 index emission differs only by the added `and "decks"."kind" = 'user'`). Applied once; `kind='precon'` count was 0 immediately after, 25 rows backfilled `'user'`.

**Ingest counts (run 1 = the real backfill; run 2 = FULL rerun proof):** 191 entries → 16 `ce_skipped` → 175 fetched, 175 ingested, 0 unresolved identities, **0 unresolved printings**, 0 structural, 0 fetch failures, 0 slug collisions; rerun: `unchanged: 175`, zero writes. Run 1's `ingest_runs` row is honestly `failed` — every deck row committed, then the stats UPDATE crashed: **`client.json()` on the createDb (drizzle-wrapped) client breaks in Bind; the scryfall/spellbook bare-client idiom does not carry over.** Fixed to `${JSON.stringify(stats)}::jsonb`; run 2's row is `succeeded`.

**Spot checks (era sweep + partner pair):**

| code | public_id | commander(s) | cards | printings |
|---|---|---|---|---|
| Counterpunch_CMD (2011) | `p_counterpunch_cmd` | Ghave, Guru of Spores | 100 | 77/77 own-set |
| EternalBargain_C13 (2013) | `p_eternal_bargain_c13` | Oloro, Ageless Ascetic | 100 | 79/79 own-set |
| BreedLethality_C16 (2016) | `p_breed_lethality_c16` | Atraxa, Praetors' Voice | 100 | 83/83 own-set (the D7 example URL, live) |
| TimeyWimey_WHO (2023) | `p_timey_wimey_who` | The Tenth Doctor + Rose Tyler | 100 | 94/94 own-set |
| BlightCurse_ECC (2026) | `p_blight_curse_ecc` | Auntie Ool, Cursewretch | 100 | 85/85 resolved, 79 own-set — the other 6 are main-set printings the file itself lists (physically in the box) |

All five: `kind=precon`, public, created_at = updated_at = release date; totals 175 decks = 175 products, 0 constraint-shape violations, 0 timestamp drift.

**Design decisions (pinned):**

1. **Slug** = `clean(name minus parentheticals) + '_' + set code`, ≤30 chars (truncate base, counter backstop — never hit). Parenthetical strip is what turns "Scions & Spellcraft (FINAL FANTASY XIV)" into `scions_spellcraft_fic`. Slugs are minted once and never re-slugged on rename (they are public URLs).
2. **Description lives on `decks.description`** — it feeds og:description + JSON-LD today with zero W8b work; `precon_products.blurb` stays NULL, reserved. Shape: "White-Blue-Red Commander precon led by X and Y. Official {Set} ({CODE}) product list, released {Month YYYY}. {N} cards."
3. **Partner pairs**: both to the commander zone; >2 (nonexistent today) overflows to main with a mapper warning surfaced in ingest stats.
4. **Weekly gate lives in the script**, not workflow YAML: nightly = new codes only (~2 s when quiet; a new set's decks land the night after Scryfall has the cards — better than the contract's "next week"), Sunday UTC = full source-hash sweep, `PRECONS_FULL=true` on workflow_dispatch forces one. Deviation from "weekly-or-dispatch" disclosed: strictly cheaper AND fresher.

**Leaks:** home rail 12/12 `kind=user`; Atraxa hub shelf 1 user deck (unfiltered would be 3 — Breed Lethality + the CM2 anthology excluded); 13 public user decks unchanged; sitemap gained exactly 175 `/d/p_` URLs (intended — indexable pages with OG images); purge dry-run 0 candidates with 157 pre-2025 release dates in range; profiles/Continue-building safe by NULL owner. Partial index serves the guarded rail (Bitmap Index Scan under `enable_seqscan=off`; at 188 rows the planner prefers a seq scan — economics, not a defect).

**Write refusals (live, dev + prod):** PATCH/PUT cards/DELETE with no proof and with a forged `x-deck-token` → 403; claim (correct body shape) and like → 401 signed out; engagement stays allowed for signed-in readers by `requireEngageableDeck` (unit-pinned); fork = 401 signed out, allowed signed in (fork of a precon is `kind='user'` by explicit-columns construction). GET meta 200 with `"kind":"precon"` on the wire.

**CI de-flake (`89035ab`):** the W7 "Buy this deck" test failed both CI attempts on `1b1a7c4` (Node-24 runner) — its fixed `settle(50)` + `getByRole` lost the Base UI menu-open race that local runs win. findBy*/waitFor hang under the file's faked `setTimeout` (RTL's poll rides it unadvanced), so `pollFor()` advances fake time in 50 ms slices and yields one real `setImmediate` turn per round. 8/8 full-file runs green. Discovered but NOT fixed (pre-existing at `bcde7ea`, LATER row): a `vitest -t` isolated run of that one test never opens the menu at all until the file's first test has rendered once.

**Environment notes for future sessions:** `client.json()` is unusable on the createDb client (above); MTGJSON deck files are ~200–770 KB each (full card objects inline) — never bulk-fetch casually; `source .env.local` breaks on unquoted `&` in OAuth secrets (use dotenv extraction).

db:size 263.2 → 266.4 MB (+3.2 MB, budget < 6). Census before ingest: 25 decks (24 MTG + 1 OP) · 1 user · likes 1 · bm 0 · folders 1 — untouched by W8a (precons are not census).
