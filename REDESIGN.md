# Deckwarden — Redesign Plan (R-series)

**Status:** R5a shipped 2026-09-10 (progress tracker below); R5b is next. This file is the contract for the R-series work packages.
**Saved:** September 5, 2026 (as `MASTER-REDESIGN.md` in the codex folder). **Revised:** September 8, 2026 against commit `d4c21e5` (HEAD). P4.5 and P4.6 shipped between the first review (`3456927`) and this revision; both were game-parity and copy work, so the visual baseline is otherwise unchanged.
**Canonical copy:** `REDESIGN.md` in the repo root (this file). The codex copy is a snapshot with a pointer.
**Start condition:** the first R-package begins after P4.7 (the state-gated beta-response session whose prompt is at HEAD) has reported. P4.2, P4.4, P4.6, and P4.7 each carry a "NOT a home / editor redesign" fence; those fences are per-session, and the R-packages are the sanctioned vehicle for exactly that work.
**Working rules:** the CLAUDE.md session protocol applies unchanged — one package per session, deployed and `pnpm check`-green or not done, anything out of scope to `LATER.md` with a trigger. Build plan §6b lists the packages.

## 0. What changed in this revision

Decisions recorded 2026-09-08:

1. **One Piece ambient art is off until Bandai answers** the permission email. The mechanism is a per-adapter capability flag, so flipping OP on later is a one-line change. Magic ships art_crop with artist credit; One Piece gets an equal-weight color-identity gradient.
2. **The contract lives in the repo** (`REDESIGN.md`) with a build-plan §6b addendum and one line in CLAUDE.md. The codex copy is a snapshot.
3. **Sequence is R1a → R1b → R3 → R2 → R5a → R5b → R4 → R6**: foundation and shell first, the keyboard builder next, artwork on a settled surface, public pages, the never-promised phone builder last, a polish and accessibility pass to close.
4. **Fun ceiling is playful but restrained**: no confetti, sounds, or streaks. ⌘K, card-stack grids, and multi-step undo go to `LATER.md` with triggers when their package ships.

Corrections against the current code (details in §2 and §3):

- No site header or nav component exists; every page hand-rolls a `← Deckwarden` link and "My decks" has no global entry.
- No persisted leader order exists; partner order is entry insertion order.
- Only two UI primitives exist (`button.tsx` and a hand-rolled `modal.tsx` without a focus trap). Base UI is installed but only Button is used.
- Icons are Unicode glyphs; `lucide-react` is installed and unused.
- Dark tokens exist but nothing activates them; the OG image palette and the logo are disconnected from the site tokens.
- The One Piece cost chip (`.don-cost`) has no CSS rule, and One Piece decks get no tool-pane tabs.
- The Magic art mechanism is OG-only and returns base64 for satori; an in-app resolver is new work.
- The builder has exactly one breakpoint (`lg`, 1024 px). "1200 px" in the earlier draft is not a Tailwind breakpoint and becomes a custom `wide:` variant.
- The home hero string is pinned by `scripts/seo-smoke.ts`.

Additions: a measured token table with light-mode pairs (§1), a motion policy (§1), a polish catalog of 38 numbered items with package and cost (§4), and smoke-pin and LATER-row ledgers (§6).

## 1. Direction and visual foundation

Make Deckwarden feel like a polished place to enjoy building decks while preserving its fast, keyboard-first workflow.

Selected direction (unchanged): dark, art-led styling · a familiar desktop builder with better organization · equal visibility for Magic and One Piece · faint leader artwork in the builder and deck headers · subtle, satisfying interactions · phone navigation through Deck / Search / Tools tabs.

### Design concepts

| Concept | Appearance | Distinctive treatment | Tradeoff |
|---|---|---|---|
| **Warden Studio — selected** | Charcoal surfaces, indigo branding, restrained game accents | Faint commander artwork behind a focused three-pane workspace | Strongest fit for long building sessions |
| Midnight Gallery | Deep blue backgrounds, larger artwork, spacious headings | Decks and leaders presented as collectible gallery pieces | More browsing appeal, less information visible at once |
| Tabletop Atelier | Warm graphite, ivory text, muted brass details | Panels suggest a tidy tabletop with softly raised cards | Warmer personality, more texture to manage |

Implement **Warden Studio**. Borrow Midnight Gallery's deck presentation for browsing (the deck tiles in §2). The other concepts stay documented alternatives, not maintained themes.

### Tokens (WCAG contrast measured 2026-09-08)

| Token | Dark (default) | Light | Notes |
|---|---|---|---|
| background / panel / raised | `#101218` / `#191D27` / `#222837` | `#F7F7FB` / `#FFFFFF` / `#FFFFFF` | values from the first draft kept |
| text / secondary | `#F3F4F8` (17.0:1) / `#AAB2C3` (8.8:1 on background, 6.9:1 on raised) | `#1B1D26` (15.7:1) / `#5F6775` (5.7:1) | AA everywhere |
| brand (indigo, from `src/app/icon.svg`) | text and links `#818CF8` (6.3:1); filled buttons `#4F46E5` with white text (6.3:1) | text `#4338CA` (7.9:1); buttons `#4F46E5` with white text | `#6366F1` as text on dark fails (4.2:1) — do not use it for text |
| Magic accent | `#B5A2FF` (8.5:1; 6.7:1 on raised) | `#5B50D6` (5.9:1 on white; 5.5:1 on off-white) | the first draft's lavender fails on white (2.2:1) |
| One Piece accent | `#62D6C5` (10.7:1; 8.4:1 on raised) | `#0F766E` (5.5:1; 5.1:1 on off-white) | the first draft's teal fails on white (1.8:1) |
| OG accent | the game accent of the unfurled surface; generic pages `#A5B4FC` | — | replaces the disconnected violet `#8b5cf6` in `src/lib/og/elements.tsx` |
| mana `--mana-*` | unchanged in both themes | unchanged | pips keep their meaning; game accents identify context, never card data |
| DON!! cost `.don-cost` | rounded-square chip, `background: var(--foreground)`, `color: var(--background)`, bold tabular digits | same | the rule is missing today; `src/lib/games/optcg/adapter.ts` already emits the class |

Notes:

- The brand is the indigo already in `src/app/icon.svg` (shield `#4338CA`, art block `#6366F1`). The mark is never rendered in the app today; R1b puts it in the header.
- The OG images (`src/lib/og/elements.tsx`) hard-code a violet accent on `#101215`; they move to the shared tokens so unfurls and the site read as one product. One Piece unfurls stay artless (P4.6 decision 2).
- Typography stays Geist and Geist Mono; the scale gets explicit steps: page title 30/36 semibold, section 18 semibold, eyebrow 12 uppercase tracking-wide (already the house style), body 14, meta 12. `tabular-nums` on every count.
- Shape: 12 px panel corners (`--radius: 0.75rem`), 8 px controls, restrained shadows. The dark theme relies on borders more than shadows.

### Mechanics

- **Theme.** `:root` stays the light block and `.dark` the dark block, matching `@custom-variant dark (&:is(.dark *))` in `src/app/globals.css`. Add `next-themes` (about 1 kB, no host tie) with `defaultTheme="dark"`, `enableSystem`, `enableColorScheme`, and `suppressHydrationWarning` on `<html>`: dark by default, Light and System available, no flash. This fires `LATER.md` row 47.
- **Game accent.** `data-game="mtg" | "optcg"` on surface roots (editor root, share-page main, hubs, card pages) sets `--accent-game`. A single rule `[data-game] { --ring: var(--accent-game) }` makes every Button's `focus-visible:ring-ring/50` pick it up with no component churn. Active tabs, selected rows, the leader-zone ring, and the completion ring use `--accent-game`.
- **One token source.** `src/lib/theme/tokens.ts` (new) exports the hex values for satori and the CSS values; a vitest parses `globals.css` and asserts equality, because CSS cannot import TypeScript.
- **Motion policy.** Every decorative animation is written `motion-safe:`. R1a adds a global `@media (prefers-reduced-motion: reduce)` block that zeroes `animate-in` / `animate-out` and transition durations (`tw-animate-css` 1.4 ships none; the shadcn block covers only `.shimmer`). Durations: 120 ms for controls, 250 ms for crossfades, at most 400 ms for one-off moments. Everything stays understandable without motion.
- **Icons.** `lucide-react` replaces the Unicode chrome glyphs (← → ↗ ✕ × ✓ ▲ ▼ 📁). Keep `♥` / `♡` as *content* in the like rail: `scripts/engagement-smoke.ts` pins `♥` in the home HTML.
- **Breakpoints.** Tailwind 4.3 defaults (sm 640 / md 768 / lg 1024 / xl 1280) plus `--breakpoint-wide: 75rem` (1200 px) for a `wide:` variant, honoring the chosen three-pane threshold.
- **Primitives.** Installed via `shadcn add` (style `base-nova` is already configured in `components.json`; the CLI will create the missing `src/hooks`). Base UI 1.7.0 ships every needed subpath: dialog, alert-dialog, menu, tabs with indicator, tooltip, toast, collapsible, preview-card, scroll-area, toggle-group, popover, select, navigation-menu, avatar, meter, progress, and **drawer** (swipe, snap points, `DrawerVirtualKeyboardProvider`). `Modal` stays as a thin wrapper over Dialog so its six call sites do not change; its `wide` flag becomes a size prop; the account deletion dialog moves to AlertDialog.
- **Containers.** Three widths — reading `42rem`, browse `64rem`, wide `80rem` — replace today's spread of `max-w-2xl` / `3xl` / `5xl` / `6xl`.

## 2. The redesigned experience

### Site shell and homepage

Today `src/app/layout.tsx` renders children plus `SiteFooter`. There is no header or nav; "My decks" has no global entry; the only game switching is the `/cards` pills and the `/decks/new` picker.

Header spec:

- A `(site)` route group holds every page except `decks/[id]/edit` and `decks/new` (URLs unchanged). Its layout renders `SiteHeader`: the shield mark (inline SVG from `icon.svg`) linking home · Build · Browse (Commanders, Leaders, Cards) · My decks · account avatar or Sign in · appearance menu (Dark / Light / System now, Background art after R2). On phones the links collapse into a Base UI Menu.
- The editor keeps its own workspace header (mark plus deck controls). The new-deck chooser renders `SiteHeader` itself above the picker.
- The account slot is a client component using the existing Better Auth client (`src/lib/auth-client.ts`, as `SignOutButton` does). **Never read `headers()` or cookies in a layout**: `/c/`, `/l/`, and `/cards/[id]` revalidate hourly and would go dynamic.
- Browse pages get a contextual game switch (Magic · One Piece) above their filters; `/cards` keeps its pills.
- Delete the per-page `← Deckwarden` links; keep contextual back links such as `← Commanders`.
- "My decks" leads to `/account` for signed-in users and to the browser's guest-deck section on home for guests. Routes and guest access are unchanged.

Homepage order:

1. A shorter introduction: **"Your next great deck starts here."** This replaces the pinned "Build a legal deck, fast." — update `scripts/seo-smoke.ts` in the same commit, and keep the literal `/leaders` and `/cards?game=optcg` links the same smoke checks.
2. Equally prominent Magic and One Piece cards, each with Build and Browse actions and a shelf of real leader cards: Magic's top commanders by `edhrec_rank` (`loadLeaderIndex` in `src/lib/hub/queries.ts` gains a limit and a batched default-printing lookup), One Piece leaders with recent Top finishes (a new query over the tournament-standings index). When One Piece has no finishes the card shows names, color chips, and life with **no shelf label and no invented popularity** (cold-start rule). One Piece shelf *images* wait for the `img.deckwarden.gg` flip (`LATER.md` row 51).
3. Continue building: the visitor's own decks as tiles (guest claim tokens or account).
4. Recent public decks as tiles with leader imagery and a color-identity strip.
5. A brief capabilities strip (validation, combos, share pages, sample hands, tournament finishes), copy only for features that have shipped.

Home stays `force-dynamic`; the budget is at most three extra indexed queries.

### Desktop builder

Keep search on the left, the deck in the center, and inspection tools on the right. Today the grid is `lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)_minmax(16rem,22rem)]` in `src/components/editor/deck-editor.tsx`, `lg` is the only breakpoint, and the site footer renders below the editor.

```text
Mark  /  Game · Format   Deck name          Save status   Share   More
──────────────────────────────────────────────────────────────────────
Search cards            Deck summary + ring          Card / Suggestions
Search results          Commander / Leader           Combos / Cuts
                        View · Group · Sort
                        Grouped deck list            Active tool
                        Analytics / Sample hand
──────────────────────────────────────────────────────────────────────
        Faint leader artwork (or color gradient) behind the workspace
```

**Header.** Mark linking home · game/format chip (sets `data-game`) · deck name · save status in a fixed-width slot so nothing shifts · **Share** as the primary action once a server row exists · **More** menu holding Details, Import, Export, History · save failure and Retry stay visible outside menus. No guest claim nudge is added here (`LATER.md` row 62 stays trigger-gated).

**Search.**

- Preserve `/`, arrow keys (wrapping), Enter, Ctrl/Cmd+Enter, Escape, and the `4 Name` quantity prefix (`parseQuickAdd` in `src/lib/decks/editor-state.ts`).
- Explicit states: idle · typing · searching · results · no matches · failed. Today "No cards match" renders while the request is still in flight and the status line never clears; both are fixed. Failed reads "Search failed — check your connection." with a Retry.
- Tiny full-card thumbnails, never cropped, so no attribution question. The `image` field is already on the wire. Magic uses the `small` rendition now; One Piece after row 51 (`thumbnailUrl()` returns null for non-Scryfall URLs until then).
- Add and Commander / Leader actions are visible on the **active row** and on touch. Rows form a listbox with `aria-activedescendant`, so `focus-within` cannot work; use `group-aria-selected/row:flex`.
- `/` and `?` are ignored while a dialog is open (`useEditorHotkeys`); today the window listener fires from a dialog button.
- The hint line renders as `<kbd>` keycaps; `?` opens the shortcut sheet.
- An empty leader zone shows **Choose commander / leader**, which focuses search and explains Ctrl+Enter.
- Selecting a leader into a full max-1 zone **replaces** it with an Undo toast (One Piece). Magic partner zones (max 2) keep today's "full" message.

**Deck pane.** Order: summary (count, completion ring, ownership line, over-limit action) · leader zone · view controls · card groups · analytics and sample hand as labeled collapsibles.

- Text stays the default view; Grid, Group, and Sort preferences keep the `deckwarden:deck-view` storage key.
- Sticky search input; sticky group headers inside the scrolling pane; steppers appear on hover or focus-within while the quantity is always visible; cost pips right-aligned in a fixed column.
- One Piece: the card number (`display.idBadge`) on rows, grid badges (top corners only, since the frame bottom carries Bandai's text), and the leader zone, so the two Enel leaders are distinguishable; Life on the leader caption; Power and Counter as a muted mono suffix. `.don-cost` renders as a rounded-square chip.
- Validation stays prominent and expandable; the zero-issue line becomes **"The Warden approves this deck ✓"** (§4).
- An empty deck shows an `EmptyState` with setup guidance (the current copy says "search on the left", which is wrong on phones) while validation details stay reachable.
- The analytics collapsible keeps the generic block renderer: analytics are data, not components.

**Tool pane.** Card · Suggestions · Combos · Cuts as Base UI Tabs with a sliding indicator, shown per adapter capability. One Piece declares neither `recommend` nor `combos`, so its pane is a single panel with no strip today; render a plain "Card" heading in that case. Panels already stay mounted, so state surviving a tab switch is a regression check rather than new work.

### Responsive structure

| Width | Layout |
|---|---|
| 1200 px and above (`wide:`) | Three panes: about 320 px search, flexible deck, about 320 px tools |
| 768–1199 px (`md:`) | Search and deck side by side; tools in a Base UI Drawer |
| Below 768 px | One active pane with persistent Deck / Search / Tools bottom tabs |

Today there is no middle tier and no phone layout: below `lg` the three panes stack full-width and the page scrolls.

On phones:

- Open on Deck with an obvious **Add cards** action leading to Search.
- Keep search usable for repeated additions without switching tabs after each card.
- Card details open in a bottom sheet (Drawer) only on explicit inspection; typing never opens it.
- Tools holds analytics, the sample hand, and whichever coaching panels the adapter supports.
- Preserve query, scroll position, and tool state across tab changes; keep panes mounted so layout changes never reset the editor and never create a deck.
- `DrawerVirtualKeyboardProvider` for the software keyboard, bottom safe-area insets, touch targets of at least 44 px, and the site footer hidden on the editor route.

### Browsing, sharing, and account pages

- **Commander and leader indexes** (`/commanders`, `/leaders`): add an image view alongside the compact list (persisted under `deckwarden:index-view`); keep filters and ordering. One `ColorChip` component replaces the text pills on `/commanders` and the hex dots on `/leaders`. One Piece card numbers already show on both index and hub.
- **Card search** (`/cards`): grouped filters, visible selected filters, a loading state, and card spacing through `CardImage`.
- **Hubs** (`/c/[slug]`, `/l/[slug]`): a stronger card-and-title introduction with an accent-gradient header. Magic gets an optional art-crop banner with the artist and © chip (R2 resolver); One Piece gets the gradient only. `/c/` gains **Build with this commander** (Magic seeds by card id — this fires `LATER.md` row 63); `/l/` keeps "Build with this leader" and its href, which are smoke-pinned.
- **Public decks** (`/d/[publicId]`): an artwork header with title, leaders, author, format, legality, and share actions, then the readable decklist and the existing sections. Hover and focus card previews on names; Copy decklist confirms with a check ripple.
- **Deck collections** (home, `/account`, `/u`, `/f`, the hub deck shelf): tiles with a leader image (`decks.leader_ids` → default printing → small rendition), title, game chip, visibility, updated date, and a 3 px identity strip from `decks.ci_mask`; a compact list option.
- **Account**: Decks · Collection import · Settings sections with in-page navigation. The "Danger zone" and "No bookmarks yet" copy is smoke-pinned and stays.
- The same controls and spacing apply to folders, profiles, dialogs, the 404 page, and error pages.

## 3. Signature feature: commander and leader artwork

The deck gains its visual identity when a commander or leader enters its leader zone.

### Behavior

- Before selection: the neutral studio background.
- After selection: the selected printing's artwork faintly behind the builder, at about **8 % opacity in dark** and **4 % in light**, with a gradient veil. Text-heavy panel interiors stay opaque enough for predictable reading.
- The background changes only when the actual leader or its printing changes. Hovering or previewing another card never changes it.
- Crossfade over about 250 ms after the replacement image has loaded. A stale request never replaces the latest leader's art (request-id guard).
- Partner decks use the **first leader entry in the persisted entries order**: `splitLeaderEntries(entries).leader[0]` from `src/lib/decks/view-model.ts`. No separate leader-order field exists. Both leaders show in the foreground header. The choice is stable across reloads, imports, and restores.
- Double-faced cards use the front face. Removing the final leader returns to the neutral background.
- An **attribution chip** reading "Art: {artist} · ™ & © Wizards of the Coast" is visible whenever art_crop is on screen (CLAUDE.md hard rule).
- **Background art: On / Off** lives in the appearance menu, defaults to On, and is stored under `deckwarden:appearance` in localStorage. Theme and appearance changes never call `markDirty` and never create a deck.

### Sources, fallbacks, and the One Piece decision

- **Magic:** the selected printing's art crop with artist credit. Today's mechanism in `src/lib/og/scryfall.ts` is OG-only and returns base64 for satori. It is refactored into `fetchScryfallArtMeta(printingId) → { artCropUrl, artist }` (86 400 s cache, the same `User-Agent` and `Accept` headers) with the OG data-URI wrapper kept on top. A missing artist means no art, never unattributed art.
- **One Piece:** **off until Bandai answers** (owner decision 2026-09-08, consistent with P4.6 decision 2: the R2-mirrored Bandai art is not used decoratively while permission is unanswered). One Piece always uses the color fallback below. Turning it on later is one adapter line.
- **Fallback for both games** (no art declared, art missing, load failed, or preference off): a faint radial gradient from the deck's colors — Magic from `--mana-*`, One Piece from `OPTCG_COLORS` in `src/lib/games/optcg/colors.ts` — through a new adapter hook `display.colorSwatches?(mask): string[]`. Equal weight for both games, nothing to attribute.
- Respect `image_override` and the blocked-host gate (`embeddablePrintingImageUrl` in `src/lib/cards/images.ts`). Foreground card images stay complete and uncropped.

### Interface additions (no migration)

*Landed in R2 (2026-09-09) — annotations in brackets; the contract text is unchanged.*

- A shared nullable `CardArt` descriptor: `{ url, layout: "art_crop" | "full_card", artist?, credit }`. [`src/lib/cards/art.ts`, with `artCredit` as the one builder of the credit line and `fetchScryfallArtMeta` refactored out of the OG path.]
- Adapter contract: `capabilities.ambientArt?: { kind: "art_crop" | "full_card" }` (Magic declares `art_crop`; One Piece declares nothing) and `display.colorSwatches?`. [Both landed; `src/lib/games/mtg/display.test.ts` and `optcg/display.test.ts` pin them.]
- `GET /api/cards/[id]/art?printingId=`: validates that the printing belongs to the card, resolves the default printing otherwise, returns null art when the artist is unknown, `Cache-Control: public, s-maxage=86400`. Server components (hubs, deck pages) call the resolver directly; deck collections batch the printing lookups. [Landed as the one new route; the share page calls `loadDeckLeaderArt` (`src/lib/decks/leader-art.ts`) server-side. Hubs and collections are R5a/R5b's consumers.]
- Fetch on leader-selection change only; never enrich every search result; independent of autosave and validation. [`useLeaderArt` in `src/components/editor/use-leader-art.ts`.]
- Deck API payloads, access controls, and adapter purity are unchanged. [Held: no wire shape moved; `ShareDeckMeta` only names two fields the wire already carried.]

## 4. Interaction language and polish catalog

### Interaction language

Small effects that confirm what happened: buttons respond in about 120 ms; browsing cards lift 2 px on hover or focus; adding a card pops its quantity badge and toasts with Undo; save status changes inside a fixed-width slot; sample hands deal with a short stagger; segmented controls slide their active indicator. Everything is `motion-safe:` and readable without motion.

The Warden shield is the status mark. **Approval language is reserved for true zero-issue validation.**

### Signature fun moments (restrained)

- **The Warden approves.** When validation first transitions from issues to none, the shield settles (about 300 ms) and the line reads "The Warden approves this deck ✓" with `role="status"`. Never on an empty deck (the deck-size rule keeps it honest) and never re-triggered by unrelated edits.
- **Completion ring.** A Base UI Meter around the card count in the game accent. It closes with a soft glow at full size and turns destructive over the limit, tying into the existing "Over by N — rank cuts" action. No ring when the format has no maximum.
- **Add feedback.** "Added 4× Sol Ring" toast with **Undo**. Undo calls `setQty` back through `applyEdit`, so it is a real edit and autosaves. Errors stay on the search pane's live line so nothing announces twice.
- **Dealt hands.** Sample-hand cards slide in with a stagger; Keep and Mulligan are styled as a game prompt. No draw-next (`LATER.md` row 14 stays).
- **Count-up.** The deck total counts up after an import when the delta exceeds five, never on ±1.
- **Keycaps and `?`.** The search hint renders as keycaps; `?` opens the shortcut sheet.
- **Warden pages.** Empty states, the 404 page, and error pages use the shield mark and a line of Warden voice. Shield mark only; a character illustration would need an asset that does not exist.

### Polish catalog

Cost: S under half a session · M about half to one session · L more than one session (split it).

| Id | Item | Package | Cost | Note |
|---|---|---|---|---|
| C1 | lucide icons replace the Unicode glyph chrome | R1a | M | keep `♥` as content (smoke pin) |
| C2 | one `CardImage` component (aspect box, lazy, fade-in, frame, © comment once) replacing the eight raw `<img>` sites | R1b | M | keep the "Card image coming soon" fallback text and explicit width/height |
| C3 | real primitives via `shadcn add`; `Modal` becomes a Dialog wrapper; account deletion moves to AlertDialog | R1a | M | |
| C4 | `.don-cost` chip | R1a | S | |
| C5 | search state machine; actions on the active row; status clears on input; `/` and `?` inert while a dialog is open (`useEditorHotkeys`) | R3 | S | |
| C6 | site header with `(site)` route group; contextual game switch on browse pages; delete the home back-links | R1b | M | home keeps its literal `/leaders` and `/cards?game=optcg` links (smoke pin) |
| C7 | type scale, spacing, and the three container widths | R1b | S/M | |
| C8 | `EmptyState` component (mark, title, hint, action); fix the "search on the left" copy | R1b | S | keep "No bookmarks yet", "This folder is private", "Danger zone" |
| C9 | `loading.tsx` skeletons for hubs, card pages, deck pages (the `shimmer` utility already ships) | R6 | S/M | |
| C10 | one token source for site and OG | R1a | S | |
| C11 | next-themes: Dark default, Light, System, color-scheme, no flash | R1a | S/M | fires LATER row 47 |
| C12 | sticky search input; sticky group headers; steppers on hover/focus-within with quantity always visible; pips in a fixed right column | R3 | S | |
| C13 | `idBadge` in deck rows, grid badges (top corners only), leader zone | R3 | S | |
| C14 | one `ColorChip` for the `/commanders` pills, `/leaders` dots, and `/cards` filters | R5a | S | |
| C15 | One Piece stat badges: Life on the leader caption, Power and Counter as a muted mono suffix | R3 | S | |
| G1 | `data-game` accent variable and ring override | R1a | S | |
| G2 | card frame treatment (radius, hover/focus ring, theme shadow, 2 px lift, `motion-safe:`) | R1b | S | inside C2 |
| G3 | accent-gradient headers on hubs, deck, and card pages; Magic art-crop banner with credit chip | R5b | M | needs the R2 resolver |
| G4 | equal two-game homepage: new hero, two game cards with shelves of real leaders, Continue building, capabilities strip | R5a | M–L | update the hero smoke pin in the same commit; at most three extra indexed queries; One Piece shelf images gated on row 51 |
| G5 | deck tiles (leader image, title, game chip, visibility, updated date, CI pips or OP dots) with a compact list option, on home, account, `/u`, `/f`, and the hub deck shelf | R5a | M | |
| G6 | analytics bars: rounded tops, `starting:` grow-in, value labels | R6 | S | still data, not components |
| G7 | color-identity ambient fallback | R2 | S/M | |
| G8 | 3 px identity strip from `decks.ci_mask` on tiles and headers | R5a | S | readable before images load |
| G9 | target-curve ghost outline behind Magic bars from `recommend.curve.buckets` (editorial, labeled) | R6 | M | optional |
| F1 | "The Warden approves this deck ✓" on the false→true zero-issue transition; shield settle; `role="status"` | R3 | S | build plan §10 wording |
| F2 | completion ring (Base UI Meter) in the game accent; glow when full; destructive when over | R3 | S | no ring when `max` is null |
| F3 | add toast "Added 4× Sol Ring" with Undo; quantity badge pop | R3 | S/M | success goes to Toast, errors stay on the pane's live line |
| F4 | sample hand deals from a stack with stagger; Keep / Mulligan as a game prompt | R6 | S | no draw-next |
| F5 | hover and focus card preview (Base UI PreviewCard) on names in share pages | R5b | S/M | editor skipped (the detail pane already previews) |
| F6 | tiny full-card thumbnails in search rows, never cropped | R3 | S/M | Magic now; One Piece after row 51 |
| F7 | `?` keyboard-shortcut sheet | R3 | S | |
| F8 | Warden-flavored empty states, 404, and error pages (shield mark only) | R5b | S | |
| F9 | save indicator micro-animation in a fixed-width slot; Retry stays outside menus | R3 | S | |
| F10 | count-up on the deck total after an import (delta above five only) | R3 | S | |
| F11 | tool pane as Base UI Tabs with a sliding indicator; View / Group / Sort as ToggleGroup with a CSS slide | R3 | S | |
| F12 | share page: Copy decklist check ripple; leader glow ring in the accent, never over the © line | R5b | S | |
| F13 | logo hover micro-tilt | R1b | S | |
| F14 | `<kbd>` keycaps for the search hint line, reused by F7 | R3 | S | |
| — | leader replace for max-1 zones with an Undo toast (Magic partners keep the error); "Choose commander / leader" empty action focuses search; single-panel tool-pane heading | R3 | S | builder fixes not in the first draft |

Deferred to `LATER.md` with triggers *when the relevant package ships*, not now: card-stacks grid view (trigger: grid-view usage), ⌘K palette (header landed and a user asks), multi-step undo history (the single Undo proves demand), Warden character illustration (an asset exists), animated ambient backgrounds, custom artwork uploads, draggable panels, drag-and-drop editing, extra theme families.

## 5. Packages, sequence, completion

Each package is one session: deployed and `pnpm check`-green, or not done. Sequence: **R1a → R1b → R3 → R2 → R5a → R5b → R4 → R6.**

| Package | Deliverable | Done when |
|---|---|---|
| **R1a Foundation** | C1 C3 C4 C10 C11 G1, the motion policy, and an appearance menu (Dark / Light / System) mounted in the footer until R1b | editor, hubs, share pages, and OG images readable in both themes (LATER row 47's four surfaces); no theme flash; every dialog traps focus; the engagement-smoke `♥` pin intact; the tokens test green |
| **R1b Shell** | C2 C6 C7 C8 G2 F13; the appearance menu moves into the header | every non-editor route shows the header; ISR routes still static in the build output; the header collapses to a Menu on phones; pinned copy intact |
| **R3 Desktop builder** | the new header (mark, game/format chip, name, save slot, Share primary, More menu); C5 C12 C13 C15 F1 F2 F3 F6 F7 F9 F10 F11 F14; the replace / choose / single-panel fixes | the keyboard script is unchanged (`/`, "4 Sol Ring", Enter, Ctrl+Enter, arrows); the first edit still creates exactly one deck; theme and appearance never mark dirty; tests for the hotkey dialog guard, the search-state reducer, and `thumbnailUrl` |
| **R2 Deck artwork** | the §3 resolver, endpoint, capability flag, G7, the preference, and the builder and share ambient layer | the artwork checks in §7 pass; a stale request never wins; saves unaffected; tests for the resolver, the stale guard, and `colorSwatches` |
| **R5a Public surfaces I** | G4 G5 G8 C14 and the index image view (persisted under `deckwarden:index-view`) | seo-smoke green after the hero pin update (run against dev only, since it mints fixture decks); hubs-smoke green; the home query budget holds |
| **R5b Public surfaces II** | G3 F5 F8 F12; the `/c/` Build with this commander action (fires LATER row 63); the deck share artwork header; account Decks / Collection import / Settings sections; `/u` and `/f` tiles | pins intact ("Build with this leader" and its href, ©BANDAI on every One Piece surface, "Curve of these staples", "A typical Commander deck", "Top finishes", "Combos with", "Decks with this commander", no `>USD<` on the One Piece card page); private data still gated |
| **R4 Responsive builder** | `wide:` three panes; `md`–`wide` two panes with a tools Drawer; below `md` the Deck / Search / Tools tabs with panels kept mounted, the Add cards action, the card sheet on explicit inspection, `DrawerVirtualKeyboardProvider`, 44 px targets, safe-area insets, footer hidden on the editor | repeated adds on a phone without tab switching; state survives tab changes and resizes; tab changes create no deck; React Testing Library tests for mount and preserve behavior |
| **R6 Polish and accessibility** | C9 G6 G9 F4; the audit at 390 / 768 / 1024 / 1200 / 1440 / 1920 px in both themes, reduced motion, contrast, focus order, touch targets, status never color-only; no layout shift from images | every check passes; home LCP unchanged or better |

Dependencies: R1a unblocks everything (tokens, primitives, theme). R1b needs R1a (the header uses the appearance menu and primitives). R3 needs R1a (Tabs, Toast, Meter, Dialog). R2 landed on R3's settled header and summary surface and added the appearance-menu entry (2026-09-09). R5a and R5b need R1b (header, `CardImage` for tiles) and R2 (art banner). R4 needs R3's builder surfaces and R1a's Drawer. R6 closes.

## 6. Pre-work, ledgers, open items

Pre-work (done 2026-09-08 unless noted):

- Repo placement: `REDESIGN.md` (this file), build plan §6b, one line in CLAUDE.md.
- Start after P4.7 reports.
- QA fixtures, before R1a: one Magic deck and one One Piece (Enel) deck on the owner's account. The P4.6 walk decks were deleted.
- Header auth strategy (§2) and light-mode accent pairs (§1) recorded as decisions.

LATER-row ledger:

| Row | Effect |
|---|---|
| 47 dark mode | fires in R1a; record "FIRED" there |
| 63 `/c/` build CTA | fires in R5b |
| 62 claim nudge | not fired by the header; stays trigger-gated |
| 51 r2.dev images | gates One Piece thumbnails (R3) and, since R5a (2026-09-10), the tiles' One Piece images, the home shelf images and the `/leaders` image view until `img.deckwarden.gg` serves (row text extended, no new row); hub and grid renders continue as today |
| 14 goldfish playtester | untouched; sample-hand polish adds no draw-next |
| 70–72 (R3, 2026-09-09) | written with triggers: multi-step undo (the single Undo proves demand), card-stacks grid view (grid-view usage), and quick-add by One Piece card number (the search placeholder promises an id search the search route does not do — a pre-existing gap the R3 API fence kept out) |
| 27 and 50 Deck Passport, folder and profile OG | untouched |

Smoke-pin ledger. Update a pin in the same commit as the copy change. `seo-smoke` mints fixture decks, so run it against dev only.

| Package | Pins |
|---|---|
| R1a | `scripts/engagement-smoke.ts` expects `♥` in the home HTML; keep the glyph as content |
| R1b | `scripts/optcg-smoke.ts` "Card image coming soon"; `scripts/engagement-smoke.ts` "No bookmarks yet"; `scripts/profile-folders-smoke.ts` "This folder is private"; `scripts/account-delete-smoke.ts` "Danger zone"; `scripts/seo-smoke.ts` home links to `/leaders` and `/cards?game=optcg` |
| R3 | none new — the editor is client-rendered, so no smoke reads its DOM; `smoke:decks`, `smoke:versions`, `smoke:collection` (its share-page "You own 1/3" line untouched) and `smoke:optcg-deck` ran green on dev 2026-09-09; `seo-smoke`'s `/l/` hub CTA href (`/decks/new?game=optcg&leader=<KEY>`) still seeds the leader zone as state only |
| R5a | DONE 2026-09-10 — `scripts/seo-smoke.ts` hero string "Build a legal deck, fast." → "Your next great deck starts here." in the same commit as the copy; `scripts/hubs-smoke.ts` "Curve of these staples" untouched and green (the index's `/c/<slug>"` negative checks hold in the server-rendered list); `scripts/engagement-smoke.ts` grew two checks — the signed-in home renders "Continue building" with the account's edit link, the signed-out HTML carries neither |
| R5b | "Build with this leader" and its href; ©BANDAI on `/leaders`, `/l/`, the One Piece card page, `/cards?game=optcg`, and the One Piece deck page; "A typical Commander deck", "Top finishes", "Combos with", "Decks with this commander"; no `>USD<` on the One Piece card page |

Open items:

- Hero wording: "Your next great deck starts here." — PROVEN IN PLACE by R5a (2026-09-10): the `<h1>` on dev and prod, `smoke:seo` green on the new pin; resolved.
- `/cards` restyle (§2 "Card search": grouped filters, visible selected filters, a loading state) has no package: R5a shipped only the `ColorChip` toggles there (C14). Assigned to **R6** beside C9's skeletons — the loading state IS a skeleton, and the grouped / selected-filter rows are polish, not a public-surface feature. Contract gap recorded 2026-09-10, not a LATER row.
- Mascot: shield mark only. A character asset would be a separate decision.
- R1b premise correction (2026-09-08): the "ISR routes still static in the build output" check in §5 assumed `/c/`, `/l/` and `/cards/[id]` were ISR. They never were — `revalidate` without `generateStaticParams` renders dynamically on every hit (LATER row 69, verified pre- and post-R1a). R1b makes them ISR for real (`generateStaticParams` returning `[]`) and proves it from `.next/prerender-manifest.json` and prod cache headers; that is the yardstick the route-group move is measured against.
- R1a decisions beyond the §1 table (2026-09-08), all pinned by `src/lib/theme/tokens.test.ts` against `globals.css`:
  - Tokens the table leaves open, chosen on the same palette: secondary `#262d3c` / `#e8eaf2`, muted `#222837` / `#eeeff5`, accent (hover) `#2b3345` / `#e6e8f1`, border `#2a3040` / `#e2e4ec`, input `#2a3040` / `#d8dbe6`, ring = brand text (dark) / `#4f46e5` (light), destructive `#f87171` / `#b91c1c` (6.8:1 / 6.1:1), chart-1…5 recolored on the palette (chart-2 stays the analytics fallback bar). The shadcn sidebar tokens were dropped — nothing used them; a future `shadcn add sidebar` re-adds its own.
  - Status hues without a token (amber, emerald, green) keep their `dark:` pair; the light shade went 600 → 700 because amber-600 measured 3.0:1 and emerald-600 3.5:1 on the light background. Red status chips use the destructive token. Button's base-nova `dark:` variants were kept as authored.
  - `Modal` keeps 16 px text inheritance inside the Dialog (`text-base`) so the six call sites render as before; the R1b type scale decides the dialog body size.
  - The appearance menu's radio items close on click (Base UI leaves radio menus open by default) — a theme is a one-shot choice.
  - The OG kicker, curve bars and `.gg` wordmark take the accent as an explicit prop (satori has no context); the empty curve bars and stat chips paint the panel / raised tokens; the attribution chip's own colors are untouched.
  - `meter.tsx` is hand-written (no base-nova registry item as of shadcn 4.19); the CLI's `import { cn } from "cn"` and the stray `cn` npm package it installs were reverted to the `@/lib/utils` alias — expect the same on every future `shadcn add`.
  - Installed but not yet wired (for R1b / R3 to use offline): tabs, tooltip, toast, collapsible, skeleton, badge, input, select, toggle, toggle-group, scroll-area, hover-card, sheet, drawer, separator, avatar, progress, popover, navigation-menu, meter.
- R1b decisions beyond §1/§2 (2026-09-09), pinned by `src/components/site-header.test.tsx`, `cards/card-image.test.tsx`, `empty-state.test.tsx` and `game-switch.test.tsx`:
  - The `(site)` layout is typed `LayoutProps<"/">` — `next typegen` folds a route group into its URL path, so the group layout and the root layout share the key (Next 16.3.2).
  - The footer stays in the root layout on every page (attribution is site-wide); only the appearance menu moved. The editor routes get `AppearanceRow` — a slim row above the footer, below the fold on desktop, rendered by the chooser's editor branch and `/decks/[id]/edit` — rather than a `decks/layout.tsx`: the `/decks/new` picker renders `SiteHeader` (menu included) itself, so a layout-level row would have doubled the control on that page. Consequence: the root 404 and error pages, which render headerless this session, carry no appearance control until R5b/F8 restyles them.
  - Base UI names a menu popup after its trigger (`aria-labelledby` wins over `aria-label`): the phone menu is "Menu", Browse is "Browse". `DropdownMenuLinkItem` (new in `ui/dropdown-menu.tsx`) wraps `Menu.LinkItem` — a real `<a>`, rendered as a Next `Link` with `closeOnClick` — so Enter and middle-click behave like links.
  - "Sign in" is a `Link` styled with `buttonVariants`, not Button-as-Link: Base UI's Button sets `role="button"` on a non-native element. The avatar in the signed-in slot is `aria-hidden` so the initial never leaks into the link's name.
  - `CardImage` renders no wrapper — the DOM shape at every site is today's `<img>` (the buttons and badges around it are untouched). `frame` (G2) goes on the interactive sites only: the `/cards` grid (its `Link` gained a focus ring in the game accent), the leader zone and the deck grid; the detail pane keeps the card radius without a hover lift because it is not interactive; the hub heroes, the card page and the sample hand keep their look. `priority` images skip the fade (the LCP image must not wait on hydration); lazy ones fade on load, with a `complete` check so a cached image is never stuck invisible. Keyboard focus rings belong to the interactive parent, never to the image.
  - `/cards` `<main>` now carries `data-game` so its focus and frame accents follow the chosen game (the R1a rule extended to the index).
  - Type scale: "Card search" and the picker's "Start a new deck" are page titles (30/36 semibold); the `/u/` and `/account` names, the `/f/` folder name and the share-page deck name stay 24 px semibold (user strings beside avatars, R5b's artwork header restyles the deck one); the `/f/` private gate stays 20 px; body 14 applied on `/legal`, `/privacy` and the sign-in intro only; the root 404/error titles took the semibold weight and nothing else.
  - `EmptyState` copy: deck list "No cards yet" + hint "Add them from Search." (mark shown); leader zone "No commander yet" / "No leader yet" + the Ctrl+Enter hint in the editor only; `/account` "No decks in this account yet" + a Build one button and "No bookmarks yet" + its hint; `/leaders` keeps its sentence as the title with Show all leaders as the action.
  - Containers: `/commanders`, `/leaders` and the share pages widened 48→64rem, home 56→64rem, `/cards` 72→80rem; the reading pages were already 42rem. The header itself sits in the 80rem container.
  - The OG routes got `generateStaticParams` too: their renders are cached (`x-nextjs-cache: HIT` on the second hit) while the response keeps Next's metadata-route `Cache-Control` (`public, max-age=0, must-revalidate`); prerendered metadata routes get Next's hashed `opengraph-image-<hash>` path, which the page's `og:image` meta carries.
  - The header is not sticky (§2 does not ask for it; hub pages stay content-first). ⌘K stays a LATER row for the day a user asks — no row written yet.
  - Wired in R1b: avatar (the account slot) and, further, dropdown-menu (Browse, the phone menu, appearance). Wired in R3: tabs (with a new `TabsIndicator` part and an `indicator` list variant), toast (the `Toaster` grew a `viewportProps` passthrough), toggle-group (through `Segmented`), collapsible, meter (the completion ring), badge (the game/format chip); tooltip stayed unused. R2 wired nothing new (the credit chip is a plain `<p>` — a tooltip would hide the attribution the hard rule wants visible — and the Background art item reuses dropdown-menu's existing `DropdownMenuCheckboxItem`). Still installed and unwired: tooltip, skeleton, input, select, toggle (only through toggle-group), scroll-area, hover-card, sheet, drawer, separator, progress, popover, navigation-menu.
- R3 decisions beyond §2/§4 (2026-09-09), pinned by `src/components/editor/editor-header.test.tsx`, `search-pane.test.tsx`, `use-editor-hotkeys.test.tsx`, `use-count-up.test.tsx`, `src/components/deck/validation-panel.test.tsx`, `completion-ring.test.tsx`, `segmented.test.tsx`, `deck-text-view.test.tsx`, `leader-zone.test.tsx`, `src/lib/decks/search-state.test.ts`, `editor-state.test.ts` (replaceLeader, singleQtyIncrease), `src/lib/cards/images.test.ts` (thumbnailUrl), `src/lib/games/optcg/display.test.ts` and `src/components/ui/modal.test.tsx` (ModalFinalFocus):
  - Header (`EditorHeader`): the More menu also lists "Keyboard shortcuts ?" so the sheet is reachable by mouse; Share is absent in a pre-create draft (nothing exists to share); the `← Deckwarden` text link is gone (the mark, with the F13 tilt, is the way home); the save slot is `w-36` (144 px, measured identical across Saved / Unsaved… / Saving… on dev; "Save failed" + Retry is class-pinned) and Retry stays outside the menu. A dialog opened from More would return focus to its unmounted menu item on close, so `Modal` reads a `ModalFinalFocus` context that the editor sets to the More trigger for menu-opened dialogs; the `?` sheet (hotkey-opened) keeps Base UI's default and returns focus to wherever `?` was pressed (proven on dev).
  - Toasts (F3): only the search pane's adds toast — the Suggestions and Combo panels keep their own live-line notices (they already announce there, and a toast would announce twice). One `Toaster` inside `DeckEditor`, viewport `data-game` so Undo rings in the game accent, 5 s timeout, `type: "success"`. Undo is `setQty` back to the previous quantity (0 removes) or `replaceLeader` back — both through `applyEdit`, so they autosave (a PUT followed every Undo on dev).
  - `display.rowStats?` is a NEW optional adapter display hook (One Piece: "5000 · +1000", Power · Counter with the units dropped, Life left out) instead of parsing `statLine`'s words in core — game vocabulary stays in the adapter. The leader caption renders `idBadge` + `statLine` through the shared `LeaderZone` (`adapter` prop), so One Piece leaders read "OP15-058 · 5000 Power · 5 Life" and Magic commanders get their P/T ("3/4") on the editor AND the share page — the share page's only R3 changes are these shared components plus passing `adapter` to `LeaderZone` and `DeckGridView` (the grid's top-left id badge, C13).
  - "Choose commander / leader" uses the zone label lowercased ("Choose commander", "Choose leader" — §2's wording); it focuses the search box through the pane's handle, the same one `/` uses.
  - Sticky (C12): the search block (input + keycap hint + live line) sticks inside the search section; group headers stick inside the deck section (`stickyHeaders`, editor only — share pages scroll the document and keep plain headers); the deck summary row does NOT stick (the group header is the wayfinding; the count and ring scroll away with the leader zone). Measured on dev at 1440×900: search block at 0 px while scrolled 208 px; "Land 35" at 0 px while scrolled 600 px.
  - Pip column: `min-w-20` (80 px). Measured widest fixture cost = Prime Speaker Zegana, 5 pips / 63 px (Atraxa Superfriends, all 85 rows right-aligned); Queza's widest is 4 pips / 50 px; a wider cost extends the row rather than wrapping. Costless rows keep the empty column. At exactly 1024 px the deck pane is 256 px wide because the unchanged grid gives the outer panes their maxima first — a pre-existing squeeze R4's `wide:` tier owns (names truncate hard there; nothing overlaps).
  - Thumbnails (F6): a 36 px tall box, 26 px wide (card aspect), lazy `CardImage` with `alt=""`; `thumbnailUrl()` returns the `small` rendition only for `cards.scryfall.io/normal/` URLs, so One Piece rows render the same-width empty spacer until LATER row 51 — the flip changes no layout.
  - Deck pane order per §2: summary (count with the F10 count-up, the F2 ring, ownership, the over-limit action) · validation · leader zone · view controls · groups · Analytics (closed) · Sample hand (open) as Collapsibles; validation sits directly under the summary ("prominent and expandable"). `SampleHand` carries its own Collapsible wrapper, so the share page's sample hand gained it too (open by default — nothing hides).
  - Warden line (F1): the settle plays only on the false→true transition, tracked with the React "previous render" state pattern (no refs during render — `react-hooks/refs` and `react-hooks/set-state-in-effect` are errors in this tree); the line keeps `title="Legal {format} deck"` as its tooltip; proven on dev that a name edit, a Grid/Text toggle and a theme switch keep the same DOM node. Completion ring (F2): Base UI Meter clamps `aria-valuenow` to `max`; the value text stays honest ("104 of 100 cards"); the glow is `--animate-ring-glow` in globals.css `@theme`, one shot at exactly max.
  - Count-up (F10): a Date.now()-driven interval (fake-timer testable, not rAF); the ±1 jump path is the previous-render pattern; proven on dev with Queza's import (4 → 100).
  - Segmented on ToggleGroup: equal-width segments with a CSS-slid thumb driven by `--seg-index` / `--seg-count` (no measuring); re-picking the pressed item is ignored (a view always has a value). Tabs: `TabsList variant="indicator"` + `TabsIndicator` positioned by Base UI's `--active-tab-left/-width`; the strip sits in a 40 px row so One Piece's plain "Card" heading aligns with it; panels `keepMounted` (Suggestions/Combos fetched once per activation on dev, no refetch on re-switch).
  - `useEditorHotkeys`: one window listener, off while any editor dialog is open, skipping INPUT / TEXTAREA / SELECT / contenteditable targets and anything inside `role="dialog"`, `alertdialog` or `menu`. Base UI toasts render `role="dialog"` too, so keys pressed inside a toast are also inert.
  - The hidden desktop-app pane stalls Base UI exit animations and timers (menus linger in `data-ending-style`, toasts never auto-dismiss, Tabs panels keep an unsettled `hidden`); fronting the tab resolved all three on dev (toasts gone at 5 s, only the active panel shown). Same environment artifact R1b noted — the jsdom tests and the visible checks are the evidence, not the hidden pane.
  - Dev pass minted two anonymous draft decks and deleted both through Details → Delete deck…: `12d44c97-f28b-4033-afe2-0a525f225500` (MTG; the first-edit check — exactly one POST /api/decks, the URL swapped in place with the search input keeping focus) and `d8b57803-bfaf-4b6b-8ec6-22ffe876c0d4` (One Piece; the leader replace + Undo check). Both rows confirmed gone; db:size 254.3 MB after the smokes.
  - Observed, not fixed (fence): the One Piece promo Nami P-117 has `cost_value` NULL (LATER row 61's upstream nulls), so its row renders no DON!! chip — correct; and the OP search placeholder's "try “4 OP01-025”" finds nothing because the search route matches names only (LATER row 72).
- R2 decisions beyond §3 (2026-09-09), pinned by `src/lib/cards/art.test.ts`, `src/lib/og/scryfall.test.ts`, `src/lib/games/mtg/display.test.ts`, `src/lib/games/optcg/display.test.ts`, `src/lib/decks/ambient-art.test.ts`, `src/lib/theme/appearance.test.ts`, `src/components/theme/appearance-menu.test.tsx`, `src/components/editor/use-leader-art.test.tsx`, `src/components/deck/ambient-art.test.tsx`, and the Background art item added to `site-header.test.tsx` and `editor-header.test.tsx`:
  - Module layout: `src/lib/cards/art.ts` owns `CardArt`, `artCredit` (the one builder of "Art: {artist} · ™ & © Wizards of the Coast" — `OgAttribution` reads it too), `fetchScryfallArtMeta`, `artCropCardArt`, the adapter gate `ambientArtKind` and `resolveCardArt`; `src/lib/og/scryfall.ts` is the bytes-to-data-URI wrapper and the three OG routes changed by zero lines (the deck, hub and card OG images measured byte-identical on prod's pre-refactor code and on dev: 986,971 / 47,519 / 985,915 bytes). Art comes from the Scryfall API by printing id, so `image_override` never applies to art and the blocked-host gate is moot for Magic — said in the resolver's docblock, not enforced twice. Double-faced cards take `card_faces[0]` (the front) — proven on dev with Birgi, God of Storytelling: `art_crop/front/…` in the editor and the same art in the deck's OG unfurl.
  - The endpoint (`src/app/api/cards/[id]/art/route.ts`): zod on `id` and `printingId` (400, no cache header) → the card must exist and not be removed (404) → the adapter gate answers `{ art: null }` BEFORE any printing lookup or network, so a One Piece card with another card's printing id is a 200 null rather than a 404 (there is no art for the printing to validate against) → the printing must belong to the card and not be removed, the default when none is named (404: it does not exist for this card) → the resolver. 200s carry `public, s-maxage=86400, stale-while-revalidate=86400`; 404s carry an hour (`s-maxage=3600`) so junk ids stop hitting the database while a card that appears at the next nightly heals within the hour. No rate limit: a GET bounded by real printing ids, edge-cached, one indexed read plus a data-cached upstream call — not the resolve route's shape. Measured on dev: a One Piece leader answers null in ~110 ms (one DB round trip, no Scryfall).
  - Adapter contract: Magic `colorSwatches` maps the identity to `var(--mana-x)` in WUBRG order with `["var(--mana-c)"]` for a colorless identity (mask 0 or the C bit alone — the ciPipsHtml rule); One Piece maps to the frame hexes in Bandai's display order with `OPTCG_COLORLESS_HEX` (`#9e9e9e`, distinct from Black's blue-grey) for mask 0. Correction to the R2 prompt's inherited fact: Enel OP15-058 is a PURPLE leader (bit 32; the fixture deck's `ci_mask` is 32 and its own description says so), so the One Piece gradient is `#6a1b9a`, not yellow.
  - The hook (`useLeaderArt`): inputs `{ enabled, cardId, printingId }` as primitives, so main-deck edits, the preview card, tags and tab changes never re-run its effect; each run owns an AbortController and a `stale` flag; the crop is decoded off-screen (`new Image()` + `decode()`) before it commits; the last committed art stays up across a swap until the replacement has loaded (the crossfade) and clears at once when the last leader leaves; Off keeps the committed art in state so On needs no request; a finished request is never aborted by the cleanup (so the browser log shows one clean request per leader change — dev's StrictMode double mount still shows one cancelled duplicate on hydration, as the deck GET does). Stale guard pinned with two responses landing out of order.
  - The layer (`AmbientArt`, `src/components/deck/ambient-art.tsx`): the surface root is `relative isolate`; the layer is `absolute inset-0 -z-10 overflow-hidden pointer-events-none aria-hidden`; the crop `alt="" decoding="async" fetchpriority="low" object-cover` at `opacity-[0.04] dark:opacity-[0.08]` (measured 0.08 / 0.04 on dev in both themes) under a `bg-linear-to-b from-background/70 via-background/30 to-background/90` veil; the crossfade is a CSS animation pair (`animate-in fade-in-0` on the newcomer once loaded, `animate-out fade-out-0 fill-mode-forwards` on the leaver, dropped after 300 ms — at once under reduced motion, which the component reads from `matchMedia`) rather than a transition, so a cached crop still fades in when its class lands in the frame it mounts. The gradient fallback renders whenever a leader exists and no crop is on screen — including Background art Off (§3 lists the preference under fallbacks, so the gradient STAYS with art Off) — at the same opacity policy, one centred ellipse for a single swatch and up to six pooled spots otherwise, and it fades out as the crop fades in. A crop that fails to load falls back to the gradient with no chip.
  - The chip: a plain `<p>` in the same component as every crop (`grep art_crop src/` lists the resolver, the type literal, the OG path and the layer only), bottom-LEFT because the toast viewport owns bottom-right on `sm+`, rendered as a `sticky bottom-0 h-0 z-20 pointer-events-none` row at the surface's END (the layer is the last child of the editor root and of the share page's `<main>`): it rides the viewport's bottom edge while the art does and rests above the footer when the surface scrolls past (measured on the share page at 1024×768: 740–760 mid-scroll, 627–647 with the footer at 679 at the end). Translucent `bg-background/80` pill, not focusable, no text selection (pointer-events off so it never blocks a click). Observed: a search list scrolled to its very end passes its last row's leftmost ~220 px under the pill; R4 re-lays these panes.
  - The opaque strips: the sticky search block and the sticky group headers keep `bg-background`. Judged from the 1440×900 and 1024×768 screenshots in both themes: at 8 % / 4 % the solid bands are barely distinguishable from the art around them, and a translucent variant would either show nothing more (`/90` over 8 % art is 0.8 %) or blur scrolled text under the headers.
  - Preference store (`src/lib/theme/appearance.ts`): `{ backgroundArt }` under `deckwarden:appearance`, validated field by field (a corrupt value reads as On — proven on dev with `{oops`), `useSyncExternalStore` with a null SERVER snapshot so the layer renders nothing until hydration (no flash for Off readers; On readers see the 250 ms fade they would see anyway — the share page's server HTML carries no layer and no chip), same-tab listeners plus the cross-tab `storage` event, an in-memory fallback only when storage throws. The menu item is a `DropdownMenuCheckboxItem` under a separator below the theme radios, on EVERY page (the setting is the reader's, not the page's), and it keeps the menu open (Base UI's checkbox default — a toggle invites a second look; the radios still close). Theme and preference changes never mark dirty: the save slot read "Saved" across every toggle on dev with zero deck requests, and the OP draft with the seeded leader made no `/api/decks` call.
  - Leader order: the deck wire sorts by name within a zone, so a partner deck saved in the other order would have flipped its art leader on reload. `orderLeadersBy` (`src/lib/decks/ambient-art.ts`) puts the wire back into `decks.leader_ids` order in the editor's hydration and in the share view, so the builder in session, the builder after a reload, the share page and the OG unfurl all show the FIRST leader entry's art (`leaderArtTarget` = `splitLeaderEntries(...).leader[0]`, pinned equal to `leaderDenorm`'s `leaderIds[0]` over the same list). Chosen printings ride the entry's `printingId` on the request (`?printingId=`) — proven on dev by PUTting Queza's SNC 212 printing and reloading: the crop and the credit changed from Julie Dillon to Josh Hass.
  - The share page resolves art in the server render (`loadDeckLeaderArt`: gate → the first leader's chosen or default printing → resolver) and the client makes zero art requests; `PrivateShareGate` still passes no art, so a private deck's owner sees the gradient, and no art ever reaches a viewer the gate denies.
  - Dev pass minted one anonymous draft deck, `6d319c5d-c550-4c2d-a3dc-8d858c7b1162` (public id `hu4d7kkbbwbb`), and deleted it through Details → Delete deck…; the row was confirmed gone by query. `smoke:collection`, `smoke:seo` and `smoke:optcg-deck` ran green against dev.

- R5a decisions beyond §2 (2026-09-10), pinned by `src/lib/decks/tiles.test.ts`, `src/components/deck/deck-tile.test.tsx`, `src/components/color-chip.test.tsx`, `src/lib/hub/index-view.test.tsx`, `src/components/hub/leader-index-view.test.tsx` and `src/lib/home/shelves.test.ts`:
  - Query budget, COUNTED rather than estimated: `createDb` gained an env-gated postgres.js `debug` hook (`DB_LOG=1` prints one `[db]` line per statement; unset — every deploy — leaves `debug` undefined and no hook is installed), and `.claude/launch.json` (gitignored) gained a `dev-log` configuration that starts `next dev` with it. A guest render of `/` runs exactly THREE statements: the Magic shelf (`loadTopCommanders` = the index query with a `limit` and the default printing LEFT JOINed), the One Piece shelf (`loadRecentFinishLeaders`, one CTE), and the recent rail (P2.3's query with the first leader's default printing LEFT JOINed on `leader_ids[1]`). That is TWO extras over today's one, under the three §2 allows, because the rail's printings ride its own statement instead of a second lookup. No session statement for a guest — Better Auth answers a cookieless `getSession` without the database (the first request also shows postgres.js's one-time array-type discovery, a driver query, not a page query). A signed-in visitor adds Better Auth's session lookup and one `decks_owner` read (`loadOwnerDecks`: six newest, every visibility — they are the owner's). The guest's client `POST /api/decks/mine` runs two statements (the rows, then the batched printings).
  - Printings, two shapes on purpose: the collection queries JOIN the default printing (`defaultPrintingJoin` in `src/lib/decks/collections.ts`; `cp_default_one` is unique per identity, so the join never multiplies rows) — home's rail and Continue building, `/c/`'s shelf, the index and the Magic shelf; `loadDefaultPrintings(ids)` (the batched `inArray` sibling of `loadDefaultPrinting`) serves the two callers that already hold full deck rows, `/account` and the mine route.
  - Image gating: `leaderTileImage` = `thumbnailUrl(embeddablePrintingImageUrl(printing, "normal"))` — R3's gate reused unchanged, so One Piece tiles and shelf cards make no r2.dev request (measured on dev: zero r2.dev resource entries on home, ten `cards.scryfall.io/small/` — four rail tiles plus six shelf cards). The empty slot paints `ambientGradient(display.colorSwatches(ciMask))` at 70 % over `bg-muted` — R2's paint — so a One Piece tile is never a grey box and row 51's flip swaps only the slot's contents. `ambientGradient` MOVED to the pure module `src/lib/decks/ambient-art.ts` (the component re-exports it): an export of a `"use client"` file is a client reference on the server, and the tiles render server-side.
  - The strip (G8): `stripBackground` builds equal hard-stop `linear-gradient` segments in the adapter's swatch order (WUBRG for Magic, Bandai's for One Piece); one color renders as that color; mask 0 is the game's neutral (`var(--mana-c)` / `#9e9e9e`); a deck without an adapter gets `var(--border)`. Inline `style.background` on an `aria-hidden` span measured 3 px tall in the pane, painted in the server HTML before any image. The rail today: Queza W U B, Enel `#6a1b9a`, Atraxa W U B G, the Boros pair W R twice. Partners are already OR'd into `decks.ci_mask` by `leaderDenorm` (pinned over a two-leader mask).
  - One link per tile: the deck name is the anchor and stretches over the tile through an `after:` pseudo-element — the whole card is the click target while the DOM keeps exactly one `<a>` named by the deck; the image is `alt=""`, the strip and the game chip `aria-hidden`; the `actions` slot (folder select, Share page) sits `relative z-10` above the overlay; `data-game` on the tile gives its focus ring the game accent. The visibility word shows on owner surfaces only; the byline needs a username (the P2.2 rule, unchanged) and is off on owner tiles (`byline: false`); `♥ N` renders as ONE text node so the HTML reads literally `♥ 1` (React would otherwise split it with a comment; engagement-smoke greps the glyph).
  - No compact-list option and no `deckwarden:collection-view` key: five public decks are one screen of tiles, and a toggle would be a control with nothing to switch for. It returns when a collection outgrows a screen (no LATER row — the trigger is the surface itself).
  - Continue building: server-rendered for a session (the PAGE reads `headers()` — home is force-dynamic; the (site) layout still never does) and client-rendered from claim tokens for a guest; never both. Both carry `id="your-decks"` (the header's guest "My decks" target since R1b) and `aria-label="Continue building"`, and both render nothing with nothing to continue (home is not a discovery surface for one's own empty account). The account branch caps at six with "All your decks" → `/account` when full. Proven by `smoke:engagement`'s two new checks (the signed-in HTML carries the section and the owner's `/decks/<id>/edit` link; the signed-out HTML carries neither) and, for the guest branch, by one draft minted in the pane.
  - The mine route's ONE additive field: `leaderImage: string | null`; `deckMetaJson` and every existing field untouched (the only wire change of the package).
  - The One Piece shelf query (`loadRecentFinishLeaders`): every slugged leader of the game LEFT JOINed to its finish ranking (`leader_ids` unnested, grouped per leader, newest kept finish first, then count), finish rows first, name order behind — so ONE statement serves both §2 branches: `opShelf` keeps only the finish rows when any exist (never padded with unranked leaders) and takes the name-ordered rows as the cold-start shelf otherwise (unit-tested, since the live corpus — 74 leaders with finishes — never exercises it). Live order 2026-09-10: Enel OP15-058 (231), Dracule Mihawk OP14-020 (173), Boa Hancock OP14-041 (49), Sabo OP13-004 (48), Nico Robin OP09-062 (32), Kaido OP17-058 (28), all with a 2026-09-08 latest event (the prompt's 09-07 moved by one nightly). Labeled "Recent Top finishes" with "Leaders placing top 16 at 16+ player events, newest first. Results from Limitless" (linked) — the ordering IS tournament data, so the credit sits with it. The cold-start section is `aria-label="Leaders"` with no visible label and no popularity wording.
  - The Magic shelf: `loadTopCommanders(6)` = page 1's top six (Syr Konrad, Etali, Ragavan, Braids, Azusa, Loran on 2026-09-10) under "Most-played commanders" and the index's own honest subtitle. Shelf images are lazy, all of them: the hero text is the LCP, and a small image already in the viewport loads at once regardless of the attribute.
  - One Piece shelf cards keep the Magic shelf's silhouette — the gradient slot with the printed id top-left (C13's corner rule), name, `ColorChipList` dots, "N Life" — so the two game cards read equal and row 51's flip swaps only the slot. The One Piece card ends with the posture line (compact size): leader names and ids are One Piece data.
  - Hero: the pill, the `<h1>`, one sentence; no hero buttons — the game cards' Build / Browse / Search are the calls to action (`/decks/new?game=mtg|optcg`, `/commanders` / `/leaders`, `/cards` / `/cards?game=optcg`, the literal One Piece links the seo pin needs). The Moxfield-import + sign-in + GitHub sentence closes the page under the capabilities strip. The strip: five cards — validation, combos (Magic), share pages, sample hands (seven / five), tournament finishes (Topdeck.gg / Limitless); three bodies are P2.8's FEATURES copy where it still read true.
  - `ColorChip`: keys are the shared-mask letters for both games (the pages' toggling code is unchanged); the color's NAME is always the accessible name (the Magic `/cards` toggles now read "Blue", not "U"); the Magic swatch reuses the `.pip` classes (em-sized, so `text-[9px]` dots fit a shelf meta line); the One Piece swatch is the frame hex as a dot. Active = `bg-muted ring-2 ring-accent-game`; keyboard focus draws an OUTLINE in the accent so focus and active never fight over the ring; the "All" pill shares `chipClass`. `/commanders` and `/leaders` mains now carry `data-game` so the accent resolves (R1b extended `/cards` the same way). `ColorChipList` renders per-chip `sr-only` names (the deleted `/leaders` ColorDots read one "Red/Green" string).
  - Index view: the store's SERVER snapshot is "list" (not null): the list must be in the server HTML for hubs-smoke and for search engines, so a Grid reader sees the list for one paint and the grid after hydration — P1.3's deck-view flash, accepted and disclosed here. Stored as the bare word; a corrupt value reads as the list. The grid: `CardImage` `small` renditions with the G2 frame, the rank badge top-left, name and pips below, 60 lazy images per page; `?colors=` and `?page=` are untouched by the toggle (proved on dev: Grid chosen on page 1, `?page=2` reloads in Grid with rank 61 and no `/c/syr-konrad-the-grim"`). `/leaders` renders NO toggle until LATER row 51 fires (142 r2.dev images on one page is the throttling the row names) — row 51's text extended, no new row. `Segmented` gained an optional `ariaLabel` (visible "View", group named "Index view").
  - `/account`: `DeckItem` is a `DeckTile` in a two-column grid inside today's folder sections and Unfiled bucket, keeping the edit link titled "Edit {name}", the visibility word, the folder select and the Share page link; the bookmarks stay rows (R5b restructures the page); "No bookmarks yet" and "No decks in this account yet" unchanged (`smoke:engagement` and `smoke:profile` green on dev).
  - `/c/` shelf: `loadHubDecks` returns the collection row (tile fields, the byline, the joined printing — still one statement); tiles in a two-column grid; no per-viewer state, so the route stays `●` (the route table diff is EMPTY, 56 glyph lines before and after). `next dev` cannot show an ISR HIT (`Cache-Control: no-cache, must-revalidate` on every dev hit); prod's `x-vercel-cache` is the proof, as R1b established.
  - Wired nothing new from the installed primitives — tooltip, skeleton, input, select, toggle, scroll-area, hover-card, sheet, drawer, separator, progress, popover and navigation-menu stay unwired; the tiles use Badge's `badgeVariants` (a plain span — Badge's `useRender` hook is not for server components) and the index toggle reuses `Segmented`.
  - Environment notes: the pane's `Return` key does not reach the editor's combobox (as R2 found for Ctrl+Enter) — a dispatched `KeyboardEvent('keydown', { key: 'Enter' })` on the input adds the card; screenshots under `resize_window` emulation of 1024 / 1440 came back empty in the hidden pane, so those widths were measured with `getBoundingClientRect` (game cards 488 px each side by side, tiles in three columns, the strip in five, no horizontal overflow) and the phone / tablet / native-width screenshots carried the visual review in both themes.
  - Dev pass: one anonymous draft, `0e45ac0a-6266-40d6-8d1f-5815f1957823` (public id `fttmpwttgv72`), minted through the editor's first edit ("Sol Ring" + Enter — exactly one deck), seen as the guest Continue-building tile (edit link "Edit Untitled", Share page, unlisted, neutral strip, gradient slot), deleted through `DELETE /api/decks/:id` with its claim token (204), row confirmed gone by query; the six smokes (collection first, then engagement, profile, seo, hubs, optcg-deck) ran green against dev in one hour window (eight deck creates + the draft, under the 10/h limiter). db:size after the pass: 254.4 MB (unchanged from the 254.4 MB baseline; no rows added by hand, the draft and every smoke fixture deleted).
  - Prod pass (2026-09-10, `02b4b6a`, Vercel status success ~10 s after the push), signed out, no edits: home dark and light with the five tiles (one link each, `♥ 1` on the One Piece tile only, ten `cards.scryfall.io/small/` loads, zero r2.dev), both shelves in the orders above, no Continue building for a guest, `x-vercel-cache: MISS` (dynamic, as before); `/commanders` list in the HTML and Grid after the toggle (60 images, `/c/syr-konrad-the-grim` first, rank 1), `?colors=w` without the top slug; `/leaders` 142 rows with chips, ©BANDAI, no toggle; `/cards` and `/cards?game=optcg` 200 with the chips; `/c/atraxa-praetors-voice` `x-vercel-cache` MISS → MISS → HIT with `x-nextjs-prerender: 1` and the Atraxa Superfriends tile in the shelf — ISR intact. The owner's open looks (Danger zone, signed-in editor, Background art toggle) remain untold: R5a could not tell either (the same `auth:…|/get-session` rows R2 saw, from any visitor). New after R5a for the owner: the signed-in home's Continue building and the `/account` tiles.

## 7. Acceptance checks and boundaries

### Functional checks

- Opening the builder, changing theme or appearance, and changing tabs create no server deck and no dirty state.
- The first real edit still creates exactly one deck.
- Keyboard additions, quantity changes, import and export, autosave retry, sharing, history restore, and leader replace with Undo retain their behavior.
- Mobile tab changes and responsive transitions preserve editor state.
- Magic and One Piece keep their own terminology, counts, validation, and tools; the One Piece single-panel tool pane renders correctly.
- Private decks and owner-only information stay protected across headers and deck collections.
- Every former `Modal` traps focus, closes on Escape, and restores focus; `/` and `?` are inert while a dialog is open.
- `.don-cost` renders on every cost surface. One Piece OG unfurls stay artless.

### Artwork checks

Cover no leader, one leader, partner leaders, leader replacement and removal, a selected printing, double-faced cards, missing artist metadata, failed image loads, and rapid selection changes. A stale request must never replace the latest leader's artwork. The attribution chip is visible whenever art_crop is on screen. One Piece never requests art while its adapter declares none.

### Visual and accessibility checks

Review at 390, 768, 1024, 1200, 1440, and 1920 px with long names, populated and empty decks, and both themes. Verify keyboard access, dialog focus, touch targets of at least 44 px, that reduced motion disables every decorative animation, text contrast per §1, and status indicators that never rely on color alone. Artwork and thumbnails never shift content (explicit width and height) and never block editing.

Run `pnpm check` for every package. Focused tests: tokens against CSS, the hotkey dialog guard, the search-state reducer, `thumbnailUrl`, the art resolver and stale guard, `colorSwatches`, and the responsive tab container's mount and preserve behavior. React Testing Library is installed and `src/lib/seo/jsonld.test.tsx` is the precedent. Visual review covers styling.

**Boundaries:** keep Next.js, Tailwind, Base UI and shadcn, the database, and the hosting approach. Preserve public URLs and guest building. No Vercel-proprietary SDKs, no image optimizer, no stored image URLs or artist column (Neon budget), and premium never gates card data. This redesign improves presentation and interaction; collection management, recommendation systems, and additional games stay under their own plans.

## Progress tracker

- [x] Review existing source and public UI (2026-09-05).
- [x] Select direction, game balance, art placement, motion level, and mobile structure (2026-09-05).
- [x] R0 — Revise the contract against `d4c21e5`, record decisions 1–4, place it in the repo (2026-09-08).
- [x] R1a — Foundation (2026-09-08: `ce4e544` primitives, `bcb8489` dialogs, `8f69064` tokens / theme / accents / icons / OG; LATER row 47 fired).
- [x] R1b — Shell (2026-09-09: `d0b25de` — `(site)` route group + SiteHeader with a client-side session slot, CardImage on all eight sites, EmptyState, GameSwitch, the three containers, the type scale, F13; LATER row 69 fired — `/c/`, `/l/`, `/cards/[id]` and their OG routes are ISR for real, proven on prod).
- [x] R3 — Desktop builder (2026-09-09: `d05a957` — the editor header (mark, game/format chip, name, fixed-width save slot, Share primary, More, appearance menu; AppearanceRow retired), the search state machine with thumbnails and active-row actions, `useEditorHotkeys`, keycaps and the `?` sheet, sticky search input and group headers, hover/focus-within steppers with a fixed pip column, the One Piece id and stat badges, Base UI Tabs with a sliding indicator, Segmented on ToggleGroup, the add toast with Undo, the save-slot micro-animation, the import count-up, the completion ring, the Warden line, and the leader-replace / Choose / single-panel fixes; 581 tests).
- [x] R2 — Deck artwork (2026-09-09: `096df3b` — the `CardArt` descriptor and Scryfall resolver refactored out of the OG path, `GET /api/cards/[id]/art`, `capabilities.ambientArt` + `display.colorSwatches`, the Background art preference under `deckwarden:appearance`, and the ambient layer with the credit chip behind the builder and the share page; 627 tests).
- [x] R5a — Public surfaces I (2026-09-10: `02b4b6a` — the equal two-game homepage (hero, two game cards with real shelves: Magic's most-played commanders with `small` images, One Piece's leaders by recent Top finish under the Limitless credit), Continue building (server-rendered for an account, client-rendered from claim tokens for a guest), the recent rail as `DeckTile`s with the 3 px identity strip, the capabilities strip; `DeckTile` on `/c/` and `/account`; `ColorChip` on the three filter sites; the `/commanders` List / Grid view under `deckwarden:index-view`; the mine route's additive `leaderImage`; `DB_LOG` statement log; 660 tests; route table unchanged).
- [ ] R5b — Public surfaces II.
- [ ] R4 — Responsive builder.
- [ ] R6 — Interaction polish and accessibility.
