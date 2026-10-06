/**
 * The Export dialog (no test before Y5): the decklist in a read-only box and
 * "Copy to clipboard" confirming in the shared status slot (Y5 adopts
 * useCopyToClipboard + CopyStatus) — it clears, says so when the clipboard
 * refuses, and the button keeps its name throughout (it used to swap to
 * "Copied ✓" and never come back).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY_RESET_MS } from "@/components/copy-status";

import { ExportDialog } from "./import-export";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const writeText = vi.fn<(text: string) => Promise<void>>();
Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

describe("ExportDialog", () => {
  it("copies the list, confirms in the status slot, keeps its name, and clears", async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValueOnce();
    render(<ExportDialog text={"1 Sol Ring\n1 Arcane Signet"} onClose={() => {}} />);
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Exported decklist" }).value,
    ).toBe("1 Sol Ring\n1 Arcane Signet");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    });
    expect(writeText).toHaveBeenCalledWith("1 Sol Ring\n1 Arcane Signet");
    const status = screen.getByRole("status");
    expect(status.getAttribute("data-slot")).toBe("copy-status");
    expect(status.textContent).toBe("Copied");
    expect(screen.getByRole("button", { name: "Copy to clipboard" })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(COPY_RESET_MS);
    });
    expect(status.textContent).toBe("");
  });

  it("a refused clipboard says so instead of nothing", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<ExportDialog text="1 Sol Ring" onClose={() => {}} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy to clipboard" }));
    });
    expect(screen.getByRole("status").textContent).toBe(
      "Couldn't copy — select the list and copy it.",
    );
  });
});
