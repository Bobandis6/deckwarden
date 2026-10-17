/**
 * DeckTile (R5a): one link named by the deck name with the strip, chip and
 * image as decoration; the 3 px strip painted inline and aria-hidden; the
 * 96 px card box (U7a) with the gradient in the same box when the image is
 * gated; the name on up to two lines; `♥ N` only above zero; the
 * visibility word only when the data carries it; the actions slot above
 * the stretched link; `data-game` for the accent; the grid one column
 * below `md` and two from it; the hover lift (U5); the actions slot's text
 * link (Share page) a 44 px target on touch (LATER row 248).
 */
import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { deckTileData } from "@/lib/decks/tiles";
import { DeckTile, DeckTileGrid, TILE_ACTION_LINK_CLASS } from "./deck-tile";

const IMAGE = "https://cards.scryfall.io/small/front/0/6/064a84dd-bb7c-4980-a031-23c778e37f73.jpg";

const queza = deckTileData({
  href: "/d/q9j9uxphwp9n",
  name: "Queza — The Agony Engine",
  game: "mtg",
  formatCode: "commander",
  updatedAt: "2026-09-09T04:13:26.820Z",
  likesCount: 0,
  ciMask: 7,
  leaderImage: IMAGE,
  author: { name: "Bobandis6", username: "bobandis6" },
});

const enel = deckTileData({
  href: "/d/jhr5ax43ewx7",
  name: "Six DON!!, Endless Thunder",
  game: "optcg",
  formatCode: "standard",
  updatedAt: "2026-09-09T03:44:44.039Z",
  likesCount: 1,
  ciMask: 32,
  leaderImage: null,
  author: { name: "Bobandis6", username: "bobandis6" },
});

describe("DeckTile", () => {
  it("is one link named by the deck name; strip, chip and image are decoration", () => {
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={queza} />
      </DeckTileGrid>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/d/q9j9uxphwp9n");
    expect(links[0].textContent).toBe("Queza — The Agony Engine");
    expect(links[0].className).toContain("after:absolute after:inset-0");
    // Up to two lines, never cut to one: the 96 px card leaves the room (U7a).
    expect(links[0].className).toContain("line-clamp-2");
    expect(links[0].className).not.toContain("truncate");

    const strip = container.querySelector("[data-slot=identity-strip]") as HTMLElement;
    expect(strip.getAttribute("aria-hidden")).toBe("true");
    expect(strip.className).toContain("h-[3px]");
    expect(strip.style.background).toContain("linear-gradient(to right, var(--mana-w)");
    expect(strip.textContent).toBe("");

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(IMAGE);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("146");
    expect(img.getAttribute("height")).toBe("204");
    expect(screen.queryByRole("img")).toBeNull();
    // The art box: a 96 px full card (WAVE5 F15) at the small rendition's ratio.
    const art = container.querySelector("[data-slot=tile-art]") as HTMLElement;
    expect(art.className).toContain("w-24");
    expect(art.style.aspectRatio).toBe("146 / 204");
    expect(container.querySelector("ul")?.className).toBe("grid gap-3 md:grid-cols-2");

    const tile = container.querySelector("[data-slot=deck-tile]") as HTMLElement;
    expect(tile.getAttribute("data-game")).toBe("mtg");
    expect(tile.textContent).toContain("Magic");
    expect(tile.textContent).toContain("Commander");
    expect(tile.textContent).toContain("Updated Sep 9");
    expect(tile.textContent).toContain("by Bobandis6");
    expect(tile.textContent).not.toContain("♥");
    expect(tile.textContent).not.toContain("public");
  });

  it("paints the gradient slot when the image is gated, shows ♥ N above zero", () => {
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={enel} />
      </DeckTileGrid>,
    );
    expect(container.querySelector("img")).toBeNull();
    const gradient = container.querySelector("[data-slot=tile-gradient]") as HTMLElement;
    // The gradient fills the same 96 px box the image would.
    const art = container.querySelector("[data-slot=tile-art]") as HTMLElement;
    expect(art.contains(gradient)).toBe(true);
    expect(art.className).toContain("w-24");
    // jsdom normalizes the hex to rgb() in computed inline styles.
    expect(gradient.style.backgroundImage).toContain("rgb(106, 27, 154)");
    expect(
      (container.querySelector("[data-slot=identity-strip]") as HTMLElement).style.background,
    ).toBe("rgb(106, 27, 154)");
    const tile = container.querySelector("[data-slot=deck-tile]") as HTMLElement;
    expect(tile.getAttribute("data-game")).toBe("optcg");
    expect(tile.textContent).toContain("♥ 1");
    expect(tile.textContent).toContain("One Piece");
    expect(tile.textContent).toContain("Standard");
  });

  it("owner surfaces: the visibility word, the edit title, and actions above the overlay", () => {
    const owner = deckTileData({
      href: "/decks/11111111-1111-4111-8111-111111111111/edit",
      name: "Untitled",
      game: "mtg",
      formatCode: "commander",
      visibility: "unlisted",
      updatedAt: "2026-09-10T02:30:00.000Z",
      likesCount: 0,
      ciMask: 0,
      leaderImage: null,
    });
    const { container } = render(
      <DeckTileGrid>
        <DeckTile
          tile={owner}
          linkTitle="Edit Untitled"
          actions={<Link href="/d/abc">Share page</Link>}
        />
      </DeckTileGrid>,
    );
    const edit = screen.getByRole("link", { name: "Untitled" });
    expect(edit.getAttribute("title")).toBe("Edit Untitled");
    expect(edit.getAttribute("href")).toBe("/decks/11111111-1111-4111-8111-111111111111/edit");
    expect(screen.getByRole("link", { name: "Share page" }).parentElement?.className).toContain(
      "z-10",
    );
    expect(container.textContent).toContain("· unlisted");
    expect(container.textContent).not.toContain("by ");
  });
});

describe("DeckTile — the declared chip (Y5)", () => {
  it("fills the badge slot when no badge is passed; a passed badge (Precon) wins", () => {
    const declared = { ...queza, declared: "Bracket 3 (declared)" };
    const { container, rerender } = render(
      <DeckTileGrid>
        <DeckTile tile={declared} />
      </DeckTileGrid>,
    );
    expect(container.querySelector("[data-slot=tile-badge]")?.textContent).toBe(
      "Bracket 3 (declared)",
    );
    rerender(
      <DeckTileGrid>
        <DeckTile tile={declared} badge="Precon" />
      </DeckTileGrid>,
    );
    expect(container.querySelector("[data-slot=tile-badge]")?.textContent).toBe("Precon");
    rerender(
      <DeckTileGrid>
        <DeckTile tile={queza} />
      </DeckTileGrid>,
    );
    expect(container.querySelector("[data-slot=tile-badge]")).toBeNull();
  });

  it("lifts 2 px on hover over U2's default 120 ms, the lift motion-safe and named in the list (U5)", () => {
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={queza} />
      </DeckTileGrid>,
    );
    const tile = container.querySelector("[data-slot=deck-tile]") as HTMLElement;
    const classes = tile.className.split(" ");
    // Tailwind v4's -translate-y-0.5 writes `translate`, so the list names it
    // (CardImage's lift named `transform` and never animated, LATER row 230).
    expect(classes).toContain("motion-safe:transition-[background-color,translate]");
    expect(classes).toContain("motion-safe:hover:-translate-y-0.5");
    // Reduced motion keeps the tint: it is not behind motion-safe.
    expect(classes).toContain("hover:bg-muted/40");
    expect(tile.className).not.toContain("transition-colors");
  });

  it("compact (U7b): the phone row below md and the tile from it; nothing without the prop", () => {
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={queza} compact />
        <DeckTile tile={enel} />
      </DeckTileGrid>,
    );
    const [compact, plain] = [...container.querySelectorAll("[data-slot=deck-tile]")].map(
      (el) => el as HTMLElement,
    );
    for (const cls of ["max-md:gap-2", "max-md:p-2", "max-md:pt-2.5"]) {
      expect(compact.className.split(" ")).toContain(cls);
    }
    // The card at the search rows' 26 px below md, the 96 px box from md.
    const art = compact.querySelector("[data-slot=tile-art]") as HTMLElement;
    expect(art.className.split(" ")).toContain("max-md:w-[1.625rem]");
    // The card keeps its ratio beside a taller text column: no stretch, so no cropped artist line (D0).
    expect(art.className.split(" ")).toContain("max-md:self-start");
    expect(art.className.split(" ")).toContain("w-24");
    // The game chip and the format step aside below md; the name, the date and the link stay.
    expect([...compact.querySelectorAll(".max-md\\:hidden")].map((el) => el.textContent)).toEqual([
      "Magic",
      "Commander",
    ]);
    expect(screen.getByRole("link", { name: "Queza — The Agony Engine" })).toBeTruthy();
    expect(plain.className).not.toContain("max-md:");
    expect(plain.querySelector(".max-md\\:hidden")).toBeNull();
  });
});

describe("DeckTile — the meta on two lines (U9, WAVE5 D9)", () => {
  it("the format and the visibility on the first line, the date and the price on the second: one dot a line", () => {
    const tile = { ...queza, visibility: "unlisted" as const, priceLabel: "≈ $41" };
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={tile} />
      </DeckTileGrid>,
    );
    const metas = [...container.querySelectorAll("[data-slot=deck-tile] p")].map((p) =>
      (p.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(metas[0]).toMatch(/· unlisted$/);
    expect(metas[0]).not.toContain("Updated");
    expect(metas[1]).toMatch(/^Updated Sep 9\s?· ≈ \$41$/);
    for (const line of metas) expect((line.match(/·/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe("DeckTile — a precon's bracket read (LATER row 151)", () => {
  const precon = deckTileData({
    href: "/d/p_breed_lethality_c16",
    name: "Breed Lethality",
    game: "mtg",
    formatCode: "commander",
    updatedAt: "2016-11-11",
    likesCount: 0,
    ciMask: 23,
    leaderImage: null,
    dateLabel: "Released Nov 2016",
    priceLabel: "≈ $97",
    bracketLine: "Bracket 3 or 4 · one combo is your call",
  });

  it("its own line after the date and price: the gauge, the lead forward and the rest muted, one dot", () => {
    const { container } = render(
      <DeckTileGrid>
        <DeckTile tile={precon} badge="Precon" compact />
      </DeckTileGrid>,
    );
    const lines = [...container.querySelectorAll("[data-slot=deck-tile] p")];
    const bracket = container.querySelector("[data-slot=tile-bracket]")!;
    expect(lines.at(-1)).toBe(bracket);
    expect(bracket.textContent).toBe("Bracket 3 or 4 · one combo is your call");
    expect(bracket.className).toBe("text-muted-foreground flex gap-1 text-xs text-pretty");
    expect(bracket.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    const lead = bracket.querySelector("span > span")!;
    expect(lead.textContent).toBe("Bracket 3 or 4");
    expect(lead.className).toBe("text-foreground font-medium");
    // The tile stays one link, named by the deck name: the line explains nothing it links to.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Breed Lethality"]);
  });

  it("a line with no separator is all lead; no line on any other tile", () => {
    const { container, unmount } = render(
      <DeckTileGrid>
        <DeckTile tile={{ ...precon, bracketLine: "At least Bracket 3 (Upgraded)" }} />
      </DeckTileGrid>,
    );
    expect(container.querySelector("[data-slot=tile-bracket] span > span")!.textContent).toBe(
      "At least Bracket 3 (Upgraded)",
    );
    unmount();
    expect(queza.bracketLine).toBeNull();
    const { container: plain } = render(
      <DeckTileGrid>
        <DeckTile tile={queza} />
      </DeckTileGrid>,
    );
    expect(plain.querySelector("[data-slot=tile-bracket]")).toBeNull();
  });
});

describe("DeckTile — the actions slot's text link (LATER row 248)", () => {
  it("a tile's text action (Share page) is 12 px muted text, a 44 px target on touch", () => {
    expect(TILE_ACTION_LINK_CLASS).toBe(
      "text-muted-foreground text-xs hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center",
    );
  });
});
