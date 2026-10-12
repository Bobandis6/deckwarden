# U1 session prompt — Controls recipe + edge token (D quiet rows with A's states, `--border-control`, inputs and selects on the edge, the 28 px Segmented, disabled with a reason, the destructive hover measured)

> **Status: not run yet.** Written 2026-10-12 with `WAVE5.md` (the planning session against `e766299`; the test-only fix that turned main green again is `e1bea8e`). Add a dated ship note at the top of this file when U1 ships, the way `Y1-session-prompt.md` did.

Pull latest, then run U1 — the first Wave-5 package. **`WAVE5.md` is the contract.** Read, in this order: Context's answers table (F1, F2, F11 and F16 are U1's); section A's rows on the edge token, the recipe and the radius truth; **D0** (the wave's rules) and **D1** in full (the recipe, the edge token's home, the destructive step, disabled with a reason, the Segmented, the measured acceptance); the U1 row of E's **pin matrix**; **G** (scope and the completion checklist); and section F's deferred table and annotations, which step 0 turns into `LATER.md` rows.

U1 is the smallest Wave-5 package and the one every other package inherits: `button.tsx` and `globals.css` feed every surface and every Wave-4 sheet. **No migration, no new route, no new dependency.** Its step 0 lands the Wave-5 contract in the build plan, CLAUDE.md, REDESIGN.md and LATER.md.

Pre-flight, in order.
1. **Main is green.** `pnpm check` = 2,154 tests / 203 files / the same 6 `no-unused-vars` warnings / 0 errors on the commit that landed `WAVE5.md`. If a test is red for a date reason again, the lesson in `WAVE5.md` Context applies (a wall-clock-judged fixture is written relative to `Date.now()`); fix it as its own commit first.
2. **Nightlies green** (`gh run list --workflow=nightly-ingest.yml --limit 3`). A red run is P4.7 branch F and preempts everything.
3. **A warm beta signal outranks a package.** Owner posted, feedback arrived, a stranger's 429, a new issue → run the `P2.9-session-prompt.md` round (Magic) or the `P4.7-session-prompt.md` round (One Piece) as its own session first. Ask the owner whether anything was posted.
4. **Ask for read-only database access once, at the start**, in plain words: `pnpm db:size` (286.5 MB at planning, alert 350) and the census (210 decks = 29 user, 16 account + 13 guest, + 181 precons; 1 user), nothing written. U1 itself writes nothing; its dev pass opens a precon draft, which is state-only (zero POSTs).
5. **Working tree clean** at or after the commit that landed `WAVE5.md` and this prompt (`git log --oneline -1 -- WAVE5.md`). Another session may share this working copy: stage explicit paths only, never `git add -A`; re-read `LATER.md`, `REDESIGN.md`, `deckwarden-build-plan.md`, `CLAUDE.md` and `MEMORY.md` immediately before editing them.
6. **State your baseline**: `pnpm check` as above, `pnpm db:size`, and save `pnpm build`'s route table; the diff at the end must be **empty**.
7. **The lab is a record.** Every number U1 needs is in `WAVE5.md` D1 and `DESIGN-LAB.md` D1, with the evidence under `.claude/design-lab/` (`GATES.md`, `boards/controls/contrast__1440__{dark,light}.json`, `lenses/shadcn.md`). Do not start the lab server. The contrast helper is Appendix B of `DESIGN-LAB-session-prompt.md` (alpha composited over the real ancestors); run it on dev, never on the lab.

## What U1 is NOT (scope fence)

- NOT the press scale, the four `linear()` curves, the `dw-*` keyframes, the drawer and toast durations, the menus' 250 ms, or the reduced-motion exception (U2). U1 keeps `active:not-aria-[haspopup]:translate-y-px` and `ease-out`; its transition list already names `translate` and `scale`, so U2 changes no list.
- NOT the type ladder or the Warden line's 13 px (U8).
- NOT any pane, page, phone layout, tile, copy string or primitive adoption (U3a onward, U9, U10a, U10b). The outline edge reaches the share page's visitor row, the hubs' action rows and the editor through the component alone.
- NOT a third ink token (F11: weight-only this wave), NOT a radius move (F1: the docs are amended to the shipped 12 / 9.6 / 16.8 px), NOT `shadcn add` (F18), NOT `--chrome` (U3b declares it).
- NOT a change to `--border` or `--input`: panels, dividers and the dark `bg-input/30` fills keep them. The edge token is for controls (Button outline, Input, Select, the Segmented's container).
- Anything else → `LATER.md` with a trigger.

## Facts you inherit (verified 2026-10-12 against `e766299` — re-grep lines, trust the shapes)

**`src/components/ui/button.tsx` today** (lines 6–55): the base string is Nova's inlined (`rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all … active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 …`); variants `default` (`bg-primary text-primary-foreground border-gold/70` + the color-mix hover, with the docblock on why the hairline is structural), `outline` (`border-border bg-background hover:bg-muted … dark:border-input dark:bg-input/30 dark:hover:bg-input/50`), `secondary`, `ghost` (`hover:bg-muted hover:text-foreground …`), `destructive` (`bg-destructive/10 text-destructive hover:bg-destructive/20 … dark:bg-destructive/20 dark:hover:bg-destructive/30`), `link` (`text-brand`); sizes `default h-8 px-2.5`, `xs h-6 rounded-[min(var(--radius-md),10px)] text-xs`, `sm h-7 rounded-[min(var(--radius-md),12px)] text-[0.8rem]`, `lg h-9`, `icon size-8`, `icon-xs size-6 rounded-[…10px]`, `icon-sm size-7 rounded-[…12px]`, `icon-lg size-9`, each with its `pointer-coarse:` rule and the dead `in-data-[slot=button-group]:rounded-lg` classes. `Button` spreads `ButtonPrimitive.Props` from `@base-ui/react/button`.

**The recipe to ship** is `WAVE5.md` D1's: the lab's direction D with A's states, as written in `.claude/worktrees/design-lab/src/components/lab/button-candidates.ts` (candidate `D`; the copy under `.claude/design-lab/lenses/` predates the `translate, scale` transition fix — use the worktree's), plus D1's ⊕ additions (the primary's `hover:border-gold/90 aria-expanded:border-gold/90`, the secondary's and link's expanded parity) and the destructive hover at `/15`. Verified in the lab: every candidate passes `button.test.tsx` as it stands.

**Pins** (`src/components/ui/button.test.tsx`): the default variant carries `border-gold/70` after the base and it survives `cn()` (lines 52–76); every text size keeps `pointer-coarse:min-h-11 pointer-coarse:min-w-11` and every icon size `pointer-coarse:size-11` (19–40). Nothing pins `transition-all`, `translate-y-px`, `rounded-lg`, `border-border` or `bg-background`. Call-site class pins that must stay green (they assert their own classes, not the recipe): `deck-text-view.test.tsx:171`, `search-pane.test.tsx:296`, `bracket-sheet.test.tsx:561`, `bracket-line.test.tsx:258` (the lab's list; re-grep `pointer-coarse:size-11` and `pointer-coarse:h-11` in tests).

**The edge token and where it may live.** `src/lib/theme/tokens.test.ts`'s `block()` (lines 18–29) reads the **first** `:root {` and `.dark {` blocks of `src/app/globals.css` and asserts them equal to `light` / `dark` in `src/lib/theme/tokens.ts` value for value, and every value must match `/^#[0-9a-f]{6}$/` (40–46); the accent-game case (48–54) shows the regex form for a later block (`expect(css).toMatch(/:root\s*\{\s*--accent-game: var\(--brand\);\s*\}/)`). In `globals.css` the token blocks are `:root` at ~94 and `.dark` at ~127; the accent rules (`:root { --accent-game }`, `[data-game=…]`, `[data-game] { --ring }`) at ~159–172; `@layer base` from ~174; the reduced-motion backstop ~210–219; `.pip` ~246. **The pair goes in a new `:root` / `.dark` pair after `[data-game] { --ring: … }` and before `@layer base`**, with a comment, exactly as the lab's stand-in: `--border-control: color-mix(in oklch, var(--foreground) 55%, transparent);` under `:root` and `… 40% …` under `.dark` (`.claude/worktrees/design-lab/src/app/lab/lab.css:10-15`, scoped there under `[data-lab]`). `tokens.ts` (exports `light`, `dark`, `og`, `ogAccent`, `radius`, `rgba` from line 27) gains `borderControl = { light: 55, dark: 40 }`, and `tokens.test.ts` gains one case asserting both declarations by regex. Tailwind reads it as `border-(--border-control)`.

**The measured numbers** (`DESIGN-LAB.md` D1; `GATES.md` "MEASURED" and "VERIFIED LIVE"): before, the outline edge at rest 1.48:1 dark / 1.28 light in today's recipe and A, C and B alike, 1.55 light in D — the recipe cannot fix it; the token measured live 3.49 (dark page) / 3.47 (dark card) / 3.35 (ivory) / 3.43 (light card); the computed cliffs: 35 % on dark = 2.99, 40 % on light = 2.28, so neither value can step down; `gold/70` as an edge = 4.63 / 4.44 dark but 1.80 / 1.90 light (why the gold hairline stays the primary's and not the outline's); D's ghost at rest `text-muted-foreground` = 8.58 dark / 5.98 light; the destructive label on hover 4.18 dark / 4.25 light in every recipe, today's included; all 40 size-strip buttons ≥ 44 px at 390 with touch.

**Consumers of the edge.** `src/components/ui/input.tsx:11` (`border border-input` → `border-(--border-control)`); `src/components/ui/select.tsx:43` (the trigger's `border border-input`, same change; the popup at `:84` is a panel and stays); `src/components/deck/segmented.tsx:92` (the container's `rounded-md border`). `Toggle` and `ToggleGroup` have an outline flavour (`ui/toggle.tsx:8`, `ui/toggle-group.tsx:45`) — adopt the token there too if a site renders them (grep call sites; the lab counted 0 for `Toggle`).

**Segmented** (`src/components/deck/segmented.tsx`): line 98 the thumb (`motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out`), line 107 the items (`text-muted-foreground hover:text-foreground h-auto min-w-0 rounded-none px-2 py-0.5 text-xs font-normal …`), lines 108–109 the touch rules. `segmented.test.tsx:46–61` asserts the `pointer-coarse` paddings only. D1: items `py-1 text-[0.8125rem]` (28 px like `sm`), the thumb 150 → 120 ms (`ease-out` stays until U2).

**Disabled with a reason.** D0 (WAVE2.md) promised "Disabled = visible, with the reason in `title`/hint"; `disabled:pointer-events-none` has kept the title from ever showing (shadcn F3). Base UI's Button takes a focusable-when-disabled prop (read the installed `node_modules/@base-ui/react/button/*.d.ts` for the exact name and the `aria-disabled` behaviour before writing a line). Call sites that pass a reason today: grep `disabled=` together with `title=` under `src/components` (the lab did not enumerate; the Suggestions "only cards I own" toggle with its "import a collection" hint, and the Retry buttons that wait out a 429 window in the autofill and Fit sheets are the likely ones). The on-touch rule: the reason must also exist as text near the control (no hover on a phone).

**Step 0's targets.** Build plan §6e ends before "## 7. Feature Additions" (`deckwarden-build-plan.md` ~283–307) — §6f goes after it, mirroring its table. CLAUDE.md's Session protocol lists the Rn, Wn, Xn and Yn lines. REDESIGN.md ends with "Y10 decisions and deviations" (~1056); the Wave-5 addendum goes after the Wave-4 one, as a new `## Addendum — Wave-5 supersessions (added <date>, U1 step 0)`. `LATER.md` is 204 rows on `e766299` (append from 205 after whatever is last, and cite the numbers you get). Rows this package annotates: 61, 72, 111, 60, 162, 165, 136, 166 (`WAVE5.md` F, "Rows this wave annotates").

## Verify-first list (never from memory)

1. **Reproduce the lab's edge numbers on dev before changing anything**: the helper over a share page's visitor row and the editor's outline buttons, both themes — expect about 1.49 dark and 1.28 light. After the token: ≥ 3:1 on the page and on a card in both themes. Record all four.
2. **The destructive hover after `/15`**: measure the label over the tint on the page and on a card in both themes; if any pair is under 4.5:1, step to `/10` and record the number and the step in the ship note.
3. **`tokens.test.ts` stays green with the third block** — the first-block regex must still land on the token blocks (the pair goes after `[data-game]`, never before the token blocks).
4. **Base UI's focusable-when-disabled**: read the installed d.ts; a disabled-with-reason button keeps hover and focus, shows its `title`, carries `aria-disabled="true"` and no native `disabled`; a disabled button with no reason is unchanged.
5. **Every `variant="outline"` site still reads** once the plate is gone (the hovered deck row's `bg-muted/60` shows through the bare line; that is D's intent). Grep `variant="outline"` and look at each in both themes.
6. **The 44 px strip**: the size strip's buttons at 390 with touch emulated (DevTools), all ≥ 44 px.
7. **`pnpm build`'s route table diff is empty.**
8. **Deploy verification** through `gh api repos/Bobandis6/deckwarden/commits/<full sha>/statuses` → context "Vercel". Then the prod pass in "Deployable outcome".

## Design decisions to make explicitly (disclose + pin each)

- **The destructive steps**: the hover tint goes down one notch at a time (light `/20` → `/15`, dark `/30` → `/20`, then lower) until the label measures ≥ 4.5:1 on page and card in both themes; if a hover tint would fall below its theme's rest tint (`/10` light, `/20` dark), the rest tint steps with it so hover stays the heavier state (the default); lifting the label is F16's other arm, not taken.
- **The reason's API**: `disabled` + `title` on a `Button` switches it to the focusable-when-disabled path (the default: no new prop); or a named `reason` prop. Pin whichever in `button.test.tsx`.
- **The on-touch hint's form**: a muted 12 px line beside the control rendered wherever a reason exists (the default — it helps mouse users too; `title` is the hover extra), or `pointer-coarse:` only. `FieldDescription` takes it over in U10a.
- **`lg`'s padding** `px-3.5` and `gap-2` (D's); keep unless the hero's button (U5) wants otherwise.
- **`Toggle` / `ToggleGroup`** on the token now (parity) or left to the package that first renders one.

## Deployable outcome

**Step 0 first, in its own commit** (`WAVE5.md` is already in the repo with its tracker — do not re-land it):
- Build plan §6f: the U-series table, mirroring §6e, one row per package in the recommended order (U1, U2, U8, U3a, U3b, U4a, U4b, U7a, U5, U6, U7b, U9, U10a, U10b) with "Deliverable" and "Done when", and a status line pointing at `WAVE5.md`'s tracker.
- One CLAUDE.md line under Session protocol: "Wave-5 packages (Un from `WAVE5.md`, build plan §6f) count as work packages under the same rules."
- A REDESIGN.md "Addendum — Wave-5 supersessions": F1 (§1 "8 px controls" → the shipped 12 / 9.6 / 16.8 px; Gate 6 states that one truth); F4 (§1 "eyebrow 12 uppercase tracking-wide (already the house style)" → list-group labels only; page sections are serif h2s); F7 (§1 Mechanics' motion policy → the four-slot 150 ms opacity exception inside the backstop, U2); F8 (§3 "opaque enough for predictable reading" → chrome may be a material where content scrolls under it, with solid fallbacks, U3b); F10 (§4 "buttons respond in about 120 ms" → the press is a scale with the hover color held, U2); and what U1 supersedes (the outline variant's `border-border bg-background`, the ghost's rest color, the `sm` label at 12.8 px, the per-size icon radii).
- `WAVE5.md` section F as `LATER.md` rows, appended at the end, each with its trigger; the annotations listed there (61, 72, 111, 60, 162, 165, 136, 166).

**Then U1**: `pnpm check` green and deployed.

Verified **on prod, signed out, zero creates**:
- The served CSS carries `--border-control` in both themes; a share page's visitor-row buttons and a hub's action row carry `border-(--border-control)`.
- The editor on a precon draft (`/decks/new?game=mtg&from=calling_all_angels_fdc`, state-only) shows the 28 px Segmented and 13 px `sm` labels.
- The route table diff is empty; `/c/[slug]`, `/l/[slug]` and `/cards/[id]` stay `●`; `/sets` and `/precons` stay `○`.

Verified **on dev**: the measured acceptance in `WAVE5.md` D1 (edges, labels, the destructive hover, the 44 px strip), both themes at 390 and 1440 on G's surfaces: the editor (a precon draft), a share page's visitor row, a hub's action row, home's game cards, `/cards`' filters, the Share dialog's buttons; a disabled-with-reason control showing its reason.

**Handed to the owner**: nothing signed-in is needed. One look on their phone at the editor's View / Group / Sort row (44 px on touch, one height) is welcome.

Tests: `button.test.tsx` gains `aria-busy`, `aria-disabled`, the outline edge, the ghost rest and the disabled-with-reason cases (the hairline and 44 px pins untouched); `segmented.test.tsx` gains the 13 px label; `tokens.test.ts` gains the edge pair; every call-site class pin green.

Docs in the same package: the `WAVE5.md` tracker ticked with the sha and any deviation beside it; a dated ship note at the top of this file; the `LATER.md` rows (step 0); memory updated; **`U2-session-prompt.md` written** the way this one was. `pnpm db:size` stated. Nothing posted, seeded or simulated.

## Session notes (environment)

- PATH per command: `export PATH="$HOME/.local/node22/bin:$HOME/.local/bin:$PATH"` (node, pnpm, gh). `psql` and `aws` are absent. Ad-hoc SQL runs through `pnpm exec tsx` on a file in `scripts/.tmp/` (gitignored but linted — delete it when done) or `pnpm exec tsx --eval`, inside one `read only` transaction.
- `.env.local`'s `DATABASE_URL` is prod's pooler; dev shares prod's database. `source .env.local` fails in zsh; scripts load it with dotenv.
- Dev server: `preview_start {name: "dev-log"}` after `lsof -nP -iTCP:3000 -sTCP:LISTEN` (a server on 3000 is reused). Stop it before `pnpm build` — they share `.next`. `next dev` re-adds the AGENTS.md block; commit it with your work.
- The browser pane is signed out on prod and on localhost. A hidden pane pauses rAF, stalls Base UI transitions and doesn't hydrate a tab until painted: verify menus and dialogs through the DOM or in jsdom. Contrast is measured with the helper through `evaluate_script`, not by eye.
- `react-hooks/refs` and `react-hooks/set-state-in-effect` are lint errors in this tree.
- Four source files hold a literal NUL byte; use `grep -a`. Prettier reflows scripted-edit anchors after `pnpm format` — assert anchors, re-grep; `*.md` is prettier-ignored.
- Prod: curls need `--compressed`; ISR pages lag a deploy by up to an hour; the deck-create budget is 10 an hour and 30 a day per IP, and U1 creates no prod decks.

## Context, not tasks

- Sequence after U1: U2 motion tokens → U8 type ladder → U3a deck pane bones → U3b deck pane materials → U4a phone Deck tab → U4b phone sheet + Tools strip (**owner review: the editor**) → U7a indexes + tiles → U5 home B → U6 share B (**owner review: the public surfaces**) → U7b hubs + long lists → U9 copy policy → U10a form primitives → U10b stepper + Chip.
- The owner's 22 answers of 2026-10-12 stand (`WAVE5.md`, Context). The defaults in `WAVE5.md` section F are open until the owner says otherwise.
- P2.9's and P4.7's standing triggers still exist beside the U-series and get their own round, never a slice of a U-session. The r/EDH post is still unposted; P2.9 round 3 is armed for it.
- The site is unannounced. The cold-start rule holds. Premium never gates card data.
- The Wave-4 sheets (Swap, Fit, Games) inherit U1's recipe and U2's tokens; they get no package of their own unless a dependency surfaces.
- The lab branch `design-lab` (worktree `.claude/worktrees/design-lab`, `395179d`) is a record: read it, never commit to it, rebase it, push it or delete it.
