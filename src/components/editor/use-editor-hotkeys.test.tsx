/**
 * The hotkey dialog guard (R3, REDESIGN.md §5 R3 "done when"): `/` and `?`
 * fire from the deck pane, never from a text field, and never while a
 * dialog is open — both through the editor's `enabled` switch (dialog ===
 * null) and through the target guard on its own.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/modal";
import { useEditorHotkeys } from "./use-editor-hotkeys";

function Host({
  enabled,
  onSlash,
  onHelp,
  dialog = false,
}: {
  enabled: boolean;
  onSlash: () => void;
  onHelp: () => void;
  dialog?: boolean;
}) {
  useEditorHotkeys({ enabled, onSlash, onHelp });
  return (
    <div>
      <input aria-label="Card search" />
      <button type="button">Deck</button>
      {dialog && (
        <Modal label="Deck details" onClose={() => {}}>
          <button type="button">Done</button>
        </Modal>
      )}
    </div>
  );
}

describe("useEditorHotkeys", () => {
  it("/ and ? fire from a non-text target and prevent the default", () => {
    const onSlash = vi.fn();
    const onHelp = vi.fn();
    render(<Host enabled onSlash={onSlash} onHelp={onHelp} />);
    const deck = screen.getByRole("button", { name: "Deck" });
    deck.focus();
    const slash = fireEvent.keyDown(deck, { key: "/" });
    expect(onSlash).toHaveBeenCalledTimes(1);
    expect(slash).toBe(false); // default prevented
    fireEvent.keyDown(deck, { key: "?", shiftKey: true });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it("typing / or ? into a text field types the character", () => {
    const onSlash = vi.fn();
    const onHelp = vi.fn();
    render(<Host enabled onSlash={onSlash} onHelp={onHelp} />);
    const input = screen.getByRole("textbox", { name: "Card search" });
    input.focus();
    expect(fireEvent.keyDown(input, { key: "/" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "?" })).toBe(true);
    expect(onSlash).not.toHaveBeenCalled();
    expect(onHelp).not.toHaveBeenCalled();
  });

  it("modified keys pass through", () => {
    const onSlash = vi.fn();
    render(<Host enabled onSlash={onSlash} onHelp={() => {}} />);
    const deck = screen.getByRole("button", { name: "Deck" });
    fireEvent.keyDown(deck, { key: "/", ctrlKey: true });
    fireEvent.keyDown(deck, { key: "/", metaKey: true });
    expect(onSlash).not.toHaveBeenCalled();
  });

  it("with a dialog open (the editor passes enabled=false) neither key does anything", async () => {
    const onSlash = vi.fn();
    const onHelp = vi.fn();
    render(<Host enabled={false} onSlash={onSlash} onHelp={onHelp} dialog />);
    const done = await screen.findByRole("button", { name: "Done" });
    done.focus();
    await waitFor(() => expect(document.activeElement).toBe(done));
    fireEvent.keyDown(done, { key: "/" });
    fireEvent.keyDown(done, { key: "?" });
    expect(onSlash).not.toHaveBeenCalled();
    expect(onHelp).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Deck details" }).contains(document.activeElement),
    ).toBe(true);
  });

  it("the target guard alone ignores keys from inside a dialog, even when enabled", async () => {
    const onSlash = vi.fn();
    const onHelp = vi.fn();
    render(<Host enabled onSlash={onSlash} onHelp={onHelp} dialog />);
    const done = await screen.findByRole("button", { name: "Done" });
    fireEvent.keyDown(done, { key: "/" });
    fireEvent.keyDown(done, { key: "?" });
    expect(onSlash).not.toHaveBeenCalled();
    expect(onHelp).not.toHaveBeenCalled();
  });
});
