# Session-start chore: legendary Vehicle/Spacecraft commanders (LATER row, gap (a))

Standalone chore for the START of the next session, before its package — the
smoke-hardening pattern: one focused commit, test-pinned, deployed by the
nightly, no scope bleed into the package. It fires gap (a) of the LATER.md
"Commander-resolution coverage" row and ONLY gap (a).

## The bug, verified 2026-09-03 (P3.8 session)

`isLeaderCandidate` (src/lib/games/mtg/scryfall-map.ts) flags a leader when the
FRONT face type line has "Legendary" + "Creature", or the oracle text matches
/can be your commander/i. WotC's errata REMOVED that sentence from legendary
Vehicles when the rules made all legendary Vehicles (and Spacecraft)
commander-legal — verified in prod: `Shorikai, Genesis Engine` ("Legendary
Artifact — Vehicle") has NO commander line in its stored oracle_text,
`is_leader_candidate = false`, and ZERO tournament_standings rows despite 36
top-16 finishes in the 180-day raw corpus. So every such commander: has no hub,
is missing from the editor's commander picker, and every one of their
tournament standings skips as `unresolved_commander` (the Topdeck leader map is
leaders-only by design).

Measured cost (unresolved-commander tally over `.topdeck-raw/`, 2026-09-03, of
242 unresolved standings total): Hearthhull, the Worldseed 45 · Shorikai 36 ·
Inspirit, Flagship Vessel 24, plus probable smaller ones ("Kavaero,
Mind-Bitten" 4, "The Fantasticar" 2 — VERIFY their type lines before counting
them) ≈ ~110–130 standings, the biggest and cleanest of the three gaps.

## Do first: verify the rule, not from memory

Confirm the actual Commander rule ("a legendary Vehicle or Spacecraft can be
your commander" — the Aetherdrift-era change) from the official commander
rules (mtgcommander.net) or WotC's announcement. Scryfall `legalities` does
NOT encode can-be-commander, so it cannot substitute. If the rule turns out
narrower than "all of them", scope the predicate to match and say so in the
commit.

## The fix (one commit)

In `isLeaderCandidate`: front face contains "Legendary" AND any of
"Creature" / "Vehicle" / "Spacecraft" (keep the oracle-text fallback for
planeswalker-style grants). Front face ONLY — same `split(" // ")[0]` as
today. Pin in scryfall-map.test.ts: a Shorikai-shaped fixture (Legendary
Artifact — Vehicle, no commander line) → true; a non-legendary Vehicle
(Smuggler's Copter-shaped) → false; existing cases untouched. `pnpm check`
green, push.

## Rollout mechanics (already built — just verify them)

The nightly's Scryfall re-ingest flips the flags via the tuple-compare update;
the slug post-pass (scripts/ingest/assign-leader-slugs.ts) then slugs the
newly-flagged leaders (slugs are write-once — confirm the post-pass picks up
new flags); the Topdeck leader map picks them up the same night, so FUTURE
events' standings resolve. Verify with one manual workflow_dispatch (the P3.8
pattern): flags true for Shorikai/Hearthhull/Inspirit, slug exists,
/c/shorikai-genesis-engine renders (tournament shelf empty until new events —
correct), and the run's `unresolved_commander` stat drops.

## What does NOT retroactively heal — decide, disclose, don't do

Settled events never re-fetch, so historical standings for these commanders
stay off the shelves, and their tournaments are already marked
`cards_aggregated_at`, so their lists are NOT in the aggregate. Recovery = the
full rebuild (truncate both stats tables, NULL the markers, run
scripts/ingest/topdeck-aggregate-backfill.ts over the iCloud archive
`deckwarden-archive/topdeck-raw-backfill-2026-09-01/` + the R2 nightlies) —
that is the LATER pruning row's machinery, NOT this chore. Note in the LATER
row that history recovers at the next rebuild; optionally a
`TOPDECK_WINDOW_DAYS=180` manual ingest re-fetches standings for the shelves
(idempotent merge, ~18 polite requests) without touching the aggregate —
owner's call, fine to skip.

## Scope guard

Gaps (b) DFC-front leader names (Ral, Monsoon Mage ×17…) and (c) Background
pairs (Clan Crafter ×26…) STAY in LATER — different fixes, different product
questions. No aggregate rebuild. No weights/evidence changes. After the chore:
update the LATER row (gap (a) fired, with the verified rollout facts), then
start the session's actual package.
