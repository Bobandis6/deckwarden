/**
 * Segmented (R3, F11): the ToggleGroup contract behind the unchanged
 * `label / options / value / onChange` API — a group named by the label,
 * `aria-pressed` per item, one change per pick, no change for re-picking
 * the pressed item, and the slide index following the value.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Segmented, VIEW_OPTIONS } from "./segmented";

describe("Segmented", () => {
  it("is a labelled group of aria-pressed items", () => {
    render(<Segmented label="View" options={VIEW_OPTIONS} value="text" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "View" });
    const text = screen.getByRole("button", { name: "Text" });
    const grid = screen.getByRole("button", { name: "Grid" });
    expect(group.contains(text) && group.contains(grid)).toBe(true);
    expect(text.getAttribute("aria-pressed")).toBe("true");
    expect(grid.getAttribute("aria-pressed")).toBe("false");
    expect(group.getAttribute("style")).toContain("--seg-index: 0");
  });

  it("picking another item changes once; re-picking the pressed one does nothing", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Segmented label="View" options={VIEW_OPTIONS} value="text" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(onChange).toHaveBeenCalledWith("grid");
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<Segmented label="View" options={VIEW_OPTIONS} value="grid" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "View" }).getAttribute("style")).toContain(
      "--seg-index: 1",
    );
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Y4b: past four options the coarse-pointer padding narrows (a 360 px phone fits 1–5 · Not set); fewer keep 12 px", () => {
    const levels = ["1", "2", "3", "4", "5", "Not set"].map((label) => ({ value: label, label }));
    const { unmount } = render(
      <Segmented ariaLabel="Your target" options={levels} value="Not set" onChange={() => {}} />,
    );
    for (const item of screen.getAllByRole("button")) {
      expect(item.className).toContain("pointer-coarse:px-2");
      expect(item.className).toContain("pointer-coarse:min-h-11");
      expect(item.className).not.toContain("pointer-coarse:px-3");
    }
    unmount();
    render(<Segmented label="View" options={VIEW_OPTIONS} value="text" onChange={() => {}} />);
    for (const item of screen.getAllByRole("button")) {
      expect(item.className).toContain("pointer-coarse:px-3");
    }
  });

  it("Y4b: a null value presses nothing and shows no thumb; the first pick changes it", () => {
    const onChange = vi.fn();
    const answers = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Not sure" },
    ];
    const { container } = render(
      <Segmented
        ariaLabel="Theme first, over power?"
        options={answers}
        value={null}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole("group", { name: "Theme first, over power?" });
    for (const item of screen.getAllByRole("button")) {
      expect(item.getAttribute("aria-pressed")).toBe("false");
    }
    expect(container.querySelector("[data-slot=segmented-thumb]")).toBeNull();
    // No visible label: the question sits above the group.
    expect(group.parentElement!.textContent).toBe("YesNoNot sure");
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(onChange).toHaveBeenCalledWith("yes");
  });
});
