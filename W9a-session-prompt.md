# W9a session prompt — Autofill engine + API (no UI)

Pull latest, then run W9a — the tenth Wave-2 package. **`WAVE2.md` is the contract**; read its W9a section end to end (**the five numbered steps ARE the build order** — refactor first, then queries, then the adapter template, then the pure planner, then the route), D8 for what the W9b sheet will consume (you are building its data, not its UI), and the W9 row of the pin matrix. W1–W8b are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`, `2c8a755`, `e1b94c1`, `1b1a7c4`+`89035ab`, `e2df10c`). W9a ships an engine and a POST route that **writes nothing** — deployable precisely because nothing renders it yet.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`); the precons step now grows the catalogue on its own (175→181 across W8a→W8b was the weekly gate working — new-product deltas in its stats are EXPECTED, not drift). (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run `P2.9-session-prompt.md` (MTG) or `P4.7-session-prompt.md` round 3 (OP) first (2026-09-21 census baseline: 25 user decks — 24 MTG + 1 OP — 1 user; precons are NOT census, `kind='user'` only). (3) Working tree clean at or after W8b's docs commit. (4) State your baseline: **901 tests / 116 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-21 on `e2df10c`); db ~266 MB (alert 350) — W9a adds no data.

## What W9a is NOT (scope fence)

NOT the review sheet, the doors, "Surprise me", or ANY rendered surface (all W9b/W9c — no editor file should change beyond what step 1's refactor forces, which is none), NOT One Piece autofill (the adapter declares no `autofill`; the route answers 400 — that IS the OP deliverable), NOT roles/tags heuristics (**no roles anywhere** — only ci_mask, type, cost, popularity, tournament data, combos; the contract is explicit), NOT client-side reroll (a recorded LATER option — `buildShell` purity keeps the door open), NOT autosave/undo work (`applyListSwap` is W9b). Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-21 on `e2df10c` — re-grep lines, trust the shapes)

- **The refactor target**: `src/lib/recommend/engine.ts` — `recommendForDeck` loads the deck row + entries and builds a `CandidateFilter` around lines ~70–115 (re-grep; the contract's "74–115" has drifted a few lines). Step 1 extracts `gatherSignals(snapshot, opts)` + `recommendForSnapshot` with **zero behavior change**: `rank.test.ts`, `queries.test.ts`, `mtg/recommend.test.ts` and `smoke:recommend` must pass untouched — they are the refactor's proof, not its casualties.
- **The wire extraction**: `wireSelect`/`toWire` live in `src/app/api/cards/resolve/route.ts` starting at the `wireSelect` function (~:49–:86, re-grep) — step 2 moves them to **(new)** `src/lib/cards/wire.ts` as `loadCardWires(ids, formatId)`. Three W8-era consumers already speak this shape: the resolve route, `fetchDeckCardsWire` (`src/lib/decks/deck-cards-wire.ts` — the share page's path, which W8b's `GET /api/precons/[slug]` reuses whole), and the editor's seeders. Extract from the RESOLVE route only; `fetchDeckCardsWire` stays as-is (it's deck-entry-shaped, not id-shaped).
- **Endpoint shapes to imitate**: W8b's `GET /api/precons/[slug]` returns `{ precon, deck, cards: DeckCardWire[] }` with `s-maxage=86400` — that's the GET/cacheable pattern. The autofill route is the OPPOSITE cache posture: **POST, force-dynamic, `no-store`** (depends on the body), with **(new)** `RATE_LIMITS.deckAutofill` (20/min + 200/h per IP) beside the existing buckets in `src/lib/rate-limit.ts:42` (re-grep the object literal).
- **Pins that must not move**: `TOURNAMENT_STAPLE_SHARE = 0.5` at `src/lib/games/mtg/recommend.ts:51` becomes `lockShare` BY REFERENCE (never a second literal); the P3.4 share tiers (.5/.15) and P3.11 weights (.30/.25/.20/.15/.10) are pinned in `mtg/recommend.test.ts`; the curve template `[6,8,16,22,26,28]` + 37 lands must satisfy the contract's own test: `37 + Σ buckets = 99`.
- **Adapter seam**: `RecommendMeta` lives in `src/lib/games/types.ts`; `autofill` goes on it as an OPTIONAL pure declaration (implemented only in `src/lib/games/mtg/recommend.ts`). Game logic in adapters, pure, no IO — the planner (`src/lib/recommend/autofill.ts` + `rng.ts`, mulberry32) is core and consumes only the declaration.
- **Determinism is the product**: same seed → identical list (Efraimidis–Spirakis weighted sampling, seeded); the acceptance's "another seed → ≥ 15 different picks" is a real test, not a vibe. Keep the RNG in its own module so tests pin sequences.
- **Colorless case is real**: 1 colorless precon and colorless commanders exist — `maxColorlessIdentity: 8` and Wastes-as-filler have live subjects.
- **Statement budget**: the contract expects ~14 statements per autofill call measured with `DB_LOG=1` (the `dev-log` launch config counts queries — R5a memory). Record the number in the ship note; this is the app's costliest read.

## Verify-first list (never from memory)

1. **The engine refactor is invisible**: run `pnpm vitest run src/lib/recommend src/lib/games/mtg/recommend.test.ts` BEFORE and AFTER step 1 — identical pass counts; then `pnpm smoke:recommend` on dev.
2. **Atraxa, no keeps**: POST on dev → exactly 99 picks, `validate` returns no errors, every pick carries ≥ 1 evidence entry naming a real source; a commander with no aggregate (find one via `commander_stats`) yields zero `topdeck-top16` evidence rows.
3. **Seeds**: same seed twice → byte-identical picks; different seed → ≥ 15 differences.
4. **Budget**: `budgetUsd: 1` → only ≤ $1 cards or a stated shortfall note; partner pair → 98 picks; colorless commander → Wastes as filler.
5. **One Piece**: POST with `game: "optcg"` → 400 (adapter declares no autofill), no apology copy needed — it's an API.
6. **Rate bucket**: fires at 21/min on dev (`pnpm counters:reset` after — never retry into a 429).
7. **`DB_LOG=1` statement count** recorded (~14 expected).
8. **`pnpm check` + `smoke:recommend` + the new `scripts/autofill-smoke.ts`** (five commanders on dev) green.

## Design decisions to make explicitly (disclose + pin each)

- **`gatherSignals` options shape**: what exactly moves into `opts` vs stays on `CandidateFilter` — decide once; the route calls it twice (curve pool 600 `ne` Land; base pool 150 `eq` Land) and W9b must not need a third variant.
- **`scope` whitelisting**: `CandidateFilter.scope` (`primary_type` eq/ne) goes through `candidateConditions` exactly like `exclude` — never string-built SQL. Pin with a test that a non-whitelisted column is rejected at the type level or throws.
- **Shortfall semantics**: nearest-bucket borrowing (b−1 first) and the note wording the sheet will show verbatim — decide the `notes[]` vocabulary now (W9b renders it; changing it later moves sheet pins).
- **Evidence reuse**: picks come from the score-ordered pool where every entry ALREADY has evidence (P3.2's rank machinery) — do not invent a second evidence format; the sheet's "first sentence + N more" needs the existing shape.

## Deployable outcome

`pnpm check` green and deployed; the refactor invisible to every existing recommend test/smoke; `POST /api/decks/autofill` live on prod behind its rate bucket, proven by `scripts/autofill-smoke.ts` against dev and one manual prod POST (budget + seed determinism spot-checks); **no UI changes anywhere**. Docs in the same package: `WAVE2.md` tracker W9a ticked with the sha; dated ship note in this file; LATER rows for anything fenced; memory updated; **`W9b-session-prompt.md` written** the way this one was (it builds the sheet — carry the exact response shape you shipped: groups/tiers/evidence/notes/totals/seed, the statement count you measured, and the `applyListSwap` seam `deck-editor.tsx` `handleImport` ~:705-718, re-grep — W8b moved that file's line numbers).

## Session notes (environment, updated by W8b)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node/pnpm + gh); psql/aws absent — DB probes via `scripts/.tmp/*.mts` (tsx needs `.mts` for top-level await; dotenv `loadEnv({ path: ".env.local" })` — plain `dotenv/config` reads only `.env`; delete probes after). Never `source .env.local` (unquoted `&` in OAuth secrets).
- **Dev shares the ONE Neon DB with prod** — read freely, never hand-mutate; QA decks get deleted after (census 25 re-proven).
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build` (shared `.next`). `next dev` re-adds the AGENTS.md block — commit it with your work if it appears.
- Pane quirks (mostly moot for an API package): hidden pane stalls Base UI exits/toasts; a 5 s toast outlives tool round-trips — prove ephemeral UI with a `browser_batch` navigate + same-call poll. Served HTML is ONE line (`grep -o | wc -l`, never `grep -c`) and RSC flight data duplicates every string.
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP; `pnpm counters:reset` if a QA battery trips it.
- Deploy verification: GitHub commit status context "Vercel", **the sha from `git rev-parse HEAD`, never retyped**; API caching on Vercel: trust `x-vercel-cache`, not the echoed Cache-Control (W5).

## Context, not tasks

Sequence after W9a: W9b review sheet → W9c doors → W10 tournaments. P2.9 (MTG) and P4.7 round 3 (OP) standing triggers remain live. Owner decisions of 2026-09-19 stand: evidence-based starter shell (no roles), plain buy links, ownerless precons. Neon compute is the watched risk on rerolls — the rate bucket is the first line, client-side reroll over the returned window is the recorded second. Premium never gates card data or prices.
