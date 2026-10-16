/**
 * What Deckwarden does (R5a; an offset list since U5, WAVE5 D6 section 6):
 * the region keeps its name, gains the serif h2, and lists five plain items
 * (D6's titles over R5a's bodies, which U9 owns for dashes) as one
 * description list under a gold rule: no cards, no per-item headings.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CapabilitiesStrip } from "./capabilities-strip";

describe("CapabilitiesStrip", () => {
  it("the serif h2 and five plain titles over their bodies under a gold rule", () => {
    const { container } = render(<CapabilitiesStrip className="border-gold/30 border-t py-12" />);
    const region = screen.getByRole("region", { name: "What Deckwarden does" });
    expect(region.className).toBe(
      "grid gap-8 md:grid-cols-2 md:gap-12 border-gold/30 border-t py-12",
    );
    const headings = within(region).getAllByRole("heading");
    expect(headings.map((h) => [h.tagName, h.textContent, h.className])).toEqual([
      ["H2", "What Deckwarden does", "type-section"],
    ]);
    const list = region.querySelector("dl") as HTMLElement;
    expect(list.className).toBe("border-gold/30 space-y-5 border-t pt-6");
    expect([...list.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "Legality checks",
      "Combos",
      "Share pages",
      "Sample hands",
      "Tournament finishes",
    ]);
    const bodies = [...list.querySelectorAll("dd")].map((dd) => dd.textContent);
    expect(bodies).toHaveLength(5);
    // R5a's bodies, unchanged until U9.
    expect(bodies[0]).toBe(
      "Format legality, color identity, copy limits, and banned cards validated as you build. Every flag comes with the reason, not just an ✗.",
    );
    expect(bodies[4]).toBe(
      "Commander hubs carry recent Top 16 results from Topdeck.gg; One Piece leader pages carry theirs from Limitless.",
    );
    // No boxes left: R5a's five bordered cards.
    expect(container.querySelector(".rounded-lg")).toBeNull();
  });
});
