/**
 * ThemeProvider (R1a, C11): next-themes with the dark default, marking
 * nothing on <html> of its own. U8's eased theme change gated on
 * `data-theme-ready`; VIEW-TRANSITIONS (2026-11-02) retired that ease for
 * the Appearance menu's reveal (lib/theme/theme-reveal.ts), so the gate is
 * gone from the markup, the provider and the stylesheet (pinned in
 * tokens.test.ts).
 */
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "./theme-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("renders its children and sets no gate attribute, on the server or after hydration", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addListener() {}, removeListener() {} })),
    );
    const server = renderToStaticMarkup(
      <ThemeProvider>
        <p>Page</p>
      </ThemeProvider>,
    );
    expect(server).toContain("<p>Page</p>");
    expect(server).not.toContain("data-theme-ready");

    render(
      <ThemeProvider>
        <p>Page</p>
      </ThemeProvider>,
    );
    expect(screen.getByText("Page")).toBeTruthy();
    expect(document.documentElement.hasAttribute("data-theme-ready")).toBe(false);
  });
});
