# Y7a session prompt — Swap Lab (Tagger function roles behind a UUID whitelist and a kill-switch, `POST /api/alternatives`, the Card tab's Alternatives, "Swapped A → B · Undo", a gold set of ~20 staple swaps)

Pull latest, then run Y7a, the eleventh Wave-4 package. **`WAVE4.md` is the contract.** Read these, in this order:

1. Section **A**'s Swap Lab row (75: "matches 'does the same job' by shared Tagger function tags (a UUID whitelist with a kill-switch and the same fallback rule), ranked by existing evidence; text embeddings rejected") and the Context row on Tagger (34: it "relaxes 'roles only from your own tags' for Swap Lab only; Autofill and the Cut Coach keep their rules").
2. **D0** (copy, attribution — "community-tagged on Scryfall Tagger", linked to the tag — and adapter gating: One Piece shows nothing, no apology copy), **D3**'s Tagger paragraph (273: the fallback rule — a failed or partial fetch keeps the last good data) and **D8** in full (377–383; Y7a's half is Roles, the route and the Card tab).
3. The **Y7a** block in section E (533–540), its route-table row (447: `+ ƒ /api/alternatives`), its pin-matrix row (599), the rollback line (606), the **F** rows 626–628 (embeddings, curated notes, a card-page Alternatives — all deferred), and **Verification (whole wave)**: Y7a is a query package, so the plan, the warm time and the `DB_LOG` statement count are recorded.
4. REDESIGN.md's **"Y6a decisions"** (`applyGoals`, the server-side read over `ReadFacts`, flags on candidate rows) and **"Y6b decisions"** (goals in a snapshot route's body, `goalsSchema`, the gate).
5. LATER rows **154** (embeddings), **155** (curated notes), **156** (card-page Alternatives), **165** ("Only cards I own" in a draft — neither snapshot route takes `owned`), **168** / **170** (the Tagger review rows), **31** (mana sources — Swap Lab's land swaps are a named trigger).
6. Y6b's ship note at the top of `Y6b-session-prompt.md`.

Y7a lets any card be swapped for one that does the same job, inside the deck's goals:
- **Roles** (data; a nightly lands them): a whitelist of Scryfall Tagger *function* tags declared in the Magic adapter by UUID becomes sparse `attrs.roles`. D8's candidates: ramp, card draw, creature / artifact / enchantment removal, counterspell, board wipe, tutor, protection, recursion, mana rock, mana dork, land ramp, burn, token maker, sacrifice outlet — **the final list chosen from measured sizes**. `tagger-overrides.json` gains a per-role kill-switch, and D3's fallback rule applies per role.
- **`POST /api/alternatives`** (the one new route): a snapshot like the Suggestions draft POST, so drafts work. Candidates share at least one role with the card, pass `candidateConditions` (identity, legality, not in the deck) with a tested `cost_value` range added to the scope whitelist, then `applyGoals`. They are ranked by shared roles, then the existing evidence, and come back with CardWires, why-chips (shared roles, mana value, price delta, Game Changer status) and the outgoing card's tradeoff.
- **The Card tab's "Alternatives"**: a collapsible like Printings (fetch on first open). Picking one swaps through `applyListSwap` — "Swapped A → B · Undo".
- **The gold set**: about 20 staple swaps (Sol Ring in a mono-white deck → mana rocks, not lifegain; Swords to Plowshares → creature removal; …), with their hit rate recorded in the ship note.

**No migration** (`attrs` is jsonb). **Exactly one new route**: the route table gains `ƒ /api/alternatives` and nothing else. **The roles reach the database only through the Scryfall ingest** on GitHub Actions — so the order is: push → the owner's yes → one `workflow_dispatch` (or the scheduled nightly) → verify the roles landed → the dev pass and the prod checks. Until then the route must answer an honest empty list, never fail: main is never broken.

Pre-flight, in order.
1. **Y6b has shipped.** `WAVE4.md`'s tracker ticks Y6b (feat `4381110`, the golden `a9a4ea8`); `_journal.json`'s last entry is idx 17.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`).
   - A red ingest is P4.7 branch F and preempts everything. A red ruleset watch means the Game Changers changed: move the pin first (`bracket-ruleset.ts`); LATER row 174 fires if the ruleset `version` moves.
   - `stats.tagger.counts.extra_turn.added > 0` fires LATER row 170; `counts.mld.unreviewed > 0` fires row 168. `stats.tagger.status` should read `fresh` for both flags — Y7a's roles ride the same read.
3. **A warm beta signal outranks a package.** The r/EDH post (P2.9 round 3) hadn't gone out when Y6b started. **Ask first whether it went out and what came back.** If it did, run P2.9 round 3's census and the stranger-IP check before anything else (`mtg-p29-rounds` memory; the counters table is pruned), and treat any real report as the session's work.
4. **Ask the owner, once, at the start, in plain words**, for:
   - read-only database access (the census, `pnpm db:size`, the counters, the new route's measured statements, role counts over `attrs` once they land);
   - that the dev pass and the smokes write through the dev server (dev shares prod's database; a swap in a dev draft mints one deck; read the deck-create counters first);
   - **the `workflow_dispatch`** that lands the roles. It writes card `attrs` on the shared database the way Y3a's did: every identity whose attrs change is rewritten. Measure `pnpm db:size` before and after (285.8 MB on 2026-10-10; the alert is 350).
   - Say up front that the owner's click comes at the end (signed in, prod). Also ask whether Y6b's owed click was done (Nelson & Murdock → More → Autofill… → the cap and its note; the Combos tab's badges).
5. **Working tree clean**, at or after Y6b's docs commit. Another session shares this working copy: `DESIGN-LAB-session-prompt.md` (untracked, from a Home session) is not yours — leave it. Stage explicit paths only, and re-read `LATER.md`, `REDESIGN.md`, `WAVE4.md` and `MEMORY.md` right before editing them.
6. **State your baseline** and save `pnpm build`'s route table: the diff at the end must be **exactly one added line**, `ƒ /api/alternatives`.
   - `pnpm check` on `4381110`: 1,839 tests / 183 files / 6 warnings / 0 errors.
   - `pnpm db:size`: 285.8 MB on 2026-10-10.
   - The census: 209 deck rows (28 user decks: 16 account + 12 guest; 181 precons; 1 user); one deck with goals and a budget (Nelson & Murdock).

## What Y7a is NOT (scope fence)

- NOT Y7b: "Swap…" on deck rows, "Swap in…" at 100/100, the conflict callout's swaps. NOT Budget Twin or "Fit my budget" (Y8).
- NOT roles in Autofill or the Cut Coach. The owner's decision keeps "no inferred roles" there (`types.ts:329–335`; WAVE4 Context row 34). The Cut Coach's role evidence stays the user's own tags.
- NOT a card-page Alternatives section (LATER 156), embeddings (LATER 154) or curated notes (LATER 155).
- NOT roles in the bracket read. `flagPaths` stays exactly `game_changer`, `mld`, `extra_turn` (pinned at `bracket-impact.test.ts:406`, `queries.test.ts:102–108`, `engine.test.ts:116–117`, both snapshot route tests).
- NOT an owned filter in drafts (LATER 165).
- Anything else goes to `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-10 against `4381110`; re-grep lines and trust the shapes; `autofill-sheet.tsx`, `decks/autofill/route.ts` and `lib/decks/cards.ts` hold a NUL byte, so use `grep -a` and byte-safe edits)

- **The Tagger ingest** (Y3a), in two halves.
  - **The IO half** is `scripts/ingest/tagger-read.ts`:
    - `readTagIndex` (34–60) reads the `oracle_tags` bulk whole under a 120 s timeout. The URL comes from `GET /bulk-data` (`scripts/ingest/scryfall.ts:65`, 209, 223) — never hard-code it. The file is about 6 MB gzipped / 19 MB of JSONL, with ~4,559 tags.
    - `readStoredFlags` (63–79) is a GIN containment query per flag value.
    - `readPreviousStaleSince` (82–97).
  - **The pure half** is `src/lib/games/mtg/tagger.ts`:
    - `TAGGER_FLAGS = ["mld", "extra_turn"]` (21).
    - `parseTaggerOverrides` (70–113): **any key under `flags` other than those two throws "unknown flag"** (75–78, pinned at `tagger.test.ts:142` with `"tutor"`).
    - `TagIndex` (130) keeps only `childIds` and `oracleIds` per tag. **No slugs, names or weights**, so measuring role sizes needs a one-off read of the raw JSONL, like Y3a's step 0 (WAVE4 474).
    - `rollUp` (150–167) covers a tag's descendants.
    - `resolveTagger` (198–243): a flag is `fresh`, `kept` or `disabled`. It is "kept" when the index is null, the pinned tag is missing, or the tag flags no card (212–228).
    - `TaggerStats` (272–281) is written at `scryfall.ts:346–353`.
  - **The overrides file** (`data/mtg/tagger-overrides.json`, 146 lines) has the shape `{$comment, reviewed, flags: {mld: {tag: {id, slug}, enabled, clear, edge, disabledCards}, extra_turn: {tag, enabled, disabledCards}}}`.
    - The kill-switch is `enabled: false` per flag (freshness then reads "off", `brackets.ts:209`).
    - There is **no "disabled tags" list**, despite D3's wording.
    - Top-level keys other than `reviewed` and `flags` are ignored, so a sibling `roles` key won't break today's parser — but decide its shape and pin it.
  - **Where attrs are written**:
    - `buildAttrs` (private) is at `src/lib/games/mtg/scryfall-map.ts:209–245`; its sparse bracket keys are at 241–243.
    - `mapIdentity(raw, todayIso, flags)` is at 294–316.
    - The upsert (`scryfall.ts:365–389`) rewrites only identities whose `(name, …, attrs)` tuple changed.
    - `MtgAttrs` is at `src/lib/games/mtg/attrs.ts:20–43`.
    - Lightning Bolt's attrs are pinned exactly at `scryfall-map.test.ts:329–333` — roles must stay absent by default.
  - **The GIN index `ci_attrs_gin` is `jsonb_path_ops`** (`src/db/schema.ts:156`). It serves `@>`, not `?` or `?|`, so a role match that wants the index is `attrs @> '{"roles":["mana-rock"]}'` (OR-ed per role). Check the plan.
  - **`roles` would ride every CardWire.** `wire.ts:36`, `deck-cards-wire.ts:52`, the search route (160) and the cards route (118) select `attrs` whole, so a few bytes per card reach every list. Decide whether that's fine (D3's flags ride the same way) or whether the wire strips them.
- **The candidate query** (`src/lib/recommend/queries.ts`, 439 lines):
  - `CandidateFilter` is at 24–51. Its `scope?: { column: "primary_type"; op: "eq" | "ne"; value: string }` is at 50.
  - `SCOPE_COLUMNS = { primary_type }` is at 53–56 (WAVE4's "50–56" holds).
  - `candidateConditions` is at 61–104; scope is handled at 94–102 and throws "Invalid scope column".
  - **A `cost_value` range needs a numeric scope shape.** Today's is one string value with eq/ne, mirrored at `types.ts:349` and `engine.ts:156–157`.
  - `loadCandidatePool` (146–157) **requires `popularity IS NOT NULL`** (154), so unranked cards never appear — decide whether alternatives may be unranked.
  - `flagsColumn` is at 115–124.
  - `loadEntryFacts(gameId, ids, flagPaths?)` is at 345–367.
  - The scope-whitelist tests are `queries.test.ts:52–88`: eq/ne add one condition each, a non-whitelisted column throws, a bad exclude key throws.
- **Goals**: `applyGoals(ranked, goals, read, meta, limit)` is at `src/lib/recommend/goals.ts:108–114`.
  - `readCard` is exported from `engine.ts` (248–270). **`goalsRead` (290–342) and `readable` (273–279) are module-private**: export or move them to build a read in the new route.
  - **A swap is not an add**: judge each candidate against the list *without* the outgoing card. Otherwise swapping a Game Changer for a Game Changer at target 3 with three in the deck would hide every one.
- **The tradeoff** — `rankCuts(input)` is at `src/lib/recommend/cuts.ts:210–438`.
  - Its input is `RankCutsInput` (151–170): `entries` carry the user's own tags, and `completeCombosByCard` needs `CutComboInput` (79–83) with piece **names**.
  - `loadCompleteCombos` returns `CompleteCombo` with ids only (`types.ts:499–513`).
  - **Today's only consumer is client-side** (`cut-coach-panel.tsx:135–153`).
  - A card with no evidence lands in `unranked` (406–409), so the outgoing card may have no tradeoff at all; say so honestly.
  - Decide server-side (adapt the combos) or client-side (the editor already holds what the Cut Coach uses).
- **The Card tab**: `CardDetailPane({adapter, card, tagging?, printing?})` is at `src/components/editor/card-detail-pane.tsx:67–235`. It has **no deck, goals or swap context today**.
  - The W6 Printings collapsible is at 189–232: closed by default, fetched on first open with a per-card cache and a `startedRef` guard (78–115), and its trigger reads "Printings · N".
  - The pane renders in three places: the tabbed pane (`deck-editor.tsx:1742–1749`), untabbed for One Piece (1801–1815) and the phone sheet (2021–2028).
  - RTL pins: `deck-editor.test.tsx:467–605` (zero fetches before open, one after).
- **The swap**: `applyListSwap(nextEntries, newCards, title)` is at `deck-editor.tsx:1324–1343`. Its Undo restores the whole previous list (Y6b's batch Undo is per piece — choose).
  - Toast titles are a past-tense verb plus the card names, Undo as the action: "Replaced A with B" (1083), "Added X" (1179). D8 says "Swapped A → B".
  - A swap in a draft must create **exactly one deck** (the create-count pins in `deck-editor.test.tsx`).
- **The snapshot precedents**:
  - `src/app/api/recommendations/route.ts`: body 48–60 `{game, format, leaderIds, entries: [{cardId, qty}], budget?, goals?}`; `loadEntryFacts` with flags (91); 400 on unknown ids; force-dynamic + `NO_STORE`; its bucket is enforced before the body is read (66).
  - `src/app/api/decks/autofill/route.ts`: CardWires via `loadCardWires`.
  - **D8 names the body field `entryIds`; both precedents use `entries`** — follow them.
- **Rate limits** (`src/lib/rate-limit.ts`): `RATE_LIMITS` (42) maps policy functions; `recommendSnapshot` is at 107–110 (30/min + 200/hour).
  - `rate-limit.test.ts:45–53` covers every bucket's window automatically.
  - 55–63 is the "own bucket" precedent (distinct keys, pinned numbers) — the new bucket gets the same pin.
- **The hub's role template** (Lands, Ramp, Card draw, Targeted removal, Board wipes, Synergy) is at `src/lib/games/mtg/adapter.ts:166–180`. It's a different thing (user tags) — don't conflate the vocabularies in copy.

## Verify-first list (never from memory)

1. **Role sizes from the bulk** (a one-off read of the public `oracle_tags` JSONL; no database write): each candidate tag's UUID, slug, its rolled-up card count and how many of our identities it matches. Choose the whitelist from those numbers, and record them.
2. **The fallback per role**: a failed or partial read keeps the stored roles (a `resolveTagger`-style unit test), and a disabled role writes for no card.
3. **The bracket read untouched**: `flagPaths` and every pin listed in the scope fence stay green; `assessBracket` reads no `roles`.
4. **The scope whitelist's `cost_value` range**: new tests beside `queries.test.ts:52–88` (a range adds exactly its conditions; a bad column or shape throws).
5. **WAVE4 E's acceptance**: Sol Ring in a mono-white deck offers mana rocks, not lifegain; Swords to Plowshares offers creature removal; a swap in a draft creates exactly one deck; One Piece shows nothing (no section; the route answers 400).
6. **The gold set's hit rate** (about 20 staples, each with the kind of card a hit must be), measured on live data and recorded.
7. **The statements**: the new route's `DB_LOG` count, its plan and its warm time. Count in-process, not by dumping `preview_logs` (the `scripts/.tmp/y6b-count.ts` pattern).
8. **`pnpm db:size`** before the dispatch and after the roles land.

## Design decisions to make explicitly (disclose + pin each)

- **The whitelist**: which tags (measured), our names for them ("mana rock", "creature removal"), parent/child overlap (ramp ⊃ mana rock / mana dork / land ramp), size bounds, and whether a card may hold several roles (sorted, deduplicated).
- **The overrides file**: a sibling `roles` key (each role's `tag {id, slug}` and `enabled`), not entries under `flags` (`parseTaggerOverrides` throws on unknown flags). `reviewed` bumps; the kill-switch is pinned.
- **Storage**: `attrs.roles` holds our role keys, not UUIDs (the adapter owns the mapping). Measure bytes added per identity and in total; decide whether the wire carries them.
- **The match in SQL**: `@>` per role (the index) vs `?|` (no index). The `cost_value` range shape (`{column: "cost_value", op: "between", min, max}`?), its tests, and how wide the range is (the card's mana value ± 1?).
- **The ranking**: shared roles first, then the existing evidence (EDHREC rank, commander co-play, combos) — reuse `rankCandidates`' evidence or a thin ranker. Why-chips: "Both: ramp · mana rock — community-tagged on Scryfall Tagger", mana value, price delta, Game Changer status. The words never claim identical function.
- **Goals**: `applyGoals` against the list minus the outgoing card; hidden cards counted ("N hidden by your goals"?) or just left out; the budget as Suggestions does it.
- **The tradeoff**: server-side `rankCuts` (adapt combos, no user tags) vs client-side (the editor's own state). When there's none, say nothing — no fabricated tradeoff.
- **The Card tab**: Alternatives only for a card in the deck's main zone (it's a swap), collapsed by default, fetched on first open, adapter-gated (One Piece: none). The phone sheet and the md drawer.
- **The swap**: one copy or every copy; `applyListSwap`'s whole-list Undo vs a per-card Undo (Y6b's batch Undo is per piece); "Swapped A → B · Undo".
- **The bucket**: `alternatives`, its own keys, numbers pinned (30/min + 200/hour like `recommendSnapshot`?).
- **The empty states**: "No cards tagged like this one fit your goals" (WAVE4 E's Risks); a card with no roles ("No community roles for this card yet — Scryfall Tagger"); roles not landed yet (an honest empty, never an error).

## Deployable outcome

`pnpm check` green and deployed: the Vercel status is success on the full sha (`gh api repos/Bobandis6/deckwarden/commits/<sha>/status`), and the route table gains exactly `ƒ /api/alternatives`.
- The roles land through the Scryfall step, with the owner's yes for the dispatch. Every nightly step is green; `stats.tagger` shows the roles' status; `pnpm db:size` is recorded before and after.
- WAVE4 E's acceptance is pinned (Vitest) and seen live. The gold set's hit rate is recorded in the ship note.
- **The dev pass**: 390 / 768 / 1200 / 1440 in both themes — the Card tab's Alternatives on a Magic deck with a target and without, in a draft (the swap creates exactly one deck), and a One Piece deck (no section). The smokes for the new route are green on dev (read the deck-create counters first; delete QA decks with their tokens and re-prove the census).
- **The owner's click, signed in on prod**: on one of your decks, open Sol Ring (or any staple) → Alternatives → pick one → "Swapped A → B · Undo"; then Undo.

Docs in the same package:
- the `WAVE4.md` tracker ticked, with the sha and the deviations, and its status line pointing at Y7b;
- a dated ship note at the top of this file (the gold set's hit rate in it);
- REDESIGN.md's Wave-4 addendum gains "Y7a decisions";
- LATER rows (154 annotated with the gold set's result; new rows with triggers);
- memory updated;
- **`Y7b-session-prompt.md` written** the way this one was: "Swap…" on deck rows, "Swap in…" at 100/100 (the cut partner from `rankCuts` within the added card's curve bucket), and the conflict callout's rows gaining "Swap…".

State `pnpm db:size` before and after. Nothing posted, and nothing seeded on prod beyond the roles the ingest writes.

## Session notes (environment)

Unchanged from `Y6b-session-prompt.md`: PATH per command, read-only transactions for database reads (`scripts/.tmp/census-y6b.ts` and `counters-y6b.ts` are there to copy), the `dev-log` launch config, and the pane signed out and usually hidden (drive it through the DOM). Signed-in UI goes on a throwaway local page or in RTL. Run prettier on touched files before `pnpm check`. Do mutation checks from a scratchpad backup (the anchor asserted, the file restored after — Y6b's runner ran 27).
- **New in Y6b:** count `[db]` statements in-process. A tsx script sets `process.env.DB_LOG = "1"` before `await import()` of the route, wraps `console.log`, and calls `POST(new NextRequest(…))` (`scripts/.tmp/y6b-count.ts`). Dumping `preview_logs` costs tens of thousands of tokens on 900-parameter IN lists.
- **New in Y6b:** the dev preview server can exit by itself (code 0) — `preview_start` it again. Right after a restart, the tab's own first load to `/` can land after your `navigate`: check the URL and navigate again.
- **New in Y6b:** `vi.fn(() => x)` types its calls as `[]`. Type it as `vi.fn<(a: A, b: B) => R>(…)` to read `mock.calls[0][1]`. A destructured-but-unused binding adds a lint warning, and the baseline is exactly 6.
