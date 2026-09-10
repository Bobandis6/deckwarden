/**
 * ColorChip (R5a, C14): both games' definitions in display order, the mask
 * → chips rule (Magic mask 0 → one Colorless chip; One Piece mask 0 →
 * none), the accessible name always being the color's NAME, the link
 * shape's aria-current and the button shape's aria-pressed, and the
 * active ring in the game accent.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  chipsForMask,
  colorChipDefs,
  ColorChipButton,
  ColorChipLink,
  ColorChipList,
} from "./color-chip";

describe("colorChipDefs / chipsForMask", () => {
  it("lists Magic as WUBRG + Colorless and One Piece in Bandai's order", () => {
    expect(colorChipDefs("mtg").map((d) => d.name)).toEqual([
      "White",
      "Blue",
      "Black",
      "Red",
      "Green",
      "Colorless",
    ]);
    expect(colorChipDefs("mtg").map((d) => d.swatch)).toEqual([
      "var(--mana-w)",
      "var(--mana-u)",
      "var(--mana-b)",
      "var(--mana-r)",
      "var(--mana-g)",
      "var(--mana-c)",
    ]);
    expect(colorChipDefs("optcg").map((d) => `${d.name}:${d.key}`)).toEqual([
      "Red:R",
      "Green:G",
      "Blue:U",
      "Purple:C",
      "Black:B",
      "Yellow:W",
    ]);
  });

  it("paints a mask in display order; Magic mask 0 is Colorless, One Piece mask 0 is nothing", () => {
    expect(chipsForMask("mtg", 7 | 16).map((d) => d.key)).toEqual(["W", "U", "B", "G"]);
    expect(chipsForMask("mtg", 0).map((d) => d.name)).toEqual(["Colorless"]);
    expect(chipsForMask("mtg", 32).map((d) => d.name)).toEqual(["Colorless"]);
    expect(chipsForMask("optcg", 1 | 2).map((d) => d.name)).toEqual(["Blue", "Yellow"]);
    expect(chipsForMask("optcg", 0)).toEqual([]);
  });
});

describe("ColorChipLink", () => {
  it("is a link named by the color with aria-current on the active chip", () => {
    render(
      <nav aria-label="Color identity filter">
        <ColorChipLink game="mtg" color="W" href="/commanders?colors=w" active />
        <ColorChipLink game="mtg" color="C" href="/commanders?colors=c" active={false} />
      </nav>,
    );
    const white = screen.getByRole("link", { name: "White" });
    expect(white.getAttribute("href")).toBe("/commanders?colors=w");
    expect(white.getAttribute("aria-current")).toBe("page");
    expect(white.className).toContain("ring-accent-game");
    expect(white.querySelector(".pip.pip-w")?.getAttribute("aria-hidden")).toBe("true");
    const colorless = screen.getByRole("link", { name: "Colorless" });
    expect(colorless.getAttribute("aria-current")).toBeNull();
    expect(colorless.className).not.toContain("ring-accent-game");
    expect(colorless.querySelector(".pip.pip-c")?.textContent).toBe("C");
  });

  it("One Piece chips are hex dots with the name, hidden labels stay in the accessible name", () => {
    render(
      <ColorChipLink game="optcg" color="C" href="/leaders?colors=c" active showLabel={false} />,
    );
    const purple = screen.getByRole("link", { name: "Purple" });
    const dot = purple.querySelector("[aria-hidden]") as HTMLElement;
    expect(dot.style.backgroundColor).toBe("rgb(106, 27, 154)");
    expect(purple.querySelector(".sr-only")?.textContent).toBe("Purple");
  });
});

describe("ColorChipButton", () => {
  it("is a native toggle button with aria-pressed, named by the color", () => {
    const onClick = vi.fn();
    render(
      <div role="group" aria-label="Color identity (within)">
        <ColorChipButton game="mtg" color="U" pressed onClick={onClick} showLabel={false} />
        <ColorChipButton game="optcg" color="R" pressed={false} onClick={onClick} />
      </div>,
    );
    const blue = screen.getByRole("button", { name: "Blue" });
    expect(blue.getAttribute("type")).toBe("button");
    expect(blue.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(blue);
    expect(onClick).toHaveBeenCalledTimes(1);
    const red = screen.getByRole("button", { name: "Red" });
    expect(red.getAttribute("aria-pressed")).toBe("false");
    expect(red.textContent).toBe("Red");
  });
});

describe("ColorChipList", () => {
  it("renders a mask's swatches with sr-only names, nothing for an empty One Piece mask", () => {
    const { container, rerender } = render(<ColorChipList game="optcg" mask={8 | 16} />);
    expect(container.querySelectorAll("[aria-hidden]")).toHaveLength(2);
    expect(container.textContent).toBe("RedGreen");
    rerender(<ColorChipList game="optcg" mask={0} />);
    expect(container.innerHTML).toBe("");
    rerender(<ColorChipList game="mtg" mask={0} />);
    expect(container.textContent).toBe("CColorless");
  });
});
