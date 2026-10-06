# Y6a session prompt — Goals in Suggestions (`applyGoals` after ranking, "N hidden by your goals · Show", impact flags, the saved budget, the goals line)

Pull latest, then run Y6a, the ninth Wave-4 package and the first after the announce point. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**: the decisions-table row on recommendations ("one pure **`applyGoals`** step after ranking (rank all → goals → slice) covering **all four** card rules plus budget. Conflicts are never evidence and never score; hidden cards are counted; with no target, each card shows its **bracket impact**").
2. **D0**: copy rules (plain words, no notation — D7's own "Bracket 4+" and "Bracket 3+" lines need rewording, see below), attribution, adapter gating (One Piece: a budget at most, never a bracket flag).
3. **D7** in full (Y6a's half: `applyGoals`, the plumbing, the lines, Suggestions).
4. The **Y6a** block in section E, its pin-matrix row, the **F** row "Cards over the target in Suggestions" (hidden, with "N hidden by your goals · Show"), and **Verification (whole wave)**.
5. REDESIGN.md's **"Y4b decisions"** (goals.ts, the budget accepted and stored owner-only, goals' own PATCH that never moves `updated_at`) and **"Y5 decisions"** (the table's voice, `tableGoals`).
6. LATER row **175** (a list that has found nothing yet offers no "Why?", so no target — "Y6a's goals line atop Suggestions … is the natural door"). It fires in this package.
7. Y5's ship note at the top of `Y5-session-prompt.md`.

Y6a makes Suggestions respect the deck's target and budget by default and say what they hid:
- **`applyGoals`** (new, `src/lib/recommend/goals.ts`, pure): `applyGoals(ranked, goals, read, meta) → {kept, flagged, hidden}`. A recommendation gains `conflicts[]` (`{rule, source, why, severity: hide | flag}`), kept apart from evidence and never part of the score. The engine ranks every candidate, applies goals, then slices to the limit.
- **The plumbing**: the adapter declares its flag paths the way `RecommendMeta.exclude` declares `jsonbPath`, so core never names `game_changer`. The flags ride `CANDIDATE_PROJECTION`, `loadEntryFacts` and `loadDeckEntries`. `CandidateCombo` gains the Spellbook tag, `relevant`, the piece count and whether a leader is a piece.
- **The panel**: "N hidden by your goals · Show"; a flag per row with no target ("would make this deck at least Bracket 3 — a Game Changer"); one goals line atop Suggestions and the Why sheet ("Bracket 2 · ≤ $5 a card · Change"); the budget starting from the deck's goal, with "Save as this deck's budget"; Suggestions adds toasting "Added X · Undo"; draft Suggestions (Y2b's POST) carrying goals.

**No migration and no new route** (the routes' bodies and queries grow). The route table must be byte-identical. One Piece gets the budget only.

Pre-flight, in order.
1. **Y5 has shipped.** `WAVE4.md`'s tracker ticks Y5 (feat `16ee2ab`); `_journal.json`'s last entry is idx 17.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`).
   - A red ingest is P4.7 branch F and preempts everything. A red ruleset watch means the Game Changers changed: move the pin first (`bracket-ruleset.ts`); LATER row 174 fires if the ruleset `version` moves.
   - `stats.tagger.counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** Y5 was the announce point and the owner planned the r/EDH post (P2.9 round 3) right after it. **Ask first whether it went out and what came back.** If it did:
   - run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned);
   - and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**, for:
   - read-only database access (the census, `pnpm db:size`, the counters, the recommend routes' measured statements);
   - that the dev pass and the smokes write through the dev server (dev shares prod's database; `smoke:recommend` and `smoke:combos` mint and delete their own QA decks; read the deck-create counters first);
   - and say up front that the owner's click comes at the end (signed in, prod: "Save as this deck's budget").
5. **Working tree clean**, at or after Y5's docs commit. Another session may share this working copy: stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **empty**.
   - `pnpm check` on `16ee2ab`: 1,673 tests / 175 files / 6 warnings / 0 errors.
   - `pnpm db:size`: 285.1 MB on 2026-10-06.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); 1 deck with goals (the owner's target 3 on Nelson & Murdock), 0 with a budget.
   - **The recommend routes' `DB_LOG` statement counts** (the saved deck's GET and the draft POST), before any change.

## What Y6a is NOT (scope fence)

- NOT Autofill or the Combo Radar (Y6b: the caps, skips and badges). NOT Swap Lab or "Swap…" (Y7a/Y7b). NOT the total budget's "Fit my budget" (Y8). The budget controls here are the per-card tier, with "Save as this deck's budget".
- NOT a change to the bracket engine, the ruleset, the facts route, or the goals shape and its PATCH. A bug found in them gets a red pin first and is disclosed; anything wider goes to LATER.
- NOT tournament reweighting at low targets (WAVE4 F: LATER).
- NOT a stored read on tiles (WAVE4 F).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-06 against `16ee2ab`; re-grep lines and trust the shapes; some files hold a NUL byte, so use `grep -a`)

- **An RTL file for `RecommendationsPanel` already exists**, contrary to WAVE4 E's "none exist". It is `src/components/editor/recommendations-panel.test.tsx`, with one describe, "a draft (Y2b)", at 93 and seven tests:
  - the draft POST, tab gating, the budget pick re-asking in USD;
  - no leader, waiting for autosave;
  - the GET takeover after the row mints, and the 429.

  Nothing covers the Add flow, the evidence rendering or the saved deck's states: step (1) extends this file rather than creating one.
- **`recommendations-panel.tsx`** (427 lines):
  - Props `RecommendationsPanelProps` at 54–69: `adapter, format, deckId, entries, inDeckQty, saveStatus, active, onAdd, ownedAvailable?`. No goals prop.
  - Budget: local `useState<BudgetTier>("all")` at 88, never persisted; the `Segmented` at 188; it is in the fetch key at 102.
  - Requests: the GET sets `budget` (139); the draft POST's `snapshotBody` sends `Number(budget)` or nothing (105–118). The fetch effect is at 120–167, gated on `active && leader && saveStatus === "saved"`.
  - States: no leader (177–183), error / 429 (150–151, 241–252), waiting (253–259), empty (260–267), the list (268–283).
  - `SuggestionRow` at 308–427: the evidence grammar is 365–412; WAVE4's "260–279" moved there. `ConfidenceChip` at 290, `sourceMeta` at 304.
  - Add: `useResolvedAdd` (`use-resolved-add.ts`) sets an inline "Added X" notice (57–58). There is no toast and no Undo.
- **The editor** (`deck-editor.tsx`, 1,970 lines):
  - The panel is rendered at 1688–1698, inside `TabsContent value="suggest" keepMounted`.
  - `goals` state at 315 reaches only `BracketSheet` (1886–1887). `handleGoalsChange` (1381–1388) sets the ref and the state, then `markDirty()`.
  - `handlePanelAdd` (1153–1163) is a plain `applyEdit(addCard(…))` with no `notify`.
  - The local `notify(title, undo)` is at 1023–1036 (`toast.add` with an Undo action, `TOAST_MS = 5000` at 196); `handleAdd`'s "Added …" Undo is at 1094–1096, Y2a's removal Undo at 1199.
- **`src/lib/recommend/queries.ts`** (WAVE4's lines still exact): `CANDIDATE_PROJECTION` 106–114 (`id, name, primaryType, costValue, ciMask, cheapestUsd, popularity`); `loadEntryFacts` 265–298; `loadDeckEntries` 332–348 (no zone, no attrs).
  - The `exclude` filter is applied at 78–84 through `JSONB_KEY_RE` (58). Its type is `RecommendMeta.exclude` at `types.ts:476`; MTG's value is at `mtg/recommend.ts:337` (pinned in `recommend.test.ts:88`).
- **Combo types**: neither `CandidateCombo` (`src/lib/recommend/types.ts:61–68`, built in `loadComboSignals`, queries.ts 156–175) nor `DeckComboView` (`src/lib/combos/queries.ts:159–176`) carries the tag, `relevant` or a leader flag. `loadCompleteCombos` (295–329) already selects `bracketTag` / `relevant`, so copy its columns.
- **Ranking and limits**:
  - `rankCandidates` at `rank.ts:144`; the cut is `return ranked.slice(0, limit)` at 258. `COMBO_EVIDENCE_CAP = 3` at 47.
  - `engine.ts`: `DEFAULT_LIMIT = 25` (46), `MAX_LIMIT = 50` (47), `POOL_LIMIT = 300` (49). `recommendForSnapshot` (177) clamps at 184 and ranks at 200–211; `recommendForDeck` (214).
  - **So "rank all → goals → slice"** means `rankCandidates` must stop slicing, or take the goals step inside. Pin the order.
- **The routes**:
  - **GET** `src/app/api/decks/[id]/recommendations/route.ts`: force-dynamic + no-store (20–23); `QUERY` zod `budget, limit, owned` (39–45); bucket `recommendations` 30/min.
  - **POST** `src/app/api/recommendations/route.ts`: force-dynamic + no-store (24–27); `BODY` `game, format, leaderIds, entries, budget?` (44–54); bucket `recommendSnapshot` 30/min + 200/hour.
  - The GET can read the deck's goals from the row it already loads. The POST's body must carry a draft's goals, zod-checked through `goalsSchema(adapter.brackets)`.
- **Budget**: `budget.ts` has `BudgetTier = "all" | "5" | "1"` (9), `BUDGET_OPTIONS` (11–15), and an inclusive `withinBudget` (18–22; unpriced fails a tier). `goals.ts`: `DeckBudget {perCardUsd?, totalUsd?}` (37–41), with `perCardUsd` restricted to 5 / 1. **Nothing reads `goals.budget` yet.**
- **The read's levels** (`bracket-ruleset.ts` 57–103; level · gameChangers · landDenial · extraTurns · twoCardCombos):
  - 1 · 0 · no · none · none
  - 2 · 0 · no · few · none
  - 3 · 3 · no · few · late
  - 4 · any · yes · any · any
  - 5 · any · yes · any · any

  `brackets.ts` derives: `gameChangerLevel(n)` (122), `LAND_DENIAL_LEVEL` 4, `EXTRA_TURN_LEVEL` 2, `CHAINED_TURNS_LEVEL` 4, `TWO_CARD_LEVEL` 3, and `TAG_LEVEL` (103). The attrs it reads: `game_changer`, `mld` ("clear" | "edge"), `extra_turn`. `applyGoals` should take these from the adapter (a `brackets.impact(card, read, …)` or a declared rules table), never re-derive them in core.
- **D7's lines carry notation D0 forbids**: "Bracket 4+" and "Bracket 3+". Reword them as the line does ("at least Bracket 4"), keep them adapter data, and pin them with the copy guard.
- **Smokes**:
  - `scripts/recommend-smoke.ts` (510 lines): the evidence contract (165–205), Y2b's snapshot equals the GET (283), the Radar (332–398), Topdeck (405–490). WAVE4's pin-matrix lines 378 / 387 moved to **449 / 458** (the `why` and `howOften` regexes).
  - `scripts/combos-smoke.ts`: 117 and 154 unchanged.
  - `rank.test.ts` (26 tests) and `cuts.test.ts` (22) must stay green.
- **LATER row 175** (line 175) fires: the goals line is the door to setting a target before the list has found anything.

## Verify-first list (never from memory)

1. **The order**: a Vitest fixture where the top 25 by score are all over-target. With goals they're hidden and counted, and 25 others still come back: rank all → goals → slice, never slice → goals.
2. **WAVE4 E's acceptance**: at budget All and target 2, every Game Changer, land-denial card, second extra-turn card and above-target combo completion is hidden and counted. With no target, impact flags only (nothing hidden).
3. **Conflicts never score**: the same candidates rank identically with and without goals (scores and evidence byte-equal), and `conflicts[]` never enters `evidence[]`.
4. **The budget**: the panel starts from `goals.budget.perCardUsd`; "Save as this deck's budget" sends one goals PATCH with `updated_at` unchanged. A draft's save mints the row the way a target does (Y4b) — decide and pin.
5. **Drafts**: the POST carries goals; a seeded draft still sends zero POSTs to `/api/decks` before an edit (Y2b's pins).
6. **One Piece**: budget only; no bracket flag, no hidden count from brackets.
7. **The statements**: the GET's and the POST's `DB_LOG` counts before and after (the projections widen; expect no new statement).

## Design decisions to make explicitly (disclose + pin each)

- **Where the read comes from on the server.** `applyGoals` needs the deck's minimum (a Game Changer over the allowance depends on the current count). Options: assess on the server inside the recommend route (the facts loaders are two statements, the Y5 page's pattern), or compute per-card impacts without a full read. Measure before choosing.
- **"A second extra-turn card"** with a target of 2–3: hide (D7) vs flag. Y3b made chaining a question.
- **Combo completions above the target**: a combo whose tag alone puts the deck above the target. Decide how a template combo (a question, never counted) is treated.
- **Show**: does "Show" reveal hidden rows inline with their conflict lines, and does it persist per deck or per session?
- **Undo toasts** for Suggestions adds: reuse the editor's `notify` through `onAdd`'s return, so `useResolvedAdd`'s inline notice either goes or stays as the live line.
- **The goals line's "Change"**: it opens the Why sheet at Your target (the existing dialog). Decide what the line says with no target and no budget, since that is row 175's door.
- **The saved budget's control**: the tier `Segmented` plus a link-button "Save as this deck's budget" that shows only when the pick differs from the saved goal.

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table is unchanged.
- WAVE4 E's acceptance fixture pinned; the rank → goals → slice order pinned; scores untouched by goals.
- **The dev pass**: 390 / 768 / 1200 / 1440 in both themes on a Magic deck with a target 2, with no target, and a One Piece deck. `smoke:recommend` and `smoke:combos` green on dev (read the deck-create counters first; delete QA decks with their tokens and re-prove the census).
- **The owner's click, signed in on prod**: on Nelson & Murdock (target 3), Suggestions shows the goals line and any hidden count. Pick ≤ $5 a card, then "Save as this deck's budget"; a reload keeps it.

Docs in the same package:
- the `WAVE4.md` tracker ticked, with the sha and the deviations, and its status line pointing at Y6b;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains "Y6a decisions";
- LATER rows (175 resolved or annotated);
- memory updated;
- **`Y6b-session-prompt.md` written** the way this one was: Autofill's caps and skips with goals, the staple lock off at targets ≤ 3, the target and budget in the POST's zod body, fixed-seed shells byte-identical with goals absent, and the Radar's one badge per row (it never filters).

State `pnpm db:size` before and after. Nothing posted, and nothing seeded on prod.

## Session notes (environment)

Unchanged from `Y5-session-prompt.md`'s "Session notes": PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y5.ts`, `counters-y5.ts`, `y5-plans.ts` are there to copy), `dev-log` for `DB_LOG`, and the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup.
- **New in Y5:** a guest deck's owner view can be exercised in the pane by putting its claim token in localStorage (`deckwarden:deck-token:<id>`). Delete the deck and the key afterwards.
- **New in Y5:** dev StrictMode doubles every client GET (the first is aborted, status 0).
