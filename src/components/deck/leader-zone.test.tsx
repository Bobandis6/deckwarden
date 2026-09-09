/**
 * LeaderZone (R3): the editor's "Choose commander / leader" action (only
 * with `onChooseLeader`), the read-only share shape (no action, no hint, no
 * remove), and the One Piece caption — printed id and Life (C13 / C15).
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
  it("editor: the empty state offers Choose commander, which calls back (search focus)", () => {
    const choose = vi.fn();
    render(
      <LeaderZone
        zone={commanderZone}
        items={[]}
        severity={new Map()}
        onRemove={() => {}}
        onPreview={() => {}}
        onChooseLeader={choose}
      />,
    );
    expect(screen.getByText("No commander yet")).toBeTruthy();
    expect(screen.getByText("Ctrl+Enter on a search result adds one.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose commander" }));
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it("share page: no action, no hint, no remove", () => {
    render(<LeaderZone zone={leaderZone} items={[]} severity={new Map()} onPreview={() => {}} />);
    expect(screen.getByText("No leader yet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
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
