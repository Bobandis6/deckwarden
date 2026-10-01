# Y2a session prompt — Honest first screen (the "Draft" slot, "Keep this deck", progress not problems, a quiet first screen, Undo for removals)

## Ship note — 2026-10-01, feat `4fd9b10`, deployed (Vercel status success on the full sha, 14:14 Z)

**Shipped. The prompt below is history. Next is `Y2b-session-prompt.md` (start doors).**

**Pre-flight**: Y1 ticked and `0015` the last migration; the nightlies green (07:38 Z's red was P4.9's flaky GET, re-dispatched green at 07:57 Z). The owner's answers at the start: **nothing posted, no feedback** (no beta round) and **read-only database access granted** (plus deleting the one QA deck). Baseline on `d40d70d`: 1,251 tests / 147 files / 6 warnings / 0 errors; `pnpm db:size` 271.1 MB; census 208 deck rows = 27 user decks + 181 precons, 1 user.

**Results.** `pnpm check` **1,276 tests in 149 files**, the same 6 warnings, 0 errors (+`progress.test.ts`, +`use-is-mac.test.ts`; new cases in the editor header, the panel, both validators, `validation.test.ts`, `editor-state.test.ts`, the search pane, the leader zone and five in `deck-editor.test.tsx`). Every `data-status` pin (19) and the create-count tests stayed green untouched. Route table identical (`/decks/new` stays `○`). The cards PUT's `validation` byte-identical: empty / short / no-commander decks of both games through `validate` snapshotted before any edit, then through the route's `toWireIssues` after — `cmp` clean. Census unchanged after the dev QA deck's delete; `pnpm db:size` 271.1 MB after. No migration, route or dependency.

**What changed** (D2's Y2a paragraphs, as drawn unless noted):
- **The draft slot.** "Draft" at rest, titled "Saves on your first change", no check; `data-draft` on every render without a server row; `data-status` unchanged.
- **"Keep this deck"** for seeded drafts (precon, combo, Surprise me, a chosen leader), where Share will be: `markDirty()` + `flush()` → one POST + one PUT; the button leaves with the "saved" state.
- **`/decks/new`**: `new-deck-fallback.tsx` (header strip with the mark, skeleton bars, `aria-busy`, sr-only status) replaces `fallback={null}` — the page's static HTML.
- **Progress, not problems.** `progress?: true` on `ValidationIssue` from both adapters (under-minimum `ZONE_SIZE` / `DECK_SIZE`; never over), stripped from the PUT by `toWireIssues`. `src/lib/decks/progress.ts` owns "Choose a commander · 100 to go" / "Choose a leader · 50 to go" / "N to go"; the editor's `ValidationPanel` shows it as one neutral line, real problems red beneath; the summary reads "98 / 100 · 2 to go". The approval line still never shows on an empty deck.
- **A quiet first screen.** View / Group / Sort once the list has a card; one Add cards on phones; the search pane's keycap line **and the empty leader zone's "or press Ctrl+Enter…" clause** on fine pointers only, ⌘ on a Mac (`src/components/use-is-mac.ts`).
- **One Undo for removals.** The ✕, the leader's remove and a stepper reaching zero → "Removed X" / "Removed 7× Forest" + Undo through `restoreEntry` (qty, tags, printing, position; refuses if the zone filled). LATER row 60's cheap half FIRED.

**Decisions and deviations** (also in `WAVE4.md`'s tracker and REDESIGN.md's "Y2a decisions"):
1. The flag rides no wire — the editor and the share page call `validate` themselves; only the PUT returns issues.
2. **The share page is unchanged**: without a `progress` prop the panel lists every issue as before, so a visitor is never told to "Choose a commander" (LATER row 162 for a visitor voice).
3. "· N to go" follows the counted-up number; over the minimum the label keeps "cards" and says nothing more.
4. The leader zone's keyboard clause was not in the contract — found on the 390 dev pass and hidden the same way (`EmptyState.hint` widened to a node; the leader-zone pin rewritten to read the whole sentence on a fine pointer).
5. **Found, not fixed (LATER row 161, offered as its own task):** the editor's pagehide/unmount keepalive effect depends on `isDirty`, which `useAutosave` re-creates every render — so on a saved deck every edit PUTs immediately through an un-awaited keepalive fetch, and a failed one is silent. Y2a's removal test pins what was saved, not PUT counts.

**Dev pass** (signed out, against prod data): a fresh Magic draft at 390 dark (coarse pointer — the hint line `display: none`, one Add cards, no View, "0 / 100 · 100 to go"); a Surprise draft at 768 light (Draft · Keep this deck, "1 / 100 · 99 to go", ⌘ keycaps, the Autofill door); One Piece at 1200 dark ("Choose a leader · 50 to go"); a fresh draft at 1440 dark; the Breed Lethality precon draft at 1024 — **one Keep this deck click: one POST 201 + one PUT 200, census 208 → 209**; on that deck "Remove Forest" toasted "Removed 7× Forest", the summary read "94 / 100 · 6 to go", Undo restored "100 / 100 cards"; the deck was then deleted with its token (204, GET 404) and the census re-proved at 208. Reduced motion could not be toggled in the pane — the fallback pulse and the slot fade are `motion-safe:` classes. The hidden pane stalled the precon seed and the slot's fade until a screenshot painted it (the known freeze), and stalled the Tools drawer's exit — the Keep click was dispatched on the button element.

**Prod pass** (signed out, zero creates): `/decks/new?game=mtg`'s server HTML is the fallback (`data-slot="new-deck-fallback"`, `aria-busy`), then the client renders "Draft", "Choose a commander · 100 to go" and "0 / 100 · 100 to go" with no View / Group / Sort; no `/api/decks` request.

---

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
