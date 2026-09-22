# W9b session prompt — Autofill review sheet + editor doors

Pull latest, then run W9b — the eleventh Wave-2 package. **`WAVE2.md` is the contract**; read its W9b section and D8 end to end (the sheet sketch, the group/row anatomy, the apply/Undo semantics), plus the W9 row of the pin matrix. W1–W9a are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`, `2c8a755`, `e1b94c1`, `1b1a7c4`+`89035ab`, `e2df10c`, `02ee64b`). W9a shipped the engine and `POST /api/decks/autofill`; W9b renders it: the review sheet plus the two EDITOR doors (empty-state button + More menu). The other doors (Surprise me, hub CTA, combos) are W9c — do not build them.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`); precons deltas in the weekly stats are EXPECTED. (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run `P2.9-session-prompt.md` (MTG) or `P4.7-session-prompt.md` round 3 (OP) first (2026-09-21 census baseline: 25 user decks — 24 MTG + 1 OP — 1 user; `kind='user'` only). (3) Working tree clean at or after W9a's docs commit. (4) State your baseline: **924 tests / 117 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-21 on `02ee64b`); db ~267 MB (alert 350) — W9b adds no data and no API.

## What W9b is NOT (scope fence)

NOT "Surprise me", the hub CTA row, the combos-tab rows, or `GET /api/leaders/random` (all W9c), NOT any change to the autofill route or planner beyond consuming them (the response shape below is a shipped contract — if the sheet needs something else, that's a design conversation for the ship note, not a silent server edit), NOT the per-group "basics only" toggle unless it falls out free (D8 sketches it; a LATER row with a trigger is acceptable — disclose either way), NOT One Piece anything (no door renders when the adapter declares no `autofill` — the gate is `adapter.recommend?.autofill`, checked in the editor, no apology copy). Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-21 on `02ee64b` — re-grep lines, trust the shapes)

- **The response you render** (proven on prod): `{ game, format, seed, picks, groups, notes, totals, issues, cards }` where `picks: [{cardId, zone, qty, group, tier: "locked"|"combo"|"sampled"|"filler", score, cheapestUsd, evidence: [{source, why, with, howOften, confidence}]}]`, `groups: [{id: "base"|"curve-<b>", label, picks}]` (label pre-built: "Lands", "Mana value 2"), `notes: string[]` **rendered verbatim** (vocabulary pinned in `src/lib/recommend/autofill.test.ts` — "The deck is already full — nothing to add." / "Filled {n} of {slots} — …too few candidates in {labels}."), `totals: {picks, estUsd, unpriced}` (picks-only pricing — the "Est. total" line; disclose `unpriced` when > 0), `issues` = adapter validate over keep+picks, `cards` = **full CardWires for every involved id — the sheet needs no second fetch** (images, prices, legality all aboard).
- **Picks are entries, not cards**: Atraxa = 92 entries / 99 qty (fillers carry qty > 1, e.g. 11 basics across 4 entries). **`applyListSwap` must merge same-(zone, cardId) rows** with any kept basics — the server merges for its own validate pass but returns picks unmerged.
- **Request body**: `{ game, format, leaderIds: [1..2], keep: [{cardId, zone, qty}] ≤ 500, budgetUsd?, seed? }`. `leaderIds` owns the command zone — keep entries there 400. "Keep my N cards" checked = send the current non-leader entries as `keep`; unchecked = `keep: []`. Reroll = same body, **no seed** (server rolls a new one; the response echoes it — hold it so "same view" is reproducible in state). Budget chips (All / ≤ $5 / ≤ $1 per D8) map to `budgetUsd` absent / 5 / 1.
- **The rate budget is the reroll budget**: `deckAutofill` 20/min + 200/h per IP; ~14 statements per call — debounce the reroll button and never fire on open-then-close. A 429 carries `Retry-After`; render the sentence + disabled Retry, never auto-retry.
- **The apply seam**: `handleImport` at `src/components/editor/deck-editor.tsx:878-891` (re-grep) — merges `outcome.cards` into the card map, replaces `entries`, `markDirty()`; **no Undo, bypasses `applyEdit`**. Generalize into `applyListSwap(entries, cards, title)` capturing the previous list and toasting an Undo that restores it with `markDirty` — Import and Autofill both call it (Import gains the same Undo; the W9a acceptance says so).
- **Doors**: empty-deck `EmptyState` at `src/components/editor/deck-list-pane.tsx:247` (re-grep) gains **Autofill a starter shell** once a commander is set; **More → Autofill…** always (when the adapter declares it). The More-menu items array is PINNED at `editor-header.test.tsx:120-129` (`["Details", "Import", "Export", "Buy this deck…", "Keyboard shortcuts?"]`) — update it, keep the OP-negative case pattern from W7.
- **Draft-safe is free**: the API takes a snapshot, so a draft (no deck row) autofills; applying then mints exactly ONE deck on the following autosave (the `ensureDeck` path — the W8b precon-seed precedent and its create-count pins in `deck-editor.test.tsx` are the guard).
- **Dialog machinery precedents**: Dialog from `md` / full-height Drawer on phones — the W7 buy dialog and W5 printings Drawer are the houses styles; `ModalFinalFocus` like other More-menu dialogs; R4: keyboard provider sits INSIDE the Drawer root; hidden pane stalls Base UI exits/toasts.
- **Evidence rows**: first evidence sentence + "+N more" expands; the source label/link comes from `meta.sources` (Topdeck.gg credit is REQUIRED wherever tournament evidence shows — the hard attribution rule). Price per row = `cheapestUsd` off the pick; hover/focus preview via `CardNamePreview` (`{name, image, caption?}`) with the wire's image.

## Verify-first list (never from memory)

1. Empty Atraxa draft → EmptyState door → sheet loads (skeleton rows first), 99 shown, groups collapsible, apply button states the live count ("Add 99 cards").
2. Uncheck rows → count updates; Apply → ONE edit, toast "Added N cards · Undo"; Undo restores the previous list and autosaves.
3. Draft apply → exactly one POST /api/decks + one PUT on the following autosave (create-count tests + live network).
4. Reroll → new list, deck untouched (no autosave fires, no markDirty until Apply).
5. "Keep my 12 cards" on a partial deck → keeps stay, picks avoid them, count = slots.
6. Budget chip ≤ $1 → rows all ≤ $1; any shortfall note rendered verbatim.
7. One Piece editor: no EmptyState door, no More item (adapter-gated), RTL-pinned.
8. Import path still green and now has Undo; `editor-header.test.tsx` menu pin updated; `deck-editor.test.tsx` create-count tests untouched.
9. `pnpm check` green; smokes: `smoke:recommend`, `smoke:autofill` (unchanged server), editor RTL suite.

## Design decisions to make explicitly (disclose + pin each)

- **Sheet state model**: where the fetched shell lives (component state keyed by seed), what survives close/reopen, and when a stale shell invalidates (leader change, list edit while open).
- **Row identity for checkboxes**: pick entries are (zone, cardId) — a filler entry with qty 11 is ONE row ("Wastes × 11") or split? D8 shows one row per card; decide and pin.
- **`issues` rendering**: the response's validate issues on keep+picks — where they surface in the sheet (a warning line above Apply is the cheap honest slot).
- **Reroll seed display**: whether the seed is user-visible (a shareable "same shell" affordance is W9c-adjacent — default to internal-only unless free).

## Deployable outcome

`pnpm check` green and deployed; the sheet + two editor doors live on prod behind the adapter gate; Import has Undo; no server-side changes (or each disclosed); docs in the same package: `WAVE2.md` tracker W9b ticked with the sha; dated ship note in this file; LATER rows for anything fenced; memory updated; **`W9c-session-prompt.md` written** the way this one was (doors: Surprise me / hub CTA / combos — carry the sheet's open-with-props contract: what W9c passes to open it seeded, `?autofill=1` latch semantics, and the `keep`-pinned combo pieces shape).

## Session notes (environment, updated by W9a)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`; psql/aws absent — DB probes via `scripts/.tmp/*.mts` (tsx needs `.mts`; dotenv `loadEnv({ path: [".env.local", ".env"] })`; delete probes after). Never `source .env.local`.
- **Dev shares the ONE Neon DB with prod** — read freely, never hand-mutate; QA decks deleted after (census 25 re-proven).
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build`. `next dev` re-adds the AGENTS.md block — commit it if it appears.
- `preview_logs` ANSI-dims some `[db]` lines (`ESC[2m` before the tag) — a `^\[db\]` grep undercounts; strip escapes first.
- `counters:reset` clears only `deck-create:%:::1`; a dev autofill battery leaves `deck-autofill:*:::1` rows that self-expire (20/min window) — never retry into a 429.
- Pane quirks: hidden pane stalls Base UI exits/toasts and rAF; signed-in flows are RTL-only (pane signed out everywhere); a 5 s toast outlives tool round-trips — prove ephemeral UI with a `browser_batch` navigate + same-call poll; synthetic input events don't reach React (real keystrokes / `requestSubmit`).
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP.
- Deploy verification: GitHub commit status context "Vercel", **the sha from `git rev-parse HEAD`, never retyped**.

## Context, not tasks

Sequence after W9b: W9c doors → W10 tournaments. P2.9 (MTG) and P4.7 round 3 (OP) standing triggers remain live. Owner decisions of 2026-09-19 stand: evidence-based starter shell (no roles), plain buy links, ownerless precons. Neon compute on rerolls: the 20/min bucket is the first line; client-side reroll over the returned window is the recorded LATER second. Premium never gates card data or prices.
