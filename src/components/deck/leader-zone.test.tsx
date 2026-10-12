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
