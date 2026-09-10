/**
 * The editor header (R3): the mark → home (no "Back to home" text link), the
 * game / format chip, the name input's unchanged contract, the fixed-width
 * save slot across all four states with Retry outside the menu, Share only
 * once a server row exists, the More menu's items (History only with a
 * live deck) opening the right dialog, and exactly one appearance control
 * — the same assertion the site header test makes for the (site) pages.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SaveStatus } from "@/components/editor/use-autosave";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { getAdapter } from "@/lib/games/registry";
import { EditorHeader } from "./editor-header";

const mtg = getAdapter("mtg");

function header(over: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
  return (
    <EditorHeader
      adapter={mtg}
      format={COMMANDER}
      deckName=""
      onNameChange={() => {}}
      forkedFrom={null}
      saveStatus="saved"
      onRetry={() => {}}
      canShare={false}
      canHistory={false}
      onOpen={() => {}}
      {...over}
    />
  );
}

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

describe("EditorHeader", () => {
  it("mark → home, the chip, the name input, one appearance control, no site nav", () => {
    render(header());
    expect(screen.getByRole("link", { name: "Deckwarden" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
    expect(screen.getByText("Magic: The Gathering · Commander")).toBeTruthy();
    const name = screen.getByRole("textbox", { name: "Deck name" });
    expect(name.getAttribute("placeholder")).toBe("Untitled — click to name your deck");
    expect(name.getAttribute("maxlength")).toBe("120");
    expect(screen.getAllByRole("button", { name: "Appearance" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Browse" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Build" })).toBeNull();
  });

  it("the appearance menu carries the Background art switch (R2)", async () => {
    render(header());
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Background art" })).toBeTruthy();
  });

  it("name edits flow through onNameChange", () => {
    const onNameChange = vi.fn();
    render(header({ onNameChange }));
    fireEvent.change(screen.getByRole("textbox", { name: "Deck name" }), {
      target: { value: "Queza" },
    });
    expect(onNameChange).toHaveBeenCalledWith("Queza");
  });

  it("the save slot keeps one fixed width across all four states; Retry sits in it, not the menu", () => {
    const onRetry = vi.fn();
    const { rerender } = render(header({ onRetry }));
    const widths = new Set<string>();
    for (const status of ["saved", "dirty", "saving", "error"] as SaveStatus[]) {
      rerender(header({ saveStatus: status, onRetry }));
      const slot = document.querySelector('[data-slot="save-slot"]') as HTMLElement;
      expect(slot.getAttribute("aria-live")).toBe("polite");
      widths.add(
        slot.className
          .split(" ")
          .filter((c) => /^w-/.test(c))
          .join(" "),
      );
      expect(slot.textContent).toContain(
        { saved: "Saved", dirty: "Unsaved…", saving: "Saving…", error: "Save failed" }[status],
      );
    }
    expect(widths.size).toBe(1);
    expect([...widths][0]).toBe("w-36");
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Share is the primary action only once a server row exists", () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    rerender(header({ onOpen, canShare: true }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onOpen).toHaveBeenCalledWith("share");
  });

  it("More lists Details, Import, Export (+ History with a live deck) and the shortcut sheet", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    open(screen.getByRole("button", { name: "More" }));
    let menu = await screen.findByRole("menu", { name: "More" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Details", "Import", "Export", "Keyboard shortcuts?"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Details" }));
    expect(onOpen).toHaveBeenCalledWith("details");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    rerender(header({ onOpen, canHistory: true }));
    open(screen.getByRole("button", { name: "More" }));
    menu = await screen.findByRole("menu", { name: "More" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toContain("History");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "History" }));
    expect(onOpen).toHaveBeenCalledWith("history");
  });
});
