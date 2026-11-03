/**
 * The card persists across navigation (VIEW-TRANSITIONS, 2026-11-02; the
 * owner's pick from DESIGN-REFERENCES-2026-11-02.md, idea 1, phase 1; the
 * reference is Design Spells 346, Doji). The grid tile on /commanders and
 * /leaders and the hub hero on /c/ and /l/ are React <ViewTransition>
 * boundaries with the same name, so a navigation between them moves one
 * card instead of swapping two pages; globals.css times the `.morph`
 * pseudo-elements (tokens.test.ts pins that). React names the element only
 * while a transition runs and renders no DOM of its own, so jsdom cannot
 * see the boundary: this pins the three call sites in source instead. One
 * boundary per hub page: a duplicate name aborts the browser's transition.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const grid = read("src/components/hub/leader-index-view.tsx");
const hubs = {
  "/c/[slug]": read("src/app/(site)/c/[slug]/page.tsx"),
  "/l/[slug]": read("src/app/(site)/l/[slug]/page.tsx"),
};

describe("the hub card morph (VIEW-TRANSITIONS)", () => {
  it("the grid tile is a boundary named by the leader's slug, a morph with no animation of its own", () => {
    expect(grid).toContain('import { ViewTransition, type ReactNode } from "react";');
    expect(grid).toMatch(
      /<ViewTransition name=\{`hub-card-\$\{leader\.slug\}`\} share="morph" default="none">\s*<CardImage/,
    );
    expect(grid.match(/<ViewTransition /g)).toHaveLength(1);
  });

  it("the grid asks for the hub whole: on sight for the eager tiles, on intent for the rest, so the pair can form", () => {
    // A hub is ISR behind a loading.tsx, so Link's default prefetch is the
    // skeleton alone and a click would commit it first, with no pair.
    expect(grid).toContain("prefetch={i < EAGER_CARDS ? true : undefined}");
    for (const intent of ["onMouseEnter", "onFocus", "onTouchStart"]) {
      expect(grid).toContain(`${intent}={warmHub(\`\${hub}\${leader.slug}\`)}`);
    }
    expect(grid).toContain(
      'const FULL_PREFETCH: PrefetchOptions = { kind: "full" as PrefetchOptions["kind"] };',
    );
    expect(grid).toContain("router.prefetch(href, FULL_PREFETCH)");
  });

  it("the hubs have no loading.tsx: a route-level fallback committed before the hub on every navigation and broke the pair (LATER row 395, experiment a)", () => {
    for (const dir of ["src/app/(site)/c/[slug]", "src/app/(site)/l/[slug]"]) {
      expect(existsSync(join(process.cwd(), dir, "loading.tsx"))).toBe(false);
      // The 404 guard that the loading boundary once forced into the layout stays there.
      expect(readFileSync(join(process.cwd(), dir, "layout.tsx"), "utf8")).toContain("notFound()");
    }
  });

  it("the tile answers a waiting click: the pending dim sits outside the card's boundary, after 150 ms, on settle-250", () => {
    expect(grid).toMatch(/<TileBody>\s*\{\/\*[\s\S]*?\*\/\}\s*<ViewTransition/);
    expect(grid).toContain("data-pending={pending || undefined}");
    expect(grid).toContain(
      "motion-safe:[transition:opacity_250ms_var(--ease-settle-250)_150ms] data-pending:opacity-60",
    );
  });

  for (const [route, code] of Object.entries(hubs)) {
    it(`${route}'s hero is the one boundary on the page, named like the grid's`, () => {
      expect(code).toContain('import { ViewTransition } from "react";');
      expect(code).toMatch(
        /<ViewTransition name=\{`hub-card-\$\{slug\}`\} share="morph" default="none">\s*<CardImage/,
      );
      expect(code.match(/<ViewTransition /g)).toHaveLength(1);
    });
  }
});
