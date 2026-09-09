# Deckwarden — Redesign Plan (R-series)

**Status:** R1a shipped 2026-09-08 (progress tracker below); R1b is next. This file is the contract for the R-series work packages.
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

- A shared nullable `CardArt` descriptor: `{ url, layout: "art_crop" | "full_card", artist?, credit }`.
- Adapter contract: `capabilities.ambientArt?: { kind: "art_crop" | "full_card" }` (Magic declares `art_crop`; One Piece declares nothing) and `display.colorSwatches?`.
- `GET /api/cards/[id]/art?printingId=`: validates that the printing belongs to the card, resolves the default printing otherwise, returns null art when the artist is unknown, `Cache-Control: public, s-maxage=86400`. Server components (hubs, deck pages) call the resolver directly; deck collections batch the printing lookups.
- Fetch on leader-selection change only; never enrich every search result; independent of autosave and validation.
- Deck API payloads, access controls, and adapter purity are unchanged.

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

Dependencies: R1a unblocks everything (tokens, primitives, theme). R1b needs R1a (the header uses the appearance menu and primitives). R3 needs R1a (Tabs, Toast, Meter, Dialog). R2 lands on R3's settled header and summary surface and adds the appearance-menu entry. R5a and R5b need R1b (header, `CardImage` for tiles) and R2 (art banner). R4 needs R3's builder surfaces and R1a's Drawer. R6 closes.

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
| 51 r2.dev images | gates One Piece thumbnails (R3) and tiles and home shelf images (R5a) until `img.deckwarden.gg` serves; hub and grid renders continue as today |
| 14 goldfish playtester | untouched; sample-hand polish adds no draw-next |
| 27 and 50 Deck Passport, folder and profile OG | untouched |

Smoke-pin ledger. Update a pin in the same commit as the copy change. `seo-smoke` mints fixture decks, so run it against dev only.

| Package | Pins |
|---|---|
| R1a | `scripts/engagement-smoke.ts` expects `♥` in the home HTML; keep the glyph as content |
| R1b | `scripts/optcg-smoke.ts` "Card image coming soon"; `scripts/engagement-smoke.ts` "No bookmarks yet"; `scripts/profile-folders-smoke.ts` "This folder is private"; `scripts/account-delete-smoke.ts` "Danger zone"; `scripts/seo-smoke.ts` home links to `/leaders` and `/cards?game=optcg` |
| R5a | `scripts/seo-smoke.ts` hero string "Build a legal deck, fast." → the new copy; `scripts/hubs-smoke.ts` "Curve of these staples" |
| R5b | "Build with this leader" and its href; ©BANDAI on `/leaders`, `/l/`, the One Piece card page, `/cards?game=optcg`, and the One Piece deck page; "A typical Commander deck", "Top finishes", "Combos with", "Decks with this commander"; no `>USD<` on the One Piece card page |

Open items:

- Hero wording: "Your next great deck starts here." stands until R5a proves it in place.
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
- [ ] R1b — Shell.
- [ ] R3 — Desktop builder.
- [ ] R2 — Deck artwork.
- [ ] R5a — Public surfaces I.
- [ ] R5b — Public surfaces II.
- [ ] R4 — Responsive builder.
- [ ] R6 — Interaction polish and accessibility.
