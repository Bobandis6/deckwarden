/**
 * The /decks layout (2026-10-17): the site header above every editor route —
 * /decks/new (the picker, its fallback, the draft editor) and
 * /decks/[id]/edit — so the navigation is on every page of the site. The
 * header is a stand-in here (site-header.test pins the real one); what this
 * pins is that the layout renders it, first, and the page after it, with no
 * wrapper element between the body and the page (the editor's root and the
 * picker's flex-1 main both lean on the body's flex column).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/site-header", () => ({
  SiteHeader: () => <header data-testid="site-header">SITE HEADER</header>,
}));

const { default: DecksLayout } = await import("./layout");

describe("DecksLayout", () => {
  it("renders the site header, then the page, as siblings", () => {
    const { container } = render(
      <DecksLayout params={Promise.resolve({})}>
        <main id="main">PAGE</main>
      </DecksLayout>,
    );
    const header = screen.getByTestId("site-header");
    const main = screen.getByRole("main");
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(header);
    expect(container.children[1]).toBe(main);
  });
});
