/**
 * The eased theme change's gate (U8, WAVE5.md D3): globals.css eases the
 * page's paint only under `[data-theme-ready]`, which ThemeProvider sets on
 * <html> once it has hydrated, never in the server markup, so a first
 * paint never animates. disableTransitionOnChange stays on (it drops every
 * other transition for the flip; the stylesheet's layered !important lets
 * the page's one rule through, pinned in tokens.test.ts).
 */
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme-ready");
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("opens the theme-ease gate after hydration, never in the server markup", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addListener() {}, removeListener() {} })),
    );
    const server = renderToStaticMarkup(
      <ThemeProvider>
        <p>Page</p>
      </ThemeProvider>,
    );
    expect(server).not.toContain("data-theme-ready");
    expect(document.documentElement.hasAttribute("data-theme-ready")).toBe(false);

    render(
      <ThemeProvider>
        <p>Page</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.hasAttribute("data-theme-ready")).toBe(true);
  });
});
