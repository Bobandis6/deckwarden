# TARGET-CHANGES session prompt: say what setting a target changed, when it happens

*Status: **shipped 2026-10-24** as `089f7b0` (CI run 40159941173 green; Vercel's production status success at 03:55:14 Z on 2026-10-25), written and executed in the same session at the owner's request ("when you set a target bracket the changes that it makes pops up and tells you what it auto changed"), deployed together with HEADER-SEARCH (`5028baa`). Two deviations, recorded in REDESIGN.md's TARGET-CHANGES section: the tools are named as the editor shows them ("Alternatives", "the Combos tab"), and the count says "things", the word the conflict callout already uses. Anchors verified against `6ade698`; re-grep lines, trust the shapes.*

## Ship note (2026-10-24)

- **One feat commit**, `089f7b0`: the pure module, the callout, the copy, tests, this file, REDESIGN.md's section and LATER row 335. Built by a subagent in its own worktree from this prompt, reviewed line by line, then two copy changes at integration (the tool names on screen, "things" for the count). `pnpm check` on its tree: 3,028 tests in 280 files, 0 errors, 6 lint warnings (the 5 tracked ones and the shared checkout's untracked `scripts/.tmp/measure-corpus.ts`).
- **On dev, in the pane** (the precon draft Abzan Armor, at least Bracket 3 with one Game Changer): set 2 ("1 thing in the list puts the deck above it", the five rows of Bracket 2), changed to 4 ("Nothing in the list puts the deck above it (before, 1 did)", the five rows that differ), Undo back to 2 with focus on "2" and the row holding `{targetLevel: 2}`, cleared, set 1 at 375 and 320 px (no sideways scroll, Undo and Dismiss 44 by 44 under touch), and 1 to 3 in the light theme (four rows; mass land denial, the same at both, left out).
- **In the iOS Simulator** (iPhone 15, Mobile Safari, the dev server): the Why sheet's Drawer scrolled the new callout into view under the choice, which stayed on screen, and Undo put Not set back.
- **Production, read from outside:** the editor's chunk carries the callout's words ("Your cards didn't change.", "Combos tab"). No target was set on production: on a draft that mints a deck, and production writes are the owner's call.
- **Left for the owner:** set a target on one of your own decks on deckwarden.gg and read the callout. The QA minted two guest decks on the dev branch (one in the pane, one in the simulator), none on production.

## The ask, deepened

When the owner sets, changes or clears a deck's bracket target, tell them right there, at once, exactly what that did. Start with what it did not do: change their cards. A target never edits the list. It changes what the tools offer and what the deck says to others, and the popup says exactly which.

## What exists (verified)

- The one control: `TargetBlock` in `src/components/deck/bracket-sheet.tsx`, a `Segmented` (1 to 5, Not set) calling `onGoalsChange(withTarget(goals, level))`. The editor's `handleGoalsChange` (`deck-editor.tsx`) stores the goals and marks the deck dirty; autosave sends the goals PATCH, which never moves `updated_at`. The read is re-assessed on the client in the same render (`bracketRead`'s memo takes `goals.targetLevel`), so the sheet re-renders with the new read at once. The sheet opens from the bracket line's "Why?", from the Suggestions goals line ("Set one", "Change": `openAt: "target"`), and from the Share dialog's Declare.
- What a target changes. Traced through every reader of `targetLevel`; none of them writes `deck_cards`:
  1. The read names the findings above the target: `read.conflicts` (factor ids), shown as "Above your target" with Swap… buttons.
  2. The bracket line's words ("Your target: Bracket 2 · the cards say at least 3").
  3. Suggestions: `applyGoals` (`src/lib/recommend/goals.ts`) hides each card above the target. With none, it only flags what would raise the line. Server-side, after the save settles ("N hidden by your goals · Show").
  4. Autofill: the `shellGoals` gate over the adapter's `impact`, plus the "Skipped N…" notes.
  5. Swap Lab, and the Budget Twin that asks it: alternatives under the same goals (`suggestionGoals`).
  6. The Combo Radar: `comboBadge` and "above your target".
  7. Where others see it: the share page ("Played as Bracket 2 (Core)"), the deck's tile wherever it's listed, its link previews (unless private), and the Share dialog's preview line. `BRACKET_COPY.targetShown(previews)` already says this for the sheet.
- What each level allows: `brackets.guide?.levels[].rows` (Magic: Game Changers, mass land denial, extra turns, two-card combos, turns), taken straight from the reviewed ruleset table (`mtgGuideLevels`).
- Which tools a game has: `adapter.recommend` (Suggestions), `adapter.recommend?.autofill`, `adapter.recommend?.swap` (Swap Lab), `adapter.capabilities.combos` (Combo Radar). Check the exact fields in `src/lib/games/types.ts`.
- Copy: every word lives in `BRACKET_COPY` (`src/lib/brackets/copy.ts`) or the adapter; `copy.test.ts` guards it. U9's copy policy: periods, colons, commas and parentheses for asides, "to" for ranges, no em-dash asides, no multi-dot lines, a control after a gap with an underline.

## Build

1. **A pure core function** (e.g. `src/lib/brackets/target-change.ts`). Its inputs: the brackets meta, the tools the adapter declares, the old and new targets, the new read, how many findings were above the old target, and whether link previews show the deck. Its output: a structured change — the title's kind (set, changed, cleared), the above-target count now and before, the guide rows whose value differs between the two levels (all of the new level's rows when there was no target, none when it's cleared), the tools that follow the target, and the "where it shows" flag. Unit tests.
2. **The callout in `TargetBlock`.** When the owner picks a level, it pops in under the `Segmented` (U2's `dw-in` tokens; reduced motion respected) and says:
   - The title: "Target set: Bracket 3 (Upgraded)", "Target changed from Bracket 2 to Bracket 3", or "Target cleared".
   - **"Your cards didn't change."** Always, and first.
   - The list against the new target: above it (with the count of findings, pointing at Above your target below) or nothing above it, and what it was before when that moved.
   - What the new level allows, old to new, from the adapter's guide rows (only the rows that differ): "Game Changers: Up to three (was None)".
   - Which tools follow it, naming only what the adapter declares: Suggestions, Autofill and Swap Lab leave out cards above it, and the Combo Radar marks combos above it. Cleared: they stop leaving cards out for a target.
   - Where it shows now, by the same rule as `targetShown` (link previews only when the deck isn't private).
   - **Undo**, which puts the previous target back through `withTarget(current goals, previous)` so answers and exceptions are untouched, and a dismiss button.
   It stays until dismissed, replaced by the next pick, or the sheet closes. It announces politely (a short `role="status"` summary, not the whole block) and never takes focus from the `Segmented`. Picking the level that's already set does nothing.
3. **Nothing else moves:** not the read, not `assessBracket`, not the goals shape, the PATCH, the routes or the share page.

## Must hold

- Truth: the callout's count is `read.conflicts.length` of the read the sheet renders, tested against the real `assess` on fixture lists at every level. The allowance rows are the adapter's, verbatim. No tool is named that the adapter doesn't declare.
- One Piece declares no brackets, so it gets no target and no callout (unchanged).
- The copy guard stays green; every new string is in `BRACKET_COPY`.
- Phone (Drawer) and md and up (Modal): the callout fits 320 px with no sideways scroll.

## Out of scope (LATER)

- The number of Suggestions the target hides. It needs the server's answer after the save, and Suggestions already says "N hidden by your goals". A row in case the owner wants it in the popup.
- A toast, or a second dialog over the sheet.

## Done

Unit tests for the pure function. RTL in `bracket-sheet.test.tsx`: the set, changed and cleared wording; Undo calling `onGoalsChange` with the previous target; the same level doing nothing; the status role; a private deck's wording; tools filtered by the adapter. `pnpm check` green, checked in the pane at phone and desktop widths in both themes, deployed, and read from production.
