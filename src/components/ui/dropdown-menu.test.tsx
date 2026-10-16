/**
 * The menu primitive's targets (LATER row 235): every item kind — item,
 * link item, submenu trigger, checkbox and radio items — is 44 px tall on a
 * coarse pointer, so the editor's More (with its Appearance radios and
 * switch), the site header's menus, the deck tiles' ⋯ menu and the
 * Appearance menu keep the phone's 44 px rule; a mouse keeps the 28 px rows
 * (`py-1` on a 20 px line). Group labels and separators are not targets.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

describe("DropdownMenu items on a coarse pointer (LATER row 235)", () => {
  it("every item kind is 44 px on touch and keeps its 28 px row for a mouse; labels and separators stay as they are", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Deck</DropdownMenuLabel>
            <DropdownMenuItem>Details</DropdownMenuItem>
            <DropdownMenuLinkItem href="/account">My decks</DropdownMenuLinkItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value="dark">
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuCheckboxItem checked>Background art</DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Move to folder</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Brews</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open(screen.getByRole("button", { name: "Actions" }));
    const menu = await screen.findByRole("menu");
    const targets = [
      within(menu).getByRole("menuitem", { name: "Details" }),
      within(menu).getByRole("menuitem", { name: "My decks" }),
      within(menu).getByRole("menuitemradio", { name: "Dark" }),
      within(menu).getByRole("menuitemcheckbox", { name: "Background art" }),
      within(menu).getByRole("menuitem", { name: "Move to folder" }),
    ];
    for (const item of targets) {
      expect(item.className).toContain("pointer-coarse:min-h-11");
      // A mouse keeps the row: 4 px above and below a 20 px line, no floor of its own.
      expect(item.className).toContain("py-1");
      expect(item.className).not.toMatch(/(^| )(min-h|h)-/);
    }
    const label = menu.querySelector("[data-slot=dropdown-menu-label]")!;
    expect(label.textContent).toBe("Deck");
    expect(label.className).not.toContain("pointer-coarse:");
    expect(menu.querySelector("[data-slot=dropdown-menu-separator]")!.className).not.toContain(
      "pointer-coarse:",
    );
  });
});
