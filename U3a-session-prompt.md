# U3a session prompt — Desktop deck pane: the bones (fixed slots so nothing shifts after load; the two-line status slot; group headers to space with bold counts; qty 14 px and 11.2 px pips; one controls row; the leader image's priority; `content-visibility`)

> **Status: not run yet.** Written 2026-10-12 at the end of U8 (code `948cb0a`), every anchor below re-grepped against `948cb0a`. Add a dated ship note at the top of this file when U3a ships, the way `U8-session-prompt.md` has one.

Pull latest, then run U3a, the fourth Wave-5 package. **`WAVE5.md` is the contract.** Read, in this order: D0 (the wave's rules: no layout change outside the surfaces a package names, the pinned strings, a wall-clock fixture relative to `Date.now()`); **D4** in full (U3a is its first five paragraphs; "The materials" is U3b's); E's U3a section and the U3a row of the **pin matrix**; then U8's ship note (top of `U8-session-prompt.md`) and REDESIGN.md's "U8 decisions and deviations", because U3a builds on the ladder, and U8 already moved two things D4 assigns here (the editor's `<main>` and the Warden and bracket lines' type).

U3a is M-sized. **No migration, no new route, no new dependency.** It touches `editor-header.tsx`, `deck-list-pane.tsx`, `deck-text-view.tsx`, `validation-panel.tsx`'s and `bracket-line.tsx`'s slot, `leader-zone.tsx`, `sample-hand.tsx`'s heading, `segmented.tsx`'s call sites, `search-pane.tsx`'s rows and `globals.css`'s `.pip`.

Pre-flight, in order.
1. **Main is green.** `pnpm check` = **2,209 tests / 207 files / the same 6 `no-unused-vars` warnings / 0 errors** on `948cb0a`. A test red for a date reason is fixed first, as its own commit (a wall-clock fixture is written relative to `Date.now()`).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml --limit 3`). A red run is P4.7 branch F and preempts everything. (The 2026-10-12 scheduled run landed at 19:59 Z.)
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted; a warm signal gets the `P2.9-session-prompt.md` (Magic) or `P4.7-session-prompt.md` (One Piece) round as its own session first.
4. **Ask for read-only database access once, at the start**, in plain words: `pnpm db:size` (287.0 MB at U8, alert 350) and the census (210 decks = 16 account + 13 guest + 181 precons; 1 user at U8), one `read only` transaction (U8's shape: `postgres` with `sql.begin("read only", …)` asserting `transaction_read_only = on`; write it to `scripts/.tmp/census-u3a.ts` and delete it when done), nothing written.
5. **Working tree clean** at or after U8's ship-note commit. Another session may share this working copy: stage explicit paths only, never `git add -A`; re-read `LATER.md`, `REDESIGN.md`, `WAVE5.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` as above, `pnpm db:size`, and save `pnpm build`'s route table (stop the dev server first: they share `.next`); the diff at the end must be **empty**. Then the **before traces** (step 9 of E's U3a), before any edit.
7. **The lab is a record.** D4's numbers come from `.claude/design-lab/lenses/apple.md` §5b and §5c and `capture/metrics.md`. Do not start the lab server; read lab files by absolute path.

## What U3a is NOT (scope fence)

- NOT the materials (U3b): no `--chrome`, no blur, no stuck-header gradient, no raised leader card at 180 px, no header-name floor. The sticky group headers keep `bg-background` in U3a.
- NOT the phone editor (U4a / U4b): the phone header rows, the count stated once, the 45 % leader, the sheet. U3a's header work is the single row at `lg` and the fixed slots; check the phone at 390 only for regressions.
- NOT the share page's controls row (`deck-share-view.tsx`, U6) or its group headers (U6), even though they share `GROUP_HEADER_CLASS` (see Facts: decide how the share page keeps its look).
- NOT the eyebrows in the Wave-4 dialogs, `/account` or `/u/` (LATER row 221), the 24 / 20 px headings (row 220), the theme ease (row 222) or the nav's section lighting (row 223).
- NOT any copy string, `aria-label`, URL or nav label; "cards", "Deck · N", the More list and every pinned string stay.
- Anything else → `LATER.md` with a trigger (the last row at U8's end is **223**).

## Facts you inherit (verified 2026-10-12 against `948cb0a` — re-grep lines, trust the shapes)

**Already done by U8 — don't redo it.** The editor's main landmark exists: `EditorLayout`'s Tabs root renders `<main id="main">` (`editor-layout.tsx`, `render={<main id="main" />}`), wrapping all three pane sections at every tier, and the skip link targets it. D4's "the deck section becomes `<main>`" is satisfied by that: **never add a second `<main>`** (one per page; `skip-link.test.tsx` scans every `<main` in `src` for `id="main"` first). `deck-editor.tsx`'s loading `<main>` carries the id too.

**The status lines since U8.** The Warden line (`validation-panel.tsx`, the zero-issue `<p role="status">`) is `.type-caption`: Literata 13 / 20 / +0.01em / 500 on the whole `<p>`, measured **20 px** tall; its approval action below keeps `pl-5.5 text-xs`. The progress line (Y2a, `data-slot="progress-line"`) is still `text-xs font-medium` (12 / 16). The bracket line (`bracket-line.tsx:49`, `data-slot="bracket-line"`, `mt-1.5`) is `.type-meta-multiline` (12 / 18 / +0.01em), measured **21 px** tall: the gauge icon's 16 px box sits on the text's baseline (`items-baseline` + `translate-y-[3px]`) and overhangs the 18 px line box. `BracketLine` returns `null` at `bracket-line.tsx:46` while there's no read. So D4's slot numbers (`min-h-10`, `leading-5` for both lines) predate the ladder: derive the reserved height from the lines as shipped (Warden 20 + `mt-1.5` + bracket 21 = 47 measured at 1440 and 390), or change the lines' leading to one value, and say which. The Warden line's height must not change between "approved", "progress" and "problems" states either (the problem toggle is a `pointer-coarse:min-h-11` button).

**The header** (`editor-header.tsx:118`): `flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 lg:h-14 lg:flex-nowrap lg:py-0`. In order: the mark, the game · format `Badge`, the name `<input aria-label="Deck name">` (`order-last basis-full` below `lg`), `ForkCreditLine`, then the right cluster `ml-auto flex items-center gap-1.5 lg:ml-0`: `SaveIndicator` (`data-slot="save-slot"` at **:273**, `h-7 w-36`, U2's two-layer cross-fade), "Keep this deck" (`onKeep`, **:144-149**, `size="sm"`), "Share" (`canShare`, **:150-154**), Tools (`hidden md:inline-flex wide:hidden`, **:155-165**), More (`icon-sm`). D4's primary slot (`w-[7.5rem]`, always in the tree, `invisible` when empty) replaces the two conditionals: check that Keep and Share are never both rendered (a seeded draft keeps; only a saved deck shares) before giving them one slot.

**The deck pane** (`deck-list-pane.tsx`): the summary row at **:223** (`flex items-center justify-between gap-2`; the `<h2>` "Deck" at **:225**, `text-sm font-semibold`; "Add cards" `md:hidden`); its right cluster at **:234** is `flex flex-wrap items-center justify-end gap-x-2 gap-y-1` (Over by N, the ownership line, `data-slot="deck-size"` at **:257**, `CompletionRing`) → D4's `flex-nowrap` with `min-w-0` truncation. `ValidationPanel` at **:262**, `{bracket}` at **:279**, `LeaderZone` at **:281**. The controls row at **:300** is `mt-4 flex flex-wrap gap-x-4 gap-y-1.5` with three `Segmented`s labelled View / Group / Sort (`segmented.tsx`: a visible `label` span `text-muted-foreground text-xs`, and `ariaLabel` for the group's name). Dropping the visible "View" means passing `ariaLabel="View"` and no `label`, so the accessible name doesn't move.

**The groups** (`deck-text-view.tsx`): `GROUP_HEADER_CLASS` at **:45-46** is `text-muted-foreground border-b pb-1 text-xs font-medium tracking-wide uppercase`, byte for byte U8's `.type-eyebrow` plus the muted ink and the hairline; the count is `<span className="ml-1.5 tabular-nums">` at **:97** inside the `<h3>` at **:95**. `STICKY_HEADER_CLASS` at **:48** is `bg-background sticky top-0 z-10` (pinned: `deck-text-view.test.tsx:117`, "sticky top-0"). The group `<section className="mt-4">` at **:94**. **`GROUP_HEADER_CLASS` reaches the share page too**: `deck-grid-view.tsx:23` imports it (with `STICKY_HEADER_CLASS`), and the share page renders the same `DeckTextView` and `DeckGridView` (`deck-share-view.tsx:604, :613`). Decide whether the share page keeps today's look until U6 (a second constant, or a prop) or takes the new one now, and say so. Qty: the stepper's number `w-6 text-center text-xs tabular-nums` (**:164**) and the read-only `data-slot="qty"` (**:181**). The pips column `min-w-20` (**:196**) with `CostPips className="text-xs"` (**:200**). `REVEAL_CLASS` at **:51-52**.

**Pips** (`globals.css`): `.pip { font-size: 0.72em }` is now at **:602** (the ladder block above it moved it), and `.don-cost` at **:640** says it uses "the same font scale and baseline offset as .pip so the two align in mixed lists": decide whether `.don-cost` follows `.pip` to 0.8em (D4 names only `.pip`), and measure a mixed list.

**The leader zone** (`leader-zone.tsx`): the `<h3>` at **:82** is the eyebrow form with `border-b pb-1`; the image is `CardImage` at **:152-159** (`frame`, `w-full text-xs shadow-md`, no `priority`). `card-image.tsx:85-87`: `priority` = eager, `fetchPriority="high"`, no fade. `leader-zone.test.tsx` exists.

**The sample hand's heading**: `sample-hand.tsx:97`, `<h2 className="border-b pb-1">` (it wraps a `CollapsibleTrigger` with the eyebrow classes at **:98**).

**The preload has no loader to come from.** D4 says `/decks/[id]/edit` emits the preload "from the loader that already runs server-side for the title". It doesn't: `src/app/decks/[id]/edit/page.tsx` is `force-dynamic` with a **static** `metadata` title ("Deck editor") and reads nothing server-side, because ownership proof (the claim token) lives in the browser's localStorage. A preload would need a new server read of the deck's first leader. That read would put a private deck's commander into the HTML for whoever opens the URL, and it costs a query per editor load. The default is **`priority` alone** (D4 already says it is the whole fix on `/decks/new?from=`); disclose the choice.

**Search rows**: `search-pane.tsx:269`, `group/row flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm pointer-coarse:min-h-11` (the selected row `bg-accent text-accent-foreground`, others `hover:bg-muted/60`) → D4's `active:bg-accent`.

**Pins that must stay green**: `editor-layout.test.tsx:98` ("Deck · 34"); `deck-text-view.test.tsx:117`; the zero-POST pins in `deck-editor.test.tsx` (the `fetchMock` filters at **:154** and **:792**, the precon seed case at **:746**); `deck-list-pane.test.tsx:54` and `deck-editor.test.tsx:1975` (the Warden line's text); `validation-panel.test.tsx` (text, `data-settled`, the settle classes); `bracket-line.test.tsx` (the Why button's 44 px); every `aria-label` ("Deck name", "More", "View", "Group", "Sort").

**The measured "before"** (WAVE5 D4 and U2's trace): CLS 0.217 desktop and 0.087 mobile; LCP 1,472 ms at 390 / 4× CPU / Fast 4G with 984 ms of load delay on an unprioritised, client-discovered commander image. U2 found the remaining 0.07 desktop shift is the header's slot problem; U8 made the status block 5 px taller (Warden 16 → 20, bracket 20 → 21). Re-trace before editing; the targets are CLS under 0.01 on both and LCP under 1.0 s.

## Verify-first list (never from memory)

1. **Which lines can be in the status block at once** (the Warden line, the progress line, the problem toggle and its list, the bracket line, the approval action), so the reserved slot is right for every state, and that the bracket line's `null` → line transition is the only thing the slot absorbs.
2. **Keep and Share are mutually exclusive** (the props that gate them, `onKeep` and `canShare`), before one fixed slot holds both.
3. **`content-visibility: auto` against the sticky group headers** in Brave: a header must still stick while its section is partly off-screen, and Find in page / the editor's own scroll-into-view (a search add scrolls the row into view) must still land. Drop it if either breaks, and disclose.
4. **The 11.2 px pips fit** the `min-w-20` column for the widest cost in the fixtures and in the Giada draft, at 1200 and at 390.
5. **The two control heights**: after the controls row lands on one line, the pane's controls measure 28 and 32 px only at 1200 and 1440 (the lab's histogram recipe).
6. **CLS and LCP with the lab's capture recipe** (WAVE5 "Verification": two Brave pages through the DevTools MCP, the second in an isolated context holding `localStorage.theme = light`, `<nextjs-portal>` removed by script, lazy images preloaded by a scripted scroll; `emulate` with `cpuThrottlingRate: 4`, `networkConditions: "Fast 4G"`), on the Giada precon draft (`/decks/new?game=mtg&from=calling_all_angels_fdc`, state-only) at 390 and 1440, before and after.
7. **`pnpm build`'s route table diff is empty.**
8. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel" (it reads `pending` for the first minutes; CI is separate).

## Design decisions to make explicitly (disclose + pin each)

- **The status slot's height and leading** (see Facts): one leading for both lines, or a measured `min-h` from the shipped ones.
- **The share page and `GROUP_HEADER_CLASS`**: a second constant until U6, or the new look on both now.
- **`.don-cost` with `.pip`**: 0.8em too, or 0.72em kept, with the mixed list measured.
- **The preload**: `priority` alone (the default) or a new server read, with its privacy and query cost stated.
- **The group label's class**: `.type-eyebrow` (U8's, the exact current look) for the label, with the count as a separate 14 px semibold tabular foreground span.
- **`content-visibility`**: kept or dropped after the sticky check.

## Deployable outcome

**U3a is one commit of code**, then the docs commit. The before traces are taken first; keep the raw files in `.claude/u3a-evidence/` (git-ignored).

Verified **on dev**: CLS under 0.01 at 390 and 1440 and LCP under 1.0 s (the lab's throttle), before and after numbers stated; the header's cluster never widens when the seed lands (a screenshot before and after the seed); the status slot present and empty before a read, and nothing moving when the read lands; the group headers spaced with "LAND 38"-style label and count; qty 14 px; pips 11.2 px; the controls row one line at 1200 and 1440, the pane's controls at 28 and 32 px only; search rows show `active:bg-accent`; both themes at 1200 and 1440, and 390 for regressions.

Verified **on prod, signed out, zero creates**: the Giada precon draft in Brave's DOM (the editor renders client-side, so its HTML shell carries none of this) shows the new group headers, the 14 px qty and the reserved status slot; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`; `/sets` and `/precons` stay `○`.

**Handed to the owner**: nothing signed-in. A look at the editor on desktop is welcome, and the owner reviews the editor at the end of U4b.

Tests: `deck-text-view.test.tsx` (the header and qty classes), `bracket-line.test.tsx` (the slot renders, empty, with no read; the line's words unchanged), `editor-header.test.tsx` (the primary slot is in the tree while empty), `leader-zone.test.tsx` (`priority`), the `deck-list-pane` tests; the pins above stay green.

Docs in the same package: the `WAVE5.md` tracker ticked with the sha and any deviation beside it; a dated ship note at the top of this file; REDESIGN.md "U3a decisions and deviations" under the Wave-5 addendum; `LATER.md` rows from **224** for anything deferred; memory updated; **`U3b-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted — delete yours when done) inside one `read only` transaction.
- `.env.local`'s `DATABASE_URL` is prod's pooler; dev shares prod's database. `source .env.local` fails in zsh. A deck made on dev is a real row: the Giada draft stays state-only as long as nothing is edited (an edit POSTs); delete any QA deck and re-prove the census.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`. Stop it before `pnpm build`. `next dev` re-adds the AGENTS.md block; commit it with your work if it appears. After deleting a throwaway `qa-<pkg>` page, delete `.next/dev` too.
- **Measuring browser**: the chrome-devtools MCP (Brave). If `list_pages` says "The browser is already running for …/chrome-devtools-mcp/chrome-profile", an earlier session's Brave holds the profile — ask the owner, then quit only that profile's main process (`ps ax -o pid=,command= | grep "user-data-dir=$HOME/.cache/chrome-devtools-mcp/chrome-profile" | grep -v Helper`); U2 and U8 both did this with the owner's OK. The fresh Brave restores the old session's tabs: close them. `emulate` with `viewport: "390x844x3,mobile,touch"` gives `(pointer: coarse)`, `1440x900x1` the desktop, `cpuThrottlingRate: 4` for traces; reset both when done. `navigate_page` with `initScript: "localStorage.setItem('theme','light')"` sets the theme per load. `take_screenshot`'s `filePath` must sit inside the workspace (`.claude/<pkg>-evidence/` is git-ignored); a scratchpad path is refused.
- **Measuring many pages at once**: a same-origin `<iframe>` per page and width (dev from a `localhost:3000` page, prod from a `deckwarden.gg` page; neither sends a framing header) measured with `getComputedStyle` inside one `evaluate_script`, with `filePath` saving the JSON. U8 compared prod and dev heading geometry this way across eight pages and two widths in two calls. Key the rows by selector, not by index: a slow prod editor renders fewer nodes in the same wait.
- **Reduced motion has no emulation switch**: copy the `@media (prefers-reduced-motion: reduce)` rule's `cssRules` out of the CSSOM into a `<style>` wrapped in `@layer base { … }` (U2's method), and remove any `no-preference` rule by hand, since a real reduce setting never matches it.
- The browser pane, if used, is hidden: it pauses rAF and stalls Base UI transitions — never judge motion there.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree. `@next/next/no-html-link-for-pages` fails a test that renders `<a href="/">` (U8's layout test used a button).
- Four source files hold a literal NUL byte (one is `autofill-sheet.tsx`'s `pickKey` template); an exact-string edit anchored on such a line misses silently. Assert anchors (U8 ran its class swaps and the `id="main"` additions through one Node script that threw on any count mismatch). Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.
- **Tailwind v4 reads the Markdown docs for class names** (LATER row 217): a class quoted in this prompt or WAVE5.md is minted into the served CSS, so a grep of the built CSS can find a string no component uses — check `src/` before believing it.
- `grep` here is ugrep: put `-e` before a pattern that starts with `--`, and quote `--include='*.tsx'` globs.
- Prod: curls need `--compressed`; ISR pages lag a deploy by up to an hour (U8's hubs rendered fresh on their first hit after the deploy); U3a creates no prod decks. The editor on `/decks/new` renders client-side — its HTML shell carries none of the editor, so prod checks of editor classes run in Brave's DOM.

## Context, not tasks

- Sequence after U3a: U3b materials → U4a phone Deck tab → U4b phone sheet + Tools strip (**owner review: the editor**; U4b also takes the drawer's `flick-400` release split by `data-swiping`) → U7a → U5 → U6 (**owner review: the public surfaces**) → U7b → U9 → U10a → U10b (the filter chips' press, LATER row 219).
- The ladder (U8): `.type-display`, `-title`, `-section`, `-small`, `-caption` (Literata); `.type-body`, `-label`, `-label-sm`, `-label-xs`, `-meta`, `-meta-multiline`, `-eyebrow`, `-micro` (Geist). Each sets face, size, leading, tracking and weight; a utility beside one still wins, so don't add `tracking-*`, `text-*` sizes, `leading-*` or weights next to a class. Pinned in `tokens.test.ts`.
- The owner's 22 answers of 2026-10-12 stand (`WAVE5.md`, Context). The defaults in `WAVE5.md` section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the U-series and get their own round. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds. Premium never gates card data.
- The lab branch `design-lab` (worktree `.claude/worktrees/design-lab`, `395179d`) is a record: read it by absolute path, never commit to it, rebase it, push it or delete it.
