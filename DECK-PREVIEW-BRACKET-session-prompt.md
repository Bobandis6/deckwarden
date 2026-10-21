# DECK-PREVIEW-BRACKET session prompt — the declared bracket, offered where the owner shares

*Status: not run yet.* Written 2026-10-21 at GATE 2 of the DECKCHECK study (`DECKCHECK-STUDY.md` §2.4). Anchors verified against `25a75c9`; re-grep lines, trust the shapes. Add a dated ship note at the top of this file when the package ships.

**What it is, and what it was going to be.** The study proposed putting the computed bracket line on the deck share image. Mapping the code showed that would reverse the owner's own decision of 2026-09-30 (`WAVE4.md:35`: "deck tiles and link unfurls show the declared bracket only"), which `src/lib/og/labels.test.ts:55-71` enforces ("the deck unfurl never computes a read"). Asked at GATE 2 on 2026-10-21, **the owner kept the decision**. So this package does the honest version: link previews already say "Bracket 3 (declared)" when the owner has declared a target (Y5); most decks never get one, because the target lives inside the bracket sheet. This package **offers the declaration where the owner shares**: the Share dialog says what the link preview will show about the bracket and opens the sheet at "Your target" in one step. The unfurl, its data read and its guard test do not change.

**Size S.** No migration, no route, no dependency, no URL, no nav label; the OG route untouched. Touches `src/components/editor/share-dialog.tsx`, the editor's wiring of it, their tests, and copy.

Pre-flight, in order.
1. **Main is green.** `pnpm check` = 2,734 tests / 264 files / the same 6 warnings at `25a75c9`.
2. **Nightlies green**; **a warm beta signal outranks a package**; **working tree clean** (stage explicit paths; re-read `LATER.md` and `MEMORY.md` before editing them).
3. **Measure the gap first** (a read-only script on the Neon `dev` branch, both guards): Magic decks by visibility (public, unlisted) with and without `goals.targetLevel`, account and guest separately, precons excluded. That number is the package's "before"; if almost every shared deck already declares, say so and ask the owner whether to stop.
4. **Baseline**: `pnpm build`'s route table (the diff at the end must be empty); the Share dialog on dev for a Magic deck with a target, without one, and a One Piece deck (before captures).

## What this package is NOT (scope fence)

- NOT the unfurl: `src/app/(site)/d/[publicId]/opengraph-image.tsx`, `src/lib/og/data.ts` and `src/lib/og/labels.ts` stay byte-identical, and so does the guard test. The image keeps reading `goalsTargetLevel` off its one deck select (`data.ts:45-56`; the declared kicker at `opengraph-image.tsx:90-95`, words from `mtgDeclared`, `labels.ts:32-34`, equal to core's `declaredLabel`, `src/lib/brackets/copy.ts:136`).
- NOT the tiles (they show the declared bracket the same way, Y5) and NOT the share page.
- NOT a computed suggestion pushed into the target: the owner chooses; the sheet's "Your target" already shows the read beside the choice.
- NOT a promise that an already-posted preview changes: Discord, Slack and the rest cache unfurls, and the image URL (`/d/<id>/opengraph-image-<hash>?<build hash>`) does not change when a target does. The copy must not imply otherwise.
- NOT One Piece (no brackets): the line is absent there.
- Anything else → `LATER.md` with a trigger.

## Facts you inherit

- **The Share dialog** (`src/components/editor/share-dialog.tsx`): owner-only, opened from the editor header; props `publicId`, `visibility`, `accountDeck`, `onSetVisibility`, `onClose` (`:41-49`); Y1's rule that every line says what is true today (the docblock, `:3-12`); Copy link with `CopyStatus` (`:118`); a private deck's line (`:127`). Its tests: `share-dialog.test.tsx` (`:41-86`: the visibility lines, the PATCH callback, Copy link's status, a refused clipboard).
- **The editor's wiring**: `{dialog === "share" && share && <ShareDialog … />}` (`src/components/editor/deck-editor.tsx:2433-2441`); the bracket sheet opened at Your target by `openGoals` (`:1565-1569`: `setDialogFromMenu(false); setSheetAt("target"); setDialog("bracket")`, Y6a), the sheet's `openAt={sheetAt}` (`:2454`) focusing the target's choice (`bracket-sheet.tsx:26-42`, `:134-146`). One dialog at a time: the Share dialog closes as the sheet opens; decide whether closing the sheet returns to the Share dialog (it should not trap focus; say what you chose).
- **The target**: `decks.goals.targetLevel` (`src/lib/decks/goals.ts:106`; `withTarget` `:166`), saved by `PATCH {goals}` (`src/app/api/decks/[id]/route.ts:81-92`; it never moves `updated_at`), set in the sheet's "Your target" (`Segmented` 1 to 5 and Not set).
- **What the unfurl says**: with a target, a second kicker line "Bracket N (declared)" (Magic only); without one, nothing about the bracket. The study's reading of a local preview: `.claude/deckcheck-study-evidence/deck-images/og-6umpm3aqmryk.jpg` (no target).
- **Copy rules**: zero em or en dashes, at most one middle dot a line (`WAVE5.md:178`); Y1's honest labels (every line true today); the copy guards in `src/lib/brackets/copy.test.ts:30-68` (add the new strings).

## The design (decide and disclose the details)

1. **One line in the Share dialog, Magic decks only, below the link**: with a target, what the preview says ("Link previews say Bracket 3 (declared).") and a quiet "Change"; without one, that previews show no bracket and a "Declare a bracket" action. Both actions call a new optional prop (e.g. `onDeclareBracket`) that the editor wires to `openGoals`. The words reuse `declaredLabel` so the dialog and the image can never disagree; pin that equality as `labels.test.ts` pins the image's.
2. **The editor passes** `targetLevel` (from `goals`) and the adapter's bracket noun; One Piece passes nothing and the line is absent.
3. **Nothing else moves**: the visibility lines, Copy link and the private line keep their pins.

## Tests and checks

- `share-dialog.test.tsx`: the line with a target (the declared words, equal to `declaredLabel`), without one, absent for One Piece and when no callback is passed; the action calls the callback once; the existing five tests untouched.
- `deck-editor` wiring: the action closes the Share dialog and opens the sheet with focus on Your target's choice (the Y6a path; jsdom drives Base UI focus).
- `labels.test.ts`'s guard and `og/data.test.ts`'s statement pins unchanged (they prove the unfurl did not move).
- The copy guard over the new strings; Lighthouse a11y on the editor's Share dialog (snapshot mode) unchanged.
- On dev in Chrome for Testing: declare a target from the Share dialog on a throwaway guest deck (a state-only precon draft that you save, then delete) and confirm the local preview image now carries "Bracket N (declared)" (the route is rate-limited per address: two renders are fine); `pnpm build` with an empty route-table diff; `pnpm check`.
- After the deploy: the measurement from pre-flight step 3 is the "before"; LATER row with the trigger to re-count after a month of real shares.

## LATER rows this package opens

- The share page's owner row (Y5: Open in editor, Copy, Share…) offering the same declaration (trigger: the dialog line is used and owners ask for it on the share page).
- A re-count of declared targets on shared decks (trigger: a month after the deploy).

## Session notes

- The measuring browser is Chrome for Testing through the chrome-devtools MCP; the throwaway QA page and fetch-shim recipe for signed-in views is `signed-in-pane-harness` in memory; never `cd`; helpers as `*.js.txt`.
- The deck preview's bucket is 60 per minute and 600 per hour per address (`src/lib/rate-limit.ts:129-132`); a dev render loop can hit it.
