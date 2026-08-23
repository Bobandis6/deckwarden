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
- Anything out of scope goes to `LATER.md` with a revisit trigger — no discussion,
  no "while I'm here" changes.
- `pnpm check` = typecheck + lint + format check + tests. Run it before every commit.

## Stack (settled — don't relitigate)

Next.js App Router + TypeScript strict · Tailwind v4 + shadcn/ui · Neon Postgres +
Drizzle · Better Auth (Discord + Google only, no email) · Postgres FTS + pg_trgm ·
GitHub Actions nightly ingest · Vercel Hobby.

## Portability rules (non-negotiable in review)

Vercel is a free incubator; the site must move to a VPS in one weekend at the first
affiliate dollar (Hobby is non-commercial).

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
- Card images: hotlink Scryfall CDN with `next/image` **unoptimized** (or plain
  `<img>`) — Vercel Hobby's image-optimization quota dies fast on 100-card grids.
  Never crop the artist/© line; `art_crop` requires artist + © visible nearby.
- Premium may never gate card data or prices (Scryfall no-paywall clause).
- Guest decks are **server-side anonymous decks with a claim_token** — never
  localStorage-as-deck-store.
- Every `drizzle-kit generate` migration gets eyeballed before applying.
- App Router caching is explicit: state the caching intent (static / dynamic /
  revalidate) whenever adding a route or fetch.

## Conventions

- pnpm only. Node 22+. Vitest for tests (`src/**/*.test.{ts,tsx}`).
- Game logic lives in adapters (`src/lib/games/<game>/`) — pure functions, no IO.
  Core code consumes only the adapter interface, never game specifics.
- One shared name-normalization function (`src/lib/cards/normalize.ts`) used by
  ingest, search, and import parsing alike.
