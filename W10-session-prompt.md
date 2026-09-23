# W10 session prompt — Tournaments v1 (the last Wave-2 package)

Pull latest, then run W10 — the thirteenth and FINAL Wave-2 package. **`WAVE2.md` is the contract**; read its W10 section, the D9 sketch, and the W10 row of the pin matrix end to end. W1–W9c are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`, `2c8a755`, `e1b94c1`, `1b1a7c4`+`89035ab`, `e2df10c`, `02ee64b`, `e551042`, `2c6c4a6`). W10 ships the tournaments surface: **/tournaments** (the index) and **/tournaments/[id]** (event pages), plus the hub shelves' internal links.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`); precons deltas in weekly stats are EXPECTED. (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run `P2.9-session-prompt.md` (MTG) or `P4.7-session-prompt.md` round 3 (OP) first (2026-09-22 census baseline: 25 user decks — 24 MTG + 1 OP — 1 user; `kind='user'` only). (3) Working tree clean at or after W9c's docs commit. (4) State your baseline: **950 tests / 119 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-22 on `2c6c4a6`); db ~267 MB (alert 350).

## What W10 is NOT (scope fence)

NOT player profiles or player pages (event pages carry player names as text — that is already an explicit decision, see noindex below), NOT on-site decklist rendering (the `Decklist ↗` links stay external — the attribution rule and the smoke pins both require the external event link regardless), NOT tournament ingest changes (both pipelines are live and untouched), NOT One Piece autofill or anything sheet-shaped. Anything else → `LATER.md` with a trigger.

## The contract (WAVE2 §W10 verbatim, checked 2026-09-22)

- **(new)** `src/app/(site)/tournaments/page.tsx` — **force-dynamic**; `?game=`, `?leader=`; `GameSwitch` with custom hrefs; reads via the `tournaments_game_date` index.
- **(new)** `src/app/(site)/tournaments/[id]/{layout,page,loading}.tsx` — the **ISR trio**: `revalidate = 86400`, `generateStaticParams → []`, id regex `^\d{1,9}$`, `robots: { index: false }`.
- `src/lib/tournaments/queries.ts` — the top-finishes select gains `tournaments.id`, and a **new event loader** returns leader `{ name, slug }` pairs. (The prompt-era line ref was 54-71; `loadTopFinishes`'s select sits at ~50-75 today — re-grep, trust the shape.)
- Hub shelves add the internal event link and "All {n} finishes →" (`/tournaments?leader=<slug>`) while **keeping the external event link on every row**.
- `BROWSE_LINKS` (`src/components/site-nav.tsx:36`) + BOTH header-test arrays in `site-header.test.tsx` (the W10 pin-matrix row).
- Sitemap lists the index only. Run `pnpm typecheck` (it runs `next typegen`) before relying on `PageProps<"/tournaments/[id]">`.
- **Acceptance**: D9; both pages render from `tournaments` + `tournament_standings` only; `hubs-smoke` still finds the Topdeck / Limitless URLs (see pins below); One Piece events show the Limitless credit and the ©BANDAI posture line wherever leaders render.

## Pins and precedents you inherit (verified 2026-09-22 on `2c6c4a6`)

- **hubs-smoke external-link pins** (the prompt-era 163-166 / 262-265 labels — current lines drift, re-grep the strings): the /c/ shelf check asserts `Topdeck.gg` + `https://topdeck.gg/event/` in the hub page text; the /l/ check asserts `Limitless` + `https://play.limitlesstcg.com/tournament/`. Your internal links are ADDITIVE — these greps must keep passing.
- **noindex decision** (D9, explicit): event pages are `robots: { index: false }` in v1 — thin pages carrying player names. Recorded to revisit, not to relitigate this session. The INDEX page is indexable and goes in the sitemap.
- **ISR + notFound gotcha (R6, in memory)**: a `loading.tsx` boundary makes `notFound()` stream as a 200 — gate the 404 (the id regex) in the segment LAYOUT, above the boundary. That is why the trio includes `layout.tsx`. And the Warden 404 lives in TWO files (R5b): an in-group `notFound()` renders inside the `(site)` layout.
- **Caching intent stated on every new route** (CLAUDE.md): index = force-dynamic (leader filter is query-driven); event pages = ISR 86400. How to prove ISR: dev = `s-maxage` + `x-nextjs-cache`; Vercel = `x-vercel-cache: HIT` + `x-nextjs-prerender` (Cache-Control gets rewritten — W5/R1b memory).
- `loadTopFinishes(gameId, leaderId)` (W9c-era shape): one query, `count(*) over ()` total, leader names via a subquery; both source pipelines (topdeck / limitless) behind it. `tournaments.externalKey` powers the external URL — keep using the per-game URL builders the shelves use today.
- Tournament data facts: placement order is the live contract (P3.8); punk-records upstream has cost:null on some events (P4.6 — display must not assume costs); OP posture line component is `OptcgPostureLine`.
- `GameSwitch` precedent: the /cards page's game switcher takes custom hrefs — reuse, don't fork.

## Verify-first list (never from memory)

1. `/tournaments` renders both games' events (switch works), newest first; `?leader=<slug>` filters; force-dynamic proven.
2. An event page renders standings from the two tables only — placement order, records, `Decklist ↗` external, event source link external; ISR proven (second hit cached).
3. A junk id (`/tournaments/999999999`, `/tournaments/abc`) 404s with the Warden 404 — as a real 404 status, not a streamed 200 (curl -I).
4. Hub shelves (/c/ AND /l/): every row keeps its external event link; the internal link + "All {n} finishes →" added; `smoke:hubs` green.
5. OP event page: Limitless credit + ©BANDAI posture line where leaders render.
6. `site-header.test.tsx` arrays updated (both), `seo-smoke` green (sitemap gains the index only; event pages noindex).
7. `pnpm check` green; smokes: `smoke:hubs`, `smoke:seo`, `smoke:optcg`.

## Deployable outcome

`pnpm check` green and deployed; /tournaments + event pages live on prod; docs in the same package: `WAVE2.md` tracker W10 ticked with the sha (**Wave 2 complete** — say so), dated ship note in this file, LATER rows for anything fenced, memory updated. **No W11 prompt** — after W10 the standing state is response rounds only (P2.9 / P4.7 r3); if the owner names new work, a fresh plan session decides the next contract.

## Session notes (environment, updated by W9c)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"`; psql/aws absent — DB probes via `scripts/.tmp/*.mts` (tsx needs `.mts`; dotenv `config({ path: [".env.local", ".env"] })` — NOT @next/env; delete probes after). Never `source .env.local`. Rate counters live in `rate_limit_counters` (key/window_start/count — no `bucket` column).
- **Dev shares the ONE Neon DB with prod** — read freely, never hand-mutate; QA decks deleted after (census 25 re-proven; `DELETE /api/decks/[id]` + `x-deck-token` from localStorage `deckwarden:deck-token:<id>` works).
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build`. **A mid-verification HMR rebuild can make fresh loads look dead** (no fetches, no param strip) — reload after the rebuild settles before chasing ghosts. HMR closes a mounted sheet/dialog.
- Pane quirks: hidden pane stalls Base UI exits/toasts and rAF; synthetic input events don't reach React; signed-in flows are RTL-only (pane signed out everywhere); JSX-interpolated headings need `getByRole("heading")` in RTL, not `getByText`.
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP — read `rate_limit_counters` before a prod run; never retry into a 429.
- Deploy verification: GitHub commit status context "Vercel", **the sha from `git rev-parse HEAD`, never retyped**.

## Context, not tasks

W10 ends Wave 2. Standing triggers stay live: P2.9 (MTG rounds), P4.7 round 3 (OP). Owner decisions of 2026-09-19 stand. Premium never gates card data or prices. Event pages carry real player names from public tournament records — keep the source credit on both pages (attribution rule), and keep the noindex.

---

## Ship note — 2026-09-22, feat `92b574a` (docs follow-up in the same package). Wave 2 complete.

Deployed and prod-proven the same day (Vercel status success on `92b574a`). Everything in the contract landed; the deviations/decisions worth recording:

- **Both new loaders resolve leaders via the card_identities subquery precedent** (`loadTopFinishes`'s own move) — the acceptance's "from `tournaments` + `tournament_standings` only" means no deck/stats tables, and that held. `loadTopFinishes(gameId, leaderId, limit?)` kept its two hub callers source-compatible; `TopFinishRow` gained `tournamentId`.
- **The index's two views**: unfiltered = 50 newest events (`RECENT_EVENTS_SHOWN`) with the placement-1 standing's leaders as the D9 "1st:" line (37 of 50 MTG events had a resolved winner at ship — the rest render without the line, honest absence); `?leader=` = that leader's run capped at `ALL_FINISHES_CAP` 100 with a "The 100 most recent of N" disclosure (Tymna: 3315). An unknown `?leader=` slug 404s (hub semantics, not a silently-ignored filter); there is no loading.tsx above the index so the notFound answers a real 404.
- **The 404 gate** mirrors /c/[slug] exactly: `./event.ts` holds one React-cached lookup (id regex `^\d{1,9}$` inside it, so junk shapes cost zero statements) shared by layout/metadata/page. Curl-proven on dev and prod: `/tournaments/999999999` and `/tournaments/abc` → HTTP 404 status, Warden page.
- **Hub shelf rows**: the event name became the internal Link; the external event link stayed as the ArrowUpRight anchor with sr-only "on {sourceLabel}" — the smoke pins (`https://topdeck.gg/event/`, `https://play.limitlesstcg.com/tournament/`) pass on the href alone. The /l/ "All {n} finishes →" href carries `?game=optcg&leader=` and greps as `&amp;` in HTML (the W8b one-line-HTML lesson, hit again while verifying — interpolated JSX also splits text with `<!-- -->`, so grep hrefs, not sentences).
- **ISR proof**: dev never shows the s-maxage signature (the known-ISR /c/ hub curls identically no-cache in `next dev`) — the build table (`● /tournaments/[id]`, `ƒ /tournaments`) plus prod headers are the proof: `x-nextjs-prerender: 1` and second-hit `x-vercel-cache: HIT`.
- **Smoke additions (additive)**: hubs-smoke pins the internal event link + the leader hand-off on both games' finisher hubs; seo-smoke pins sitemap-lists-index, no-event-URLs-in-sitemap, event-page noindex, junk-id 404.
- **Honest-data note**: the Decklist column/link renders only when the source carried a URL — Tymna's 100 newest finishes have zero (Topdeck often doesn't publish them), the OP event page shows them on every row.
- LATER rows added: index depth/pagination (50/100 caps); the hubs' local `ordinal`/`eventDateLabel` mirrors vs the new shared `lib/tournaments/format.ts`.

**No W11 prompt.** The standing state is response rounds only: `P2.9-session-prompt.md` (MTG) and `P4.7-session-prompt.md` round 3 (OP). New work needs a fresh plan session.
