/**
 * The site shell (R1b): pins the header contract the (site) layout renders
 * on every public page — a banner landmark, the nav links and their
 * targets, the guest "My decks" href (home's guest-deck section) versus the
 * signed-in one (/account), the account slot's two shapes, the phone Menu
 * (opens, lists every link, Escape closes it and focus returns to the
 * trigger), and exactly one appearance control. The session is mocked at
 * the Better Auth client: the header never touches request data, so this
 * is the only place the signed-in shape is provable (the browser pane is
 * signed out on prod). The negative smoke pins ride along: no header string
 * may read "Staples", "Budget", "Top finishes", "You own" or link a hub.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  current: null as null | { user: { name: string; image: string | null } },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: session.current, isPending: false, error: null }),
  },
}));

import { SiteHeader } from "./site-header";

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

describe("SiteHeader", () => {
  beforeEach(() => {
    session.current = null;
  });

  it("is a banner with the mark, Build, Browse, My decks, Sign in, and one appearance control", () => {
    render(<SiteHeader />);
    const banner = screen.getByRole("banner");
    expect(screen.getByRole("link", { name: "Deckwarden" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Build" }).getAttribute("href")).toBe("/decks/new");
    expect(screen.getByRole("button", { name: "Browse" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My decks" }).getAttribute("href")).toBe(
      "/#your-decks",
    );
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/account");
    expect(screen.getAllByRole("button", { name: "Appearance" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(banner.textContent).not.toMatch(/Staples|Budget|Top finishes|You own|USD/);
    expect(banner.innerHTML).not.toMatch(/href="\/c\//);
  });

  it("Browse opens a menu of the three indexes as links", async () => {
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Browse" }));
    const menu = await screen.findByRole("menu", { name: "Browse" });
    const hrefs = within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["Commanders", "/commanders"],
      ["Leaders", "/leaders"],
      ["Cards", "/cards"],
    ]);
  });

  it("signed in: avatar + name link to /account, My decks goes there too, no Sign in", () => {
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Bobandis6" }).getAttribute("href")).toBe("/account");
    expect(screen.getByRole("link", { name: "My decks" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText("B")).toBeTruthy(); // the initial fallback
  });

  it("the phone menu lists every nav link, Escape closes it and focus returns to the trigger", async () => {
    render(<SiteHeader />);
    const trigger = screen.getByRole("button", { name: "Menu" });
    open(trigger);
    // Base UI names a popup after its trigger via aria-labelledby.
    const menu = await screen.findByRole("menu", { name: "Menu" });
    const hrefs = within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["Build", "/decks/new"],
      ["Commanders", "/commanders"],
      ["Leaders", "/leaders"],
      ["Cards", "/cards"],
      ["My decks", "/#your-decks"],
    ]);
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Menu" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
