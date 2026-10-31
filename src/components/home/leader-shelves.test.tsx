/**
 * The home shelves (R5a; U5, WAVE5 D6): each shelf is a region named by its
 * heading's words, the heading a serif h3 (`.type-small`, no uppercase
 * label: F4 keeps those for list groups), the one-clause note under it (Y1's
 * honesty for Magic; the source and its link for One Piece's tournament
 * ordering), three across below `lg` and six in a row from it (the
 * `.home-gallery` grid), each card one link to its hub with a lazy, framed
 * image (Magic's `normal`, One Piece's small WebP) or the color gradient;
 * the One Piece cold-start shelf has no heading and no popularity words.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MagicShelfCard, OpShelf as OpShelfData } from "@/lib/home/shelves";
import { MagicShelf, OpShelf } from "./leader-shelves";

const GRID = "home-gallery mt-4";

const magic: MagicShelfCard[] = [
  {
    id: "a",
    name: "Braids, Arisen Nightmare",
    href: "/c/braids-arisen-nightmare",
    ciMask: 4,
    image: "https://cards.scryfall.io/normal/front/0/1/01aaaaaa-0000-4000-8000-000000000000.jpg",
  },
  { id: "b", name: "Printless", href: "/c/printless", ciMask: 8, image: null },
];

const opCard = (name: string, key: string, life: number | null = 5) => ({
  id: key,
  name,
  href: `/l/${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${key.toLowerCase()}`,
  externalKey: key,
  colorsMask: 1,
  life,
  finishes: 3,
  image: `https://img.deckwarden.gg/optcg/small/${key}.webp`,
});

describe("MagicShelf", () => {
  it("a serif h3 and the one-clause note over the six-up grid of hub links", () => {
    const { container } = render(<MagicShelf cards={magic} />);
    const region = screen.getByRole("region", { name: "Popular in Commander decklists" });
    const h3 = within(region).getByRole("heading", { level: 3 });
    expect(h3.textContent).toBe("Popular in Commander decklists");
    expect(h3.className).toBe("type-small");
    expect(
      within(region).getByText("Ranked by EDHREC decklist count via Scryfall, not games played.")
        .className,
    ).toBe("text-muted-foreground mt-1 text-sm");
    expect(region.querySelector("ul")?.className).toBe(GRID);
    expect(
      within(region)
        .getAllByRole("link")
        .map((a) => [a.textContent, a.getAttribute("href")]),
    ).toEqual([
      ["Braids, Arisen Nightmare", "/c/braids-arisen-nightmare"],
      ["Printless", "/c/printless"],
    ]);
    const img = region.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("motion-safe:hover:-translate-y-0.5");
    expect(region.querySelector("[data-slot=shelf-gradient]")).not.toBeNull();
    // Zero uppercase labels on the shelf (the eyebrow is the list groups' alone).
    expect(container.innerHTML).not.toContain("uppercase");
  });

  it("no cards, no shelf", () => {
    const { container } = render(<MagicShelf cards={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("OpShelf", () => {
  it("tournament rows: the serif h3, the clause crediting Limitless, the printed ids", () => {
    const shelf: OpShelfData = {
      labeled: true,
      leaders: [opCard("Donquixote Rosinante", "OP12-061"), opCard("Sabo", "OP13-004", null)],
    };
    render(<OpShelf shelf={shelf} />);
    const region = screen.getByRole("region", { name: "Recent Top finishes" });
    const h3 = within(region).getByRole("heading", { level: 3 });
    expect(h3.textContent).toBe("Recent Top finishes");
    expect(h3.className).toBe("type-small");
    const clause = h3.nextElementSibling as HTMLElement;
    expect(clause.textContent).toBe(
      "Leaders placing top 16 at 16+ player events, newest first. Results from Limitless.",
    );
    expect(within(clause).getByRole("link", { name: "Limitless" }).getAttribute("href")).toBe(
      "https://play.limitlesstcg.com",
    );
    expect(region.querySelector("ul")?.className).toBe(GRID);
    const cards = within(region.querySelector("ul") as HTMLElement).getAllByRole("link");
    expect(cards.map((a) => a.getAttribute("href"))).toEqual([
      "/l/donquixote-rosinante-op12-061",
      "/l/sabo-op13-004",
    ]);
    expect(cards[0].textContent).toContain("OP12-061");
    expect(cards[0].textContent).toContain("5 Life");
    expect(cards[1].textContent).not.toContain("Life");
  });

  it("cold start: no heading, no clause, the leaders in name order under a plain label", () => {
    render(<OpShelf shelf={{ labeled: false, leaders: [opCard("Ace", "ST13-001")] }} />);
    const region = screen.getByRole("region", { name: "Leaders" });
    expect(within(region).queryByRole("heading")).toBeNull();
    expect(region.textContent).not.toContain("Results from");
  });
});
