# LATER.md — Deliberately Deferred

The scope-discipline file. Anything that threatens a milestone's package list lands here
with one line on when it earns its way back. Nothing on this list is a "no" — it's a
"not until the trigger fires." (See [deckwarden-build-plan.md](deckwarden-build-plan.md).)

## Deferred features

| Item | Revisit when |
| --- | --- |
| Deck comments (incl. per-card comments) | There's a community to moderate — real daily actives, post-M3. Brings moderation, reports, spam; a standing tax. |
| Full collection manager UI | Editor retention proven (post-M5). Schema exists from M1; ManaBox/Moxfield import + owned badges land in M3. |
| Price history / trend charts | Someone asks twice. Needs the weekly or deck-referenced-only side table — never per-printing-per-day rows. |
| Full goldfish playtester | Sample-hand widget (M2) proves demand. Big surface, incumbents are mediocre here — could be a differentiator later. |
| PWA + offline deck viewing | After M3. Cheap win for paper events; needs a service-worker pass over share pages. |
| Email digests ("new cards fit your decks") | An email provider exists (Resend). First real retention push, post-M3. |
| Natural-language search via Claude API | Behind a feature flag whenever; costs money per query — needs either budget or premium gating. |
| Meilisearch/Typesense | Postgres FTS measurably fails (p95 > 300ms warm or fuzzy quality complaints). Not before. |
| Scryfall `/cards/manifest` incremental sync | Nightly full-bulk job time or Neon compute hours become a measured problem. |
| Self-hosting MTG images on R2 | Traffic makes hotlinking impolite, or Scryfall asks. Planned-for via `image_override` + manifest timestamps. |
| EDHTop16 integration | Topdeck.gg data proves insufficient; requires Discord contact for current API terms. |
| Card Kingdom buy-buttons | Affiliate switch-on. Contact-based partnership; URL structure already supports `partner=` params. |
| Collaborative brewing (live editors, suggestions) | Strong community signal post-M4. Real-time infra is a step change. |
| Mobile card scanner | Never, probably — ManaBox import covers 90% of the value at 1% of the cost. |
| Other MTG formats (Standard/Modern/etc.) | Commander experience is clearly winning and users ask. Legality model already supports it. |
| Native mobile apps | PWA proves insufficient. |
| Deck Passport / QR export page | Nice-to-have polish after OG images (M2) prove the share loop. |
| Matchup guides / Meta Lens deep pages | Requires tournament corpus depth from Topdeck (M3+) plus real usage. |
| Local playgroup spaces | Community features prove retention first. |
| Marketplace, proxy generator, tournament organizer, AI-chat-first interface | Original doc's postpone list — reaffirmed. Proxy tools carry real IP risk (especially One Piece). |
| Type ingest's `buildAttrs` return as `MtgAttrs` (src/lib/games/mtg/attrs.ts) so the attrs contract can't drift from what ingest writes | Next session that touches scryfall-map.ts / the ingest pipeline. |
| Tag-editing UI in the editor (entries carry `tags text[]`; P1.3's tag grouping renders an honest "Untagged" bucket but nothing can set tags yet) | First session after P1.7 — share pages make tag groups visible to readers, which is when empty ones start to hurt. |
| Smarter mana-source detection (P1.5's `producedMask` counts conditional producers like Command Tower as all five colors; fetches/treasure-makers not counted) plus role tagging and curve targets | User feedback that the sources table misleads, or the P1.8 polish pass — whichever first. |
| setHint-aware import resolution + set codes in export (P1.6 resolves by name only, so two distinct cards sharing an exact printed name — Mystery Booster "Counters" — merge on import; the parser already captures `setHint`, the resolve route ignores it) | A real user hits it, or when One Piece import lands (M4) where set codes are the primary key anyway. |

## Deferred infrastructure

| Item | Trigger |
| --- | --- |
| Vercel Hobby → Pro or Hetzner+Coolify | First affiliate dollar / any commercial use, or first overage email. Runbook lives in the repo. |
| Neon free → paid or Postgres-on-VPS | `pg_database_size()` alert at ~350MB, or compute-hour cap pain. |
| Redis / queues / background workers | A measured problem that cron + Postgres can't absorb. Not speculatively. |
