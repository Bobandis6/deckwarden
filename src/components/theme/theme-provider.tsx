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
