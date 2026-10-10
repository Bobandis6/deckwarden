# Y8 session prompt — Budget Twin (the total budget in goals; "Fit my budget": the priciest non-leader cards first, one to three alternatives each from Y7a's route, a running "est. $X of your $150", checkbox review, one apply with Undo; "No suitable alternative under your goals.")

Pull latest, then run Y8, the thirteenth Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s goals row (73: one nullable `decks.goals` jsonb, its own PATCH, the budget owner-only) and the Context rows on budget (91: the per-card SQL cap behind three controls; `applyListSwap` gives a whole-list swap one save and one Undo).
2. **D7**'s goals paragraph (341: `goals = {v: 1, targetLevel?, budget?: {perCardUsd?, totalUsd?}, …}` — `totalUsd` is already in the schema and zod since Y4b) and **D9** in full (385–387).
3. The **Y8** block in section E (550–556), its pin-matrix row (601: new Budget Twin RTL), the rows **F** rewrites (635: row 83 — Budget Twin covers deck totals; Autofill's own total budget stays deferred) and **Verification (whole wave)**.
4. REDESIGN.md's **"Y7a decisions"** (the route, the goals read without the card, the per-card Undo, lands never offered, honest empties) and **"Y7b decisions"** (`swapOne`, the swap sheets, `planSwapIn`, the focus return after the closing commit, combo protection from the bracket facts).
5. LATER rows **83** (Autofill's total budget), **165** ("Only cards I own" in a draft — neither snapshot route takes `owned`), **184** (unranked cards never in the role pool), **188** (the swap sheet asks on every open) — and the rows Y7b added.
6. Y7b's ship note at the top of `Y7b-session-prompt.md`.

Y8 fits a deck under a total budget through reviewed swaps:
- **The total budget joins goals**: a "Deck total" control beside the per-card tiers wherever the budget is set (the Why sheet's goals line / Suggestions' "Save as this deck's budget" — decide where it is SET; D9 only says "joins goals"). The goals line shows the running total everywhere it appears ("est. $212 of your $150").
- **"Fit my budget"** opens a sheet (the AutofillSheet shell): the priciest non-leader cards first, each with one to three alternatives from Y7a's route under the deck's goals, a running "est. $X of your $150" (unpriced cards disclosed, owned copies counted at $0 when a collection exists), checkbox review, and **one `applyListSwap` with Undo** — D9 says `applyListSwap`; Y7a/Y7b's swaps are per-card (`swapOne`). Decide and disclose: a reviewed batch is a whole-list edit, so `applyListSwap` fits here (one toast, one Undo for the batch).
- **When nothing fits**: "No suitable alternative under your goals."
- **No migration** (`totalUsd` exists) and — decide — **no new route** if the sheet can ask `POST /api/alternatives` per card inside its bucket (30/min + 200/hour, 12 statements, prod warm ~0.6 s), or one route change (a batch body) if per-card asks are too slow. Say which and why; the route table diff must be what you decided.

Pre-flight, in order.
1. **Y7b has shipped.** `WAVE4.md`'s tracker ticks Y7b; `_journal.json`'s last entry is idx 17.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red ingest is P4.7 branch F and preempts everything; a red ruleset watch means the Game Changers changed. The Scryfall step logs `tagger roles: N fresh, N kept, N off` — anything but 17 fresh means a role kept its stored cards or was switched off. `counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** Ask first whether the r/EDH post (P2.9 round 3) went out and what came back. If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**, for read-only database access (the census, `pnpm db:size`, the counters) and for dev writes (dev shares prod's database: an applied fit in a dev draft mints one deck; read the deck-create counters first; delete QA decks with their tokens and re-prove the census). Say up front that the owner's click comes at the end (signed in, prod). Ask whether Y7b's owed click was done.
5. **Working tree clean**, at or after Y7b's docs commit. Another session may share this working copy (`DESIGN-LAB-session-prompt.md`, untracked, is not yours). Stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table.
   - `pnpm check` after Y7b: 1,933 tests / 189 files / 6 warnings / 0 errors (on `053130f`).
   - `pnpm db:size`: 285.9 MB on 2026-10-10.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); one deck with goals and a budget (Nelson & Murdock, target 3, ≤ $5 a card).

## What Y8 is NOT (scope fence)

- NOT Autofill's total budget (LATER 83 stays deferred). NOT land swaps (LATER 31). NOT a change to Y7a's ranking, roles or route semantics; NOT roles in Autofill or the Cut Coach.
- NOT price history, NOT a currency other than USD, NOT per-printing prices (estimates use each card's cheapest printing, as everywhere).
- NOT the journal (Y9a).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-10 against `053130f`; re-grep lines and trust the shapes; `autofill-sheet.tsx`, `decks/autofill/route.ts` and `lib/decks/cards.ts` hold a NUL byte, so use `grep -a` and byte-safe edits)

- **Goals already hold a total**: `src/lib/decks/goals.ts` has `budget.totalUsd` in the type (41), the zod schema (86: positive, at most 100,000) and `normalizeGoals` (149). Nothing else reads it yet (`grep -rn totalUsd src`): `applyGoals` (`src/lib/recommend/goals.ts`) checks the per-card budget only, and `suggestionGoals` (goals.ts 229) strips only the exceptions line — so a saved total rides every snapshot body (Suggestions, Autofill, alternatives) without effect. Decide whether the routes keep ignoring it or strip it.
- **The goals line** (`src/components/deck/goals-line.tsx`, `goalsParts` in `src/lib/brackets/copy.ts` 108) speaks the target and the per-card budget only; D9: the running total "everywhere it appears". The budget is owner-only (`deckMetaJson` never exposes it; Y5's share page shows the target and exceptions).
- **One budget vocabulary**: `src/lib/recommend/budget.ts` — `BUDGET_OPTIONS` (11), `tierOf` (18), `withinBudget` (29: inclusive; an unpriced card never passes a tier). Suggestions' "Save as this deck's budget" (`recommendations-panel.tsx` ~237) is the per-card budget's only save door today.
- **Ownership**: `deckOwnership` (`src/lib/collection/ownership.ts` 39) — owned qty, missing ≈ $ and the unpriced set over `countsTowardSize` zones. The editor's `owned` set grows lazily and `hasCollection` says whether a collection exists (W7's buy dialog skipped "owned" for that reason) — count owned copies at /bin/zsh only with `hasCollection`.
- **The sheet shells**: `AutofillSheet` (`autofill-sheet.tsx` 101; NUL byte) — Drawer on phones, Modal from md, checkbox review, its own apply; Y7b's lighter `SheetShell` in `swap-sheet.tsx`. The editor's dialog slot (`EditorDialog` in `editor-header.tsx`) gained `"swap"` and `"swap-in"` in Y7b; a `"fit"` joins it.
- **`applyListSwap`** (`deck-editor.tsx` 1468): one save and one Undo for a whole list; its pins — Import (1493 "Import applied"), Autofill (2121 "Added N cards"), RTL `deck-editor.test.tsx` 1329 ("Added 12 cards"). D9's apply.
- **Y7a's route**: `POST /api/alternatives` — body `{game, format, leaderIds, entries, cardId, goals?}`; 8 rows (`ALTERNATIVES_LIMIT`, `alternatives.ts` 49), each with `cheapestUsd` and the per-card budget's conflict line; `hidden` + `reason`; bucket 30/min + 200/hour per IP (`src/lib/rate-limit.ts` 118–120); 12 statements warm, prod ~0.6 s; lands never offered. Client side: `useAlternatives(key, enabled)` + `AlternativesContent` (`alternatives-section.tsx`) ask one card per key.
- **Y7b's swap**: `swapOne` (deck-editor.tsx) swaps one card in place with a per-card Undo; `swapCard` (`src/lib/decks/editor-state.ts`, NUL byte) is the pure step, usable to build a whole next list for `applyListSwap`. `planSwapIn` (`src/lib/recommend/swap-in.ts`) shows how a pure planner over the Cut Coach's input is pinned.
- **Prices**: `cheapestUsd` per identity (its cheapest printing) — always "est."; One Piece shows none of this (no `swap` declared).

## Verify-first list (never from memory)

1. **The total lands at or under the budget, or says how close it gets** — a $300 fixture deck at a $150 total (WAVE4 E's acceptance), RTL with priced fixtures; live on dev with a real precon draft.
2. **Unpriced cards are disclosed** and never counted as $0 (owned copies are $0 only with a collection).
3. **One apply, one Undo** — `applyListSwap`'s pins stay green (Import "Import applied", Autofill "Added N cards"); the Fit sheet's apply restores the whole list exactly.
4. **Zero creates from opening the sheet or reviewing; exactly one from the first apply in a draft.**
5. **The goals' total survives a reload, PATCHes `{goals}` without moving `updated_at`, and stays owner-only** (share pages and `deckMetaJson` never show it).
6. **"No suitable alternative under your goals."** when no card can be swapped down.
7. The route table as decided; `pnpm check` green.

## Design decisions to make explicitly (disclose + pin each)

- **Where the total is set** (the Why sheet's goals, Suggestions' budget row, the Fit sheet itself) and its control (a number field with presets? the site's one budget vocabulary lives in `src/lib/recommend/budget.ts`).
- **Which cards are considered**: the priciest non-leader cards first — how many (a cap per open, inside the alternatives bucket), lands excluded (never offered), owned cards skipped when a collection exists.
- **The asks**: one `POST /api/alternatives` per considered card (paced; bucket 30/min) vs a batch body; how many alternatives shown per card (one to three — the cheapest that keep the role? the best-ranked under the price?).
- **The pick per card**: the default checked alternative (cheapest? best-ranked within the savings?), and the running total's arithmetic (qty × cheapest price; owned at $0; unpriced disclosed).
- **The apply**: `applyListSwap` (D9) vs per-card `swapOne` — one toast, one Undo either way.
- **Empty and partial states**: nothing fits ("No suitable alternative under your goals."), the budget already met, the budget unreachable ("Gets you to $172 of your $150").

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table as decided.
- The dev pass at 390 / 768 / 1200 / 1440 in both themes: a full Magic precon draft over a $150 total; a draft (one create on apply); One Piece (none of it — no `swap` declared, no apology copy). `smoke:alternatives` green on dev.
- **The owner's click, signed in on prod**: on Nelson & Murdock (≤ $5 a card, target 3), set a total → Fit my budget → review → apply → the total under it (or how close) → Undo.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and the deviations, its status line pointing at Y9a; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains "Y8 decisions"; LATER rows with triggers; memory updated; **`Y9a-session-prompt.md` written** the way this one was (Journal core: migration `0018` — `deck_games`, `deck_versions.kind`, the list hash, played snapshots with their own allowance, the games routes, the Games dialog; migrate before push).

## Session notes (environment)

Unchanged from `Y7b-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y7b.ts` and `counters-y7b.ts` are there to copy), the `dev-log` launch config, the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup (the anchor asserted, the file restored after — Y7b's runner ran 40).
- **New in Y7b:** Base UI resolves a dialog's `finalFocus` (even a function) in the closing commit, before the DOM is final, then focuses in a microtask — return focus from a post-commit effect (`closeFocusRef` in `deck-editor.tsx`) and let `finalFocus` stand down while a target is pending.
- **New in Y7b:** the React-compiler lint (`react-hooks/refs`) errors on a render-time truthiness check of a `useMemo` that holds ref-touching callbacks — pass it as a nullable prop instead.
- **New in Y7b:** Base UI moves a dialog's initial focus on an animation frame; this repo's RTL fakes only setTimeout, so wait real frames (`focusSettles` in `deck-editor.test.tsx`). A Modal's default initial focus is its first tabbable — pin an explicit `initialFocus` on the phone Drawer, whose Close comes first.
- **New in Y7b:** in the hidden pane the native value setter plus a bubbling `input` event types into the card search box; a state-only precon draft (`/decks/new?game=mtg&from=abzan_armor_tdc`, 100 cards) is a zero-write full deck.
