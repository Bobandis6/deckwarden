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

  // U3b (WAVE5.md D4; F8): the chrome material and its two fallbacks.
  const MATERIAL = {
    chrome: "color-mix(in oklab, var(--background) 88%, transparent)",
    "chrome-backdrop": "blur(12px) saturate(150%)",
    "chrome-edge": "transparent",
    "chrome-fade": "color-mix(in oklab, var(--background) 60%, transparent)",
  };
  const FALLBACK = {
    chrome: "var(--background)",
    "chrome-backdrop": "none",
    "chrome-edge": "var(--border)",
    "chrome-fade": "transparent",
  };
  /** Every `:root { … }` block's declarations, in order, from the comment-stripped stylesheet. */
  function rootBlocks(source: string): { index: number; decls: Record<string, string> }[] {
    return [...source.matchAll(/(?:^|\n)\s*:root\s*\{([^}]*)\}/g)].map((m) => ({
      index: m.index!,
      decls: Object.fromEntries(
        [...m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
      ),
    }));
  }

  it("the chrome material is the background at 88 % in oklab with a 12 px blur, one theme-neutral block of its own (U3b)", () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const material = rootBlocks(code).filter((b) => "chrome" in b.decls);
    // The base block and one :root inside each fallback rule.
    expect(material).toHaveLength(3);
    expect(material[0].decls).toEqual(MATERIAL);
    // After the edge pair (its pin wants one declaration a block) and before the base layer.
    expect(material[0].index).toBeGreaterThan(code.lastIndexOf("--border-control:"));
    expect(material[0].index).toBeLessThan(code.indexOf("@layer base"));
    // Theme-neutral: the theme class sits on <html>, so no .dark copy.
    expect(code).not.toMatch(/\.dark\s*\{[^}]*--chrome/);
    // oklab, not oklch: an oklch mix of a near-neutral with transparent paints at hue 0 in Chromium.
    expect(code).not.toMatch(/--chrome[a-z-]*:\s*color-mix\(in oklch/);
  });

  it("less transparency or more contrast: the solid strip, no blur, the stuck heading's hairline back (U3b, F8)", () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const base = code.indexOf("--chrome: color-mix(");
    for (const query of ["(prefers-reduced-transparency: reduce)", "(prefers-contrast: more)"]) {
      const at = code.indexOf(`@media ${query}`);
      expect(at, query).toBeGreaterThan(base); // later, so it wins over the base block
      const body = code.slice(at).match(/^@media [^{]+\{\s*(:root\s*\{[^}]*\})\s*\}/)?.[1];
      expect(body, query).toBeDefined(); // exactly one rule inside: the :root override
      expect(rootBlocks(body!)[0].decls, query).toEqual(FALLBACK);
    }
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

  // U8 (WAVE5.md D3): the type ladder, D3's table in px — each step's face,
  // size, leading, tracking and weight set together by one class.
  const LADDER: Record<
    string,
    { face: "display" | "sans"; size: number; leading: number; tracking: string; weight: number }
  > = {
    "type-display": { face: "display", size: 48, leading: 50, tracking: "-0.02em", weight: 700 },
    "type-title": { face: "display", size: 30, leading: 36, tracking: "-0.015em", weight: 600 },
    "type-section": { face: "display", size: 18, leading: 26, tracking: "0", weight: 600 },
    "type-small": { face: "display", size: 14, leading: 20, tracking: "0.005em", weight: 600 },
    "type-caption": { face: "display", size: 13, leading: 20, tracking: "0.01em", weight: 500 },
    "type-body": { face: "sans", size: 14, leading: 20, tracking: "0", weight: 400 },
    "type-label": { face: "sans", size: 14, leading: 20, tracking: "0", weight: 500 },
    "type-label-sm": { face: "sans", size: 13, leading: 18, tracking: "0.005em", weight: 500 },
    "type-label-xs": { face: "sans", size: 12, leading: 16, tracking: "0.01em", weight: 500 },
    "type-meta": { face: "sans", size: 12, leading: 16, tracking: "0.01em", weight: 400 },
    "type-meta-multiline": { face: "sans", size: 12, leading: 18, tracking: "0.01em", weight: 400 },
    "type-eyebrow": { face: "sans", size: 12, leading: 16, tracking: "0.025em", weight: 500 },
    "type-micro": { face: "sans", size: 10.4, leading: 16, tracking: "0.02em", weight: 500 },
  };
  const rem = (px: number) => `${px / 16}rem`;

  /** Declarations of `.name { … }` in the comment-stripped stylesheet. */
  function rule(name: string): Record<string, string> {
    const body = code.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`))?.[1];
    if (body === undefined) throw new Error(`no .${name} rule in globals.css`);
    return Object.fromEntries(
      [...body.matchAll(/([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  }

  it("the type ladder: every step sets face, size, leading, tracking and weight together (U8)", () => {
    for (const [name, step] of Object.entries(LADDER)) {
      expect(rule(name), name).toEqual({
        "font-family": step.face === "display" ? "var(--font-display)" : "var(--font-sans)",
        "font-size": rem(step.size),
        "line-height": rem(step.leading),
        "letter-spacing": step.tracking,
        "font-weight": String(step.weight),
        // The eyebrow is meta's uppercase form (D0: list groups only).
        ...(name === "type-eyebrow" ? { "text-transform": "uppercase" } : {}),
      });
    }
    // No other step exists, and the ladder lives in the components layer, so
    // a utility at a call site still wins (the converted sites carry none).
    const names = [...code.matchAll(/\.(type-[a-z-]+)\s*\{/g)].map((m) => m[1]);
    expect(names).toEqual(Object.keys(LADDER));
    const layer = [...code.matchAll(/@layer components \{([\s\S]*?)\n\}/g)].find((m) =>
      m[1].includes(".type-display"),
    )?.[1];
    for (const name of Object.keys(LADDER)) expect(layer, name).toContain(`.${name} {`);
    // Literata's optical size stays auto: nothing pins an axis.
    expect(code).not.toMatch(/font-variation-settings|font-optical-sizing/);
  });

  it("the theme change eases body's background 250 ms on settle-250, motion-safe, only after hydration (U8)", () => {
    const base = code.slice(code.indexOf("@layer base {"));
    const baseBlock = base.slice(0, base.indexOf("\n}\n"));
    const media =
      baseBlock.match(
        /@media \(prefers-reduced-motion: no-preference\)\s*\{([\s\S]*?)\n  \}/,
      )?.[1] ?? "";
    // Gated by the attribute ThemeProvider sets after hydration (first paint never animates).
    expect(media).toMatch(/\[data-theme-ready\] body\s*\{/);
    // Layered !important: outranks next-themes' unlayered `transition: none !important`.
    // The background only: an eased color is inherited, so every element
    // would restyle on every frame (measured, REDESIGN "U8 decisions").
    expect(media).toContain("transition-property: background-color !important;");
    expect(media).toContain("transition-duration: 250ms !important;");
    expect(media).toContain("transition-timing-function: var(--ease-settle-250) !important;");
    // Never in the reduced-motion block (its exception lists no html or body).
    const reduce =
      code.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(reduce).not.toMatch(/data-theme-ready|\bbody\b|\bhtml\b/);
  });

  it("the skip link's landing on main draws no page-sized ring (U8)", () => {
    expect(code).toMatch(/#main:focus\s*\{\s*outline: none;\s*\}/);
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
