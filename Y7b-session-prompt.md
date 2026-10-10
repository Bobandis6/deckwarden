# Y7b session prompt — Swap in place ("Swap…" on deck rows, "Swap in…" at 100/100 with the Cut Coach's partner, "Swap…" on the conflict callout's rows; one Undo restores both cards)

## Ship note — 2026-10-10, feat `053130f`, deployed (Vercel status success on the full sha at 19:27:13 Z; CI green)

**Shipped. The prompt below is history. Next is `Y8-session-prompt.md` (Budget Twin). The r/EDH post (P2.9 round 3) hadn't gone out at this session's start; it stays the owner's to schedule.**

**Pre-flight**: Y7a's docs at `8298bbe`; `_journal.json` at idx 17; nightlies green through run 38072279069 (`tagger roles: 17 fresh, 0 kept, 0 off`; rows 168 and 170 quiet; the ruleset watch green). Read-only database access and dev writes approved. Y7a's owed click: done, it worked. Baseline on `8298bbe`: 1,900 tests / 187 files / 6 warnings / 0 errors; the route table saved. Census 209 deck rows (16 account + 12 guest + 181 precons, 1 user); `pnpm db:size` 285.9 MB.

**What shipped** (decisions in WAVE4's tracker and REDESIGN.md "Y7b decisions"):
- **`src/lib/recommend/swap-in.ts`** — `planSwapIn` (pure): `rankCuts` with the user's tags → the cheapest cut in the incoming card's curve bucket (clamped to the last) that isn't a complete-combo piece, then the bucket's others, then every other card (the unranked by name); `cutCombosFromFacts` maps the bracket line's combo facts the way the alternatives route does.
- **`src/components/editor/swap-sheet.tsx`** — `SwapSheet` ("Swap X": Y7a's alternatives, shared through `useAlternatives` + `AlternativesContent`) and `SwapInSheet` ("Swap in X": the partner with its tradeoff line and focus on its Swap, "Choose another card", the combo note when the facts can't protect, the copies and already-in-the-deck lines). Both take the dialog slot (`"swap"`, `"swap-in"`): a Drawer on phones, a Modal from md.
- **The doors** — a text row's ⇄ "Swap…" (main-list cards the adapter offers, 44 px on touch, a spacer on refused rows, never the share page or the grid); at the maximum, search's Add / Enter / double-click and the single adds in Suggestions and the Radar read "Swap in…"; the Why sheet's conflict callout gains "Swap {card}…" per swappable card.
- **The editor** — every door lands in `swapOne` (Y7a's swap generalized): one copy out, one in, in place; "Swapped A → B · Undo", one Undo restoring both cards exactly. Focus returns after the closing commit (`closeFocusRef`): the row, the new card's row, the search box, or the bracket line / "Why?". `SwapMeta` gains `bucketName` and `unmatched`.

**Found by the live checks**: (1) Base UI resolves a dialog's `finalFocus` in the closing commit, before the DOM is final — it focused a "Why?" that vanished as the line went to "Checking combos…"; focus now returns from a post-commit effect. (2) A JS click (and Safari's) doesn't focus the opener, so "previously focused" isn't trustworthy — each sheet names its return target. (3) "Swap in…" for a card already in the list adds a second copy (as Add does) — the sheet now says so. (4) Seedborn Muse holds none of the 17 roles, so its callout swap is Y7a's honest "No community roles" dead end; Farewell's works end to end.

**Verified**: `pnpm check` 1,933 tests / 189 files / the same 6 warnings / 0 errors; 40 mutation checks, all caught; the route table byte-identical; the dev pass at 390 / 768 / 1200 / 1440 in both themes (two QA decks, deleted with their tokens; the census re-proved at 209); `smoke:alternatives` green on dev (the gold set 88.0%, unchanged); prod signed out with zero deck writes. LATER rows 185–190 new; row 31 annotated.

**Owed — the owner's click** (signed in, prod): on Nelson & Murdock (100 cards), search a card → its row reads **Swap in…** → the sheet names the suggested cut with its reason → **Swap** → the toast reads "Swapped A → B · Undo" and the deck is still 100 → **Undo** before the toast closes (both cards back where they were). Then once: a row's ⇄ **Swap…** (hover a deck row) → pick an alternative.

Pull latest, then run Y7b, the twelfth Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s decisions row on the conflict callout (74: "One place names over-target cards — the bracket sheet's conflict callout; in Y7b each row gains 'Swap…', which *is* 'lower the bracket'").
2. **D5**'s conflict-callout paragraph (339) and **D8** in full (377–383; Y7b's half is "The surfaces").
3. The **Y7b** block in section E (542–548), its pin-matrix row ("deck-row actions; 'Swap in…'" must update; the `applyListSwap` pins must stay green) and **Verification (whole wave)**.
4. REDESIGN.md's **"Y7a decisions"** — the route, `swapCard`, the per-card Undo, lands never offered, the curve left out of the ranking, the honest empties.
5. LATER rows **182** (role precision), **183** (the tradeoff without user tags), **184** (unranked cards), **31** (mana sources — land swaps are its trigger).
6. Y7a's ship note at the top of `Y7a-session-prompt.md`.

Y7b makes a swap something you do from where you already are, so a full deck never passes through 99/100:
- **"Swap…" on deck rows** (the editor's text rows, and the grid if it fits): a main-list card that the adapter offers alternatives for gets a "Swap…" action beside its steppers. It opens that card's alternatives (Y7a's route and rows) and a pick swaps in place through Y7a's `handleSwap`.
- **"Swap in…" at 100/100**: when the deck is at its maximum, adding a card from search (and wherever else an "Add" would push past the maximum) offers **"Swap in…"** instead — the card comes in and a **cut partner** goes out in one edit. The partner is the Cut Coach's (`rankCuts`) cheapest cut **within the added card's curve bucket** (`meta.curve.bucketOf`), named with its tradeoff line, with a way to pick another.
- **The conflict callout's rows** (the Why sheet's "Above your target"): each card a factor names gains "Swap…", which opens its alternatives under the deck's goals — so one swap lowers the bracket one card at a time.
- **One Undo restores both cards** (Y7a's per-card Undo shape: the incoming card back to its quantity, the outgoing row back exactly).

**No migration and no new route** (the route table must be byte-identical). One Piece shows none of it (no `swap` declared), with no apology copy.

Pre-flight, in order.
1. **Y7a has shipped.** `WAVE4.md`'s tracker ticks Y7a (feat `c269d84`, fixes `6ca1f3b`, `b81bbde`); `_journal.json`'s last entry is idx 17.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red ingest is P4.7 branch F and preempts everything; a red ruleset watch means the Game Changers changed (move the pin first; LATER row 174 if the ruleset `version` moves). From Y7a on, the Scryfall step logs `tagger roles: N fresh, N kept, N off` — anything but 17 fresh means a role kept its stored cards or was switched off: read `stats.tagger.roles.error` before trusting the gold set. `counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168.
3. **A warm beta signal outranks a package.** The r/EDH post (P2.9 round 3) hadn't gone out when Y7a started. **Ask first whether it went out and what came back.** If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**, for read-only database access (the census, `pnpm db:size`, the counters) and for dev writes (dev shares prod's database: a swap or a "Swap in…" in a dev draft mints one deck; read the deck-create counters first; delete QA decks with their tokens and re-prove the census). Say up front that the owner's click comes at the end (signed in, prod). Ask whether Y7a's owed click was done (a staple on one of their decks → Alternatives → pick one → "Swapped A → B · Undo" → Undo).
5. **Working tree clean**, at or after Y7a's docs commit. Another session shares this working copy: `DESIGN-LAB-session-prompt.md` (untracked, from a Home session) is not yours — leave it. Stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **empty**.
   - `pnpm check` after Y7a: 1,900 tests / 187 files / 6 warnings / 0 errors (on `b81bbde`; the docs commit since changed no test).
   - `pnpm db:size`: 285.9 MB on 2026-10-10 (after the roles landed).
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); one deck with goals and a budget (Nelson & Murdock, target 3, ≤ $5 a card).

## What Y7b is NOT (scope fence)

- NOT Budget Twin or "Fit my budget" (Y8). NOT land swaps (lands are never offered — LATER row 31's trigger stays unfired unless you decide otherwise, with produced-color advice).
- NOT a change to Y7a's ranking, roles or route. NOT roles in Autofill or the Cut Coach (the owner's rule: their role evidence stays the user's own tags).
- NOT a card-page Alternatives section (LATER 156), embeddings (154), curated notes (155), per-card role review (182).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-10 against `b81bbde`; re-grep lines and trust the shapes; `autofill-sheet.tsx`, `decks/autofill/route.ts` and `lib/decks/cards.ts` hold a NUL byte, so use `grep -a` and byte-safe edits)

- **Y7a's pieces to reuse:**
  - `src/components/editor/alternatives-section.tsx` — `AlternativesSection({adapter, card, swap})`, `SwapEditing {body, onSwap}`, `AlternativesBody` (the draft Suggestions snapshot + `cardId`), `AlternativeRow`, `AlternativesResponse` (`reason`: `no-roles` / `not-offered` / `goals` / `none`), `priceDelta`. It asks on open, keeps each answer per list (`doneRef`), renders the tradeoff, the rows, "N hidden by your goals · Show". Its rows are module-private (`AlternativeItem`) — export or extract them if a second surface lists alternatives.
  - `src/components/editor/card-detail-pane.tsx` — the `swap` prop; the section is keyed `alternatives:<id>` (**not** the bare id: TagEditor is a sibling keyed by it — `b81bbde`). The Card tab renders the pane in three places: the tabbed pane, untabbed for One Piece, and the phone sheet.
  - `src/components/editor/deck-editor.tsx` — `handleSwap(out, wire)` (one copy out, one in, in place; toast "Swapped A → B"; the Undo: `setQty(incoming → previous)` then `restoreEntry(removed, index)`), and the `swapEditing` memo (main zone only, `swap.offers`, body null without a leader). `showCard(card, explicit)` opens the phone sheet / md drawer when explicit.
  - `src/lib/decks/editor-state.ts` — `swapCard(entries, format, zoneId, outId, inId)`: a single copy is replaced IN PLACE (no tags, no printing); more copies → one leaves, one joins. `restoreEntry` re-checks zone maximums.
  - `POST /api/alternatives` — body `{game, format, leaderIds, entries, cardId, goals?}`; 8 rows; 12 statements warm; prod warm ~0.6 s; bucket 30/min + 200/hour. A "Swap…" per row means one request per open — still well inside the bucket.
- **Deck rows**: `src/components/deck/deck-text-view.tsx` — `DeckTextViewProps {onSetQty?, onRemove?, onPreview, …}`; the per-row controls reveal on hover/focus (`REVEAL_CLASS`) and are 44 px and always visible on touch; the remove button is the last control (~192–200). The share page renders the same component read-only (omits the handlers) — a "Swap…" must be absent there. `deck-list-pane.tsx` passes the handlers (279, 408–409); `deck-grid-view.tsx` is the grid.
- **The search pane's Add**: `search-pane.tsx` 284–312 — "Add X to {main zone label}" and "Add X as {leader noun}", each `add(card, zoneId, qty)` into the editor's `handleAdd` (deck-editor.tsx ~1052; returns an error line). The size math is `deckSizeCount(entries, format)` vs `format.deckSize.max` (Commander 100, counted across `countsTowardSize` zones). Today an add past 100 succeeds and the Cut Coach's over-limit CTA appears.
- **The Cut Coach**: `rankCuts` (`src/lib/recommend/cuts.ts` 210) runs client-side in `cut-coach-panel.tsx` with the user's tags, and gets combo membership + tournament shares from `GET /api/decks/[id]/combos` only while its tab is active, after a save — so "Swap in…" from search has no combo protection unless you fetch it (decide; the Coach discloses its absence in words — do the same). `meta.curve.bucketOf(card)` (`mtgCurveBucketOf`: null for lands and costless cards; 0–7+) is the bucket.
- **The conflict callout**: `src/components/deck/bracket-sheet.tsx` `TargetBlock` (~330–400): `conflicting = read.factors.filter(f => read.conflicts.includes(f.id))`, each row shows `factor.sentence` and `factor.change`. `BracketFactor.cards` holds identity ids in name order (`src/lib/games/types.ts` ~617). The sheet is `EditorDialog "bracket"` (a Drawer on phones, a Modal from md); opening a card's alternatives from it means closing it or showing them inside it — decide. Copy: `BRACKET_COPY.aboveTarget` ("Above your target"), `aboveTargetLead`.
- **`applyListSwap` pins that must stay green**: Import ("Import applied", deck-editor.tsx ~1382) and Autofill apply ("Added N cards", ~1957); RTL `deck-editor.test.tsx` ~1321 ("Added 12 cards"). Y7a did not route its swap through `applyListSwap` (per-card Undo, disclosed) — Y7b's swaps should use `handleSwap`'s shape too.
- **The draft rule**: any real edit in a draft mints exactly one deck (the create-count pins in `deck-editor.test.tsx`); Y7a's RTL pins a swap in a seeded precon draft (one POST, one PUT).

## Verify-first list (never from memory)

1. **The deck stays at 100** through every new path (row "Swap…", "Swap in…", the callout's "Swap…") — RTL over a 100-card list, and live on dev.
2. **One Undo restores both cards** (exact rows: tags, printing, place) — RTL, then live.
3. **The cut partner**: `rankCuts`' first non-combo-member candidate within the added card's bucket (or what you decide when the bucket is empty, the card is a land, or it has no cost) — unit-tested with fixtures, named in the UI with its tradeoff line.
4. **The callout**: a target-2 deck with a Game Changer → "Swap…" on that card → alternatives under the goals (no Game Changer offered) → the swap removes the conflict from the read.
5. **Zero creates** from opening any of it; exactly one from the first swap in a draft.
6. **The route table** byte-identical; `pnpm check` green; the `applyListSwap` pins green.

## Design decisions to make explicitly (disclose + pin each)

- **"Swap…" on a row**: what it opens (the Card tab with Alternatives expanded — the cheapest reuse — or a sheet of its own), where it sits (beside the steppers, revealed like remove; 44 px on touch), and which rows get it (main zone, `swap.offers`, never the share page).
- **"Swap in…"**: the trigger (the deck at `deckSize.max`), the label, the chooser (the partner with its tradeoff line + "choose another"), what happens for a land or a costless card (no bucket), what the Suggestions and Radar "Add" do at 100 (the same, or unchanged with a note), and the combo protection (fetch the combos route or say it's missing).
- **The callout's "Swap…"**: per card in a multi-card factor; inside the sheet or via the Card tab; focus return on close.
- **The Undo**: the toast's words ("Swapped A → B" for both directions?) and its one Undo.
- **Empty states**: no alternatives under the goals ("No cards tagged like this one fit your goals"), no cut partner in the bucket.

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table is byte-identical.
- The dev pass at 390 / 768 / 1200 / 1440 in both themes: a full Magic deck's row "Swap…", "Swap in…" from search at 100/100, the callout's "Swap…" on a target-2 deck; a draft (one create); One Piece (none of it). `smoke:alternatives` green on dev (read the deck-create counters first; delete QA decks with their tokens and re-prove the census).
- **The owner's click, signed in on prod**: on Nelson & Murdock (100 cards), search a card → "Swap in…" → the partner named → swap → still 100 → Undo; then a row's "Swap…" once.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and the deviations, its status line pointing at Y8; a dated ship note at the top of this file; REDESIGN.md's Wave-4 addendum gains "Y7b decisions"; LATER rows with triggers; memory updated; **`Y8-session-prompt.md` written** the way this one was (Budget Twin: the total budget in goals, "Fit my budget" — the priciest non-leader cards first, one to three alternatives each from Y7a's route, a running total, one apply with Undo; "No suitable alternative under your goals").

## Session notes (environment)

Unchanged from `Y7a-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y7a.ts` and `counters-y7a.ts` are there to copy), the `dev-log` launch config, the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup (the anchor asserted, the file restored after — Y7a's runner ran 35).
- **New in Y7a:** a raw postgres.js script binds a JS **string** to `$1::jsonb` as a JSON string (double-encoded), so `attrs @> ${'{"roles":["ramp"]}'}::jsonb` counts 0 there. The app goes through drizzle, whose postgres-js driver installs a pass-through serializer for json/jsonb, so the same SQL works in the route (search's keyword filter relies on it too). In verification scripts, use drizzle (`drizzle(client).transaction(fn, {accessMode: "read only"})`, `tx.execute(sql\`EXPLAIN … ${qb}\`)`) or `sql.json(...)`.
- **New in Y7a:** React only *logs* a duplicate key; tests stay green. When a pane renders new siblings, spy on `console.error` in the RTL flow and fail on "same key" (Y7a's Alternatives test does).
- **New in Y7a:** `read_console_messages` keeps entries across a reload; to tell old from new, install a `console.error` wrapper in the page after the load and reproduce.
- **New in Y7a:** Vercel can lag a push by several minutes; the commit status stays empty until it starts. A later push deploys the same tree.
