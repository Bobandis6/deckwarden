# BRACKET-UP session prompt: upgrade a deck toward a higher target bracket, Suggestions in, weakest cards out

*Status: **prompt written 2026-10-27**, at the owner's request. The owner asked "why cant the button show up if i want to upgrade a precon to bracket 4 and have the whole suggested list apear for the swap button", then approved the shape: "build an Upgrade toward Bracket N button for when the target is above what the cards show. The Suggestions list comes in, each card paired with the weakest card it replaces, in one review sheet with the check of the list after, the cost of the new cards, and one Undo." It is the upward twin of BRACKET-FIT (`BRACKET-FIT-session-prompt.md`), which only fixes cards above the target. Anchors verified against `a2224b4`; re-grep lines, trust the shapes.*

## The ask, deepened

The deck has a target above what its cards show: a precon that reads Bracket 2, aimed at Bracket 4. One button proposes the upgrade:

- **What comes in:** the deck's own Suggestions list, the same ranked list the Suggestions tab shows, asked with the deck's goals. Nothing above the target comes in, because the goals hide it.
- **What goes out:** each card coming in replaces the weakest card in its mana-value slot. This is the partner "Swap in…" already names: the Cut Coach's cheapest cut, never a combo piece, never the commander.
- **The review:** everything sits in one sheet. Each pair can be unchecked or given a different card to cut.
- **The check:** the bracket engine reads the list after the swaps and says what those cards prove.
- **The price:** what the new cards cost, leaving out cards the player owns. On a precon they own, that is their upgrade budget.
- **Apply:** one edit, one Undo. The deck keeps its size.

**Be honest about what can be proven.** The engine proves a floor: four or more Game Changers, mass land denial, a combo Commander Spellbook rates 4. Bracket 4 "Optimized" is also power the cards can't fully show, and no card list can prove 5 (cEDH is the player's call).

- The after-line says what the cards would prove, in the read's own words.
- It says "That's your target." only when the read reaches it. It never claims an upgrade the read doesn't show.
- If two cards coming in complete a combo above a target of 3, the after-line names that conflict the way BRACKET-FIT's does.

## What exists (verified)

- **The target block:** `TargetBlock` in `src/components/deck/bracket-sheet.tsx`.
  - "Above your target" lists `read.conflicts`. BRACKET-FIT's door, "Swap to fit Bracket N…", sits at its head and has shown whenever the box does since `a2224b4`.
  - When the target is above the cards, there is no box. TARGET-CHANGES' pick callout says "Nothing in the list puts the deck above it." and the bracket line reads "Your target: Bracket 4 · the cards say …".
  - The read's floor is `read.minimum`, and `read.suggested` when the player's answers raise it.
- **Suggestions:** `src/components/editor/recommendations-panel.tsx`.
  - Saved decks ask `GET /api/decks/[id]/recommendations`, which reads the saved row's list and goals. Drafts ask `POST /api/recommendations` with `snapshotBody(game, format, entries, budgetUsd?, suggestionGoals(goals))`.
  - The default limit is 25 (`DEFAULT_LIMIT`; `MAX_LIMIT` is 50). Goals are applied by `applyGoals`: with a target, every card above it is hidden.
  - Rows are `Recommendation`: id, name, type, cost, `cheapestUsd`, popularity, evidence, and `conflicts` beside them. They carry no card wire.
  - The POST's bucket is `recommendSnapshot`. The POST takes any snapshot, so it answers a saved deck's live list too, and the live goals; the GET would read a target the autosave may not have written yet.
- **Card wires:** `POST /api/cards/resolve` (`{game, format, names}` up to 400; bucket `cardResolve`, 20 a minute) returns CardWires with legality. The panel's add resolves one name and guards the id (`use-resolved-add.ts`).
- **The cut partner:** `planSwapIn` (`src/lib/recommend/swap-in.ts`; called in `SwapInSheet`, `swap-sheet.tsx`) takes the Cut Coach's input built from the editor's cards and the bracket facts (`completeCombosByCard(cutCombosFromFacts(combos, cards), ids)`). It returns the named `partner` (the cheapest ordinary cut in the incoming card's curve bucket, never a complete-combo piece) plus `sameBucket` and `others` in the Coach's order.
  - A card with no bucket (a land, no cost) gets no partner. The adapter's `swap.unmatched(card)` says why.
- **The precedent to copy:** BRACKET-FIT's `src/components/editor/target-fit-sheet.tsx` and `src/lib/brackets/target-fit.ts`.
  - The Fit shell: a Drawer on phones, the wide Modal from md.
  - The after-check: `useBracketFacts` on the after ids, then `assess` with the incoming wires.
  - The cost line: `costOf` and `fitCost` with the editor's `ownedSetForPricing`, a collection's identities plus an owned precon's.
  - In place: `fitList`, then ONE `applyListSwap`, "Swapped N cards" and one Undo, focus back on "Why?" (`focusBracketLine`).
  - Read both files' header comments first.

## Build

1. **The door.** Add a box to `TargetBlock`, shown when the target is set, nothing is above it, and the target is above `read.suggested ?? read.minimum`.
   - It states where the deck stands against the target, in the read's own level words. Suggested heading: "Below your target".
   - It holds one button, suggested "Upgrade toward Bracket 4…", passed in as `onUpgradeTarget` from the editor. The editor passes it only where the adapter declares `brackets`, `recommend` and `recommend.swap` (One Piece: none).
   - It closes the Why sheet like Swap to fit does, and focus returns to "Why?". Words go in `BRACKET_COPY` under U9's policy; the copy guard stays green.
2. **A pure planner in core** (e.g. `src/lib/brackets/target-up.ts`). It takes the ranked Suggestions rows and the editor's list, cards and combo facts, and pairs each incoming card, in rank order, with a card going out.
   - The partner comes from `planSwapIn`: the named `partner`, then `sameBucket` in order.
   - Partners are never the commander, a complete-combo piece, a card coming in, or a card already taken by an earlier pair.
   - A card left with no partner (a land, an exhausted bucket) comes back unpaired with its reason (`swap.unmatched` for a land).
   - The player's overrides win: uncheck a pair, or pick a different card to cut from the bucket then the rest. No card is cut twice.
   - Unit tests, including distinct partners and override precedence.
3. **The sheet:** `src/components/editor/target-up-sheet.tsx`, dialog slot `"target-up"`, the Fit shell.
   - **Asks:**
     - ONE `POST /api/recommendations` with the live snapshot and the deck's goals as Suggestions send them. Use the deck's per-card budget goal as the default budget, and the panel's limit (25).
     - ONE `/api/cards/resolve` for the incoming names, with the id guard: a name that resolves to another id drops its row.
     - A 429 says so, with Try again. Nothing is asked before the sheet opens, and nothing is written before Swap.
   - **Review:** rows in Suggestions' order. Each row shows the card coming in (name, price, its first evidence line as Suggestions show it) and the card going out with a chooser, plus a checkbox. Rows with a partner start checked (the owner: "the Suggestions list comes in"); unpaired rows start unchecked and say why.
   - **After-check:** the list after the checked swaps goes to `useBracketFacts`, then `assess`. The footer says what the cards would prove, "That's your target." only when it does, and names any factor that would put the deck above the target.
   - **The cost of the new cards:** BRACKET-FIT's line and owned set.
   - **Swap:** `fitList` in place, then ONE `applyListSwap` ("Swapped N cards") with one Undo.
4. **Nothing else moves:** the read, `assessBracket`, the routes (no new route; the POST's doc comment gains this caller), the Suggestions tab, Swap to fit.

## Must hold

- **The cuts:** never the commander, a land (unless the player picks one for an unpaired land), a complete-combo piece, a card coming in, or one card twice.
- **The list:** the size never changes, untouched rows keep their printing and tags, and one Undo restores the list byte for byte.
- **The target:** nothing above it comes in (the goals hide it), and the after-check names any cross-card combo above it.
- **Writes:** opening, asking and reviewing write nothing; on a draft, the apply mints exactly one row carrying the target.
- **Scope:** no new route, no migration, no new dependency. The route table stays byte-identical.
- **The corpus:** a read-only script in `scripts/.tmp/` (`guardDatabaseUrl` first, a read-only transaction, the dev branch) covering every precon whose read is below targets 3 and 4.
  - It runs the real Suggestions engine in process with the precon's snapshot and the target goals, pairs with `planSwapIn`, applies, and runs `assess` with `loadCompleteCombos`.
  - Report how many reach the target's floor at 3 and at 4.
  - Report that none goes above a target of 3 (or name each that does and why), and confirm distinct partners and no commander, land or combo cut.
- **Copy, layout, game:**
  - copy in `BRACKET_COPY` under U9's policy;
  - 320 px with no sideways scroll, 44 px targets under touch;
  - One Piece shows no door.

## Out of scope (LATER, rows with triggers)

- Ranking the incoming cards by power instead of Suggestions' order.
- Adding without cutting on a draft under its size.
- Upgrading the mana base (lands in and out).
- More than the panel's 25.
- A total upgrade budget cap; the per-card budget goal already filters Suggestions.

## Done

- **Tests:**
  - Unit tests for the planner.
  - RTL:
    - the door's presence (target above the cards) and absence (no target, conflicts, answers already at the target, One Piece);
    - the two asks and a 429;
    - the review: uncheck, choose another cut, an unpaired land;
    - the after-line's cases over mocked facts;
    - Swap calling `applyListSwap` once, Undo, and focus.
- **Checks:** the corpus numbers in the ship note; `pnpm check` green; the pane at 320 and 1280 px; the iOS Simulator.
- **Ship:** deployed, and read from production.
