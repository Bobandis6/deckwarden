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
    expect(
      screen.getByText("Pick one from the full list, or press Ctrl+Enter on a search result."),
    ).toBeTruthy();
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
