/**
 * The completion ring (R3, F2): a meter with the "N of M cards" value text,
 * the accent arc under the limit, destructive over it, the one-shot glow
 * class at exactly max, and nothing at all without a maximum.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CompletionRing } from "./completion-ring";

const arc = () => document.querySelector('[data-slot="completion-ring-arc"]') as SVGCircleElement;

describe("CompletionRing", () => {
  it("is a meter reading N of M cards, drawn in the game accent", () => {
    render(<CompletionRing value={60} max={100} />);
    const meter = screen.getByRole("meter", { name: "Deck completion" });
    expect(meter.getAttribute("aria-valuenow")).toBe("60");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuetext")).toBe("60 of 100 cards");
    expect(meter.hasAttribute("data-full")).toBe(false);
    expect(arc().getAttribute("class")).toContain("stroke-accent-game");
    expect(arc().getAttribute("class")).toContain("motion-safe:transition-");
  });

  it("glows once at exactly the maximum", () => {
    render(<CompletionRing value={100} max={100} />);
    const meter = screen.getByRole("meter");
    expect(meter.hasAttribute("data-full")).toBe(true);
    expect(meter.className).toContain("motion-safe:animate-ring-glow");
    expect(arc().getAttribute("class")).toContain("stroke-accent-game");
  });

  it("turns destructive over the limit and keeps the honest value text", () => {
    render(<CompletionRing value={104} max={100} />);
    const meter = screen.getByRole("meter");
    expect(meter.hasAttribute("data-over")).toBe(true);
    expect(meter.className).not.toContain("animate-ring-glow");
    expect(meter.getAttribute("aria-valuetext")).toBe("104 of 100 cards");
    expect(arc().getAttribute("class")).toContain("stroke-destructive");
  });

  it("renders nothing when the format has no maximum", () => {
    const { container } = render(<CompletionRing value={40} max={null} />);
    expect(container.innerHTML).toBe("");
  });
});
