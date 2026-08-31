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
| Full goldfish playtester (turns, battlefield, draws beyond the opener, London bottoming) | Sample-hand widget shipped in P2.7 (2026-08-30) on share page + editor — now it's a demand sensor: revisit when people actually draw hands. Big surface, incumbents are mediocre here — could be a differentiator later. P2.7 deliberately kept mulligans plan-literal (full redraw of 7, no bottoming) and shipped no draw-next-card button — both are playtester scope. |
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
| Smarter mana-source detection (P1.5's `producedMask` counts conditional producers like Command Tower as all five colors; fetches/treasure-makers not counted) plus analytics that consume role tags (curve targets, role-count vs hub-template comparison) | User feedback that the sources table misleads, or the next analytics-engine session. **P2.4 (2026-08-30) was the "first M2 analytics-adjacent session" and took the call: still deferred.** **P2.7 (2026-08-30) fired the tag-editing row** (chips + free entry in the card detail pane, preset chips reusing the adapter hub template's role labels — one editorial source of truth) — role *tagging* is done; what remains here is analyze.ts consuming those tags and the producedMask fix. |
| Markdown (or any formatting) in deck notes — P2.7 ships notes as plain text with pre-wrap line breaks | Users paste markdown primers or ask for headings/links. Rendering is the easy half; sanitization and a preview toggle are the real cost. |
| Real 403 status on private-deck/folder denial shells (they still serve HTTP 200). **P2.6 (2026-08-30) took the fired call: noindex the shells, keep 200 + the client gate.** Reasoning: (1) the crawler concern — the actual trigger — is fully answered by `robots noindex` metadata, which is also what Next itself injects on real 403s; (2) `forbidden()` requires the experimental `authInterrupts` flag on our pinned Next; (3) `forbidden.tsx` receives no props, so it can't render `PrivateShareGate` (needs deckId) — a real 403 would break anonymous claim-token owners viewing their own private deck at /d/…; (4) the data was never in the HTML. Status-code purity re-earns a look when authInterrupts goes stable AND the owner gate can move fully server-side. | authInterrupts stabilizes in a Next upgrade, or crawlers observed indexing the shells despite noindex. |
| setHint-aware import resolution + set codes in export (P1.6 resolves by name only, so two distinct cards sharing an exact printed name — Mystery Booster "Counters" — merge on import; the parser already captures `setHint`, the resolve route ignores it) | A real user hits it, or when One Piece import lands (M4) where set codes are the primary key anyway. |
| Better Auth's built-in endpoint rate limiting (P2.1 ships without it: its default limiter is per-instance memory — dead on serverless — and the database backend means another table + a write per auth request) | OAuth endpoint abuse observed, or the P2.8 beta hardening pass. |
| Account deletion self-serve (P2.1 privacy page routes removal requests through GitHub issues; Better Auth's deleteUser flow + decks handling — orphan vs delete — needs a decision). Since P2.3 that decision also owns a `decks.likes_count` recount: user deletion cascades their `deck_likes` rows without touching the denorm, so counts on other people's decks drift high by each deleted liker (the engagement code's `greatest(…, 0)` only guards underflow). | First real removal request, or P2.8 beta hardening. |
| Spellbook ingest keeps only combos with EDHREC popularity ≥ 1 or NULL (P2.5 call: the zero-popularity tail was 45k of 109k variants, +38MB on the Neon budget, and unreachable by any popularity-ordered shelf; NULLs kept so brand-new/spoiler combos surface). Lifting the floor is one constant in `spellbook-map.ts` + a re-ingest — data is fully recoverable. Related M3 decision: `findForDeck` semantics for template-requirement combos (`combos.templates` names are stored; a template combo is never "complete" on cards alone). | M3 Combo Radar package — it wants in-deck detection of unpopular combos, and likely lands on paid Neon/VPS where the 38MB stops mattering. |
| `artist` column on `card_printings` (~1.5MB). P2.6's OG images render art_crop + the required artist/© line by fetching artist from the Scryfall API at render time (data-cached daily per printing, og/scryfall.ts) — chosen over a migration because adding the field means touching the hash-guarded ingest the same week its spellbook step first runs unattended, plus a full backfill run. A stored artist would drop the OG path's runtime Scryfall-API dependency. | OG unfurl latency measurably hurts, Scryfall asks us to cut API traffic, or M4's image-mirroring work touches ingest anyway (punk-records carries artist too). |
| OG share images for folders (/f) and profiles (/u) — P2.6 shipped the plan-scoped three (decks/hubs/cards); folders/profiles unfurl with site defaults. | Folder-link sharing shows real usage, or the Deck Passport polish item gets picked up. |
| `accounts` table absent from the nightly user-table backup (`USER_TABLES` in scripts/backup-user-tables.sh; predates P2.2, spotted there): a restore brings users back without their Discord/Google links, leaving sign-in to better-auth's email-based re-linking — or locking people out. (Sessions are rightly excluded — users just sign in again.) Not a one-word fix: pg_dump-ing `accounts` puts OAuth access/refresh tokens at rest in R2 — either accept that or COPY a column subset (issuer, account_id, provider_id, user_id) the way the identity map already does. | Next session touching the backup/restore pipeline, or P2.8 beta hardening — before real accounts accumulate. |

## Deferred infrastructure

| Item | Trigger |
| --- | --- |
| Vercel Hobby → Pro or Hetzner+Coolify | First affiliate dollar / any commercial use, or first overage email. Runbook lives in the repo. |
| Neon free → paid or Postgres-on-VPS | `pg_database_size()` alert at ~350MB, or compute-hour cap pain. |
| Redis / queues / background workers | A measured problem that cron + Postgres can't absorb. Not speculatively. |
