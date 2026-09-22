# W9c session prompt — Autofill doors: Surprise me · hub CTA · combos

Pull latest, then run W9c — the twelfth Wave-2 package. **`WAVE2.md` is the contract**; read its W9c section and D8's door list (items 2–4) end to end, plus the W9 row of the pin matrix. W1–W9b are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`, `2c8a755`, `e1b94c1`, `1b1a7c4`+`89035ab`, `e2df10c`, `02ee64b`, `e551042`). W9a shipped the engine + API, W9b the review sheet + the two EDITOR doors. W9c ships the remaining three doors: **Surprise me** (the `/decks/new` Magic card + home), the **hub CTA row** ("Start with a starter shell"), and the **Combos tab** rows ("With your commander" — `[Add 2 pieces]` / `[Build around]`), plus `GET /api/leaders/random` and `GET /api/cards/[id]/combos`.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`); precons deltas in weekly stats are EXPECTED. (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run `P2.9-session-prompt.md` (MTG) or `P4.7-session-prompt.md` round 3 (OP) first (2026-09-21 census baseline: 25 user decks — 24 MTG + 1 OP — 1 user; `kind='user'` only). (3) Working tree clean at or after W9b's docs commit. (4) State your baseline: **940 tests / 118 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-21 on `e551042`); db ~267 MB (alert 350).

## What W9c is NOT (scope fence)

NOT any change to the review sheet's internals beyond what the doors need (its state model, row identity and apply semantics are pinned — see the W9b ship note), NOT the per-group "basics only" toggle (LATER row exists), NOT client-side rerolls (LATER row exists), NOT One Piece autofill (Surprise me on OP picks a random LEADER into a normal draft — no sheet, no apology copy), NOT tournament pages (W10). Anything else → `LATER.md` with a trigger.

## The sheet's open-with-props contract (W9b shipped this — build on it, don't re-plumb)

- `AutofillSheet` (`src/components/editor/autofill-sheet.tsx`) takes `{ adapter, format, entries, cards, phone, onApply, onClose }`. **`entries` IS the request**: leader-zone entries become `leaderIds`; every non-leader entry is a candidate `keep` (sent when the "Keep my N cards" box — default CHECKED, hidden at N=0 — is checked). There is no separate "pinned pieces" prop: **"Build around" = seed the draft's `entries` with the leader + the combo pieces, then open the sheet** — the pieces ride as keeps and the plan builds around them. The pieces arrive as normal main-zone entries; the "Combo piece" label D8 sketches is a W9c addition if you want it (a `tags` value on the seeded entries is the cheap slot — the sheet doesn't render tags today; disclose whatever you choose).
- The editor opens it via `dialog === "autofill"` (`EditorDialog` union in `editor-header.tsx`); `openAutofill()` in `deck-editor.tsx` is the non-menu path (sets `dialogFromMenu` false). The gate is `load.adapter.recommend?.autofill` — checked at every door, no apology copy.
- **`?autofill=1` latch semantics** (build like the W4 `?leader=` / W8b `from=` precedents, `new-deck-chooser.tsx` latch + editor one-shot ref): latched once on mount, param stripped via `replaceState`, opens the sheet — **never auto-applies** (the sheet's Apply is the only write path). On a draft, combine with `?leader=` seeding: the leader seeds state-only first, THEN the sheet opens (the sheet with no leader renders a "set a commander first" sentence and fires nothing — so gate the open on the seed landing, or accept that sentence as the degraded state; decide and pin). Note the sheet fires ONE POST on open — a latched open spends a `deckAutofill` unit (20/min + 200/h per IP), which is fine, but never loop it.
- Apply flows through `applyListSwap` (Undo built in, `mergeEntries` dedupe); a draft apply mints exactly ONE deck on the following autosave (`deck-editor.test.tsx` create-count pins are the guard — keep them green).

## Facts you inherit (verified 2026-09-21 on `e551042` — re-grep lines, trust the shapes)

- WAVE2 §W9c steps verbatim: **(new)** `GET /api/leaders/random?game=` — `no-store`, own rate bucket, legality `NOT EXISTS` filter (`loadLeaderIndex` does NOT exclude banned commanders, `src/lib/hub/queries.ts:274-280` — re-grep); Magic samples the top N by popularity, One Piece samples uniformly. "Surprise me" on the Magic card in `src/app/decks/new/new-deck-chooser.tsx` and on home (`?surprise=1`, latched like `leader`); hub CTA row adds "Start with a starter shell" (`&autofill=1`, latched) — **the hubs' pinned CTA text/href are untouched** (`hubs-smoke` pins). `ComboRadarPanel` gains **With your commander**, fed by **(new)** `GET /api/cards/[id]/combos?fit=<mask>` over `loadCombosForCard` — public, `s-maxage=3600, stale-while-revalidate=86400`, fetched once per leader change (the `useLeaderArt` pattern) so it works in a seeded draft with no deck row; "in deck" marks computed client-side. **Add N pieces** = ONE resolve call by `externalKey` (pass 0 — the resolve limit is 20/min) + one toast; **Build around** opens the sheet with the pieces as keeps (see the contract above).
- Acceptance (WAVE2): Surprise me twice gives two different legal commanders and NO deck rows until a real edit; "Build around" returns a shell containing every combo piece; hub pinned CTAs untouched.
- W9b's doors and pins you must not break: `editor-header.test.tsx` menu array now `["Details", "Import", "Autofill…", "Export", "Buy this deck…", "Keyboard shortcuts?"]` (+ OP negative); EmptyState door gated on leader presence; `autofill-sheet.test.tsx` pins the sheet.
- Caching intent must be stated on every new route (CLAUDE.md): leaders/random = force-dynamic no-store; cards/[id]/combos = public s-maxage.

## Verify-first list (never from memory)

1. Surprise me on `/decks/new` twice → two different legal commanders seeded into drafts, zero POSTs until a real edit.
2. `?autofill=1` on a hub CTA round trip → editor opens with the sheet loading (leader seeded first), never auto-applies; param stripped.
3. Combos tab in a seeded DRAFT (no deck row) shows "With your commander" rows; Add N pieces = one resolve + one toast; Build around → sheet whose plan contains every piece.
4. A crafted `?autofill=1` with no leader and no seed → the sheet's honest no-leader sentence, no POST.
5. OP: Surprise me picks a random leader into a normal draft; no sheet anywhere.
6. Rate buckets: leaders/random has its own; the latched sheet open spends one deckAutofill unit; never retry into a 429.
7. `pnpm check` green; smokes: `smoke:hubs` (pinned CTAs), `smoke:recommend`, `smoke:autofill`, editor RTL suite; create-count pins untouched.

## Deployable outcome

`pnpm check` green and deployed; the three doors + two GET routes live on prod; docs in the same package: `WAVE2.md` tracker W9c ticked with the sha; dated ship note in this file; LATER rows for anything fenced; memory updated; **`W10-session-prompt.md` written** the way this one was (tournaments v1 — carry the D9 sketch, the ISR trio shape, the hub-shelf external-link pins at `hubs-smoke:163-166, 262-265`, and the noindex decision).

## Session notes (environment, updated by W9b)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`; psql/aws absent — DB probes via `scripts/.tmp/*.mts` (tsx needs `.mts`; dotenv `loadEnv({ path: [".env.local", ".env"] })`; delete probes after). Never `source .env.local`. Rate counters live in `rate_limit_counters` (NOT `rate_limits`).
- **Dev shares the ONE Neon DB with prod** — read freely, never hand-mutate; QA decks deleted after (census 25 re-proven). Prod deck deletion works via `DELETE /api/decks/[id]` + `x-deck-token` from the page's localStorage; the Details-dialog "Delete deck…" button did not advance to its confirm under pane clicks in the W9b session (unverified whether pane-quirk or regression — check before assuming either).
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build`. `next dev` re-adds the AGENTS.md block — commit it if it appears. **HMR closes a mounted sheet/dialog** — reopen after any mid-verification edit.
- Pane quirks: hidden pane stalls Base UI exits/toasts and rAF; a 5 s toast outlives tool round-trips — poll in the SAME `browser_batch`; synthetic input events don't reach React (real keystrokes / `requestSubmit`); signed-in flows are RTL-only (pane signed out everywhere).
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP — read `rate_limit_counters` before a prod run.
- Deploy verification: GitHub commit status context "Vercel", **the sha from `git rev-parse HEAD`, never retyped**.
- StrictMode double-fires the sheet's fetch effect in dev; the cleanup abort folds it to one landed 200 — the aborted request in the network log is EXPECTED, not a bug.

## Context, not tasks

Sequence after W9c: W10 tournaments v1 — then Wave 2 is done. P2.9 (MTG) and P4.7 round 3 (OP) standing triggers remain live. Owner decisions of 2026-09-19 stand: evidence-based starter shell (no roles), plain buy links, ownerless precons, sessionStorage pick-intent. Premium never gates card data or prices.
