# BRACKET-FIT session prompt: one button that swaps a built deck down to its target bracket

*Status: **shipped 2026-10-24** as `21031c3` plus the integration fix `f0cd153` (Vercel's production status success at 05:39:37 Z on 2026-10-25; CI run 40166283543 green), at the owner's request ("once you set a target bracket after your deck is built can we have a button to swap all the suggested cards all at once to make it that desired bracket"), asked for "deeper, not bigger". Built beside PRECON-OWNED (`PRECON-OWNED-session-prompt.md`), each in its own worktree, and pushed together (`befa351..f0cd153`). Deviations, recorded in REDESIGN.md's BRACKET-FIT section: an exact search replaces the greedy alone, a card answered with no option is never a candidate, "Coming in for X." sits on its own line. Anchors verified against `befa351`; re-grep lines, trust the shapes.*

## Ship note (2026-10-24)

- **Commits:** `21031c3` (the feat, built by a worktree subagent from this prompt, reviewed line by line, picked onto PRECON-OWNED with one conflict in deck-editor.tsx's header comment) and `f0cd153` (integration: the polite status says a whole sentence for a miss, "After these swaps, 2 things still put the deck above Bracket 2."). At integration the sheet's cost line was wired to the editor's `ownedSetForPricing`, so a card the owned precon holds costs nothing.
- **Checks:** `pnpm check` on the integrated tree: 3,192 tests in 287 files, 0 errors, the same 6 lint warnings. The route table of `f0cd153`'s build is byte-identical to `5c3815f`'s (83 lines). Client chunks grew about 11.4 KiB gzipped with PRECON-OWNED (722,563 to 734,214 bytes over every chunk).
- **The corpus** (the subagent's read-only script on the dev branch): the planner equals brute force on 4,000 generated instances (the greedy alone missed 5) and on 211 dev decks at targets 1 to 3; through the real Swap Lab, 19 of the 29 precons past Bracket 2 fit at target 2, every miss a card with no Swap Lab role or a land, and none of the 21 incoming cards is a Game Changer (our flags, and Scryfall's live `is:gamechanger`: 53 cards).
- **On dev, in the pane:** Everyone's Invited! at target 2 (7 conflicts) planned 4 swaps for $8.23 and named Arcane Adaptation (no roles) and The World Tree (a land) under "What swaps can't fix", the after-check quoting that combo; Swap made one PUT and the ownership line went from "missing ≈ $67" to "missing ≈ $8". Peer Through Time fit with one swap (Cyclonic Rift for Ugin's Binding, $0.78), "nothing in the list puts the deck above Bracket 2", and Undo restored the list. At 320 px nothing in the Drawer overflowed; the door, every option row and Swap measured 44 px under touch.
- **In the iOS Simulator** (iPhone 15, Mobile Safari, the dev server): Timey-Wimey, target 2, the door opened the Drawer sheet (Farewell for Austere Command, $0.33, "nothing in the list puts the deck above Bracket 2"), Swap 1 card, and the line read "Your target: Bracket 2 · the cards say at least 2" with "Swapped 1 card · Undo".
- **Production, read from outside:** the editor's chunks carry "Swap to fit", "After these swaps" and "things still put"; `/precons` and `/brackets` still answer `x-nextjs-prerender: 1` (PRERENDER).
- **Left for the owner:** set a target below one of your own decks on deckwarden.gg and press Swap to fit; and one call, LATER row 338: when a fix can't be fully met, the sheet still swaps what it can and names the rest (say if you'd rather it swap nothing then). The QA minted guest decks on the dev branch only.

## The ask, deepened

A deck has a target, and the cards put it above that target. One button proposes the **fewest** swaps that bring the deck to the target. Each card that goes out is replaced by one that does the same job, judged in that card's place under the target. The swaps are shown for review. The bracket engine checks the list after the swaps and says the deck fits only when it does. Then the swaps apply as one edit with one Undo. The deck keeps its size: this swaps cards, it never just cuts them. Anything it can't fix, it names.

"All the suggested cards" is the owner's picture of the conflict callout: a Swap… button on every card a finding names. Swapping every one of them is usually more than the target needs, and every extra swap changes the player's deck for nothing. The callout's own lines already say the minimum: "Remove 2 of them to fit Bracket 3", "Remove A or B to fit Bracket 2". Build that minimum.

## What exists (verified)

- **The door's home:** `TargetBlock` in `src/components/deck/bracket-sheet.tsx`. "Above your target" lists `read.conflicts` (factor ids above the target), each factor with its `sentence`, its `change`, and one "Swap {card}…" per card the editor can swap. That is `canSwap`: a main-list card the adapter `offers` alternatives for, so never the commander or a land. `onSwapCard` reaches the editor's `swapFromCallout`, which calls `openSwap(card, "callout")`: the Why sheet closes, the swap sheet opens, and focus comes back to "Why?" through `focusBracketLine` / `closeFocusRef`.
- **Magic's findings** (`src/lib/games/mtg/brackets.ts`, `assessBracket`). Levels come from `bracket-ruleset.ts`. Game Changers allowed: 0 at Brackets 1 and 2, 3 at Bracket 3, any number from 4. Mass land denial is first allowed at 4. Extra turns first at 2; chaining them at 4. Two-card combos first at 3 (late only).
  - `game-changers`: `atLeast` is the lowest level allowing the count. Its `cards` are the Game Changers.
  - `land-denial`: the "clear" mass land denial cards, at least Bracket 4.
  - `extra-turns`: at least Bracket 2.
  - `combo:<key>`: one complete combo. `readCombo` sets its level. Its `cards` are the pieces, and the commander is known from the leader zone. Its `change` is "Remove {one of the non-commander pieces} to fit…", or null when every piece is a commander.
  - Conflicts exist only at targets 1 to 3: no factor reads above 4.
- **Swap Lab:** `POST /api/alternatives` (`src/app/api/alternatives/route.ts`, `src/lib/recommend/alternatives.ts`).
  - Body: Swap Lab's snapshot (`snapshotBody`) plus `cardId`. Goals go as `suggestionGoals(goals)`, the target included.
  - Every candidate is judged in the card's place (`withoutOneCopy`). `applyGoals` (`src/lib/recommend/goals.ts`) **hides** each candidate whose `impact` is above the target: a Game Changer over the allowance, mass land denial, an extra-turn card at 1, a combo it would complete above the target, or a question it would open above it.
  - Each row carries its `CardWire` (legality included), its `shared` roles and `cheapestUsd`. `reason` says why a list is empty: `no-roles`, `not-offered`, `goals` or `none`.
  - Rate bucket `alternatives`: 30 a minute and 200 an hour per IP.
- **The precedent to copy is Budget Twin (Y8):**
  - `src/lib/recommend/fit.ts` (pure): `fitConsidered`, `fitOptions`, `planFit` (the player's picks first, an alternative never twice), `fitList` (in place through `swapCard`), `FIT_COPY`.
  - `src/components/editor/fit-sheet.tsx`: asks `FIT_BATCH` (3) at a time and at most `FIT_ASK_LIMIT` (9) per open; a 429 stops it and Try again resumes; a `settledRef` makes it StrictMode-safe; closing aborts. Rows have a checkbox plus radio options with "Both: <roles>" and the price. The footer has a sentence and "Swap N cards".
  - The editor's `handleFitApply` lands in ONE `applyListSwap` (toast "Swapped N cards" and one Undo for the batch), in dialog slot `"fit"`. Read both files' header comments before writing code.
- **The after-list's facts** need no new route. `GET /api/combos/complete` (`factsPath(game, ids)`, at most 200 ids, bucket `comboFacts`, an hour at the edge) answers any id set, and `useBracketFacts` (`src/components/deck/use-bracket-facts.ts`) wraps it with a 500 ms settle. `adapter.brackets.assess` is client-safe; the editor runs it in a memo.
- **Copy:** every bracket word lives in `BRACKET_COPY` (`src/lib/brackets/copy.ts`), guarded by `copy.test.ts`. U9's policy: periods, colons, commas and parentheses for asides, "to" for ranges, no em-dash asides, no multi-dot lines, and a control after a gap gets an underline.

## Build

1. **The adapter says what each conflict needs out of the list.** This is the one new declaration, because core never names a rule. Add `BracketsMeta.fixes?(read, input): BracketFix[]` in `src/lib/games/types.ts`, where `BracketFix = { factor: string; remove: number; from: string[] }` means "at least `remove` copies of the cards in `from` must leave". `from` never holds a commander. Magic's version, pure, beside `assessBracket`:
   - `game-changers`: the count minus the target's allowance, of the Game Changers.
   - `land-denial`: every clear copy.
   - `extra-turns`: every copy (target 1).
   - `combo:<key>`: 1 of the non-commander pieces, or `from: []` when every piece is a commander.

   Pin it against the real `assess` on fixture lists at targets 1, 2 and 3: removing any `remove` cards of `from`, for every fix together, leaves `conflicts` empty, and removing one fewer from any fix leaves that factor in.
2. **A pure planner in core** (e.g. `src/lib/brackets/target-fit.ts`; not `recommend/fit.ts`, which is the budget's). Its inputs:
   - the fixes and the list's entries;
   - a `swappable(cardId)`: main zone, the adapter's `offers`, and at least one of the adapter's roles read off the card's attrs, the way `fitConsidered` does it (a card the route would answer `no-roles` is never asked about);
   - the route's answered rows per card, filtered like `fitOptions` minus the price rule (the first `FIT_OPTIONS`, none hidden);
   - the player's overrides: which card goes for a fix, which option comes in, keep this one.

   Its outputs: the cards out, each with the fixes it serves and its pick; the next cards to ask about; and the fixes left unmet, each with its reason (commander only, lands only, no role data yet, no alternative under your target, or not asked yet).

   The choice is a small set multicover:
   - Fixes whose `remove` equals their swappable `from` take every card.
   - Then, repeatedly, the swappable card that serves the most unmet need. A Game Changer that is also a combo piece counts twice.
   - Ties go to a card known to have options, then one not asked yet, then one asked with none. Then the card whose first option shares the most roles. Then name order, so the plan is deterministic.
   - A card asked with no options is replaced by another card from the same fix when one exists ("Remove A or B": A has none, so B goes).
   - No incoming card is picked twice.

   Unit tests, plus a **brute-force check**: on generated instances and on the fixtures, the planner's count equals the exact minimum over every subset.
3. **The sheet:** `src/components/editor/target-fit-sheet.tsx`, dialog slot `"target-fit"`. It's a bottom Drawer on phones and the wide Modal from md, using the Fit sheet's shell.
   - **The door** is one button at the head of the conflict callout, only when the editor hands the Why sheet `onFitTarget` (the adapter declares `fixes` and `recommend.swap`) and some fix has a swappable card. Suggested words: "Swap to fit Bracket 2…". It closes the Why sheet the way Swap… does, and focus comes back to "Why?" when the fit sheet closes. The per-card Swap… buttons stay.
   - **Asking** follows the planner's order: 3 at a time, at most 9 per open unless you measure and justify more against the bucket. When the plan needs more, the sheet says how many it didn't ask about. A 429 stops it and says so, Try again resumes, and closing aborts. Nothing is asked until the sheet opens.
   - **Review:** rows grouped under each conflict's sentence. Each card going out gets swap or keep, its one to three options with what they share and their price (each card's cheapest printing, as Fit shows it), and, for a "1 of N" fix, a way to swap another piece instead. The unmet fixes come last, in plain words, naming their cards.
   - **The after-check, the proof inside the product:** the list after the checked swaps goes to `useBracketFacts` for its id set (the hook, unchanged). Then `assess` runs with the editor's cards plus the incoming wires, those combos, the editor's freshness, the target and the answers.
     - The footer says "After these swaps, nothing in the list puts the deck above Bracket 2." only when that read's `conflicts` are empty.
     - Otherwise it names what still does, in the read's own sentences.
     - "Checking…" shows while the facts are on their way, and a facts failure is said plainly.
     - Swap stays the player's decision. Never claim a fit the read didn't make.
   - **The price of the change:** the footer also says what the incoming cards cost, counting only cards the player doesn't own. The `owned` set comes in as a prop, exactly like FitSheet's: the collection's today, and PRECON-OWNED widens what the editor passes.
4. **Apply:** `fitList`-style in place (reuse it, don't fork it). ONE `applyListSwap(next, wires, "Swapped N cards")`, focus on "Why?", and the toast's Undo restores the exact list. Nothing is written before Swap; on a draft, the apply mints exactly one row, as Fit's does.

## Must hold

- **Fewest swaps:** the planner's count equals brute force on every instance tested, and on the corpus below.
- **The engine agrees.** Write a read-only corpus script in `scripts/.tmp/` (`guardDatabaseUrl` first, a read-only transaction, the dev branch only):
  - (a) Every precon and every user deck on the dev branch at targets 1, 2 and 3: fixes from the real read, stand-in replacements without flags. `assess` on the after-list leaves no conflict except the unmet fixes, each named with its kind. The swap count matches brute force. Report the counts per target.
  - (b) The precons past Bracket 2 (29 at BRACKETS-PAGE's count), at target 2: run Swap Lab's real `alternativesForSnapshot` in process (no HTTP, no bucket) through the real planner, then `loadCompleteCombos` on the after ids and `assess`. Report how many fit and why each miss missed.
  - (c) None of the replacements is a Game Changer. Check our flags, then check the union of replacements against Scryfall's live `is:gamechanger` search (a real `User-Agent` and `Accept: application/json`).
- Never touches the commander, a land, a token or an untouched row (its printing and tags stay). The size never changes.
- Opening, asking and reviewing write nothing. Swap is one edit, and Undo restores the list byte for byte.
- No new route (the route table byte-identical), no migration, no new dependency.
- One Piece declares no brackets, so there's no door. Nothing changes on the share page.
- Every new string is in `BRACKET_COPY`; the copy guard stays green.
- 320 px with no sideways scroll; 44 px targets under touch; focus returns where stated; reduced motion respected.

## Out of scope (LATER, rows with triggers)

- Cutting without a replacement, swapping the commander, and swapping lands: the fix stays named instead.
- A target that only the player's own answers put the deck above (`suggested`, not `conflicts`). The callout doesn't list those today.
- A server-side planner route, if the client's asks prove too slow or too many.

## Done

- Unit tests: `fixes` pinned against `assess`, and the planner including the brute-force check.
- RTL:
  - the door's presence and absence (no conflicts, nothing swappable, the share page, One Piece);
  - the ask order and cap, a 429 and Try again;
  - review: keep, choose another option, swap another piece;
  - the after-line for a fit and for a miss, over mocked facts;
  - Apply calling `applyListSwap` once with the right entries and wires, Undo, and focus.
- The corpus numbers in the ship note. `pnpm check` green. The route table diffed. The pane at 320, 390, 768 and 1280 in both themes; the iOS Simulator. Deployed, and read from production: the chunk carries the door's words.
- Owed by the owner: setting a target on one of their own decks above it, and pressing the button.
