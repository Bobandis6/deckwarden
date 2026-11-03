"use client";

/**
 * Theme provider (R1a, C11 — fires LATER.md row 47). next-themes toggles the
 * `dark` class that `@custom-variant dark` in globals.css keys on, and its
 * inline script runs during HTML parsing — before first paint — so a fresh
 * load is dark with no light flash. Dark is the default; Light and System
 * are the other two choices (AppearanceMenu). enableColorScheme also sets
 * `color-scheme` on <html> so native form controls and scrollbars follow.
 *
 * The provider sits in the root layout, OUTSIDE the editor tree: a theme
 * change re-renders nothing that owns deck state, so it can never mark a
 * deck dirty or trigger a save (REDESIGN.md §7).
 *
 * The change itself (VIEW-TRANSITIONS, 2026-11-02): the Appearance menu runs
 * the flip inside a view transition that reveals the new theme from the
 * item that chose it (lib/theme/theme-reveal.ts). That replaced U8's eased
 * body background and its `data-theme-ready` gate, so this provider marks
 * nothing on <html> after hydration. disableTransitionOnChange stays: it
 * drops every element's own transition at the flip, which is exactly right
 * when the reveal is the one animation.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
