/**
 * EditorLayout (R4, REDESIGN.md §2 "Responsive structure" + §7 "the
 * responsive tab container's mount and preserve behavior"): on phones the
 * Deck / Search / Tools bar is a tablist whose three tabs control the three
 * sections (all in the DOM at once, none `hidden` — CSS decides), a switch
 * never remounts a pane, a pane's scroll position comes back when it does,
 * the card sheet is a named dialog that opens only through `sheetOpen`; at
 * `md` the tools content lives in the (kept-mounted) drawer and the
 * sections are plain regions; at `wide` the tools render inline; a tier
 * change keeps the search input's element while the tools content
 * remounts.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorLayout, type EditorPane } from "./editor-layout";
import type { EditorTier } from "./use-tier";

let toolsMounts = 0;
/** Counts MOUNTS (an effect with no deps), not renders. */
function ToolsStub() {
  useEffect(() => {
    toolsMounts += 1;
  }, []);
  return <p>TOOLS CONTENT</p>;
}

function Harness({
  tier,
  sheetOpen: initialSheet = false,
  toolsOpen: initialTools = false,
  onPaneChange,
}: {
  tier: EditorTier;
  sheetOpen?: boolean;
  toolsOpen?: boolean;
  onPaneChange?: (pane: EditorPane) => void;
}) {
  const [pane, setPane] = useState<EditorPane>("deck");
  const [sheetOpen, setSheetOpen] = useState(initialSheet);
  const [toolsOpen, setToolsOpen] = useState(initialTools);
  return (
    <EditorLayout
      tier={tier}
      gameId="mtg"
      header={<header>HEADER</header>}
      dialogs={null}
      search={<input aria-label="Card search" data-testid="search" />}
      deck={<p>DECK CONTENT</p>}
      tools={<ToolsStub />}
      sheet={<p>SHEET CONTENT</p>}
      sheetTitle="Sol Ring"
      ambient={<div data-testid="ambient" />}
      activePane={pane}
      onActivePaneChange={(next) => {
        onPaneChange?.(next);
        setPane(next);
      }}
      toolsOpen={toolsOpen}
      onToolsOpenChange={setToolsOpen}
      sheetOpen={sheetOpen}
      onSheetOpenChange={setSheetOpen}
      deckCount={34}
    />
  );
}

const sections = () => Array.from(document.querySelectorAll<HTMLElement>("section[aria-label]"));
const section = (label: string) =>
  document.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;

beforeEach(() => {
  toolsMounts = 0;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EditorLayout on a phone", () => {
  it("is a tablist of three tabs controlling three mounted, un-hidden sections; Deck first, count as text", () => {
    render(<Harness tier="phone" />);
    const bar = screen.getByRole("tablist", { name: "Editor panes" });
    const tabs = within(bar).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Deck · 34", "Search", "Tools"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(sections()).toHaveLength(3);
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.tagName).toBe("SECTION");
      expect(panel?.getAttribute("role")).toBe("tabpanel");
      expect(panel?.hasAttribute("hidden")).toBe(false);
      expect(panel?.hasAttribute("inert")).toBe(false);
    }
    // The root's data-pane drives the CSS; the tools content sits in the Tools section.
    expect(document.querySelector("[data-pane]")?.getAttribute("data-pane")).toBe("deck");
    expect(within(section("Card detail and suggestions")).getByText("TOOLS CONTENT")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-tier]")?.getAttribute("data-tier")).toBe("phone");
    // The layout's inset variable and the bar's safe-area padding.
    expect(document.querySelector("[data-tier]")?.className).toContain("--editor-bottom-inset");
    expect(bar.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(bar.className).toContain("md:hidden");
  });

  it("switches panes without remounting them and restores a pane's scroll position", () => {
    const onPaneChange = vi.fn();
    render(<Harness tier="phone" onPaneChange={onPaneChange} />);
    const held = screen.getByTestId("search");
    const search = section("Card search");
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(onPaneChange).toHaveBeenLastCalledWith("search");
    expect(document.querySelector("[data-pane]")?.getAttribute("data-pane")).toBe("search");
    expect(screen.getByRole("tab", { name: "Search" }).getAttribute("aria-selected")).toBe("true");
    // Scroll the search pane, leave, and come back: display:none dropped the
    // position (simulated — jsdom has no layout), the layout effect restores it.
    search.scrollTop = 120;
    fireEvent.scroll(search);
    fireEvent.click(screen.getByRole("tab", { name: /^Deck/ }));
    search.scrollTop = 0;
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));
    expect(search.scrollTop).toBe(120);
    expect(screen.getByTestId("search")).toBe(held);
    expect(sections()).toHaveLength(3);
    expect(toolsMounts).toBe(1);
  });

  it("the card sheet is a dialog named by the card, closed by Close and by Escape, and only from sheetOpen", async () => {
    render(<Harness tier="phone" sheetOpen />);
    const sheet = await screen.findByRole("dialog", { name: "Sol Ring" });
    expect(within(sheet).getByText("SHEET CONTENT")).toBeTruthy();
    // Modal: focus moves inside (the swipe handle is inert; Close is the first tabbable).
    await act(async () => {});
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.querySelector("[data-slot=drawer-popup]")?.getAttribute("data-game")).toBe(
      "mtg",
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    // Tab changes never open it.
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape closes the sheet", async () => {
    render(<Harness tier="phone" sheetOpen />);
    const sheet = await screen.findByRole("dialog", { name: "Sol Ring" });
    fireEvent.keyDown(sheet, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("EditorLayout at md", () => {
  it("keeps the tools out of the sections, in a kept-mounted non-modal drawer; sections are regions", async () => {
    render(<Harness tier="md" toolsOpen />);
    expect(section("Card detail and suggestions").textContent).toBe("");
    for (const el of sections()) {
      expect(el.getAttribute("role")).toBeNull();
      expect(el.hasAttribute("hidden")).toBe(false);
      expect(el.hasAttribute("inert")).toBe(false);
    }
    const drawer = await screen.findByRole("dialog", { name: "Tools" });
    expect(within(drawer).getByText("TOOLS CONTENT")).toBeTruthy();
    expect(document.querySelector("[data-slot=drawer-viewport]")?.getAttribute("data-modal")).toBe(
      "false",
    );
    expect(
      document.querySelector("[data-slot=drawer-popup]")?.getAttribute("data-swipe-direction"),
    ).toBe("right");
    fireEvent.click(within(drawer).getByRole("button", { name: "Close tools" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    // keepMounted: the content (and its state) survives the close.
    expect(screen.getByText("TOOLS CONTENT")).toBeTruthy();
    expect(toolsMounts).toBe(1);
  });
});

describe("EditorLayout at wide", () => {
  it("renders the tools inline and neither drawer", () => {
    render(<Harness tier="wide" sheetOpen toolsOpen />);
    expect(within(section("Card detail and suggestions")).getByText("TOOLS CONTENT")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeNull();
  });
});

describe("EditorLayout across a tier change", () => {
  it("keeps the pane elements (the search input) and remounts only the tools content", () => {
    const { rerender } = render(<Harness tier="wide" />);
    const held = screen.getByTestId("search");
    expect(toolsMounts).toBe(1);
    rerender(<Harness tier="md" />);
    expect(screen.getByTestId("search")).toBe(held);
    expect(section("Card detail and suggestions").textContent).toBe("");
    rerender(<Harness tier="phone" />);
    expect(screen.getByTestId("search")).toBe(held);
    expect(within(section("Card detail and suggestions")).getByText("TOOLS CONTENT")).toBeTruthy();
    rerender(<Harness tier="wide" />);
    expect(screen.getByTestId("search")).toBe(held);
    // wide → md unmounted it, md → phone and phone → wide mounted it again.
    expect(toolsMounts).toBe(3);
    expect(sections()).toHaveLength(3);
  });
});
