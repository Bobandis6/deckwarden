/**
 * The repo's first component test (R1a): the Modal wrapper over Base UI's
 * Dialog. Pins the accessibility contract every former hand-rolled dialog
 * now gets for free — a labelled dialog role, focus moved inside on open,
 * Escape and the close button routed to onClose — so a later primitive
 * swap cannot silently lose it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useRef, useState } from "react";

import { Modal, ModalFinalFocus } from "./modal";

function renderModal(onClose: () => void = () => {}) {
  return render(
    <Modal label="Share deck" onClose={onClose}>
      <p>Anyone with the link can view.</p>
      <button type="button">Copy link</button>
    </Modal>,
  );
}

describe("Modal", () => {
  it("renders a dialog named by its label with the children inside it", async () => {
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Share deck" });
    expect(dialog.contains(screen.getByRole("button", { name: "Copy link" }))).toBe(true);
    expect(dialog.textContent).toContain("Anyone with the link can view.");
  });

  it("moves focus inside the dialog on open", async () => {
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Share deck" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("Escape calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const dialog = await screen.findByRole("dialog", { name: "Share deck" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("the close button calls onClose", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    await screen.findByRole("dialog", { name: "Share deck" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("ModalFinalFocus sends focus to the provided element on close (the editor's More trigger)", async () => {
    function Host({ open, onClose }: { open: boolean; onClose: () => void }) {
      const target = useRef<HTMLButtonElement>(null);
      return (
        <ModalFinalFocus.Provider value={target}>
          <button type="button" ref={target}>
            More
          </button>
          {open && (
            <Modal label="Deck details" onClose={onClose}>
              <button type="button">Done</button>
            </Modal>
          )}
        </ModalFinalFocus.Provider>
      );
    }
    function Wrapper() {
      const [open, setOpen] = useState(true);
      return <Host open={open} onClose={() => setOpen(false)} />;
    }
    render(<Wrapper />);
    const dialog = await screen.findByRole("dialog", { name: "Deck details" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" })),
    );
  });

  it("wide maps to the wider panel size", async () => {
    render(
      <Modal label="Deck history" onClose={() => {}} wide>
        <p>versions</p>
      </Modal>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Deck history" });
    expect(dialog.className).toContain("sm:max-w-2xl");
  });
});
