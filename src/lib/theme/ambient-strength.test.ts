/**
 * The ambient art's strength in the stylesheet (LIGHT-MODE-DAYLIGHT, 2026-10-31).
 * jsdom applies no custom property, so a render can't see what a reader gets:
 * this reads globals.css the way tokens.test.ts does and works out the page
 * under the crop. The two limits it holds apart: the builder's art on light
 * must stay visible (it was 2.8 % of the image at its strongest, and the owner
 * couldn't see it), and the quietest text must stay readable over the blackest
 * pixel a crop can have. Every other surface keeps R2's numbers.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { light } from "./tokens";

const code = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Declarations of the first `selector { … }` block after `from`. */
function rule(selector: string, from = 0): Record<string, string> {
  const at = code.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`no ${selector} block in globals.css`);
  const body = code.slice(at + selector.length + 2, code.indexOf("}", at));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z-]+):\s*([^;]+);/g)) out[match[1]] = match[2].trim();
  return out;
}

const BUILDER = ':root:not(.dark) [data-surface="editor"]';
const FALLBACK = "@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)";

/** The veil stop's share of the page: `color-mix(in oklab, var(--background) N%, transparent)`. */
function veilShare(token: string): number {
  const percent = token.match(
    /^color-mix\(in oklab, var\(--background\) (\d+)%, transparent\)$/,
  )?.[1];
  if (!percent) throw new Error(`not a veil stop: ${token}`);
  return Number(percent) / 100;
}

const channels = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The page under a black crop at this strength and this veil stop: the lowest it can go. */
function floor(page: number[], crop: number, veil: number): number[] {
  return page.map((v) => v * (1 - crop) * (1 - veil) + v * veil);
}

const STOPS = ["ambient-veil-top", "ambient-veil-middle", "ambient-veil-foot"];

describe("the ambient art's strength (globals.css)", () => {
  const builder = rule(BUILDER);

  it("every surface keeps R2's numbers: 4 % on light, 8 % on dark, the veil at 70 / 30 / 90", () => {
    const atBase = code.lastIndexOf(":root {", code.indexOf("--ambient-gradient-opacity"));
    const root = rule(":root", atBase);
    expect(root["ambient-gradient-opacity"]).toBe("0.04");
    expect(root["ambient-crop-opacity"]).toBe("0.04");
    expect(STOPS.map((stop) => veilShare(root[stop]))).toEqual([0.7, 0.3, 0.9]);
    const onDark = rule(".dark", atBase);
    expect(onDark["ambient-gradient-opacity"]).toBe("0.08");
    expect(onDark["ambient-crop-opacity"]).toBe("0.08");
    // The veil and the panes have no dark values of their own.
    expect(Object.keys(onDark).sort()).toEqual([
      "ambient-crop-opacity",
      "ambient-gradient-opacity",
    ]);
    expect(root["editor-pane-search"]).toBe("transparent");
    expect(root["editor-pane-tools"]).toBe("transparent");
  });

  it("the builder on light: only the crop moves, never the fallback gradient, and never on dark", () => {
    expect(builder).not.toHaveProperty("ambient-gradient-opacity");
    expect(code).not.toMatch(/\.dark\s+\[data-surface/);
    expect(Number(builder["ambient-crop-opacity"])).toBeGreaterThan(0.04);
  });

  it("the commander stays visible: over 4x the old 2.8 % at its strongest, and at least 3x R2 at every stop", () => {
    const crop = Number(builder["ambient-crop-opacity"]);
    const [top, middle, foot] = STOPS.map((stop) => crop * (1 - veilShare(builder[stop])));
    expect(middle).toBeGreaterThan(0.028 * 4);
    expect(top).toBeGreaterThanOrEqual(0.012 * 3);
    expect(foot).toBeGreaterThanOrEqual(0.004 * 3);
  });

  it("the text stays readable: muted and body text clear 4.5:1 over a black crop at every veil stop", () => {
    const crop = Number(builder["ambient-crop-opacity"]);
    const page = channels(light.background);
    for (const stop of STOPS) {
      const under = floor(page, crop, veilShare(builder[stop]));
      expect(contrast(channels(light["muted-foreground"]), under), stop).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(channels(light.foreground), under), stop).toBeGreaterThanOrEqual(7);
    }
  });

  it("the credit chip keeps its words at 4.5:1 with a black thumbnail under it (the attribution rule)", () => {
    const backing = channels(light.background).map((v) => v * veilShare(builder["ambient-credit"]));
    expect(contrast(channels(light["muted-foreground"]), backing)).toBeGreaterThanOrEqual(4.5);
  });

  it("a reader who asked for less transparency or more contrast gets R2's art and clear panes back", () => {
    const fallback = rule(BUILDER, code.indexOf(FALLBACK));
    expect(code.indexOf(FALLBACK)).toBeGreaterThan(code.indexOf(`${BUILDER} {`));
    expect(fallback["ambient-crop-opacity"]).toBe("0.04");
    expect(STOPS.map((stop) => veilShare(fallback[stop]))).toEqual([0.7, 0.3, 0.9]);
    expect(fallback["editor-pane-search"]).toBe("transparent");
    expect(fallback["editor-pane-tools"]).toBe("transparent");
  });

  it("the scope is the builder's root: a public share page inherits none of it", () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
    expect(read("src/components/editor/editor-layout.tsx")).toContain('data-surface="editor"');
    expect(read("src/components/deck/deck-share-view.tsx")).not.toContain("data-surface");
  });
});
