/**
 * EmptyState (R1b, C8): title, hint, action and the optional shield mark —
 * and that a pinned title passes through verbatim.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title verbatim with hint and action, mark only when asked", () => {
    const { container, rerender } = render(
      <EmptyState
        title="No bookmarks yet"
        hint="The Bookmark button on any shared deck saves it here."
        action={<a href="/commanders">Browse commanders</a>}
      />,
    );
    expect(screen.getByText("No bookmarks yet")).toBeTruthy();
    expect(screen.getByText("The Bookmark button on any shared deck saves it here.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse commanders" })).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();

    rerender(<EmptyState title="No cards yet" mark />);
    expect(container.querySelector("svg[aria-hidden]")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
