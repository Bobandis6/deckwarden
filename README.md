# Deckwarden

[deckwarden.gg](https://deckwarden.gg) is a deck builder for trading card games.
It ships Magic: The Gathering Commander and the One Piece Card Game behind one
game-adapter interface: pick a commander or a leader, build a legal list with
suggestions, combos and tournament evidence beside it, and share it by link.
Guest decks need no account; signing in (Discord or Google) keeps them.

## What is in this repository

| Path                 | What                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`            | The Next.js App Router site: public pages, the deck editor, the JSON API under `src/app/api`.                                                                                                                             |
| `src/lib/games`      | The game adapters (`mtg`, `optcg`): legality, analysis, search translation — pure functions, no IO.                                                                                                                       |
| `src/db`             | The Drizzle schema, the migration runner and the reference seed. SQL migrations live in `drizzle/`.                                                                                                                       |
| `scripts`            | Ingest jobs (Scryfall, Commander Spellbook, MTGJSON precons, Topdeck.gg, punk-records, Limitless), the nightly's housekeeping (size gauge, anonymous-deck purge, backups and their pruning, advisory watch) and smoke runs. |
| `.github/workflows`  | `ci.yml` (`pnpm check` on every push), `nightly-ingest.yml` (the data jobs and the housekeeping), `restore-drill.yml` (restores the latest backup into a scratch Postgres on demand).                                      |
| `*.md` at the root   | The planning corpus — see [Where the plan lives](#where-the-plan-lives).                                                                                                                                                  |

Stack: Next.js (App Router, TypeScript strict), Tailwind v4 + shadcn/ui, Postgres
on Neon with Drizzle, Better Auth (Discord and Google only), Postgres full-text
search with pg_trgm, GitHub Actions for the nightly ingest, Vercel for hosting.
The build is `output: "standalone"` and uses no platform-specific SDK, so it runs
on any host with Node and Postgres.

## Running it locally

Requirements: Node 22 or newer and pnpm (the version is pinned in `package.json`,
so `corepack enable` is enough).

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local` — every variable is explained in `.env.example`. Point
`DATABASE_URL` at a Postgres of your own (a Neon branch or a local server), never
at a database with other people's decks in it: the scripts and the dev server
write to whatever it names.

```bash
pnpm db:migrate        # applies drizzle/ and seeds games + formats
pnpm ingest:scryfall   # the Magic card corpus (a large bulk download; optional)
pnpm dev               # http://localhost:3000
```

Before every commit:

```bash
pnpm check             # typecheck + lint + format check + tests
```

CI runs the same command on every push to `main`. Deploys go to Vercel from
`main`; the nightly workflow runs the ingest jobs against the production database
from GitHub Actions.

## Data sources

Card data and prices come from [Scryfall](https://scryfall.com) and are never
behind a paywall; combos from [Commander Spellbook](https://commanderspellbook.com);
preconstructed decks from [MTGJSON](https://mtgjson.com); Commander tournament
results from [Topdeck.gg](https://topdeck.gg); the One Piece card corpus from the
punk-records project and One Piece tournament results from
[Limitless](https://limitlesstcg.com). Magic card images are hotlinked from
Scryfall's CDN with the artist and copyright line kept visible; One Piece images
are mirrored to the site's own image host. Deckwarden is unofficial fan content
and is not affiliated with Wizards of the Coast or Bandai.

## Where the plan lives

- [`deckwarden-build-plan.md`](deckwarden-build-plan.md) — the execution plan:
  stack decisions, schema, the adapter contract, milestones. The working contract.
- [`CLAUDE.md`](CLAUDE.md) — the working agreement for the Claude Code sessions
  that build the site: one work package per session, `pnpm check` green before
  every commit, the portability and data rules.
- [`LATER.md`](LATER.md) — deliberately deferred work, each row with the trigger
  that brings it back.
- [`REDESIGN.md`](REDESIGN.md), [`WAVE2.md`](WAVE2.md) … [`WAVE5.md`](WAVE5.md) —
  the package lists of the shipped waves.
- `*-session-prompt.md` — the brief each package session started from, kept as
  the record of what was asked.

## Security

Please report a vulnerability privately through the repository's Security tab
("Report a vulnerability"), not in a public issue.
