/**
 * The Warden 404 (R5b, F8): the root file renders the site header (an
 * unmatched URL has no other shell) plus the shared body — the shield mark,
 * the Warden line as the page's h1, the hint, and the two actions; the
 * (site) group's file renders the body alone (its layout carries the
 * header). The status code is Next's (hubs-smoke pins 404 on the wire).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false, error: null }) },
}));

import SiteNotFound, { metadata as siteMetadata } from "./(site)/not-found";
import NotFound, { metadata } from "./not-found";

function expectWardenBody() {
  const main = screen.getByRole("main");
  expect(main.querySelector("svg[aria-hidden]")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
    "The Warden finds no such page.",
  );
  expect(main.textContent).toContain("404");
  expect(main.textContent).toContain("the link mistyped");
  expect(main.textContent).not.toMatch(/approve/i);
  // Base UI's non-native Button over a Link renders <a role="button"> (the P1.8 shape).
  const home = screen.getByRole("button", { name: "Back to Deckwarden" });
  expect(home.tagName).toBe("A");
  expect(home.getAttribute("href")).toBe("/");
  expect(screen.getByRole("button", { name: "Search cards" }).getAttribute("href")).toBe("/cards");
}

describe("NotFound (root — unmatched URLs)", () => {
  it("renders the site header once and the Warden body", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Deckwarden" }).getAttribute("href")).toBe("/");
    expect(container.querySelectorAll("header")).toHaveLength(1);
    // R4: the root layout no longer renders the footer — this file does.
    expect(container.querySelectorAll("footer")).toHaveLength(1);
    expect(screen.getByRole("contentinfo").textContent).toContain("Scryfall");
    expectWardenBody();
    expect(metadata.title).toBe("Page not found");
  });
});

describe("SiteNotFound ((site) group — notFound() calls)", () => {
  it("renders the Warden body with no header of its own (the group layout has one)", () => {
    const { container } = render(<SiteNotFound />);
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expectWardenBody();
    expect(siteMetadata.title).toBe("Page not found");
  });
});
