# DECK-TOKENS session prompt — a fixed card-type order, and a Tokens list outside the 100

*Status: **shipped 2026-10-24** as `71c4df1` (rebased onto `43bcbd2`), written and executed in the same session at the owner's request, with the token search follow-up `f3a234f` the same day. Anchors verified against `40706f2`; re-grep lines, trust the shapes.*

## Ship note (2026-10-24)

- **One commit:** code, tests and docs.
  - CI (`check`) passed, and Vercel's production deploy reported success on the full sha.
  - `pnpm check` on the rebased tree passed: 2,950 tests in 277 files, TypeScript 6, the same 6 warnings. This package adds 66 tests in 5 new files.
  - `pnpm build`'s route table is unchanged.
- **Production, read from outside:**
  - The precon "Calling All Angels" now reads Creature 33, Sorcery 7, Instant 5, Artifact 11, Enchantment 5, Land 38. Lands led it before.
  - Its "Card types" chart follows the same order.
  - Card search for "treasure" returns cards only.
  - `tokens=1` returns nothing yet: production gets the token catalog and `attrs.tokens` from the **first nightly ingest after the deploy** (10:37 UTC), or from a dispatch. Until then the Tokens section shows "No tokens yet" with nothing to suggest.
- **What the nightly will do:**
  - add about 972 token identities and 3,100 printings, about 3 MB; production was 292.8 MB on 10-24, so it lands near LATER row 36's 300 MB pruning trigger;
  - write `attrs.tokens` on about 4,900 cards;
  - un-candidate Mechtitan, whose `/c/mechtitan` page and sitemap entry then 404.
- **Docs:** `LATER.md` rows 320 to 328, the build plan's ingest lines, a REDESIGN.md record, and this file's census appendix.

## Follow-up (2026-10-24): the token search reads a token's words

- **The report:** the owner couldn't add the Tarkir: Dragonstorm Commander Elemental (4/4 blue-red, TTDC #27) to a deck. "elemental" matched 39 tokens, the box showed twelve, and that one came thirtieth, with no way past the twelfth.
- **The fix, `f3a234f`:**
  - The box hands its text to the adapter (`tokenQuery`, Magic's `mtgTokenQuery`). A P/T, color words and keywords become the search route's own filters, and the rest is the name.
  - A broad search says "Showing 12 of 39." above a "Show 12 more" button.
  - Namesakes read by P/T, then colors. No token has an EDHREC rank, so the best-match order had left them in oracle-id order.
  - LATER rows 329 and 330.
- **Checks:**
  - `pnpm check` passed: 2,959 tests in 277 files.
  - CI (`check`) passed, and Vercel's production deploy reported success on the full sha.
- **Production, read from outside:**
  - The search the box now sends for "Elemental 4/4 blue red" returns that one token (oracle `f81c047d`).
  - "elemental" reads 0/1, 1/0, 1/1 and on, with that Elemental 17th, on the second page.
  - The editor's chunks carry the new placeholder, the narrowing line and the word parser.

## The owner's ask (2026-10-24)

> When on the deck editor page or share page of any deck, or whenever viewing the deck list in general, change the order of card types: keep Commander at the top, then Creatures, Sorceries, Instants, Artifacts, Enchantments, Lands. Then add a separate dropdown tab or place to add token cards you could have for your decks, separate from the 100-card count, with a button to expand or collapse that token list, viewable in text or grid.

The owner asked for a **deeper** version, not a bigger one, and asked four questions first.

## 1. What a top professional would do here that the ask doesn't say

- **Separate "which bucket" from "what order."** A card's group comes from the stored `primary_type` precedence (Creature › Planeswalker › Battle › Instant › Sorcery › Artifact › Enchantment › Land, `src/lib/games/mtg/scryfall-map.ts:93-116`). That precedence also feeds the Lands stat, the curve, Autofill, Swap Lab and search, so it stays untouched. Only the **display order** changes, from **one constant in the Magic adapter** that the editor, the share page and the "Card types" chart all read. Today the groups sort biggest-first (`src/lib/decks/view-model.ts:130-137`), so the order also jumps around while you build (Creatures pass Lands at 38 and the sections swap places). A fixed order fixes that as well.
- **Decide what the ask leaves out.** Planeswalkers and Battles aren't in the list, so they go after Enchantments and before Lands. Anything rarer (Conspiracy, Dungeon, no type) goes after Lands. Lands stay the last real group, as the ask has them.
- **Name the edge cases instead of silently changing them.** Artifact lands (Seat of the Synod) group under Artifacts, Urza's Saga under Enchantments, Dryad Arbor under Creatures, and modal double-faced cards by their front face. That follows the existing precedence and agrees with the Lands stat (`src/lib/games/mtg/analyze.ts:22-24`). It is flagged as a LATER row, not changed here.
- **Tokens can't be found by name.** The raw data has 105 token names with several versions (15 different "Soldier" tokens, 31 "Elemental"s), and 90 token names that are also real card names (Mutavault, Storm Crow, Ajani's Pridemate). So a professional:
  - suggests the *exact* tokens from Scryfall's card→token links ("Your cards make: Treasure — from Smothering Tithe");
  - shows P/T and color on every token row;
  - keeps tokens out of every normal name lookup (import, quick-add, search, suggestions), so pasting "Mutavault" still gets the land.
- **Make "outside the 100" a rule, not a label.** Tokens are excluded from deck size, legality, color identity, copy limits, analytics, the bracket read, suggestions, Autofill, Swap Lab, Budget Twin, price totals, buy links, the export text, the journal's list hash, OG images, and hub or staple aggregates. They are included in versions and restore, forks, and both views. The save route enforces it server-side: a token can't enter the 100, and a non-token can't enter Tokens.
- **Use the right boundary for "token."** The catalog includes emblems and the game-piece cards players keep with a deck: The Monarch, The Initiative, Day // Night, The Ring, Energy Reserve, City's Blessing, Radiation, Bounty cards. It excludes junk: World Championship bios and ads, minigames, checklists.
- **Fix the latent bug the raw data exposes.** Seven token objects already entered the catalog through odd layouts (Role tokens use `flip`, and Mechtitan uses `reversible_card`). **Mechtitan, a token, is a commander candidate with a hub slug today** (dev branch: `is_leader_candidate = true`, `slug = 'mechtitan'`).
- **Measure the budget before writing a byte.** About 1,100 token identities plus 3,300 printings come to roughly 3 MB with indexes (rows average 772 B and 244 B; the dev branch is 290.8 MB, production was 292.8 MB on 10-24, and the alert is at 350 MB). No new column, so **no production migration**: the flag uses the sparse-attrs pattern that `game_changer` and `roles` already use.

## 2. The rawest material

- **Scryfall's bulk `default_cards`**, streamed (116,546 English objects, 2026-10-24), rather than a hand list or a name search:
  - the token objects themselves: layouts `token` 926, `double_faced_token` 80, `emblem` 89 = 1,095 identities and 3,275 printings;
  - every card's **`all_parts`** array: component `token` gives 4,162 distinct card→token links from 3,963 cards, and `combo_piece` links point at emblems and game pieces.
- **MTGJSON precon deck files' `tokens[]`** — the physical tokens in each product box. The precon ingest reads and discards them today (`src/lib/games/mtg/mtgjson-map.ts:20-21`, `:48`, `:186`).
- **The Comprehensive Rules**: tokens aren't cards and aren't part of a deck, and a Commander deck is exactly 100 cards including the commander (CR 903.5a).
- **The repo's own data**:
  - on the dev branch: the 7 token-typed identities already ingested, the zone census (`main` 16,692 · `commander` 210 · `leader` 1), zero decks or versions holding a token today, and the average row sizes;
  - in the code: every zone consumer and every card query, as two census sweeps.

## 3. Methods and tools

- **Streaming analysis before design.** A Node script over the bulk JSONL (no file written) classified layouts, set types, link components, name collisions and junk. Its finding: per-printing rules (skip `memorabilia` and `minigame` set types, skip checklists) remove all 120 junk objects and keep every game piece.
- **One source of truth per decision, all in the adapter**:
  - `display.typeOrder` (data);
  - a `ZoneDef` with `countsTowardSize: false` and `holds: "tokens"`;
  - a core "playable zones" helper;
  - **one** SQL predicate for "not a token," used by every card query.
- **Census, then a verdict per site.** Grep plus two read-only subagents swept zone consumers and card queries, and each site is marked exclude, include, or already correct.
- **Ingest stays one pass.** Each printing is filtered as it streams. After the stream, a printing id → token oracle map turns `all_parts` into a sparse, sorted `attrs.tokens`, and token objects get `attrs.is_token: true`. Tokens are never leader candidates. The run's `ingest_runs.stats` records token counts.
- **Tests**:
  - table-driven Vitest on real type lines (Seat of the Synod, Dryad Arbor, Emeria's Call, Mechtitan, a Role token);
  - RTL on the WAI-ARIA disclosure pattern (`aria-expanded`, `aria-controls`) and on the text and grid views;
  - route tests for the save rule;
  - mutation checks (delete each exclusion, and a test must fail).
- **Real runs**:
  - the Scryfall ingest against the Neon `dev` branch, with `db:size` before and after;
  - smokes against a local server only;
  - the built-in browser at phone and desktop widths;
  - `pnpm check`, `pnpm build`'s route table, the deploy, then Vercel's commit status.

## 4. What, other than you or me, shows it's right

- **Scryfall's link graph.** For any deck, the suggested tokens must equal the union of Scryfall's `all_parts` token links for its cards. A script checks this against the live API for sample decks.
- **WotC's box contents, via MTGJSON.** Run the derivation over the ingested Commander precons and compare it with each precon's `tokens[]`. Report recall and precision, and explain each miss.
- **The rules and the existing validator suite.** A legal 100-card deck plus N tokens still reads legal at "100 / 100", with `validate.test.ts` green and unmodified.
- **A census of the whole catalog.** Every Magic card lands in exactly one display group, with no surprise "Other," counted over all ~32k identities.
- **CI, the Vercel status, the first production nightly's own stats** (token counts, `db:size`), and the public pages rendering.

## The rewritten prompt

**What it is.** Two changes to how a deck reads, done properly:

- **Part A — type order.** On the editor and every share page, a Magic deck's type groups read Commander (the leader zone, above the list as today), then Creatures, Sorceries, Instants, Artifacts, Enchantments, Planeswalkers, Battles, Lands, then anything else. The order is the same in text and grid, under every sort, and in the analytics' "Card types" chart. One Piece keeps biggest-first; its own fixed order is a LATER row.
- **Part B — Tokens.** A third Magic zone, `tokens`, sits outside the 100. In the editor it is a collapsible **Tokens · N** section under the card list (collapsed by default, remembered per browser). Inside it:
  - **From your cards**: the tokens the deck's cards make, from Scryfall's links, each with the cards that make it, one-click add, and Add all;
  - an **Add a token** search over tokens only;
  - the token list in the pane's current **View**: text rows with steppers, remove, and a P/T · color caption, or the image grid.

  The share page renders the same section read-only, only when the deck has tokens, collapsed by default and not persisted (the share page's no-localStorage rule).

**Size L.** No migration, no dependency, and no new route: the token search and key lookup are parameters on `GET /api/cards/search`. Production gets tokens from the next nightly ingest after the deploy (10:37 UTC), or from a dispatch if the owner asks.

**Pre-flight.**
1. Main green: `pnpm check` at `40706f2`. Working tree clean; stage explicit paths (parallel sessions share this worktree).
2. Database reads and the trial ingest go to the Neon `dev` branch; scratch scripts call `guardDatabaseUrl()`.
3. Baselines: `pnpm build`'s route table and `db:size` on dev.

**Scope fence — what this package is NOT.**
- NOT a change to `primary_type` precedence: artifact lands stay Artifacts, and the Lands stat is unchanged (LATER).
- NOT tokens in the decklist export or the import parser. A pasted "Treasure" line stays unresolved instead of guessing among 15 Soldiers (LATER: a Tokens section in export and import).
- NOT precon decks filled with their box tokens. MTGJSON's `tokens[]` is used as the verification oracle only (LATER).
- NOT a maybeboard or sideboard. Tokens hold token objects only.
- NOT One Piece tokens (the game has none) and NOT One Piece's type order.
- Anything else goes to `LATER.md` with a trigger.

**Design (decided and disclosed).**
1. `display.typeOrder?: readonly string[]` on the adapter. Magic: `["Creature","Sorcery","Instant","Artifact","Enchantment","Planeswalker","Battle","Land"]`. `groupDeckEntries` takes it. Listed types come in that order, then unlisted ones by name, then "Other." Without it, biggest-first (One Piece). `analyze`'s "Card types" breakdown sorts by the same constant.
2. `ZoneDef.holds?: "cards" | "tokens"`, defaulting to cards. Magic's `COMMANDER` gains `{ id: "tokens", label: "Tokens", min: 0, max: null, countsTowardSize: false, defaultCopyLimit: null, holds: "tokens" }`, last, so every "first non-leader zone" lookup still finds `main`.
3. **The playable list = the `countsTowardSize` zones.** Validate, analyze, brackets, speed, recommendations, Autofill, Swap Lab, Budget Twin, price totals, buy links, the list hash, the export, OG, sample hand and ambient art read only those. Versions, restore, forks, the wire and both views carry every zone.
4. **Ingest** (`scripts/ingest/scryfall.ts` + `scryfall-map.ts`):
   - token layouts are no longer skipped, except printings in `memorabilia` or `minigame` sets and checklists;
   - token objects (a token layout, or a type line with the Token supertype) get `attrs.is_token: true` and `is_leader_candidate = false`;
   - cards get `attrs.tokens` = the sorted oracle ids of the token-catalog objects their printings' `all_parts` link to (component `token`, or a `combo_piece` that is itself in the catalog).
5. **One predicate**, `notTokenSql`, beside the identity schema helpers. Every candidate query uses it: search by default, suggest, resolve, import and quick-add, recommendations, Autofill, Swap Lab, Budget Twin, hubs, sets, sitemaps, collections, combos, OG. Token-only search is `tokens=1`; hydration by external key is `keys=` (≤ 100).
6. **Save rule** (PUT `/api/decks/[id]/cards`): a token in a non-token zone, or a non-token in a token zone, gets a 400 listing the cards. The editor never sends either, because the section and the search pane route by zone.
7. **Card pages**: a token's `/cards/[id]` renders (share-page token names link to it) with `noindex`, and it is left out of the cards sitemap. Mechtitan's hub goes away with its leader flag (its slug is cleared or ignored by the hub lookup).

**Verification.** Listed under §4 above, plus `pnpm check` green, the route table unchanged, the dev ingest's stats and `db:size` delta, and the browser pass (editor and share page, text and grid, collapsed and expanded, phone and desktop).

## Census appendix (two read-only sweeps, 2026-10-24, then execution)

**Card queries a token could leak into** (34 sites read). Ten needed the guard and carry `notTokenSql` now, pinned by `src/lib/cards/tokens.test.ts`:
- search;
- suggest;
- resolve's three name passes;
- the cards sitemap and robots;
- sets;
- keyword options;
- collection import by name;
- the candidate pools (explicit, though legality already excluded them);
- OG.

Topdeck's name maps carry it as a SQL literal (see *postgres.js* below). The leader-only readers (hubs, `/commanders`, slugs, the Topdeck leader map) stay safe because a token is never a leader candidate. Readers by id or key need nothing.

**Deck-zone readers** (≈60 sites):
- `toDeckSnapshot` was the choke point for validate, analyze, the bracket read, speed and the export. It now builds the playable list.
- Everything else was fixed where it reads: the groups and sample hand (`splitLeaderEntries` → `rest`/`aside`), Suggestions' body, the panels' refetch keys, the combo facts and Combo Radar, the Cut Coach, Swap in, Autofill (sheet and route), the saved-deck recommendations, OG, version counts and import Replace.
- **Decision:** the journal's list hash keeps every zone. Its contract is "equal exactly when the diff is empty", and the diff should show a token edit, so a game logged after one mints a played snapshot.

**Caught during execution, before anything shipped:**
- **One Piece's Leader has `countsTowardSize: false`.** "Playable = counted" would have dropped every One Piece leader from validation and the hash. Playable is leader OR counted (`playable.ts`, pinned).
- **`orderLeadersBy` rebuilt the loaded list from `leader` + `rest`**, so after the split change the editor dropped the tokens on reload; the next edit would have deleted them. It was caught by the reload check in the browser and is pinned in `ambient-art.test.ts`.
- **postgres.js JSON-encodes a string bound to a jsonb parameter.** The raw guard `attrs @> $1::jsonb` matched 0 of 972 tokens on the dev branch. Drizzle binds it correctly (the app path, verified against the dev server); Topdeck's raw query uses a literal, pinned.
- **A declared `idBadge` means "show printed keys" to the Games dialog,** so tokens got their own `tokenCaption`.

**Measured:**
- Dev-branch ingest: 199 s; 972 token identities, 3,116 printings; 4,873 cards link 5,227 tokens; 167 junk printings skipped; 290.8 → 293.7 MB.
- Mechtitan is no longer a leader candidate (its `/c/` page goes with it).
- Exact-name lookups: "mutavault" 2 rows → 1 after the guard, "soldier" 13 → 0.
- 193 token-only sets stay off `/sets`.
- MTGJSON box tokens: 73 of 76 covered (96%). The 3 misses are explained in LATER row 323.
- Mutation battery: 27 of 27 guards caught by a failing test.
