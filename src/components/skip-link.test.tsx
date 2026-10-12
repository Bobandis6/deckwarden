/**
 * Skip to content (U8, WAVE5.md D3): a link to #main named "Skip to
 * content", visually hidden until it takes focus; once hydrated, a click
 * moves focus INTO the page's <main id="main"> through a tabindex that
 * leaves on blur (main never joins the tab order) and keeps the URL clean;
 * with no main it falls back to the plain fragment. The target exists on
 * every page: each <main> the app renders carries id="main" (a scan of the
 * source, so a new page can't forget it). The root layout renders the link
 * first (layout.test.tsx).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "./skip-link";

describe("SkipLink", () => {
  it("is a link to #main named Skip to content, hidden until it has focus", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link.getAttribute("href")).toBe("#main");
    for (const cls of ["sr-only", "focus:not-sr-only", "focus:fixed", "type-label"]) {
      expect(link.className, cls).toContain(cls);
    }
  });

  it("a click focuses main through a tabindex that leaves on blur, and keeps the URL", () => {
    render(
      <>
        <SkipLink />
        <header>
          <button type="button">Menu</button>
        </header>
        <main id="main">
          <button type="button">First control</button>
        </main>
      </>,
    );
    const main = screen.getByRole("main");
    const link = screen.getByRole("link", { name: "Skip to content" });
    link.focus();
    // fireEvent returns false when a handler prevented the default (the hash jump).
    expect(fireEvent.click(link)).toBe(false);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(window.location.hash).toBe("");
    // Leaving main takes the tabindex with it: main is never a tab stop.
    act(() => screen.getByRole("button", { name: "First control" }).focus());
    expect(main.hasAttribute("tabindex")).toBe(false);
  });

  it("with no main on the page, the plain fragment is left to the browser", () => {
    render(<SkipLink />);
    expect(fireEvent.click(screen.getByRole("link", { name: "Skip to content" }))).toBe(true);
  });
});

/** Every .tsx under src that isn't a test, as [repo-relative path, source]. */
function sources(dir: string): [string, string][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) return [];
    return [[relative(process.cwd(), path), readFileSync(path, "utf8")] as [string, string]];
  });
}

describe("the skip link's target", () => {
  it('every <main> the app renders carries id="main", first', () => {
    let mains = 0;
    for (const [path, text] of sources(join(process.cwd(), "src"))) {
      // Comments may say "<main>"; markup is what counts.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const match of code.matchAll(/<main[\s>/]/g)) {
        mains += 1;
        expect(code.slice(match.index, match.index + 30), path).toMatch(/^<main\s+id="main"[\s>/]/);
      }
    }
    // Every page-level main (the pages, their loading and error shells, the
    // share page, the editor's panes); a sanity floor, not an exact count.
    expect(mains).toBeGreaterThanOrEqual(30);
  });
});
