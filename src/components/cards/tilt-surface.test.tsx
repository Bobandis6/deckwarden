import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TiltSurface } from "./tilt-surface";

describe("TiltSurface (CARD-TILT)", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) =>
      Object.assign(new EventTarget(), { matches: query === "(pointer: fine)" }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is a plain div whose first child, the card, turns toward a fine pointer read on the div", () => {
    const { container } = render(
      <TiltSurface maxDeg={6} className="relative -mt-24">
        <span>Syr Konrad, the Grim</span>
      </TiltSurface>,
    );
    const surface = container.firstElementChild as HTMLElement;
    expect(surface.tagName).toBe("DIV");
    expect(surface.className).toBe("relative -mt-24");
    const card = surface.firstElementChild as HTMLElement;
    expect(card.hasAttribute("data-tilt")).toBe(true);
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 288, height: 401 }),
    );
    fireEvent.pointerMove(surface, { clientX: 0, clientY: 0 });
    expect(card.getAttribute("style")).toBe(
      "--tilt-x: 6deg; --tilt-y: -6deg; --tilt-dx: 4px; --tilt-dy: 4px;",
    );
    fireEvent.pointerLeave(surface);
    expect(card.style.length).toBe(0);
  });

  it("lets go when it unmounts, and a re-render keeps the same attachment (no reset mid-hover)", () => {
    const { container, rerender, unmount } = render(
      <TiltSurface maxDeg={6}>
        <span>A</span>
      </TiltSurface>,
    );
    const surface = container.firstElementChild as HTMLElement;
    const card = surface.firstElementChild as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 }),
    );
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 50 });
    rerender(
      <TiltSurface maxDeg={6}>
        <span>A</span>
      </TiltSurface>,
    );
    expect(card.style.getPropertyValue("--tilt-y")).toBe("6deg");
    unmount();
    expect(card.hasAttribute("data-tilt")).toBe(false);
    expect(card.style.length).toBe(0);
  });
});
