/**
 * Danger-zone dialog (R1a moved it to AlertDialog). /account only renders it
 * for a signed-in user, so a browser pass needs the owner's session; this
 * pins the contract instead: an alertdialog named "Delete account", the
 * type-to-confirm input inside it, the destructive action armed only by the
 * exact phrase, and Cancel closing it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DELETE_CONFIRM_PHRASE } from "@/lib/profile/delete-account-phrase";
import { DeleteAccount } from "./delete-account";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("DeleteAccount", () => {
  it("opens an alertdialog with the confirm input, arms on the exact phrase, Cancel closes", async () => {
    render(<DeleteAccount />);
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete account…" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete account" });
    const input = screen.getByLabelText(/to confirm/);
    expect(dialog.contains(input)).toBe(true);
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const action = screen.getByRole("button", { name: "Delete my account" });
    expect(action).toHaveProperty("disabled", true);
    fireEvent.change(input, { target: { value: DELETE_CONFIRM_PHRASE.toUpperCase() } });
    expect(action).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
