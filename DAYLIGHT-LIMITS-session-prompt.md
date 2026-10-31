# DAYLIGHT-LIMITS session prompt: what LIGHT-MODE-DAYLIGHT left open

*Status: shipped 2026-10-31. Written that day in the session that shipped LIGHT-MODE-DAYLIGHT (`a555343`, ship note `d3d3645`), from the limitations its closing report named. Anchors below were verified against `d3d3645`. The record: REDESIGN.md, "The limits of the daylight table".*

## Ship note — 2026-10-31, feat `21a57aa`, deployed (Vercel status success on the full sha at 20:57:56 Z; CI run 41241284405 green at 21:00:37 Z)

- **Dark's tiles (row 381 closed).** Names under 4.5:1 at 1024 to 1279, 640 to 684 and under 380 (2.17 at the worst pixel, at 1036), the arrow about 1.2:1, Magic's name on two lines at 1024 to 1035. Now 118 widths, both tiles, hover on and off: names at least 5.37 on a narrow tile and 4.55 elsewhere, format lines at least 8.40, the arrow at least 3.72, one line everywhere. **Against the shapes above:** `max(48%, 13.5rem)` wasn't used, since it moved the 342 px tile and darkened the sail on a narrow one; a band measured from the words joins the scrim only where the tile is narrow. The disc stayed at light's 0.48. Outside the disc, 0.000 % beyond 2 levels at the ten passing widths; **375 changed**, since it reads 4.55 between 372 and 379 at 4.48 (with reasons in the record). Light's numbers are where they were: 5.18, 4.98, 3.12.
- **The share page's art on light (row 380 closed).** The builder's values, as planned, and **one thing the plan didn't have:** the tokens alone didn't show the commander, because the layer is as tall as the deck (the crop magnified 8.6 times to a sliver) and stops at the column in a visible rectangle. So on light, while a crop is up, the whole layer stands in the viewport, and `<main>` gives up `isolate`. Census of 7,918 text runs: lowest 4.70. Forty baseline pairs at 0.000 %. Dark keeps R2's numbers and its layer (row 382).
- **The browser actually read: Safari 27 in the iPad Pro 13-inch (M5) Simulator (1032 and 1376 wide, 24 views) and the iPhone 15 Simulator.** The engine desktop Safari uses, not desktop Safari. **Desktop Safari remains unviewed:** `safaridriver` refuses until "Allow remote automation" is on, and that's the owner's switch (row 383; the checklist is below). Both `lg` layouts match Chromium within 1.1 levels at the sampled spots, the shots unshifted (the page ground reads its token exactly). The iPhone caught two defects in this package's first shapes before they shipped: the art ending in a line in the strips Safari shows through its bars, then the crop without its veil there.
- **Production, read from outside, page views only.** Dark's tiles at 1024: names 5.49 and 5.69, format 8.61 and 9.84, arrow 4.49 and 4.38, the band on, 12 px padding, one line; at 390: names 5.95 and 4.88, format 9.06 and 8.71, arrow 4.05 and 4.65, the band off. The share page's crop at 1536, 1440, 768 and 390: 0.14 in the fixed layer on light, 0.08 in the tall layer on dark, the veil 50 / 20 / 65 and 70 / 30 / 90, one crop request at Low, both credits, no overflow. No console message on any of them; the only CSP event is `script-src eval`, zod's guarded probe (next.config.ts). Captures: `.claude/daylight-limits-evidence/production/`.
- **Checks.** `pnpm check`: 3,352 tests in 297 files, 0 lint errors, 6 warnings as before. `pnpm build` green. `git diff --check` clean.
- **The owner's look.** The sheet (`.claude/daylight-limits-evidence/sheets/SHEET-differences-from-the-concept.png`) went to the owner with the one question, keep them as recorded? Nothing ships from it; a "change" answer is its own package.
- **New rows:** 382 (dark's share art), 383 (desktop Safari), 384 (the credit chip over the phone's first-screen button).

### Desktop Safari: what to look at (row 383)

On `deckwarden.gg`, resizing the window to about 1024, 1280, 1440, 1536 and 1920 where the display allows:

1. **Home, Light** (Appearance menu): the stage shows no box edge or seam; the wall stays clear of the headline; the table sits at the card bases; the side cards turn slightly toward you, with short shadows. Both tile labels on one line at the narrowest width.
2. **Home, Dark:** the same stage checks. The names read clearly at every width. The arrow sits on its disc. Hovering a tile lifts it 2 px and grows the painting a little.
3. **`/d/p_the_hosts_of_mordor_ltc`, Light:** Sauron behind the whole page, still there as you scroll into the list; no rectangle at the column's edges; the header's and footer's words clear; the banner's credit at the top and the small credit riding the window's lower left. **Dark:** faint, as before.
4. **`/decks/new?game=mtg&from=the_hosts_of_mordor_ltc`, Light:** the art through the deck pane, a soft tint over search and tools, the credit at the lower left.

To have a session do this instead: run `safaridriver --enable` once (it asks for your password), then ask for this checklist in desktop Safari.

## The ask

A reader on desktop Safari gets the home and builder that were measured in Chromium. Dark's game tiles read as clearly as light's at every width. The commander on a public deck page on light can actually be seen, as it now can in the builder. And the owner has seen, once, where the live page still differs from the concept on purpose, and said whether that stands.

Starting this package is the owner's word that LATER rows 380 and 381 have fired. It narrows LIGHT-MODE-DAYLIGHT's "dark is unchanged" for `.home-tile` only. Dark's stage, its builder and share art (8 %, the veil at 70 / 30 / 90) and every other dark pixel stay as they are.

Work in this order: the first message, dark's tiles, the share page, Safari on the final code, the owner's look, then ship. Safari goes last so it judges what ships. Don't hold the deploy for it if the owner never answers.

## First message: the one thing only the owner can do

Enabling Safari's WebDriver changes a system setting and takes the owner's password, so the session never runs it. Ask once, in the first message, then start work without waiting:

> To test real desktop Safari, please run `safaridriver --enable` in Terminal once (it asks for your password). If you'd rather not, I'll use the iPad simulator, which shows an access prompt the first time. If neither happens, I'll ship the other fixes and leave Safari for your own look.

## What exists (verified at `d3d3645`)

- **Dark's tiles:** `.dark .home-tile`, `src/app/globals.css:978-993`. A horizontal scrim in percent of the tile's width (0.76, 0.70 at 48 %, 0.24 at 80 %, 0.04 at the end), a vertical one (0.62, 0.16 at 48 %, gone at 72 %), the arrow at 80 % ivory with no disc, no art filter. Light's solutions sit beside it: the scrim measured from the words in rem (`:951-964`), the disc and full ivory arrow (`:961-963`, `:994-1005`), the padding rule for 1024 to 1035 (`:1057-1061`, scoped `:root:not(.dark)`).
- **Dark's numbers (LATER row 381):** the One Piece name 2.28:1 at its worst pixel at 1024 wide (3.06 at the 1st percentile), because a 228 px tile puts the end of the name past the percent stops; 4.88 on a 390 phone; the arrow's strokes about 1.2:1 over a bright cloud or the sail at every width; "Magic: The Gathering" wraps to two lines at 1024 to 1035.
- **The ambient art:** `src/components/deck/ambient-art.tsx` reads `--ambient-crop-opacity`, `--ambient-gradient-opacity`, three `--ambient-veil-*` stops and `--ambient-credit`. R2's numbers at `:root` and `.dark` (`globals.css:425`, `:435`); the builder's light values at `:437`; the reader fallback at `:446` (`prefers-reduced-transparency`, `prefers-contrast: more`). `src/lib/theme/ambient-strength.test.ts` computes both limits from the tokens: the art stays visible, and muted text clears 4.5:1 over a black crop (bound 13.2 % of the image).
- **The share page (LATER row 380):** 4 % under 70 / 30 / 90, so 1.2 %, 2.8 % and 0.4 % of the image: the same numbers the owner couldn't see in the builder, which is now 7 %, 11.2 % and 4.9 %. `src/components/deck/deck-share-view.tsx`: `<main>` at `:483` (`relative isolate`), `AmbientArt` as its last child at `:829`, the private gate's separate `<main>` at `:408` with no crop. R5b's header shows the same art as a banner with its own credit, and the ambient chip rides the viewport; two credits on purpose.
- **The measuring ground:** zero-write public precon pages, `public_id = 'p_' + slug` (`src/lib/decks/precons.ts:12`): `/d/p_the_hosts_of_mordor_ltc` (Sauron, dark), `/d/p_calling_all_angels_fdc` (Giada, pale), `/d/p_painbow_dmc` (Jared Carthalion, colorful), `/d/p_sliver_swarm_cmm` (Sliver Gravemother, busy), `/d/p_hatsune_miku_sld` (Miku). Last session's slugs came from the builder's `?from=`, and its `/d/` runs used Sauron's page and `/d/p_counter_blitz_fic`, so confirm the others answer on the dev branch and swap in the latter if one doesn't. A precon page lacks an author, description, fork credit and goals, so measure one user's public deck as well, from the dev branch.
- **The harness:** `.claude/light-mode-daylight-evidence/harness/` (git-ignored, `.txt` so nothing runs by accident). `cdp.mjs`: its own headless Chrome for Testing with a scratch profile, exact viewports, DPR, touch, emulated media, blocked URLs. `tile-contrast.mjs` and `tile_contrast.py`: tile labels at every device pixel, takes a theme, `HOVER=1` for the 1.03 scale. `census.mjs` and `census.py`: every visible text run on the composited pixels. `regress.mjs` and `pixdiff.py`: baseline and edited pairs. `behaviors.mjs`, `editor-shots.mjs`, `compare.py`. Copy them to the session's scratchpad and drop `.txt`; their job lists and paths name last session's folders, so edit them. The Python scripts need numpy and Pillow, which the system `python3` lacks: last session used a venv in its scratchpad, made with `uv`, and never touched the repo's dependencies. The earlier captures and sheets are in `after/` beside it.
- **Safari on this machine:** Safari 27.0.1, `/usr/bin/safaridriver` present, WebDriver not known to be enabled. Simulators: iPhone 15 (granted, booted), `iPad Pro 13-inch (M5)` (no grant yet, shut down). Playwright is not a dependency; don't add it.

## Build 1: dark's tiles (LATER row 381)

Sweep first with `tile-contrast.mjs <out> dark` (all 17 widths, both tiles, hover off and on), so the before numbers are this session's. Starting shapes, **not validated**:

- Let the scrim reach the words on a narrow tile and leave a wide one alone: `max(48%, 13.5rem)` in place of `48%`, and the same idea for `80%`. A wide tile should then keep today's pixels.
- The arrow: full `--primary-foreground` on the disc and ring, at light's values first. Judge by eye whether the disc looks stuck on over dark's paintings, then measure.
- The wrap: drop `:root:not(.dark)` from the rule at `globals.css:1058` and update its comment.

Keep `--home-tile-art-filter: none` and the two files. No scrim on the sail or its emblem beyond what a label needs. No test pins these tile tokens today, so `pnpm check` can't catch a mistake here: the sweep is the proof.

**Accept:**

- Both names and both format lines at least 4.5:1 at every device pixel under the words, at all 17 widths, hover scale on and off. The arrow's strokes at least 3:1.
- Every tile label on one line at 1024 to 1035, in both themes.
- At widths whose labels already passed, the pixel diff against the baseline outside the disc is 0.000 % beyond 2 levels. If a wide tile has to change, say why with numbers.
- Light's tile numbers stay where they are: names at least 5.18:1, format lines at least 4.98:1, arrow at least 3.12:1.
- Census of dark's home at 1536, 1280, 1024, 768 and 390: no text run under 4.5:1.
- Tab reaches each tile with its ring; hover and reduced motion behave as before.

## Build 2: the share page's art on light (LATER row 380)

- Add `data-surface="share"` to the `<main>` at `deck-share-view.tsx:483`, not to the private gate's.
- Add `:root:not(.dark) [data-surface="share"]` as **its own block** after the builder's, and its own entry in the fallback list. A combined selector would break `rule()` in `ambient-strength.test.ts`, which finds a block by its exact text.
- Start from the builder's values: crop 14 %, veil 50 / 20 / 65, `--ambient-credit` 90 %. No pane tokens. The gradient stays 4 %. Tune on the census, not on these numbers.

Look specifically for:

- a hard edge where a `--chrome` strip ends over the stronger art. The builder's search block drew one at 15 %, fixed there by a translucent pane tint. If the share page needs a tint, make it local to the share page and never opaque;
- the header band and the ambient layer showing the same picture: the band's edge mustn't read as a doubled image;
- the deck rows at reading density: names, quantities, prices, and the analytics blocks further down.

**Accept:**

- Census over the five crops and the user's deck at 1536, 1440, 768 and 390, at the top and scrolled into the list and the analytics: no text run under 4.5:1.
- In `ambient-strength.test.ts`: the share block's art floor and text bound computed like the builder's, the chip at 4.5:1 over a black thumbnail, and `:127-131` rewritten deliberately, since it pins that the share page has no `data-surface`. Never a dark `data-surface` rule.
- A side by side of before and after on Sauron and Giada, so the art is plainly recognizable to a person, not only by the math.
- A One Piece deck, Background art Off, no art, a blocked crop and the private gate paint what they did. The crossfade, reduced motion and the fallback media (R2's numbers back) work. Both credits stay visible, with the artist and © never cropped.
- The crop's request count, its priority and the route's caching don't change. CLS at 390 and 1440 equal to this session's baseline. No horizontal overflow.
- The baseline diff: dark share, light builder and light home unchanged beyond 2 levels.

## Build 3: real Safari

Use a local production build of the final code, `pnpm build` then `pnpm start`, in the first of these that's available:

1. **Desktop Safari through `safaridriver`**, if the owner enabled it. Plain W3C WebDriver over Node's `fetch`, no new dependency. Safari opens a separate automation window that can't see the owner's tabs or sign-ins. If it refuses with a remote automation message, Develop > Allow Remote Automation is the owner's switch too; ask, don't change it. Read `innerWidth` back after every resize.
2. **`iPad Pro 13-inch (M5)` in the Simulator.** Boot it, `attach`, and the owner answers the access prompt. Portrait is about 1032 wide, inside the wrap's band, and landscape about 1376, both past `lg`; read `innerWidth`. An unanswered grant fails the call: never route around it with `simctl`. It's the same engine as desktop Safari but not the same browser, so report it that way.
3. **Neither:** put a short checklist in the ship note for the owner's own look, and say plainly that desktop Safari remains unviewed.

Do the iPad as well if it's granted, since it's the only touch device that reaches the `lg` layout. At 1024, 1280, 1440, 1536 and 1920 (the widths a display allows), in both themes:

- **Home:** the stage has no box edge or mask seam, the wall ramp stays clear of the h1, the table sits at the card bases, the side cards' `rotateY` and shadows look right. No record shows WebKit rendering dark's `lg` stage either: every earlier Safari check was on the iPhone. Read the computed `mask-composite` on `.home-fan::before`: `add, intersect` on light from `lg`.
- **Tiles:** scrim, disc, arrow and filter, with one-line labels at the narrowest width. Repeat the label contrast sweep at 1024, 1280 and 1536.
- **Builder** (`/decks/new?game=mtg&from=the_hosts_of_mordor_ltc`): computed crop 0.14 on light and 0.08 on dark, the veil's gradient, the two pane tints, the credit chip.
- **Share page** (`/d/p_the_hosts_of_mordor_ltc`): the new values on light, unchanged on dark.
- **The fallback list:** `matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: no-preference)').matches` should be `true`, which proves an unknown first query doesn't kill the list. A browser with no such feature still honors the second query.
- **Errors:** try `safaridriver --bidi` for `log.entryAdded`, or listen for `securitypolicyviolation` and `error` after a client navigation. Say what couldn't be read.

Compare against Chromium at the same CSS width with a sheet for each pair. Sample the spots the record names: behind the h1, the wall in the first gap, the wall at the top, the table at the right. First read the page's ivory in the same screenshot: if a shot is color-managed away from `#F7F4EE`, treat its numbers as relative, and say so. Fix a defect here if it's CSS-local; anything larger gets a LATER row with the screenshot. Don't claim Safari matches beyond what was read.

## The owner's look: nothing ships

The concept differs from the live page in four places the owner's brief kept on purpose. Build one sheet: a live 1440 capture beside the same crop of `~/Documents/codex/Deckwarden/session-handoffs/LIGHT-MODE-DAYLIGHT/references/home-light-reference.png` (the concept is our 1440 × 960 render scaled by 1.0667, so scale it back). Ask one question at the end: keep them as recorded?

| Difference | Ours / the concept | What changing it would mean |
| --- | --- | --- |
| The Build bar | `#23483C`, a gold hairline, Geist / a darker fill, no hairline, a serif | Reopens the brief's fill and sans-serif interface, and `WAVE2.md:145`'s rule: titles are serif, controls and data are sans |
| The Magic painting | Top half 141,143,136 / 149,157,157 | A different picture: a new file from the owner, since a filter can't match it |
| The table beside the first card | 212,201,182 / 183,171,147 | A long cast shadow against the brief's "small contact shadows" |
| The page ivory | 247,244,238 / 250,247,241 | A global token mirrored in `tokens.ts`, moving every page's contrast budget for 3 levels |

A "change" answer becomes its own package, not an addition to this one.

## Must hold

- Repo rules: `.env.local` names the dev branch, scratch work targets a local server, no production database reads, no smoke against production. Tests reflect behavior, not repeated strings. No new dependency.
- Light's home and builder stay as LIGHT-MODE-DAYLIGHT shipped them. If a Safari fix has to touch them, say so with numbers.
- The two paintings, `public/home/hero-stage*.webp`, the daily commanders, real card images and every credit are unchanged.
- `HOME-ATMOSPHERE-session-summary.md` stays untracked and untouched. Stage explicit paths, never `git add -A`, and re-read shared docs first: another session may share this checkout.

## Traps already paid for

- Scryfall images differ between two runs of the same code (up to 3.7 %), so hide them in any pixel diff. Baseline: a detached worktree of current HEAD on `:3001`, removed afterward along with its launch entry.
- The harness's `localStorage` persists within one launch: a Background art Off run leaves later pages artless and reads as a product bug. Reset it per page.
- `tokens.test.ts` takes the first `@media (prefers-reduced-transparency: reduce)` in the file, so a new one must sit after the chrome's.
- Census false positives: a neighbor's shadow in a line box, sr-only text, rows under the phone tab bar, the dev overlay. Check any flag on a production build.
- `rm -rf .next` before `pnpm build` after dev. A dev reload loop means stale `.next/dev`.
- Dev's "Couldn't check combos" is the dev branch's stale feeds, not a UI fault.
- Long batches can outlast a foreground command's limit: run them in the background.

## Out of scope (LATER)

Share art on dark. Retuning the builder. New paintings. LATER rows 378 (native-size renders) and 379 (the trio's scale under the 5:7 split). Global palette tokens.

## Done

- `pnpm check` green (3,344 tests in 297 files at `d3d3645`, 0 lint errors, 6 warnings; recount), `pnpm build` green, `git diff --check` clean.
- Pushed to `main`. Vercel's "Vercel" commit status success on the full sha, CI green. Production read from outside, page views only: dark's tiles at 1024 and 390, the share page's computed crop on light (and 0.08 on dark), no console or CSP message.
- REDESIGN.md: a record with every before and after number and what amends R2 §3 again. LATER rows 380 and 381 closed with the `**DONE <date> (DAYLIGHT-LIMITS):**` prefix row 372 carries (a row's number is its line number, so never delete one), and any new row added. This file's ship note, committed with the code. A memory file and its index line.
- Sheets for dark's tiles, the share page and Safari sent to the owner, with a short summary. Say plainly which browser was actually read: desktop Safari, the iPad simulator, or neither.
- The servers, the worktree and any booted iPad stopped. The Safari session closed.

## Paste into a new session

```text
Read /Users/danielson/Documents/Claude/deckwarden/DAYLIGHT-LIMITS-session-prompt.md and carry it out in /Users/danielson/Documents/Claude/deckwarden. Fix dark's game tiles and raise the share page's commander art on light as it specifies, verify in real Safari as far as the access allows, and show me the sheet of differences from the concept. Follow the repo's instructions, run the required checks and the production build, then deploy through the existing GitHub/Vercel pipeline and verify the live result with page views only. Preserve unrelated work and the owner-supplied session summary.
```
