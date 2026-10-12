# U3b session prompt — Desktop deck pane: the materials (`--chrome` on the editor header, the sticky search block, the phone tab bar and stuck group headings; the solid strip and the hairline back under reduced transparency and more contrast; the stuck-only scroll-edge gradient; the raised leader card at about 180 px with its facts beside it; the header name floor)

> **Status: not run yet.** Written 2026-10-12 at the end of U3a (code `ed8991f`), every anchor below re-grepped against `ed8991f`. Add a dated ship note at the top of this file when U3b ships, the way `U3a-session-prompt.md` has one.

Pull latest, then run U3b, the fifth Wave-5 package. **`WAVE5.md` is the contract.** Read, in this order: D0 (the chrome rule: "Chrome (the editor header, the sticky search block, the phone tab bar, stuck group headers) may be the `--chrome` material where content scrolls under it, with the solid fallback under `prefers-reduced-transparency: reduce` and `prefers-contrast: more`; panels, drawers, the phone sheet, popovers and chips stay opaque"); **D4's "The materials" paragraph** and its "Tests and pins"; E's U3b section and the U3b row of the **pin matrix**; REDESIGN.md's Wave-5 addendum line on F8; then U3a's ship note (top of `U3a-session-prompt.md`) and REDESIGN.md's "U3a decisions and deviations", because U3b dresses the slots U3a fixed and must keep U3a's numbers.

U3b is S-sized. **No migration, no new route, no new dependency.** It touches `globals.css` (`--chrome` and its two fallback rules), `editor-header.tsx`'s header and name, `search-pane.tsx`'s sticky block, `editor-layout.tsx`'s phone tab bar, `deck-text-view.tsx`'s `STICKY_HEADER_CLASS` plus a stuck signal, and `leader-zone.tsx`'s card row (with U3a's skeleton beside it).

Pre-flight, in order.
1. **Main is green.** `pnpm check` = **2,243 tests / 208 files / the same 6 `no-unused-vars` warnings / 0 errors** on `ed8991f` (and on the U3a docs commit after it). A test red for a date reason is fixed first, as its own commit (a wall-clock fixture is written relative to `Date.now()`).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml --limit 3`). A red run is P4.7 branch F and preempts everything.
3. **A warm beta signal outranks a package.** Ask the owner whether anything was posted; a warm signal gets the `P2.9-session-prompt.md` (Magic) or `P4.7-session-prompt.md` (One Piece) round as its own session first.
4. **Ask for read-only database access once, at the start**, in plain words: `pnpm db:size` (287.0 MB at U3a, alert 350) and the census (210 decks = 16 account + 13 guest + 181 precons; 1 user at U3a), one `read only` transaction (the `postgres` client with `sql.begin("read only", …)` asserting `transaction_read_only = on`; write it to `scripts/.tmp/census-u3b.ts` and delete it when done), nothing written.
5. **Working tree clean** at or after U3a's docs commit. Another session may share this working copy: stage explicit paths only, never `git add -A`; re-read `LATER.md`, `REDESIGN.md`, `WAVE5.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` as above, `pnpm db:size`, and save `pnpm build`'s route table (stop the dev server first: they share `.next`); the diff at the end must be **empty**. Then the **before captures** (both themes at 1200 and 1440, 390 for the tab bar; a stuck group heading over rows with the ambient art on; the layout-shift entries at 390 and 1440), before any edit.
7. **The lab is a record.** D4's materials come from `.claude/design-lab/lenses/apple.md` §5b item 4 and the C comp (`/Users/danielson/Documents/Claude/deckwarden/.claude/worktrees/design-lab/src/components/lab/editor-pane-comp.tsx`, its `CHROME_CLASS`, `LEADER_C_CLASS` and the stuck gradient span). Do not start the lab server; read lab files by absolute path and **never `cd` into the worktree** (see Session notes).

## What U3b is NOT (scope fence)

- NOT the phone editor (U4a / U4b) beyond the phone tab bar's material: the phone header rows, the 45 % leader, the phone summary and the sheet are D5's. The leader card's new row (card + facts beside) is the desktop form; gate it so phones keep today's card until U4a (or say why the same row works at 390, measured).
- NOT the share page (U6): it passes `ruled` and no `sticky`, so `STICKY_HEADER_CLASS` and the material never reach it; keep it that way.
- NOT the Card pane, the drawer, popovers, chips or the phone sheet: D0 keeps them opaque.
- NOT any copy string, `aria-label`, URL or nav label. **Type lines are data** (D0): the leader card's facts line is the adapter's subtitle and stat line as they come ("Legendary Creature — Angel · 2/2", em dash included), not D4's comma rendering.
- NOT motion beyond the leader card's 2 px `motion-safe:` lift (U2's tokens: 120 ms on `settle-120`) and the gradient's appearance (instant, or a U2 token with its reduced-motion form stated).
- Anything else → `LATER.md` with a trigger (the last row at U3a's end is **229**).

## Facts you inherit (verified 2026-10-12 against `ed8991f` — re-grep lines, trust the shapes)

**Where `--chrome` can live.** D4 puts it "in the same third `:root` / `.dark` pair as the edge token (the value is theme-neutral, so one declaration)". That pair is `globals.css:342-347` (`:root { --border-control: … 55% … }` and `.dark { --border-control: … 40% … }`), and `tokens.test.ts:71-74` pins each block with a regex that expects **only** the `--border-control` declaration between the braces; adding `--chrome` to the `:root` block fails that pin. Either update the pin (and `tokens.ts`, which mirrors the edge pair) or give `--chrome` its own block, and say which. `color-mix(in oklch, var(--background) 88%, transparent)` declared once on `:root` resolves per theme because the theme class sits on `<html>`, the `:root` element itself; verify the computed value in both themes.

**The four chrome sites at `ed8991f`.** The editor header, `editor-header.tsx:126`: `flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 lg:h-14 lg:flex-nowrap lg:py-0`, with **no background of its own** today and nothing scrolling under it (the panes are their own scroll containers below it), so its material sits over the ambient art only. Decide whether the header takes the material anyway (D4 lists it) and what the hairline does there. The sticky search block, `search-pane.tsx:211`: `bg-background sticky top-0 z-10 px-3 pt-3 pb-1`. The phone tab bar, `editor-layout.tsx:221`: `bg-background fixed inset-x-0 bottom-0 z-40 … border-t … md:hidden`. Stuck group headings, `STICKY_HEADER_CLASS` at `deck-text-view.tsx:59` (`bg-background sticky top-0 z-10`, pinned by `deck-text-view.test.tsx`'s "sticky top-0"), applied by `GroupHeading` (`:77`) in the text and grid views when `sticky`.

**The stuck heading since U3a.** `GROUP_HEADER_CLASS` (`:54`) is `flex items-baseline gap-2 pt-5 pb-1.5`: the 20 px of space above the label is the heading's own padding, inside the sticky box, so the heading is 46 px tall and its solid `bg-background` shows **at rest** as a 46 px band over the ambient art in dark (21 px before U3a). The material should make the band disappear at rest and appear only as chrome while rows pass under it; the 12 px gradient exists only while stuck.

**The stuck signal against `content-visibility`.** The editor's group sections carry `content-visibility: auto` with per-group `contain-intrinsic-size` (`DEFERRED_GROUP_CLASS`, `:68`, reading `--group-rows` set inline per section). A sentinel inside a skipped section has no layout box, so an `IntersectionObserver` sees nothing until the section renders; a heading can only be stuck while its section is on screen (rendered), so the sentinel should work, but verify it in Brave, including a fast scroll from the top to the last group. `scroll-state(stuck: top)` container queries are the CSS path where supported (the sticky heading becomes `container-type: scroll-state` and the gradient a child it styles); keep the sentinel as the fallback, never an always-on gradient. Whatever you add must not change a section's placeholder height (U3a measured the placeholders equal to the drawn heights: 246 / 974 / 358 / 246 / 190 / 190 px at 1440) or move a row.

**The leader card.** `leader-zone.tsx:170` renders each leader as `li.w-40.max-w-[45%]` (the image in a `button`, then the name row `mt-1 flex items-center gap-1` with the `text-xs` name and the `icon-xs` Remove, then the mono caption). **U3a's pending skeleton (`:109-118`) mirrors that `li` box for box** (160 × 266.5 at 1440), so a seed lands without moving anything: change the skeleton in the same edit as the card row, and re-measure the seed (the layout-shift entries, the gated precon fetch; see Session notes). The tinted shadow is U8's `HERO_CARD_SHADOW` (`surface-header.tsx`, `shadow-lg shadow-primary/25 dark:shadow-black/60`), already used by the hubs and the card page; the 2 px lift is `motion-safe:` on U2's 120 ms. The card's facts: the adapter's `display.subtitle` and `display.statLine` (Magic: `card.attrs.type_line` before any " // ", and P/T), or `leaderCaption` for One Piece's id and Life. At 390 the zone is the phone's (U4a's 45 % card): gate the new row from `md`.

**The header name floor.** The name input (`editor-header.tsx:137-144`) is `… order-last min-w-0 basis-full … lg:order-none lg:flex-1 lg:basis-auto`; the game · format `Badge` (`:134`) is `text-muted-foreground shrink-0 font-normal` and measures 210 px for Magic. D4: the name keeps `min-w-[8rem]` and the meta truncates and hides below `wide:` (the comp's 1200 px bug). Hiding the meta below `wide:` also frees the header's first row at 768 to 782 px, where U3a's fixed primary slot wraps the cluster for every deck (LATER row 229); check it.

**U3a's numbers are U3b's floor.** CLS on prod (4x CPU, Fast 4G, Giada's precon draft): 1440 0.0020, 390 0.0074; dev 1200 0.0029. LCP on prod: 390 1,923 ms, 1440 2,229 / 2,286 ms (the Card tab's lazy copy; LATER row 226). A `backdrop-filter` layer must not add a shift or a long paint: trace the editor at 390 with 4x CPU while scrolling the Deck tab (the tab bar's blur), and drop the phone tab bar to solid if the trace shows jank (E's risk).

**Reduced transparency and more contrast have no switch in the MCP's `emulate`.** Use U2's CSSOM-copy method (copy the `@media (prefers-reduced-transparency: reduce)` and `(prefers-contrast: more)` rules out of the CSSOM into a `<style>` wrapped in `@layer base { … }`) to prove the solid strip and the hairline come back, plus the jsdom pins E asks for (`tokens.test.ts` reading `globals.css`).

**Pins that must stay green**: all of U3a's (`deck-text-view.test.tsx` headings, qty and pips; `bracket-line.test.tsx` slot cases; `editor-header.test.tsx` primary slot; `leader-zone.test.tsx` `priority` and `pending`; `deck-list-pane.test.tsx`'s bones; `validation-panel.test.tsx` slot cases; `editor-layout.test.tsx:98` "Deck · 34"); the zero-POST pins in `deck-editor.test.tsx`; `tokens.test.ts`'s hex blocks and backstop; every `aria-label`.

## Verify-first list (never from memory)

1. **The stuck signal** fires only while rows pass under a heading, in Brave, at 1200 and 1440, with `content-visibility` on, including after a jump to the last group; the gradient is never visible at rest.
2. **The material's contrast**: text over `--chrome` with the ambient art under it. The Appendix B helper can't composite images; compute the worst case (88 % background over the art's brightest pixels in both themes) and check by eye.
3. **The fallbacks**: under reduced transparency and more contrast, the solid strip, no blur, the hairline back (CSSOM-copy method and the jsdom pin).
4. **The leader card's row** at 1200 and 1440 (and 768), the skeleton matching it box for box, the seed moving nothing (CLS at or under U3a's numbers).
5. **The header name** never collapses at 1200 (`min-w-[8rem]`), the meta truncates then hides below `wide:`; the 768–782 px row.
6. **The tab bar's blur** in a 390 trace at 4x CPU while scrolling.
7. **`pnpm build`'s route table diff is empty.**
8. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel" (it reads `pending` for the first minutes; CI is separate).

## Design decisions to make explicitly (disclose + pin each)

- **Where `--chrome` lives** (the edge token's block with the pin updated, or a fourth block).
- **The editor header's material** when nothing scrolls under it: the material over the art, or the solid strip kept, with the hairline's fate.
- **The stuck signal**: the sentinel, `scroll-state(stuck)` with the sentinel as fallback, or both; and how the gradient appears (instant, or a U2 token with its reduced-motion form).
- **The leader card's width and row** (about 180 px) per tier, and the phone's (unchanged until U4a, or measured fine).
- **The tab bar** blurred or solid, after the trace.

## Deployable outcome

**U3b is one commit of code**, then the docs commit. The before captures are taken first; keep the raw files in `.claude/u3b-evidence/` (git-ignored).

Verified **on dev**: the band gone at rest and the material plus the 12 px gradient only while rows pass under a stuck heading; the solid strip and the hairline back under both preferences; the leader card raised (shadow, lift) with its facts beside it at 1200 and 1440, the skeleton matching it and the seed moving nothing; the header name at least 8rem at 1200 and the meta hidden below `wide:`; CLS at 390 and 1440 at or under U3a's; both themes at 1200 and 1440, 390 for the tab bar and regressions.

Verified **on prod, signed out, zero creates**: the Giada precon draft in Brave's DOM shows the material on the four sites (computed `backdrop-filter` and the `color-mix` background), the leader card's new row and the hidden meta below `wide:`; the share page unchanged; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`; `/sets` and `/precons` stay `○`.

**Handed to the owner**: nothing signed-in; the owner reviews the editor at the end of U4b.

Tests: `tokens.test.ts` (`--chrome` and the two media rules), `deck-text-view.test.tsx` (the sticky class and the stuck gradient's gating), `leader-zone.test.tsx` (the card row and the skeleton kept in step), `editor-header.test.tsx` (the name floor, the meta's classes); U3a's pins stay green.

Docs in the same package: the `WAVE5.md` tracker ticked with the sha and any deviation beside it; a dated ship note at the top of this file; REDESIGN.md "U3b decisions and deviations" under the Wave-5 addendum; `LATER.md` rows from **230** for anything deferred (and row 229 closed or kept, measured); memory updated; **`U4a-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted; delete yours when done) inside one `read only` transaction.
- **Never `cd` out of the repo root.** A `cd` into any subdirectory moves the harness's primary working directory (U3a hit it twice: the lab worktree and `.claude/u3a-evidence`). Use absolute paths, and run node helpers as `node /abs/path/script.mjs /abs/path/file`.
- `.env.local`'s `DATABASE_URL` is prod's pooler; dev shares prod's database. `source .env.local` fails in zsh. A deck made on dev is a real row: the Giada draft stays state-only as long as nothing is edited (an edit POSTs); delete any QA deck and re-prove the census.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN`. Stop it before `pnpm build`, restart it after if you still need dev. `next dev` re-adds the AGENTS.md block; commit it with your work if it appears. After deleting a throwaway `qa-<pkg>` page, delete `.next/dev` too.
- **Measuring browser**: the chrome-devtools MCP (Brave). If `list_pages` says the profile is held by an earlier session's Brave, ask the owner, then quit only that profile's main process (`ps ax -o pid=,command= | grep "user-data-dir=$HOME/.cache/chrome-devtools-mcp/chrome-profile" | grep -v Helper`). `emulate` with `viewport: "390x844x3,mobile,touch"` gives `(pointer: coarse)`, `1440x900x1` the desktop, `cpuThrottlingRate: 4` and `networkConditions: "Fast 4G"` for traces; reset both when done. `navigate_page` with `initScript: "localStorage.setItem('theme','light')"` sets the theme for that load. `take_screenshot`'s `filePath` must sit inside the workspace (`.claude/<pkg>-evidence/`); a scratchpad path is refused.
- **Name the movers with layout-shift entries**, not only the trace insight: a buffered `PerformanceObserver({ type: "layout-shift", buffered: true })` read after the seed lands gives every source's node and its previous / current rects (U3a found the Tools pane's attribution and the phone summary's centered group that way). Strip `<nextjs-portal>` before screenshots.
- **Capture the pre-seed state with a gated precon fetch**: `navigate_page` with an `initScript` that wraps `window.fetch` so `/api/precons/` waits on a promise exposed as `window.__releasePrecon`; measure, screenshot, then release and measure again. (A timed delay doesn't work: the tool waits for the page to settle.)
- **Judge LCP on prod.** Dev's precon read lands at about 4 s, and fading images can fall after a dev trace's end; U3a's dev LCP numbers aren't comparable. Two prod runs per width, same conditions (warm cache, dark default).
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree (a stuck sentinel's state belongs in an effect's subscription callback, not set synchronously in the effect body). `@next/next/no-html-link-for-pages` fails a test that renders `<a href="/">`.
- Four source files hold a literal NUL byte (one is `autofill-sheet.tsx`'s `pickKey` template); an exact-string edit anchored on such a line misses silently. Prettier reflows scripted-edit anchors after `pnpm format`; `*.md` is prettier-ignored.
- **Tailwind v4 reads the Markdown docs for class names** (LATER row 217): a class quoted here or in WAVE5.md is minted into the served CSS, so a grep of the built CSS can find a string no component uses; check `src/` first.
- `grep` here is ugrep: put `-e` before a pattern that starts with `--`, and quote `--include='*.tsx'` globs.
- Prod: curls need `--compressed`; ISR pages lag a deploy by up to an hour; U3b creates no prod decks. The editor on `/decks/new` renders client-side (the static shell is the Suspense fallback), so prod checks of editor classes run in Brave's DOM.

## Context, not tasks

- Sequence after U3b: U4a phone Deck tab → U4b phone sheet + Tools strip (**owner review: the editor**; U4b also takes the drawer's `flick-400` release split by `data-swiping`) → U7a → U5 → U6 (**owner review: the public surfaces**; U6 drops U3a's `ruled` on the share page and may take `--pip-size` for its rows, LATER row 227) → U7b → U9 → U10a → U10b (the filter chips' press, LATER row 219).
- U3a's open threads that later packages own: the seeded draft's LCP (row 224), the edit route's preload (225), the Card tab's lazy LCP image at wide (226), pips beyond the deck rows (227), the phone header's Keep widening and the 360 px overflow (228, U4a), the 768–782 px header row (229, this package).
- The ladder (U8): `.type-display`, `-title`, `-section`, `-small`, `-caption` (Literata); `.type-body`, `-label`, `-label-sm`, `-label-xs`, `-meta`, `-meta-multiline`, `-eyebrow`, `-micro` (Geist). A utility beside one still wins, so don't add `tracking-*`, `text-*` sizes, `leading-*` or weights next to a class.
- The owner's 22 answers of 2026-10-12 stand (`WAVE5.md`, Context); F8 ("Take the material") is this package's. The defaults in `WAVE5.md` section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the U-series and get their own round. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds. Premium never gates card data.
- The lab branch `design-lab` (worktree `.claude/worktrees/design-lab`, `395179d`) is a record: read it by absolute path, never commit to it, rebase it, push it or delete it.
