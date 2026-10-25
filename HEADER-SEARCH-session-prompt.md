# HEADER-SEARCH session prompt: a card search in the site header, on every page

*Status: **shipped 2026-10-24** as `5028baa` (CI run 40159941173 green; Vercel's production status success at 03:55:14 Z on 2026-10-25), written and executed in the same session at the owner's request ("a search bar at the top that's always in the header so anyone can search for a card easily"), deployed together with TARGET-CHANGES (`089f7b0`). Fires the first half of LATER row 111 (header search on every page, parked 2026-09-27 until "a user asks"); the ⌘K palette half stays parked. Deviations, recorded in REDESIGN.md's HEADER-SEARCH section: below md the Appearance trigger gives its slot to the search button and its items join the phone Menu (so the wordmark keeps its 360 px step), below lg the Appearance label and the account name show as icons (the tablet squeeze this prompt didn't foresee), `data-game` is read from `#main` and its ancestors only, and the fallback line uses short game names. Anchors verified against `6ade698`; re-grep lines, trust the shapes.*

## Ship note (2026-10-24)

- **One feat commit**, `5028baa`: the island, `NameSuggest`'s two opt-in props, the header and phone Menu changes, tests, this file, REDESIGN.md's section and LATER rows 111 (header half fired), 336 and 337. Built by a subagent in its own worktree from this prompt, reviewed line by line, then reworked at integration where measurement disagreed with its first cut (Appearance into the phone Menu instead of the wordmark hiding up to 416 px, icons below lg for the tablet squeeze, `data-game` from `#main` and its ancestors only, short game names). `pnpm check` on its tree: 3,055 tests in 281 files, 0 errors, the same 6 lint warnings.
- **The build, against `6ade698`'s:** the route table is byte-identical (every ○ and ● page kept its mode); a static page's scripts went from 385,088 to 408,225 bytes gzipped (+22.6 KiB, 6%), `/decks/new` +5.8 KiB (LATER row 337).
- **On dev, in the pane:** the flows in REDESIGN.md's measured line, at 320, 390, 768 and 1280 px, in both themes.
- **In the iOS Simulator** (iPhone 15, Mobile Safari, the dev server): the header row kept the wordmark at 393 pt; the tap on the search button raised the keyboard with the input focused; "sol r" listed eight rows over the keyboard with Sol Ring first; the keyboard's search key opened `/cards?q=sol+r` ("2 cards") and the row closed.
- **Production, read from outside:** home, `/c/atraxa-praetors-voice` and `/privacy` carry the Cards search landmark (`action="/cards" method="get"`) and both "Search cards" controls in their server HTML; the hub still answers `x-nextjs-prerender: 1`, a MISS on the first hit after the deploy and a HIT on the next, and `/privacy` answers PRERENDER; the suggest route answers "sol ri" with Sol Ring first, and "luffy" with no Magic rows and eight One Piece rows, the miss the box falls back from.
- **Left for the owner:** a stranger finding a card from the home page unaided (the test no tool can run), and a look on your own phone.

## The ask, deepened

Anyone, on any page and any device, finds a card in a few keystrokes, and the header pays for it with nothing it holds today: no page loses its caching, no request leaves on page load, the row keeps its height, and a 320 px phone still doesn't scroll sideways.

## What exists (verified)

- `SiteHeader` (`src/components/site-header.tsx`) is a server shell: an `h-14` row plus its hairline. `--site-header-height: calc(3.5rem + 1px)` in `globals.css` mirrors it, and `site-header.test.tsx` and `editor-layout.test.tsx` pin the pair. Rendered by `(site)/layout.tsx`, `decks/layout.tsx` (the editor routes, since 2026-10-17), `not-found.tsx` and `error.tsx`. Its islands: `AccountSlot`, `AppearanceMenu`, and `site-nav.tsx`'s links and menus, which read `usePathname` and nothing else.
- Nothing in the header may read request data (`headers()`, `cookies()`, `searchParams`, `useSearchParams`): `/c/`, `/l/` and `/cards/[id]` are ISR (LATER row 71's yardstick); `src/app/(site)/isr-budget.test.ts` guards part of it.
- The phone row: below 360 px the wordmark steps aside so the guest row fits 320 px (LATER row 250). Any new control is re-measured at 320, signed out and signed in.
- X2's `NameSuggest` (`src/components/search/name-suggest.tsx`): Base UI Autocomplete over `GET /api/cards/suggest` (`game`, `scope`, `q`; at most 8 rows; `s-maxage=3600`; IP bucket `cardSuggest` 120/min and 2,000/hour). 150 ms debounce, abort, opens at two normalized characters, link rows (`prefetch={false}`), a footer row that submits the owning form, the invisible default submit button when `name` is set (the implicit-submission trap), `mode="none"`, `highlightItemOnHover={false}`. Used by `/commanders` and `/leaders` (GET forms), `/cards` (controlled), and X5's picture dialog (pick mode). Read its header comment before touching it.
- `/cards` takes `?q=` (home's SearchAction JSON-LD) and `?game=optcg`.
- Pages mark their game: `<main id="main" data-game="mtg|optcg">` on most pages; the editor layout's root and the share view carry `data-game` too.
- The editor owns `/` (focus its add-card search) and `?` (`use-editor-hotkeys.ts`, a window listener that lives only while the editor is mounted).
- One Piece cards carry `attrs.type_line` (punk-map), so the type detail works for both games.

## Build

1. **`HeaderSearch`, a client island in the header.**
   - md and up: an inline box between the nav and the right-hand cluster, growing to a capped width, `h-9` inside the `h-14` row. The row's height does not change.
   - Below md: a 44 px search button (`aria-label="Search cards"`) in the right-hand cluster. A tap opens a full-width search row over the header row (same height, absolutely placed, so nothing shifts) with the input focused **inside the tap**: `flushSync` the open, then `.focus()` synchronously. iOS Safari raises the keyboard only for focus inside the gesture, and Base UI's Dialog and Popover move focus on a later frame. A Close button; Esc with the popup shut closes it too; a route change closes it; focus goes back to the search button.
   - A real `<form role="search" action="/cards" method="get">` with the input named `q` (plus a hidden `game=optcg` when the box is searching One Piece): Enter with no highlighted row, or the footer row "Show every card matching “…”", opens the full results, and the form works before hydration.
   - Rows: every card (`scope="cards"`), each linking `/cards/<id>`, with the type line as the detail.
2. **The game.** The box searches the open page's game, read from `data-game` on `#main` (or an ancestor, or its first descendant) when the reader focuses or types, never at render, so the server HTML has one shape. Otherwise Magic. When that game answers no rows for a key, ask the other game once and show its rows, with the status line naming the game ("No Magic cards match. 3 One Piece cards."); Enter and the footer then follow the game that answered. One extra request, and only on a miss. Build it as opt-in `NameSuggest` props so `/commanders`, `/leaders`, `/cards` and the picture dialog behave byte for byte as today (their tests pass unedited). Game names come from where `GameSwitch` takes them; never import the adapter registry into the header (every page would ship it).
3. **`/` jumps to the box** from anywhere except the editor routes (`/decks/*`, where `/` stays the editor's own search). Not while typing in a field, not with a modifier, not inside an open dialog or menu (reuse `isTextTarget`). A keycap hint in the md box, only where `/` works.
4. **Accessibility.** One search landmark with a name; the input a combobox named "Search cards" (the `/cards` page's own box stays "Card name"); X2's status line; 44 px targets on coarse pointers; visible focus; both themes.

## Must hold

- No request on page load: the island asks only after typing.
- No request data in the header; the route table is unchanged (no ○ or ● route becomes ƒ).
- The header stays 56 px plus the hairline; no horizontal scroll at 320 px, signed out or in; the desktop nav is untouched.
- One header per page.
- Every existing `NameSuggest` caller unchanged; X2's tests pass unedited (additions only).
- The JS the header adds is measured and reported. If it's large, say why before optimizing.

## Out of scope (LATER)

- The ⌘K command palette (row 111 keeps that half).
- A log of what people search. A pro would want one; it's a privacy call, so it's the owner's (a new LATER row with a trigger).
- Searching decks, users or hubs from the header.

## Done

RTL for `HeaderSearch`: the landmark and the combobox name; the form's action and params; `/` off the editor and not on `/decks/*`; on phones, the input focused synchronously by the tap, and Esc or Close returning focus to the button; a One Piece page searching `optcg`; the fallback rows and status wording over a mocked fetch. `site-header.test.tsx` covers the new control. `pnpm check` green, the route table diffed, the header measured at 320, 390, 768 and 1280 in both themes, deployed, and read from production.
