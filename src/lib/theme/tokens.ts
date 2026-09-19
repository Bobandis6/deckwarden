/**
 * One token source (R1a structure, W1 values — "Warden Studio, re-keyed",
 * WAVE2.md D0): the hex values the site's CSS custom properties carry in
 * each theme, exported for the one consumer that cannot read CSS — satori,
 * which paints the OG unfurls.
 *
 * CSS cannot import TypeScript, so `src/app/globals.css` repeats these
 * strings by hand; `tokens.test.ts` parses that file from disk and asserts
 * exact equality, block for block (`:root` ↔ light, `.dark` ↔ dark). Change
 * a value here and the test tells you which CSS line to update.
 *
 * Contrast (WCAG, measured 2026-09-19 for the crest re-key): foreground
 * 16.5:1 dark / 13.0:1 light; muted-foreground 8.5:1 dark (6.9 on popover,
 * 5.9 on hover) / 6.1:1 light (5.2 on hover); brand text — gold 8.3:1 dark
 * (6.8 on popover), green 9.3:1 light; Magic accent 8.5:1 / 5.6 on muted;
 * One Piece accent 10.6:1 / 5.9 (5.5 on muted); destructive 6.8 / 5.9.
 * Every text pair is AA on its theme's surfaces. Two fills are NOT text
 * colors by design: primary green is 1.84:1 on the dark page (its ivory
 * label carries 9.3:1, and the primary button's gold hairline is the
 * control's boundary), and light-theme gold is 2.4:1 on ivory (decorative
 * only there). The full table is WAVE2.md D0; deviations land in
 * REDESIGN.md's Wave-2 addendum.
 */
import { GAME_ID } from "@/db/seed-data";

/** Light theme — the `:root` block. */
export const light = {
  background: "#f7f4ee",
  foreground: "#242c2f",
  card: "#fffdf8",
  "card-foreground": "#242c2f",
  popover: "#ffffff",
  "popover-foreground": "#242c2f",
  primary: "#23483c",
  "primary-foreground": "#f7f4ee",
  secondary: "#ece7dc",
  "secondary-foreground": "#242c2f",
  muted: "#f0ebe1",
  "muted-foreground": "#565e5b",
  accent: "#e9e3d6",
  "accent-foreground": "#242c2f",
  destructive: "#b91c1c",
  border: "#e0d9ca",
  input: "#cfc6b2",
  ring: "#23483c",
  "chart-1": "#23483c",
  "chart-2": "#6f746f",
  "chart-3": "#0a6587",
  "chart-4": "#5246cf",
  "chart-5": "#565e5b",
  brand: "#23483c",
  "accent-mtg": "#5246cf",
  "accent-optcg": "#0a6587",
  gold: "#ba9b61",
} as const;

/** Dark theme (the default) — the `.dark` block. */
export const dark = {
  background: "#0f1314",
  foreground: "#f3f1ea",
  card: "#171c1e",
  "card-foreground": "#f3f1ea",
  popover: "#20272a",
  "popover-foreground": "#f3f1ea",
  primary: "#23483c",
  "primary-foreground": "#f7f4ee",
  secondary: "#252d30",
  "secondary-foreground": "#f3f1ea",
  muted: "#20272a",
  "muted-foreground": "#a9b0ad",
  accent: "#2a3336",
  "accent-foreground": "#f3f1ea",
  destructive: "#f87171",
  border: "#2b3437",
  input: "#2b3437",
  ring: "#c9a96a",
  "chart-1": "#c9a96a",
  "chart-2": "#8b9391",
  "chart-3": "#62d6c5",
  "chart-4": "#b5a2ff",
  "chart-5": "#a9b0ad",
  brand: "#c9a96a",
  "accent-mtg": "#b5a2ff",
  "accent-optcg": "#62d6c5",
  gold: "#c9a96a",
} as const;

export type TokenName = keyof typeof light;

/** Panel corners; controls derive from it through the @theme radius scale. */
export const radius = "0.75rem";

/**
 * OG unfurls always paint the dark theme — Discord/Twitter cards sit on the
 * viewer's chrome, not ours, so there is no light variant to honor.
 */
export const og = {
  bg: dark.background,
  fg: dark.foreground,
  muted: dark["muted-foreground"],
  /** Stat chips and the empty curve bars — the panel/raised surfaces. */
  panel: dark.card,
  raised: dark.popover,
  /** Pages with no game context: the pre-W1 indigo, kept deliberately —
   *  the OG images are W2's package (wordmark, font, gold accent) and the
   *  unfurl canvas already follows the dark tokens above. */
  accentGeneric: "#a5b4fc",
} as const;

/**
 * The accent an OG image paints for a game: the game accent of the unfurled
 * surface, the generic indigo when the page has none (REDESIGN.md §1).
 */
export function ogAccent(gameId: number | null): string {
  if (gameId === GAME_ID.mtg) return dark["accent-mtg"];
  if (gameId === GAME_ID.optcg) return dark["accent-optcg"];
  return og.accentGeneric;
}

/** `#rrggbb` → `rgba(r,g,b,a)` for satori gradients that blend into a token. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
