@AGENTS.md

# Deckwarden — working agreement

Deckwarden (deckwarden.gg) is a multi-TCG deck builder. MTG Commander ships first;
One Piece TCG comes in M4 behind the same adapter interface. The execution plan —
stack decisions, schema, adapter contract, milestones — lives in
`deckwarden-build-plan.md`. **That document is the working contract**; when in doubt,
follow it or flag the conflict.

## Session protocol

- One work package (Pn.m from the plan) per session. A package ends **deployed and
  `pnpm check`-green** or it isn't done. Never leave main broken.
- Redesign packages (Rn from `REDESIGN.md`, build plan §6b) count as work packages
  under the same rules.
- Wave-2 packages (Wn from `WAVE2.md`, build plan §6c) count as work packages
  under the same rules.
- Wave-3 packages (Xn from `WAVE3.md`, build plan §6d) count as work packages
  under the same rules.
- Wave-4 packages (Yn from `WAVE4.md`, build plan §6e) count as work packages
  under the same rules.
- Wave-5 packages (Un from `WAVE5.md`, build plan §6f) count as work packages
  under the same rules.
- Anything out of scope goes to `LATER.md` with a revisit trigger — no discussion,
  no "while I'm here" changes.
- `pnpm check` = typecheck + lint + format check + tests. Run it before every commit.

## Stack (settled — don't relitigate)

Next.js App Router + TypeScript strict · Tailwind v4 + shadcn/ui · Neon Postgres +
Drizzle · Better Auth (Discord + Google only, no email) · Postgres FTS + pg_trgm ·
GitHub Actions nightly ingest · Vercel Pro (since 2026-10-23).

## Portability rules (non-negotiable in review)

Vercel Pro since 2026-10-23 ($20/month: one seat plus $20 of usage credit, metered past
it; commercial use is allowed). The site must still be able to move to a VPS in one
weekend, the exit if Vercel's bill or terms stop fitting.

- **No Vercel-proprietary SDKs**: no @vercel/kv, @vercel/blob, @vercel/postgres.
  (`@vercel/og` is fine — it's satori, runs anywhere.)
- `output: "standalone"` stays in next.config.ts.
- Plain route handlers + zod for APIs. No tRPC.
- Postgres access must survive a `pg_dump`/restore to any Postgres host.

## Hard rules

- **Neon free tier ~0.5GB is a design constraint.** Lean rows: no raw Scryfall JSON,
  no stored MTG image URLs (derive from printing ID), current prices only.
- All Scryfall requests send a real `User-Agent` (e.g. `Deckwarden/1.0`) and
  `Accept: application/json` — generic agents get 403'd.
- Another site's terms decide whether a session may automate against it. deckcheck.co's
  forbid it, so its pages are read only when the owner opens them, and nothing from them
  enters the repo.
- Card images: hotlink Scryfall CDN with `next/image` **unoptimized** (or plain
  `<img>`) — Vercel meters image optimization per transformation, and 100-card grids
  burn through it.
  Never crop the artist/© line; `art_crop` requires artist + © visible nearby.
- Premium may never gate card data or prices (Scryfall no-paywall clause).
- Guest decks are **server-side anonymous decks with a claim_token** — never
  localStorage-as-deck-store.
- Every `drizzle-kit generate` migration gets eyeballed before applying.
- App Router caching is explicit: state the caching intent (static / dynamic /
  revalidate) whenever adding a route or fetch.
- **Scratch scripts and smoke runs never target production.** `BASE_URL` is a local
  server (`scripts/smoke/guard.ts` refuses anything else before the first request;
  `SMOKE_ALLOW_REMOTE=1` is a per-run exception the owner approves in the chat, never a
  default), and `.env.local` names a Neon development branch, never the production
  database (`.env.example` says how). A scratch script in `scripts/.tmp/` that takes
  `BASE_URL` imports `../smoke/guard` like the smokes do.

## Conventions

- pnpm only. Node 22+. Vitest for tests (`src/**/*.test.{ts,tsx}`).
- Game logic lives in adapters (`src/lib/games/<game>/`) — pure functions, no IO.
  Core code consumes only the adapter interface, never game specifics.
- One shared name-normalization function (`src/lib/cards/normalize.ts`) used by
  ingest, search, and import parsing alike.
