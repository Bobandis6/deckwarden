/**
 * The appearance menu (R1a; R2 adds Background art): the three theme radios
 * still close on click, and the Background art checkbox — checked by
 * default, a corrupt stored value included — writes `deckwarden:appearance`
 * and keeps the menu open so the effect can be seen and reversed.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { APPEARANCE_KEY } from "@/lib/theme/appearance";
import { AppearanceMenu } from "./appearance-menu";
import { ThemeProvider } from "./theme-provider";

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

afterEach(() => {
  window.localStorage.clear();
});

describe("AppearanceMenu", () => {
  it("lists Dark / Light / System and a checked Background art item", async () => {
    render(<AppearanceMenu />);
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((i) => i.textContent),
    ).toEqual(["Dark", "Light", "System"]);
    const item = within(menu).getByRole("menuitemcheckbox", { name: "Background art" });
    expect(item.getAttribute("aria-checked")).toBe("true");
  });

  it("toggling Background art writes the preference and keeps the menu open", async () => {
    render(<AppearanceMenu />);
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Background art" }));
    await waitFor(() =>
      expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe('{"backgroundArt":false}'),
    );
    const item = within(menu).getByRole("menuitemcheckbox", { name: "Background art" });
    expect(item.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("menu", { name: "Appearance" })).toBeTruthy();
    fireEvent.click(item);
    await waitFor(() =>
      expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe('{"backgroundArt":true}'),
    );
  });

  it("a corrupt stored value reads as On", async () => {
    window.localStorage.setItem(APPEARANCE_KEY, "{oops");
    render(<AppearanceMenu />);
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    expect(
      within(menu)
        .getByRole("menuitemcheckbox", { name: "Background art" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});

/**
 * VIEW-TRANSITIONS (2026-11-02): a theme pick reveals from the item that
 * chose it, inside document.startViewTransition, and flips plainly without
 * the API, under reduced motion, or when nothing on screen would change.
 */
describe("AppearanceMenu theme reveal", () => {
  /** A startViewTransition stub that runs the update on the microtask queue. */
  function stubViewTransition() {
    const start = vi.fn((update: () => Promise<void> | void) => {
      const done = Promise.resolve().then(() => update());
      const finished = done.then(() => undefined);
      return { finished, ready: finished, updateCallbackDone: finished, skipTransition() {} };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    return start;
  }

  function stubMatchMedia({ dark = false, reduce = false } = {}) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-color-scheme") ? dark : reduce,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
      })),
    );
  }

  async function pick(label: string) {
    render(
      <ThemeProvider>
        <AppearanceMenu />
      </ThemeProvider>,
    );
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: label }));
  }

  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    vi.unstubAllGlobals();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme-reveal");
    document.documentElement.removeAttribute("style");
  });

  it("picking Light sweeps the new theme from the item, then clears the origin", async () => {
    stubMatchMedia();
    const start = stubViewTransition();
    await pick("Light");
    expect(start).toHaveBeenCalledTimes(1);
    const html = document.documentElement;
    expect(html.hasAttribute("data-theme-reveal")).toBe(true);
    expect(html.style.getPropertyValue("--reveal-x")).toMatch(/px$/);
    expect(html.style.getPropertyValue("--reveal-r")).toMatch(/px$/);
    await waitFor(() => expect(html.classList.contains("light")).toBe(true));
    await waitFor(() => expect(html.hasAttribute("data-theme-reveal")).toBe(false));
    expect(html.style.getPropertyValue("--reveal-x")).toBe("");
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("flips plainly without the API", async () => {
    stubMatchMedia();
    await pick("Light");
    const html = document.documentElement;
    expect(html.hasAttribute("data-theme-reveal")).toBe(false);
    await waitFor(() => expect(html.classList.contains("light")).toBe(true));
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("flips plainly under reduced motion", async () => {
    stubMatchMedia({ reduce: true });
    const start = stubViewTransition();
    await pick("Light");
    expect(start).not.toHaveBeenCalled();
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it("flips plainly when nothing on screen changes: System while the system is already dark", async () => {
    stubMatchMedia({ dark: true });
    const start = stubViewTransition();
    await pick("System");
    expect(start).not.toHaveBeenCalled();
    await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("system"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
