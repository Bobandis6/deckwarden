/**
 * SearchPane over the reducer (R3, C5 / F6 / F14): the keyboard script's
 * DOM contract (combobox, listbox, aria-activedescendant, wrap-around,
 * Enter / Ctrl+Enter, Escape), "No cards match" only after a response, the
 * failed state's Retry refetching the same query, rejections on the live
 * line clearing on input, actions visible on the active row, a thumbnail
 * box on every row, keycaps in the hint, and no success line in the pane.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CardWire } from "@/lib/decks/editor-state";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { card } from "@/lib/games/mtg/test-fixtures";
import { getAdapter } from "@/lib/games/registry";
import { SearchPane } from "./search-pane";

const mtg = getAdapter("mtg");
const SOL_IMAGE =
  "https://cards.scryfall.io/normal/front/8/3/83f43730-1c1f-4150-8771-d901c54bedc4.jpg";
const sol: CardWire = {
  ...card({
    name: "Sol Ring",
    attrs: { type_line: "Artifact", oracle_text: "", mana_cost: "{1}" },
  }),
  image: SOL_IMAGE,
};
const signet: CardWire = {
  ...card({
    name: "Arcane Signet",
    attrs: { type_line: "Artifact", oracle_text: "", mana_cost: "{2}" },
  }),
  image: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function respond(results: CardWire[]) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ results }) });
}

/** Run the 200 ms debounce and let the mocked fetch settle. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

function renderPane(onAdd = vi.fn<(...args: unknown[]) => string | undefined>()) {
  render(
    <SearchPane
      adapter={mtg}
      format={COMMANDER}
      inDeckQty={new Map()}
      onAdd={onAdd}
      onPreview={() => {}}
    />,
  );
  return { onAdd, input: screen.getByRole("combobox", { name: "Card search" }) };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("SearchPane", () => {
  it("keycap hint, no 'No cards match' before the response, then rows with a thumbnail box each", async () => {
    const { input } = renderPane();
    expect(document.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(5);
    respond([sol, signet]);
    type(input, "sol");
    expect(screen.queryByText(/No cards match/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/cards/search?");
    expect(url).toContain("name=sol");
    expect(url).toContain("limit=20");
    expect(url).toContain("format=commander");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-0");
    expect(document.querySelectorAll('[data-slot="thumb"]')).toHaveLength(2);
    const imgs = document.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe(SOL_IMAGE.replace("/normal/", "/small/"));
    expect(imgs[0].getAttribute("loading")).toBe("lazy");
    expect(screen.queryByText(/No cards match/)).toBeNull();
  });

  it("Enter adds the prefixed quantity to the main zone, clears and refocuses, and shows no success line", async () => {
    const { input, onAdd } = renderPane();
    respond([sol]);
    type(input, "4 sol");
    await settle();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "Sol Ring" }), "main", 4);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.queryByText(/Added/)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("Ctrl+Enter targets the leader zone; a rejection lands on the live line and clears on input", async () => {
    const onAdd = vi.fn<(...args: unknown[]) => string | undefined>((_c, zone) =>
      zone === "commander" ? "Commander is full (max 2 cards)" : undefined,
    );
    const { input } = renderPane(onAdd);
    respond([sol]);
    type(input, "sol");
    await settle();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onAdd).toHaveBeenCalledWith(expect.anything(), "commander", 1);
    const live = screen.getByText("Commander is full (max 2 cards)");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.className).toContain("text-destructive");
    // the input keeps its text (the add was rejected) and the notice clears on the next keystroke
    expect((input as HTMLInputElement).value).toBe("sol");
    respond([sol]);
    type(input, "sol r");
    expect(screen.queryByText("Commander is full (max 2 cards)")).toBeNull();
  });

  it("arrows wrap in both directions and the active row exposes its actions", async () => {
    const { input } = renderPane();
    respond([sol, signet]);
    type(input, "s");
    await settle();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-1");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-0");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe("search-result-1");
    const active = screen.getByRole("option", { name: /Arcane Signet/ });
    expect(active.getAttribute("aria-selected")).toBe("true");
    const add = screen.getByRole("button", { name: "Add Arcane Signet to Main deck" });
    expect(add.parentElement?.className).toContain("group-aria-selected/row:flex");
    expect(add.parentElement?.className).toContain("pointer-coarse:flex");
    expect(screen.getByRole("button", { name: "Add Arcane Signet as Commander" })).toBeTruthy();
  });

  it("an empty response is the only way to 'No cards match'", async () => {
    const { input } = renderPane();
    respond([]);
    type(input, "zzz");
    await settle();
    expect(screen.getByText("No cards match “zzz”.")).toBeTruthy();
    respond([sol]);
    type(input, "zzz s");
    expect(screen.queryByText(/No cards match/)).toBeNull();
  });

  it("a failed request shows Retry, which refetches the same query", async () => {
    const { input } = renderPane();
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    type(input, "sol");
    await settle();
    expect(screen.getByText("Search failed — check your connection.")).toBeTruthy();
    respond([sol]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("name=sol");
    expect(screen.queryByText(/Search failed/)).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("a row click is an explicit inspection (onInspect), the response a passive preview (R4)", async () => {
    const onPreview = vi.fn();
    const onInspect = vi.fn();
    render(
      <SearchPane
        adapter={mtg}
        format={COMMANDER}
        inDeckQty={new Map()}
        onAdd={vi.fn()}
        onPreview={onPreview}
        onInspect={onInspect}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Card search" });
    respond([sol, signet]);
    type(input, "s");
    await settle();
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onInspect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onInspect).not.toHaveBeenCalled();
    const row = screen.getByRole("option", { name: /Sol Ring/ });
    fireEvent.click(row);
    expect(onInspect).toHaveBeenCalledTimes(1);
    expect(onInspect.mock.calls[0][0].name).toBe("Sol Ring");
    expect(onPreview).toHaveBeenCalledTimes(2);
    // Touch: 44 px rows and actions on coarse pointers only.
    expect(row.className).toContain("pointer-coarse:min-h-11");
    expect(screen.getByRole("button", { name: "Add Sol Ring to Main deck" }).className).toContain(
      "pointer-coarse:h-11",
    );
  });

  it("without onInspect a row click falls back to onPreview", async () => {
    const onPreview = vi.fn();
    render(
      <SearchPane
        adapter={mtg}
        format={COMMANDER}
        inDeckQty={new Map()}
        onAdd={vi.fn()}
        onPreview={onPreview}
      />,
    );
    const input = screen.getByRole("combobox", { name: "Card search" });
    respond([sol]);
    type(input, "sol");
    await settle();
    fireEvent.click(screen.getByRole("option", { name: /Sol Ring/ }));
    expect(onPreview).toHaveBeenCalledTimes(2);
  });

  it("Escape clears the box and the results", async () => {
    const { input } = renderPane();
    respond([sol]);
    type(input, "sol");
    await settle();
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
