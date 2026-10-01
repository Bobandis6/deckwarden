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

/**
 * The One Piece flavor (P4.9, /leaders): the list keeps /leaders' markup —
 * name, printed card number, life, color chips, no rank — and the grid
 * shows the mirror's small WebP with the card number top-left; both link
 * /l/ hubs, and the same stored preference drives both indexes.
 */
const OP_IMAGE = "https://img.deckwarden.gg/optcg/small/OP15-058.webp";

const OP_LEADERS: IndexLeader[] = [
  {
    id: "e",
    name: "Enel",
    slug: "enel-op15-058",
    rank: null,
    ciMask: 32,
    image: OP_IMAGE,
    externalKey: "OP15-058",
    life: 4,
  },
  {
    id: "l",
    name: "Monkey.D.Luffy",
    slug: "monkey-d-luffy-st01-001",
    rank: null,
    ciMask: 8,
    image: null,
    externalKey: "ST01-001",
    life: null,
  },
];

describe("LeaderIndexView, One Piece flavor", () => {
  it("lists /l/ hubs with the card number, life and color chips — no rank, no images", () => {
    const { container } = render(<LeaderIndexView game="optcg" leaders={OP_LEADERS} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/l/enel-op15-058",
      "/l/monkey-d-luffy-st01-001",
    ]);
    expect(links[0].textContent).toBe("EnelOP15-0584 LifePurple");
    // No life on record → no "Life" text, never "null Life".
    expect(links[1].textContent).toBe("Monkey.D.LuffyST01-001Red");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".pip")).toBeNull();
  });

  it("Grid: the small WebP framed and lazy, the card number top-left, the name when no image", () => {
    const { container } = render(<LeaderIndexView game="optcg" leaders={OP_LEADERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("grid");

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe(OP_IMAGE);
    expect(imgs[0].getAttribute("loading")).toBe("lazy");
    expect(imgs[0].className).toContain("hover:ring-2");

    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/l/enel-op15-058",
      "/l/monkey-d-luffy-st01-001",
    ]);
    const badge = links[0].querySelector(".absolute") as HTMLElement;
    expect(badge.className).toContain("top-1 left-1");
    expect(badge.textContent).toBe("OP15-058");
    expect(links[0].textContent).toContain("4 Life");
    // No printing image: the name stands in the box, the badge still reads the card number.
    expect(links[1].textContent).toContain("Monkey.D.Luffy");
    expect((links[1].querySelector(".absolute") as HTMLElement).textContent).toBe("ST01-001");
  });

  it("the server HTML is the One Piece list, with the summary beside the toggle", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "grid");
    const html = renderToString(
      <LeaderIndexView game="optcg" leaders={OP_LEADERS} summary="2 leaders" />,
    );
    expect(html).toContain('href="/l/enel-op15-058"');
    // One text node: the count reads whole in the HTML (no React comment split).
    expect(html).toContain('aria-live="polite">2 leaders</p>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="/c/');
  });
});
