/**
 * CardImage (R1b): the attributes every card image now carries — explicit
 * width/height (no layout shift), lazy + async by default, eager and
 * high-priority above the fold, the fade-in keyed on load, the G2 frame
 * classes behind `frame`, and the no-src fallback in an aspect box with the
 * caller's text (the smoke-pinned "Card image coming soon" on the One Piece
 * surfaces).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardImage } from "./card-image";

const SRC = "https://cards.scryfall.io/normal/front/8/3/83f43730-1c1f-4150-8771-d901c54bedc4.jpg";

describe("CardImage", () => {
  it("renders a sized, lazy, async-decoded image that fades in on load", () => {
    render(<CardImage src={SRC} alt="Sol Ring" width={488} height={680} />);
    const img = screen.getByRole("img", { name: "Sol Ring" });
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.getAttribute("width")).toBe("488");
    expect(img.getAttribute("height")).toBe("680");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("fetchpriority")).toBeNull();
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
  });

  it("priority images are eager, high-priority, and visible at once", () => {
    render(<CardImage src={SRC} alt="Sol Ring" width={488} height={680} priority />);
    const img = screen.getByRole("img", { name: "Sol Ring" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.className).not.toContain("opacity-0");
  });

  it("frame adds the G2 treatment, the default does not", () => {
    const { rerender } = render(
      <CardImage src={SRC} alt="Sol Ring" width={488} height={680} frame />,
    );
    const framed = screen.getByRole("img").className;
    expect(framed).toContain("rounded-[4.75%/3.5%]");
    expect(framed).toContain("hover:ring-2");
    expect(framed).toContain("motion-safe:hover:-translate-y-0.5");
    rerender(<CardImage src={SRC} alt="Sol Ring" width={488} height={680} />);
    expect(screen.getByRole("img").className).not.toContain("hover:ring-2");
  });

  it("no src renders the fallback text in a same-aspect box and no <img>", () => {
    render(
      <CardImage
        src={null}
        alt="Enel"
        width={488}
        height={680}
        fallback="Card image coming soon"
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    const box = screen.getByText("Card image coming soon");
    expect(box.getAttribute("style")).toContain("aspect-ratio: 488 / 680");
  });

  it("no src and no fallback shows the name", () => {
    render(<CardImage src={null} alt="Sol Ring" width={488} height={680} />);
    expect(screen.getByText("Sol Ring")).toBeTruthy();
  });
});
