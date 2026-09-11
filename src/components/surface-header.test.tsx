/**
 * SurfaceHeader (R5b, G3): the gradient alone without art (no image, no
 * credit); with art, the decorative banner (`alt=""`, eager but low
 * priority) under the veil and the credit as visible text beside it; the
 * default height (reserved before load) and the caller's override.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artCredit, type CardArt } from "@/lib/cards/art";
import { SurfaceHeader } from "./surface-header";

const ART: CardArt = {
  url: "https://cards.scryfall.io/art_crop/front/2/0/20e44330.jpg",
  layout: "art_crop",
  artist: "Victor Adame Minguez",
  credit: artCredit("Victor Adame Minguez"),
};

const header = () => document.querySelector<HTMLElement>("[data-slot=surface-header]");

describe("SurfaceHeader", () => {
  it("without art: the accent gradient in a band of explicit height, no image, no credit", () => {
    render(<SurfaceHeader />);
    const band = header()!;
    expect(band.dataset.banner).toBe("gradient");
    expect(band.className).toContain("h-36");
    expect(band.className).toContain("overflow-hidden");
    expect(band.querySelector("[data-slot=surface-gradient]")?.className).toContain(
      "from-accent-game/25",
    );
    expect(band.querySelector("img")).toBeNull();
    expect(band.querySelector("[data-slot=art-credit]")).toBeNull();
    expect(band.textContent).toBe("");
  });

  it("with art: the decorative banner under the veil and the credit as visible text", () => {
    render(<SurfaceHeader art={ART} className="h-32" />);
    const band = header()!;
    expect(band.dataset.banner).toBe("art_crop");
    expect(band.className).toContain("h-32");
    const img = band.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(ART.url);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("low");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.className).toContain("object-cover");
    expect(screen.queryByRole("img")).toBeNull();
    expect(band.querySelector("[data-slot=surface-veil]")).toBeTruthy();
    const credit = band.querySelector("[data-slot=art-credit]")!;
    expect(credit.tagName).toBe("P");
    expect(credit.textContent).toBe("Art: Victor Adame Minguez · ™ & © Wizards of the Coast");
    expect(credit.className).toContain("top-2");
    expect(credit.className).not.toContain("sr-only");
    expect(band.textContent).toBe(ART.credit);
  });
});
