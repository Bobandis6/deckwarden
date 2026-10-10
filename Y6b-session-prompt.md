# Y6b session prompt — Goals in Autofill + the Radar (caps and skips with the target, the staple lock off at targets ≤ 3, the goals in the POST's body, fixed-seed shells byte-identical without goals, one badge per Radar row, the Radar's Undo)

Pull latest, then run Y6b, the tenth Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**: the decisions-table row on recommendations ("one pure `applyGoals` step after ranking … covering all four card rules plus budget. Conflicts are never evidence and never score").
2. **D0**: copy rules (plain words, no notation — D7's Radar badge "Bracket 4+" needs rewording, as Y6a reworded its lines), attribution (the badge credits Commander Spellbook), adapter gating (One Piece: no autofill, no badges).
3. **D7** in full (Y6b's half: "Autofill and the Radar (Y6b)").
4. The **Y6b** block in section E, its pin-matrix row, the **F** row "Autofill at targets ≤ 3" (the measured-staple lock tier off; weights unchanged), and **Verification (whole wave)**.
5. REDESIGN.md's **"Y6a decisions"** (rank all → goals → slice, the adapter's `impact` and `flagPaths`, the server-side read, what hides with a target, the budget as a flag).
6. LATER row **179** (the Combo Radar's adds have no Undo toast). It fires in this package.
7. Y6a's ship note at the top of `Y6a-session-prompt.md`.

Y6b makes a starter shell built for a target stay inside it, and gives each Radar row its weight:
- **Autofill** (`POST /api/decks/autofill`, the planner, the sheet): the Game Changer cap (0 at targets 1–2; 3 minus the deck's current count at 3), land denial skipped at targets ≤ 3, extra-turn cards capped (0 at 1; 1 at 2–3), above-target combo completions skipped, and the measured-staple lock tier off at targets ≤ 3. The target and the budget join the POST's zod body. New notes are pinned like today's. **With goals absent, fixed-seed shells stay byte-identical.** Goals filter before sampling, never through `Math.random`.
- **The Combo Radar**: one badge per row in our words ("This combo alone makes a deck at least Bracket 4 — Commander Spellbook"), plus "above your target" when it is. It never filters: its contract is exhaustive up to the disclosed cap, and the Cut Coach reads the same `inDeck` list.
- **LATER row 179**: the Radar's adds toast "Added X · Undo" — one card, and a combo's pieces with one Undo for the batch.

**No migration and no new route** (the autofill route's body and its reads grow). The route table must be byte-identical. One Piece answers 400 to autofill already and shows no badge.

Pre-flight, in order.
1. **Y6a has shipped.** `WAVE4.md`'s tracker ticks Y6a (feat `fb435ec`); `_journal.json`'s last entry is idx 17.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`).
   - A red ingest is P4.7 branch F and preempts everything. A red ruleset watch means the Game Changers changed: move the pin first (`bracket-ruleset.ts`); LATER row 174 fires if the ruleset `version` moves.
   - `stats.tagger.counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** The r/EDH post (P2.9 round 3) hadn't gone out when Y6a started. **Ask first whether it went out and what came back.** If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**, for:
   - read-only database access (the census, `pnpm db:size`, the counters, the autofill route's measured statements);
   - that the dev pass and the smokes write through the dev server (dev shares prod's database; `smoke:autofill` and `smoke:combos` write nothing, `smoke:recommend` mints and deletes its two QA decks, a goals edit in a dev draft mints one; read the deck-create counters first);
   - and say up front that the owner's click comes at the end (signed in, prod — below). Also ask whether Y6a's owed click ("Save as this deck's budget" on Nelson & Murdock) was done: it may have put a budget on that deck.
5. **Working tree clean**, at or after Y6a's docs commit. Another session may share this working copy: stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **empty**.
   - `pnpm check` on `fb435ec`: 1,786 tests / 179 files / 6 warnings / 0 errors.
   - `pnpm db:size`: 285.7 MB on 2026-10-10.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); 1 deck with goals (Nelson & Murdock, target 3), 0 with a budget — unless the owner's Y6a click saved one.
   - **The autofill route's `DB_LOG` statement count** (a precon's keep list, warm), before any change.
   - **A fixed-seed golden**: before touching anything, record `smoke:autofill`'s seed-1,234,567 Atraxa shell on dev (picks `[cardId, qty]`, groups, notes, totals) to a scratchpad JSON — the live half of "byte-identical with goals absent".

## What Y6b is NOT (scope fence)

- NOT Swap Lab or "Swap…" (Y7a/Y7b). NOT the total budget or "Fit my budget" (Y8).
- NOT a change to the bracket engine (`assessBracket`), the ruleset, the facts route, the goals shape and its PATCH, or Y6a's Suggestions behavior (`applyGoals`). A bug found in them gets a red pin first and is disclosed; anything wider goes to LATER.
- NOT tournament reweighting at low targets (WAVE4 F: LATER). The F row turns the lock tier off at ≤ 3 and leaves the weights alone.
- NOT a Radar filter: badges only, membership unchanged.
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-10 against `fb435ec`; re-grep lines and trust the shapes; `autofill-sheet.tsx`, `autofill/route.ts` and `decks/cards.ts` hold a NUL byte, so use `grep -a`)

- **The autofill route** (`src/app/api/decks/autofill/route.ts`, 299 lines):
  - `BODY` at 46–67: `game, format, leaderIds, keep[{cardId, zone, qty}] (≤ 500), budgetUsd?, seed?`. No goals.
  - **`loadEntryFacts(GAME_ID[game], ids)` at 107 passes no `flagPaths`**, and the snapshot's entries (119–130) carry no `zone` or `facts`, so Y6a's engine `readable()` would be false: no read today. The draft Suggestions route passes them (`src/app/api/recommendations/route.ts` ~91).
  - `seed = parsed.data.seed ?? Math.floor(Math.random() * 2 ** 31)` at 131 — the only random source.
  - Two `gatherSignals` (136–151): curve (`scope op ne`, `maxPriceUsd: budgetUsd`) and base (`includeCombos: false`). `gatherSignals` already selects `flags` and `externalKey` on every candidate (Y6a); its `combosTruncated` is ignored here.
  - `rankCandidates` with `limit: candidates.length` (166–183); the base pool never carries combo signals.
  - `buildShell` (188–211; `comboCandidateIds` from the curve gather's one-away scan), fillers (214–259), `finishShell(draft, fillerPicks, {zone, budgetUsd})` (261), validation (265–283), the response `{game, format, seed, picks, groups, notes, totals, issues, cards}` (285–298).
  - Bucket `deck-autofill` 20/min + 200/hour. **No route test exists** — `src/app/api/recommendations/route.test.ts` is the mocked-IO precedent.
- **The planner** (`src/lib/recommend/autofill.ts`, 389 lines, pure):
  - `buildShell` 167–322: pool bucketing 204–209 (**the deterministic place to pre-filter**), `pickFromBucket` 216–261 — tier A locked (235–241), tier B combo (242–249, `COMBO_PICK_CAP = 6`), tier C sampled (250–259: a score-ordered window `slice(0, ceil(left * SAMPLE_WINDOW))`, then `sampleWeighted`). The base (lands) loop 301–319 — lands can be Game Changers or land denial too.
  - `isLocked` 143–153 (`lockShare`, `lockMinLists`), called at 238, 295, 298 and 312.
  - **`sampleWeighted` (`rng.ts` 24–38) consumes exactly one `rand()` per item, in input order**: any change to a window's membership shifts the RNG stream for every later bucket. So with goals absent nothing upstream of the windows may change, and a running cap applied after a batch sample would need a re-sample (another stream). Decide where caps apply.
  - Notes only in `finishShell` 349–359: `FULL_NOTE` (29), `shortfallNote` (30–40, budget and plain variants).
- **`autofill.test.ts`** (311 lines): **no golden pin exists** — "same seed → identical picks; another seed → different picks" (195–202) compares two runs of the current code. The `rec()` fixture (50–67) takes ids from a module-global counter, so ids depend on test order. "Byte-identical with goals absent" needs a NEW golden pin written **before** the change (a fixed fixture with literal ids, its seed-42 shell's picks recorded from `fb435ec`).
- **The sheet** (`src/components/editor/autofill-sheet.tsx`, 676 lines): props 89–110 (no goals); **budget `useState<BudgetTier>("all")` at 129** (Suggestions start from the goal via `tierOf`); the body 160–168 (no seed; `budgetUsd` spread only when not All); notes render 355–360, keyed by their text. Pins: **187–212 `toEqual` on the exact body** (goal fields must be spread only when present, as `snapshotBody` does) and 263–279 (budget chips; no seed).
- **The editor** (`deck-editor.tsx`): `<AutofillSheet>` ~1857–1873 and `<ComboRadarPanel>` ~1739–1750 get no goals; the Radar's `onAdd` is `handlePanelAdd`; `handleSuggestionAdd` (~1173–1186) is Y6a's Undo-toast precedent; `bracketRead` (~1562–1576) is the client read (its factors carry each complete combo's `atLeast`, keyed by `combo`).
- **The Radar** (`src/components/editor/combo-radar-panel.tsx`, 655 lines): `RadarData` is typed on `DeckComboView`, which carries `tag` and `relevant` since Y6a (unread). The deck fetch 234–263 (`/api/decks/[id]/combos`). **Commander rows come from `/api/cards/[id]/combos`** (`ComboView` — no tag or relevant; a public, edge-cached route). The single add is `useResolvedAdd(adapter, format, onAdd)` at 128 (announces inline); the batch `addComboPieces` 200–232 toasts "Added N combo pieces" (219–222). Rows: `InDeckComboRow` 558–595 (its complete/incomplete pill 577–585 is the badge's neighbor), `OneAwayComboRow` 597–655, `LeaderComboRow` 518–556; the footer's "Scan capped at the most popular matches for this deck." at 433. Pins: `combo-radar-panel.test.tsx` 125 ("Showing the 1 most popular of 7."), 144 ("Added 2 combo pieces"), the X3 fixtures 199–220 (tags E and R), 265.
- **The combos route** (`src/app/api/decks/[id]/combos/route.ts`): `{deckId, inDeck, oneAway, truncated, tournaments}` of `DeckComboView` (no piece count, no leader flag — only `CandidateCombo` has those); no read, no goals; force-dynamic + no-store; bucket `deckCombos` 30/min. `requireReadableDeck` already loads the row (goals included). The Cut Coach reads `inDeck` (`cut-coach-panel.tsx` ~97; `cuts.ts` 178–186).
- **`smoke:autofill`** (`scripts/autofill-smoke.ts`): "no notes on a clean fill" (139 — a goals note must never appear without goals), "same seed → identical picks" (141–146, live), the $1 budget case (152–165), Kinnan's locked tier (167–174). No goal cases. `smoke:combos` never hits the Radar route; the Radar wire (tag + relevant) is checked in `smoke:recommend`.
- **`mtgAutofill`** (`src/lib/games/mtg/recommend.ts` 101–146): `lockShare: TOURNAMENT_STAPLE_SHARE` (0.5) at 142, `lockMinLists: 5` at 143; no note strings in the adapter (notes are core's). `AutofillMeta` at `types.ts` ~336–385.
- **Copy guards**: the autofill notes have none (exact-text pins only, `autofill.test.ts` 280–311), and `shortfallNote` prints curve labels like "Mana value 7+", so a `/\d\+/` guard can't run over shortfall notes — guard the new goals notes only. Every new `BRACKET_COPY` builder joins `copy.test.ts`'s `BUILDERS`.
- **Y6a's pieces to reuse**: `mtgBracketImpact` (`brackets.ts` ~944–1072) judges one card against a list — a running cap can feed it the list grown by the picks so far. `engine.ts`' `readCard`, `readable` and `goalsRead` are module-private (export or move them to share with the autofill route). `TAG_LEVEL`, `TAG_UP_TO` and `readCombo` are private in `brackets.ts`: **no exported per-combo reading exists** for a Radar badge.

## Verify-first list (never from memory)

1. **Byte-identical with goals absent**: the new golden pin (Vitest, literal ids, written first and green on `fb435ec`) and the live seed-1,234,567 shell JSON compared before and after.
2. **Caps count the picks so far**: at target 3 with no Game Changer in the keep list, three are picked at most; with two kept, one. At targets 1–2, none — nor an extra-turn card at 1, nor a second at 2–3 (a kept one counts).
3. **Goals filter before sampling**: a skipped card never enters a tier-C window or the lock tier; the RNG is the seeded `mulberry32` only.
4. **The lock tier off at targets ≤ 3**: a measured staple (Kinnan-like fixture) locks at 4 and with no target, and is ranked like any card at 3 or below.
5. **WAVE4 E's acceptance**: a target-2 shell reads "Bracket 1–2" — the adapter's read over keep + picks (with their flags and complete combos), pinned in Vitest with the real adapter and seen on dev.
6. **The Radar never filters**: `inDeck` / `oneAway` membership byte-identical with and without goals; the Cut Coach's complete-combo membership unchanged.
7. **The statements**: the autofill route's `DB_LOG` count before and after (a complete-combos read for the shell is the likely one extra statement; measure).

## Design decisions to make explicitly (disclose + pin each)

- **How the caps reuse Y6a's rules**: feed `impact` the list grown by the picks so far (exact, the rules stay the adapter's) vs. an adapter caps table. Never re-derive a rule in core. Whichever, decide where a cap applies relative to tier C's batch sample (pre-filter vs. re-sample) and pin the RNG consequence.
- **Combos the shell completes across two picks**: the one-away scan knows combos one card from the KEEP list; two picks can complete a combo together. Check each pick against keep + earlier picks (needs complete-combo facts for the growing list), or disclose what isn't checked — and say how the final read reports it.
- **The notes**: one per rule, with counts ("Skipped 4 Game Changers — your Bracket 2 target allows none"), exact text pinned, the new ones under the copy guard.
- **The sheet**: its budget starts from the deck's goal (as Suggestions); whether it shows the goals line or a lead ("Built for your Bracket 2 target"); whether "Save as this deck's budget" belongs there (probably not — it's a one-shot sheet).
- **The badge's source**: a pure per-combo reading from the adapter (e.g. `brackets.comboReading(combo, list)` → firm level + call level, built on `readCombo`), computed client-side from `DeckComboView.tag` / `relevant` / pieces and the editor's goals — or server-side in the combos route. Which rows get one (every row, or only rows that raise past 1); the words for a call ("Could make a deck Bracket 4 — your call"); "above your target" against the editor's target.
- **Commander rows**: `ComboView` has no tag or relevant (the edge-cached card route) — no badge there, or widen `loadCombosForCard` (a public wire change).
- **LATER row 179**: the single add as Suggestions' (`announce: false` + a toast with Undo); the batch as one toast with one Undo for all its pieces (`applyListSwap`'s whole-list Undo is the precedent).

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table is unchanged.
- The golden pin and the live seed-1,234,567 shell unchanged with goals absent; the caps, skips and lock rule pinned; a target-2 shell reads "Bracket 1–2".
- **The dev pass**: 390 / 768 / 1200 / 1440 in both themes — the Autofill sheet with a target 2, with no target, and a One Piece deck (no door); the Radar's badges on a deck with complete and one-away combos. `smoke:autofill`, `smoke:combos` (and `smoke:recommend` for the Radar wire) green on dev (read the deck-create counters first; delete QA decks with their tokens and re-prove the census).
- **The owner's click, signed in on prod**: on Nelson & Murdock (target 3), More → Autofill…: the shell holds no fourth Game Changer and its notes say what was skipped; the Combo Radar's rows show their badges, "above your target" where one is.

Docs in the same package:
- the `WAVE4.md` tracker ticked, with the sha and the deviations, and its status line pointing at Y7a;
- a dated ship note at the top of this file;
- REDESIGN.md's Wave-4 addendum gains "Y6b decisions";
- LATER rows (179 resolved or annotated);
- memory updated;
- **`Y7a-session-prompt.md` written** the way this one was: Swap Lab — the Tagger role whitelist from measured sizes (`attrs.roles`, a per-role kill-switch; a nightly lands it), `POST /api/alternatives` (one new route: its caching intent and bucket; the scope whitelist's `cost_value` range), the Card tab's Alternatives with "Swapped A → B · Undo", and the gold set of ~20 staple swaps.

State `pnpm db:size` before and after. Nothing posted, and nothing seeded on prod.

## Session notes (environment)

Unchanged from `Y6a-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y6a.ts`, `counters-y6a.ts`, `y6a-decks.ts` are there to copy), the `dev-log` launch config for `DB_LOG`, and the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup (Y6a's `mutate.py` runner pattern: anchor asserted, file restored after).
- **New in Y6a:** a `location.reload()` sent from `javascript_tool` races the next script — reload with `navigate`. A hidden pane parks Drawers at their closed transform and never runs their `initialFocus`: measure inside the popup's own box, pin focus in jsdom. jsdom has no `scrollIntoView` (call it as `?.scrollIntoView?.()`).
- **New in Y6a:** a goals edit in a dev draft mints a real row: delete it with the token from the pane's localStorage (`deckwarden:deck-token:<id>`), then remove the key.
