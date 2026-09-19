/**
 * Account deck quick actions (W3, WAVE2.md D2): the ⋯ menu and the
 * right-click menu share ONE item list; visibility is a one-click radio
 * that PATCHes optimistically with a 5 s Undo and reverts on failure
 * (never a refresh — a refresh would reorder the grid); Delete goes
 * through the AlertDialog guard (Cancel focused first) to DELETE and a
 * refresh. /account only renders these signed-in, so the contract is
 * pinned here — the browser pane has no session on prod.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { DeckTileGrid } from "@/components/deck/deck-tile";
import { Toaster } from "@/components/ui/toast";
import { deckTileData } from "@/lib/decks/tiles";
import { AccountDeckTile } from "./account-deck-tile";

const DECK_ID = "11111111-1111-4111-8111-111111111111";

const tile = deckTileData({
  href: `/decks/${DECK_ID}/edit`,
  name: "Krenko — Mob Rule",
  game: "mtg",
  formatCode: "commander",
  visibility: "public",
  updatedAt: "2026-09-15T12:00:00.000Z",
  likesCount: 1,
  ciMask: 4,
  leaderImage: null,
});

const deck = {
  id: DECK_ID,
  publicId: "krenko123abc",
  name: "Krenko — Mob Rule",
  visibility: "public",
  folderId: null,
} as const;

const folders = [{ id: "22222222-2222-4222-8222-222222222222", name: "Goblins" }];

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** Base UI triggers and items want the pointer sequence in RTL (R3 lesson). */
function press(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(el, { button: 0 });
  fireEvent.click(el, { button: 0 });
}

function renderTile() {
  return render(
    <Toaster>
      <DeckTileGrid>
        <AccountDeckTile tile={tile} deck={deck} folders={folders} />
      </DeckTileGrid>
    </Toaster>,
  );
}

async function openActionsMenu() {
  press(screen.getByRole("button", { name: "Deck actions for Krenko — Mob Rule" }));
  return await screen.findByRole("menu", { name: "Deck actions for Krenko — Mob Rule" });
}

describe("AccountDeckTile", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    router.refresh.mockReset();
  });

  it("keeps the tile contract and renders the full D2 list behind ⋯, tab stop after the link", async () => {
    const { container } = renderTile();

    // The tile stays a valid ul > li with the stretched, titled edit link.
    const li = container.querySelector("ul > li[data-slot=deck-tile]");
    expect(li).toBeTruthy();
    const edit = screen.getByRole("link", { name: "Krenko — Mob Rule" });
    expect(edit.getAttribute("title")).toBe("Edit Krenko — Mob Rule");
    expect(edit.className).toContain("after:absolute after:inset-0");

    // ⋯ precedes "Share page" in the DOM — the tab stop right after the link.
    const more = screen.getByRole("button", { name: "Deck actions for Krenko — Mob Rule" });
    const share = screen.getByRole("link", { name: "Share page" });
    expect(more.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const menu = await openActionsMenu();
    const links = within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href"), item.getAttribute("target")]);
    expect(links).toEqual([
      ["Open in builder", `/decks/${DECK_ID}/edit`, null],
      ["Open in new tab", `/decks/${DECK_ID}/edit`, "_blank"],
      ["View share page", "/d/krenko123abc", null],
      ["Copy share link", null, null],
      ["Move to folder", null, null],
      ["Delete deck…", null, null],
    ]);
    const radios = within(menu)
      .getAllByRole("menuitemradio")
      .map((item) => [item.textContent, item.getAttribute("aria-checked")]);
    expect(radios).toEqual([
      ["Public", "true"],
      ["Unlisted", "false"],
      ["Private", "false"],
    ]);
    expect(within(menu).getByText("Unlisted: anyone with the link")).toBeTruthy();
  });

  it("right-click opens the same shared list and never navigates", async () => {
    const { container } = renderTile();
    const li = container.querySelector("li[data-slot=deck-tile]") as HTMLElement;
    const defaultNotPrevented = fireEvent.contextMenu(li);
    expect(defaultNotPrevented).toBe(false); // preventDefault ran — no native menu, no navigation
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Open in builder" })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: "Public" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Delete deck…" })).toBeTruthy();
  });

  it("a visibility radio PATCHes once, flips optimistically, and Undo PATCHes back", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    renderTile();
    const menu = await openActionsMenu();

    press(within(menu).getByRole("menuitemradio", { name: "Private" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/decks/${DECK_ID}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ visibility: "private" });

    // The word in the tile flips without any router.refresh (no grid reorder).
    expect(await screen.findByText("· private")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();

    // The Undo toast (5 s) PATCHes the previous value back.
    expect(await screen.findByText("“Krenko — Mob Rule” is now private")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, undoInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(undoInit.body))).toEqual({ visibility: "public" });
    expect(await screen.findByText("· public")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("a failed PATCH reverts the radio and toasts the API's error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Change failed hard" }),
    });
    renderTile();
    let menu = await openActionsMenu();
    press(within(menu).getByRole("menuitemradio", { name: "Unlisted" }));

    expect(await screen.findByText("Change failed hard")).toBeTruthy();
    menu = await openActionsMenu();
    expect(
      within(menu).getByRole("menuitemradio", { name: "Public" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("· public")).toBeTruthy();
  });

  it("the folder submenu radios PATCH folderId and refresh to regroup", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    renderTile();
    const menu = await openActionsMenu();
    // Submenu triggers ignore mouse clicks (they open on hover); the
    // keyboard path is the deterministic one in jsdom.
    const subTrigger = within(menu).getByRole("menuitem", { name: "Move to folder" });
    subTrigger.focus();
    fireEvent.keyDown(subTrigger, { key: "Enter" });
    const submenu = await screen.findByRole("menu", { name: "Move to folder" });
    press(within(submenu).getByRole("menuitemradio", { name: "Goblins" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ folderId: folders[0].id });
    expect(await screen.findByText("Moved to “Goblins”")).toBeTruthy();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("Delete deck… opens the guard with Cancel focused; confirming DELETEs and refreshes", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    renderTile();
    const menu = await openActionsMenu();
    press(within(menu).getByRole("menuitem", { name: "Delete deck…" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete “Krenko — Mob Rule”?" });
    expect(dialog.textContent).toContain(
      "This permanently deletes the deck, its version history and its share page. Forks keep their cards.",
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete deck" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/decks/${DECK_ID}`);
    expect(init.method).toBe("DELETE");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await screen.findByText("Deck deleted")).toBeTruthy();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("Cancel closes the guard without any request", async () => {
    renderTile();
    const menu = await openActionsMenu();
    press(within(menu).getByRole("menuitem", { name: "Delete deck…" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
