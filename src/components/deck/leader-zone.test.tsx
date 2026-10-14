/**
 * LeaderZone (R3, W4): the editor's empty-state actions — the primary
 * Browse link off `display.leaderBrowse` (D3; the demotion of search focus
 * to a ghost "Search by name" is deliberate) — the read-only share shape
 * (no action, no hint, no remove), and the One Piece caption — printed id
 * and Life (C13 / C15).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorCard } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { LeaderZone } from "./leader-zone";

const commanderZone = COMMANDER.zones[0];
const optcg = getAdapter("optcg");
const leaderZone = optcg.formats[0].zones[0];

const enel: EditorCard = {
  id: "f17abc33-b7f1-51b2-9a61-7f3af8c60d6a",
  name: "Enel",
  externalKey: "OP15-058",
  primaryType: "Leader",
  costValue: null,
  colorsMask: 1,
  ciMask: 1,
  isLeaderCandidate: true,
  isPreview: false,
  cheapestUsd: null,
  popularity: null,
  legality: [],
  attrs: { category: "leader", power_num: 5000, life: 5 },
  image: null,
};

describe("LeaderZone", () => {
  it("editor: Browse commanders is the primary LINK (adapter href, intent hook); Search by name is the ghost callback (W4)", () => {
    const choose = vi.fn();
    const browse = vi.fn();
    render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={choose}
        onBrowseLeader={browse}
        adapter={getAdapter("mtg")}
      />,
    );
    expect(screen.getByText("No commander yet")).toBeTruthy();
    // The same sentence on a fine pointer; its keyboard half hides on coarse ones (Y2a).
    const hint = screen.getByText(
      (_, el) => el?.tagName === "P" && /^Pick one/.test(el.textContent ?? ""),
    );
    expect(hint.textContent).toBe(
      "Pick one from the full list, or press Ctrl+Enter on a search result.",
    );
    expect(screen.getByText(/or press Ctrl\+Enter/).className).toBe("pointer-coarse:hidden");
    const link = screen.getByRole("link", { name: "Browse commanders" });
    expect(link.getAttribute("href")).toBe("/commanders");
    fireEvent.click(link);
    expect(browse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Search by name" }));
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it("editor without an adapter: no Browse link, the ghost search action stands alone", () => {
    render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={() => {}}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Search by name" })).toBeTruthy();
  });

  it("share page: no action, no hint, no remove", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[]}
        severity={new Map()}
        onPreview={() => {}}
        adapter={optcg}
      />,
    );
    expect(screen.getByText("No leader yet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/Ctrl\+Enter/)).toBeNull();
  });

  it("the One Piece caption reads the printed id and the stat line with Life", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[{ entry: { cardId: enel.id, zone: "leader", qty: 1, tags: [] }, card: enel }]}
        severity={new Map()}
        onPreview={() => {}}
        adapter={optcg}
      />,
    );
    expect(screen.getByText("OP15-058 · 5000 Power · 5 Life").getAttribute("class")).toContain(
      "font-mono",
    );
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });
});

describe("LeaderZone — the accent ring (R5b, F12)", () => {
  const item = { entry: { cardId: enel.id, zone: "leader", qty: 1, tags: [] }, card: enel };

  it("share page (read-only): the card carries the persistent accent ring; a validation ring wins", () => {
    const { rerender } = render(
      <LeaderZone zone={leaderZone} items={[item]} severity={new Map()} onPreview={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Show Enel" });
    expect(button.className).toContain("ring-accent-game");
    expect(button.className).toContain("ring-2");
    rerender(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map([[enel.id, "error" as const]])}
        onPreview={() => {}}
      />,
    );
    expect(button.className).toContain("ring-destructive");
    expect(button.className).not.toContain("ring-accent-game");
  });

  it("editor (onRemove present): no persistent ring", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Show Enel" }).className).not.toContain(
      "ring-accent-game",
    );
  });
});

describe("LeaderZone — severity as text (R6)", () => {
  const item = {
    entry: { cardId: enel.id, zone: leaderZone.id, qty: 1, tags: [] },
    card: enel,
  };

  it("a card with a problem is described as such; the button's name stays Show {name}", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map([[enel.id, "error" as const]])}
        onPreview={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Show Enel" });
    const description = document.getElementById(button.getAttribute("aria-describedby")!)!;
    expect(description.textContent).toBe("Has a problem");
    expect(description.className).toContain("sr-only");
    expect(button.className).toContain("ring-destructive");
  });

  it("a warning reads Warning; a clean card is described by nothing", () => {
    const { rerender } = render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map([[enel.id, "warning" as const]])}
        onPreview={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Show Enel" });
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Warning",
    );
    rerender(
      <LeaderZone zone={leaderZone} items={[item]} severity={new Map()} onPreview={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Show Enel" }).hasAttribute("aria-describedby")).toBe(
      false,
    );
    expect(document.querySelector("[data-slot=severity]")).toBeNull();
  });
});

describe("LeaderZone — the bones (U3a, WAVE5 D4)", () => {
  const pictured: EditorCard = { ...enel, image: "https://img.deckwarden.gg/optcg/OP15-058.webp" };
  const item = { entry: { cardId: enel.id, zone: "leader", qty: 1, tags: [] }, card: pictured };

  it("the editor's image is priority: eager, high fetch priority, no fade; the share page's stays lazy", () => {
    const { unmount } = render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        adapter={optcg}
        priority
      />,
    );
    const img = screen.getByRole("img", { name: "Enel" });
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.className).not.toContain("opacity-0");
    unmount();
    render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map()}
        onPreview={() => {}}
        adapter={optcg}
        ruled
      />,
    );
    expect(screen.getByRole("img", { name: "Enel" }).getAttribute("loading")).toBe("lazy");
  });

  it("while a seed is on its way the zone holds the card's box as a Skeleton — no empty state, no actions", () => {
    render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={() => {}}
        adapter={getAdapter("mtg")}
        pending
      />,
    );
    const pending = document.querySelector<HTMLElement>("[data-slot=leader-pending]")!;
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    // The card's aspect at the leader's width, then the name row at the Remove button's height.
    expect(pending.querySelector("li")?.className).toBe("w-40 max-w-[45%]");
    expect(pending.querySelector("[data-slot=skeleton]")?.className).toContain("aspect-[488/680]");
    expect(pending.querySelector(".size-6.pointer-coarse\\:size-11")).not.toBeNull();
    expect(screen.queryByText("No commander yet")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a placed leader wins over `pending` (a seed that lands renders the card at once)", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[item]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        adapter={optcg}
        pending
      />,
    );
    expect(document.querySelector("[data-slot=leader-pending]")).toBeNull();
    expect(screen.getByRole("img", { name: "Enel" })).toBeTruthy();
  });

  it("the heading is the groups' label and count on space; `ruled` keeps the share page's hairline", () => {
    const { container, unmount } = render(
      <LeaderZone zone={commanderZone} items={[]} severity={new Map()} onPreview={() => {}} />,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("pt-5 pb-1.5");
    expect(heading.className).not.toContain("border-b");
    expect(heading.querySelector("[data-slot=group-count]")?.textContent).toBe("0");
    expect(container.querySelector("section")?.className ?? "").not.toContain("mt-4");
    unmount();
    const share = render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onPreview={() => {}}
        ruled
      />,
    );
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("border-b pb-1");
    expect(share.container.querySelector("section")?.className).toBe("mt-4");
  });
});

describe("LeaderZone — the raised card (U3b, WAVE5 D4)", () => {
  const RAISED_ROW = "w-40 max-w-[45%] md:flex md:w-full md:max-w-none md:items-start md:gap-4";
  const giada: EditorCard = {
    ...card({
      name: "Giada, Font of Hope",
      attrs: {
        type_line: "Legendary Creature — Angel",
        oracle_text: "",
        power: "2",
        toughness: "2",
      },
    }),
    image: "https://cards.scryfall.io/normal/front/a/b/ab.jpg",
  };
  const giadaItem = {
    entry: { cardId: giada.id, zone: "commander", qty: 1, tags: [] },
    card: giada,
  };

  it("from md: the card at 180 px with its facts beside it, raised by the hero shadow on U2's 120 ms", () => {
    render(
      <LeaderZone
        zone={commanderZone}
        items={[giadaItem]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        adapter={getAdapter("mtg")}
        priority
        raised
      />,
    );
    const button = screen.getByRole("button", { name: "Show Giada, Font of Hope" });
    const row = button.closest("li")!;
    expect(row.className).toBe(RAISED_ROW);
    expect(button.className).toContain("md:w-45 md:shrink-0");
    const img = screen.getByRole("img", { name: "Giada, Font of Hope" });
    // HERO_CARD_SHADOW's values from md (phones keep shadow-md until U4a).
    expect(img.className).toContain(
      "shadow-md md:shadow-lg md:shadow-primary/25 md:dark:shadow-black/60",
    );
    // The frame's 2 px lift and ring on settle-120, in place of CardImage's untokened 150 ms.
    expect(img.className).toContain("motion-safe:hover:-translate-y-0.5");
    expect(img.className).toContain("transform_120ms_var(--ease-settle-120)");
    expect(img.className).not.toContain("150ms");
    // The facts: the type line and the caption as the adapter gives them (data, em dash kept).
    const facts = row.querySelector<HTMLElement>("[data-slot=leader-facts]")!;
    expect(facts.textContent).toBe("Legendary Creature — Angel · 2/2");
    expect(facts.className).toBe("type-meta text-muted-foreground hidden md:block");
    // Phones keep the mono caption under the card; from md the facts line carries it.
    const caption = row.querySelector<HTMLElement>("[data-slot=leader-caption]")!;
    expect(caption.textContent).toBe("2/2");
    expect(caption.className).toContain("font-mono");
    expect(caption.className).toContain("md:hidden");
    expect(screen.getByText("Giada, Font of Hope").className).toContain(
      "md:text-sm md:font-medium",
    );
    expect(screen.getByRole("button", { name: "Remove Giada, Font of Hope" })).toBeTruthy();
  });

  it("One Piece's facts: the category, then the printed id, Power and Life", () => {
    render(
      <LeaderZone
        zone={leaderZone}
        items={[{ entry: { cardId: enel.id, zone: "leader", qty: 1, tags: [] }, card: enel }]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        adapter={optcg}
        raised
      />,
    );
    expect(document.querySelector("[data-slot=leader-facts]")?.textContent).toBe(
      "Leader · OP15-058 · 5000 Power · 5 Life",
    );
  });

  it("the Skeleton is the same row while a seed is on its way: the card's box, then the name row and a facts line", () => {
    render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        adapter={getAdapter("mtg")}
        pending
        raised
      />,
    );
    const row = document.querySelector<HTMLElement>("[data-slot=leader-pending] li")!;
    expect(row.className).toBe(RAISED_ROW);
    const [box, facts] = [...row.children] as HTMLElement[];
    expect(box.dataset.slot).toBe("skeleton");
    expect(box.className).toContain("aspect-[488/680] w-full");
    expect(box.className).toContain("md:w-45 md:shrink-0");
    expect(facts.className).toBe("md:min-w-0 md:flex-1 md:pt-1");
    const [nameRow, caption, meta] = [...facts.children] as HTMLElement[];
    expect(nameRow.className).toContain("mt-1 flex items-center gap-1 md:mt-0");
    expect(nameRow.querySelector(".size-6.pointer-coarse\\:size-11")).not.toBeNull();
    expect(caption.className).toContain("md:hidden");
    expect(meta.className).toBe("type-meta hidden md:block");
    // Each line holds a no-break space, so it keeps its line box.
    expect(caption.textContent).toBe(" ");
    expect(meta.textContent).toBe(" ");
  });

  it("without `raised` (the share page) the card keeps its box above the name and no facts line", () => {
    render(
      <LeaderZone
        zone={commanderZone}
        items={[giadaItem]}
        severity={new Map()}
        onPreview={() => {}}
        adapter={getAdapter("mtg")}
        ruled
      />,
    );
    const row = screen.getByRole("button", { name: "Show Giada, Font of Hope" }).closest("li")!;
    expect(row.className).toBe("w-40 max-w-[45%]");
    expect(row.querySelector("[data-slot=leader-facts]")).toBeNull();
    expect(row.querySelector("[data-slot=leader-caption]")?.className).not.toContain("md:hidden");
    expect(screen.getByRole("img", { name: "Giada, Font of Hope" }).className).toContain(
      "transform_150ms",
    );
  });
});
