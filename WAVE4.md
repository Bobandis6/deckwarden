# Deckwarden — Wave 4 plan (Y-series): know your deck's bracket, tune it to your table, remember your games

**Status:** drafted from the owner's answers of 2026-09-30 (nine questions in three rounds, recorded under Context). The defaults in section F stay open until the owner says otherwise. Wave 4 starts **after X5**; Y1 is first — the progress tracker is at the end of this file. Y1 shipped on 2026-10-01 (`dcfcdcf`), Y2a the same day (`4fd9b10`), Y2b too (`bb4b1e2`); Y3a is next (`Y3a-session-prompt.md`).
**Saved:** September 30, 2026, from a planning-only session against `53942d6`. Nothing was implemented, installed, migrated or deployed. No database was read. One stateless request went to Commander Spellbook's `/estimate-bracket` endpoint to learn its response shape.
**Canonical copy:** `WAVE4.md` in the repo root (this file).
**Working rules:** the CLAUDE.md session protocol applies unchanged — one package per session, deployed and `pnpm check`-green or not done, anything out of scope to `LATER.md` with a trigger. Y1's step 0 adds build plan §6e, the CLAUDE.md line, the REDESIGN.md addendum and the LATER rows that make Y-packages legal sessions.

> Verified when written: the repo is `/Users/danielson/Documents/Claude/deckwarden` (HEAD `53942d6`, level with origin; only `mtg-replace-teardown.md` untracked). `pnpm check` baseline = 1,177 tests in 139 files, the same 6 `no-unused-vars` warnings, 0 errors (X4b's count on `879db10`; the docs commit since changed no test). Nightly ingest green through 2026-09-30 16:29 Z (run 36744619843); its DB gauge read 270.9 MB (alert 350). One closed issue, zero open. Census as last measured (X4b, 2026-09-28): 27 user decks, 181 precons, 1 user. The owner confirmed nothing new was posted. X5 (change picture, migration `0015`) is unrun; P4.9 is independent.

## Context

Wave 3 is one package from done (X5). On 2026-09-30 the owner shared two research documents and set the next wave's direction. Their message, verbatim:

```text
the strongest opportunity for Deckwarden looks like an explainable bracket advisor: show the cards and gameplay assumptions behind the estimate, then make suggestions respect the player's target bracket. Mythic's game history and matchup statistics are also worth considering as a later addition. an explainable bracket advisor, followed by recommendations tailored to the deck's bracket and budget, then game statistics tied to deck versions.

review these md files and plan some of the features recommend anything that could make the user experience more enjoyable and simple use other agents when needed and ultracode if you feel like its needed
```

Numbering used below: (1) the explainable bracket advisor, (2) recommendations tailored to the deck's bracket and budget, (3) game statistics tied to deck versions, (4) matchup statistics as a later addition, (5) anything that makes the experience more enjoyable and simple.

**The two research documents.**

- **An MTG Replace teardown** (`mtg-replace-teardown.md`, committed with this contract under a correction header). MTG Replace finds "similar" cards by precomputed text similarity filtered to the searched card's color identity, plus a small curated layer of human notes. Its gaps are Deckwarden's opening: no deck context, no budget or bracket filters, reminder text and card names dominating the similarity, no notion of a card's job.
- **A Mythic Tools product review** (private, not in this repo; this contract restates what it needs in its own words and pins nothing into it). Mythic shows a bracket badge (number and name) whose dialog lists the detected evidence; it offers manual bracket buttons and a "recalculate" state after edits; it keeps a game history (result, players, starting player, events), splits a deck's record by going first or drawing, and shows win rates by opposing commander. The review's advice for Deckwarden, in short: an explainable bracket advisor first (evidence, player intent, honest incomplete and stale states, versioned rules), then recommendations that respect a saved target bracket and budget, a shareable pregame summary, and a game journal tied to deck versions — before any ranking. It also flagged two Deckwarden issues that this plan verified on prod: a home-page label that calls EDHREC decklist rank "actually played", and phantom off-color mana sources on a mono-white share page.

**Decisions the owner confirmed on 2026-09-30** (three rounds of questions):

| Question | Answer |
|---|---|
| When Wave 4 starts | After X5. X5 keeps migration `0015`; Wave 4's first is `0016` |
| Which research documents go in the public repo | The MTG Replace teardown only; the Mythic review stays private |
| Anything posted or shared since 2026-09-27? | Nothing new — pre-flight cold |
| Scryfall Tagger (community card tags) | Use it for the bracket flags (land denial, extra turns) **and** for Swap Lab's "does the same job" matching. This relaxes "roles only from your own tags" for Swap Lab only; Autofill and the Cut Coach keep their rules |
| What other people see | The estimate and the declared bracket on share pages; deck tiles and link unfurls show the declared bracket only |
| Opponents in the game journal | An optional field from day one — card ids, never player names |
| The first-five-minutes work | Right after Y1 |
| Swap Lab + Budget Twin vs the journal | Before the journal — the owner's stated order |
| Game snapshots vs the 50-version limit | Their own allowance — they never block Save version or Restore |

Checked against the code and the live site, the five asks become sixteen one-session packages in four themes:

1. **Honest and simple** — labels that say what the data is, an honest first screen, doors into the editor (ask 5).
2. **Know your deck's bracket** — the data, a pure engine, the line and its Why sheet, your target, the share page (ask 1).
3. **Tune it to your table** — goals in Suggestions, Autofill and the Combo Radar; Swap Lab; Budget Twin (ask 2).
4. **Remember your games** — the journal and its results (ask 3; ask 4 waits in LATER with its data collected from day one).

---

## A. Recommended direction

**Build four things, in this order:** honest labels and an honest first screen (Y1–Y2b) → the explainable bracket advisor (Y3a–Y5) → recommendations that respect the deck's bracket and budget (Y6a–Y8) → the game journal and its results (Y9a–Y10).

**Announce point: after Y5.** By then a stranger meets honest labels and an honest first screen, every Magic deck carries a bracket line with its reasons one click away, and the share page offers a pregame summary to paste into Discord. P2.9 round 3 stays armed for the r/EDH post.

**The decisions that matter most**

| Decision | Why |
|---|---|
| The advisor shows **what the cards prove** (a minimum bracket), **what the read assumes**, and the player's **target** — never one authoritative number | The owner asked for "the cards and gameplay assumptions behind the estimate". Wizards says intent outranks the card checklist and site estimates are only estimates. Archidekt shows an estimate and a set bracket, Moxfield the higher of the two, Spellbook only its estimate; Deckwarden shows the read and the target separately |
| Named sources only: Game Changers = Wizards' list via Scryfall `game_changer`; mass land denial + extra turns = **Scryfall Tagger** (Commander Spellbook's own source) behind an override file; combo tags + "relevant" = **Commander Spellbook**; complete combos = Deckwarden's stored Spellbook combos | Evidence or nothing; no inference from card text; the Game Changers list is the only official card list |
| Port Spellbook's **MIT deck ladder** (with its license notice) as a pure MTG-adapter function, adjusted to **Wizards' text in both directions** — stricter where Spellbook is lenient (a relevant two-card combo reads at least Bracket 3 whatever its tag), "your call" where Spellbook over-escalates (2+ extra-turn cards; edge land denial such as planeswalker ultimates) | The official text bars two-card combos below Bracket 3 and only bars *chaining* extra turns. Spellbook tags Hullbreaker Horror + Sol Ring "Exhibition" and pushes any Tagger land-denial card to 4+ |
| A combo that uses your commander, or needs a template, is "your call" — never counted silently low | Spellbook computes combo tags with the commander unknown; template requirements can't be confirmed from the list |
| **The popularity floor stays**; the read says what it can't see ("combos no EDHREC deck has played aren't checked") | Keeping never-played combos would leak "In 0 decks" rows into the Radar, Suggestions, Autofill and the hub totals (LATER row 48) |
| **A failing source never lowers the read.** A failed or partial Tagger fetch keeps the last good flags; each source's freshness rides into the read; a missing, stale or disabled source makes its factor read "Couldn't check" | Sparse true-only flags cannot tell "none" from "no data" |
| **Tutors never raise the read**; a banned card means "needs a legal list" | Wizards removed tutor restrictions on 2025-10-21; Spellbook leaves a banned list undefined |
| No runtime call to Spellbook's `/estimate-bracket`; the sheet links out instead | Adapter purity; no third-party dependency on a request path; Spellbook asks for sparse API use |
| A versioned ruleset lives in the adapter as data, and a **ruleset watch** — the nightly's last step — fails like the DB gauge when Scryfall's Game Changer set stops matching the ruleset's pinned hash | Brackets are beta; a mid-2026 update was promised and not found. Flags update themselves; allowances need a reviewed one-line change |
| Plain words, never notation: "At least Bracket 3 (Upgraded)", "Bracket 1–2 · nothing here goes past Core"; never a low badge on missing data; "approves" stays legality-only, enforced by a test over all bracket and journal copy | Casual players; `warden-copy.test.ts` covers only its own table |
| The bracket lives **on the legality line** (editor deck pane, share header) with one sheet — a Drawer on phones, a Modal from md; **no new tab** | The tools pane holds four tabs in ~320 px; the editor header is full at 768 px |
| Combo facts come from **one GET keyed by the sorted card ids** (edge-cacheable), fetched once per settled snapshot whenever a commander is present — drafts, private decks and share pages alike | Keeps the editor's zero-POST pins for seeded drafts; a combo-seeded draft shows its combo |
| Deck goals = **one nullable `decks.goals` jsonb** with game-agnostic keys (`targetLevel`; the adapter supplies "bracket" and its range), saved through **its own PATCH** that never bumps `updated_at`. Public subset: the target, the exceptions line, and the answers that changed the read; the budget stays owner-only | Lean (0 bytes unset); X5's one-column precedent; a setting must not reorder "recent" rails; adapter purity |
| Recommendations get one pure **`applyGoals`** step after ranking (rank all → goals → slice) covering **all four** card rules plus budget. Conflicts are never evidence and never score; hidden cards are counted; with no target, each card shows its **bracket impact** | Evidence or nothing; a target-2 suggestion must never turn the bracket line to "your call" |
| One place names over-target cards — the bracket sheet's conflict callout; in Y7b each row gains "Swap…", which *is* "lower the bracket" | No duplicate lists; the Cut Coach keeps its over-100 job |
| Swap Lab matches "does the same job" by shared **Tagger function tags** (a UUID whitelist with a kill-switch and the same fallback rule), ranked by existing evidence; text embeddings rejected | The owner's answer; the no-inference rule; the Neon budget |
| Journal: account-only; table **`deck_games`** (`games` is taken); adapter `journal` declarations (Magic: pods of 2–8 plus a table level; One Piece: 1v1, went first or second); a deck-scoped version number (no FK) plus a playable-list hash; "Played" snapshots with **their own allowance** (`deck_versions.kind`); logging never fails; the table level stays empty unless picked; opponents optional, stored as oracle ids | The exact list played with zero extra steps; equal two-game standing; no assumed values stored as data |
| Stats read "N games · W–L–D" with the pod baseline ("an even 4-player table wins 1 in 4"); a percentage only from 10 games; no streaks; owner-only | 5 wins in 20 games has a 95% interval of about 11–47%; REDESIGN's fun ceiling; history is owner-only (LATER row 46) |
| **Migrate before push**: generate → eyeball → the owner's yes → `pnpm db:migrate` → confirm the column → only then the dev pass, the push and any dispatch | `db.select().from(decks)` selects every column, so code ahead of its column breaks every deck route; the 10:37 Z nightly would write a column that doesn't exist |

---

## B. Current-state findings

**Who it serves.** A Commander player getting ready for a pod who wants to know, and say, what kind of game their deck brings. A budget brewer who wants suggestions that stay in budget without re-choosing it every visit. A player who wants to remember how a list actually did. And a stranger arriving from a link, who should never meet a dishonest label or a dead end.

**Verified against the code and the live site** (six read-only research agents at `53942d6`, then three critics; signed-out prod reads only; no database queries):

| Ask | What exists today | Gap |
|---|---|---|
| 1 Bracket advisor | No bracket concept anywhere: `bracket` and `game_changer` hit only unrelated One Piece code. The legality line is `ValidationPanel` (`src/components/deck/validation-panel.tsx`), rendered after the deck summary in the editor (`src/components/editor/deck-list-pane.tsx` 193–198) and under the byline on the share page (`src/components/deck/deck-share-view.tsx` 357–364); its zero-issue line is the only approval wording allowed (`src/lib/warden-copy.ts`). Scryfall's `game_changer` is on every default_cards object, but `ScryfallCard` and `buildAttrs` don't read it (`src/lib/games/mtg/scryfall-map.ts` 32–60, 203–236). Spellbook's bulk carries `bracketTag` and each produced feature's status; `mapVariant` drops both and skips `popularity === 0` (`src/lib/games/mtg/spellbook-map.ts` 26–35, 74). Complete combos come from `loadCombosNearDeck` (`src/lib/combos/queries.ts` 192–281), commander included, capped at 200 by popularity. Editor dialogs share one `EditorDialog` union (`src/components/editor/deck-editor.tsx` 272–277, 1515–1598); `AutofillSheet` is the Drawer-on-phones / Modal-from-md precedent. Card wires carry full `attrs` (`src/lib/cards/wire.ts` 21–54) | Flags, tags, a pure engine, a facts route, a line, a sheet, a place to store a target |
| 2 Bracket- and budget-aware recommendations | One engine: `gatherSignals` → `candidateConditions` → `rankCandidates` (`src/lib/recommend/engine.ts` 124–230; `queries.ts` 24–104; `rank.ts`), weights .30 / .30 / .25 / .15. Budget = a per-card SQL cap (`cheapest_usd <= max`) behind three un-saved controls: Suggestions "Under $5" (`src/components/editor/recommendations-panel.tsx` 48–51), Autofill "≤ $5 a card" (`autofill-sheet.tsx` 82–85), hub staples "Under $5" with a strict `<` (`src/components/hub/staples-table.tsx` 28–35); the Suggestions empty state drops the "$" (`recommendations-panel.tsx` 238). Roles come only from user tags (`src/lib/recommend/cuts.ts` 17–21); Autofill uses no roles by owner decision (`src/lib/games/types.ts` 313–318). Topdeck evidence (mostly cEDH events) reads neutral (`src/lib/games/mtg/recommend.ts` 67, 185, 295–308). `applyListSwap` gives a whole-list swap one save and one Undo (`deck-editor.tsx` 1068–1102); Suggestions and Radar adds and plain removals have no Undo | Saved goals, a goals step, Swap Lab, Budget Twin |
| 3 Game statistics tied to versions | Versions are minted only by Save version, a restore's safety snapshot and a fork's baseline, all through `insertVersion` under a deck lock (`src/lib/decks/versions.ts` 5–28, 180–230). The 50 cap is shared by Save and Restore; numbers are never reused; no list hash exists — list equality is only the pure diff (`src/lib/decks/diff.ts`). History is owner-only (LATER row 46). The name `games` is taken by the card-game registry (`src/db/schema.ts` 52) | A list hash, a games table, a fast log, results |
| 4 Matchups | Nothing; no opponents data | Volume first — LATER |
| 5 Enjoyable and simple | A fresh draft reads "✓ Saved" with no row (`src/components/editor/use-autosave.ts` 27; `editor-header.tsx` 172) and opens on a red "2 problems" (`src/lib/decks/validation.ts` 36–37; `src/lib/games/mtg/validate.ts` 143–176). The empty editor shows View / Group / Sort and keyboard hints on phones (`deck-list-pane.tsx` 213–244; `search-pane.tsx` 198–207). `/decks/new` renders nothing on the server (`src/app/decks/new/page.tsx` 43). Paste a list is More → Import only. Suggestions wait for a saved deck (`recommendations-panel.tsx` 104–106) though the engine serves snapshots (`engine.ts` 18–22). Account owners never see "Open in editor" on their own share page (`src/app/(site)/d/[publicId]/page.tsx` 141 passes `isOwner: false`; `deck-share-view.tsx` 163–167 and 398–407 check only a claim token) | Honest labels, a quieter first screen, doors |

**Verified on prod, signed out (2026-09-30)**

- The mono-white "Sram — Budget Armory" share page (`/d/k88m2jdjtykk`) lists Mana sources White 34/2, **Blue 0/1, Black 0/1, Red 0/1, Green 0/1**, Colorless 3/2. Arcane Signet's text ("any color in your commander's color identity") matches `producedMask`'s any-color rule (`src/lib/games/mtg/analyze.ts` 25–39), so it counts as one source of all five. LATER row 31's trigger ("the Mana sources table misleads") has fired.
- Home's Magic shelf reads "Most-played commanders — Ranked by how much each commander is actually played (EDHREC data via Scryfall)" (`src/components/home/leader-shelves.tsx` 93–96), and `/commanders` repeats the sentence (`src/app/(site)/commanders/page.tsx` 97). The data is Scryfall's `edhrec_rank`: a card's overall rank by EDHREC decklists that include it, mostly in the 99 — Ragavan sits third. "Most-played" / "play data" wording also sits on hub staples, hub combo totals, card-page combo totals, the Combo Radar, the Autofill sheet, the `/cards` set strip and recommendation evidence (inventory in D1).

**Measured on 2026-09-30** (read-only; no database)

| What | Number |
|---|---|
| Game Changers (Scryfall `is:gamechanger`) | 53 — the same names as Wizards' list (last change 2026-02-09: Farewell and Biorhythm added) |
| Tagger `mass-land-denial` / `extra-turn` | 111 / 58 cards (106 / 53 Commander-legal), including edge cards such as Liliana of the Veil (land denial) and Emrakul, the Promised End (extra turn) |
| Scryfall `oracle_tags` bulk | ~6 MB gzipped; 4,559 tags; 236,494 direct taggings; updated daily |
| Spellbook variants (the 09-30 nightly) | 112,543 seen · 66,894 kept · 44,122 skipped as never played (2,217 tagged R, 2,124 S, 927 P among them) |
| Spellbook tags among played, legal variants | R 4,296 · S 9,165 · P 1,593 · O 2,146 · C 194 · E 48,940 |
| Template-gated combos | 3,012 |
| The Radar's scan cap | 200, by popularity |
| The nightly Scryfall step | 30–82 s; refresh nights already rewrite ~30k of 35,349 identities |
| Database | 270.9 MB on 2026-09-30 (alert 350) |
| One 100-card version | ~7 KB of JSON, ~2–3 KB on disk |
| The bracket data | ~2 KB of Game Changer flags, < 20 KB of Tagger flags, ~0.1–0.5 MB for a combo tag and a "relevant" flag |
| A K≈200 neighbor table (the teardown's blueprint) | ~0.46–0.8 GB with Deckwarden's keys — rejected |

**The official rules as of 2026-09-30** (paraphrased from Wizards' Commander format page and the announcements of 2025-04-22, 2025-10-21 and 2026-02-09; still labeled beta)

| Bracket | Name | Game Changers | Mass land denial | Extra turns | Two-card combos | Games should last at least |
|---|---|---|---|---|---|---|
| 1 | Exhibition | none | none | none (thematic exceptions by agreement) | none | 9 turns |
| 2 | Core | none | none | no chaining | none | 8 turns |
| 3 | Upgraded | up to 3 | none | no chaining | none before turn 6 | 6 turns |
| 4 | Optimized | no limit | — | — | — | 4 turns |
| 5 | cEDH | no limit | — | — | — | any turn |

Around the table: intent outranks the card checklist (a deck that fits a lower bracket's card rules but plays stronger belongs higher); site estimates are estimates; tutor restrictions were removed on 2025-10-21; precons are no longer tied to Core; Rule Zero applies at every bracket except cEDH; the Commander Format Panel's October 2025 graphic counts game-enders, lockouts and infinites as two-card combos; the Game Changers list is the only official card list (land denial, extra turns and combos have definitions but no lists); a mid-2026 update was promised and has not been found.

**Validation corrections** (what the research documents and LATER got wrong, or had not measured)

- The teardown says Tagger tags aren't in Scryfall's bulk files. They are: `oracle_tags` is a documented bulk file.
- The teardown's K≈200 neighbor table would be ~0.46–0.8 GB with Deckwarden's keys — larger than the whole free tier.
- The Mythic review says Spellbook editors can override combo tags. Spellbook removed the override field on 2026-03-04 (its backend migration 0060); tags come from its published rule. Its syntax guide still says otherwise.
- The review's suggested label "Popular commanders — based on published decklists" is still wrong: the shelf ranks a card's overall EDHREC rank (mostly inclusion in the 99), not its use as a commander. Y1's label says what is ranked.
- LATER row 31 says Treasure makers aren't counted as mana sources. Scryfall's oracle text keeps Treasure reminder text ("Add one mana of any color"), so they count as five-color sources today.
- Spellbook's deck estimate never returns bracket 5 (its R means "4+"), ignores tutors, and silently drops cards it doesn't know.
- Spellbook is more lenient than Wizards in one place (a slow relevant two-card infinite can be tagged C or E — Hullbreaker Horror + Sol Ring is E) and stricter in two (two or more extra-turn cards, or any Tagger land-denial card, push a deck to 4+).
- Keeping never-played combos "for the bracket read only" is not free: no existing consumer filters on popularity, `rank.ts` treats a popularity of 0 as a known (high-confidence) number, and the Radar's footer would become false. The floor stays.

**Strengths to preserve (non-negotiable in every package)**

- Everything in WAVE2.md's and WAVE3.md's section B lists still holds: the keyboard script; "the first real edit creates exactly one deck"; ISR on `/c/`, `/l/`, `/cards/[id]` (and `/precons`, `/sets` static) with no request data read; evidence or nothing; adapter purity with optional fields; the smoke-pinned strings; a GET parameter never edits a saved deck; seeds are state only; the Neon budget.
- "Approves" belongs to the zero-issue legality line only. One line of Warden voice per surface, shield mark only. No confetti, sounds or streaks.
- The states vocabulary (Skeleton loading, EmptyState, a one-sentence error with Retry, a Toast with Undo when reversible, a status line otherwise). Status is never color-only. 44 px targets on coarse pointers. `motion-safe:` only. Dates rendered by SSR'd client components are UTC-pinned.
- The share page's visitor action row and the editor's More list change only with their pins; nothing per-viewer appears on an ISR page.
- No recommendation without a named source; Topdeck credit wherever tournament evidence renders; Commander Spellbook credit wherever its combos or tags render.

**Assumptions and limits**

- Signed-in surfaces were read from source and tests, not seen live: the browser pane is signed out on prod and on localhost. Each signed-in package ends with a short list of the owner's clicks.
- Tagger's tag UUIDs are pinned in Y3a by one read of the bulk file; the clear-versus-edge land-denial split is decided there from the measured list.
- The precon spread across brackets is unmeasured. Y3b records it with a read-only script, after the owner approves the database read.
- Spellbook's combo speed is a mana-value proxy, and one input it uses isn't public. Deckwarden reads Spellbook's stored tag rather than recomputing speed.
- EDHREC's terms forbid automated queries; nothing here touches EDHREC directly.
- Scryfall asks for a way to switch off individual Tagger tags; the override file is that switch.

---

## C. Prioritized idea map

Effort: **S** < ½ session · **M** ½–1 session. Priority: **Now** = before the announcement · **Next** = the following run of sessions · **Later** = trigger-gated in `LATER.md`.

| # | Your ask | Treatment | Packages | Priority | Effort | Depends on | Rationale |
|---|---|---|---|---|---|---|---|
| 5 | More enjoyable and simple | **Include:** honest labels, an honest first screen, doors into the editor | Y1, Y2a, Y2b | Now | S–M, S–M, M | — | What a stranger meets first; two labels are wrong on prod today |
| 1 | An explainable bracket advisor | **Include:** named-source data → a pure engine → the line and its Why sheet → your target → the share page | Y3a, Y3b, Y4a, Y4b, Y5 | Now | M each | each on the one before | The cards, the assumptions and the player's intent, each shown separately |
| 2 | Recommendations tailored to bracket and budget | **Include:** one goals step in Suggestions, Autofill and the Radar; Swap Lab; Budget Twin | Y6a, Y6b, Y7a, Y7b, Y8 | Next | M, M, M, S–M, M | Y3b (the read), Y4b (goals) | Constraints become saved defaults instead of three toggles that reset |
| 3 | Game statistics tied to deck versions | **Include:** a journal that snapshots the played list, then results | Y9a, Y9b, Y10 | Next | M, S–M, S–M | Y4b (target), X2's suggest box (opponents) | The exact list played, with zero extra steps; honest sample sizes |
| 4 | Matchup statistics, later | **Defer**, with the data collected from Y9b on | LATER | Later | M | Y9b | One user can't produce matchup volume |
| 2 | — MTG Replace-style text-similarity neighbors | **Reject for now** | LATER | Later | L | — | Breaks the no-inference rule; ~0.5–0.8 GB |
| 1 | — a live Spellbook estimate on every read | **Reject for now** | LATER | Later | M | — | A third-party dependency on a request path; adapter purity |

**My additional recommendations** (labeled; veto any in one line)

| Id | Recommendation | Benefit | Effort | Tradeoff | Where |
|---|---|---|---|---|---|
| REC-1 | Honest popularity labels: "in N decklists", never "played" for EDHREC rank | The home page stops claiming something its data can't show | S | Copy across ten sites and their pins | Y1 |
| REC-2 | Mana sources clamped to the commander's colors, the heuristic disclosed | No phantom off-color sources | S | One analytics test rewritten | Y1 |
| REC-3 | One budget vocabulary, inclusive, everywhere | The same tier reads the same and filters the same | S | The hub's `<` becomes `<=` | Y1 |
| REC-4 | "Competitive" on Topdeck evidence in Suggestions, the Cut Coach and Autofill | Casual players know where a suggestion's evidence comes from | S | Exact evidence strings and two smoke regexes move | Y1 |
| REC-5 | Account owners see "Open in editor" on their own share page | The only user can reach their editor from their deck's link | S | One new owner-case test | Y1 |
| REC-6 | An honest "Draft" save slot and "Keep this deck" for seeded drafts | Nobody loses a precon draft that said "Saved" | S | A fourth slot state | Y2a |
| REC-7 | Progress, not problems ("Choose a commander · 100 to go") | A new deck starts with a to-do, not a red error | S–M | An optional adapter field; two validation pins | Y2a |
| REC-8 | One Undo for plain removals | The cheap half of LATER row 60 | S | — | Y2a |
| REC-9 | Start doors, including Paste a list in two clicks | The fastest paths stop hiding under More | M | A one-shot `?import=1` latch | Y2b |
| REC-10 | Suggestions in drafts | No throwaway edit before Suggestions answer | S–M | One snapshot route with its own bucket | Y2b |
| REC-11 | The ruleset watch and the documented Spellbook bulk URL | Rule changes and a moved bulk file can't go stale silently | S | A red nightly when the Game Changers change | Y3a |
| REC-12 | "At the table": a pregame summary, "Copy for the table", the phone share sheet, an owner action row | Brackets exist for the pregame conversation | M | The share page's owner row differs from the visitor row | Y5 |
| REC-13 | An Undo toast for Suggestions and Radar adds | Every add can be taken back the same way | S | — | Y6a |

**Before → after (what a player notices)**

| Moment | Today | After Wave 4 |
|---|---|---|
| "Does my deck fit a Core table?" | No bracket anywhere | "At least Bracket 3 (Upgraded) · Why?" → the Game Changers named, what the read assumes, "Remove Rhystic Study and Cyclonic Rift to fit Bracket 2", a target to set |
| A budget brewer opens Suggestions | Moxen under "All"; the budget resets every visit | "Bracket 2 · ≤ $5 a card" remembered; "6 hidden by your goals · Show" |
| Before game night | Paste the decklist | "Copy for the table": bracket, Game Changers, combos, pace, exceptions |
| A card is too pricey or too strong | Remove → search → add, through a red 99/100 | "Swap…" → cards that do the same job, within your goals → one Undo |
| After a game | Nothing to record | Won / Lost / Draw → logged against the exact list |
| A month later | — | "v8: 3 of 7 in 4-player games (an even table wins 1 in 4)" |
| A stranger's first deck | "✓ Saved" on an unsaved draft; a red "2 problems" | "Draft"; "Choose a commander · 100 to go" |
| The home page | "Ranked by how much each commander is actually played" | "Popular in Commander decklists (EDHREC via Scryfall)" |

---

## D. Design specification

### D0. Shared rules

**Retain** WAVE2.md's and WAVE3.md's D0: tokens, the primary button's gold hairline, Literata for titles and Geist for controls and data, the states vocabulary, the icon set, the motion policy, `ui/autocomplete.tsx`. Wave 4 adds no color, no font and no layout change.

**Reuse, don't add.** Sheets use the AutofillSheet split (`ui/drawer.tsx` on phones, `ui/modal.tsx` from md). Choices use `Segmented` (`src/components/deck/segmented.tsx`). Evidence rows use the Suggestions grammar — `source · why · with[] · howOften · confidence` with `ConfidenceChip` and `sourceMeta` (`src/components/editor/recommendations-panel.tsx` 260–279). Card names on share pages use `CardNamePreview`. Reversible actions toast with Undo through `notify`. The installed-but-unused `popover`, `tooltip` and `progress` stay unused unless a package needs one.

**Copy rules.** Plain words: "At least Bracket 3 (Upgraded)", never "3+ (est.)" or "2–3+". "Your call" names what only the player can decide; "Couldn't check" names missing data. A new test (`src/lib/brackets/copy.test.ts` or beside the strings) fails if any bracket or journal string contains "approve". Bracket numbers lead; Spellbook's tag names (Ruthless, Spicy, …) appear only in its credit link.

**Attribution.** Game Changers: "Wizards' Game Changers list (via Scryfall)". Land denial and extra turns: "community-tagged on Scryfall Tagger", linked to the tag. Combos: the existing Commander Spellbook credit. The ported ladder's file carries Spellbook's MIT copyright and permission notice. Topdeck's credit stays wherever tournament evidence renders.

**Adapter gating.** Every new surface renders only where the adapter declares it: `brackets` (Magic only — One Piece shows nothing and no apology copy) and `journal` (both games). Core names are game-agnostic — `targetLevel`, `table_level`, `brackets`, `journal`; "bracket" is the Magic adapter's noun.

### D1. Honest labels (Y1)

**The phrase inventory.** Y1 starts from a grep, not a count: `actually played`, `play data`, `most-played`, `Most played`, `Widely played`, `Sees Commander play`, `real play data` over `src/` and `scripts/`. Every user-visible hit is rewritten or listed as exempt; code comments follow the copy.

| Site | Today | After Y1 | Pins |
|---|---|---|---|
| Home shelf (`src/components/home/leader-shelves.tsx` 93–96) | "Most-played commanders" · "Ranked by how much each commander is actually played (EDHREC data via Scryfall)." | "Popular in Commander decklists" · "Commander-eligible cards ranked by how many EDHREC decklists include them — as commander or in the 99 (via Scryfall). Not games played." | none |
| `/commanders` (`src/app/(site)/commanders/page.tsx` 97; its metadata's "by color identity and popularity" is accurate and stays) | the same sentence | "Ranked by EDHREC decklist popularity via Scryfall: how many published decklists include each card, as commander or in the 99 — not how often it's played." | none |
| Hub staples (`src/app/(site)/c/[slug]/page.tsx` 260–261) | "The N most-played cards that fit this color identity, ranked by EDHREC play data via Scryfall." | "The N cards that fit this color identity in the most EDHREC decklists (EDHREC rank via Scryfall)." | `hubs-smoke` — re-grep |
| Hub footer (`c/[slug]/page.tsx` 481) | "play-rate ranking from EDHREC data included in Scryfall bulk" | "popularity ranking from EDHREC decklist data included in Scryfall bulk" | none |
| Combo totals (`c/[slug]/page.tsx` 322, `src/app/(site)/cards/[id]/page.tsx` 212) | "The N most-played of M combos" | "The N most popular of M combos (by EDHREC decklist count)" | `scripts/combos-smoke.ts` 117, 154 (the regex moves with it) |
| Combo Radar (`src/components/editor/combo-radar-panel.tsx` 337, 433) | "Showing the N most-played of M." · "Scan capped at the most-played matches for this deck." | "Showing the N most popular of M." · "Scan capped at the most popular matches for this deck." | `combo-radar-panel.test.tsx` 125 |
| `/cards` set strip (`src/components/cards/card-search.tsx` 495, 498) | "Most played in {set}" · "Ranked by EDHREC play data via Scryfall." | "Most popular in {set}" · "Ranked by EDHREC decklist popularity via Scryfall." — "most popular" was the owner's own word on 2026-09-28 | `card-search.test.tsx` 270, 277, 345, 361; `sets-smoke.ts` 237's label |
| Evidence tiers (`src/lib/games/mtg/recommend.ts` 153–156, 225, 232) | "A Commander staple by EDHREC play data" · "Widely played in Commander decks" · "Sees Commander play" | "A Commander staple in EDHREC decklists" · "In many Commander decklists" · "In some Commander decklists" (cut-side tails unchanged) | `recommend.test.ts` 140; `autofill-sheet.test.tsx` 66, 104, 230, 232 |
| Autofill sheet (`src/components/editor/autofill-sheet.tsx` 299, 302) | "… The rest comes from real play data — every pick shows why." · "Built from real play data for …" | "… The rest comes from real decklists and tournament results — every pick shows why." · "Built from real decklists and tournament results for …" ("every pick shows why" stays — WAVE3 D0) | `autofill-sheet.test.tsx` 324; `deck-editor.test.tsx` 952 |
| Topdeck evidence (`recommend.ts` 185, 295, 302, 308) | "Played in 62% of top-16 lists with Kinnan, Bonder Prodigy" | "Played in 62% of competitive top-16 lists with Kinnan, Bonder Prodigy" — the `why` lines only; the scope sentence at 67 stays, so `recommend-smoke.ts` 387's regex holds and 378's still matches | `recommend.test.ts` 101, 189, 197, 208 |
| **Exempt** | The Meta Lens ("Most played with {leader}", "The N most-played cards in M settled top-16 lists", `c/[slug]/page.tsx` 294–297) — tournament lists, honest and smoke-pinned (`hubs-smoke.ts` 414–454) | byte-identical | — |

**Mana sources.** In `analyzeMtg`, compute `commanderCi` as the OR of the command zone's `ciMask` (`src/lib/games/mtg/validate.ts` 204–205's pattern). With at least one commander, count `producedMask(card) & (commanderCi | C)`; with none, keep today's counting. The table block (`src/lib/games/types.ts` 159) gains an optional `hint`, rendered by `DataTable` (`src/components/deck/analytics-blocks.tsx` 152–181): "Cards that make 'any color' count once for each color your commander allows; Treasure makers count through their reminder text." Tests: `analyze.test.ts` 78–101 rewritten (Birds of Paradise under Atraxa → White, Blue, Black, Green; no Red); a mono-white Arcane Signet regression (rows White and Colorless only); a no-commander case. LATER row 31 is rewritten as fired, with the Treasure correction.

**One budget vocabulary.** One shared list (for example `src/lib/recommend/budget.ts`): All · ≤ $5 a card · ≤ $1 a card, inclusive everywhere. Suggestions (`recommendations-panel.tsx` 48–51), Autofill (`autofill-sheet.tsx` 82–85) and the hub staples (`staples-table.tsx` 28–35, whose `<` becomes `<=`) all import it. The Suggestions empty state reads "No suggestions with a known price of $5 or less — try a wider budget."

**Owners on their share page.** `src/app/(site)/d/[publicId]/page.tsx` already reads the session; it passes `isOwner = deck.userId !== null && deck.userId === sessionUserId` to `DeckShareView`, which shows "Open in editor" for a claim token **or** `isOwner` (`deck-share-view.tsx` 398–407). The visitor row pin (`deck-share-view.test.tsx` 111–119) stays green; a new owner-case test joins it. One name everywhere: "Open in editor" (`src/components/account/deck-action-items.tsx` 91; pins `account-deck-tile.test.tsx` 98, 122).

**The Share dialog** (`src/components/editor/share-dialog.tsx` 17, 19, 96 — an RTL test first; none exists). Public: "Anyone with the link can view. Public decks also appear on the home page, their commander's page and your profile." Private: "Only you can view it" for an account deck, "Only this browser can view it" for a guest deck. Copy confirms in a status slot (the share page's F12 pattern) instead of swapping the button's label.

### D2. The first five minutes (Y2a, Y2b)

**The draft slot (Y2a).** `SaveIndicator` (`editor-header.tsx` 166–201) gains a draft branch: "Draft" in the fixed `w-36` slot, titled "Saves on your first change", no check mark. `data-status` keeps the autosave state and a new `data-draft` marks drafts, so the fourteen `data-status="saved"` assertions in `deck-editor.test.tsx` (200, 236, 241, 259, 316, 750, 787, 947, 1017, 1227, 1264, 1270, 1320, 1353) hold.

**"Keep this deck" (Y2a).** Seeded drafts (precon, combo, Surprise me, a chosen leader) show one button that runs `ensureDeck` and a save. It is an explicit acceptance, so it is a real edit: exactly one deck, pinned.

**`/decks/new` (Y2a).** A Suspense fallback with the header and a skeleton replaces `fallback={null}` (`src/app/decks/new/page.tsx` 43).

**Progress, not problems (Y2a).** An optional adapter field marks under-minimum issues (an empty leader zone; DECK_SIZE below the minimum) as progress. `ValidationPanel` renders them as one neutral line — "Choose a commander · 100 to go" — while errors stay red. The deck summary reads "98 / 100 · 2 to go" beside the ring. Server legality and the PUT's validation are unchanged, and the approval line still never shows on an empty deck. One helper owns the phrase; Y4a's draft line reuses it. Pins: `validation-panel.test.tsx` 42–46, 99.

**A quiet first screen (Y2a).** View / Group / Sort render once the list has a card. Keyboard hint lines render on fine pointers only, with ⌘ on Mac. Phones show one Add cards button.

**One Undo for removals (Y2a).** A plain removal, or a stepper reaching zero, toasts "Removed X · Undo" through `notify` — LATER row 60's cheap half.

**Start doors (Y2b).** The empty draft's EmptyState and `/decks/new` (per game) offer: Pick a commander (`display.leaderBrowse`) · Paste a list (`?import=1`, a one-shot latch stripped from the URL like `?autofill=1`) · Start from a precon (Magic) · Surprise me (Magic) · and, once a leader is set, the existing Autofill door. Doors are links or state-only seeds; nothing mints a row.

**Suggestions in drafts (Y2b).** `POST /api/recommendations` (new): `{game, format, leaderIds, entryIds, budget?}`; facts read server-side through `loadEntryFacts`; `recommendForSnapshot`; `force-dynamic` and `Cache-Control: no-store`; its own per-IP bucket (windows ≤ 1 day — the nightly purge sweeps counters older than 2 days). The panel calls it when no deck row exists and only while its tab is active, so the zero-POST pins for seeded drafts (`deck-editor.test.tsx` 1003–1017, 1301–1320) hold. One Piece answers 400 (no recommendation meta).

**First approval (Y2b).** When validation first flips to zero (R3's F1 transition), one inline "Share this deck" link appears under the Warden line, once per deck per browser (a `deckwarden:*` flag through the appearance-store pattern).

### D3. Bracket data (Y3a)

**Precondition.** One read of Scryfall's `oracle_tags` bulk pins the tag UUIDs for `mass-land-denial` and `extra-turn` (with their descendants) and lists every flagged card with its tagging weight; the clear-versus-edge land-denial split is decided from that list and Wizards' examples (Armageddon, Ruination, Sunder, Winter Orb, Blood Moon are clear; planeswalker ultimates and Liliana of the Veil-style edges are edge).

**Game Changers.** `ScryfallCard` gains `game_changer?: boolean | null`; `buildAttrs` writes `game_changer: true` only when true. The run asserts the field is present on every object (null is not false) and records `stats.game_changers = {count, md5 of the sorted oracle ids}`.

**Tagger flags.** The Scryfall step streams `oracle_tags` before staging, rolls taggings up over descendants (Spellbook's rule), and writes sparse `attrs.mld: "clear" | "edge"` and `attrs.extra_turn: true`. `data/mtg/tagger-overrides.json` holds the clear/edge split, disabled tags and disabled cards; an unknown id fails the run (the One Piece legalities-overlay pattern). **On a fetch or parse failure, or a missing pinned UUID, the run keeps the flags already stored**, records `stats.tagger = {stale_since, tag_ids, counts}`, and does not fail the Scryfall step.

**Spellbook.** `SpellbookVariant` gains `bracketTag` and `produces[].feature.status`. `ComboRow` gains `bracket_tag` (one character; an unknown letter becomes NULL and is counted in stats — no CHECK constraint) and `relevant` (true when any produced feature has status S). Both join the stage table, the INSERT and the tuple compare (`scripts/ingest/spellbook.ts` 87–158). The URL becomes the documented `https://json.commanderspellbook.com/variants.json.gz`; stats record the bulk's `version` and `timestamp`. The popularity floor stays.

**Migration `0016`.** Expected: two `ADD COLUMN` lines on `combos` (a nullable one-character tag and a nullable boolean), nothing else. The first tagged nightly rewrites every combo row once (dead tuples up to the size of the combos heap, roughly 15–20 MB, until autovacuum) — disclosed and re-measured after the next nightly.

**The ruleset watch.** The nightly's last step compares `stats.game_changers.md5` with the hash pinned in the adapter's ruleset and fails when they differ: "The Game Changers list changed on Scryfall — read Wizards' announcement, then update the ruleset's as-of date and hash." The flags have already updated themselves; the step exists so a rules change is read by a person.

### D4. The bracket engine (Y3b)

**The ruleset** (adapter data, versioned): the five brackets with their names; the Game Changer allowance (0 / 0 / 3 / none / none); the land-denial, extra-turn and two-card-combo rules of the B table; the turn expectations (9 / 8 / 6 / 4 / any); source links; `asOf` (bracket text 2025-11-05, Game Changers 2026-02-09); the pinned Game Changer hash; a `version`.

**`assessBracket` (`src/lib/games/mtg/brackets.ts`, pure).** In: the snapshot; card facts (`game_changer`, `mld`, `extra_turn`, legality); complete combos `{key, cardPieces, usesCommander, templates, tag, relevant, results}`; source freshness; optional goals and answers. Out: `{status: draft | read | review | blocked | unavailable, minimum, suggested, factors[{sentence, cards, source, change}], assumptions[], review[{question, cards}], ruleset {version, asOf}}`.

| Evidence | Effect | Source named |
|---|---|---|
| 4 or more Game Changers | at least Bracket 4 | Wizards' list (via Scryfall) |
| 1–3 Game Changers | at least 3 | same |
| A clear land-denial card, or a complete combo whose results include mass land denial | at least 4 | Scryfall Tagger / Commander Spellbook |
| An edge land-denial card | your call — "Does it deny lands the way Armageddon does?" | Scryfall Tagger |
| A complete combo whose results include infinite or near-infinite turns, or control of every opponent | at least 4 | Commander Spellbook |
| Two or more extra-turn cards | your call — "Do these extra turns chain?" | Scryfall Tagger |
| One extra-turn card | at least 2 | Scryfall Tagger |
| A **relevant two-card combo**: complete, at most two cards besides your commander, no template | at least 3 | Commander Spellbook (the combo) + Wizards (the rule) |
| A complete combo's Spellbook tag | R → at least 4 · S → "3 or 4", your call · P → at least 3 · O → "2 or 3", your call · C → at least 2 · E → nothing | Commander Spellbook |
| A combo that uses your commander | also your call — "It may be faster with your commander" | Commander Spellbook |
| A combo that needs a template | your call — "Also needs …" | Commander Spellbook |
| Nothing flagged | "1–2" — Exhibition or Core is your intent | — |
| A banned card | blocked — "needs a legal list" | legality |
| Fewer cards than the format's minimum | draft — concerns found so far stay listed | — |
| A source missing, stale or switched off | its factor reads "Couldn't check" — never a lower number | ingest freshness |
| Tutors, fast mana | nothing | — |

The highest rule wins. **Answers** to "How it plays" only raise `suggested`: theme first → 1 when the minimum allows it; staples and high card quality → at least 3; "usually wins or locks the table before turn 6" → at least 4; tuned for the cEDH metagame → 5. Each "change" names the cards whose removal would lower the minimum ("Remove Rhystic Study and Cyclonic Rift to fit Bracket 2").

**Core loaders.** `loadCompleteCombos(cardIds)` — complete only (`HAVING count(*) = piece_count`), uncapped, color-fit to the deck, returning key, pieces, `bracket_tag`, `relevant`, templates and results; its plan, warm time and `DB_LOG` count are recorded. A freshness loader reads the latest successful Scryfall and Spellbook `ingest_runs.stats` (Game Changers as-of and count, Tagger `stale_since`, Spellbook version and timestamp) and passes them into the read.

**Calibration.** A read-only script over the 181 precon decks (one `read only` transaction, after the owner approves the read) prints the spread of minimums and "your call" counts. The ship note records it; it decides whether a `/precons` filter ever earns a package (LATER).

### D5. The advisor (Y4a, Y4b)

**The facts route (Y4a).** `GET /api/combos/complete?game=mtg&ids=<sorted, comma-joined identity ids>` → `{combos, freshness}`. Validated (at most 200 ids, uuid shape). Caching intent: dynamic rendering with `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` — the answer depends only on the id set and the nightly data. Its own per-IP bucket, sized for one call per settled edit. Called once per settled snapshot whenever a commander is present, drafts included; never a POST. Below the format minimum the line still shows what client facts prove (the Game Changer count) and, once the facts arrive, any complete combo — a combo-seeded draft shows its combo.

**`BracketLine` (Y4a, new, `src/components/deck/bracket-line.tsx`).** Adapter-gated; renders directly after `ValidationPanel`; computes `assessBracket` client-side from the wires and the facts.

| State | Line |
|---|---|
| Nothing flagged | "Bracket 1–2 · nothing here goes past Core · Why?" |
| A minimum of 3 | "At least Bracket 3 (Upgraded) · Why?" |
| A minimum of 4 | "At least Bracket 4 (Optimized) · Why?" |
| Your call pending | "Bracket 3 or 4 — one combo is your call · Why?" |
| With answers | "Bracket 4 (Optimized) — from the cards and your answers · Why?" |
| Target below the cards (Y4b) | "Your target 2 · the cards say 3+ · Why?" |
| Draft | "Bracket: add 34 more cards · 1 Game Changer so far" |
| Banned card | "Bracket read needs a legal list · 1 banned card" |
| Loading | "Checking combos…" (text, no spinner) |
| Failure | "Couldn't check combos · Retry" |

"Why?" is 44 px on coarse pointers (`pointer-coarse:min-h-11`, as `ValidationPanel`'s toggle). It opens an `EditorDialog` `"bracket"` — a Drawer on phones, a Modal from md — so focus return and hotkey suppression come for free.

**The Why sheet (Y4a, Y4b).**

- **What the cards show** (Y4a): one sentence per factor with its count and named cards; combos with what they do, their piece count and "How it works ↗"; each factor's "what would change it".
- **What this read assumes** (Y4a, fixed text): "Reads the card list only — it can't see how fast your deck wins. Wizards expects games to last at least 9, 8, 6 and 4 turns at Brackets 1–4." · "A combo counts as fast when it needs 4 mana or less to assemble (Commander Spellbook)." · "Your commander counts as always available." · "Tutors and fast mana don't change the read — Wizards dropped tutor limits in October 2025." · "Land-denial and extra-turn lists are Scryfall community tags, not Wizards lists." · "Combos no EDHREC deck has played aren't checked." · "Game Changers: Wizards' list as of {date from ingest}."
- **How it plays** (Y4b; optional, collapsed): "Theme first, over power?" · "Staples and high card quality?" · "Can it usually win or lock the table before turn 6?" · "Tuned for the cEDH metagame?" — each Yes / No / Not sure. Answers are never re-asked after ordinary edits; a ruleset bump shows "Rules changed since you answered".
- **Your target** (Y4b): Segmented 1–5 · Not set; an optional exceptions line ("Table exceptions — e.g. one thematic Game Changer, ask me"); the checked date and the ruleset's as-of; links to Wizards' brackets page and Commander Spellbook.
- **The conflict callout** (Y4b): when the target is below the minimum, the cards that exceed it, each with its reason. Y7b adds "Swap…" to each row.

**Goals (Y4b).** `decks.goals jsonb` (migration `0017`, expected: one `ADD COLUMN`, nothing else) = `{v: 1, targetLevel?, budget?: {perCardUsd?, totalUsd?}, answers?: {…, rulesetVersion}, exceptions?: string ≤ 200}`. Goals have their own client baseline and their own PATCH body `{goals}`; the route bumps `updated_at` only when a non-goals key is present (route and RTL tests pin it). Seeded drafts carry goals in the POST create, as a seeded name does. Setting a target or answering a question in a draft is a real edit and creates the deck. Zod takes the range from the adapter (One Piece rejects `targetLevel`). `deckMetaJson` exposes `targetLevel`, `exceptions` and the answers that changed the read; the budget stays owner-only. Goals are not copied on fork and never set from the read.

### D6. At the table (Y5)

**The share page's line.** The facts join the page's query batch (`src/app/(site)/d/[publicId]/page.tsx`; its caching docblock records the added statements); the private gate calls the facts route from the client. Visitors read "Played as Bracket 2 · the cards say 3+" — the owner's target first, the read beside it — or the read alone when no target is set.

**"At the table"** — a card right under the line, built from the read, the target and the owner's words; the plan line is the owner's description, never generated. "Copy for the table" produces:

```text
Atraxa Superfriends — Commander
Bracket: played as 3 (Upgraded) · the cards say 3+ · checked Sep 30, 2026
Game Changers (Wizards' list): Rhystic Study, Cyclonic Rift
Two-card combos (Commander Spellbook): none found
Land denial / extra turns (Scryfall Tagger): none
Pace (owner): doesn't usually win before turn 6
Exceptions (owner): one thematic Game Changer — ask me
Reads the card list only; combos via Commander Spellbook.
https://deckwarden.gg/d/<id>
```

**The owner's action row.** When the session owns the deck: Open in editor · Copy ▾ (Copy decklist, Copy for the table) · Share… (`navigator.share` on phones, feature-detected, falling back to copying the link). Everyone else keeps today's visitor row byte-identical (`deck-share-view.test.tsx` 111–119). `useCopyToClipboard` and a `CopyStatus` slot are extracted from `copyDecklist` (`deck-share-view.tsx` 124–127, 177–190, 279–292, 408–421) and adopted by the Share and Export dialogs.

**Tiles and unfurls.** The OG image's stats (`src/app/(site)/d/[publicId]/opengraph-image.tsx` 62–63) gain "Bracket 3 (declared)" when the owner set a target, read from goals on the existing deck select; the OG route never computes a read. `DeckTile`'s badge slot shows the declared bracket the same way, through `deckCollectionSelect` → `tileFromDeck`; absent for One Piece and for decks without a target.

### D7. Goals in recommendations (Y6a, Y6b)

**`applyGoals` (Y6a, `src/lib/recommend/goals.ts`, pure).** `applyGoals(ranked, goals, read, meta) → {kept, flagged, hidden}`. A recommendation gains `conflicts[]` (`{rule, source, why, severity: hide | flag}`), separate from evidence and never part of the score. The route ranks every candidate, applies goals, then slices to the limit, and discloses a truncated combo scan.

**Plumbing (Y6a).** The adapter declares its flag paths the way `RecommendMeta.exclude` declares `jsonbPath` — core never names `game_changer`. The flags ride `CANDIDATE_PROJECTION`, `loadEntryFacts` and `loadDeckEntries` (`src/lib/recommend/queries.ts` 106–114, 265–298, 333–348). `CandidateCombo` and `DeckComboView` gain the tag, `relevant`, the piece count and whether a leader is a piece.

**Lines.** "A Game Changer — your Bracket 2 target allows none" · "Mass land denial — Wizards expects none at Brackets 1–3 (Scryfall Tagger)" · "A second extra-turn card — Brackets 2–3 avoid chaining extra turns" · "Completes a combo that alone puts a deck at Bracket 4+ (Commander Spellbook)" · "Costs $45 — over your ≤ $5 a card budget". With no target: "Would make this deck Bracket 3+ — a Game Changer" (a flag, never a hide).

**Suggestions (Y6a).** The budget starts from the deck's goal and "Save as this deck's budget" writes it; Game Changers over the allowance, land denial at targets 1–3, a second extra-turn card and above-target combo completions are hidden behind "N hidden by your goals · Show"; one goals line sits atop Suggestions and the Why sheet ("Bracket 2 · ≤ $5 a card · Change"); Suggestions and Radar adds toast "Added X · Undo"; draft Suggestions (Y2b's route) carry goals. RTL tests for `RecommendationsPanel` land first — none exist.

**Autofill and the Radar (Y6b).** Autofill: the Game Changer cap (0 at targets 1–2; 3 minus the deck's current count at 3), land denial skipped at targets ≤ 3, extra-turn cards capped (0 at 1; 1 at 2–3), above-target combo completions skipped, the measured-staple lock tier off at targets ≤ 3; the target and budget join the POST's zod body; new notes pinned like today's. With goals absent, fixed-seed shells stay byte-identical. The Combo Radar adds one badge per row in our words ("This combo alone puts a deck at Bracket 4+ — Commander Spellbook") and "above your target" when it is; it never filters (its contract: exhaustive up to the disclosed cap).

### D8. Swap Lab (Y7a, Y7b)

**Roles (Y7a).** A whitelist of Tagger function tags declared in the Magic adapter by UUID (ramp, card draw, creature / artifact / enchantment removal, counterspell, board wipe, tutor, protection, recursion, mana rock, mana dork, land ramp, burn, token maker, sacrifice outlet — the final list chosen from measured sizes) becomes sparse `attrs.roles`. `tagger-overrides.json` gains a per-role kill-switch; the fallback rule of D3 applies. The evidence reads "Both: ramp · mana rock — community-tagged on Scryfall Tagger".

**The route (Y7a).** `POST /api/alternatives` (new; a snapshot like Autofill's, so drafts work): `{game, format, leaderIds, entryIds, cardId, goals?}`; facts via `loadEntryFacts`; candidates share at least one role with the card, pass `candidateConditions` (deck identity, legal, not in the deck, owned filter) with a tested `cost_value` range added to the scope whitelist (`src/lib/recommend/queries.ts` 50–56; `queries.test.ts` 51–88), then `applyGoals`. Ranked by shared roles, then the existing evidence (EDHREC rank, commander co-play, combos); returns CardWires, why-chips (shared roles, mana value, price delta, Game Changer status) and the outgoing card's tradeoff from `rankCuts`. `force-dynamic`, `no-store`, its own per-IP bucket. Wording never claims identical function.

**The surfaces.** Y7a: a collapsible "Alternatives" in the Card tab (the Printings precedent); picking one swaps through `applyListSwap` ("Swapped A → B · Undo"). Y7b: "Swap…" on deck rows; "Add" becomes "Swap in…" at 100/100 (the cut partner from `rankCuts` within the added card's curve bucket); the conflict callout's rows gain "Swap…", which lowers the bracket one card at a time.

### D9. Budget Twin (Y8)

The total budget joins goals. "Fit my budget" opens a sheet (the AutofillSheet shell): the priciest non-leader cards first, each with one to three alternatives from Y7a's route, a running "est. $X of your $150" (unpriced cards disclosed, owned copies counted at $0 when a collection exists), checkbox review, and one `applyListSwap` with Undo. When nothing fits: "No suitable alternative under your goals." The goals line shows the running total everywhere it appears.

### D10. The journal and its results (Y9a, Y9b, Y10)

**Adapter `journal` declarations.** Magic: pods of 2–8; a table level 1–5 with the noun "bracket"; seats 1 to pod size. One Piece: pods of 2; seat = went first or second; no table level.

**Schema (migration `0018`).** `deck_games(id bigint identity, deck_id uuid NOT NULL REFERENCES decks ON DELETE CASCADE, version int NULL, list_hash text NULL, played_on date NOT NULL, pod_size smallint NOT NULL, result text NOT NULL CHECK in ('win','loss','draw'), end_turn smallint NULL, table_level smallint NULL, seat smallint NULL, opponents jsonb NULL, notes text NULL, created_at timestamptz NOT NULL DEFAULT now())`, one index `(deck_id, played_on desc)`, about 210 bytes a row. `opponents` holds up to seven entries of one or two Scryfall oracle ids (partners), ~45 bytes each — external keys, so an identity rebuild can't strand them. `deck_versions` gains `list_hash text NULL` and `kind text NOT NULL DEFAULT 'saved'` (`saved` | `played`). Never stored: life totals, event timelines, player names, opponents' decklists, streaks, ratings, stored win counters.

**The list hash.** `playableListHash` (new, pure, isomorphic — no `node:crypto`): a canonical `[zone, cardId, qty]` payload, duplicates merged as `diff.ts` merges them, sorted; pinned "equal exactly when `isEmptyDiff` says no card changes" and "a printing or tag change keeps the hash". `insertVersion` stamps it; the first log on a deck hashes that deck's older versions in the same transaction.

**Played snapshots.** The 50 cap counts `saved` versions only; `played` snapshots have their own allowance (100 per deck, disclosed). At that allowance a game still logs — `version` NULL, `list_hash` kept — and the dialog says so. History groups played snapshots under their games; Restore works on any version; a played snapshot is removed only with its last game.

**Routes (Y9a).** `GET` / `POST /api/decks/[id]/games` and `PATCH` / `DELETE /api/decks/[id]/games/[gameId]`: session (401) → a per-user bucket (windows ≤ 1 day) → owner (403) → a guest deck answers 400 "Sign in to keep a game journal" (the `folderId` precedent) → zod → the adapter's `journal` checks; `force-dynamic` and `no-store`. POST is one transaction: lock the deck → hash the live list → reuse the newest version with that hash, or mint a `played` snapshot noted "Played {date}" → insert the game. The response says `{version, minted, capped}`.

**Logging.** Y9a: "Games…" in the editor's More menu (live decks only, so the draft More pin holds) opens the Games dialog with "Log a game" at the top; the editor flushes autosave first, so the snapshot equals the screen. Y9b: the owner's share-page row gains "Log a game" (phone first) and the `/account` tile ⋯ gains "Log a game…". Won / Lost / Draw logs at once with the pod size remembered per browser; optional details (date, turn it ended, table level, seat, opponents' commanders through X2's suggest box, notes) stay collapsed. The toast reads "Logged a win · Undo"; Undo deletes the game and the snapshot it minted if no other game uses it. A signed-out owner sees "Sign in to keep a game journal" with `?next=`.

**Lifecycle (Y9a).** `deck_games` cascades from `decks`, so the single delete, account deletion and the anon purge cover it with no new delete code. It joins `USER_TABLES` in `scripts/backup-user-tables.sh`, the privacy page's deletion sentence, the comments in `delete-account.ts` and `forks.ts` (forks copy no games), a "her games gone" check in `smoke:account`, a new `smoke:games`, and the restore drill's dangling-reference check (which also learns the identity ids inside `deck_versions.cards`).

**Results (Y10).** The Games dialog shows "N games · W–L–D", split by pod size with the baseline ("an even 4-player table wins 1 in 4"); per version with `diffSummary` ("v8, since v7: +2 −2 · 3 of 7"); a percentage only from 10 games; "Too few games to compare" below 5 per version; recent games, editable. History rows gain "Played 3 · 2–1", and Save version says "No card changes since vN" when the hash matches. The first logged game earns one restrained Warden line. Everything is owner-only.

### D11. The review's acceptance criteria and test cases, restated

| Criterion (in our words) | Proven in |
|---|---|
| A list with only a commander never looks fully assessed | Y3b fixture; Y4a draft line |
| Missing or unresolved data never yields a low bracket | Y3b (freshness → "Couldn't check"; unresolved import lines keep the read a draft) |
| A printing or foil change leaves the read alone | Y3b fixture (identities, not printings) |
| Combos involving the commander are judged with the commander available | Y3b (the two-card count excludes the commander; "uses your commander" is your call) |
| Every finding names its cards and its reason | Y4a factor rows |
| A read that may be out of date says so | Y4a ("Checking combos…", refreshed per settled edit) and Y5 (checked date); the browse-filter half waits with the public browse page (LATER) |
| A declared target never hides conflicting evidence | Y4b (the target and the read shown side by side; the conflict callout) |
| A rules change prompts a review | Y3a's ruleset watch; Y4b's "Rules changed since you answered" |

Test cases kept as Y3b fixtures, in our words: a one-card shell; a full 100-card list; the same list in premium printings; a fourth Game Changer; a tuned list with no Game Changers (reads "1–2", never claims Core by count alone, and offers "How it plays"); a commander plus a one-card loop; a loop that needs an unnamed extra permanent (template); a Rule Zero exhibition list (the exceptions line, legality unchanged); combo data unavailable; a new rules version; a One Piece deck (no bracket). Dropped as not applicable: two people logging the same game, and a stored history of changing estimates.

---

## E. Implementation roadmap

Session protocol is unchanged (CLAUDE.md): one package per session, deployed and `pnpm check`-green or not done, out-of-scope items to `LATER.md` with a trigger, every migration eyeballed, caching intent stated on every new route. Paths marked **(new)** are proposals; every other path was verified at `53942d6`. Line numbers drift — re-grep before editing, trust the shapes.

```text
After X5:  Y1 Honest labels ─► Y2a Honest first screen ─► Y2b Start doors
           ─► Y3a Bracket data ─► Y3b Bracket engine ─► Y4a Bracket line + Why ─► Y4b Your target ─► Y5 At the table
           ══ announce point ══
           ─► Y6a Goals in Suggestions ─► Y6b Goals in Autofill + Radar ─► Y7a Swap Lab ─► Y7b Swap in place ─► Y8 Budget Twin
           ─► Y9a Journal core ─► Y9b Log at the table ─► Y10 Results
LATER      matchups · playgroups · public records · guest journal · public deck browse + bracket filters · /precons filter ·
           live Spellbook cross-check · embeddings · curated swap notes · card-page Alternatives · PWA table mode · URL import
```

Each package depends on the one before it unless stated. A warm beta signal still outranks any package, and the owner may reorder within a theme.

| Package | Migration | Route table | Size |
|---|---|---|---|
| Y1, Y2a, Y3b, Y4b's UI, Y5, Y6a, Y6b, Y7b, Y8, Y9b, Y10 | — | unchanged | S–M / M |
| Y2b | — | + `ƒ /api/recommendations` | M |
| Y3a | `0016` (`combos`: tag + relevant) | unchanged | M |
| Y4a | — | + `ƒ /api/combos/complete` | M |
| Y4b | `0017` (`decks.goals`) | unchanged | M |
| Y7a | — | + `ƒ /api/alternatives` | M |
| Y9a | `0018` (`deck_games`; `deck_versions.list_hash`, `kind`) | + `ƒ /api/decks/[id]/games`, `ƒ /api/decks/[id]/games/[gameId]` | M |

### Y1 — Honest labels (S–M) → detailed in section G

### Y2a — Honest first screen (S–M)

- **Objective**: a new player's first screen tells the truth and points at the next step.
- **Prereqs**: Y1. No migration, no route.
- **Steps**: (1) `SaveIndicator`'s draft branch and `data-draft` (D2). (2) "Keep this deck" for seeded drafts. (3) The `/decks/new` Suspense fallback. (4) An optional progress flag on `ValidationIssue` (`src/lib/games/types.ts`), set by both adapters' `validate` for an empty leader zone and a deck under its minimum; `ValidationPanel` renders progress as one neutral line; one shared `progressLine` helper **(new)**; "· N to go" beside the ring. (5) The quiet first screen. (6) Undo for plain removals.
- **Acceptance**: a fresh Magic draft shows "Draft", "Choose a commander · 100 to go", no View / Group / Sort, no keyboard hint on a phone, one Add cards; a precon draft offers "Keep this deck" and one click creates exactly one deck; removing a card offers Undo; the approval line never shows on an empty deck; the cards PUT returns the same issues as before; One Piece behaves the same through its adapter.
- **Checks**: `pnpm check`; the pins in the matrix; dev pass at 390 / 768 / 1200 / 1440 in both themes.
- **Risks**: the fourteen `data-status` pins (`data-draft` keeps them green); a hidden pane stalls toasts (verify in jsdom).

### Y2b — Start doors (M)

- **Objective**: the fastest ways into a deck are on the first screen.
- **Prereqs**: Y2a. One new route.
- **Steps**: (1) Doors on the empty draft and per game on `/decks/new` (D2). (2) The `?import=1` one-shot latch. (3) `POST /api/recommendations` **(new)** and the panel's draft branch (fetching only while its tab is active). (4) The first-approval "Share this deck" link.
- **Acceptance**: Paste a list is two clicks from home; Suggestions answer a seeded draft with zero deck rows created; the zero-POST pins for combo and Surprise seeds hold; One Piece shows Browse leaders and Paste a list; the route table gains exactly that line.
- **Checks**: `pnpm check`; `smoke:recommend` gains a snapshot section (dev); RTL for the doors and the draft panel.
- **Risks**: the snapshot route as a cost vector (its bucket; facts read server-side).

### Y3a — Bracket data (M)

- **Objective**: Game Changers, land denial, extra turns and combo tags, stored lean from named sources, with honest freshness.
- **Prereqs**: X5's `0015` applied. One migration. Ask at the start for read-only database access (sizes and counts) and for the migration's yes.
- **Steps**: (0) One read of the `oracle_tags` bulk → tag UUIDs, the land-denial list with weights → `data/mtg/tagger-overrides.json` **(new)**. (1) `scryfall-map.ts`: `game_changer`, presence asserted, stats. (2) The Tagger stream, roll-up, fallback and stats in `scripts/ingest/scryfall.ts`. (3) `spellbook-map.ts` + `scripts/ingest/spellbook.ts`: tag + relevant, the stage table, the INSERT, the tuple, the documented URL, stats. (4) `schema.ts` → **eyeball `drizzle/0016_*.sql`** (two `ADD COLUMN`s on `combos`, nothing else) → the owner's yes → `pnpm db:migrate` → confirm the columns. (5) The ruleset-watch step, last in `.github/workflows/nightly-ingest.yml`. (6) Push, deploy, then one `workflow_dispatch`.
- **Acceptance**: after the dispatch — 53 identities carry `game_changer`; the land-denial and extra-turn counts match the measured list minus the overrides; kept combos carry tags (unknown letters counted); stats carry freshness; `pnpm db:size` before, after, and after the next scheduled nightly (new data ≤ ~6 MB; the one-time combos rewrite disclosed); the Radar, Suggestions, Autofill and the hub totals unchanged; the watch step green.
- **Checks**: `pnpm check`; `smoke:combos`, `smoke:recommend`, `smoke:autofill`, `smoke:hubs` on dev.
- **Risks**: the one-time rewrite; a Tagger outage on the first run (the flags stay absent and the read says "Couldn't check"); the dispatch's full precon sweep (accepted).

### Y3b — Bracket engine (M)

- **Objective**: a pure, attributed, versioned read of any Magic deck, proven on fixtures and the 181 precons.
- **Prereqs**: Y3a's data live. Read-only database access for the calibration.
- **Steps**: (1) The adapter's optional `brackets` declaration and its types. (2) `src/lib/games/mtg/brackets.ts` **(new)** with Spellbook's MIT notice. (3) `loadCompleteCombos` and the freshness loader in core. (4) D11's fixtures. (5) The calibration script (`scripts/.tmp/`, one read-only transaction) → the ship note.
- **Acceptance**: D4's table row by row in Vitest; D11's fixtures; One Piece declares nothing; `loadCompleteCombos` is one statement with its plan and warm time recorded; the precon spread recorded.
- **Checks**: `pnpm check`.
- **Risks**: Spellbook's tag or feature names drifting (tags read as stored; results matched with Spellbook's own patterns).

### Y4a — Bracket line + Why sheet (M)

- **Objective**: every Magic deck in the editor shows its read and why.
- **Prereqs**: Y3b. One new route.
- **Steps**: (1) `GET /api/combos/complete` **(new)** with its caching intent and bucket. (2) `BracketLine` **(new)** after `ValidationPanel` in `DeckListPane`. (3) `EditorDialog` `"bracket"` and the sheet's first two blocks; "your call" items as open questions. (4) The copy guard.
- **Acceptance**: D5's line table pinned; a combo-seeded draft shows its combo; the zero-POST pins hold; "Why?" opens from the keyboard and returns focus; One Piece renders nothing; 44 px on touch; the facts route answers MISS then HIT for the same id set on prod.
- **Checks**: `pnpm check`; RTL for the line's states and the sheet; dev pass in both themes; the route table gains exactly that line.
- **Risks**: request volume (one call per settled snapshot; the bucket); hidden-pane quirks (verify through the DOM).

### Y4b — Your target (M)

- **Objective**: the player says what they're aiming for, and the read answers honestly.
- **Prereqs**: Y4a. One migration.
- **Steps**: (1) `schema.ts` → **eyeball `drizzle/0017_*.sql`** (one `ADD COLUMN "goals" jsonb` on `decks`) → the owner's yes → migrate → confirm. (2) The goals PATCH with its own baseline (no `updated_at` bump), the POST create, the adapter-ranged zod, `deckMetaJson`'s public subset. (3) The sheet's "How it plays", "Your target", the exceptions line, the conflict callout. (4) "Rules changed since you answered".
- **Acceptance**: the target and answers survive a reload for account and guest decks; a goals save leaves the home rail and `/account` order alone; a target set in a draft creates exactly one deck; a visitor's deck GET carries the target, the exceptions and the answers that changed the read but never the budget; One Piece answers 400 to a target.
- **Checks**: `pnpm check`; `smoke:decks` on dev; the owner's clicks (signed in).
- **Risks**: the meta autosave coupling (a separate baseline); answers being public (the sheet says "Shown on your share page").

### Y5 — At the table (M)

- **Objective**: the share page tells a pod what to expect, and the owner can paste it anywhere.
- **Prereqs**: Y4b.
- **Steps**: (1) The facts in the share page's query batch; the private gate's client fetch; the "played as" line. (2) The "At the table" card and "Copy for the table" (D6's text pinned). (3) The owner row, the Copy menu, `useCopyToClipboard` (adopted by the Share and Export dialogs), `navigator.share`. (4) The OG stat and the `DeckTile` chip, declared only.
- **Acceptance**: the copy text pinned; the visitor row byte-identical; the owner row only for the owner; the OG image renders with and without a target; the share page's `DB_LOG` count recorded before and after; One Piece unchanged.
- **Checks**: `pnpm check`; `smoke:seo` on dev; dev pass; the owner's clicks.
- **Risks**: the share page's added statement; disputes over a public read (the owner's target leads, the read is worded "the cards say").

### Y6a — Goals in Suggestions (M)

- **Objective**: Suggestions respect the deck's target and budget by default and say what they hid.
- **Prereqs**: Y4b.
- **Steps**: (1) RTL tests for `RecommendationsPanel` (none exist). (2) The adapter's flag paths and the projections; the combo types. (3) `applyGoals` **(new)** and the rank → goals → slice order. (4) The panel: the hidden count, the flags, the goals line, the saved budget, the Undo toasts; the draft route carries goals.
- **Acceptance**: a Vitest fixture at budget All and target 2 — every Game Changer, land-denial card, second extra-turn card and above-target combo completion hidden and counted; with no target, impact flags only; `smoke:recommend`'s evidence contract green.
- **Checks**: `pnpm check`; `smoke:recommend`, `smoke:combos` on dev; the owner's click on "Save as this deck's budget".
- **Risks**: competitive staples that aren't Game Changers (labeled "competitive" since Y1; reweighting is a LATER row); honesty when the combo scan is truncated (disclosed).

### Y6b — Goals in Autofill + Radar (M)

- **Objective**: a starter shell built for a target stays inside it; combos show their weight.
- **Prereqs**: Y6a.
- **Steps**: (1) The autofill zod body, the caps, the skips, the lock-tier rule, the notes. (2) The Radar's badges.
- **Acceptance**: with goals absent, fixed-seed shells are byte-identical; a target-2 shell reads "Bracket 1–2"; Radar membership unchanged; badges credited.
- **Checks**: `pnpm check`; `smoke:autofill`, `smoke:combos` on dev.
- **Risks**: determinism — goals filter before sampling, never through `Math.random`.

### Y7a — Swap Lab (M)

- **Objective**: any card can be swapped for one that does the same job, inside the deck's goals.
- **Prereqs**: Y6a. One new route.
- **Steps**: (1) The role whitelist from measured sizes, `attrs.roles`, the kill-switch (a nightly lands it). (2) `POST /api/alternatives` **(new)** and the scope whitelist's `cost_value` range. (3) The Card tab's "Alternatives" and the swap.
- **Acceptance**: Sol Ring in a mono-white deck offers mana rocks, not lifegain; Swords to Plowshares offers creature removal; a swap in a draft creates exactly one deck; One Piece shows nothing; a gold set of about 20 staple swaps and its hit rate recorded in the ship note.
- **Checks**: `pnpm check`; the scope-whitelist tests.
- **Risks**: Tagger noise (the kill-switch); thin lists for rare roles ("No cards tagged like this one fit your goals").

### Y7b — Swap in place (S–M)

- **Objective**: a swap never passes through 99/100.
- **Prereqs**: Y7a.
- **Steps**: "Swap…" on deck rows; "Swap in…" at 100/100; "Swap…" on the conflict callout's rows.
- **Acceptance**: the deck stays at 100; one Undo restores both cards; the `applyListSwap` pins stay green.
- **Checks**: `pnpm check`.

### Y8 — Budget Twin (M)

- **Objective**: fit a deck under a total budget through reviewed swaps.
- **Prereqs**: Y7a.
- **Steps**: the total budget in goals; the "Fit my budget" sheet; the running total; one apply.
- **Acceptance**: a $300 fixture deck at a $150 total gets a reviewed list that lands at or under $150 or says how close it gets; unpriced cards disclosed; "No suitable alternative under your goals" when none.
- **Checks**: `pnpm check`; RTL for the sheet.

### Y9a — Journal core (M)

- **Objective**: a logged game always knows the exact list it was played with.
- **Prereqs**: Y8 (the owner's order). One migration, two routes.
- **Steps**: (1) `playableListHash` **(new)** and its pins. (2) `schema.ts` → **eyeball `drizzle/0018_*.sql`** (`deck_games` with its index; `deck_versions.list_hash` and `kind`) → the owner's yes → migrate → confirm. (3) `insertVersion` stamps the hash; the cap counts `saved` only. (4) The routes. (5) The Games dialog from More (live decks; flush first); Undo. (6) The lifecycle wiring, `smoke:games` **(new)**, the restore drill.
- **Acceptance**: two logs on an unchanged list → one played snapshot; a changed list → a new one; Save version and Restore never blocked by played snapshots; at the played allowance the game logs with no version and says so; deleting the deck or the account removes its games; a guest gets the sign-in sentence; One Piece logs 1v1 with went-first or went-second; the route table gains exactly the two lines.
- **Checks**: `pnpm check`; `smoke:games`, `smoke:account`, `smoke:versions` on dev; `pnpm db:size` before and after; the owner's clicks.
- **Risks**: Neon growth from played snapshots (bounded per deck; the nightly gauge); a restored older list (hashed lazily on the first log).

### Y9b — Log at the table (S–M)

- **Objective**: logging a game from a phone takes three taps.
- **Prereqs**: Y9a.
- **Steps**: the share page's owner row "Log a game"; the `/account` ⋯ item; the quick log; opponents through X2's box; the toast with Undo; the guest prompt.
- **Acceptance**: three taps on a phone; the visitor row untouched; the owner's clicks.
- **Checks**: `pnpm check`.

### Y10 — Results (S–M)

- **Objective**: the record tells the truth about small numbers.
- **Prereqs**: Y9a.
- **Steps**: RTL tests for `HistoryDialog` (none exist); the Games dialog's numbers; History's rows; "No card changes since vN"; the first-game Warden line.
- **Acceptance**: fixture numbers pinned (W–L–D, pod splits, the baseline line, version rows, a percentage only from 10 games, "Too few games to compare" below 5); nothing public.
- **Checks**: `pnpm check`; `smoke:versions` on dev.

### Appendix to E

**Test and smoke pin matrix** (verified at `53942d6`; re-grep the lines)

| Package | Must update | Must stay green |
|---|---|---|
| Y1 | `analyze.test.ts` 78–101; `scripts/combos-smoke.ts` 117, 154; `card-search.test.tsx` 270, 277, 345, 361; `recommend.test.ts` 101, 140, 189, 197, 208; `autofill-sheet.test.tsx` 66, 104, 230, 232, 324; `deck-editor.test.tsx` 952; `combo-radar-panel.test.tsx` 125; `account-deck-tile.test.tsx` 98, 122; a new ShareDialog RTL | `deck-share-view.test.tsx` 111–119 (the visitor row); `recommend-smoke.ts` 378, 387; `hubs-smoke.ts` 414–454 (the Meta Lens); `warden-copy.test.ts` |
| Y2a | `editor-header.test.tsx` 85–109 (slot states + draft); `validation-panel.test.tsx` 42–46, 99 | `deck-editor.test.tsx` `data-status` pins (200, 236, 241, 259, 316, 750, 787, 947, 1017, 1227, 1264, 1270, 1320, 1353) and the create-count tests (191–292) |
| Y2b | the chooser's and the draft panel's RTL | `deck-editor.test.tsx` 1003–1017 and 1301–1320 (zero POSTs for combo and Surprise seeds); `seo-smoke.ts` home links |
| Y3a | `spellbook-map.test.ts` 50–64 (the full `ComboRow`); `scryfall-map` attrs tests | `spellbook-map.test.ts` 140–147 (the never-played skip — the floor stays); `smoke:combos`, `smoke:recommend`, `smoke:autofill`, `smoke:hubs` |
| Y3b | new `brackets.test.ts` | all |
| Y4a | the line and sheet RTL; `deck-list-pane` tests | `deck-editor.test.tsx` zero-POST pins; `editor-header.test.tsx` 120–151 (More unchanged) |
| Y4b | `serialize.test.ts` 5–26 (the `DeckRow` fixture); new deck-route tests; the create-count tests for a draft target | `smoke:decks` |
| Y5 | `deck-share-view.test.tsx` 106–119 (the live-region note), 200–236, 340–345; `buy-deck-menu.tsx` 76's toast wording | the visitor row 111–119 byte-identical; `seo-smoke` share-page checks |
| Y6a | new `RecommendationsPanel` RTL; `applyGoals` tests | `rank.test.ts`, `cuts.test.ts`, `smoke:recommend` |
| Y6b | new autofill goal cases and notes | `autofill.test.ts` fixed-seed sequences with goals absent; `smoke:autofill`; `combo-radar-panel.test.tsx` membership |
| Y7a | `queries.test.ts` 51–88 (the scope whitelist) | `candidateConditions` tests |
| Y7b | deck-row actions; "Swap in…" | `deck-editor.test.tsx` `applyListSwap` pins (973, 1210) |
| Y8 | new Budget Twin RTL | — |
| Y9a | `versions.test.ts` (hash stamping, `kind`); `account-delete-smoke.ts` (games gone); `editor-header.test.tsx` live-deck More list (`toContain`) | the draft More list (exact); `versions-forks-smoke.ts` |
| Y9b | `account-deck-tile.test.tsx` 97–104 (the ⋯ list); the owner-row tests | the visitor row |
| Y10 | new `HistoryDialog` RTL | `versions-forks-smoke.ts` |

**Rollback**: Y1, Y2a, Y2b, Y3b, Y4a, Y5, Y6a, Y6b, Y7b, Y8, Y9b and Y10 add code and routes only → `git revert`. Y3a's migration is additive → revert the code and drop the two columns; the Game Changer and Tagger keys leave `attrs` on the next nightly through the tuple compare. Y4b → revert and drop `decks.goals` (stored goals are lost). Y7a's roles leave `attrs` the same way as Y3a's flags; a single Tagger tag switches off in the override file without touching code. Y9a → revert and drop `deck_games`, `list_hash` and `kind` (logged games are lost — the owner's call). The popularity floor never changes.

---

## F. Deferred work and unresolved decisions

**Deferred (each becomes a `LATER.md` row with its trigger in Y1's step 0)**

| Item | Why deferred | Revisit when |
|---|---|---|
| **Matchup statistics** — *flagged: part of the owner's message ("a later addition")* | One user can't produce matchup volume; the data (opponents' commanders) is collected from Y9b on | At least 3 accounts with 20+ logged games carrying opponents, or a user asks |
| Playgroups and shared games | A social system with invites and permissions | Several accounts log games together |
| A public record on share pages (opt-in) | Results are owner-only, like version history | An owner asks to show their record |
| A guest journal | Rows per person need a person; the anon purge keys on `updated_at`, which games don't bump | A guest asks, or the claim nudge shows guests playing |
| An `/account` Games section across decks | The per-deck Games dialog covers one user with few decks | An owner logs games for 3+ decks |
| A public deck browse page with bracket filters; a stored read on tiles and hub shelves | Cold start: public decks come from one user; reads are computed live | Public decks from several users exist |
| A `/precons` bracket read and filter | Unmeasured; the batched query would run at every build and daily revalidate | Y3b's spread has 2+ well-filled buckets and the batched query is measured |
| A live Spellbook estimate cross-check | A third-party dependency on a request path | Users report disagreements with Spellbook |
| Tutors and fast mana as context lines | Wizards removed tutor limits; adding them back as "context" invites confusion | Users ask |
| Keeping never-played combos (row 48) | Would leak "In 0 decks" rows into four surfaces | A user reports a missed combo that Spellbook lists with no plays |
| Text embeddings for Swap Lab (K ≤ 20, int keys) | The no-inference rule; the Neon budget | Tagger roles fail Y7a's gold set |
| Curated replacement notes and a suggestion form | Needs moderation | There is a community to moderate |
| A card-page "Alternatives" section (MTG Replace's SEO play) | Card pages have no deck context; ISR pages read no request data | Swap Lab sees use, or Search Console shows "alternatives" demand |
| Tournament reweighting at low targets | Labeling first; weights are pinned to sum to 1 | A low-target player reports cEDH-ish suggestions with a real example |
| A precon "changed from stock" tracker | Precon drafts carry no lineage today | A precon-started deck logs games, or the owner asks |
| PWA offline table mode (row 15 — its "after M3" trigger fired; re-deferred) | A service worker and an offline queue are an L-sized package | Games are logged from phones at stores |
| Moxfield and Archidekt URL import | Their terms first; text import covers the need | Users ask twice |
| Renaming "Fork" | Churn; the word is established and smoke-pinned | A user is confused by it |

**Rows this wave rewrites rather than adds**: 15 (PWA — the sharper trigger above), 31 (fires in Y1; corrects "treasure-makers not counted"), 33 (Topdeck evidence says "competitive" from Y1), 46 (history stays owner-only, played snapshots included), 48 (the floor stays — now also for the bracket read), 60 (its cheap half fires in Y2a), 64 (the journal's sign-in prompt is one more quiet line), 83 (Budget Twin covers deck totals; Autofill's total budget stays deferred).

**Unresolved decisions (defaults chosen; tell me if you disagree)**

| Decision | Default in this plan | What would change it |
|---|---|---|
| Two-card combos | Wizards' text wins: a relevant two-card combo reads at least Bracket 3 whatever Spellbook's tag | If you'd rather follow Spellbook's leniency, the sheet shows both readings |
| 2+ extra-turn cards; edge land denial | "Your call" with a question; clear land denial stays at least 4 | If you'd rather follow Spellbook's automatic 4+ |
| Cards over the target in Suggestions | Hidden, with "N hidden by your goals · Show" | If you'd rather see them flagged in amber |
| Autofill at targets ≤ 3 | The measured-staple lock tier is off; weights unchanged | If tournament staples should still lock |
| A target or an answer set in a draft | Creates the deck — a real choice, like naming it | If goals should wait for the first card |
| Answers on the share page | The answers that changed the read are public (they explain it) | If answers should stay private and the public line say "from the cards only" |
| The played-snapshot allowance | 100 per deck, disclosed | If you want a different number |
| Percentages in results | Only from 10 games; "Too few games to compare" below 5 per version | If you want them sooner or later |
| The Meta Lens wording | "Most played with" stays (tournament lists) | If you want "competitive" there too |
| "Fork" | Keeps its name | If players find it unclear |

---

## G. First implementation package — Y1 "Honest labels"

**Why first**: it is the smallest package with the widest reach, and the two issues the research found on prod are in it. Every visitor sees the home shelf, every budget brewer sees the budget controls, and the site is about to be announced. It needs no migration, adds no route, and lands the Wave-4 contract.

**Expected visible result**: the home page and `/commanders` say what their ranking is (decklists, not games); hubs, card pages, the Combo Radar, the Autofill sheet and the `/cards` set strip say "popular" where they meant decklist counts; tournament evidence says "competitive"; a mono-white deck's Mana sources list only White and Colorless, with a one-line note on how sources are counted; every budget control reads "≤ $5 a card" and filters the same way; the owner sees "Open in editor" on their own share page; the Share dialog's visibility lines are true.

**Scope (in order)**

0. **Contract**: build plan §6e (the Y-series table, mirroring §6d, one row per package with "Deliverable" and "Done when"); one CLAUDE.md line under Session protocol — "Wave-4 packages (Yn from `WAVE4.md`, build plan §6e) count as work packages under the same rules"; a REDESIGN.md Wave-4 addendum recording what Y1 supersedes (W-era evidence wording, the hub staples' strict `<`) and that Y2a will change R3's save-slot states; section F as `LATER.md` rows (appended at the end so cited numbers stay put) plus the eight rewritten rows. `*.md` is in `.prettierignore`. Commit step 0 on its own.
1. **The phrase inventory** (D1): grep, rewrite or exempt every hit, update the pins in the same commit.
2. **Mana sources** (D1): the clamp, the table hint, the tests, LATER row 31.
3. **One budget vocabulary** (D1).
4. **Owners on their share page** and **one name for the editor** (D1).
5. **The Share dialog** (D1), after its first RTL test.

**Out of scope**: anything bracket-shaped (Y3a onward); the draft slot and progress line (Y2a); doors (Y2b); the share page's owner row and Copy menu (Y5); the Meta Lens wording; renaming "Fork".

**Completion checklist**

- [ ] Step 0 committed on its own.
- [ ] `pnpm check` green — the matrix's Y1 pins updated, the "must stay green" list untouched.
- [ ] The phrase grep returns only the exempt list and code comments that describe the new copy.
- [ ] Dev pass, signed out, both themes, 390 and 1440: home's shelf, `/commanders`, one hub, one card page, `/cards?set=blb`, a share page's Mana sources (a mono-white deck shows White and Colorless only), the editor's Suggestions and Autofill budget controls.
- [ ] `smoke:combos`, `smoke:hubs`, `smoke:recommend` green on dev (read the deck-create counters first).
- [ ] `pnpm build`: the route table unchanged; ISR routes still `●`.
- [ ] Deployed; Vercel status success on the full sha. Prod pass, signed out, zero creates: home's shelf copy in the server HTML; `/d/k88m2jdjtykk`'s Mana sources rows; one hub's combo total sentence.
- [ ] One click handed to the owner, signed in on prod: open one of your decks' share page — "Open in editor" is there.
- [ ] Ship note, `LATER.md` rows, tracker tick, memory, and `Y2a-session-prompt.md` written.

---

## Verification (whole wave)

- Every package: `pnpm check`; the matrix's pins; the listed smokes on **dev** only (never `smoke:seo` against prod — it mints fixtures; read the deck-create counters before any smoke; `pnpm counters:reset` clears local loopback counters; never retry into a 429); the `pnpm build` route-table delta as in E (ISR routes stay `●`, `/sets` and `/precons` stay `○`); a dev pass at 390 / 768 / 1200 / 1440 in both themes with reduced motion toggled; deploy; confirm through the GitHub commit status (context "Vercel", the full sha).
- **Migrate before push** (Y3a, Y4b, Y9a): generate → eyeball the SQL → the owner's yes → `pnpm db:migrate` → confirm the column exists → only then the dev pass, the push and any `workflow_dispatch`. Dev shares prod's database. `pnpm db:size` before and after.
- Database reads need the owner's OK, asked once at the start of a session, inside one `read only` transaction. A deck made on dev is a real row: delete QA decks and re-prove the census.
- Query packages (Y3b, Y4a, Y5, Y6a, Y7a, Y9a): the plan, the warm time and the `DB_LOG` statement count recorded.
- Browser-pane caveats: a hidden pane pauses rAF, never fires `matchMedia` change events, stalls Base UI transitions and doesn't hydrate a tab until painted — verify menus, sheets and toasts through the DOM or in jsdom. The pane is signed out everywhere: signed-in flows are RTL plus a short list of the owner's clicks.
- Traceability: ask 1 → Y3a, Y3b, Y4a, Y4b, Y5 · ask 2 → Y6a, Y6b, Y7a, Y7b, Y8 · ask 3 → Y9a, Y9b, Y10 · ask 4 → LATER (data from Y9b) · ask 5 → Y1, Y2a, Y2b and the RECs.

---

## Progress tracker

Tick a package with its date and sha when it ships; record deviations from this contract beside the tick, not by rewriting the sections above.

- [x] Owner's answers recorded (three rounds, 2026-09-30); contract landed in the repo with `Y1-session-prompt.md` and the MTG Replace teardown (2026-09-30).
- [x] Y1 — Honest labels (decklist wording, "competitive" evidence, the mana-sources clamp, one budget vocabulary, the owner's "Open in editor", the Share dialog) (2026-10-01: step 0 `0e55ec2` — build plan §6e, the CLAUDE.md line, REDESIGN's Wave-4 addendum, LATER rows 145–160 + the eight rewrites; feat `dcfcdcf`, Vercel status success on the full sha at 08:51 Z. No migration, no route, no dependency; the route table byte-identical (built on `4a7ce75` and on the feature); census unchanged at 27 user decks / 181 precons / 1 user; `pnpm db:size` 271.1 MB before and after. `pnpm check` 1,238 → **1,251 tests** (144 → 147 files; the same 6 warnings, 0 errors) — the prompt's 1,177 baseline predates X5 and P4.9. `smoke:combos`, `smoke:hubs`, `smoke:recommend` green on dev. Prod, signed out, zero creates: home's "Popular in Commander decklists" and its sentence in the server HTML, `/commanders`' sentence, Kinnan's hub "The 10 most popular of 119 combos (by EDHREC decklist count)", `/cards?set=blb` "Most popular in Bloomburrow", `/d/k88m2jdjtykk` White 34/2 · Colorless 3/2 with the hint. **D1 shipped as drawn; decisions and deviations:** (1) "competitive" in all four Topdeck `why` lines, cut side included — the scope sentence untouched, both smoke regexes checked before the edit; (2) the clamp masks every produced bit, so an off-identity card (already a color-identity error) counts only its on-identity colors; the no-commander case keeps today's counting (pinned); (3) the budget list lives in `src/lib/recommend/budget.ts` with one inclusive `withinBudget` (unpriced never passes a tier); the hub's count line reads "N of 100 at $5 or less · M at $1 or less" and its empty tier "None of these staples fit that budget right now."; (4) the owner check is `isDeckOwner(deck, null, sessionUserId)` (access.ts), so a guest deck is never an owner without its token, and the private gate inherits `isOwner` from the deck GET; (5) the Share dialog splits Private by whether this browser holds the claim token (account decks never do); Copy link keeps its name and confirms "✓ Link copied" in a status slot for 1.8 s, or "Couldn't copy — select the link and copy it."; (6) the phrase grep leaves the Meta Lens (exempt), `card-search.tsx`'s `most-played-heading` id and `data-slot="most-played"` (identifiers, not copy) and internal-order comments; smoke check labels were reworded. The owner's click (signed in, prod): open one of your decks' share page — "Open in editor" is in the action row.)
- [x] Y2a — Honest first screen (the draft slot, "Keep this deck", progress not problems, a quiet first screen, Undo for removals) (2026-10-01: feat `4fd9b10`, Vercel status success on the full sha at 14:14 Z. No migration, route or dependency; the route table identical (built on `d40d70d` and on the feature — `/decks/new` stays `○`); census unchanged at 27 user decks / 181 precons / 1 user (one dev "Keep this deck" click: 208 → 209 → 208 after its delete); `pnpm db:size` 271.1 MB before and after. `pnpm check` 1,251 → **1,276 tests** (147 → 149 files; the same 6 warnings, 0 errors); all 19 `data-status` pins and the create-count tests untouched and green. The cards PUT's `validation` byte-identical for empty / short / no-commander decks in both games (snapshotted before, diffed after). Prod, signed out, zero creates: `/decks/new?game=mtg`'s server HTML is the new fallback, then "Draft · Choose a commander · 100 to go · 0 / 100 · 100 to go". **D2 shipped as drawn; decisions and deviations:** (1) the flag is `progress?: true`, client-side only — the PUT strips it (`toWireIssues`); (2) `src/lib/decks/progress.ts` owns the words, the panel takes an optional `progress` line, and **the share page keeps listing under-minimum issues as problems** (LATER row 162); (3) "· N to go" replaces "cards" under the minimum, from the counted-up number; (4) `data-draft` marks every render without a server row, "Draft" shows only at rest; (5) "Keep this deck" sits where Share will be, `markDirty` + `flush`, for any `draftSeed` once settled with cards; (6) **the empty leader zone's "or press Ctrl+Enter" hint also became a fine-pointer line** (found on the dev pass — the contract named only the search pane's hint line; `EmptyState.hint` widened to a node); ⌘ via `useIsMac` (`useSyncExternalStore`, server false); (7) Undo restores the whole entry at its old position through `restoreEntry`, and refuses when the zone filled meanwhile; (8) **found, not fixed**: the editor's keepalive flush runs on every render on a saved deck (a new `isDirty` each render) — every edit PUTs at once and a failed keepalive PUT is silent (LATER row 161, offered as its own task). Reduced motion could not be toggled in the pane — the fallback's pulse and the slot's fade are `motion-safe:` classes, pinned by the existing motion policy.)
- [x] Y2b — Start doors (Pick a commander · Paste a list · Start from a precon · Surprise me; Suggestions in drafts; first-approval Share) (2026-10-01: feat `bb4b1e2`, Vercel status success on the full sha at 15:26 Z. No migration, no dependency; the route table gains exactly `ƒ /api/recommendations` (built on `0d6c722` and on the feature — `/decks/new`, `/precons`, `/sets` stay `○`); census unchanged at 28 user decks / 181 precons / 1 user (the +1 since Y2a is the owner's own account deck of 14:23 Z; the dev pass's one Keep this deck deck — POST 201 — was deleted with its token, 204 then 404, and the smoke deleted its two; 209 deck rows before and after); `pnpm db:size` 271.2 MB before and after. `pnpm check` 1,282 → **1,339 tests** (150 → 156 files; the same 6 warnings, 0 errors). CI green. `smoke:recommend` green on dev with its new snapshot section (creates nothing; the snapshot answers exactly what the deck GET answered). Prod, signed out, zero creates: the doors on `/decks/new` and the empty Magic draft, Paste a list → the Import dialog, `POST /api/recommendations` 200 in 0.73 s with 25 rows (Rings of Brighthearth among them) and 400 for One Piece, a door-rolled draft's Suggestions tab answering from it. **D2 shipped as drawn except one deviation; decisions:** (1) one door list off the adapter (`src/lib/decks/start-doors.ts`), Start from a precon from a new optional `display.preconBrowse`; (2) the picker's cards grow the doors and W9c's "Surprise me — random commander" becomes the shared "Surprise me"; the cards dropped `flex-1`; (3) the empty draft leaves Pick out (the leader zone's Browse link is that door), shows precon / Surprise only while the leader zone is empty and no door while a URL seed lands; Paste a list for any empty deck; (4) Surprise me rolls in place through the shared `rollLeader`, and Keep this deck now shows for any draft holding cards it never edited; (5) **deviation: the snapshot body carries copies** — `entries: [{cardId, qty}]` instead of `entryIds` — because the curve evidence counts copies; no `owned` in drafts (LATER row 165); bucket 30/min + 200/hour; 9 statements per call; (6) the draft panel keys like the GET and never refetches when the row mints; (7) first approval: `useFirstApproval` + `deckwarden:share-offered` (deck ids, cap 100), a draft's approval waits for its row, the link sits under the Warden line through `ValidationPanel`'s `approvalAction`. New LATER rows 164 (a draft's undone seed mints an empty row), 165 ("Only cards I own" in a draft), 166 (home's import sentence as a door); row 103 annotated. Reduced motion could not be toggled in the pane, as in Y2a.)
- [ ] Y3a — Bracket data (`0016`; Game Changers, Tagger flags with overrides and fallback, combo tags + relevant, the ruleset watch)
- [ ] Y3b — Bracket engine (the ruleset, `assessBracket`, `loadCompleteCombos`, fixtures, the precon spread)
- [ ] Y4a — Bracket line + Why sheet (`/api/combos/complete`, `BracketLine`, what the cards show, what the read assumes)
- [ ] Y4b — Your target (`0017` `decks.goals`, How it plays, the conflict callout)
- [ ] Y5 — At the table (the share page's line, "At the table", Copy for the table, the owner row, OG + tile chips)
- [ ] Y6a — Goals in Suggestions (`applyGoals`, hidden counts, impact flags, the saved budget)
- [ ] Y6b — Goals in Autofill + Radar (caps, skips, badges)
- [ ] Y7a — Swap Lab (Tagger roles, `/api/alternatives`, the Card tab's Alternatives)
- [ ] Y7b — Swap in place ("Swap…", "Swap in…", the callout's swaps)
- [ ] Y8 — Budget Twin (the total budget, "Fit my budget")
- [ ] Y9a — Journal core (`0018`; the list hash, played snapshots, the games routes, the Games dialog)
- [ ] Y9b — Log at the table (the share page and `/account` doors, the quick log, opponents)
- [ ] Y10 — Results (the record, per version, History rows)
