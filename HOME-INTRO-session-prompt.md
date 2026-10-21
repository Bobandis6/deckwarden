# HOME-INTRO session prompt — the home intro, once per visit

*Status: not run yet.* Written 2026-10-21 by the DECKCHECK-STUDY session (`DECKCHECK-STUDY.md` §2.1 is the evidence; its raw files are under `.claude/deckcheck-study-evidence/`, gitignored), every anchor below re-grepped against `1e1576b`. Add a dated ship note at the top of this file when the package ships.

The owner asked for a home-page intro that plays **once per visit, not on every return to home**. The study measured deckwarden's home, prototyped the three gate candidates on a local production build, and chose the pre-paint script. This package builds it. It is S: one inline script in the root layout, one data attribute on the hero `<section>`, one stylesheet rule, one pure module with its tests. **No migration, no route, no dependency, no URL, no cookie, no string a visitor reads.**

Pre-flight, in order.
1. **Main is green.** `pnpm check` = 2,734 tests / 264 files / the same 6 `no-unused-vars` warnings on `1e1576b` (and on the study's docs commit after it).
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml --limit 3`).
3. **A warm beta signal outranks a package** (P2.9 / P4.7 rounds keep their priority).
4. **Working tree clean.** Another session may share this working copy: stage explicit paths only; re-read `LATER.md` and `MEMORY.md` immediately before editing them.
5. **Baseline before any edit**, on a production build (`pnpm build && pnpm start`, never dev; `.claude/launch.json` has a `start` entry), in Chrome for Testing through the chrome-devtools MCP: save `pnpm build`'s route table (74 app-path entries at `1e1576b`; the diff at the end must be empty); re-run the replay matrix below with today's page (all rows read 0 hero animations today); and one throttled trace per width (4x CPU, Fast 4G, cache bypassed) to set this run's noise band beside the study's numbers.

**The contract this amends.** `WAVE5.md` D6 ("Motion: the 2 px lift on shelf cards and tiles over 120 ms on `settle-120`; no entry animation") and `DESIGN-LAB.md` D4's motion plan ("no entry animation on load (nothing on a page load communicates hierarchy here)") both rule an intro out. The owner's request of 2026-10-20 overrides them for this one moment; the package adds a dated amendment line under D6 (as the 2026-10-17 fan rotation did) and a REDESIGN.md decisions entry, and changes nothing else D6 says. The taste read (design-taste-frontend §11, preserve mode): home's motion today reads about 2 on the skill's 1 to 10 dial (hover lifts only); preserve allows one step, and a 460 ms, once-per-visit settle of the headline and the sentence is that step. Its one-sentence purpose is hierarchy: the headline lands first, the sentence after it, the actions are already still. Deckcheck's 3.2 s choreography reads about 8, which is why it is the thing not to copy.

## What this package is NOT (scope fence)

- NOT a fan motion. The fan cards do not animate (the decision and its evidence are below); LATER row for a decode-gated fan motion.
- NOT a per-word H1 reveal. The H1 element is pinned byte for byte (`src/app/(site)/page.test.tsx:172`, `scripts/seo-smoke.ts:520`) and the font-swap reflow fix (U5, `ec3caf8`) relies on the H1's per-tier `max-width`; word spans would move both. LATER row.
- NOT the buttons. "Build a deck" and "Browse commanders" never move and are usable from the first frame.
- NOT CardImage's lazy fade (it re-runs on every client return to home today: 23 opacity transitions at 390; that is LATER row 246's territory, not this package's).
- NOT `cacheComponents`. It is off (`next.config.ts`), so a client navigation unmounts the home tree. If it is ever switched on, Next keeps up to three routes in `<Activity>` (`display: none`), and a CSS animation restarts when an element goes from `display: none` to shown: this gate still holds (the attribute is gone by then), but re-run the client-return row.
- Anything else → `LATER.md` with a trigger.

## The measured baseline (the study, 2026-10-21 UTC, `1e1576b`)

Chrome for Testing 155.0.8059.84; local = `pnpm build && pnpm start` against the Neon `dev` branch; dark, signed out; the day's fan Loran (center), Lotho (left), Mondrak (right).

- **Animations today:** the hero runs 0 animations on first load, client return (hero "Browse commanders" → the header wordmark), reload, back, and reduced motion, at 1440×900×1 and 390×844×3 touch. The page is not: a client return re-runs CardImage's lazy fade on every shelf, rail and tile image (23 `transitionrun` at both widths; at 390, 23 running CSSTransitions at the moment the fan reappears), and under reduced motion the 0.01 ms backstop (`globals.css:438`) turns every style change into a `transitionrun`. **So every check in this package counts the hero only**: `document.querySelector('[data-slot="home-hero"]').getAnimations({ subtree: true })`, never `document.getAnimations()`.
- **Back is a fresh load.** Home answers `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (force-dynamic), so Chrome never restores it from the back/forward cache: `notRestoredReasons` = `masked`, `response-cache-control-no-store`, `response-cache-control-no-store-with-js-network-request`; `navType` `back_forward`, `pageshow.persisted` false. A module-level flag dies with the document; `sessionStorage` survives it.
- **Client return refetches and remounts:** `GET /?_rsc=…`, the fan back 411 ms after the wordmark click (1440, unthrottled).
- **LCP**: 1440 = a turned fan card (72,632 px²; the H1 is an earlier candidate at FCP), 390 = the H1 (45,276 px² local, 40,302 on prod). Local, 4x CPU + Fast 4G, cache bypassed: 1440 LCP 1,083 / 1,067 ms (FCP 1,028 / 976), 390 939 / 829 ms. Prod (`1e1576b`), same throttle: 1440 cold 2,734 ms (the first hit's HTML arrived late: load delay 1,511 ms) and 1,700 ms, warm 512 ms; 390 cold 1,040 / 728 ms. LATER row 249 had 1,924 / 2,036 cold, 720 warm.
- **On a cold cache the fan images arrive 500 to 740 ms after the H1 paints** (prod 1440: H1 at 1,028 and 1,876 ms, the center card at 1,528 and 2,612). The intro plays on a tab's first load, which is usually a cold cache: any fan motion that starts at first paint runs on empty, shadowed card boxes.
- **CLS** 0.00 at both widths; the only entry is a 0.00002 nudge of the desktop nav (`nav.hidden`, x 510 → 520) when Geist lands.
- **Pre-paint precedent:** next-themes' inline script is the first child of `<body>` in the server HTML (byte 4,079; `<header>` at 4,613, `<main>` at 12,220). The CSP allows inline scripts (`script-src 'self' 'unsafe-inline'`, `next.config.ts:97`, pinned verbatim at `src/lib/next-config.test.ts:20` and `:119`). No motion library in the bundle (0 of 57 chunks).

## The gate: (b), a pre-paint script — decided with evidence

Prototyped on a local production build (throwaway, never committed; the diff is `.claude/deckcheck-study-evidence/prototype/prototype.diff`), measured at 1440 with 4x CPU through a per-frame sampler (computed `opacity` / `transform` of the H1, the lede and a side card every animation frame from document start) and trace filmstrips.

- **(a) `useSyncExternalStore` with a "play" server snapshot (the `leader-pick-intent.ts` shape): rejected.** First load plays. But on a reload (flag set) the server HTML still says play, so the intro starts at first paint and hydration cuts it: the sampler shows the H1 at opacity 0.775 and 6.6 px low at 714 ms, then opacity 1 and no transform at 765 ms, one frame later; the filmstrip frame at 608 ms shows the dimmed, lowered hero that the no-intro control (frame at 899 ms) never shows. Back is a fresh load (above), so it replays the same way. Every repeat visit gets a partial intro and a snap.
- **(c) a session cookie the server reads: rejected without a prototype**, on the matrix itself: a session cookie is shared by every tab of the browser session, so "new tab = play" fails; it rides on every request; the privacy page would have to list it.
- **(b) a pre-paint inline script that sets `data-intro="play"` on `<html>` before the hero is parsed: chosen.** First load: the hero's first painted frame is already the intro's from-state (no final-state-then-reset flash). Reload: opacity 1 and no transform from the first sampled frame, 0 intro animations. Client return: 0 hero animations, the H1 at opacity 1 on every frame (the attribute was removed when the intro ended). The server HTML of the page is unchanged except one attribute on the hero `<section>`; the fan's markup and `fanAndShelf`'s pins are untouched.

**Where the script lives: the root layout, not the page.** React 19.2 creates any `<script>` a client render inserts as an inert copy and, in development, logs "Encountered a script tag while rendering React component" (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js`). A script in `page.tsx` would be inserted by every client return (inert, and a dev console error); the root layout is never re-created by a client navigation, so its script runs exactly once per document, during parsing, before `<header>` and `<main>`. Put it as the first child of `<body>` (`src/app/layout.tsx:75`), before `<SkipLink />` (`:84`); `layout.test.tsx` pins only that Skip to content is the first FOCUSABLE, which a script is not. `<html>` already carries `suppressHydrationWarning` (`:72`), so the attribute the script sets before hydration is accepted, as next-themes' class is.

**The script's logic is a pure module** (`src/lib/home/intro-gate.ts`, the `parsePickIntent` discipline): `introDecision({ pathname, stored, reducedMotion }): "play" | "skip"` fed the raw `sessionStorage` string. The inline script is that function's source serialized into the page (next-themes' `script.toString()` pattern), so the test exercises the same code that ships. Rules:

- `pathname !== "/"` → skip (the script is in the root layout and runs on every document; it does nothing off home).
- `reducedMotion` (`matchMedia("(prefers-reduced-motion: reduce)")`) → skip.
- `stored` is the current marker (key `deckwarden:intro`, value `"1"`) → skip; anything else (absent, a stale value) → play.
- Storage throws (disabled storage) → skip: an intro the tab cannot remember would replay on every load, which is the thing the owner asked to avoid.
- On play: write the marker FIRST, then set `data-intro="play"` on `document.documentElement`.

**Clearing the attribute** so a client return never replays: remove `data-intro` when the hero's intro animations have finished (an `animationend` listener on `document` for the last one, by name), with a fallback that, from the first frame after `DOMContentLoaded`, polls every 250 ms and removes the attribute once no `dw-intro`/hero animation is running (the prototype's shape; at 4x CPU the animations sat pending from first paint until the main thread freed, about 120 to 220 ms, so a fixed timeout from script time can cut them). Removing the attribute after the end changes nothing on screen: the keyframes end at the elements' own styles.

## The choreography (U2's tokens only; transform and opacity only)

Reuse U2's `dw-in` keyframes (`globals.css:96`, the `--dw-*` parameters registered at `:216`, not inherited) through one hand-written rule in `@layer components`, beside `.home-fan` (`:725`), under `@media (prefers-reduced-motion: no-preference)` and keyed on `:root[data-intro="play"] [data-slot="home-hero"]`:

| Element | Duration | Delay | Curve | From |
|---|---|---|---|---|
| H1 (`[data-slot="home-hero"] h1`) | 400 ms | 0 | `--ease-settle-400` (U2's one-off slot) | `--dw-opacity: 0.5`, `--dw-y: 0.3em` |
| Lede (`h1 + p`) | 400 ms | 60 ms | `--ease-settle-400` | `--dw-opacity: 0.5`, `--dw-y: 0.3em` |
| Buttons | none | — | — | — |
| Fan cards | none | — | — | — |

The whole intro ends at 460 ms (the 1.2 s ceiling is the outer bound, not a target). One attribute on the hero `<section>`: `data-slot="home-hero"` (`src/app/(site)/page.tsx:81`); the H1's class and text are not touched (`page.test.tsx:172`).

Why these values, each measured or reasoned from the study:
- **No blur on the H1.** The prototype's 6 px blur variant composited (no composite-failed reason in its trace) and cost nothing measurable on this Mac's GPU, but the from-state freezes while hydration holds the main thread (pending from 800 to 958 ms at 4x CPU in the trace), so a blurred LCP headline would sit unreadable for that window at 390. U2's rule (transform and opacity only; `dw-in` replaced tw-animate because it animates `filter`) agrees.
- **The H1 never starts at opacity 0.** At 390 it is the LCP element; with the prototype's 0.35 from-opacity the trace still put LCP on the H1 at FCP (45,276 px², 624 ms against the control's 1,023, run noise), because text painted at nonzero opacity is visible. 0.5 keeps the frozen pending frame legible.
- **The fan does not move.** The prototype's uniform 0.75 rem rise kept every artist and © strip clear (0 of 124 sampled points covered on each card at 0, 100, 200, 300 and 400 ms of the motion, `elementFromPoint` mapped through each card's translate, rotate and the animated transform; the same sampler finds 45 of 124 covered on each side card with the drop at 0, so it can see coverage) and left LCP on the turned card. It is left out anyway: the intro plays on a tab's first load, usually a cold cache, where the fan's images land 500 to 740 ms after first paint, after a 460 ms intro has ended. A decode-gated fan motion is a LATER row.
- **No rotation or scale on anything in the fan, ever** (for the LATER row): a turned card's bounding box (238 × 305) is what makes it the LCP element at 1440; a rotation from 0 would change the LCP element on a warm load, and a "deal from the stack" would pass the side cards behind the center card and cover their strips mid-motion.
- **Nothing blocks input.** Keyframes are fine here (nothing can grab the intro mid-flight); the buttons are not animated. No `pointer-events`, `inert` or focus change during the intro, nothing announced to assistive technology, and Skip to content stays the first focusable (the Vercel web-interface-guidelines pass over this spec, 2026-10-21: motion respects reduced motion, compositor-only properties, no `transition: all`, far under the 5 s autoplay limit; this line is its one addition).

## The replay matrix = the test list

Every row read as the hero's intro animations (`[data-slot="home-hero"]` `getAnimations({ subtree: true })` filtered to `dw-in`) and the `data-intro` attribute, on a production build at 1440×900×1 and 390×844×3 touch:

| Path | Expected | Today (study) |
|---|---|---|
| First load of `/` in a fresh tab | play (2 animations; `data-intro="play"` during, gone after) | 0 |
| Client return (hero "Browse commanders", then the header wordmark) | 0; H1 opacity 1 on every sampled frame | 0 |
| Reload | 0 from the first frame | 0 |
| Back after a full navigation away (a fresh load: home is never bfcache-restored) | 0 | 0 |
| A new tab opened by hand (fresh `sessionStorage`) | play | 0 |
| Duplicate tab (Chrome copies `sessionStorage`) | 0 (record, do not fight it) | 0 |
| First document is another page, then a client navigation to `/` | 0 (the intro is a landing moment of a document load of home) | 0 |
| Reduced motion (the emulator's switch), any path | 0, no attribute set | 0 |
| Storage disabled (`sessionStorage` throws) | 0, no attribute set | 0 |

Unit tests (vitest): `introDecision` over raw strings (`null`, `""`, `"1"`, a stale value, a throw), the three pathnames (`/`, `/commanders`, `/?x=1` reads its `pathname` only), reduced motion; the serialized script contains the function's source; `layout.test.tsx` gains "the intro script is in `<body>` before Skip to content and Skip to content is still the first focusable"; a CSS pin (read `globals.css` the way `tokens.test.ts` does) that the rule is inside `prefers-reduced-motion: no-preference`, keyed on `:root[data-intro="play"]`, names `dw-in`, `400ms` and `--ease-settle-400`, and that no keyframe the rule uses animates anything but `opacity` and `transform`. Mutation checks, each red: the marker written after the attribute, the pathname check dropped, the reduced-motion check dropped, the attribute never removed (the client-return row), the rule outside the media query.

## External check (the package's acceptance)

On the production build, before and after: LCP element unchanged at both widths (the turned card at 1440, the H1 at 390) and its time within this run's noise band; CLS unchanged (0.00; the nav nudge only); the matrix above; reduced motion 0; the strips' `elementFromPoint` check stays 0 covered (the fan does not move, so it is the U5 check at rest); Lighthouse (navigation, mobile and desktop) on the same build; `pnpm check`; the route table unchanged; `smoke:seo` and `smoke:engagement` green on dev (the H1 string, the home pins). After the deploy: the same matrix on production in a fresh isolated context, signed out, zero creates, and the console clean of CSP violations beyond the two known eval probes (`csp-enforcing-live`).

## LATER rows this package opens or touches

- Opens: **a decode-gated fan motion** (trigger: the fan's images served from a host fast enough that a first visit paints them within 100 ms of the H1, e.g. row 249's lever, or the owner asks again after seeing the text-only intro); **a per-word H1 reveal** (trigger: the H1 pins move for another reason and the two-face wrap check is re-run with word spans).
- Touches: row 249 (the fan's cold LCP; the intro must not regress it), row 246 (lazy cards and their fade; the client-return confound above), row 251 (font-swap reflow; the intro leaves the H1's widths alone), row 285 (a nonce CSP would need this script to carry the nonce, as next-themes' would). Row 230 is closed (U5) and stays closed.

## Session notes

- The measuring browser is Chrome for Testing through the chrome-devtools MCP. Do not select, read or script any page in it but your own build's (the owner sometimes keeps other sites open there).
- `navigate_page`'s `initScript` runs before the document's own scripts; `document.documentElement` may not exist yet when it runs (observe attributes later, or sample from `requestAnimationFrame`). `performance_start_trace` with `reload: true` reloads WITHOUT the init script: clear the marker with `evaluate_script` first to trace a first load.
- Trace filmstrips are `Screenshot` events (base64 JPEG, 498 × 312) in the saved `.json.gz`; the study's `parse.py` extracts them.
- Never `cd`; helpers as `*.js.txt` (eslint lints `.js` under `.claude/`).
