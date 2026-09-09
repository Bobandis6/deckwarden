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
});
