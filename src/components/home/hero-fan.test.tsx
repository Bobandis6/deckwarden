/**
 * HeroFan (U5, WAVE5 D6 section 1; upright since FRESH-UI-HOME): three full
 * `normal` cards, all eager and high priority (they paint together, and at
 * 1440 one of them is the LCP element), named by the card, never links, in
 * array order — the first card is the day's highest-ranked, which is why
 * `magicHome` lists it first (the daily rotation of 2026-10-17); a card
 * without an image is CardImage's
 * named box; no cards, no fan. The geometry lives in globals.css's
 * `.home-fan` rule, pinned here where a regression would hide: since
 * FRESH-UI-HOME (2026-10-30) a three-column grid whose boxes come from
 * `aspect-ratio` (so nothing shifts when the images land), children rather
 * than `img` (the fallback is a <span>), and since HOME-ATMOSPHERE
 * (2026-10-31) the stage: the lit wall and the lit floor behind the cards
 * with the grain blended in and masked to the light, the grounded
 * drop-shadows, the side cards' turn about the vertical axis, and still no
 * in-plane rotation or drop (no card covers another's artist or © line).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FanCard } from "@/lib/home/shelves";
import { HeroFan } from "./hero-fan";

const card = (id: string, name: string, image: string | null = null): FanCard => ({
  id,
  name,
  image: image ?? `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`,
});

const FAN = [
  card("5b40815d-0104-461e-b193-fcf5e1f35299", "Syr Konrad, the Grim"),
  card("9f30943b-f739-49eb-bafb-fec6614a0c5e", "Etali, Primal Storm"),
  card("a71d1ec3-2d7a-4749-8936-8bf7a8b83d84", "Ragavan, Nimble Pilferer"),
];

describe("HeroFan", () => {
  it("renders the three cards in array order (the first is the day's highest-ranked), every one eager, high priority and unfaded", () => {
    const { container } = render(<HeroFan cards={FAN} />);
    const fan = container.querySelector("[data-slot=hero-fan]") as HTMLElement;
    expect(fan.className).toBe("home-fan");
    const imgs = screen.getAllByRole("img");
    expect(imgs.map((img) => img.getAttribute("alt"))).toEqual([
      "Syr Konrad, the Grim",
      "Etali, Primal Storm",
      "Ragavan, Nimble Pilferer",
    ]);
    for (const img of imgs) {
      expect(img.parentElement).toBe(fan);
      expect(img.getAttribute("src")).toMatch(/^https:\/\/cards\.scryfall\.io\/normal\/front\//);
      expect(img.getAttribute("width")).toBe("488");
      expect(img.getAttribute("height")).toBe("680");
      expect(img.getAttribute("loading")).toBe("eager");
      expect(img.getAttribute("fetchpriority")).toBe("high");
      expect(img.className).not.toContain("opacity-0");
      // The card radius; the shadow is the stage's (`.home-fan > *`), not
      // U8's HERO_CARD_SHADOW utility, since HOME-ATMOSPHERE.
      expect(img.className).toContain("rounded-[4.75%/3.5%]");
      expect(img.className).not.toContain("shadow-");
    }
    // Pictures, not links: the hero's one job is "Build a deck".
    expect(container.querySelector("a")).toBeNull();
  });

  it("a card with no image keeps its place as CardImage's named box", () => {
    const { container } = render(
      <HeroFan cards={[FAN[0], { id: "x", name: "Printless", image: null }, FAN[2]]} />,
    );
    const fan = container.querySelector("[data-slot=hero-fan]") as HTMLElement;
    expect(fan.children).toHaveLength(3);
    expect(fan.children[1].tagName).toBe("SPAN");
    expect(fan.children[1].textContent).toBe("Printless");
    expect((fan.children[1] as HTMLElement).style.aspectRatio).toBe("488 / 680");
  });

  it("no cards, no fan", () => {
    const { container } = render(<HeroFan cards={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("globals.css stands the three cards on the lit stage: a grid whose boxes come from aspect-ratio, the wall and floor lights behind them, the side cards turned", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rules = css.slice(css.indexOf(".home-fan {"));
    // A three-column grid (the trio), isolated so its own light sits behind
    // the cards, with the perspective the side cards turn in.
    expect(rules).toMatch(
      /\.home-fan \{[^}]*isolation: isolate;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*perspective: /,
    );
    // The lit wall (::before, the lower layer): the grain over the spotlight's
    // radial from --home-stage, masked to the same falloff so no edge shows.
    expect(rules).toMatch(
      /\.home-fan::before \{[^}]*z-index: -2;[^}]*var\(--home-grain-url\)[^}]*radial-gradient\(\s*closest-side at 50% 45%,\s*var\(--home-stage\) 0%,[^}]*transparent 100%[^}]*background-blend-mode: soft-light, normal;[^}]*mask-image: radial-gradient\(closest-side at 50% 45%,/,
    );
    // The lit floor (::after, above the wall, below the cards): the pool of
    // --home-floor at the cards' bases, masked the same way.
    expect(rules).toMatch(
      /\.home-fan::after \{[^}]*z-index: -1;[^}]*var\(--home-grain-url\)[^}]*radial-gradient\(\s*closest-side,\s*var\(--home-floor\) 0%,[^}]*transparent 100%[^}]*mask-image: radial-gradient\(closest-side,/,
    );
    // Children, never `img` alone: the no-image fallback is a <span>. Their
    // box is the card's ratio at the column's width, so nothing shifts when
    // the images land (U5's explicit height, by construction now); each is
    // grounded by the rule's box-shadows (U2: never a filter).
    expect(rules).toMatch(
      /\.home-fan > \* \{\s*width: 100%;\s*height: auto;\s*aspect-ratio: 488 \/ 680;\s*box-shadow:\s*0 20px 16px -4px var\(--home-shade\),/,
    );
    expect(rules).not.toMatch(/\.home-fan > img/);
    // The side cards turn about the vertical axis toward the viewer, pivoting
    // on the edge nearest the center; the center card stands square.
    expect(rules).toMatch(
      /\.home-fan > :first-child \{\s*transform: rotateY\(-9deg\);\s*transform-origin: 100% 50%;/,
    );
    expect(rules).toMatch(
      /\.home-fan > :last-child \{\s*transform: rotateY\(9deg\);\s*transform-origin: 0% 50%;/,
    );
    // No in-plane rotation, no drop, no fan step: a turn about the vertical
    // axis narrows a card inside its own cell, so D0's artist and © rule
    // holds by construction.
    const block = rules.slice(0, rules.indexOf("/* The home intro"));
    expect(block).not.toMatch(/rotate:|--fan-drop|--fan-step/);
  });
});
