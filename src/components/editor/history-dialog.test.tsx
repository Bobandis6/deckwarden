/**
 * Y9a — History with played snapshots (WAVE4 D10): the cap's "n / 50"
 * counts saved versions only, so played lists never block Save version or
 * Restore; a played list has no Delete (it goes with its last game).
 * (Y10 brings HistoryDialog's full RTL suite.)
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COMMANDER } from "@/lib/games/mtg/formats";

import { HistoryDialog } from "./history-dialog";

const DECK = "33333333-3333-4333-8333-333333333333";
const version = (n: number, kind: "saved" | "played", note: string | null) => ({
  version: n,
  note,
  kind,
  createdAt: "2026-10-10T20:00:00.000Z",
  cardCount: 100,
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHistory(versions: ReturnType<typeof version>[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      versions,
      currentVersion: versions.length,
      cap: 50,
      playedAllowance: 100,
    }),
  });
  render(
    <HistoryDialog
      deckId={DECK}
      format={COMMANDER}
      entries={[]}
      cards={new Map()}
      forkedFrom={null}
      onBeforeRestore={async () => {}}
      onRestored={async () => {}}
      onClose={() => {}}
    />,
  );
  return screen.getByRole("dialog", { name: "Deck history" });
}

describe("HistoryDialog — played snapshots (Y9a)", () => {
  it("the count is saved versions only; a played list has Compare and Restore but no Delete", async () => {
    const dialog = renderHistory([
      version(3, "played", "Played Oct 10, 2026"),
      version(2, "saved", "post-FNM"),
      version(1, "played", "Played Oct 9, 2026"),
    ]);
    await waitFor(() => expect(dialog.textContent).toContain("1 / 50"));
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).queryByRole("button", { name: "Delete version 3" })).toBeNull();
    expect(within(rows[0]).getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(within(rows[1]).getByRole("button", { name: "Delete version 2" })).toBeTruthy();
  });

  it("49 saved and 60 played: Save version and Restore stay open", async () => {
    const versions = [
      ...Array.from({ length: 60 }, (_, i) => version(200 - i, "played", "Played")),
      ...Array.from({ length: 49 }, (_, i) => version(49 - i, "saved", null)),
    ];
    const dialog = renderHistory(versions);
    await waitFor(() => expect(dialog.textContent).toContain("49 / 50"));
    expect(within(dialog).getByRole("button", { name: "Save version" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(dialog.textContent).not.toContain("version limit");
    expect(
      within(dialog)
        .getAllByRole("button", { name: "Restore" })
        .every((b) => !(b as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it("50 saved still closes Save version and Restore — played lists never added to it", async () => {
    const versions = [
      version(60, "played", "Played"),
      ...Array.from({ length: 50 }, (_, i) => version(50 - i, "saved", null)),
    ];
    const dialog = renderHistory(versions);
    await waitFor(() => expect(dialog.textContent).toContain("50 / 50"));
    expect(dialog.textContent).toContain("This deck has reached the 50-version limit.");
  });
});
