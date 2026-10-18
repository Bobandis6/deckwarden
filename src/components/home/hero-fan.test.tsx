/**
 * HeroFan (U5, WAVE5 D6 section 1): three full `normal` cards, all eager and
 * high priority (the turned side cards' boxes are larger than the center
 * card's, so a lazy side card became the LCP after hydration), named by the
 * card, never links, in array order — the first card is the center, on
 * top, which is why `magicHome` lists the day's highest-ranked first (the
 * daily rotation of 2026-10-17); a card without an image is CardImage's
 * named box; no cards, no fan. The geometry lives in globals.css's
 * `.home-fan` rule, pinned here
 * where a regression would hide: children rather than `img` (the fallback
 * is a <span>), an explicit box height, the side cards' drop that keeps
 * the center card off their artist and © lines, and the 180 / 280 px sizes.
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
  it("renders the three cards in array order (the first is the center), every one eager, high priority and unfaded", () => {
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
      // The hero cards' tinted shadow (U8's HERO_CARD_SHADOW) and the card radius.
      expect(img.className).toContain("shadow-lg shadow-primary/25 dark:shadow-black/60");
      expect(img.className).toContain("rounded-[4.75%/3.5%]");
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

  it("globals.css lays the fan out by child, in a box of explicit height, the side cards dropped", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rules = css.slice(css.indexOf(".home-fan {"));
    expect(rules).toMatch(
      /\.home-fan \{[^}]*--fan-h: min\(180px, calc\(\(100vw - 1rem\) \/ 1\.88\)\);/,
    );
    expect(rules).toMatch(/--fan-drop: calc\(var\(--fan-h\) \* 0\.14\);/);
    expect(rules).toMatch(
      /height: calc\(var\(--fan-h\) \* 1\.05 \+ var\(--fan-drop\) \+ 2\.5rem\);/,
    );
    expect(rules).toMatch(/@media \(width >= 48rem\) \{\s*\.home-fan \{\s*--fan-h: 280px;/);
    // Children, never `img` alone: the no-image fallback is a <span>.
    expect(rules).toContain(".home-fan > * {");
    expect(rules).not.toMatch(/\.home-fan > img/);
    expect(rules).toMatch(/\.home-fan > :first-child \{\s*top: 1\.25rem;\s*z-index: 1;/);
    expect(rules).toMatch(
      /\.home-fan > :nth-child\(2\) \{\s*translate: calc\(-1 \* var\(--fan-step\)\) 0;\s*rotate: -8deg;/,
    );
    expect(rules).toMatch(
      /\.home-fan > :nth-child\(3\) \{\s*translate: var\(--fan-step\) 0;\s*rotate: 8deg;/,
    );
  });
});
