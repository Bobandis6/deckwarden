/**
 * LeaderIndexView (R5a): the list is the default and what the server
 * renders; the toggle is a group named "Index view" with aria-pressed
 * items; Grid swaps in the image grid with the same hrefs (ending right
 * after the slug), ranks and names, the rank badge top-left and lazy
 * framed images; the choice persists under `deckwarden:index-view` and a
 * corrupt stored value renders the list.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { INDEX_VIEW_KEY } from "@/lib/hub/index-view";
import { LeaderIndexView, type IndexLeader } from "./leader-index-view";

const IMAGE = "https://cards.scryfall.io/small/front/5/b/5b40815d-0104-461e-b193-fcf5e1f35299.jpg";

const LEADERS: IndexLeader[] = [
  {
    id: "a",
    name: "Syr Konrad, the Grim",
    slug: "syr-konrad-the-grim",
    rank: 1,
    ciMask: 4,
    image: IMAGE,
  },
  {
    id: "b",
    name: "Etali, Primal Storm",
    slug: "etali-primal-storm",
    rank: 2,
    ciMask: 8,
    image: null,
  },
];

afterEach(() => {
  window.localStorage.clear();
});

describe("LeaderIndexView", () => {
  it("renders the list by default with ranks, names, pips and exact hub hrefs", () => {
    const { container } = render(<LeaderIndexView leaders={LEADERS} />);
    const group = screen.getByRole("group", { name: "Index view" });
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe("false");
    expect(group).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/c/syr-konrad-the-grim",
      "/c/etali-primal-storm",
    ]);
    expect(links[0].textContent).toContain("1");
    expect(links[0].textContent).toContain("Syr Konrad, the Grim");
    expect(container.querySelector(".pip.pip-b")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("Grid swaps in framed lazy images with the rank top-left, persists, and List comes back", () => {
    const { container } = render(<LeaderIndexView leaders={LEADERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("grid");
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe("true");

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(IMAGE);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("hover:ring-2");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/c/syr-konrad-the-grim",
      "/c/etali-primal-storm",
    ]);
    const badge = links[0].querySelector(".absolute") as HTMLElement;
    expect(badge.className).toContain("top-1 left-1");
    expect(badge.textContent).toBe("1");
    // No printing: the name stands in the box, the grid never breaks.
    expect(links[1].textContent).toContain("Etali, Primal Storm");
    expect(container.querySelector(".pip.pip-r")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("list");
    expect(container.querySelector("img")).toBeNull();
  });

  it("a corrupt stored value renders the list; a stored grid renders the grid after hydration", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, '{"view":"grid"}');
    const first = render(<LeaderIndexView leaders={LEADERS} />);
    expect(first.container.querySelector("img")).toBeNull();
    first.unmount();

    window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
    const second = render(<LeaderIndexView leaders={LEADERS} />);
    expect(second.container.querySelector("img")).toBeTruthy();
  });

  it("the server HTML is always the list, whatever the reader stored", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
    const html = renderToString(<LeaderIndexView leaders={LEADERS} />);
    expect(html).toContain('href="/c/syr-konrad-the-grim"');
    expect(html).not.toContain("<img");
    expect(html).toContain("divide-y");
  });
});
