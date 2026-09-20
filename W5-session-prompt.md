# W5 session prompt — Card-page printings gallery + printings API (+ REC-1 default-printing fix)

Pull latest, then run W5 — the fifth Wave-2 package. **`WAVE2.md` is the contract**; read its W5 section (steps 1–5 are the build order), D4 (the ASCII spec — it IS the design, md-and-up AND phone), the W5 row of the pin matrix, and REC-1. W1–W4 are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`). W5 turns the card page's flat printings table into the thing players come for: click a printing → it shows in the main spot; a capped API serves the long tail; REC-1 stops Sol Ring's default being a priceless box-set printing.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run preempts everything. (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run the `P2.9-session-prompt.md` round (MTG) or `P4.7-session-prompt.md` round 3 (OP) as its own session first (2026-09-19 census baseline: 25 decks — 24 MTG + 1 OP, the owner's — 1 user, likes 1 · bm 0 · folders 1; W4's QA deck was deleted, the count is clean). (3) Working tree clean at or after W4's docs commit (feat is `077401a`). (4) State your baseline: **814 tests / 108 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-19 on `077401a`), and `pnpm db:size` (262.8 MB on 2026-09-19, alert 350).

## What W5 is NOT (scope fence)

NOT the editor's printing picker (W6 — do not touch `card-detail-pane.tsx` or `editor-state.ts`), NOT buy links (W7), NOT a deck-page change, NOT a new image host or rendition, NOT pagination UI beyond "Show all" (the API cap is the pagination). The One Piece price rule (no price columns) and the © line stay exactly as they are. `?printing=` is view state, never deck state. Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-19 against `077401a` — re-grep lines, trust the shapes)

- **Route to copy**: `src/app/api/cards/[id]/art/route.ts` — `export const dynamic = "force-dynamic"` at :34, `const PARAMS = z.object({ id: z.uuid() })` at :36, `HIT_CACHE`/`MISS_CACHE` Cache-Control constants at :39-40. W5's `printings/route.ts` follows this shape with **`s-maxage=3600, stale-while-revalidate=86400`** (404s get the miss cache), excludes `isRemoved`, caps at 250 rows returning `{ total, truncated }`, reads through `cp_by_identity`, no rate limit (art's stance).
- **Page data**: `src/app/(site)/cards/[id]/card.ts` — the printings select at :22-38 (currently uncapped; every row goes to the page), `printings.sort` puts the default first at :54. Add `hasBack` to the select; the page passes **≤ 100 slim rows** (no URLs — derive from printing id; `imageOverride` only when non-null).
- **Hero**: `page.tsx:126-137` — `CardImage` `w-72` with `priority`, the R5b accent band (`SurfaceHeader`) above it, `-mt-20 md:-mt-24` overlap, `fallback` "Card image coming soon" / "No image". The gallery provider replaces this block but MUST keep `priority` on the default image and the fallback strings (`optcg-smoke:167` accepts mirror image OR the coming-soon text).
- **Table**: `page.tsx:191-237` — `<table>` with Set / # / Rarity (+ USD / Foil for non-OP; the `gameCode === "optcg"` guard at :195-196 and :204/:224 is the P4.4 price rule — keep it), "(shown)" marker on the default at :216-218. D4 keeps `<table>` semantics: the Set cell becomes a `<button aria-pressed>` with a 26×36 lazy `small` thumbnail, an `after:absolute after:inset-0` stretch makes the row the target, pinned row gets `bg-muted` + 2px left rule in `--accent-game` + the word "Shown".
- **Preview**: `src/components/deck/card-name-preview.tsx` — `CardNamePreview` at :35 takes `{ card: EditorCard, children }`; `PREVIEW_OPEN_DELAY_MS = 300` / `PREVIEW_CLOSE_DELAY_MS = 150` at :31-33. Widen to `{ name, image }` (step 4) and reuse the delays; hover/focus opens at `w-56` with caption "CMM · #410 · Unc.", taps never open it.
- **`?printing=` view state**: read via `useSyncExternalStore` with a **null server snapshot**, written via `history.replaceState` — the W4 `src/lib/decks/leader-pick-intent.ts` file is the freshest precedent for the store discipline (raw-string snapshot cache; never `useSearchParams` — `/cards/[id]` is ● and must stay ●). Absent from the canonical tag (seo-smoke:286 pins the bare canonical).
- **REC-1**: `scripts/ingest/scryfall.ts` ~:339-355 — the `tmp_default_winner` CTE ranks `st.digital ASC, (st.set_type IN ('promo','memorabilia')) ASC, (p.released_at > current_date) ASC, p.released_at DESC NULLS LAST, p.id`. Insert `(st.set_type = 'box') ASC` and `((p.prices->>'usd') IS NULL) ASC` **ahead of `released_at DESC`**; note the change in the run's `stats`. Two-pass clear/set already keeps `cp_default_one` valid — don't restructure it.
- **W4 lesson that bites here**: Base UI Button-as-Link renders `role="button"` on anchors — RTL queries by button role + tagName. And islands on ● pages hydrate late: DOM checks right after navigation can miss the hydrated state — re-poll before concluding failure.

## Verify-first list (never from memory)

1. **Route stays ●**: `pnpm build` route table — `/cards/[id]` keeps ●, the new API route is ƒ; zero other type changes.
2. **LCP**: the hero stays the LCP element after the provider wraps it — `priority` present in the served HTML (`<link rel="preload" as="image">` or fetchpriority attr), and only VISIBLE thumbnails load (lazy attr on the 26×36s; check the network tab on a 100-row page).
3. **Basic-land bulk**: a basic land (Forest) page's HTML carries ≤ 100 rows, "Show all" fetches the rest from the API or says "Showing 250 of N — newest first"; the API's `total`/`truncated` are honest against a `select count(*)`.
4. **`?printing=<id>` reproduces the view on reload** and is absent from the canonical tag; back/forward don't gain entries (`replaceState`, never push).
5. **One Piece pins**: `optcg-smoke:167` (image slot honest), `seo-smoke:374` (no `>USD<` on OP card pages), © line untouched near art. OP pages get the same gallery WITHOUT price cells.
6. **Reduced motion** = instant swap (no crossfade); keyboard focus opens the preview, Esc closes it.
7. **REC-1 proof**: run the ingest's default-printing pass (or replay its SQL against a temp table) and diff before/after winners for Sol Ring + 2–3 box-set victims; after deploy, the NEXT nightly is the real backfill — state in the ship note that ambient art shifts for decks with no chosen printing (the contract's own risk note).
8. **Smokes on dev**: `smoke:seo`, `smoke:optcg`, `smoke:hubs` (+ `counters:reset` if the battery fills local counters — creates 10/h before versions; never retry into a 429). Deploy via the GitHub commit status (context "Vercel", full sha). Prod pass read-only.

## Design decisions to make explicitly (disclose + pin each)

- **Where the provider boundary sits**: one client provider owning `selectedPrintingId` around hero + table (D4) — record what stays server-rendered (the identity text block should).
- **Slim-row shape**: exactly which fields cross to the client (no stored image URLs — the lean-rows rule).
- **Phone Drawer contents** (D4 phone sketch): large image, set line, prices, and the W7 buy slot placeholder — record whether the Drawer reuses `ui/drawer.tsx` as-is.
- **"Show all" fetch state**: where the fetched tail lives (component state is fine — it's view state) and what the button reads while loading.

## Deployable outcome

`pnpm check` green and deployed; verified ON PROD read-only: D4 complete on md+ and phone — sticky hero column, aria-pressed rows with thumbnails, PreviewCard hover/focus, `?printing=` deep link, capped inline rows + API tail, REC-1 ordering landed with its stats note. Acceptance walk from WAVE2 §W5 done on dev (Sol Ring for bulk, one OP card for the price rule, one DFC for `hasBack`/flip). Route table: `/cards/[id]` ● held, one new ƒ API route. Tests: new route + gallery tests per the pin matrix; `seo-smoke:287-289, 374` + `optcg-smoke:167` green untouched. Docs in the same package: `WAVE2.md` tracker W5 ticked with the sha; a dated ship-note in this file; memory updated; **`W6-session-prompt.md` written** the way this one was. db:size stated. Nothing posted, seeded, or simulated.

## Session notes (environment, updated by W4)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node/pnpm + gh); psql/aws absent. Census via a scripts/.tmp tsx probe if signals need checking (tsconfig-excluded; async main(), no top-level await; the `users` table is `users`, `game_id` is a smallint keyed by `games.code`; DELETE any probe after).
- **Dev shares the ONE Neon DB with prod.** Any deck a QA flow mints is a real row — delete it by id (`user_id is null` guard) and re-prove the census before closing. W5 should need no deck at all (card pages are deckless).
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build` (shared `.next`). `next dev` re-adds the AGENTS.md block — commit it with your work if it appears.
- Pane quirks (W4-confirmed): real Return keypresses may not submit GET forms even on a VISIBLE pane — use `form.requestSubmit()` or a dispatched keydown; synthetic `input.value` + Event('input') does NOT reach React state — use real pane keystrokes; hidden pane stalls Base UI exits/toasts and freezes CSS transitions — verify via DOM/curl/jsdom; islands on ● pages hydrate late — re-poll.
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP — this session creates no prod decks. ISR proof on prod: `x-vercel-cache` MISS ×2 then HIT.
- Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.

## Context, not tasks

Sequence after W5: W6 editor printings → W7 buy links → W8a/b precons → W9a/b/c autofill → W10 tournaments. P2.9's and P4.7's standing triggers still exist beside the W-series and get their own round, never a slice of a W-session. Owner decisions of 2026-09-19 stand. Bandai and Azuki emails unanswered — posture unchanged. Cold-start rule holds: no simulated decks, posts, or metrics. Premium never gates card data.
