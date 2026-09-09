/**
 * The CSS ↔ TypeScript token pin (R1a, REDESIGN.md §1 "one token source").
 * globals.css cannot import tokens.ts, so this test reads the stylesheet
 * from disk and asserts the `:root` and `.dark` blocks carry exactly the
 * strings tokens.ts exports — same keys, same values. A value edited on one
 * side only fails here with the token's name.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GAME_ID } from "@/db/seed-data";
import { dark, light, og, ogAccent, radius, rgba } from "./tokens";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Declarations of the FIRST `selector { … }` block in the stylesheet. */
function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} block in globals.css`);
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const decl = line.trim().match(/^--([a-z0-9-]+):\s*([^;]+);$/);
    if (decl) out[decl[1]] = decl[2].trim().toLowerCase();
  }
  return out;
}

describe("theme tokens ↔ globals.css", () => {
  it(":root is the light theme, value for value, plus the panel radius", () => {
    expect(block(":root")).toEqual({ ...light, radius });
  });

  it(".dark is the dark theme, value for value", () => {
    expect(block(".dark")).toEqual({ ...dark });
  });

  it("every token is a lowercase #rrggbb so CSS and satori agree byte for byte", () => {
    for (const set of [light, dark]) {
      for (const [name, value] of Object.entries(set)) {
        expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("game accents ride data-game and recolor the focus ring (G1)", () => {
    expect(block('[data-game="mtg"]')).toEqual({ "accent-game": "var(--accent-mtg)" });
    expect(block('[data-game="optcg"]')).toEqual({ "accent-game": "var(--accent-optcg)" });
    expect(block("[data-game]")).toEqual({ ring: "var(--accent-game)" });
    // No game context → the brand carries the accent.
    expect(css).toMatch(/:root\s*\{\s*--accent-game: var\(--brand\);\s*\}/);
  });

  it("the accents are exposed as Tailwind colors", () => {
    for (const name of ["brand", "accent-mtg", "accent-optcg", "accent-game"]) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it("the DON!! cost chip is foreground-on-background, a rounded square (C4)", () => {
    const rule = css.match(/\.don-cost\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("background: var(--foreground);");
    expect(rule).toContain("color: var(--background);");
    expect(rule).toContain("font-variant-numeric: tabular-nums;");
    expect(rule).not.toContain("9999px");
  });

  it("reduced motion collapses every animation and transition (motion policy)", () => {
    const rule = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toContain("animation-duration: 0.01ms !important;");
    expect(rule).toContain("transition-duration: 0.01ms !important;");
  });
});

describe("OG palette", () => {
  it("paints the dark theme's canvas, text and surfaces", () => {
    expect(og.bg).toBe(dark.background);
    expect(og.fg).toBe(dark.foreground);
    expect(og.muted).toBe(dark["muted-foreground"]);
    expect(og.panel).toBe(dark.card);
    expect(og.raised).toBe(dark.popover);
  });

  it("accent per game: Magic lavender, One Piece teal, generic indigo elsewhere", () => {
    expect(ogAccent(GAME_ID.mtg)).toBe("#b5a2ff");
    expect(ogAccent(GAME_ID.optcg)).toBe("#62d6c5");
    expect(ogAccent(GAME_ID.azuki)).toBe("#a5b4fc");
    expect(ogAccent(null)).toBe(og.accentGeneric);
  });

  it("rgba() blends a token for satori gradients", () => {
    expect(rgba("#101218", 0.45)).toBe("rgba(16,18,24,0.45)");
    expect(rgba("#ffffff", 0)).toBe("rgba(255,255,255,0)");
  });
});
