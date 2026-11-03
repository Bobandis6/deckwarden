/**
 * CARD-TILT (2026-11-03): the math, the gates, the surface, and the
 * stylesheet's half. The browser's half (a real pointer, the computed
 * matrices, the artist strips, the morph) is read in headless Chrome and
 * recorded in REDESIGN.md's CARD-TILT addendum.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachTilt, HERO_TILT_DEG, LEADER_TILT_DEG, TILT_SHADOW_PX, tiltFor } from "./tilt";

const BOX = { left: 100, top: 50, width: 200, height: 280 };

describe("tiltFor", () => {
  it("is square at the centre and reaches the cap at the edges, the shadow sliding the other way", () => {
    expect(tiltFor({ x: 200, y: 190 }, BOX, 6)).toEqual({ x: 0, y: 0, dx: 0, dy: 0 });
    // Right edge: rotateY(+) sends it back; the shadow slides left, to the raised side.
    expect(tiltFor({ x: 300, y: 190 }, BOX, 6)).toEqual({ x: 0, y: 6, dx: -4, dy: 0 });
    expect(tiltFor({ x: 100, y: 190 }, BOX, 6)).toEqual({ x: 0, y: -6, dx: 4, dy: 0 });
    // Bottom edge: rotateX(-) sends it back; the shadow slides up.
    expect(tiltFor({ x: 200, y: 330 }, BOX, 6)).toEqual({ x: -6, y: 0, dx: 0, dy: -4 });
    expect(tiltFor({ x: 200, y: 50 }, BOX, 6)).toEqual({ x: 6, y: 0, dx: 0, dy: 4 });
    expect(tiltFor({ x: 300, y: 330 }, BOX, 4)).toEqual({ x: -4, y: 4, dx: -4, dy: -4 });
  });

  it("is linear in between, clamped past the box, and two decimals with no negative zero", () => {
    expect(tiltFor({ x: 250, y: 120 }, BOX, 6)).toEqual({ x: 3, y: 3, dx: -2, dy: 2 });
    expect(tiltFor({ x: 900, y: -400 }, BOX, 6)).toEqual({ x: 6, y: 6, dx: -4, dy: 4 });
    const third = tiltFor({ x: 100 + 200 / 3, y: 190 }, BOX, 6);
    expect(third.y).toBe(-2);
    expect(tiltFor({ x: 201, y: 190 }, BOX, 6)).toEqual({ x: 0, y: 0.06, dx: -0.04, dy: 0 });
    for (const value of Object.values(tiltFor({ x: 200, y: 190 }, BOX, 6))) {
      expect(Object.is(value, -0)).toBe(false);
    }
  });

  it("a box with no size is square", () => {
    expect(tiltFor({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 }, 6)).toEqual({
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
    });
  });

  it("the caps: 6° for the heroes, 4° for the editor's working card, the shadow 4 px", () => {
    expect([HERO_TILT_DEG, LEADER_TILT_DEG, TILT_SHADOW_PX]).toEqual([6, 4, 4]);
  });
});

describe("attachTilt", () => {
  let fine: boolean;
  let reduced: EventTarget & { matches: boolean };
  let surface: HTMLElement;
  let card: HTMLElement;

  const move = (x: number, y: number, init: PointerEventInit = {}) =>
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: x,
        clientY: y,
        pointerType: "mouse",
        bubbles: true,
        ...init,
      }),
    );
  const written = () =>
    ["--tilt-x", "--tilt-y", "--tilt-dx", "--tilt-dy"].map((name) =>
      card.style.getPropertyValue(name),
    );

  beforeEach(() => {
    fine = true;
    reduced = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", (query: string) =>
      query === "(prefers-reduced-motion: reduce)"
        ? reduced
        : { matches: query === "(pointer: fine)" ? fine : false },
    );
    surface = document.createElement("div");
    card = document.createElement("img");
    surface.append(card);
    document.body.append(surface);
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 50, width: 200, height: 280 }),
    );
  });

  afterEach(() => {
    surface.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a fine pointer: data-tilt on the card, then one write of the four properties per move", () => {
    attachTilt(card, { maxDeg: 6 });
    expect(card.hasAttribute("data-tilt")).toBe(true);
    expect(written()).toEqual(["", "", "", ""]);
    move(300, 330);
    expect(written()).toEqual(["-6deg", "6deg", "-4px", "-4px"]);
    move(250, 120);
    expect(written()).toEqual(["3deg", "3deg", "-2px", "2px"]);
  });

  it("rests (properties gone) on leave, on a press, on a cancel, outside the card's box", () => {
    attachTilt(card, { maxDeg: 6 });
    for (const type of ["pointerleave", "pointerdown", "pointercancel"]) {
      move(300, 330);
      surface.dispatchEvent(new PointerEvent(type));
      expect(written(), type).toEqual(["", "", "", ""]);
    }
    move(300, 330);
    move(301, 330); // a pixel past the box's right edge
    expect(written()).toEqual(["", "", "", ""]);
    expect(card.style.length).toBe(0);
  });

  it("a touch, a held button and a running view transition leave the card at rest", () => {
    attachTilt(card, { maxDeg: 6 });
    move(300, 330, { pointerType: "touch" });
    expect(written()).toEqual(["", "", "", ""]);
    move(300, 330, { buttons: 1 });
    expect(written()).toEqual(["", "", "", ""]);
    move(300, 330, { pointerType: "pen" });
    expect(written()[1]).toBe("6deg");
    const matches = vi
      .spyOn(document.documentElement, "matches")
      .mockImplementation((selector) => selector === ":active-view-transition");
    move(280, 330);
    expect(written()).toEqual(["", "", "", ""]);
    matches.mockRestore();
  });

  it("a stage holding several cards reads each card's own layout box (its offsets), not the stage's", () => {
    Object.defineProperties(card, {
      offsetParent: { get: () => surface },
      offsetLeft: { get: () => 60 },
      offsetTop: { get: () => 20 },
      offsetWidth: { get: () => 50 },
      offsetHeight: { get: () => 70 },
    });
    attachTilt(card, { maxDeg: 6, surface });
    // The card spans x 160 to 210 and y 70 to 140 in the viewport.
    move(209.5, 105);
    expect(written()[1]).toBe("5.88deg");
    move(150, 105); // on the stage, beside the card
    expect(written()).toEqual(["", "", "", ""]);
  });

  it("attaches nothing without a fine primary pointer, under reduced motion, or without matchMedia", () => {
    fine = false;
    attachTilt(card, { maxDeg: 6 })();
    move(300, 330);
    expect(card.hasAttribute("data-tilt")).toBe(false);
    expect(written()).toEqual(["", "", "", ""]);
    fine = true;
    reduced.matches = true;
    attachTilt(card, { maxDeg: 6 });
    move(300, 330);
    expect(card.hasAttribute("data-tilt")).toBe(false);
    vi.stubGlobal("matchMedia", undefined);
    attachTilt(card, { maxDeg: 6 });
    expect(card.hasAttribute("data-tilt")).toBe(false);
  });

  it("reduced motion turned on later lets go at once; the detach leaves the card as found, twice over", () => {
    const detach = attachTilt(card, { maxDeg: 6 });
    move(300, 330);
    reduced.matches = true;
    reduced.dispatchEvent(new Event("change"));
    expect(card.hasAttribute("data-tilt")).toBe(false);
    expect(card.style.length).toBe(0);
    move(300, 330);
    expect(card.style.length).toBe(0);
    detach();
    detach();
    // As found: no data-tilt, no inline declarations (Chrome may keep an
    // empty style attribute behind, which styles nothing).
    expect(card.hasAttribute("data-tilt")).toBe(false);
    expect(card.style.length).toBe(0);
  });
});

describe("the stylesheet's half (globals.css)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&");
    return css.match(new RegExp(`\\n\\s*${escaped} \\{([\\s\\S]*?)\\n\\s*\\}`))?.[1] ?? "";
  };
  const shadowOf = (body: string) =>
    (body.match(/box-shadow:([\s\S]*?);/)?.[1] ?? body.match(/--tw-shadow:([\s\S]*?);/)?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
  /** A tilting shadow with the tilt at 0: the resting value it must equal. */
  const atRest = (value: string) =>
    value
      .replace(/var\(--tilt-d[xy], 0px\)/g, "0px")
      .replace(/var\(--tw-shadow-color, (rgb\([^)]*\))\)/g, "$1")
      .replace(/calc\((-?\d+)px \+ 0px(?: \/ 2)?\)/g, "$1px")
      .replace(/calc\(0px \/ 2\)/g, "0px")
      .replace(/\b0px\b/g, "0");

  it("[data-tilt] turns a lone card in its own perspective; the trio composes the tilt after the stage's turn", () => {
    const recipe = rule("[data-tilt]");
    expect(recipe).toContain("--tilt: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));");
    expect(recipe).toContain("transform: perspective(1000px) var(--tilt);");
    expect(rule(".home-fan > [data-tilt]")).toContain("transform: var(--tilt);");
    expect(rule(".home-fan > [data-tilt]:first-child")).toContain(
      "transform: rotateY(-9deg) translateX(-50%) var(--tilt) translateX(50%);",
    );
    expect(rule(".home-fan > [data-tilt]:last-child")).toContain(
      "transform: rotateY(9deg) translateX(50%) var(--tilt) translateX(-50%);",
    );
    // The resting turns are untouched (hero-fan.test.tsx pins them too).
    expect(rule(".home-fan > :first-child")).toContain("transform: rotateY(-9deg);");
    expect(rule(".home-fan > :last-child")).toContain("transform: rotateY(9deg);");
  });

  it("the trio's grounded shadow sits on the cards and slides with the tilt; at rest it is HOME-ATMOSPHERE's, value for value", () => {
    const light = shadowOf(rule(".home-fan > *"));
    const dark = shadowOf(rule(".dark .home-fan > *"));
    for (const shadow of [light, dark]) {
      expect(shadow).toContain("var(--tilt-dx, 0px)");
      expect(shadow).toContain("var(--tilt-dy, 0px)");
    }
    expect(atRest(light)).toBe(
      "-9px 9px 13px -8px rgb(66 52 34 / 0.5), -2px 3px 4px -1px rgb(46 38 26 / 0.55)",
    );
    expect(atRest(dark)).toBe(
      "0 10px 12px -8px rgb(0 0 0 / 0.32), 0 2px 3px -1px rgb(0 0 0 / 0.5)",
    );
    // A token on the band would resolve its var()s there, at 0, for good.
    expect(css).not.toContain("--home-card-shadow");
  });

  it("the hero shadow slides on a tilting shadow-lg card, and at rest is Tailwind's shadow-lg in the shadow color", () => {
    const layer = css.slice(css.indexOf("@layer utilities {"));
    expect(layer).toMatch(/^@layer utilities \{\s*\.shadow-lg\[data-tilt\] \{/);
    const tilting = shadowOf(rule(".shadow-lg[data-tilt]"));
    expect(tilting).toContain("var(--tw-shadow-color, rgb(0 0 0 / 0.1))");
    const theme = readFileSync(join(process.cwd(), "node_modules/tailwindcss/theme.css"), "utf8");
    const shadowLg = theme.match(/--shadow-lg: ([^;]+);/)?.[1];
    expect(shadowLg).toBe("0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)");
    expect(atRest(tilting)).toBe(shadowLg);
  });

  it("transforms and box-shadows only: no filter, no curve of its own, nothing outside the four", () => {
    const start = css.indexOf("/* The card tilt (CARD-TILT");
    const block = css.slice(start, css.indexOf("\n}\n", css.indexOf("@layer utilities {", start)));
    expect(start).toBeGreaterThan(0);
    const code = block.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/filter|transition|animation|cubic-bezier|ease/);
  });
});
