/**
 * SurfaceSkeleton (R6, C9): the four loading shells render the real band at
 * the surface's own height (SURFACE_BAND — the same string the page
 * reads), a hero box at the hub card's aspect where the page has one, title
 * bars, and NO text; every skeleton pulses motion-safe only. U6: the deck
 * shell is the share page's header B on DECK_HEADER, the classes the share
 * view reads.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CardLoading from "@/app/(site)/cards/[id]/loading";
import HubLoading from "@/app/(site)/c/[slug]/loading";
import DeckLoading from "@/app/(site)/d/[publicId]/loading";
import LeaderLoading from "@/app/(site)/l/[slug]/loading";
import { DECK_HEADER, SURFACE_BAND } from "@/components/surface-header";
import { Skeleton } from "@/components/ui/skeleton";

const band = () => document.querySelector<HTMLElement>("[data-slot=surface-header]")!;
const main = () => document.querySelector<HTMLElement>("main[data-slot=surface-skeleton]")!;

describe("SurfaceSkeleton", () => {
  it("Skeleton pulses motion-safe only", () => {
    render(<Skeleton />);
    const el = document.querySelector<HTMLElement>("[data-slot=skeleton]")!;
    expect(el.className).toContain("motion-safe:animate-pulse");
    expect(el.className.split(" ")).not.toContain("animate-pulse");
  });

  it("/c/ renders the hub band, the hero box and no text under the Magic accent", () => {
    render(<HubLoading />);
    expect(main().dataset.kind).toBe("hub");
    expect(main().dataset.game).toBe("mtg");
    expect(main().className).toContain("max-w-browse");
    expect(main().className).toContain("py-8");
    // The footer stays below the fold while the page streams (the one CLS source measured).
    expect(main().className).toContain("min-h-dvh");
    for (const cls of SURFACE_BAND.hub.split(" ")) expect(band().className).toContain(cls);
    expect(band().dataset.banner).toBe("gradient");
    const hero = document.querySelector<HTMLElement>("[data-slot=skeleton-hero]")!;
    expect(hero.className).toContain("w-72");
    expect(hero.style.aspectRatio).toBe("488 / 680");
    expect(hero.parentElement!.className).toContain("-mt-24");
    expect(document.querySelector("[data-slot=skeleton-title]")!.className).toContain("h-9");
    expect(main().textContent).toBe("");
    expect(main().getAttribute("aria-busy")).toBe("true");
  });

  it("/l/ is the hub shell under the One Piece accent", () => {
    render(<LeaderLoading />);
    expect(main().dataset.kind).toBe("hub");
    expect(main().dataset.game).toBe("optcg");
    expect(document.querySelector("[data-slot=skeleton-hero]")).toBeTruthy();
    expect(main().textContent).toBe("");
  });

  it("/cards/[id] renders the card band with the card page's overlap and no game", () => {
    render(<CardLoading />);
    expect(main().dataset.kind).toBe("card");
    expect(main().dataset.game).toBeUndefined();
    for (const cls of SURFACE_BAND.card.split(" ")) expect(band().className).toContain(cls);
    expect(band().className).not.toContain("md:h-56");
    const hero = document.querySelector<HTMLElement>("[data-slot=skeleton-hero]")!;
    expect(hero.parentElement!.className).toContain("-mt-20");
    expect(main().textContent).toBe("");
  });

  it("/d/ renders the share page's header B: the 160 / 280 px band, the leader's box rising into it, the title column", () => {
    render(<DeckLoading />);
    expect(main().dataset.kind).toBe("deck");
    expect(main().className).toContain("py-6");
    for (const cls of SURFACE_BAND.deck.split(" ")) expect(band().className).toContain(cls);
    expect(SURFACE_BAND.deck).toBe("h-40 sm:h-40 md:h-70");
    expect(band().className).not.toContain("md:h-56");
    expect(band().className).not.toContain("sm:h-44");
    const hero = document.querySelector<HTMLElement>("[data-slot=skeleton-hero]")!;
    expect(hero.className).toContain(DECK_HEADER.card);
    expect(hero.style.aspectRatio).toBe("488 / 680");
    expect(hero.parentElement!.className).toBe(DECK_HEADER.cards);
    expect(hero.parentElement!.className).toContain("md:-mt-28");
    expect(hero.parentElement!.parentElement!.className).toBe(DECK_HEADER.grid);
    const title = document.querySelector<HTMLElement>("[data-slot=skeleton-title]")!;
    expect(title.className).toContain("h-9");
    expect(title.parentElement!.className).toBe(DECK_HEADER.text);
    expect(main().textContent).toBe("");
    expect(document.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(3);
  });
});
