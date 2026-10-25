# TOKEN-FILL session prompt — the Tokens list fills itself from the deck's cards

*Status: **built and verified locally 2026-10-24**, written and executed in the same session at the owner's request, on top of DECK-TOKENS (`71c4df1`) and its token-search follow-up (`f3a234f`). Migration `0020` is applied to the Neon `dev` branch; **production waits on the owner's yes** (the migrate-before-push order of 0016/0017/0018/0019), then the push. Anchors verified against `48859bc`; re-grep lines, trust the shapes.*

## Local verification (2026-10-24, the dev branch and `localhost:3000`)

- `pnpm check`: 279 files, 2,988 tests (from 277 / 2,959), the same 6 warnings. This package adds 29 tests: `token-fill.test.ts` (11), `token-fill-load.test.ts` (4), six new or rewritten cases in `tokens-section.test.tsx`, two in `deck-editor.test.tsx`, five route cases and one serializer case.
- Migration `0020_decks_hidden_tokens.sql` is one statement, `ALTER TABLE "decks" ADD COLUMN "hidden_tokens" text[];`. Applied to `dev` with `pnpm db:migrate`: the column exists, nullable, every row NULL; the journal row's hash is the file's sha256 (`cac7a604…`), `created_at` 1792888114945.
- A guest deck on `dev` (Brago, Smothering Tithe, Elspeth, Dockside Extortionist, Sol Ring): the editor's Tokens heading read **3** before any request; open, ONE resolve call hydrated the Emblem, Soldier (1/1 white) and Treasure rows, each naming its makers ("from Dockside Extortionist, Smothering Tithe"). Hide on Treasure: the heading read 2 at once, the chip "Hidden: Treasure" stood in, one `PATCH /api/decks/{id}` 200 followed the debounce, no PUT; a reload kept both. The row on `dev`: `hidden_tokens = {3c549374-…}`, `updated_at` 0.84 s after `created_at` (the cards' PUT), untouched by the Hide.
- The deck's share page: "Tokens 2", the Emblem and Soldier rows with their makers, no Treasure, no Hide, no search box, zero resolve requests (the server's statement).
- The precon "Calling All Angels" (`/d/p_calling_all_angels_fdc`): "Tokens 5" — Angel 3/3 (Linvala), Angel 4/4 (Court of Grace, Speaker of the Heavens), Clue (five makers), Spirit 1/1 (Bishop of Wings, Court of Grace), The Monarch (Court of Grace) — with no request.
- The grid: the derived tiles under "From your cards" with no ×N badge; the chip beneath.

## The owner's ask (2026-10-24)

> Is it possible to auto populate the tokens needed based on what the cards say when you build your deck? Like once you get your 100 cards inputted it pulls the tokens needed based on what the card descriptions say and adds them.

Then, to the assessment: *"Yes, build the automatic token fill here as the next package: derive the tokens from the deck's cards on the editor and the share page, with a per-token dismiss, hand-added tokens kept."*

## 1. What a top professional would do here that the ask doesn't say

- **Derive, don't store.** DECK-TOKENS already ingests Scryfall's card→token links (`attrs.tokens`, the oracle ids of the catalog objects a card's `all_parts` names) and the Tokens section already lists them as "From your cards" behind a click. The automatic version is the same set, *shown as part of the list* instead of offered: the union of the playable list's links, computed where the deck is read (the editor's client state; the share page's server batch). No row is written when a card enters or leaves, so nothing goes stale, nothing has to be orphan-collected, and a fork, an import or a restore gets its tokens for free. Writing token rows automatically on each save would mean deciding when to remove them again and marking which rows were the player's; that needs a column on `deck_cards` for little gain.
- **Keep the player's own rows in charge.** A token the player added by hand (the search, or the old Add) is a `deck_cards` row with a quantity and steppers; it stays, and it supersedes the derived one of the same key (the list never shows Treasure twice). The derived rows carry no quantity: a player who wants "2 Treasure" adds it, and the stored row takes over.
- **A dismiss is a setting, not an edit.** "Hide Treasure" is the owner's taste about what the list shows, like the deck's goals: stored on the deck (`decks.hidden_tokens text[]`, NULL when none, 0 bytes), saved through its own PATCH body `{hiddenTokens}` that **never moves `updated_at`** (a hidden token must not reorder the "recent" rails), owner-only, guest decks with their claim token. Never copied on fork (`forks.ts` inserts explicit columns, so this falls out). Not versioned (versions hold the list). The share page applies it server-side, so the pod sees what the owner sees; the keys themselves ride only the owner's wire.
- **Hidden means hidden, not gone.** A hidden token the cards still link to shows as a chip ("Hidden: Treasure · Show") so the choice is reversible without knowing the trick. A hidden key whose makers left the deck shows nothing, and stays stored: cut Smothering Tithe, add Dockside Extortionist a month later, and Treasure stays hidden as asked. The array is capped (100 keys), and a deck links a handful.
- **Say where each token came from.** Scryfall's links are curated and cover 73 of the 76 tokens in the Commander precon boxes that list them (DECK-TOKENS' cross-check), but a miss or a quirk exists (Divine Visitation's Angel is the printed 4/4 flying, vigilance token, LATER row 327). So every derived row names the cards that make it, in both views the eyebrow says "From your cards", and the caption shows P/T and color. The rows are honest about being automatic.
- **One source of truth, game-ignorant.** One pure module (`src/lib/decks/token-fill.ts`) answers "which keys, from which cards, which hidden-but-linked" for the editor's hook, the share page's loader and the tests; it knows zones only through the FormatDef (`playableEntries`, `tokenZoneOf`) and links only through `adapter.tokenLinks`. One Piece declares no token zone and no links, so nothing changes there.
- **The share page pays one statement, only when it must.** The links are on the cards the page already loaded; the token cards themselves are one `wireSelect` by external key, game-scoped, guarded by `tokenSql`, skipped when the list links nothing. Tokens have no legality rows, so the legality query is skipped too. Precon pages are share pages, so every precon now shows its box tokens by derivation (LATER row 323's ask, nearly all of it).
- **The editor asks nothing until the section opens.** As today: the count on the heading comes from the links on the cards in hand (no request); the token cards hydrate through one POST `/api/cards/resolve` id pass when the section opens, shown and hidden keys in the same call, each key kept for the session, a key that resolves to nothing never asked twice.

## 2. The rawest material

- `attrs.tokens` on about 4,900 Magic cards and `attrs.is_token` on 972 catalog objects (the dev branch after DECK-TOKENS' ingest; production after its first nightly).
- The existing surfaces: `use-token-suggestions.ts` (the derivation behind a click), `tokens-section.tsx` (the disclosure, both views, the search), `deck-list-pane.tsx` and `deck-share-view.tsx` (the two callers), `deck-editor.tsx` (the goals save path: ref, baseline, PATCH after `ensureDeck`, keepalive copy), `PATCH /api/decks/[id]` (the goals body), `deckMetaJson` (owner vs visitor wire), `forks.ts`.
- The route-test pattern: real drizzle builders over a fake postgres.js client answering positionally in `getTableColumns` order (a new column shifts nothing: the fixtures spread by name).
- Migrations `0017` (`decks.goals`) and `0019`: the generate → eyeball → the owner's yes → migrate → confirm → push order. Since LATER row 295 no production string exists on this machine; the production route is Neon's SQL editor in the built-in pane with the owner signed in, plus the `drizzle.__drizzle_migrations` row (hash = sha256 of the SQL file, `created_at` = the journal's `when`) so a later `db:migrate` never re-runs it.

## 3. Methods and tools

- **The pure module first, with table-driven Vitest:** stored rows win over derived; hidden keys drop out of the shown set and into the hidden-but-linked set only while linked; the leader zone's cards count as makers; a card in the token zone is never a maker; makers sort by name; a card with no links contributes nothing; normalization sorts and de-duplicates keys and turns `[]` into null.
- **Then the server loader** (`token-fill-load.ts`): one statement, by external key, game-scoped and `tokenSql`-guarded, no legality query, nothing asked when the list links nothing, the order the pure module gives.
- **Then the route and the wire:** `hiddenTokens` in the PATCH body (whole array; null or `[]` clears; 100 keys of 64 chars at most) writes `hidden_tokens` and nothing else; a meta key alongside still moves `updated_at`; the owner's `deckMetaJson` carries the keys, a visitor's never does.
- **Then the hook and the section:** `useTokenFill` replaces `useTokenSuggestions`; the section's `suggestions` prop becomes `fill` (items, hidden, count, state, retry, and the editor's `onHide` / `onShow`); the heading counts stored quantity plus derived tokens; the "N from your cards" hint goes (they're in the list); derived rows render under a "From your cards" eyebrow in text (name, caption, makers, Hide) and as tiles in grid; hidden chips under both; the share page passes the server's fill and, on the private gate's client path, computes it with the same hook.
- **Then the editor:** `hiddenRef` + baseline, `PATCH {hiddenTokens}` after `ensureDeck` in `save()`, the keepalive copy, the load from the owner's wire; no change to the create (a dismiss needs a derived token, which needs cards, which mint the row).
- **RTL through the pane** as the DECK-TOKENS tests do: the heading's count without a request, ONE resolve on open for shown and hidden keys, Hide → `onHide(key)`, the chip → `onShow`, the grid's derived tiles, the share page's read-only rows (no Hide), and the deck editor's PATCH shape.
- **Mutation checks:** delete the stored-wins filter, the hidden filter, the `tokenSql` guard, the `updated_at` rule, the owner-only wire — a test must fail for each.
- **Real runs:** `pnpm db:migrate` against the Neon `dev` branch; the dev server at `localhost:3000` in the built-in browser (a deck with Smothering Tithe and Elspeth: derived rows, Hide, reload, the share page); `pnpm check`; the production migration with the owner's yes; the push; Vercel's commit status; production read from outside.

## 4. What, other than you or me, shows it's right

- **Scryfall's link graph:** for any deck the derived set equals the union of `all_parts` token links over its playable cards, minus the keys it holds as rows and the keys hidden. The DECK-TOKENS cross-check against MTGJSON's precon box tokens (73 of 76) now describes what every precon share page shows.
- **The rules:** a deck with N derived tokens still reads "100 / 100"; `validate.test.ts` and `playable.test.ts` stay green and unmodified.
- **The database:** `hidden_tokens` is NULL on every row after the migration (0 bytes); a dismiss writes one array; `updated_at` is byte-identical before and after a hidden-only PATCH.
- **CI, Vercel's status on the full sha, the share page of a precon read from outside.**

## The rewritten prompt

**What it is.** The Tokens section lists, without a click, the tokens the deck's cards make — on the editor and on every share page, in text or grid — with the player's own token rows kept and in charge, a per-token Hide that persists on the deck and shows as a reversible chip, and nothing written to `deck_cards`.

**Size M.** One migration (`0020`, `decks.hidden_tokens text[]`, nullable), no dependency, no new route (the PATCH body grows one key).

**Pre-flight.**
1. Main green: `pnpm check` at `48859bc` (277 files, 2,959 tests). Working tree clean; stage explicit paths.
2. `.env.local` names the Neon `dev` branch; the migration runs there first.
3. Baseline: `pnpm build`'s route table.

**Scope fence.** Not here: quantities on derived rows (add the token to set one); a Hide control on grid tiles (text rows carry it); tokens in the decklist export/import (LATER row 324); precon box tokens that no card links (row 323's three); the editor's detail pane for a derived token beyond the preview it has.
