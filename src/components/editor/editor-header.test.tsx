/**
 * The editor header (R3): the mark → home (no "Back to home" text link), the
 * game / format chip, the name input's unchanged contract, the fixed-width
 * save slot across all four states with Retry outside the menu, Share only
 * once a server row exists (U3a: Keep this deck or Share in one fixed
 * primary slot, in the tree while empty), the More menu's items (History and Games… only
 * with a live deck) opening the right dialog, and exactly one appearance control
 * — the same assertion the site header test makes for the (site) pages. U3b:
 * the header on the chrome material, the name's 8rem floor, the chip truncating.
 * U4a: the phone's fixed rows (the name's, a fork's credit, the status row for
 * every deck) and Appearance inside More on phones, one control per tier.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SaveStatus } from "@/components/editor/use-autosave";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { COMMANDER } from "@/lib/games/mtg/formats";
import { getAdapter } from "@/lib/games/registry";
import { APPEARANCE_KEY } from "@/lib/theme/appearance";
import { EditorHeader, SAVING_LABEL_AFTER_MS } from "./editor-header";

const mtg = getAdapter("mtg");

function header(over: Partial<React.ComponentProps<typeof EditorHeader>> = {}) {
  return (
    <EditorHeader
      adapter={mtg}
      format={COMMANDER}
      deckName=""
      onNameChange={() => {}}
      forkedFrom={null}
      saveStatus="saved"
      onRetry={() => {}}
      canShare={false}
      canHistory={false}
      onOpen={() => {}}
      {...over}
    />
  );
}

/** Base UI menu triggers open on the pointer sequence, not a bare click. */
function open(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger, { button: 0 });
}

describe("EditorHeader", () => {
  it("the md-only Tools button renders only with onOpenTools and opens the drawer (R4)", () => {
    const onOpenTools = vi.fn();
    const { rerender } = render(header());
    expect(screen.queryByRole("button", { name: "Tools" })).toBeNull();
    rerender(header({ onOpenTools }));
    const tools = screen.getByRole("button", { name: "Tools" });
    expect(tools.className).toContain("hidden md:inline-flex wide:hidden");
    fireEvent.click(tools);
    expect(onOpenTools).toHaveBeenCalledTimes(1);
  });

  it("mark → home, the chip, the name input, one appearance control, no site nav", () => {
    render(header());
    expect(screen.getByRole("link", { name: "Deckwarden" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
    expect(screen.getByText("Magic: The Gathering · Commander")).toBeTruthy();
    const name = screen.getByRole("textbox", { name: "Deck name" });
    expect(name.getAttribute("placeholder")).toBe("Untitled: click to name your deck");
    expect(name.getAttribute("maxlength")).toBe("120");
    expect(screen.getAllByRole("button", { name: "Appearance" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Browse" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Build" })).toBeNull();
  });

  it("the appearance menu carries the Background art switch (R2)", async () => {
    render(header());
    open(screen.getByRole("button", { name: "Appearance" }));
    const menu = await screen.findByRole("menu", { name: "Appearance" });
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Background art" })).toBeTruthy();
  });

  it("name edits flow through onNameChange", () => {
    const onNameChange = vi.fn();
    render(header({ onNameChange }));
    fireEvent.change(screen.getByRole("textbox", { name: "Deck name" }), {
      target: { value: "Queza" },
    });
    expect(onNameChange).toHaveBeenCalledWith("Queza");
  });

  it("the save slot keeps one fixed width across all four states; Retry sits in it, not the menu", () => {
    vi.useFakeTimers();
    const onRetry = vi.fn();
    const { rerender } = render(header({ onRetry }));
    const widths = new Set<string>();
    for (const status of ["saved", "dirty", "saving", "error"] as SaveStatus[]) {
      rerender(header({ saveStatus: status, onRetry }));
      act(() => vi.advanceTimersByTime(SAVING_LABEL_AFTER_MS)); // a slow save says so
      const slot = document.querySelector('[data-slot="save-slot"]') as HTMLElement;
      expect(slot.getAttribute("aria-live")).toBe("polite");
      widths.add(
        slot.className
          .split(" ")
          .filter((c) => /^w-/.test(c))
          .join(" "),
      );
      expect(slot.textContent).toContain(
        { saved: "Saved", dirty: "Unsaved…", saving: "Saving…", error: "Save failed" }[status],
      );
    }
    vi.useRealTimers();
    expect(widths.size).toBe(1);
    expect([...widths][0]).toBe("w-36");
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a quick save never says Saving…; one past 300 ms does, and data-status is always the real state (U2)", () => {
    vi.useFakeTimers();
    try {
      const slot = () => document.querySelector('[data-slot="save-slot"]') as HTMLElement;
      const { rerender } = render(header({ saveStatus: "dirty" }));
      rerender(header({ saveStatus: "saving" }));
      expect(slot().dataset.status).toBe("saving");
      expect(slot().textContent).toBe("Unsaved…");
      act(() => vi.advanceTimersByTime(SAVING_LABEL_AFTER_MS - 1));
      rerender(header({ saveStatus: "saved" }));
      expect(slot().textContent).toBe("Saved");
      // The next save starts its own clock.
      rerender(header({ saveStatus: "dirty" }));
      rerender(header({ saveStatus: "saving" }));
      act(() => vi.advanceTimersByTime(SAVING_LABEL_AFTER_MS - 1));
      expect(slot().textContent).toBe("Unsaved…");
      act(() => vi.advanceTimersByTime(1));
      expect(slot().textContent).toBe("Saving…");
      rerender(header({ saveStatus: "saved" }));
      expect(slot().textContent).toBe("Saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a change of label is a two-layer cross-fade: the old words on a ::before (data-was), never in the text; the first paint doesn't fade (U2)", () => {
    const face = () => document.querySelector('[data-slot="save-slot"] > span') as HTMLElement;
    const { rerender } = render(header({ saveStatus: "saved" }));
    expect(face().hasAttribute("data-was")).toBe(false);
    expect(face().className).not.toContain("animate-dw-in");
    rerender(header({ saveStatus: "dirty" }));
    expect(face().dataset.was).toBe("Saved");
    expect(face().textContent).toBe("Unsaved…");
    expect(face().className).toContain("animate-dw-in");
    expect(face().className).toContain("before:animate-dw-out");
    expect(face().className).toContain("before:content-[attr(data-was)_/_'']");
    expect(face().className).toContain("relative"); // the ::before's box
    const slot = document.querySelector('[data-slot="save-slot"]') as HTMLElement;
    expect(slot.className).toContain("h-7 w-36");
    rerender(header({ saveStatus: "saved" }));
    expect(face().dataset.was).toBe("Unsaved…");
    expect(face().querySelector("svg")!.getAttribute("class")).toContain("[--dw-scale:0.5]");
  });

  it("a draft at rest says Draft (titled, no check, data-draft) in the same w-36 slot; data-status keeps the autosave state (Y2a)", () => {
    const { rerender } = render(header({ draft: true }));
    const slot = () => document.querySelector('[data-slot="save-slot"]') as HTMLElement;
    expect(slot().dataset.status).toBe("saved");
    expect(slot().dataset.draft).toBe("true");
    expect(slot().textContent).toBe("Draft");
    expect(slot().getAttribute("title")).toBe("Saves on your first change");
    expect(slot().querySelector("svg")).toBeNull();
    expect(slot().className).toContain("w-36");
    // The first edit reads like any other; the draft mark stays until a row exists.
    rerender(header({ draft: true, saveStatus: "dirty" }));
    expect(slot().textContent).toBe("Unsaved…");
    expect(slot().hasAttribute("title")).toBe(false);
    expect(slot().dataset.draft).toBe("true");
    rerender(header({ draft: true, saveStatus: "error" }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    // A saved deck: no data-draft, "Saved" with its check.
    rerender(header({ saveStatus: "saved" }));
    expect(slot().hasAttribute("data-draft")).toBe(false);
    expect(slot().textContent).toBe("Saved");
    expect(slot().querySelector("svg")).toBeTruthy();
  });

  it("Keep this deck renders only with onKeep and calls it (Y2a)", () => {
    const onKeep = vi.fn();
    const { rerender } = render(header({ draft: true }));
    expect(screen.queryByRole("button", { name: "Keep this deck" })).toBeNull();
    rerender(header({ draft: true, onKeep }));
    fireEvent.click(screen.getByRole("button", { name: "Keep this deck" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("Share is the primary action only once a server row exists", () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    rerender(header({ onOpen, canShare: true }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(onOpen).toHaveBeenCalledWith("share");
  });

  it("the primary slot is in the tree while empty, one fixed width from md, and holds Keep or Share (U3a)", () => {
    const slot = () => document.querySelector<HTMLElement>("[data-slot=primary-slot]");
    const { rerender } = render(header({ draft: true }));
    // Empty: no button, but the slot (and its reserved width) is there.
    expect(slot()).not.toBeNull();
    expect(slot()!.children).toHaveLength(0);
    expect(slot()!.className).toContain("md:w-[7.5rem]");
    expect(slot()!.className).toContain("md:shrink-0");
    // Phones (U4a, the pin moved from U3a's `max-md:contents`): the status
    // row's right end, with no reserved width — nothing beside it moves.
    expect(slot()!.className).not.toContain("max-md:contents");
    expect(slot()!.className).toContain("max-md:row-start-3 max-md:flex max-md:justify-self-end");
    // The save slot sits first; the primary slot right after it.
    expect(slot()!.previousElementSibling?.getAttribute("data-slot")).toBe("save-slot");

    rerender(header({ draft: true, onKeep: () => {} }));
    expect(within(slot()!).getByRole("button", { name: "Keep this deck" })).toBeTruthy();

    rerender(header({ canShare: true }));
    expect(within(slot()!).getByRole("button", { name: "Share" })).toBeTruthy();
    expect(within(slot()!).queryByRole("button", { name: "Keep this deck" })).toBeNull();
  });

  it("More lists Details, Import, Autofill…, Fit my budget…, Export, Buy (+ History and Games… with a live deck) and the shortcut sheet", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    open(screen.getByRole("button", { name: "More" }));
    let menu = await screen.findByRole("menu", { name: "More" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual([
      "Details",
      "Import",
      "Autofill…",
      "Fit my budget…",
      "Export",
      "Buy this deck…",
      "Keyboard shortcuts?",
    ]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Details" }));
    expect(onOpen).toHaveBeenCalledWith("details");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    rerender(header({ onOpen, canHistory: true }));
    open(screen.getByRole("button", { name: "More" }));
    menu = await screen.findByRole("menu", { name: "More" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toContain("History");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "History" }));
    expect(onOpen).toHaveBeenCalledWith("history");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // Y9a: Games… joins History on a live deck (the draft list above stays exact).
    open(screen.getByRole("button", { name: "More" }));
    menu = await screen.findByRole("menu", { name: "More" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toContain("Games…");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Games…" }));
    expect(onOpen).toHaveBeenCalledWith("games");
  });

  it("Games… needs a live deck and a game that declares a journal — both games do (Y9a)", async () => {
    const onOpen = vi.fn();
    const optcg = getAdapter("optcg");
    const { rerender } = render(
      header({ onOpen, adapter: optcg, format: optcg.formats[0], canHistory: true }),
    );
    open(screen.getByRole("button", { name: "More" }));
    const opMenu = await screen.findByRole("menu", { name: "More" });
    fireEvent.click(within(opMenu).getByRole("menuitem", { name: "Games…" }));
    expect(onOpen).toHaveBeenCalledWith("games");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // A game without the declaration gets no door and no apology copy.
    rerender(header({ onOpen, adapter: { ...mtg, journal: undefined }, canHistory: true }));
    open(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu", { name: "More" });
    expect(within(menu).getByRole("menuitem", { name: "History" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "Games…" })).toBeNull();
  });

  it("Buy this deck… opens the buy dialog, and only for games that declare buy (W7)", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    open(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu", { name: "More" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Buy this deck…" }));
    expect(onOpen).toHaveBeenCalledWith("buy");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // One Piece declares no capabilities.buy → the item does not exist.
    const optcg = getAdapter("optcg");
    rerender(header({ onOpen, adapter: optcg, format: optcg.formats[0] }));
    open(screen.getByRole("button", { name: "More" }));
    const opMenu = await screen.findByRole("menu", { name: "More" });
    expect(within(opMenu).queryByRole("menuitem", { name: "Buy this deck…" })).toBeNull();
  });

  it("Autofill… opens the review sheet, and only for games that declare recommend.autofill (W9b)", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    open(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu", { name: "More" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Autofill…" }));
    expect(onOpen).toHaveBeenCalledWith("autofill");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // One Piece declares no recommend.autofill → no door, no apology copy.
    const optcg = getAdapter("optcg");
    rerender(header({ onOpen, adapter: optcg, format: optcg.formats[0] }));
    open(screen.getByRole("button", { name: "More" }));
    const opMenu = await screen.findByRole("menu", { name: "More" });
    expect(within(opMenu).queryByRole("menuitem", { name: "Autofill…" })).toBeNull();
  });

  it("Fit my budget… opens the Fit sheet, and only for games that declare recommend.swap (Y8)", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(header({ onOpen }));
    open(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu", { name: "More" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Fit my budget…" }));
    expect(onOpen).toHaveBeenCalledWith("fit");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // One Piece declares no swap → no door, no apology copy.
    const optcg = getAdapter("optcg");
    rerender(header({ onOpen, adapter: optcg, format: optcg.formats[0] }));
    open(screen.getByRole("button", { name: "More" }));
    const opMenu = await screen.findByRole("menu", { name: "More" });
    expect(within(opMenu).queryByRole("menuitem", { name: "Fit my budget…" })).toBeNull();
  });
});

describe("EditorHeader — the materials (U3b, WAVE5 D4)", () => {
  it("the header is the chrome material and keeps its hairline (the panes' rules meet it)", () => {
    render(header());
    const bar = screen.getByRole("banner");
    expect(bar.className).toContain("bg-(--chrome) backdrop-filter-(--chrome-backdrop)");
    expect(bar.className).toContain("border-b");
  });

  it("the name never drops under 8rem; the game · format chip shrinks with it, its words truncating, and hides from md to wide", () => {
    render(header());
    const name = screen.getByRole("textbox", { name: "Deck name" });
    expect(name.className).toContain("min-w-[8rem]");
    expect(name.className).not.toContain("min-w-0");
    const words = screen.getByText("Magic: The Gathering · Commander");
    expect(words.className).toBe("truncate");
    const chip = words.closest("[data-slot=badge]")!;
    expect(chip.className).toContain("min-w-0 shrink");
    expect(chip.className).not.toContain("shrink-0");
    expect(chip.className).toContain("md:max-wide:hidden");
  });
});

describe("EditorHeader — the phone header (U4a, WAVE5 D5)", () => {
  const classes = (el: Element | null) => el?.getAttribute("class") ?? "";

  it("below md a grid of fixed rows, never a wrap: the mark, the name and More; a fork's credit; the status row", () => {
    render(
      header({
        draft: true,
        onKeep: () => {},
        forkedFrom: { state: "private" },
      }),
    );
    const bar = screen.getByRole("banner");
    expect(classes(bar)).toContain(
      "max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:grid-rows-[3.5rem_auto_2.5rem] max-md:gap-y-0 max-md:py-0 max-md:pointer-coarse:grid-rows-[3.5rem_auto_2.75rem]",
    );
    // Row 1: the mark, the name (its floor kept, 44 px on touch, truncating), More.
    expect(classes(screen.getByRole("link", { name: "Deckwarden" }))).toContain(
      "max-md:col-start-1 max-md:row-start-1",
    );
    const name = screen.getByRole("textbox", { name: "Deck name" });
    expect(classes(name)).toContain(
      "max-md:col-start-2 max-md:row-start-1 max-md:w-full max-md:text-ellipsis max-md:pointer-coarse:min-h-11",
    );
    expect(classes(name)).toContain("min-w-[8rem]");
    expect(classes(screen.getByRole("button", { name: "More" }))).toContain(
      "max-md:col-start-3 max-md:row-start-1",
    );
    // A fork's credit: its own line under the name.
    expect(classes(screen.getByText("Forked from a private deck"))).toContain(
      "max-md:col-[2/-1] max-md:row-start-2",
    );
    // The status row: the save slot under the name, left-aligned; the primary at the right.
    const slot = document.querySelector<HTMLElement>("[data-slot=save-slot]")!;
    expect(classes(slot)).toContain(
      "max-md:col-start-2 max-md:row-start-3 max-md:ml-2 max-md:justify-start",
    );
    const primary = document.querySelector<HTMLElement>("[data-slot=primary-slot]")!;
    expect(classes(primary)).toContain("max-md:col-[2/-1] max-md:row-start-3");
    expect(within(primary).getByRole("button", { name: "Keep this deck" })).toBeTruthy();
    // The cluster steps aside so its items take their rows; the chip steps aside too.
    expect(classes(slot.parentElement)).toContain("max-md:contents");
    const chip = screen.getByText("Magic: The Gathering · Commander").closest("[data-slot=badge]");
    expect(classes(chip)).toContain("max-md:hidden");
  });

  it("a linked fork credit is a 44 px target on a touch phone: its line grows to 44 px only when it holds the link (LATER row 236)", () => {
    const { unmount } = render(
      header({
        forkedFrom: { state: "linked", publicId: "abc12345", name: "Atraxa superfriends" },
      }),
    );
    const link = screen.getByRole("link", { name: "Atraxa superfriends" });
    expect(link.getAttribute("href")).toBe("/d/abc12345");
    const line = link.parentElement!;
    expect(classes(line)).toContain("max-md:col-[2/-1] max-md:row-start-2");
    // A 44 px line, and the link's padding fills it; the line's clip
    // (truncate) trims the padding to the line's 44 px.
    expect(classes(line)).toContain(
      "max-md:pointer-coarse:has-[a]:leading-11 max-md:pointer-coarse:[&_a]:py-4",
    );
    expect(classes(line)).toContain("truncate");
    unmount();
    // A private credit has nothing to tap, so `has-[a]` leaves its 16 px line.
    render(header({ forkedFrom: { state: "private" } }));
    expect(screen.getByText("Forked from a private deck").querySelector("a")).toBeNull();
  });

  it("every deck keeps the status row: a saved deck's save slot and Share sit where a draft's Draft and Keep did", () => {
    const { rerender } = render(header({ draft: true, onKeep: () => {} }));
    const slot = () => document.querySelector<HTMLElement>("[data-slot=save-slot]")!;
    const primary = () => document.querySelector<HTMLElement>("[data-slot=primary-slot]")!;
    const draftClasses = [classes(slot()), classes(primary())];
    expect(slot().textContent).toBe("Draft");
    rerender(header({ canShare: true, canHistory: true }));
    expect(slot().textContent).toBe("Saved");
    expect(within(primary()).getByRole("button", { name: "Share" })).toBeTruthy();
    expect([classes(slot()), classes(primary())]).toEqual(draftClasses);
  });

  it("on phones the outgoing save label anchors to the slot's left edge, as the label does", () => {
    const { rerender } = render(header({ saveStatus: "saved" }));
    rerender(header({ saveStatus: "dirty" }));
    const face = document.querySelector('[data-slot="save-slot"] > span') as HTMLElement;
    expect(face.dataset.was).toBe("Saved");
    expect(face.className).toContain("before:right-0");
    expect(face.className).toContain("max-md:before:right-auto max-md:before:left-0");
  });

  it("on phones Appearance lives in More (its radios and the Background art switch); the header's own control steps aside: one per tier", async () => {
    const { rerender } = render(header({ phone: true }));
    expect(screen.queryByRole("button", { name: "Appearance" })).toBeNull();
    open(screen.getByRole("button", { name: "More" }));
    let menu = await screen.findByRole("menu", { name: "More" });
    // The command items are the draft's pinned list, unchanged.
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual([
      "Details",
      "Import",
      "Autofill…",
      "Fit my budget…",
      "Export",
      "Buy this deck…",
      "Keyboard shortcuts?",
    ]);
    const group = within(menu).getByRole("group", { name: "Appearance" });
    expect(
      within(group)
        .getAllByRole("menuitemradio")
        .map((i) => i.textContent),
    ).toEqual(["Dark", "Light", "System"]);
    expect(within(group).getByRole("menuitemcheckbox", { name: "Background art" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Details" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    // From md: the header's own Appearance control, and More without the group.
    rerender(header({ phone: false }));
    expect(screen.getAllByRole("button", { name: "Appearance" })).toHaveLength(1);
    // The editor's first commit on a dev phone reads the tier's server snapshot,
    // so the control is CSS-hidden below md too: it never lands in the phone's rows.
    expect(screen.getByRole("button", { name: "Appearance" }).parentElement!.className).toBe(
      "contents max-md:hidden",
    );
    open(screen.getByRole("button", { name: "More" }));
    menu = await screen.findByRole("menu", { name: "More" });
    expect(within(menu).queryByRole("group", { name: "Appearance" })).toBeNull();
    expect(within(menu).queryByRole("menuitemradio")).toBeNull();
  });

  it("inside More the theme radio picks the theme and closes the menu; Background art writes its preference and keeps it open", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      })),
    );
    try {
      render(<ThemeProvider>{header({ phone: true })}</ThemeProvider>);
      open(screen.getByRole("button", { name: "More" }));
      let menu = await screen.findByRole("menu", { name: "More" });
      fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Background art" }));
      await waitFor(() =>
        expect(window.localStorage.getItem(APPEARANCE_KEY)).toBe('{"backgroundArt":false}'),
      );
      expect(screen.getByRole("menu", { name: "More" })).toBeTruthy();
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Light" }));
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      await waitFor(() => expect(window.localStorage.getItem("theme")).toBe("light"));
      expect(document.documentElement.classList.contains("light")).toBe(true);
      open(screen.getByRole("button", { name: "More" }));
      menu = await screen.findByRole("menu", { name: "More" });
      expect(
        within(menu).getByRole("menuitemradio", { name: "Light" }).getAttribute("aria-checked"),
      ).toBe("true");
    } finally {
      vi.unstubAllGlobals();
      window.localStorage.clear();
      document.documentElement.className = "";
    }
  });
});
