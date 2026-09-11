/**
 * AccountNav (R5b): a labelled nav of exactly three anchor links, in the
 * §2 order, targeting the section ids the page renders.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ACCOUNT_SECTIONS, AccountNav } from "./account-nav";

describe("AccountNav", () => {
  it("is a nav named 'Account sections' with Decks · Collection import · Settings as hash links", () => {
    render(<AccountNav />);
    const nav = screen.getByRole("navigation", { name: "Account sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Decks", "#decks"],
      ["Collection import", "#collection"],
      ["Settings", "#settings"],
    ]);
    expect(ACCOUNT_SECTIONS.map((s) => s.id)).toEqual(["decks", "collection", "settings"]);
  });
});
