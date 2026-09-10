/**
 * DeckTile (R5a): one link named by the deck name with the strip, chip and
 * image as decoration; the 3 px strip painted inline and aria-hidden; the
 * gradient slot when the image is gated; `♥ N` only above zero; the
 * visibility word only when the data carries it; the actions slot above
 * the stretched link; `data-game` for the accent.
 */
import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, it } from "vitest";

import { deckTileData } from "@/lib/decks/tiles";
import { DeckTile, DeckTileGrid } from "./deck-tile";

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
