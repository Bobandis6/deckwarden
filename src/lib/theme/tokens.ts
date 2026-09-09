/**
 * One token source (R1a, REDESIGN.md §1 "Warden Studio"): the hex values the
 * site's CSS custom properties carry in each theme, exported for the one
 * consumer that cannot read CSS — satori, which paints the OG unfurls.
 *
 * CSS cannot import TypeScript, so `src/app/globals.css` repeats these
 * strings by hand; `tokens.test.ts` parses that file from disk and asserts
 * exact equality, block for block (`:root` ↔ light, `.dark` ↔ dark). Change
 * a value here and the test tells you which CSS line to update.
 *
 * Contrast (WCAG, measured 2026-09-08): foreground 17.0:1 dark / 15.7:1
 * light; secondary text 8.8:1 / 5.3:1; brand text 6.3:1 / 7.4:1; Magic
 * accent 8.5:1 / 5.5:1; One Piece accent 10.7:1 / 5.1:1; destructive
 * 6.8:1 / 6.1:1. Every pair is AA on its theme's background.
 */
import { GAME_ID } from "@/db/seed-data";

/** Light theme — the `:root` block. */
export const light = {
  background: "#f7f7fb",
  foreground: "#1b1d26",
  card: "#ffffff",
  "card-foreground": "#1b1d26",
  popover: "#ffffff",
  "popover-foreground": "#1b1d26",
  primary: "#4f46e5",
  "primary-foreground": "#ffffff",
  secondary: "#e8eaf2",
  "secondary-foreground": "#1b1d26",
  muted: "#eeeff5",
  "muted-foreground": "#5f6775",
  accent: "#e6e8f1",
  "accent-foreground": "#1b1d26",
  destructive: "#b91c1c",
  border: "#e2e4ec",
  input: "#d8dbe6",
  ring: "#4f46e5",
  "chart-1": "#4f46e5",
  "chart-2": "#6b7280",
  "chart-3": "#0f766e",
  "chart-4": "#5b50d6",
  "chart-5": "#5f6775",
  brand: "#4338ca",
  "accent-mtg": "#5b50d6",
  "accent-optcg": "#0f766e",
} as const;

/** Dark theme (the default) — the `.dark` block. */
export const dark = {
  background: "#101218",
  foreground: "#f3f4f8",
  card: "#191d27",
  "card-foreground": "#f3f4f8",
  popover: "#222837",
  "popover-foreground": "#f3f4f8",
  primary: "#4f46e5",
  "primary-foreground": "#ffffff",
  secondary: "#262d3c",
  "secondary-foreground": "#f3f4f8",
  muted: "#222837",
  "muted-foreground": "#aab2c3",
  accent: "#2b3345",
  "accent-foreground": "#f3f4f8",
  destructive: "#f87171",
  border: "#2a3040",
  input: "#2a3040",
  ring: "#818cf8",
  "chart-1": "#818cf8",
  "chart-2": "#8b93a5",
  "chart-3": "#62d6c5",
  "chart-4": "#b5a2ff",
  "chart-5": "#aab2c3",
  brand: "#818cf8",
  "accent-mtg": "#b5a2ff",
  "accent-optcg": "#62d6c5",
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
  /** Pages with no game context: brand, one step lighter for the dark canvas. */
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
