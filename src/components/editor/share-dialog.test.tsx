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

import { GAME_ID } from "@/db/seed-data";
import { BRACKET_COPY, declaredLabel } from "@/lib/brackets/copy";
import { getAdapter } from "@/lib/games/registry";
import { deckOgLabels } from "@/lib/og/labels";

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
      "Couldn't copy. Select the link and copy it.",
    );
  });
});

/**
 * DECK-PREVIEW-BRACKET (DECKCHECK-STUDY §2.4): the link preview's bracket
 * line — what the deck's unfurl says about the bracket, in the image's own
 * words (pinned against `deckOgLabels`' declared stat, which labels.test.ts
 * pins to `declaredLabel`), and the action the editor wires to the Why
 * sheet's Your target. No line while private, nor without `bracket`.
 */
describe("ShareDialog — the link preview's bracket line (DECK-PREVIEW-BRACKET)", () => {
  const mtg = getAdapter("mtg").brackets!;
  const image = deckOgLabels(GAME_ID.mtg).declared!;
  const line = () => document.querySelector<HTMLElement>("[data-slot=share-bracket]");
  const sentence = () => line()!.querySelector("span")!.textContent;
  const withBracket = (targetLevel: number | null, onDeclare = vi.fn()) => ({
    bracket: { brackets: mtg, targetLevel, onDeclare },
  });

  it("with a target, at every level the game has: the image's declared stat word for word, then Change", () => {
    for (const { level } of mtg.levels) {
      renderDialog(withBracket(level));
      expect(sentence()).toBe(BRACKET_COPY.previewShows(image(level)!));
      expect(sentence()).toBe(`Link previews show ${declaredLabel(mtg, level)}.`);
      expect(line()!.textContent).toBe(`Link previews show Bracket ${level} (declared). Change`);
      cleanup();
    }
  });

  it("without a target: no bracket, and Declare a bracket — and a level the game doesn't have reads as none, as the image draws none", () => {
    for (const level of [null, 0, 6, 2.5]) {
      renderDialog(withBracket(level));
      expect(line()!.textContent).toBe("Link previews show no bracket. Declare a bracket");
      if (level !== null) expect(image(level)).toBeNull();
      cleanup();
    }
  });

  it("the action calls onDeclare once, its name plain and the sentence its description", () => {
    const onDeclare = vi.fn();
    renderDialog(withBracket(null, onDeclare));
    const action = screen.getByRole("button", { name: "Declare a bracket" });
    expect(document.getElementById(action.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Link previews show no bracket.",
    );
    fireEvent.click(action);
    expect(onDeclare).toHaveBeenCalledTimes(1);
  });

  it("a private deck has no line (its preview is the generic image) and keeps the private line; Unlisted brings it back", () => {
    const bracket = withBracket(3);
    const view = render(
      <ShareDialog
        publicId="uwvrnv2pv4t6"
        visibility="private"
        accountDeck
        onSetVisibility={() => Promise.resolve()}
        onClose={() => {}}
        {...bracket}
      />,
    );
    expect(line()).toBeNull();
    expect(screen.getByText("The link only works for you while the deck is private.")).toBeTruthy();
    view.rerender(
      <ShareDialog
        publicId="uwvrnv2pv4t6"
        visibility="unlisted"
        accountDeck
        onSetVisibility={() => Promise.resolve()}
        onClose={() => {}}
        {...bracket}
      />,
    );
    expect(sentence()).toBe("Link previews show Bracket 3 (declared).");
    expect(screen.queryByText("The link only works for you while the deck is private.")).toBeNull();
  });

  it("without `bracket` (One Piece, or a list with no commander) there is no line, public or unlisted", () => {
    renderDialog({ visibility: "public" });
    expect(line()).toBeNull();
    cleanup();
    renderDialog();
    expect(line()).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toContain("Link previews");
  });

  it("openAt bracket (back from the Why sheet) lands focus on the line's action; a plain open does not", async () => {
    renderDialog({ ...withBracket(3), openAt: "bracket" });
    const change = screen.getByRole("button", { name: "Change" });
    await vi.waitFor(() => expect(document.activeElement).toBe(change));
    cleanup();
    renderDialog(withBracket(3));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});
