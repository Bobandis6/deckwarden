/**
 * The site footer (P1.8): the Scryfall credit and the Wizards Fan Content
 * sentence on every public page. U9 (WAVE5 D9) pins the sentence's shape:
 * Wizards' own template is two sentences ("…permitted under the Fan Content
 * Policy. Not approved/endorsed by Wizards."), so the dash that joined them
 * was ours and is gone; the footer carries no em or en dash at all.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("credits Scryfall and carries Wizards' Fan Content sentences, with no dash", () => {
    const { container } = render(<SiteFooter />);
    const text = (container.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(text).toContain("Card data and images courtesy of Scryfall.");
    expect(text).toContain(
      "Deckwarden is unofficial Fan Content permitted under the Fan Content Policy. Not approved or endorsed by Wizards of the Coast.",
    );
    expect(text).not.toMatch(/[—–]/);
    expect(screen.getByRole("link", { name: "Scryfall" }).getAttribute("href")).toBe(
      "https://scryfall.com",
    );
    for (const name of ["Legal", "Privacy", "Contact", "GitHub"]) {
      expect(screen.getByRole("link", { name })).toBeTruthy();
    }
  });
});
