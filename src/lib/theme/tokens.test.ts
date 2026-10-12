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
import {
  borderControl,
  dark,
  light,
  og,
  ogAccent,
  radius,
  rgba,
  sampleLinear,
  settle400,
} from "./tokens";

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

  it("the control edge is the foreground at 55 % (light) / 40 % (dark) over transparent, in its own pair (U1)", () => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const decl = (pct: number) =>
      esc(`--border-control: color-mix(in oklch, var(--foreground) ${pct}%, transparent);`);
    const lightRule = css.match(
      new RegExp(`\\n:root\\s*\\{\\s*${decl(borderControl.light)}\\s*\\}`),
    );
    const darkRule = css.match(
      new RegExp(`\\n\\.dark\\s*\\{\\s*${decl(borderControl.dark)}\\s*\\}`),
    );
    expect(lightRule).not.toBeNull();
    expect(darkRule).not.toBeNull();
    // After the hex token blocks (block() reads the FIRST :root and .dark)
    // and the accent rules; before the base layer.
    expect(lightRule!.index!).toBeGreaterThan(css.indexOf("[data-game] {"));
    expect(darkRule!.index!).toBeGreaterThan(lightRule!.index!);
    expect(darkRule!.index!).toBeLessThan(css.indexOf("@layer base"));
    expect(borderControl).toEqual({ light: 55, dark: 40 });
  });

  it("the accents are exposed as Tailwind colors", () => {
    for (const name of ["brand", "accent-mtg", "accent-optcg", "accent-game", "gold"]) {
      expect(css).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it("the display face is exposed as a font utility, and headings stay sans (W1)", () => {
    expect(css).toContain("--font-display: var(--font-literata);");
    // Dialog/sheet/drawer titles read --font-heading; serif there is W2's call.
    expect(css).toContain("--font-heading: var(--font-sans);");
  });

  it("the DON!! cost chip is foreground-on-background, a rounded square (C4)", () => {
    const rule = css.match(/\.don-cost\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("background: var(--foreground);");
    expect(rule).toContain("color: var(--background);");
    expect(rule).toContain("font-variant-numeric: tabular-nums;");
    expect(rule).not.toContain("9999px");
  });

  // U2 (WAVE5.md D2): the four curves verbatim from the design lab.
  const CURVES = {
    "settle-120":
      "linear(0, 0.132, 0.358, 0.563, 0.717, 0.823, 0.892, 0.936, 0.963, 0.98, 0.99, 0.996, 1)",
    "settle-250":
      "linear(0, 0.045, 0.144, 0.264, 0.385, 0.497, 0.596, 0.682, 0.753, 0.811, 0.859, 0.897, 0.928, 0.952, 0.972, 0.987, 1)",
    "settle-400":
      "linear(0, 0.041, 0.133, 0.245, 0.36, 0.469, 0.566, 0.65, 0.721, 0.78, 0.828, 0.867, 0.898, 0.923, 0.943, 0.959, 0.971, 0.981, 0.989, 0.995, 1)",
    "flick-400":
      "linear(0, 0.029, 0.103, 0.2, 0.309, 0.419, 0.523, 0.618, 0.701, 0.772, 0.831, 0.879, 0.917, 0.946, 0.968, 0.983, 0.994, 1.001, 1.005, 1.006, 1.006, 1.006, 1.004, 1.002, 1)",
  };

  /** The stylesheet without its comments (they name the curves U2 retired). */
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the four motion curves are the lab's, and the only ones (U2)", () => {
    // Prettier spreads a long linear() over lines; compare the words.
    const theme = (css.match(/\n@theme \{([\s\S]*?)\n\}/)?.[1] ?? "")
      .replace(/\s+/g, " ")
      .replace(/\( /g, "(")
      .replace(/ \)/g, ")");
    expect(theme).toContain("--ease-*: initial;");
    for (const [name, curve] of Object.entries(CURVES)) {
      expect(theme).toContain(`--ease-${name}: ${curve};`);
    }
    expect(theme.match(/--ease-[a-z0-9-]+:/g)).toHaveLength(4);
    expect(theme).toContain("--default-transition-duration: 120ms;");
    expect(theme).toContain("--default-transition-timing-function: var(--ease-settle-120);");
    // No other curve is written anywhere in the stylesheet.
    expect(code).not.toMatch(/cubic-bezier|\bease-out\b|\bease-in-out\b/);
  });

  it("the count-up's settle-400 points are the stylesheet's, and sample as straight lines (U2)", () => {
    expect(`linear(${settle400.join(", ")})`).toBe(CURVES["settle-400"]);
    expect(sampleLinear(settle400, 0)).toBe(0);
    expect(sampleLinear(settle400, 1)).toBe(1);
    expect(sampleLinear(settle400, 0.05)).toBeCloseTo(0.041); // the 2nd of 21 points
    expect(sampleLinear(settle400, 0.075)).toBeCloseTo((0.041 + 0.133) / 2);
  });

  it("dw-in / dw-out animate opacity and transform only, on the cross-fade slot by default (U2)", () => {
    for (const name of ["dw-in", "dw-out"]) {
      const frames = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`))?.[1];
      expect(frames, name).toBeDefined();
      const props = [...frames!.matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
      expect(new Set(props), name).toEqual(new Set(["opacity", "transform"]));
      expect(css).toContain(
        `--animate-${name}: ${name} var(--tw-duration, 250ms) var(--tw-ease, var(--ease-settle-250)) both;`,
      );
    }
    // The parameters are registered and never inherited.
    for (const param of ["--dw-opacity", "--dw-scale", "--dw-x", "--dw-y"]) {
      const reg = css.match(new RegExp(`@property ${param} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(reg, param).toContain("inherits: false;");
    }
  });

  it("the ring glow animates opacity and scale, never a filter (U2)", () => {
    const frames = css.match(/@keyframes ring-glow \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(frames).toContain("opacity:");
    expect(frames).toContain("transform: scale(");
    expect(frames).not.toContain("filter");
    expect(code).not.toContain("drop-shadow");
    expect(css).toContain("--animate-ring-glow: ring-glow 400ms var(--ease-settle-400) 1 both;");
  });

  it("the reduced-motion exception: five surfaces fade 150 ms on opacity, nothing moves, nothing is un-positioned (U2, F7)", () => {
    const media =
      css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? "";
    // After the * rule, inside the same block.
    expect(media.indexOf("[data-slot=")).toBeGreaterThan(
      media.indexOf("transition-duration: 0.01ms"),
    );
    for (const slot of [
      '[data-slot="dialog-content"]',
      '[data-slot="alert-dialog-content"]',
      '[data-slot="drawer-popup"]',
      '[data-slot="toast"]',
      '[data-slot="save-slot"] *',
      '[data-slot="save-slot"] *::before',
    ]) {
      expect(media, slot).toContain(slot);
    }
    for (const decl of [
      "transition-property: opacity !important;",
      "transition-duration: 150ms !important;",
      "animation-duration: 150ms !important;",
      "--dw-scale: 1 !important;",
      "--dw-x: 0px !important;",
      "--dw-y: 0px !important;",
      "transition-delay: 0s, 150ms !important;",
    ]) {
      expect(media, decl).toContain(decl);
    }
    // Dialogs centre by translate; the drawer and toasts sit by transform.
    expect(media).not.toMatch(/(?:^|[\s;{])(?:transform|translate|scale): none/);
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

  it("accent per game: Magic lavender, One Piece teal; generic is the brand gold (W2)", () => {
    expect(ogAccent(GAME_ID.mtg)).toBe("#b5a2ff");
    expect(ogAccent(GAME_ID.optcg)).toBe("#62d6c5");
    expect(ogAccent(GAME_ID.azuki)).toBe("#c9a96a");
    expect(ogAccent(null)).toBe(og.accentGeneric);
    // A reference, not a second literal: the generic accent IS dark gold.
    expect(og.accentGeneric).toBe(dark.gold);
  });

  it("rgba() blends a token for satori gradients", () => {
    expect(rgba("#101218", 0.45)).toBe("rgba(16,18,24,0.45)");
    expect(rgba("#ffffff", 0)).toBe("rgba(255,255,255,0)");
  });
});
