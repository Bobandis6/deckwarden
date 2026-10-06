# Y5 session prompt — At the table (the share page's bracket line, "At the table", Copy for the table, the owner row, declared-only OG and tile chips)

Pull latest, then run Y5, the eighth Wave-4 package and **the announce point**. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**: the announce-point paragraph, then the decisions table's rows on the legality line ("editor deck pane, share header"), the combo facts ("one GET keyed by the sorted card ids … drafts, private decks and share pages alike") and the deck goals ("Public subset: the target, the exceptions line, and the answers that changed the read; the budget stays owner-only").
2. **D0**: copy rules (plain words, never notation; "approves" stays legality-only), attribution (Wizards' list via Scryfall, Scryfall Tagger, Commander Spellbook), `CardNamePreview` for card names on share pages, adapter gating (One Piece shows nothing, no apology copy).
3. **D6** in full: the share page's line, "At the table" and its pinned "Copy for the table" text, the owner's action row, tiles and unfurls.
4. **D5**'s line table (the share page says the same words as the editor) and **D11**'s "A read that may be out of date says so" (Y5 adds the checked date).
5. The **Y5** block in section E, its pin-matrix row, the **F** row "Answers on the share page", and **Verification (whole wave)** (never `smoke:seo` against prod — it mints fixtures).
6. REDESIGN.md's **"Y4b decisions"**: what visitors' wire carries (the target and the exceptions, never the answers or the budget), the target row's words, the checked date left to Y5, and `BracketSheet` rendering its Y4b blocks only with `onGoalsChange` (a visitor's sheet reads only).
7. Y4b's ship note at the top of `Y4b-session-prompt.md`.

Y5 makes the share page tell a pod what to expect, and lets the owner paste it anywhere:
- **The share page's line**: the combo facts join the page's query batch (two statements, `loadCompleteCombos` + `loadBracketFreshness`); the read is computed server-side from the full row's goals; private decks get the facts from the client (`GET /api/combos/complete`) inside the gate.
- **"At the table"**: a card under the line built from the read, the owner's target, their exceptions and the answers that changed the read; the plan line is the owner's description, never generated. **Copy for the table** produces D6's text, pinned.
- **The owner's row**: Open in editor · Copy ▾ (Copy decklist, Copy for the table) · Share… (`navigator.share` on phones, feature-detected, else copying the link). Every visitor keeps today's row byte-identical. `useCopyToClipboard` + a `CopyStatus` slot are extracted and adopted by the Share and Export dialogs.
- **Tiles and unfurls, declared only**: the OG image's stats gain "Bracket 3 (declared)" from the goals on its existing select; `DeckTile`'s badge shows the declared bracket the same way. Neither ever computes a read.

**No migration and no new route.** The route table must be byte-identical. One Piece is unchanged everywhere.

Pre-flight, in order.
1. **Y4b has shipped.** `WAVE4.md`'s tracker ticks Y4b (feat `3f5a6a9`), and `_journal.json`'s last entry is idx 17 (`0017_concerned_doctor_spectrum`).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`).
   - A red ingest is P4.7 branch F and preempts everything. A red ruleset watch means the Game Changers changed: move the pin first (`bracket-ruleset.ts`) — and LATER row 174 fires if the ruleset `version` moves.
   - `stats.tagger.counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived. Y5 is the announce point: ask too whether the owner plans the r/EDH post right after it (P2.9 round 3 stays armed).
4. **Ask the owner, once, at the start, in plain words**, for:
   - read-only database access (the census, `pnpm db:size`, the counters, and the share page's measured statements);
   - that the dev pass and `smoke:seo` write through the dev server (dev shares prod's database; `smoke:seo` mints and deletes its own fixtures; QA decks are deleted with their tokens and the census re-proved);
   - and say up front that the owner's clicks come at the end (signed in, prod).
5. **Working tree clean**, at or after Y4b's docs commit. Another session may share this working copy: stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **empty**.
   - `pnpm check` on `3f5a6a9`: 1,627 tests / 172 files / 6 warnings / 0 errors. An app-made worktree reads 5 warnings (no `scripts/.tmp/`).
   - `pnpm db:size`: 285.1 MB on 2026-10-06.
   - The census: 28 user decks (16 account + 12 guest) / 181 precons / 1 user (209 deck rows), 0 decks with goals.
   - **The share page's `DB_LOG` statement count** for a public deck, a precon and a private deck's gate, before any change (the acceptance asks for before and after).

## What Y5 is NOT (scope fence)

- NOT goals in Suggestions, Autofill or the Radar, the budget's controls, the goals line, or impact flags (Y6a / Y6b). NOT "Swap…" on the conflict callout (Y7b).
- NOT a change to the engine, the ruleset, the facts route or the goals wire. A bug found in them gets a red pin first and is disclosed; anything wider goes to LATER.
- NOT a stored read: tiles, OG images and hub shelves show the **declared** target only (D6; WAVE4 F's "stored read on tiles" stays deferred).
- NOT "Log a game" on the share page (Y9b), and NOT a public deck browse page with bracket filters (LATER).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-06 against `3f5a6a9`; re-grep lines and trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **WAVE4's line numbers for the share view are pre-Y1** (WAVE4 was drafted before Y1 added lines). Today:
  - `deck-share-view.tsx`: the `CopyState` lines 130–133 (WAVE4 says 124–127), the copy state 183–196 (177–190), `copyDecklist` 285–298 (279–292), the action row 372–428 with its status slot 414–427 (408–421).
  - `deck-share-view.test.tsx`: the visitor row pin 112–119, the live-region note 106–107, the F12 copy tests 226–262 (200–236), the precon row 361–373 (340–345).
  - Still accurate: `buy-deck-menu.tsx` 76, `opengraph-image.tsx` 62–63, `tiles.ts` 143.
- **D6 writes "3+" twice**, in the visitor line ("Played as Bracket 2 · the cards say 3+") and in the copy text, and D0 forbids the notation. Y4b's editor row reads "Your target: Bracket 2 · the cards say at least 3". E's Y5 risk says "the share page's added statement"; the facts are **two** statements.
- **The share page** (`src/app/(site)/d/[publicId]/page.tsx`):
  - force-dynamic (40). Its caching docblock (1–17) still says "two indexed queries", which is out of date: Y5 records the real count there.
  - **One deck lookup**: `getDeck = cache(loadDeckByPublicId)` (`deck.ts:11`), a `select()` of every column, so `goals` is on the row. The layout's 404 gate and `generateMetadata` share it.
  - **Private decks hand off first** (76–78), before the session read and any batch: `<PrivateShareGate deckId={deck.id} />`.
  - **The batch**: the session (83); a first `Promise.all` (84–103: the cards wire 1–3 statements, the author 1 for an account deck, engagement 1 signed in, the fork credit 1 for forks, the precon 1 for precons); then a second (111–119: `deckOwnedForViewer` signed in only, `loadDeckLeaderArt` 1 when the art leader has no chosen printing). Not measured: a signed-out visitor to a guest Magic deck is about 5 statements.
  - **Where the facts fit**: `loadBracketFreshness` needs no cards, so it joins the first batch. `loadCompleteCombos` needs the card ids, so it joins the second (an empty id list returns `[]` without a statement).
  - **Who owns it**: `deckMetaJson(deck, { isOwner: isDeckOwner(deck, null, sessionUserId) })` (142). A guest deck's owner is never `isOwner` on the server (no token there). The client knows through `editToken` (`deck-share-view.tsx` 167–173), the way Y1's "Open in editor" decides (`editToken !== null || deck.isOwner === true`). So a guest owner's row is decided client-side.
  - The whole `deckMetaJson` object reaches the RSC payload, `goals` included (visitors `publicGoals`, the owner everything), though `ShareDeckMeta` (91–113) declares no `goals`: add it to the type.
- **`PrivateShareGate`** (`src/components/deck/private-share-gate.tsx`): props `{deckId}`. It fetches `/api/decks/${deckId}` with the token, `no-store` (36–41), and renders `<DeckShareView deck cards />` only (56): no author, art, precon or ownership. Only an owner can read a private deck, so its `goals` are the owner's full goals.
- **`DeckShareView`**:
  - The line's spot is between `ValidationPanel` (363–370) and the action row (372), the editor's order (`deck-list-pane.tsx` 39–40).
  - The action row (372–428): EngagementButtons, Start from this precon, ForkButton, Copy decklist (392–394), BuyDeckMenu (396–403), Open in editor (404–413), then the status slot (414–427, `role="status" data-slot="copy-status"`).
  - F12's copy machinery: `COPY_RESET_MS = 1800` (130–131), `CopyState` (133), the nonce and reset effect (183–196), and `copyDecklist` (285–298), whose try/catch covers a missing clipboard. Nothing bracket-related is imported today.
- **Its tests** (`deck-share-view.test.tsx`):
  - the visitor row `["♡ Like", "Bookmark", "Fork", "Copy decklist", "Buy this deck"]` (112–119; selector `a[data-slot=button], button[data-slot=button], button[data-slot=dropdown-menu-trigger]`);
  - Y1's owner pin (122–141, "Open in editor" after Buy), which Y5 replaces;
  - "isOwner false is a visitor" (143–146);
  - F12 (226–262);
  - the precon row (361–373).
- **The OG image** (`opengraph-image.tsx`): force-dynamic. `loadDeckOgData` (`src/lib/og/data.ts:29–88`) selects only `{id, name, visibility, gameId, leaderIds}`, so **`goals` is not on it**. Add the target to that select; it costs no new statement. The stats (62–63) render as pills through `OgFooter`. No OG route test exists.
- **Tiles**:
  - `DeckTile`'s `badge?: string` (44–45, rendered 108–115 as `data-slot="tile-badge"`) carries only "Precon" today: `/c/[slug]` 446 and `precons-index-view.tsx` 213, pinned in `precons-index-view.test.tsx` 75.
  - `deckCollectionSelect` (`src/lib/decks/collections.ts:33–48`) has no `goals` and no `kind`. Its callers: home's rail (`loadRecentPublicDecks`), Continue building (`loadOwnerDecks`), `/u/[username]`, `/f/[publicId]`, and the hub's decks and precons (`src/lib/hub/queries.ts` 179, 208; `/c/` is ISR with `revalidate = 3600`).
  - Outside it: `/account`'s tiles come from a `select()` of every column, and `/precons` and the guest list from `deckTileData`. The guest list's wire is `/api/decks/mine`, which carries goals through `deckMetaJson`.
- **`buy-deck-menu.tsx` 76**: its failure toast says "Your browser blocked clipboard access — use Copy decklist instead." The Copy menu moves "Copy decklist", so the words follow. No test pins them.
- **The Share and Export dialogs**:
  - `share-dialog.tsx` duplicates F12: `COPY_RESET_MS` (21–22), the state (63–75), `copyLink` (77–88), and the status slot (149–164: "Link copied" / "Couldn't copy — select the link and copy it."). Tests: `share-dialog.test.tsx` 69–95.
  - `ExportDialog` (`import-export.tsx` 242–266) has no failure path and no reset, swaps its button's label ("Copied ✓"), and has no test.
  - `navigator.share` is used nowhere in `src`.
- **The facts**:
  - `loadCompleteCombos(cardIds, db = getDb())` (`src/lib/combos/queries.ts:293–326`).
  - `loadBracketFreshness(adapter, db = getDb(), now = new Date())` (`src/lib/brackets/freshness.ts:49–58`): null, without a statement, for a game with no `brackets`.
  - `factsIds` and `factsPath` (`src/lib/brackets/facts.ts`). The facts route's docblock already names "(Y5) share pages" (`src/app/api/combos/complete/route.ts` 11–14).
  - `useBracketFacts({game, enabled, ids})` is the private gate's hook.
- **The bracket UI**:
  - `BracketLine({adapter, read, ctx, facts, onRetry, onWhy})`, and `bracketLineView`.
  - `BracketSheet` without `onGoalsChange` is Y4a's sheet. Its `QuestionRow` shows no answer without `onAnswer`, so a visitor's sheet can't show the owner's answers yet: a read-only answer display is Y5's to add.
  - `useTier` is `src/components/editor/use-tier.ts`.
  - The editor builds the read at `deck-editor.tsx` 1529–1555: `assess` with `targetLevel` and `answers`, and the context with `progress` and `targetLevel`. The share page's server-side read takes the same inputs, from `readGoals(deck.goals)` on the full row.
- **No "Played as", "At the table" or "Copy for the table" string exists in `src` yet.** The adapter's How it plays keys are `theme`, `quality`, `fast` and `cedh` (`src/lib/games/mtg/brackets.ts` 284–287).
- **`smoke:seo`** (`scripts/seo-smoke.ts`):
  - It clears the `deck-create:%:::1` limiter keys first (107).
  - It creates two guest decks and deletes them in `finally` (530–535): a public two-card Magic deck (a draft read) and an unlisted One Piece deck.
  - Its share-page checks are SEO only: status, canonical, noindex, JSON-LD, og:image and the OG png. Nothing reads the action row, the line or the OG stats.
- **One Piece**: only Magic declares `brackets`, so `BracketLine` and `BracketSheet` render nothing for it, the facts route answers 400, and its public goals are always null. Its share page also differs by the posture line (155–159), no art and no Buy menu.

## Verify-first list (never from memory)

1. **The share page's statements**: `DB_LOG` on dev for a public Magic deck, a precon and a One Piece deck, before and after. Expect exactly two more statements on a Magic page with a commander (the facts), none on One Piece, and none for a deck with no commander. Record the plans and the warm time, and update the page's caching docblock.
2. **The read is the editor's read**: for the five QA precons, the share page's line equals the editor's (Y4a's measured lines). A deck with goals reads "Your target …" there too: one fixture through both surfaces, pinned.
3. **The visitor row is byte-identical** (`deck-share-view.test.tsx`'s visitor pin) and the owner row appears only for the owner: `isOwner` from the page (a guest deck is an owner only with its token, Y1's `isDeckOwner(deck, null, sessionUserId)` rule).
4. **Copy for the table** equals D6's text for a fixture, line for line, with every source named; a deck with no target, no exceptions or no answers drops those lines rather than printing "none" where nothing was said.
5. **The OG image** renders with and without a target, and never imports the engine (it only reads `goals.targetLevel`).
6. **Private decks**: the gate fetches the deck with the token, then the facts from the client — nothing private reaches the server HTML.
7. **One Piece**: no line, no card, no chip, no apology copy, and no facts request.

## Design decisions to make explicitly (disclose + pin each)

- **D6's "Played as Bracket 2 · the cards say 3+"** is notation again (D0). Y4b's editor row is "Your target: Bracket 2 · the cards say at least 3"; decide the visitor's words (for example "Played as Bracket 2 · the cards say at least 3"), keep them adapter data, and pin them beside the editor's.
- **"The answers that changed the read"** needs a definition: answers whose question is on screen in this read (its `review` and the four How it plays keys), or only those that raised `suggested`? D6's own example prints a "no" ("Pace (owner): doesn't usually win before turn 6"), which raises nothing — so "the answers the read used" may be the honest reading. Never show an answer to a question about a card no longer in the list.
- **The checked date**: what "checked Sep 30, 2026" means on a page computed per request — the facts' `readAt`, or the render time — and where it shows (the line, the card, the copy text).
- **The visitor's Why sheet**: `BracketSheet` without `onGoalsChange` reads only (Y4a's two blocks). Decide whether visitors see the owner's answers there, and whether the target block shows read-only.
- **Where the line sits**: directly after the share page's Warden line (`ValidationPanel`), the editor's order — with "Why?" opening the sheet as on the editor (a Drawer on phones, a Modal from md).
- **The private gate's facts fetch**: the same `factsPath` URL the editor builds (edge-cached), asked once; what the line says while it lands and if it fails (the editor's "Checking combos…" / "Couldn't check combos · Retry", or a quieter share-page form).
- **Who sees the owner row**: the server knows an account owner (`isOwner`) but never a guest deck's owner (no token on the server). Decide the row client-side through `editToken`, as Y1's "Open in editor" does — and keep the visitor row byte-identical for everyone else, including during hydration (no flash of the owner row's absence or presence that shifts the layout).
- **The owner row's Copy menu**: Base UI menus are named after their triggers (R1b); the toast/status wording for both copies, and `buy-deck-menu.tsx`'s toast (the pin matrix names it).
- **`navigator.share`**: feature-detected on phones only, or wherever it exists; its fallback is copying the link with the shared status slot.
- **The tile chip's data path**: `deckCollectionSelect` → `tileFromDeck` — a jsonb path (`goals->'targetLevel'`) rather than the whole `goals` object, so no answer or budget ever reaches a tile's props.

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table is unchanged.
- The share page's line and "At the table" read the same as the editor for the QA precons and for a deck with a target; the page's `DB_LOG` count is recorded before and after.
- Copy for the table is pinned against D6's text; the visitor row is byte-identical; the owner row shows only for the owner.
- The OG image renders with and without a target; `DeckTile` shows "Bracket 3 (declared)" only where a target is set, and never on One Piece.
- **The dev pass**: 390 / 768 / 1200 / 1440 in both themes on a public Magic deck, a precon, a One Piece deck and a private deck's gate. The pane is signed out, so the owner row is RTL plus a throwaway local page (X5's trick) for the menu's look. `smoke:seo` green on dev (read the deck-create counters first; it mints and deletes fixtures).
- **The owner's clicks, signed in on prod**: open one of your decks' share pages — the owner row shows Open in editor, Copy ▾ and Share…; Copy for the table pastes D6's shape; the line and "At the table" carry your target (Y4b's owed click sets one).

Docs in the same package:
- the `WAVE4.md` tracker ticked, with the sha and the deviations, and its status line pointing at Y6a;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains "Y5 decisions";
- LATER rows;
- memory updated;
- **`Y6a-session-prompt.md` written** the way this one was (`applyGoals` after ranking, hidden counts with "N hidden by your goals · Show", impact flags with no target, the saved budget and its controls, the goals line atop Suggestions and the Why sheet — LATER row 175's door — and the first `RecommendationsPanel` RTL).

State `pnpm db:size` before and after. Nothing posted, and nothing seeded on prod. **Announce point**: when Y5 ships, say so to the owner plainly — P2.9 round 3 (the r/EDH post) is theirs to schedule.

## Session notes (environment)

- **The shell**: set PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. In zsh, a bare word starting with `=` aborts the line, and an unquoted `?` globs. Foreground `sleep` is blocked: poll in a background command.
- **Database reads**: ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/`, inside one read-only transaction that asserts `current_setting('transaction_read_only') = 'on'` (`scripts/.tmp/census-y4b.ts` reads the census, the goals column and the counters, IPs masked). To run the real loaders read-only, use `drizzle(sql, {schema}).transaction(fn, {accessMode: "read only"})`; its raw handle is `tx.session.client`. DB-connected scripts need `DATABASE_URL` pulled from `.env.local` with `grep`, never `source`. In postgres.js, `IN ${sql(array)}` breaks in SELECT positions: write `= ANY(${array})`.
- **jsonb re-sorts object keys** (Y4b): compare stored goals with sorted keys, never as strings.
- **The dev server**: `preview_start {name: "dev-log"}`, which logs statements; stop it before `pnpm build`. Dev shares prod's Neon database: read the deck-create counters first, delete QA decks with their tokens, and re-prove the census.
- **The pane**: it is usually hidden — screenshot once to paint and hydrate a tab, then drive it through the DOM (`.click()`, `!el.closest('[hidden]')`). A screenshot can be a stale frame (take a second one after a scroll) or time out entirely on prod ("not compositing frames"); DOM reads keep working. After `resize_window`, reload so `useTier` re-reads the viewport. At md, `[data-slot=drawer-popup]` also matches the closed Tools drawer. The pane is signed out everywhere.
- **Signed-in UI**: mount the component on a throwaway local page (X5's `src/app/(site)/x5-preview/page.tsx` trick), delete it before the commit.
- **Lint and format**: `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors. Run `pnpm exec prettier --write` on every touched file before `pnpm check`; `*.md` is prettier-ignored. After `pnpm format`, scripted exact-string edits can silently miss, so assert their anchors. `card()` fixtures need `type_line` and `oracle_text` in `attrs`.
- **Scratch files** in `scripts/.tmp/` are linted but not typechecked: delete what you add, or keep it warning-free.
- **Mutation checks**: break the guarded line from a scratchpad backup (never `git checkout` a dirty file), run the one test file, and restore. A guard no test catches gets a test.
