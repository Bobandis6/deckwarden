# BRACKET-UP session prompt: upgrade a deck toward a higher target bracket, Suggestions in, weakest cards out

*Status: **shipped 2026-10-27** as `c02f08c` plus the integration fixes `6fe41a0` and `1d8930c` (Vercel's production status success at 14:15:51 Z; CI run 40519320083 green), at the owner's request. The owner asked "why cant the button show up if i want to upgrade a precon to bracket 4 and have the whole suggested list apear for the swap button", then approved the shape: "build an Upgrade toward Bracket N button for when the target is above what the cards show. The Suggestions list comes in, each card paired with the weakest card it replaces, in one review sheet with the check of the list after, the cost of the new cards, and one Undo." It is the upward twin of BRACKET-FIT (`BRACKET-FIT-session-prompt.md`), which only fixes cards above the target. Built by a worktree subagent from this prompt and reviewed line by line. Deviations, recorded in REDESIGN.md's BRACKET-UP section: the other-cost fallback with the weaker-half rule, judged defaults, the door's gate on the floor's band with a sentence for an open call. Anchors verified against `a2224b4`; re-grep lines, trust the shapes.*

## Ship note (2026-10-27)

- **Commits:** `c02f08c` (the feat, built by a worktree subagent from this prompt, reviewed line by line), `6fe41a0` (integration: the door asks the read's bands, so a list read "1 to 2" meets a target of 2; the plan cuts on its own only from the deck's weaker half by the Cut Coach, since Breed Lethality's upgrade at 4 had cut Sol Ring for Carrion Feeder; the lead says what the other-cost fallback does) and `1d8930c` (integration, a second pass: the gate is the band the floor is in, so an open call no longer hides the door, as it had on 17 of the 181 dev precons below 4, and the box says an answer under Your call can raise the read; no box for a read that names no level; the price line groups thousands). Pushed as `a2224b4..1d8930c`.
- **Checks:** `pnpm check`: 3,254 tests in 291 files, 0 errors, the same 6 lint warnings. The production build at `6fe41a0` has a route table byte-identical to `a2224b4`'s (83 lines), and `1d8930c` touches no route. Client chunks grew about 6.3 KiB gzipped (734,575 to 741,056 bytes over every chunk). CI run 40519320083 green.
- **The corpus** (`scripts/.tmp/up-corpus.ts`, read-only on the dev branch, at the shipped gate): the door shows on 151 dev precons at target 3 and 179 at 4 (the other two below each are blocked by a card the format doesn't allow; an open call on 6 and 17 of those shown, counted by `scripts/.tmp/up-gate.ts`). At 3, 149 reach Bracket 3 after 23.3 swaps on average and none goes above it (with every row checked, 83 would have; the judge leaves 1.4 rows unchecked on average), and the two Breed Lethality precons stay at 2. At 4, 112 reach Bracket 4 after 24.7 swaps, and the other 67 show at least 3 and say so. Every cut is distinct and never a commander, land, combo piece or one of EDHREC's top 100 (the metric added for the Sol Ring case); no list changed size or land count; 88% of pairs at 3 and 83% at 4 cut a card at another cost, and the nonland average mana value fell about 1.1. The cards coming in averaged $1,504.71 at 3 and $1,704.13 at 4 (no budget goal, cheapest printings, nothing owned).
- **On dev, in the pane:** Breed Lethality shows no box at target 2 (it reads "1 to 2"); at 4 its sheet held 25 rows (no cut is Sol Ring), "After these swaps, the cards show at least Bracket 4 (Optimized). That's your target." with two fast combos, $153.47, and Swap made one edit ("Swapped 25 cards · Undo", still 100 cards) that Undo restored. Goblin Storm ("Bracket 3 or 4 · one combo is your call") at 4: the box with "An answer under Your call can raise it.", and a sheet that reached 4 in 24 swaps through a Mycosynth Lattice and Vandalblast combo for $1,853.32. Party Time ("Bracket 1 to 2 or 4 · one card is your call"): no box at 2; at 4 "Nothing in this list raises the bracket unless an answer under Your call does."; its call answered No leaves "The cards and your answers say Bracket 1 (Exhibition)." with the door. At 320 px nothing overflowed and the door, the checks, every chooser and Swap measured 44 px under touch.
- **In the iOS Simulator** (iPhone 15, Mobile Safari, the dev server): Breed Lethality at 4, the box, the sheet (25 rows, "That's your target.", $153.47, "Swap 25 cards") and iOS's own grouped picker for the cut chooser, closed with nothing changed.
- **Production, read from outside:** Vercel's production status success at 14:15:51 Z on 2026-10-27. The editor's chunk carries "Upgrade toward", "Below your target", "Brings in your Suggestions", "can raise it", "unless an answer under" and the grouped price; `/precons` and `/brackets` still answer `x-nextjs-prerender: 1` (PRERENDER).
- **Left for the owner:** set a target above one of your own decks on deckwarden.gg (a precon you start from, at 3 or 4) and press Upgrade toward. The QA minted decks on the dev branch only.

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
