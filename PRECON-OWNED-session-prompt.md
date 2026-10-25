# PRECON-OWNED session prompt: "Do you own this precon?", and a price that counts only what you'd buy

*Status: **prompt written 2026-10-24**, at the owner's request ("if you are starting from a precon it asks Do you own this deck? so that it can calculate the price once you make changes and it would minus the cost since you own the whole precon"), asked for "deeper, not bigger". It runs beside BRACKET-FIT (`BRACKET-FIT-session-prompt.md`), each in its own worktree. **Migration `0021`**: eyeball it before it touches any database. Apply it to the Neon dev branch for QA. Production gets it through Neon's SQL editor, before the push, and only with the owner's yes. Anchors verified against `befa351`; re-grep lines, trust the shapes.*

## The ask, deepened

A deck that starts from a precon asks once, in one line: do you own this precon? A yes makes the precon's own cards count as owned at $0, in the precon's own quantities, everywhere this deck's price is read. The price you see is then what your changes cost: the cards you added that the box didn't have. The answer belongs to the owner. It's private, it can be changed, and it's saved with the deck, guests included (guest decks are server-side rows).

Three things the ask doesn't say, which a professional would get right:

- **Quantities are the precon's.** A precon with 12 Forests doesn't make 14 free.
- **The deck has to remember which precon it came from.** Today the precon draft forgets at its first save: the create carries the name only. So the question could never come back or be changed.
- **A card you cut and later add back is still in the box,** so it still counts as owned.

## What exists (verified)

- **Two doors start a deck from a precon.**
  - The share page's "Start from this precon" opens `/decks/new?game=mtg&from=<slug>` (W8b). The editor's seeder (`deck-editor.tsx`, `draftFromSlug`) fetches `GET /api/precons/[slug]`: `{precon, deck, cards}` with each card's `qty` and printing. It seeds state only: no row exists until the first real edit, and `ensureDeck`'s create POST sends `{game, format, name, goals?, website}`.
  - Fork (`src/lib/decks/forks.ts`, `forkDeck`, signed in only) sets `forked_from_deck_id` to the precon's deck row.
  - Precons are `decks.kind = 'precon'` rows with `precon_products` (slug, product name; `PRECON_SLUG_RE` in `src/lib/decks/precon-info.ts`). `loadPreconBySlug` reads them.
- **The price math today** is one pure function, `deckOwnership` (`src/lib/collection/ownership.ts`):
  - Owned is per identity (any printing; quantities not checked: LATER row 66).
  - "Missing ≈ $Y" is Σ qty × the identity's `cheapest_usd`. Unpriced cards are counted beside the sum, never as $0.
  - Three readers use it:
    - `ownershipLine` ("You own 63/100 · missing ≈ $412"), in `deck-list-pane.tsx`'s header row, rendered only with a collection;
    - `deckEstimate` (`src/lib/recommend/fit.ts`), which feeds the goals line's total ("est. $212 of your $150") and the Fit sheet;
    - the Fit sheet itself, where cards you own count as $0 and stay ("Cards you own count as $0 and stay.").
  - The owned set comes from `GET /api/decks/[id]`'s `owned` + `hasCollection` (`deckOwnedForViewer`), plus a debounced `POST /api/collection/owned` for cards added mid-session. Collections are account-only.
- **The precon's own price:** the share page's "est. price today" (`preconPrices` in `deck-share-view.tsx`) and `/precons`' `estUsd`. Both are cheapest-printing sums.
- **The precedent for a new deck column** is TOKEN-FILL's `decks.hidden_tokens` (migration `0020`):
  - one nullable column with its own PATCH body, which never moves `updated_at`;
  - owner-only in `deckMetaJson` (`src/lib/decks/serialize.ts`);
  - never copied on fork, not versioned;
  - in the editor, a `lastSavedRef` baseline plus a patch body diffed by autosave;
  - production migration through Neon's SQL editor, before the push.

## Build

1. **Migration `0021`.** Generate it with `pnpm db:generate` from `src/db/schema.ts`. It must be exactly two nullable columns on `decks` and one foreign key, nothing else:
   - `precon_deck_id uuid`, referencing `decks(id)` `ON DELETE SET NULL`: the precon this deck's list started from;
   - `owns_precon boolean`: the owner's answer (NULL = not asked yet).

   Print the SQL in your report. Apply it to the dev branch (`pnpm db:migrate`; `.env.local` names it, and the guard refuses production) only after reading it. Also check that `detachForksAndDeleteDecks` and the anon purge still delete cleanly with the new key (the SET NULL handles precon rows).
2. **Lineage, set once, server-side:**
   - The create POST takes `fromPrecon` (a slug, `PRECON_SLUG_RE`). The server resolves it through `precon_products`, refuses a mismatched game or format (400), and stores the deck row's id. It also takes `ownsPrecon` when the draft was answered before it minted.
   - `forkDeck` sets `precon_deck_id = upstream.id` when the upstream is a precon. A fork of a user's deck inherits nothing.
   - The seeder's draft sends `fromPrecon` with its first create, whatever edit mints it, so the question survives the mint.
3. **The answer:** PATCH `{ownsPrecon: boolean | null}` as its own key, which never moves `updated_at`. It answers 400 on a deck without `precon_deck_id`. Owner only.
4. **The owner's read:** `GET /api/decks/[id]` carries `precon: { slug, name, owns, cards: [{cardId, qty}] }` for the owner when `precon_deck_id` is set. That's one indexed read of the precon's counted cards. A visitor's wire never carries it. A draft takes the same shape from the seeder's own answer, with no second request.
5. **The math:** `deckOwnership(entries, cards, owned, format, ownedCopies?)`.
   - `ownedCopies` is the precon's quantity per identity. Copies up to it count as owned, and the rest are missing. The collection's identity rule still covers every copy of a card it holds.
   - `deckEstimate` passes it through.
   - The ownership line renders with a collection OR an owned precon. Its method text (`OWNERSHIP_METHOD`) gains the precon's rule in a sentence.
   - The owned set the editor hands the Fit sheet, and BRACKET-FIT's sheet, becomes the collection's identities plus the precon's.
6. **The question, in the editor, owner only:** one line in the deck pane, arriving with the list so nothing shifts (measure layout shift on a precon draft).
   - Unanswered: the precon's name and "Do you own it?" with Yes and No.
   - Answered: a quiet line saying which precon, with a way to change the answer.
   - On a draft, an answer is a real edit, and the row mints with it (the Y4b rule for a target).
   - The words live in one table (a new copy constant beside ownership.ts, or `BRACKET_COPY`'s pattern), under U9's policy. On touch, 44 px targets.
7. **Nothing else moves:** the share page (it shows the visitor's own collection line), the precon pages, the bracket read, versions.

## Must hold

- **The quantities are exact:**
  - the unchanged precon answered Yes reads "You own 100/100 · nothing missing";
  - 14 Forests from a 12-Forest precon cost two Forests;
  - a card cut and re-added counts as owned again;
  - the commander counts like any precon card.
- **The numbers agree with Scryfall:**
  - after swapping in three cards, "missing ≈ $X" equals Σ of those identities' `cheapest_usd`;
  - check those three against Scryfall's API (each card's printings, the lowest `prices.usd`) with a real `User-Agent` and `Accept: application/json`, allowing for the nightly's lag;
  - the unchanged precon answered No matches its page's "est. price today".
- **Private:** visitors' wires never carry `precon_deck_id`, `owns_precon` or the precon's cards. Forks never copy the answer.
- **The draft contract:** opening a precon draft writes nothing (its zero-POST pins hold), and the answer mints exactly one row. No localStorage holds the answer.
- **Eyeballed:** the migration SQL is in the report before any database sees it. The route table is unchanged; this package adds no route.
- **Layout:** no sideways scroll at 320 px, signed out (guest) or in. The deck pane's U3a slots don't shift (measured).

## Out of scope (LATER, rows with triggers)

- The share page saying the owner owns the precon.
- Quantity-aware collection ownership (row 66 keeps it).
- "Changes since the precon" (an upstream diff for precon-started decks).
- More than one precon per deck.
- The resale value of cut cards.

## Done

- Unit tests: `deckOwnership` with copies, and the estimate.
- Route tests:
  - create with `fromPrecon` (valid; unknown → 400; mismatched game → 400);
  - PATCH `ownsPrecon` (owner; no lineage → 400; `updated_at` unmoved);
  - GET for the owner vs. a visitor;
  - fork of a precon sets lineage, fork of a user's deck doesn't.
- RTL: the question's three states, Yes then Change, a draft minting once with `fromPrecon` + `ownsPrecon` in the create body, and the ownership line appearing without a collection.
- `pnpm smoke:decks` (or a new smoke) against a local server proves the create → GET → PATCH → visitor-GET chain on the dev branch.
- `pnpm check` green.
- The pane at 320, 390, 768 and 1280 in both themes: a precon draft, Yes, swap two cards, read the line.
- Deployed after the owner's production-migration yes, and read from production.
