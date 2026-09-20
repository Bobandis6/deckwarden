# W6 session prompt — Editor printings ("Use this printing in deck")

Pull latest, then run W6 — the sixth Wave-2 package. **`WAVE2.md` is the contract**; read its W6 section, D5 (the ASCII spec — it IS the design), the W6 row of the pin matrix. W1–W5 are live (`e40342d`, `ce9d7c2`, `0da07cc`, `077401a`, `34a5d41`). W6 puts a Collapsible "Printings" list in the editor's card pane, fed by W5's API, and makes choosing a printing a REAL deck edit — the commander's ambient art and the list/grid images follow.

Pre-flight, in order. (1) **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). **Expected, not drift**: the first nightly at or after 2026-09-20 is REC-1's real backfill — its stats carry `default_rank_rule: "v2: …"` and `defaults_cleared`/`defaults_set` near **2,826** (measured read-only on 09-20); Sol Ring's default becomes MSC 212 and ambient art shifts for decks with no chosen printing. A red run still preempts everything. (2) **A warm beta signal outranks a package**: owner posted / feedback / a stranger's 429 / a new issue → run the `P2.9-session-prompt.md` round (MTG) or `P4.7-session-prompt.md` round 3 (OP) as its own session first (2026-09-20 census baseline: 25 decks — 24 MTG + 1 OP, the owner's — 1 user, likes 1 · bm 0 · folders 1). (3) Working tree clean at or after W5's docs commit (feat is `34a5d41`). (4) State your baseline: **837 tests / 111 files / 6 pre-existing `no-unused-vars` warnings / 0 errors** (measured 2026-09-20 on `34a5d41`), and `pnpm db:size` (262.8 MB on 2026-09-20, alert 350).

## What W6 is NOT (scope fence)

NOT buy links (W7 — the pane footer's "Buy ↗" slot stays empty), NOT a card-page or share-page change (W5 shipped the gallery; the deck page renders the chosen printing already), NOT a printings UI anywhere but `card-detail-pane.tsx`, NOT a migration (the write path exists end to end — see facts), NOT version-diff awareness of printing swaps (LATER row 45 — W6 only updates its trigger text). Est. price stays cheapest-printing and the pane SAYS so (D5). Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-20 against `34a5d41` — re-grep lines, trust the shapes)

- **The write path already exists end to end — W6 adds NO schema or API work**: `EditorEntry.printingId?: string` (`src/lib/decks/editor-state.ts:35`), `serializeEntries` sends it only when set (`:172-178`), and the cards PUT validates it (`src/app/api/decks/[id]/cards/route.ts:47` zod, `:133-143` ownership — a printingId not owned by its cardId is collected and rejected). `src/lib/decks/deck-cards-wire.ts:85-88` already resolves the chosen printing on load (`{ id: r.printingId, imageOverride: r.chosenImageOverride }` → the card's display image), which is why "reload keeps it" is free.
- **W5's route to reuse**: `GET /api/cards/[id]/printings` → `{ printings: GalleryPrinting[], total, truncated }`, newest first, 250 cap, edge-cached 1h/24h. `GalleryPrinting` = `{ id, setCode, setName, collectorNumber, rarity, year, isDefault, hasBack, usd, usdFoil, imageOverride? }` and `printingCaption()`/`rarityLabel()` live in `src/lib/cards/printings.ts`. Image URLs derive client-side via `src/lib/cards/images.ts` (`embeddablePrintingImageUrl`, `thumbnailUrl` — the blank-spacer rule for OP rows).
- **The pane**: `CardDetailPane` at `src/components/editor/card-detail-pane.tsx:31`, props `{ adapter, card: EditorCard | null, tagging?: TagEditing | null }`. Footer `<p>` at `:77-84` ("from $X.XX" + "Card page →") — D5 places `▸ Printings · N` AFTER it, `Collapsible` (ui/collapsible.tsx exists), **closed by default, fetched on FIRST open only** (R2's rule: never enrich every search result). `TagEditor` at `:74` is keyed `card.id` — a fresh sub-state per card is the pane's idiom.
- **How the pane gets state**: `tagging` is built in `deck-editor.tsx:866` (useMemo over the selected entry) and passed at `:999`/`:1053`/`:1184` (all three tiers pass `card={preview}`). W6's printing selection plumbs the same way: find the entry for the previewed card, hand the pane `{ current printingId, onSetPrinting }`-shaped props built beside `tagging`.
- **The edit**: pure `setPrinting()` in `editor-state.ts` beside `setQty` (`:112`) and `setTags` (`:158`) — same shape: validate, return new entries or an error string → `applyEdit` (`deck-editor.tsx:534`). Toast with a REAL-edit Undo: copy the add-toast at `:605-615` (`toast.add`, Undo = apply the previous printingId back through `setPrinting`, never a state rollback). D5's toast text: "Krenko now uses SLD 2783 · Undo".
- **Images must follow in memory**: `EditorCard.image` is per card (`editor-state.ts:24`) — after a printing choice, update the in-memory card map AND `preview` with `embeddablePrintingImageUrl(chosen, "normal")`, or lists show the default until reload (the W6 step's own warning). The commander's ambient art follows automatically: `use-leader-art.ts` re-fetches when `(cardId, printingId)` changes (`:10`, `artTargetKey` `:56`) — verify the editor passes the CHOSEN printingId to it (grep `useLeaderArt(` call sites).
- **"Use this printing in deck" enablement** (D5): enabled when the card IS in the deck and the selection differs from the entry's current printing (explicit or default). The list's selected row previews in the pane image WITHOUT editing (previewing never mints a deck — the create-count tests pin this).
- **W5 lessons that bite here**: Vercel rewrites the API's client Cache-Control to `public` — the edge cache is proven by `x-vercel-cache: HIT`, not the echoed header. React 19 serializes `fetchPriority` camelCase — grep case-insensitively. Base UI modal surfaces make the page behind them inert in RTL — query the raw DOM. jsdom `Image` has no `decode()`.

## Verify-first list (never from memory)

1. **Create-count pins**: `deck-editor.test.tsx` create-count tests stay green — opening the Collapsible and clicking rows to PREVIEW never creates a deck or marks dirty; only "Use this printing in deck" goes through `applyEdit`.
2. **Fetch-on-first-open only**: open → one request to W5's route; close/reopen, switch cards and come back → no refetch for the same card in the same pane session (decide and disclose the cache scope: per card id in component state is fine).
3. **The real edit round-trips**: choose a printing → autosave PUTs `printingId` on that entry (network tab) → reload → the entry still shows the chosen printing's image and the pane's list marks it "In deck".
4. **Commander follow**: choose a printing for the LEADER → ambient art crossfades without a reload (useLeaderArt keys on printingId); the deck list/grid image updates immediately (the in-memory map update).
5. **Undo is a real edit**: Undo in the toast → entries carry the previous printingId again, autosave PUTs it, nothing rolls back client-only.
6. **OP pane**: no price column in the printings rows (P4.4), blank spacer thumbs, and the pane still renders for a game whose card has one printing (Collapsible hidden or honest at N=1 — decide and disclose).
7. **Guest draft**: in a pre-create draft, choosing a printing must not crash or mint a deck — it's an entries edit like any other (the first real add creates; check how draft mode treats non-add edits and disclose).
8. **Smokes on dev**: `smoke:seo`, `smoke:optcg`, `smoke:hubs` (+ `counters:reset` if the battery fills local counters — creates 10/h before versions; never retry into a 429). Deploy via the GitHub commit status — context "Vercel", **the sha from `git rev-parse HEAD`, never retyped** (a wrong sha polls "none" forever, W5's lesson). Prod pass read-only.

## Design decisions to make explicitly (disclose + pin each)

- **Where the fetched rows live** (per-card component state vs a module cache) and the loading/error row states.
- **Row markup in the pane** (a compact list, not W5's table — D5 sketch shows thumb + set + code + price; reuse `printingCaption`).
- **How `setPrinting` addresses the entry** (zone + cardId? the entry the preview belongs to?) and what it does when the card sits in TWO zones (leader + main is impossible; main + side is real for MTG — decide: edit the zone the preview came from, or all entries of that card; disclose).
- **What "In deck: default printing" shows** when the entry has no explicit printingId (D5 shows the line — it names the default, not "none").

## Deployable outcome

`pnpm check` green and deployed; verified ON PROD read-only (no deck writes on prod — the round-trip proof runs on dev against the shared DB with a QA guest deck DELETED after, census re-proven 25). D5 complete: Collapsible fetched on first open, preview-on-click, "Use this printing in deck" as a real autosaved edit with toast + real Undo, ambient art + list images follow, reload keeps it. `editor-state.test.ts` gains `setPrinting` tests (the pin matrix row); create-count tests untouched and green. Docs in the same package: `WAVE2.md` tracker W6 ticked with the sha; a dated ship-note in this file; LATER row 45's trigger text updated; memory updated; **`W7-session-prompt.md` written** the way this one was. db:size stated. Nothing posted, seeded, or simulated.

## Session notes (environment, updated by W5)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node/pnpm + gh); psql/aws absent. Census via a scripts/.tmp tsx probe (dotenv + postgres, the db-size.ts pattern — `@/` imports don't resolve from scripts/.tmp); DELETE any probe after.
- **Dev shares the ONE Neon DB with prod.** The W6 round-trip proof needs a deck — mint ONE guest deck on dev, delete it by id (`user_id is null` guard), re-prove census 25 before closing.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`; stop it before `pnpm build` (shared `.next`). `next dev` re-adds the AGENTS.md block — commit it with your work if it appears.
- Pane quirks (W5-confirmed): the native-value-setter + `dispatchEvent(new Event('input', {bubbles:true}))` trick DOES reach React state (plain `.value=` does not); real Return keypresses may not submit GET forms — `requestSubmit()`; hidden pane stalls Base UI exits/toasts and freezes CSS transitions — verify via DOM/curl/jsdom; islands hydrate late — re-poll before concluding failure (a screenshot can catch pre-hydration state).
- Theme flips for dev screenshots: `localStorage.theme = "light"` (next-themes' key; `deckwarden:appearance` is backgroundArt only). Clean it up after.
- Prod curls need `--compressed`; deck-create budget 10/h + 30/day per IP. ISR proof on prod: `x-vercel-cache` MISS ×2 then HIT.
- Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.

## Context, not tasks

Sequence after W6: W7 buy links → W8a/b precons → W9a/b/c autofill → W10 tournaments. P2.9's and P4.7's standing triggers still exist beside the W-series and get their own round, never a slice of a W-session. Owner decisions of 2026-09-19 stand. Bandai and Azuki emails unanswered — posture unchanged. Cold-start rule holds: no simulated decks, posts, or metrics. Premium never gates card data.
