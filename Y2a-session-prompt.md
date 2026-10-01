# Y2a session prompt — Honest first screen (the "Draft" slot, "Keep this deck", progress not problems, a quiet first screen, Undo for removals)

Pull latest, then run Y2a — the second Wave-4 package. **`WAVE4.md` is the contract.** Read, in this order: **D0** (copy rules, reuse-don't-add); **D2**'s Y2a paragraphs (the draft slot, "Keep this deck", `/decks/new`, progress not problems, a quiet first screen, one Undo for removals); the **Y2a** block in section E and its row in E's **pin matrix**; and Y1's ship note at the top of `Y1-session-prompt.md` (what Y1 changed, and its deviations).

Y2a makes a new player's first screen tell the truth and point at the next step. **No migration, no new route, no new dependency.** Server legality and the cards PUT's validation do not change — progress is a rendering of the same issues.

Pre-flight, in order.
1. **Y1 has shipped.** `WAVE4.md`'s tracker ticks Y1 (feat `dcfcdcf`, step 0 `0e55ec2`), and `drizzle/meta/_journal.json`'s last entry is still idx 15.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived; a warm signal gets its own P2.9 / P4.7 round first.
4. **Ask for read-only database access once, at the start**, in plain words: the census before and after (users, user decks, precons), nothing written. Y2a writes nothing; a dev check of "Keep this deck" creates one deck — delete it and re-prove the census.
5. **Working tree clean** at or after Y1's docs commit. Another session may share this working copy: stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` = Y1's count (1,251 tests / 147 files / 6 warnings / 0 errors on `dcfcdcf`) and `pnpm db:size`. Save `pnpm build`'s route table; the diff at the end must be **empty**.

## What Y2a is NOT (scope fence)

- NOT the start doors, `?import=1`, `POST /api/recommendations`, Suggestions in drafts or the first-approval "Share this deck" link (all Y2b).
- NOT anything bracket-shaped (Y3a onward), and the Warden's approval line stays legality-only.
- NOT a multi-step undo stack: only a plain removal (or a stepper reaching zero) gets one Undo. Steppers above zero, imports and restores stay in LATER row 60.
- NOT a change to the cards PUT's issues, `validate()`'s severities as the server reports them, or any recommendation.
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-01 against `dcfcdcf` — re-grep lines, trust the shapes)

- **The save slot.** `SaveIndicator` is `src/components/editor/editor-header.tsx` 171 (rendered at 110), `data-status={status}` at 176. The `saveStatus()` pins in `src/components/editor/deck-editor.test.tsx` now number **19** (WAVE4 D2 counted 14 at `53942d6` — re-count; every one must stay green, which is why drafts get a separate `data-draft`, not a new `data-status`).
- **`/decks/new`**: `src/app/decks/new/page.tsx` 43 is `<Suspense fallback={null}>`.
- **Validation.** `ValidationIssue` is `src/lib/games/types.ts` 120 (`code`, `severity: "error" | "warning"`, `message`, `cardIds?`, `zone?`). Magic's under-minimum shapes: `ZONE_SIZE` (`src/lib/games/mtg/validate.ts` ≈146, an empty command zone) and `DECK_SIZE` (≈172); One Piece has its own `ZONE_SIZE` (`src/lib/games/optcg/validate.ts` ≈92) — both adapters set the new optional flag. The panel is `src/components/deck/validation-panel.tsx` (its test `validation-panel.test.tsx`, 105 lines; the matrix pins 42–46 and 99), used by `deck-list-pane.tsx` and the share view. `src/lib/warden-copy.ts` owns the Warden's lines.
- **Undo.** The editor's toasts go through `notify(title, undo)` (`deck-editor.tsx` ≈972 replace, ≈986 add, ≈1100). Removals and steppers today toast nothing.
- **The quiet first screen.** `deck-list-pane.tsx` holds View / Group / Sort (its `useState<DeckViewMode>` ≈112). Keyboard hints are rendered on every pointer today.
- **Y1 left the Share dialog's account/guest split in place** (`share.accountDeck` in `deck-editor.tsx`); a draft has no `share` yet.

## Verify-first list (never from memory)

1. A fresh Magic draft (`/decks/new?game=mtg`) on dev shows "Draft" in the slot with no check mark and `data-draft`; the first edit creates exactly one deck (the create-count tests 191–292 stay green).
2. "Keep this deck" on a precon draft (`/decks/new?game=mtg&from=p_<slug>`) creates exactly one deck in one click — RTL count, then once on dev (delete the deck, re-prove the census).
3. The cards PUT returns byte-identical issues for an empty and a short deck before and after (save one response of each first).
4. The approval line never shows on an empty deck; One Piece shows its own progress line through its adapter.
5. Undo after a removal restores the card and quantity and autosaves like any edit (jsdom — a hidden pane stalls toasts).

## Design decisions to make explicitly (disclose + pin each)

- The flag's name on `ValidationIssue` (WAVE4 says "an optional progress flag") and whether it rides the wire (the PUT's JSON shape must not change for existing fields).
- The shared `progressLine` helper's home and its words for each game ("Choose a commander · 100 to go"; One Piece's leader noun).
- Where "· N to go" sits beside the ring, and what it says over the maximum (nothing — over is a problem, not progress).
- The hint lines on coarse pointers (hidden) and the Mac ⌘ detection (no hydration mismatch — decide it after mount or in CSS).
- Which seeds count as "seeded" for "Keep this deck" (WAVE4: precon, combo, Surprise me, a chosen leader).

## Deployable outcome

`pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`). Dev pass at 390 / 768 / 1200 / 1440 in both themes with reduced motion toggled: a fresh draft, a precon draft, a short deck, a removal's Undo. Prod, signed out, zero creates: `/decks/new?game=mtg` renders its fallback and then "Draft · Choose a commander · 100 to go". The route table diff is empty.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and deviations; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains the Y2a decisions; LATER row 60 annotated (the cheap half FIRED); memory updated; **`Y2b-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. Ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/` inside one `read only` transaction; `deck_cards` joins identities on `card_identity_id`.
- Dev server: `preview_start {name: "dev-log"}`; stop it before `pnpm build`. Building the baseline route table: `git stash push -u`, build, `git stash pop`, build again, diff.
- The browser pane is signed out everywhere and a hidden pane stalls Base UI and toasts — verify through the DOM or jsdom. Light theme in the pane: `localStorage.theme = "light"` then reload; remove it after.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors; `react/no-unescaped-entities` flags a bare `'` in JSX text. Run `pnpm exec prettier --write` on every touched file before `pnpm check`.
