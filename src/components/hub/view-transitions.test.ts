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
import { readFileSync } from "node:fs";
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
    expect(grid).toContain('import { ViewTransition } from "react";');
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
