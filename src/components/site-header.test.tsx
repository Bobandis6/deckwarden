/**
 * The site shell (R1b): pins the header contract the (site) layout renders
 * on every public page — a banner landmark, the nav links and their
 * targets, "My decks" as /account for everyone (X1 — the same href signed
 * out and signed in, so the nav reads no session), the account slot's two
 * shapes, the account menu with the name row first (X1 — a link to /account
 * that scrolls to the top in the same click), the phone Menu (opens, lists
 * every link, Escape closes it and focus returns to the trigger), and
 * exactly one appearance control. The session is mocked at the Better Auth
 * client: the header never touches request data, so this is the only place
 * the signed-in shape is provable (the browser pane is signed out on prod).
 * The negative smoke pins ride along: no header string may read "Staples",
 * "Budget", "Top finishes", "You own" or link a hub.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  current: null as null | { user: { name: string; image: string | null } },
  signOut: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: session.current, isPending: false, error: null }),
    signOut: session.signOut,
  },
}));

// The account menu's sign-out hook refreshes through the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: session.refresh, push: vi.fn() }),
}));

import { SiteHeader } from "./site-header";

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

/** jsdom cannot navigate: swallow a followed link's default action, after every handler has run. */
const stayOnPage = (event: Event) => event.preventDefault();

describe("SiteHeader", () => {
  beforeEach(() => {
    session.current = null;
    session.signOut.mockReset();
    session.refresh.mockReset();
    document.addEventListener("click", stayOnPage);
  });

  afterEach(() => {
    document.removeEventListener("click", stayOnPage);
    vi.restoreAllMocks();
  });

  it("is a banner with the mark, Build, Browse, My decks, Sign in, and one appearance control", () => {
    render(<SiteHeader />);
    const banner = screen.getByRole("banner");
    expect(screen.getByRole("link", { name: "Deckwarden" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Build" }).getAttribute("href")).toBe("/decks/new");
    expect(screen.getByRole("button", { name: "Browse" })).toBeTruthy();
    // X1: /account for a guest too — signed out, that page is sign-in with this browser's decks.
    expect(screen.getByRole("link", { name: "My decks" }).getAttribute("href")).toBe("/account");
    // The header's own Sign in stays plain: no return path (the guest branch is router-free).
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/account");
    // The old guest target (home's section, by hash) is gone from the header.
    expect(banner.innerHTML).not.toContain("your-decks");
    expect(screen.getAllByRole("button", { name: "Appearance" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(banner.textContent).not.toMatch(/Staples|Budget|Top finishes|You own|USD/);
    expect(banner.innerHTML).not.toMatch(/href="\/c\//);
  });

  it("the appearance menu carries the Background art switch on every (site) page (R2)", async () => {
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Background art" })).toBeTruthy();
  });

  it("Browse opens a menu of the six indexes as links (X4b: Sets after Cards)", async () => {
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
      ["Sets", "/sets"],
      ["Precons", "/precons"],
      ["Tournaments", "/tournaments"],
    ]);
  });

  it("signed in: the slot is a menu button named after the user, My decks goes to /account, no Sign in", () => {
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    // W3 (WAVE2.md D1): the slot became a real <button> menu trigger.
    const trigger = screen.getByRole("button", { name: "Bobandis6" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(screen.getByRole("link", { name: "My decks" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByText("B")).toBeTruthy(); // the initial fallback
  });

  it("the account menu: the name row, the four /account sections as links, then Sign out (D1)", async () => {
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Bobandis6" }));
    // Base UI names the popup after its trigger — the user's name.
    const menu = await screen.findByRole("menu", { name: "Bobandis6" });
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href")]);
    expect(items).toEqual([
      // X1 (WAVE3.md D1): the name alone, a link — no hash, so it is the top of the page.
      ["Bobandis6", "/account"],
      ["My decks", "/account#decks"],
      ["Bookmarks", "/account#bookmarks"],
      ["Collection", "/account#collection"],
      ["Profile & settings", "/account#settings"],
      ["Sign out", null],
    ]);
    expect(within(menu).getAllByRole("menuitem")[0].tagName).toBe("A");
  });

  it("the name row scrolls to the very top in the same click, every time (X1)", async () => {
    // jsdom has no scrollTo; the mechanism is what is pinned here (the landing
    // itself was measured in a real browser — see landAtTop).
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    for (const expectedCalls of [1, 2]) {
      open(screen.getByRole("button", { name: "Bobandis6" }));
      const menu = await screen.findByRole("menu", { name: "Bobandis6" });
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Bobandis6" }));
      expect(scrollTo).toHaveBeenCalledTimes(expectedCalls);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "instant" });
      // closeOnClick: the menu is gone before the second round opens it again.
      await waitFor(() => expect(screen.queryByRole("menu", { name: "Bobandis6" })).toBeNull());
    }
  });

  it("a modified click on the name row leaves this page where it is (it opens a tab)", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Bobandis6" }));
    const menu = await screen.findByRole("menu", { name: "Bobandis6" });
    const row = within(menu).getByRole("menuitem", { name: "Bobandis6" });
    fireEvent.click(row, { metaKey: true });
    fireEvent.click(row, { ctrlKey: true });
    fireEvent.click(row, { shiftKey: true });
    fireEvent.click(row, { button: 1 });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("the section links do not scroll to the top — they land on their sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    session.current = { user: { name: "Bobandis6", image: null } };
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Bobandis6" }));
    const menu = await screen.findByRole("menu", { name: "Bobandis6" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Profile & settings" }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("Sign out signs out and refreshes; a failure keeps the menu open with the retry copy", async () => {
    session.current = { user: { name: "Bobandis6", image: null } };
    // First click fails (the menu must stay open), second succeeds.
    session.signOut
      .mockResolvedValueOnce({ data: null, error: { status: 500 } })
      .mockResolvedValueOnce({ data: { success: true }, error: null });
    render(<SiteHeader />);
    open(screen.getByRole("button", { name: "Bobandis6" }));
    const menu = await screen.findByRole("menu", { name: "Bobandis6" });

    open(within(menu).getByRole("menuitem", { name: "Sign out" }));
    await screen.findByRole("menuitem", { name: "Couldn't sign out — try again" });
    expect(screen.getByRole("menu", { name: "Bobandis6" })).toBeTruthy();
    expect(session.refresh).not.toHaveBeenCalled();

    open(screen.getByRole("menuitem", { name: "Couldn't sign out — try again" }));
    await waitFor(() => expect(session.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Bobandis6" })).toBeNull());
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
      ["Sets", "/sets"],
      ["Precons", "/precons"],
      ["Tournaments", "/tournaments"],
      ["My decks", "/account"],
    ]);
    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Menu" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
