/**
 * Account deck quick actions (W3, WAVE2.md D2): the ⋯ menu and the
 * right-click menu share ONE item list; visibility is a one-click radio
 * that PATCHes optimistically with a 5 s Undo and reverts on failure
 * (never a refresh — a refresh would reorder the grid); Delete goes
 * through the AlertDialog guard (Cancel focused first) to DELETE and a
 * refresh. /account only renders these signed-in, so the contract is
 * pinned here — the browser pane has no session on prod.
 *
 * Y9b: "Log a game…" follows Copy share link where the deck's game keeps a
 * journal, and opens the Games dialog right on /account (loaded on demand):
 * Lost with an opponent's commander picked logs its oracle id, the page's
 * toast carries Undo, and focus returns to the ⋯ button.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { DeckTileGrid } from "@/components/deck/deck-tile";
import { Toaster } from "@/components/ui/toast";
import { deckTileData } from "@/lib/decks/tiles";
import { AccountDeckTile } from "./account-deck-tile";

// The owner row / tile menu preloads the Games dialog's chunk (Y9b); load it
// here first so that preload resolves from the module cache — under a full
// run a cold import could outlive this file's environment (Y10).
await import("@/components/editor/log-game-dialog");

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
  journalGame: "mtg",
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

function renderTile(meta: { journalGame: "mtg" | null } = deck) {
  return render(
    <Toaster>
      <DeckTileGrid>
        <AccountDeckTile tile={tile} deck={{ ...deck, ...meta }} folders={folders} />
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
    // LATER row 248: Share page is a 44 px target on touch, level with ⋯ (icon-xs, 44 on touch).
    expect(share.className).toContain(
      "pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center",
    );
    expect(share.className).toContain("shrink-0");
    expect(more.className).toContain("pointer-coarse:size-11");

    const menu = await openActionsMenu();
    const links = within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href"), item.getAttribute("target")]);
    expect(links).toEqual([
      ["Open in editor", `/decks/${DECK_ID}/edit`, null],
      ["Open in new tab", `/decks/${DECK_ID}/edit`, "_blank"],
      ["View share page", "/d/krenko123abc", null],
      ["Copy share link", null, null],
      ["Log a game…", null, null],
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
    expect(within(menu).getByRole("menuitem", { name: "Open in editor" })).toBeTruthy();
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

  it("a game that keeps no journal has no Log a game… (journalGame null)", async () => {
    renderTile({ journalGame: null });
    const menu = await openActionsMenu();
    expect(within(menu).queryByRole("menuitem", { name: "Log a game…" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Copy share link" })).toBeTruthy();
  });

  it("Log a game… opens the Games dialog here; Lost with an opponent picked logs its oracle id; Undo; focus back on ⋯", async () => {
    const GAMES = `/api/decks/${DECK_ID}/games`;
    const ATRAXA_ORACLE = "d0d33d52-3d28-4635-b985-51e126289259";
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/cards/suggest")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            q: "atr",
            results: [
              {
                id: "id-atraxa",
                name: "Atraxa, Praetors' Voice",
                slug: "atraxa-praetors-voice",
                isLeader: true,
                typeLine: "Legendary Creature",
                colorsMask: 0,
                ciMask: 27,
                externalKey: ATRAXA_ORACLE,
                image: null,
              },
            ],
          }),
        };
      }
      if (url === GAMES && method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            games: [],
            total: 0,
            playedSnapshots: 0,
            playedAllowance: 100,
            record: [],
            lists: [],
            names: {},
          }),
        };
      }
      if (url === GAMES && method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            game: { id: 7, result: "loss", playedOn: "2026-10-11", podSize: 4 },
            version: 2,
            minted: true,
            capped: false,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ deleted: true, snapshotRemoved: true }),
      };
    });
    renderTile();
    const more = screen.getByRole("button", { name: "Deck actions for Krenko — Mob Rule" });
    const menu = await openActionsMenu();
    press(within(menu).getByRole("menuitem", { name: "Log a game…" }));
    const dialog = await screen.findByRole("dialog", { name: "Games" });
    fireEvent.click(within(dialog).getByText("More details"));
    const box = await within(dialog).findByRole("combobox", { name: "Opponent 1's commander" });
    fireEvent.input(box, { target: { value: "atr" }, inputType: "insertText" });
    fireEvent.click(await screen.findByRole("option", { name: /Atraxa/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Lost" }));

    const toastEl = (await screen.findByText("Logged a loss")).closest(
      "[data-slot=toast]",
    ) as HTMLElement;
    const post = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === "POST")!;
    expect(post[0]).toBe(GAMES);
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({
      result: "loss",
      podSize: 4,
      playedOn: expect.any(String),
      opponents: [[ATRAXA_ORACLE]],
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Games" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
    // Logging never reorders the grid: no refresh.
    expect(router.refresh).not.toHaveBeenCalled();
    fireEvent.click(within(toastEl).getByRole("button", { name: "Undo" }));
    await act(async () => {});
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => u === `${GAMES}/7` && (i as RequestInit)?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("from the right-click menu too, closing the dialog puts focus on ⋯ (the tile itself takes none)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        games: [],
        total: 0,
        playedSnapshots: 0,
        playedAllowance: 100,
        record: [],
        lists: [],
        names: {},
      }),
    });
    const { container } = renderTile();
    const more = screen.getByRole("button", { name: "Deck actions for Krenko — Mob Rule" });
    fireEvent.contextMenu(container.querySelector("li[data-slot=deck-tile]") as HTMLElement);
    const menu = await screen.findByRole("menu");
    press(within(menu).getByRole("menuitem", { name: "Log a game…" }));
    const dialog = await screen.findByRole("dialog", { name: "Games" });
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Won" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Games" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
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
