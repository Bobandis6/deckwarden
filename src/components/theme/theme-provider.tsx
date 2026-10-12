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
 * The eased change (U8, WAVE5.md D3): globals.css eases body's background
 * over 250 ms once <html> carries `data-theme-ready`, which this sets after
 * hydration, so the inline script's class (and next-themes' own re-apply on
 * mount, whose effect runs first, as a child's) never animates a first
 * paint. disableTransitionOnChange stays: it drops every OTHER transition at
 * the flip, and the stylesheet's layered !important lets body's one rule
 * through.
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect, type ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Settle the hydrated theme's colors (a style read) before the gate
    // opens, so a class applied in this same effects pass can't ease in.
    getComputedStyle(document.body).getPropertyValue("background-color");
    document.documentElement.setAttribute("data-theme-ready", "");
  }, []);

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
