# Y1 session prompt — Honest labels (decklist wording, "competitive" evidence, the mana-sources clamp, one budget vocabulary, the owner's "Open in editor", the Share dialog)

## Ship note — 2026-10-01, feat `dcfcdcf` (step 0 `0e55ec2`), deployed (Vercel status success on the full sha, 08:51 Z)

**Shipped. The prompt below is history. Next is `Y2a-session-prompt.md` (honest first screen).**

**Pre-flight**: X5 ticked and `0015` the last migration; the nightlies green (07:38 Z's red was P4.9's flaky GET, its 07:57 Z re-dispatch green). The owner's answers at the start: **nothing posted, no feedback** (no P2.9 or P4.7 round) and **read-only database access granted** for the census. Baseline on `4a7ce75`: 1,238 tests / 144 files / 6 warnings / 0 errors (the prompt's 1,177 predates X5 and P4.9); `pnpm db:size` 271.1 MB; census 27 user decks / 181 precons / 1 user.

**Results.** `pnpm check` **1,251 tests in 147 files**, the same 6 warnings, 0 errors (+2 `budget.test.ts`, +2 `staples-table.test.tsx`, +5 `share-dialog.test.tsx`, +2 `analyze.test.ts`, +2 owner cases in `deck-share-view.test.tsx`). Route table **byte-identical** — built with Y1 stashed and again with it; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`, `/sets` and `/precons` stay `○`. `smoke:combos`, `smoke:hubs` and `smoke:recommend` green on dev (local deck-create counters 2 → 4); the census unchanged after their fixtures were deleted; `pnpm db:size` 271.1 MB after. No migration, route or dependency.

**What changed** (D1, as drawn unless noted below):
- **Wording.** Home's shelf "Popular in Commander decklists" + "Commander-eligible cards ranked by how many EDHREC decklists include them — as commander or in the 99 (via Scryfall). Not games played."; `/commanders`; the hub staples sentence and footer; combo totals "The N most popular of M combos (by EDHREC decklist count)" on hubs and card pages (`combos-smoke` regexes moved with them); the Combo Radar's two lines; `/cards`' "Most popular in {set}" + "Ranked by EDHREC decklist popularity via Scryfall."; evidence tiers "A Commander staple in EDHREC decklists" / "In many Commander decklists" / "In some Commander decklists" (cut-side tails unchanged); the Autofill sheet's "real decklists and tournament results — every pick shows why."; Topdeck's `why` lines "… competitive top-16 lists with …". The Meta Lens is byte-identical.
- **Mana sources.** With a commander, `producedMask(card) & (commanderCi | C)`; with none, today's counting. The `table` block gained an optional `hint`, rendered by `DataTable`. LATER row 31 FIRED.
- **One budget vocabulary.** `src/lib/recommend/budget.ts` (`BUDGET_OPTIONS` All · ≤ $5 a card · ≤ $1 a card, `withinBudget` inclusive, unpriced never in a tier) imported by Suggestions, Autofill and the hub staples. **The hub's `<` became `<=`: a card at exactly $5.00 now shows under "≤ $5 a card" on hubs, as it already did in Suggestions** (pinned by `staples-table.test.tsx`). Suggestions' empty state: "No suggestions with a known price of $5 or less — try a wider budget."
- **Owners on their share page.** `/d/[publicId]` passes `isOwner = isDeckOwner(deck, null, sessionUserId)`; `DeckShareView` shows "Open in editor" for a claim token **or** `isOwner`. The visitor row pin is untouched. `/account`'s ⋯ menu says "Open in editor".
- **The Share dialog.** Public: "Anyone with the link can view. Public decks also appear on the home page, their commander's page and your profile."; Private: "Only you can view it." (account deck) / "Only this browser can view it." (guest deck); Copy link confirms in a status slot. The RTL was written against the old dialog first (2 tests, green), then moved with the copy.

**Decisions and deviations** (also in `WAVE4.md`'s tracker and REDESIGN.md's Wave-4 addendum):
1. "competitive" sits in the `why` lines — all four, the cut side's included. The scope sentence is unchanged; both `recommend-smoke` regexes were run against the new strings before the edit.
2. The table hint names Treasure makers, with typographic quotes around "any color".
3. The clamp masks every produced bit, explicit symbols included (the contract's formula): an off-identity card — already a color-identity error — counts only its on-identity colors.
4. The no-commander case keeps today's counting (pinned).
5. The account/guest split in the Share dialog is "this browser holds no claim token" (`claimToken === null` at create, `token === null` at hydrate) — account decks never hold one.
6. Copy confirmation: "✓ Link copied" for 1.8 s (the share page's reset), and a failure line the old dialog never had; the button keeps its name.
7. The hub's count line now reads "N of 100 at $5 or less · M at $1 or less"; its empty tier "None of these staples fit that budget right now."
8. Left by the grep on purpose: the Meta Lens (exempt); `card-search.tsx`'s `most-played-heading` id and `data-slot="most-played"` (identifiers, not copy); code comments about internal ordering (hub queries, Topdeck maps, the engine). Smoke check labels were reworded to "most popular".

**Mana sources on real decks** (dev against prod data, then prod): Sram (mono-W, `/d/k88m2jdjtykk`) White 34/2 · Colorless 3/2 — the four 0/1 rows gone; Niv-Mizzet (UR, `/d/bn4v_765mej9`) Blue 24/9 · Red 22/9 · Colorless 2/2 unchanged, White/Black/Green 2/6 gone; Queza (WUB, `/d/xg2_k9mejm4y`) White 15/5 · Blue 17/6 · Black 17/6 · Colorless 4/5 unchanged, Red/Green 4/3 gone. One Piece is untouched (its own `analyze`).

**Dev pass** (signed out): home's shelf at 1440 dark; the Sram share page at 390 light (two rows + the hint); the Atraxa hub's pills at 390 light ("57 of 100 at $5 or less · 40 at $1 or less"); `/commanders`; Thassa's Oracle's card page ("The 10 most popular of 59 combos …"); `/cards?set=blb` at 1440; a seeded Atraxa draft with `?autofill=1` — the Suggestions drawer and the Autofill sheet both read "All · ≤ $5 a card · ≤ $1 a card", the sheet's lead "Built from real decklists and tournament results for Atraxa, Praetors' Voice — every pick shows why.", zero `POST /api/decks`. Not every surface was seen in both themes at both widths — the copy is theme-neutral text in existing classes, and the RTL pins carry the rest.

**Prod pass** (signed out, zero creates, `x-vercel-cache: MISS` on the first hit after the deploy): home's server HTML carries the heading and sentence (no "Most-played commanders", no "actually played"); `/commanders`' sentence; the Atraxa hub's staples sentence and footer; Kinnan's hub "The 10 most popular of 119 combos (by EDHREC decklist count)"; `/cards?set=blb` "Most popular in Bloomburrow" (client strip, read in the pane); `/d/k88m2jdjtykk`'s server-rendered table White 34/2 · Colorless 3/2 with the hint.

**Handed to the owner — one click, signed in on prod:** open the share page of one of your own decks (for example `/account` → ⋯ → View share page). "Open in editor" is in the action row, after "Buy this deck". (The ⋯ menu itself now says "Open in editor" too.)

---

Pull latest, then run Y1 — the first Wave-4 package. **`WAVE4.md` is the contract.** Read, in this order: section A's rows on named sources and plain words; **D0** (copy rules, attribution) and **D1** (the phrase inventory table, the mana-sources clamp, the budget vocabulary, owners on their share page, the Share dialog); the Y1 rows of E's **pin matrix**; **G** (scope and the completion checklist); and section F's deferred table, which step 0 turns into `LATER.md` rows.

Y1 is the smallest Wave-4 package and the one with the widest reach: copy that says what the data is, a Mana sources table that stops inventing off-color sources, one budget vocabulary, and two owner-facing fixes. **No migration, no new route, no new dependency.** Its step 0 lands the Wave-4 contract in the build plan, CLAUDE.md, REDESIGN.md and LATER.md.

Pre-flight, in order.
1. **X5 has shipped.** `WAVE3.md`'s tracker ticks X5, and `drizzle/meta/_journal.json`'s last entry is idx 15 (`0015_*`). If X5 hasn't run, run `X5-session-prompt.md` first — it is its own session.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml`). A red run is P4.7 branch F and preempts everything.
3. **A warm beta signal outranks a package.** Owner posted, feedback arrived, a stranger's 429, a new issue → run the `P2.9-session-prompt.md` round (Magic) or the `P4.7-session-prompt.md` round (One Piece) as its own session first. Ask the owner whether anything was posted.
4. **Ask for read-only database access once, at the start**, in plain words: the census before and after (users, user decks, precons), nothing written. Y1 itself writes nothing; `smoke:recommend` on dev creates two decks and deletes them.
5. **Working tree clean** at or after the commit that landed `WAVE4.md` and this prompt (`git log --oneline -1 -- WAVE4.md`). Another session may share this working copy: stage explicit paths only, never `git add -A`; re-read `LATER.md`, `REDESIGN.md`, `deckwarden-build-plan.md`, `CLAUDE.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` = the count X5's ship note records (1,177 tests / 139 files / 6 warnings / 0 errors before X5, on `53942d6`), and `pnpm db:size`. Save `pnpm build`'s route table; the diff at the end must be **empty**.
7. **P4.9 is independent.** If the owner wants the One Piece image flip first, it gets its own session.

## What Y1 is NOT (scope fence)

- NOT anything bracket-shaped: no Game Changer flags, no Tagger, no combo tags, no bracket line (Y3a onward).
- NOT the draft save slot, "Keep this deck", progress-not-problems or the quiet first screen (Y2a); NOT the start doors or Suggestions in drafts (Y2b).
- NOT the share page's owner action row, the Copy menu or "Copy for the table" (Y5). Y1 only lets an account owner see the existing "Open in editor" button.
- NOT the Meta Lens wording (`/c/[slug]`'s "Most played with …" stays byte-identical — tournament lists, honest, smoke-pinned).
- NOT renaming "Fork", NOT "Pick your game." on `/decks/new`.
- NOT a change to any recommendation **score**, weight or filter beyond the hub staples' `<` → `<=` (D1's budget vocabulary).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-09-30 against `53942d6` — re-grep lines, trust the shapes)

**The phrase inventory** (`grep -rnaE "actually played|play data|most-played|Most played|Most-played|Widely played|Sees Commander play|real play data|most played|play-rate" src scripts`). User-visible hits:

- Home shelf: `src/components/home/leader-shelves.tsx` 93 (`aria-label="Most-played commanders"`), 94 (the h3), 96 ("Ranked by how much each commander is actually played (EDHREC data via Scryfall).").
- `/commanders`: `src/app/(site)/commanders/page.tsx` 97 (the same sentence). Its metadata (39–40, "by color identity and popularity") is accurate and stays.
- Hub staples: `src/app/(site)/c/[slug]/page.tsx` 260–261 ("The {STAPLES_LIMIT} most-played cards that fit this color identity, ranked by EDHREC play data via Scryfall."). Hub footer: 481 ("; play-rate ranking from EDHREC data included in Scryfall bulk.").
- Combo totals: `c/[slug]/page.tsx` 322 and `src/app/(site)/cards/[id]/page.tsx` 212 (`The ${n} most-played of ${total} combos`). Pinned by `scripts/combos-smoke.ts` 117 and 154 (`/most-played of (\d+) combos/`).
- Combo Radar: `src/components/editor/combo-radar-panel.tsx` 337 ("Showing the N most-played of M." — pinned `combo-radar-panel.test.tsx` 125 "Showing the 1 most-played of 7.") and 433 ("Scan capped at the most-played matches for this deck.").
- `/cards` set strip: `src/components/cards/card-search.tsx` 495 ("Most played in {set}") and 498 ("Ranked by EDHREC play data via Scryfall."). Pinned by `card-search.test.tsx` 270, 277, 345, 361; `scripts/sets-smoke.ts` 237 names the request "Most played" in a check label.
- Evidence tiers: `src/lib/games/mtg/recommend.ts` 153 ("A Commander staple by EDHREC play data"), 155 ("Widely played in Commander decks"), 156 ("Sees Commander play"), and the cut side 225 and 232. Pinned by `recommend.test.ts` 140 (`toContain("Widely played")`) and `src/components/editor/autofill-sheet.test.tsx` 66, 104, 230, 232.
- Autofill sheet: `src/components/editor/autofill-sheet.tsx` 299 ("{pinned.label}. The rest comes from real play data — every pick shows why.") and 302 ("Built from real play data for …"). Pinned by `autofill-sheet.test.tsx` 324 and `src/components/editor/deck-editor.test.tsx` 952. "every pick shows why" must stay (WAVE3 D0).
- Topdeck evidence: `recommend.ts` 185, 295, 302, 308 (the `why` lines, "Played in N% of top-16 lists with {cmd}…"); the scope sentence at 67 ("… top-16 lists at 16+ player events on Topdeck.gg"). Pinned by `recommend.test.ts` 101, 103, 116, 189, 191, 197, 208, 211 and `scripts/recommend-smoke.ts` 378 (`/top-16 lists with Kinnan, Bonder Prodigy/`) and 387 (`/\d[\d,]* of \d[\d,]* top-16 lists at 16\+ player events on Topdeck\.gg/`). Adding "competitive" to the `why` lines only ("Played in 62% of competitive top-16 lists with …") keeps both smoke regexes matching and leaves the scope-sentence pins alone.
- **Exempt**: the Meta Lens (`c/[slug]/page.tsx` 294–297; `hubs-smoke.ts` 414–454) and every code comment that isn't copy.

**Mana sources.** `producedMask` (`src/lib/games/mtg/analyze.ts` 25–39) ORs in all five colors when an "Add …" clause says "any color" or "any combination" — Arcane Signet and Command Tower ("any color in your commander's color identity") and, through reminder text, every Treasure maker. `analyzeMtg` tallies produced bits per color with no reference to the commander (60–75) and builds the `table` block "Mana sources" (120–129). `validate.ts` 204–205 already computes `commanderCi` as the OR of the command zone's `ciMask`; the commander zone id is `commander`. The `table` AnalyticsBlock (`src/lib/games/types.ts` 159) has no `hint`; `DataTable` renders it (`src/components/deck/analytics-blocks.tsx` 152–181). Tests: `src/lib/games/mtg/analyze.test.ts` 67–76 (Atraxa + Sol Ring + Bolt + 30 Islands → Blue 30/0, Colorless 0/1 — unaffected) and 78–101 ("counts any-color producers as a source of all five colors" — Birds of Paradise under Atraxa yields a Red row; it loses it under the clamp). No smoke reads the table. Prod: `/d/k88m2jdjtykk` (mono-white Sram) shows White 34/2, Blue 0/1, Black 0/1, Red 0/1, Green 0/1, Colorless 3/2.

**Budget vocabulary.** Suggestions: `src/components/editor/recommendations-panel.tsx` 48–51 ("All" / "Under $5" / "Under $1"), the empty state at 238 (`under ${budget}` — the "$" is missing). Autofill: `autofill-sheet.tsx` 82–85 ("All" / "≤ $5 a card" / "≤ $1 a card"). Hub staples: `src/components/hub/staples-table.tsx` 26–30 ("Under $5" / "Under $1") filtering with a strict `<` (35). The engine's SQL is inclusive (`src/lib/recommend/queries.ts` 85–88, `cheapest_usd <= max`). The panel's comment claims "one budget vocabulary site-wide" (`recommendations-panel.tsx` 46).

**Owners on their share page.** `src/app/(site)/d/[publicId]/page.tsx` reads `sessionUserId` (≈82) and passes `deckMetaJson(deck, { isOwner: false })` (141). `DeckShareView` reads a claim token through `useSyncExternalStore` (`src/components/deck/deck-share-view.tsx` 161–167) and renders "Open in editor" only when it exists (398–407). Account decks never hold a token (created signed in, or claimed — the claim deletes it). `/f/[publicId]` already detects its owner by session (`src/app/(site)/f/[publicId]/page.tsx` 9–17). The visitor row is pinned by `deck-share-view.test.tsx` 111–119 (`["♡ Like", "Bookmark", "Fork", "Copy decklist", "Buy this deck"]`), and the header holds two live regions (106–110).

**One name for the editor.** `src/components/account/deck-action-items.tsx` 91 says "Open in builder" (pinned `account-deck-tile.test.tsx` 98, 122); the share page says "Open in editor"; the page title says "Deck editor".

**The Share dialog.** `src/components/editor/share-dialog.tsx` 16–20: Public "Anyone can view; may appear in future browse pages." (public decks already appear on home's rail, their commander's page and the owner's profile); Unlisted "Anyone with the link can view."; Private "Only this browser can view." (wrong for account decks — `src/lib/decks/access.ts` 36–43). Copy swaps its own label to "Copied ✓" (93–96) with no failure branch. **No test file exists** for the dialog.

**Step 0's targets.** Build plan §6d ends before "## 7. Feature Additions" (`deckwarden-build-plan.md` ≈268–281) — §6e goes after it, mirroring its table. CLAUDE.md's Session protocol lists the Rn, Wn and Xn lines. `LATER.md` is 136 lines on `53942d6` (X5 may append rows — append after whatever is last, and cite the numbers you get). The rows Y1 rewrites: 15, 31, 33, 46, 48, 60, 64, 83 (WAVE4 F, "Rows this wave rewrites").

## Verify-first list (never from memory)

1. **The grep is the inventory.** Run it before and after; after, only the exempt list and comments may remain.
2. **The Topdeck wording keeps the smokes.** Before editing, run the two `recommend-smoke.ts` regexes (378, 387) in a node one-liner against the new strings.
3. **The clamp's numbers on real decks.** On dev, open a public Magic share page with Command Tower or Arcane Signet in a two- or three-color deck, and the Sram page: the off-identity rows disappear, the on-identity counts stay. One Piece decks are untouched (its adapter has its own `analyze`).
4. **The hub's `<` → `<=` is visible.** A card at exactly $5.00 now shows under "≤ $5 a card" on hubs, as it already does in Suggestions. Say so in the ship note.
5. **The owner case on the share page.** RTL: a signed-in owner (`isOwner: true`, no token) sees "Open in editor"; a visitor's row stays byte-identical. On prod the pane is signed out — this is the owner's click.
6. **Smokes on dev**: `smoke:combos`, `smoke:hubs`, `smoke:recommend` (read the deck-create counters first; `pnpm counters:reset` between runs if the local counters fill; never retry into a 429).
7. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel". Then the prod pass in "Deployable outcome".

## Design decisions to make explicitly (disclose + pin each)

- **The exact words.** WAVE4 D1 gives a default for every site. Keep them or improve them — but every replacement says what is counted (decklists, tournament lists) and never "played" for EDHREC rank. Pin each rewritten string where a test already pins the old one.
- **Where "competitive" goes** in Topdeck evidence: the `why` lines (the default — the smokes keep matching) or the scope sentence (then both smoke regexes move in the same commit).
- **The table hint's text**, and whether it names Treasure makers (the default: yes — they count through reminder text).
- **The no-commander case** for the clamp: today's counting (the default) or no "any color" sources until a commander exists.
- **The budget list's home** (`src/lib/recommend/budget.ts` or a component-level constant) and its labels ("≤ $5 a card" is the default — Autofill's wording).
- **The Share dialog's lines** for Public, and Private for account vs guest decks; the copy confirmation through a status slot.

## Deployable outcome

**Step 0 first, in its own commit** (`WAVE4.md` is already in the repo with its tracker — do not re-land it):
- Build plan §6e: the Y-series table, mirroring §6d, one row per package (Y1 … Y10, with Y2a/Y2b, Y3a/Y3b, Y4a/Y4b, Y6a/Y6b, Y7a/Y7b, Y9a/Y9b) with "Deliverable" and "Done when", and a status line pointing at `WAVE4.md`'s tracker.
- One CLAUDE.md line under Session protocol: "Wave-4 packages (Yn from `WAVE4.md`, build plan §6e) count as work packages under the same rules."
- A REDESIGN.md "Addendum — Wave-4 supersessions": Y1 rewrites the W-era evidence and shelf wording and changes the hub staples' strict `<`; Y2a will change R3's save-slot states (a fourth, "Draft") and the empty-deck validation framing; the Warden's approval line stays legality-only for the whole wave.
- `WAVE4.md` section F as `LATER.md` rows, appended at the end, each with its trigger; the eight rows F lists rewritten (row 31 says it fires in Y1 itself — rewrite it with the sha in the ship note).

**Then Y1**: `pnpm check` green and deployed.

Verified **on prod, signed out, zero creates**:
- Home's server HTML carries the new shelf heading and sentence; `/commanders` carries its new sentence.
- `/d/k88m2jdjtykk`'s Mana sources rows are White and Colorless only, with the hint line.
- One hub's combo total reads "most popular of N combos"; `/cards?set=blb` reads "Most popular in Bloomburrow".
- The route table diff is empty; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`; `/sets` and `/precons` stay `○`.

Verified **on dev**: both themes at 390 and 1440 on the surfaces in G's checklist; the three smokes green; the census unchanged after the smokes' fixtures are gone.

**Handed to the owner, signed in on prod — one click:** open the share page of one of your own decks (for example from `/account` → ⋯ → View share page). "Open in editor" is in the action row.

Tests: the pins in WAVE4's matrix (Y1 row) updated in the same commits as the copy; `analyze.test.ts` 78–101 rewritten plus a mono-white Arcane Signet case and a no-commander case; a new ShareDialog RTL (written first, against today's dialog, then updated); an owner case beside the visitor-row pin; the budget list shared by all three controls.

Docs in the same package: the `WAVE4.md` tracker ticked with the sha and any deviation beside it; a dated ship note at the top of this file; LATER row 31 rewritten as FIRED with the sha; memory updated; **`Y2a-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted — delete it when done), inside one `read only` transaction, body wrapped in `async function main()`.
- `.env.local`'s `DATABASE_URL` is prod's pooler; dev shares prod's database. `source .env.local` fails in zsh; scripts load it with dotenv.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN` (a server on 3000 is reused). Stop it before `pnpm build` — they share `.next`. `next dev` re-adds the AGENTS.md block; commit it with your work.
- The browser pane is signed out on prod and on localhost. A hidden pane pauses rAF, stalls Base UI transitions and doesn't hydrate a tab until painted: verify menus and dialogs through the DOM or in jsdom.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree.
- Four source files hold a literal NUL byte; use `grep -a`. Prettier reflows scripted-edit anchors after `pnpm format` — assert anchors, re-grep; `*.md` is prettier-ignored.
- Prod: curls need `--compressed`; ISR pages lag a deploy by up to an hour; the deck-create budget is 10 an hour and 30 a day per IP, and Y1 creates no prod decks.

## Context, not tasks

- Sequence after Y1: Y2a honest first screen → Y2b start doors → Y3a bracket data → Y3b bracket engine → Y4a bracket line + Why sheet → Y4b your target → Y5 at the table (**announce point**) → Y6a/Y6b goals in recommendations → Y7a/Y7b Swap Lab → Y8 Budget Twin → Y9a/Y9b journal → Y10 results.
- The owner's nine answers of 2026-09-30 stand (`WAVE4.md`, Context). The defaults in `WAVE4.md` section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the Y-series and get their own round, never a slice of a Y-session. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds: no simulated decks, posts or metrics. Premium never gates card data.
- The MTG Replace teardown (`mtg-replace-teardown.md`) is in the repo for reference; the Mythic Tools review is private and `WAVE4.md` restates what it needs.
