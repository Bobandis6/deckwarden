# Y2b session prompt — Start doors (Pick a commander · Paste a list · Start from a precon · Surprise me; Suggestions in drafts; first-approval Share)

Pull latest, then run Y2b — the third Wave-4 package. **`WAVE4.md` is the contract.** Read, in this order: **D0** (reuse, don't add; copy rules); **D2**'s Y2b paragraphs (start doors, Suggestions in drafts, first approval); the **Y2b** block in section E, its row in E's **pin matrix** and the route-table row (`+ ƒ /api/recommendations`); and Y2a's ship note at the top of `Y2a-session-prompt.md` (what Y2a changed, its deviations, and LATER rows 161–162).

Y2b puts the fastest ways into a deck on the first screen, lets a seeded draft see Suggestions without minting a row, and offers "Share this deck" the first time the Warden approves. **No migration, no new dependency. Exactly one new route: `ƒ /api/recommendations`.**

Pre-flight, in order.
1. **Y2a has shipped.** `WAVE4.md`'s tracker ticks Y2a (feat `4fd9b10`), and `drizzle/meta/_journal.json`'s last entry is still idx 15.
2. **LATER row 161 (the per-render keepalive PUT).** If the owner started its task chip, that fix is its own session — let it land first (Y2b's draft panel reads `saveStatus`, and the fix changes when PUTs fire). If it's still open, ask the owner whether to run it before Y2b; don't fold it into this package.
3. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
4. **A warm beta signal outranks a package.** Ask the owner whether anything was posted or arrived; a warm signal gets its own P2.9 / P4.7 round first.
5. **Ask for read-only database access once, at the start**, in plain words: the census before and after (users, user decks, precons), nothing written. Y2b's doors mint nothing; `smoke:recommend`'s new snapshot section must create nothing either.
6. **Working tree clean** at or after Y2a's docs commit. Another session may share this working copy: stage explicit paths only; re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` immediately before editing them.
7. **State your baseline**: `pnpm check` = Y2a's count (1,276 tests / 149 files / 6 warnings / 0 errors on `4fd9b10`, more if row 161 landed) and `pnpm db:size`. Save `pnpm build`'s route table; the diff at the end must be **exactly one added line**, `ƒ /api/recommendations`.

## What Y2b is NOT (scope fence)

- NOT anything bracket-shaped (Y3a onward); the Warden's approval line stays legality-only and the new Share link sits under it, not in it.
- NOT a change to the recommendation engine's scores, weights or filters — the snapshot route is a new door onto `recommendForSnapshot`, nothing more.
- NOT the share page's progress wording (LATER row 162) and NOT the keepalive fix (row 161).
- NOT URL import (Moxfield / Archidekt — LATER), NOT a new picker design ("Pick your game." stays).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-01 against `4fd9b10` — re-grep lines, trust the shapes)

- **The empty draft's EmptyState** is `src/components/editor/deck-list-pane.tsx` ≈281 ("No cards yet" — "Add them from Search."); since Y2a its action is the only Add cards on a phone, and the Autofill door shows there once a leader is set. The empty leader zone (`src/components/deck/leader-zone.tsx`) already offers Browse (`adapter.display.leaderBrowse`, `types.ts` ≈571) + Search by name.
- **`/decks/new`** is `src/app/decks/new/new-deck-chooser.tsx`: one-shot latches `?surprise=1` / `?autofill=1` (≈50–56, adjusted during render) stripped by `replaceState` (≈65–66) — the pattern `?import=1` copies. The picker's "Pick your game." is ≈98 and each game's "Surprise me — random …" link ≈132. Home's Surprise door: `src/app/(site)/page.tsx` ≈86.
- **Seeds and the editor.** `draftSeed` (from > surprise > combo > leader) and the seeders in `deck-editor.tsx`; Y2a's "Keep this deck" shows for any settled seed with cards. `?import=1` opens the existing Import dialog (`openFromHeader("import")` path, `ImportDialog` in `import-export.tsx`) — Import applies through `applyListSwap`, a real edit with Undo.
- **Suggestions today.** `RecommendationsPanel` fetches `GET /api/decks/[id]/recommendations` only when `active && leader && deckId && saveStatus === "saved"` (`recommendations-panel.tsx` ≈98). The route (`src/app/api/decks/[id]/recommendations/route.ts`) is the shape to mirror: zod query, `RATE_LIMITS.recommendations` (30/min per IP), `force-dynamic`, `no-store`, `?owned=1` with honest `owned.reason`.
- **The snapshot pieces exist.** `recommendForSnapshot(snapshot, opts)` (`src/lib/recommend/engine.ts` ≈177, returns `[]` for a game without recommend meta) and `loadEntryFacts(gameId, ids)` (`src/lib/recommend/queries.ts` ≈271, server-side facts for client ids — W9a's autofill route `src/app/api/decks/autofill/route.ts` is the precedent: ids in, facts read server-side, 400 on unknown ids, its own `deckAutofill` bucket).
- **Rate limits** live in `src/lib/rate-limit.ts` (`RATE_LIMITS`); every window is ≤ 1 day (the nightly sweeps counters older than 2 days). The new route gets its own bucket.
- **First approval.** `ValidationPanel`'s settle (`validation-panel.tsx` ≈73–76) is R3's F1 false→true transition — the moment the link appears. The `deckwarden:*` localStorage pattern with a `useSyncExternalStore` reader is `src/lib/theme/appearance.ts` (`useAppearance`, ≈105); other keys: `deckwarden:deck-view`, `deckwarden:leader-pick-intent`, `deckwarden:index-view`.
- **Zero-POST pins** for seeded drafts: `deck-editor.test.tsx` ≈1003 (combo without `?autofill=1`: no POST at all) and ≈1313 (Surprise me: literally zero POSTs). Y2a's Keep / progress / Undo tests are at ≈1410–1545.

## Verify-first list (never from memory)

1. Paste a list is two clicks from home (home → a door → the Import dialog open on a draft) and creates nothing until Apply.
2. A seeded draft's Suggestions answer from `POST /api/recommendations` with **zero `POST /api/decks`** — the combo and Surprise zero-POST pins stay green, and the census is unchanged after a dev pass.
3. The panel calls the snapshot route only while its tab is active, and never once a deck row exists (the existing GET takes over).
4. One Piece shows Browse leaders and Paste a list, no precon / Surprise / Suggestions doors, and `POST /api/recommendations` answers 400 for it.
5. "Share this deck" appears once per deck per browser on the first approval, never on mount at zero (a loaded legal deck), and not again after it was shown.

## Design decisions to make explicitly (disclose + pin each)

- The doors' order and wording per game on `/decks/new` and in the empty draft (WAVE4: Pick a commander · Paste a list · Start from a precon · Surprise me; the existing Autofill door once a leader is set) — and whether the picker's game cards grow the doors or the doors live on the editor's empty state only.
- The snapshot route's body limits (max ids, leader count), its bucket numbers, and its response shape (the GET's, minus what needs a deck row).
- How the panel keys its draft fetch (entries hash vs. settled-edit count) so an unchanged draft never refetches.
- The first-approval flag's key and what "per deck" means for a draft that mints mid-session (the deck id once it exists).
- Where the Share link opens (the existing Share dialog; a draft that approves before any row exists has nothing to share — decide what shows).

## Deployable outcome

`pnpm check` green and deployed (Vercel status success on the full sha via `gh api repos/Bobandis6/deckwarden/commits/<sha>/statuses`). `smoke:recommend` gains a snapshot section (dev) that creates nothing. Dev pass at 390 / 768 / 1200 / 1440 in both themes: the empty draft's doors in both games, `?import=1` from home, a Surprise draft's Suggestions, the first approval's Share link. Prod, signed out, zero creates: the doors render and `POST /api/recommendations` answers a seeded draft. The route table gains exactly `ƒ /api/recommendations`.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and deviations; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains the Y2b decisions; LATER rows annotated; memory updated; **`Y3a-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`. The shell is zsh: a bare `====` (or any word starting with `=`) aborts the whole command line — don't echo separators like that. Ad-hoc SQL through `pnpm exec tsx` on a file in `scripts/.tmp/` inside one `read only` transaction (`scripts/.tmp/census-y2a.ts` is the census: decks − 181 precons = user decks).
- Dev server: `preview_start {name: "dev-log"}`; stop it before `pnpm build`. Dev shares prod's Neon DB — any deck a check creates must be deleted (its token is in the pane's localStorage: `DELETE /api/decks/<id>` with `x-deck-token`) and the census re-proved.
- The browser pane is signed out and usually hidden: seeds, fades and drawer exits stall until a screenshot paints it; a covered button can be clicked with `element.click()` in `javascript_tool`. Light theme: `localStorage.theme = "light"` then reload; remove it after.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors; `react/no-unescaped-entities` flags a bare `'` in JSX text. Run `pnpm exec prettier --write` on every touched file before `pnpm check`. Some source files contain a NUL byte, so the system `grep` calls them binary — use `grep -a`.
