/**
 * The appearance menu (R1a; R2 adds Background art): the three theme radios
 * still close on click, and the Background art checkbox — checked by
 * default, a corrupt stored value included — writes `deckwarden:appearance`
 * and keeps the menu open so the effect can be seen and reversed.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { APPEARANCE_KEY } from "@/lib/theme/appearance";
import { AppearanceMenu } from "./appearance-menu";

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
