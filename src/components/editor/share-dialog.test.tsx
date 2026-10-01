/**
 * The Share dialog (P1.7; no test existed before Y1 — this file was written
 * against the old dialog first, then moved with the copy): the three
 * visibility radios with lines that say what is true (public decks already
 * show on home, their commander's page and the owner's profile; Private
 * means "only you" for an account deck and "only this browser" for a guest
 * deck), the PATCH callback, and Copy link confirming in a status slot —
 * or saying it failed — while the button keeps its name.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareDialog } from "./share-dialog";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const writeText = vi.fn<(text: string) => Promise<void>>();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

function renderDialog(over: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
  const onSetVisibility = vi.fn<(v: string) => Promise<void>>(() => Promise.resolve());
  render(
    <ShareDialog
      publicId="uwvrnv2pv4t6"
      visibility="unlisted"
      accountDeck
      onSetVisibility={onSetVisibility}
      onClose={() => {}}
      {...over}
    />,
  );
  return { onSetVisibility };
}

const lineOf = (name: string) =>
  screen.getByRole("radio", { name: new RegExp(`^${name}`) }).closest("label")!.textContent;

describe("ShareDialog (Y1)", () => {
  it("says where a public deck appears and that Private means only you on an account deck", () => {
    renderDialog();
    expect(lineOf("Public")).toBe(
      "PublicAnyone with the link can view. Public decks also appear on the home page, their commander's page and your profile.",
    );
    expect(lineOf("Unlisted")).toBe("UnlistedAnyone with the link can view.");
    expect(lineOf("Private")).toBe("PrivateOnly you can view it.");
    expect(screen.getByRole("dialog").textContent).not.toContain("future browse pages");
  });

  it("a guest deck's Private line names this browser", () => {
    renderDialog({ accountDeck: false });
    expect(lineOf("Private")).toBe("PrivateOnly this browser can view it.");
  });

  it("a choice calls the PATCH callback; the current one does not", async () => {
    const { onSetVisibility } = renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /^Unlisted/ }));
    });
    expect(onSetVisibility).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /^Public/ }));
    });
    expect(onSetVisibility).toHaveBeenCalledWith("public");
  });

  it("Copy link confirms in the status slot, keeps its name, and clears", async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValueOnce();
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/d\/uwvrnv2pv4t6$/));
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Link copied");
    await act(async () => {
      vi.advanceTimersByTime(1800);
    });
    expect(status.textContent).toBe("");
  });

  it("a refused clipboard says so", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Couldn't copy — select the link and copy it.",
    );
  });
});
