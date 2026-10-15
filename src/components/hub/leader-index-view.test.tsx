/**
 * LeaderIndexView (R5a; the grid by default since U7a): the grid is the
 * default and what the server renders, with the same hrefs (ending right
 * after the slug) in the same order, ranks and names as text, the rank
 * badge top-left and framed images, the first EAGER_CARDS eager and the
 * rest lazy; the toggle is a group named "Index view" with aria-pressed
 * items; List swaps in the compact list with the same hrefs, replacing the
 * rows rather than moving them; the choice persists under
 * `deckwarden:index-view` and a corrupt stored value renders the grid.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { INDEX_VIEW_KEY } from "@/lib/hub/index-view";
import { EAGER_CARDS, LeaderIndexView, type IndexLeader } from "./leader-index-view";

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
  it("renders the grid by default: framed images, the rank top-left, names, pips and exact hub hrefs", () => {
    const { container } = render(<LeaderIndexView leaders={LEADERS} />);
    expect(screen.getByRole("group", { name: "Index view" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("false");

    const img = container.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(IMAGE);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className).toContain("hover:ring-2");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/c/syr-konrad-the-grim",
      "/c/etali-primal-storm",
    ]);
    const badge = links[0].querySelector(".absolute") as HTMLElement;
    expect(badge.className).toContain("top-1 left-1");
    expect(badge.textContent).toBe("1");
    expect(links[0].textContent).toContain("Syr Konrad, the Grim");
    // No printing: the name stands in the box, the grid never breaks.
    expect(links[1].textContent).toContain("Etali, Primal Storm");
    expect(container.querySelector(".pip.pip-b")).toBeTruthy();
    expect(container.querySelector(".pip.pip-r")).toBeTruthy();
    // The default is never written: storage holds only what a reader picks.
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBeNull();
  });

  it("the first EAGER_CARDS cards load at once (the LCP image and the first row), the rest lazy", () => {
    const many: IndexLeader[] = Array.from({ length: EAGER_CARDS + 2 }, (_, i) => ({
      id: `l${i}`,
      name: `Leader ${i}`,
      slug: `leader-${i}`,
      rank: i + 1,
      ciMask: 1,
      image: IMAGE,
    }));
    const { container } = render(<LeaderIndexView leaders={many} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(EAGER_CARDS).toBe(6);
    expect(imgs).toHaveLength(EAGER_CARDS + 2);
    imgs.forEach((img, i) => {
      const eager = i < EAGER_CARDS;
      expect(img.getAttribute("loading")).toBe(eager ? "eager" : "lazy");
      expect(img.getAttribute("fetchpriority")).toBe(eager ? "high" : null);
    });
  });

  it("List swaps in the compact list with the same hrefs, persists, and Grid comes back", () => {
    const { container } = render(<LeaderIndexView leaders={LEADERS} />);
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("list");
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("ul")?.className).toContain("divide-y");
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/c/syr-konrad-the-grim",
      "/c/etali-primal-storm",
    ]);
    expect(links[0].textContent).toContain("1");
    expect(links[0].textContent).toContain("Syr Konrad, the Grim");
    expect(container.querySelector(".pip.pip-b")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    expect(window.localStorage.getItem(INDEX_VIEW_KEY)).toBe("grid");
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("the swap replaces the rows (each view's list keyed by the view) instead of moving them", () => {
    const { container } = render(<LeaderIndexView leaders={LEADERS} />);
    const gridList = container.querySelector("ul");
    const gridRow = container.querySelector("li");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(container.querySelector("ul")).not.toBe(gridList);
    expect(container.querySelector("li")).not.toBe(gridRow);
    expect(gridRow?.isConnected).toBe(false);
  });

  it("a corrupt stored value renders the grid; a stored list renders the list after hydration", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, '{"view":"list"}');
    const first = render(<LeaderIndexView leaders={LEADERS} />);
    expect(first.container.querySelector("img")).toBeTruthy();
    first.unmount();

    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
    const second = render(<LeaderIndexView leaders={LEADERS} />);
    expect(second.container.querySelector("img")).toBeNull();
    expect(second.container.querySelector("ul")?.className).toContain("divide-y");
  });

  it("the server HTML is always the grid, whatever the reader stored", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
    const html = renderToString(<LeaderIndexView leaders={LEADERS} />);
    // Every link in the list's order, its rank and name as text beside the image.
    expect([...html.matchAll(/href="(\/c\/[a-z0-9-]+)"/g)].map((m) => m[1])).toEqual([
      "/c/syr-konrad-the-grim",
      "/c/etali-primal-storm",
    ]);
    expect(html).toContain("<img");
    expect(html).toContain(`src="${IMAGE}"`);
    expect(html).toContain('loading="eager"');
    expect(html).toContain("Syr Konrad, the Grim");
    expect(html).toContain("Etali, Primal Storm");
    expect(html).not.toContain("divide-y");
  });
});

/**
 * The One Piece flavor (P4.9, /leaders): the grid shows the mirror's small
 * WebP with the card number top-left; the list keeps /leaders' markup —
 * name, printed card number, life, color chips, no rank; both link /l/
 * hubs, and the same stored preference drives both indexes.
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
  it("Grid by default: the small WebP framed, the card number top-left, the name when no image", () => {
    const { container } = render(<LeaderIndexView game="optcg" leaders={OP_LEADERS} />);
    expect(screen.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed")).toBe("true");

    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe(OP_IMAGE);
    expect(imgs[0].getAttribute("loading")).toBe("eager");
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

  it("List: /l/ hubs with the card number, life and color chips — no rank, no images", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
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

  it("the server HTML is the One Piece grid, with the summary beside the toggle", () => {
    window.localStorage.setItem(INDEX_VIEW_KEY, "list");
    const html = renderToString(
      <LeaderIndexView game="optcg" leaders={OP_LEADERS} summary="2 leaders" />,
    );
    expect(html).toContain('href="/l/enel-op15-058"');
    // One text node: the count reads whole in the HTML (no React comment split).
    expect(html).toContain('aria-live="polite">2 leaders</p>');
    expect(html).toContain(`src="${OP_IMAGE}"`);
    expect(html).toContain(">OP15-058</span>");
    expect(html).not.toContain('href="/c/');
  });
});
