# BRACKET-SPEED session prompt — three speed facts in the bracket sheet, and the cEDH question when they look tuned

*Status: not run yet.* Written 2026-10-21 at GATE 2 of the DECKCHECK study (`DECKCHECK-STUDY.md` §2.2 and §2.3 are the evidence; the calibration's tables are in `.claude/deckcheck-study-evidence/calibration/RESULTS.md`, local and gitignored). Anchors verified against `25a75c9`; re-grep lines, trust the shapes. Add a dated ship note at the top of this file when the package ships.

**What it is.** Deckwarden's bracket read is a card-rules read (Game Changers, mass land denial, extra turns, two-card combos) and by design ignores tutors and fast mana, because Wizards dropped tutor limits in October 2025. The calibration showed the cost: tuned lists with few Game Changers under-read (a first-place Thrasios and Rograkh list at 3 with 14 fast-mana cards and 9 tutors), and no list in any population had the "suggested" bracket, because nobody had answered the questions. This package shows **three speed facts** (fast mana, tutors, the curve with the land count) beside the read, and **asks the existing cEDH question** when they look tuned. **The read itself does not change**: no new rule, no score, no number that pretends to be a bracket.

**Size M.** No migration, no route, no dependency, no URL, no nav label. Touches `src/lib/games/mtg/` (a new pure module), `src/lib/games/types.ts` (one optional adapter member), the bracket sheet and "At the table", and their tests.

Pre-flight, in order.
1. **Main is green.** `pnpm check` = 2,734 tests / 264 files / the same 6 `no-unused-vars` warnings at `25a75c9`.
2. **Nightlies green**; **a warm beta signal outranks a package**; **working tree clean** (stage explicit paths; re-read `LATER.md` and `MEMORY.md` before editing them).
3. **Database reads go to the Neon `dev` branch** (`.env.local`; production reads need the owner's OK in the chat). Scratch scripts in `scripts/.tmp/` import `../smoke/guard` first and call `guardDatabaseUrl()` on the line after `loadEnv`.
4. **Baseline**: `pnpm build`'s route table (74 app-path entries at `1e1576b`; the diff at the end must be empty); the share page's statement count with `DB_LOG` on dev (a public account Magic deck: 8; a precon: 6, `src/app/(site)/d/[publicId]/page.tsx:13-23`); the bracket sheet and "At the table" on dev for one precon, one Game-Changer precon and one cEDH-shaped list (before captures).

## What this package is NOT (scope fence)

- NOT a change to the read. `assessBracket` (`src/lib/games/mtg/brackets.ts:583`) and its output stay byte-identical for every input; `MTG_BRACKET_FLAG_PATHS` (`brackets.ts:842`, `[["game_changer"],["mld"],["extra_turn"]]`) stays as it is (`bracket-impact.test.ts:396-424` asserts the read is identical over flags alone, and the recommend, autofill and alternatives routes load only those flags through `flagsColumn`, `src/lib/recommend/queries.ts:178`). The assumption line "Tutors and fast mana don't change the read" (`assumptionsFor`, `brackets.ts:335`, pinned at `brackets.test.ts:1054`) stays true and the new copy must agree with it.
- NOT a score, a tier or a combined number. Three counts and one average, each checkable by anyone holding the list.
- NOT the unfurl or the tiles. The owner decided on 2026-09-30 that tiles and link unfurls show the declared bracket only (`WAVE4.md:35`; `src/lib/og/labels.test.ts:55-71` enforces it for the unfurl). The facts appear where the read appears: the bracket sheet and "At the table".
- NOT `/precons` tiles: `loadPreconBracketFacts` (`src/lib/decks/precons.ts:258`) selects only the flags as attrs, so precon tiles have no roles; every precon reads slow anyway (fast mana median 2, 0 of 182 past the cut).
- NOT One Piece (no brackets).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit

**The calibration's numbers** (2026-10-21, the Neon `dev` branch, 182 precons and 11,556 lists from cEDH-named Topdeck events through 2026-09-01; AUC = how often a cEDH list sits past a precon):

| Fact | Precons median | cEDH median | AUC | Cut | Precons past the cut | cEDH lists past it |
|---|---|---|---|---|---|---|
| Fast mana | 2 | 12 | 0.997 | 6 or more | 0 of 182 | 98 % |
| Tutors | 0 | 10 | 0.992 | 4 or more | 3 | 93 % |
| Average mana value | 3.68 | 2.07 | 0.991 | 2.96 or less | 6 | 98 % |
| Lands | 38 | 26 | 0.983 | 33 or fewer | 0 of 182 | 97 % |

Of the 64 cEDH-named lists the read leaves below a firm 4, lands at 33 or fewer catch 51 and fast mana at 6 or more catches 24, with no precon past either cut. On 247 lists that keep 50 to 95 % of a precon, the average mana value moves the right way on 76 % (the read on 26 %). One false positive is already known: a Marchesa list both deckcheck and deckwarden call Bracket 2 has an average mana value of 2.95, past the curve cut. **So the nudge uses fast mana and lands only; the curve is shown, never used to ask.**

**The definitions** (exactly the calibration's, `scripts/.tmp/deckcheck-calibration.ts:352`, `:361-421`, `:545`; local and gitignored, so they are restated here):
- The main zone is every entry whose zone is not `commander`; counts are by copy (quantity).
- A card is a **land** when the FRONT face of `attrs.type_line` (the text before ` // `) contains `Land`. Not `primaryType`: `scryfall-map.ts:90-101` ranks Creature, Artifact and Enchantment above Land, so artifact lands and Dryad Arbor are not `primaryType === "Land"`. Decide and pin the edge cases (an artifact land counts as a land; a modal double-faced card with a spell front is a spell).
- **Fast mana**: a nonland main-zone card with mana value (`costValue`) at most 1 and any of the roles `ramp`, `mana-rock`, `mana-dork`. There is no fast-mana role (`src/lib/games/mtg/roles.ts:44-135` lists the 17 keys).
- **Tutors**: a main-zone card with the role `tutor` (Tagger's land tutors are a separate tag and not in `tutor`).
- **Average mana value**: the mean `costValue` over nonland main-zone cards, by copy, two decimals; **lands** is the land count by copy.

**Where the inputs are.** `CardData` carries `primaryType`, `costValue` and `attrs` (`src/lib/games/types.ts:70-92`); `MtgAttrs` has `type_line` and `roles?: MtgRoleKey[]` (`src/lib/games/mtg/attrs.ts:21-50`, roles at `:49`, documented "Not a bracket flag: the read never takes it"). The editor and the share page load the full `ci.attrs` through `fetchDeckCardsWire` (`src/lib/decks/deck-cards-wire.ts:52`), so roles are already in both payloads: **no new statement** on either surface. The editor calls `adapter.brackets.assess` directly (`src/components/editor/deck-editor.tsx:1963-1977`; the sheet at `:2444`); the share page goes through `tableBracket` (`src/lib/brackets/table.ts:52-103`, called at `src/components/deck/deck-share-view.tsx:344`).

**The sheet and the questions.** `BracketSheet` (`src/components/deck/bracket-sheet.tsx:103`): "Your call" (`read.review`) at `:230-251`, "How it plays" (the four play questions, collapsed, owner only) at `:483-539` rendering `brackets.questions` at `:517`. The questions are `MTG_BRACKET_QUESTIONS` (`brackets.ts:296-325`): `theme`, `quality`, `fast`, `cedh` ("Tuned for the cEDH metagame?"; its table words at `:321-323`). Answers live in `decks.goals` (`src/lib/decks/goals.ts`: `withAnswer` `:181`, `readGoals` `:139`), saved by `PATCH {goals}` (`src/app/api/decks/[id]/route.ts:81-92`, `:122-130`; it never moves `updated_at`). `suggestedLevel` (`brackets.ts:560-581`) raises to 5 on `cedh: "yes"`. `mtgBracketTable(read)` (`src/lib/games/mtg/bracket-line.ts:351-392`) receives only the read, never the cards, so the facts cannot be a table row without a new input: they are their own block.

**"At the table".** `AtTheTable` (`src/components/deck/at-the-table.tsx:47-68`) renders `TableLine[]` as a `dl` with `data-line`; `tableSummary` (`table.ts:151`) builds the lines, `tableText` (`:231`) the copied text. Pins: `src/lib/brackets/table.test.ts:297-320`, `:347-350` (the full copied text), `deck-share-view.test.tsx:748-815`.

**Copy rules.** New strings: zero em or en dashes and at most one middle dot a line (`WAVE5.md:178`, D9 at `:333-337`); the table voice for what visitors read (`WAVE4.md:343`, `:506`, `:797`). The guards are tests: `src/lib/games/mtg/bracket-line.test.ts:577-665` and `src/lib/brackets/copy.test.ts:30-68` (`everyString` collects the questions, the table labels and the note; add the new strings to it). Copy lives in `src/lib/brackets/copy.ts` (`BRACKET_COPY`, `:17-60`).

## The design (decide and disclose the details; these are the decisions the study made)

1. **A pure adapter function**, `src/lib/games/mtg/speed.ts`: `mtgSpeedFacts(entries, cards) → { fastMana, tutors, averageManaValue, lands } | null` (null for a list with no main-zone cards), and `mtgSpeedLooksTuned(facts)` = `fastMana >= 6 || lands <= 33`, with the cuts as named constants whose doc comment carries the calibration's numbers. Core reaches it through **one optional member on `BracketsMeta`** (`src/lib/games/types.ts:807-904`, e.g. `speed?: { facts(deck, cards); looksTuned(facts) }`), never by importing MTG code; One Piece leaves it absent.
2. **The sheet shows the facts** as one block after the table, on the editor and on the share page, for owner and visitors alike: the three facts with their plain meaning (fast mana as "mana at 1 or less", the curve as "average mana value", lands), and one sentence that agrees with the assumption line (they show how fast the list looks; they do not change the bracket). Words per U9 and the table voice; pin them in the copy guards.
3. **The nudge, owner only.** When `looksTuned` and the owner has not answered `cedh`, "How it plays" opens (or a callout above it points at it) with the cEDH question and the facts that triggered it ("26 lands and 12 fast mana"). Answering uses the existing `withAnswer` path and the existing PATCH; nothing new is stored. When `cedh` is answered, the nudge is gone. Visitors never see a question.
4. **"At the table" gains one line** (`data-line="speed"`) with the three facts, in the owner's copy and the visitor's, so a player can say them at Rule 0 with numbers anyone can check. This moves the copied-text pins in `table.test.ts` and `deck-share-view.test.tsx`; move them in the same commit and say so.
5. **No cut on the curve.** The average mana value is shown, never used to ask (the Marchesa false positive above).

## Tests (vitest) and checks

- `speed.test.ts`: fixtures for each definition: copies counted, the commander excluded, an artifact land and Dryad Arbor as lands, a modal double-faced card with a spell front as a spell, a land-front MDFC as a land, X costs at their `costValue`, a card with no roles, a ramp card at mana value 2 (not fast), `tutor` without other roles; the cuts at their edges (5 and 6 fast mana; 33 and 34 lands); an empty list → null.
- The read unchanged: `brackets.test.ts` and `bracket-impact.test.ts` untouched and green; a new test that `assess` returns the same object with and without roles present on the cards.
- The sheet: facts present for Magic, absent for One Piece; the nudge only for the owner, only when tuned and unanswered, gone once answered; the PATCH body the existing one (`goalsPatchBody`).
- "At the table": the new line in both voices; the moved pins.
- Copy guards include every new string.
- **Parity with the calibration**: a scratch script (both guards) runs `mtgSpeedFacts` over the 182 precons and a sample of the archived lists on the `dev` branch and matches the calibration's per-list axes (its `tournament-reads.json` and `precon-reads.json` carry them); report mismatches with cause before shipping.
- Mutation checks, each red: the cut at 7, lands from `primaryType`, the commander counted, the nudge shown to a visitor, the read reading roles.
- `pnpm check`; `pnpm build` with an empty route-table diff; the share page's `DB_LOG` count unchanged; the sheet and "At the table" on dev for the three before-capture lists (after captures); Lighthouse a11y on the share page unchanged.

## LATER rows this package touches

- Row 297 (the calibration's re-run) gains BRACKET-SPEED's parity script as the re-run's starting point.
- Opens, if the owner wants it later: the facts on `/precons` tiles (needs roles in `loadPreconBracketFacts`), and a "speed" answer for the `fast` question (the calibration only measured cEDH).

## Session notes

- The measuring browser is Chrome for Testing through the chrome-devtools MCP; the editor needs a deck: the state-only precon drafts (`/decks/new?game=mtg&from=<slug>`) are zero-write QA decks.
- Never `cd`; helpers as `*.js.txt`; prod database reads need the owner's OK.
