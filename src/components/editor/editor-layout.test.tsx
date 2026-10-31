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
 *
 * U4b (WAVE5 D5): the phone sheet's three snap points through Base UI's own
 * swipe (jsdom has no layout, so the heights it resolves them against are
 * stubbed: a 390 × 844 phone, the popup 100dvh − 6rem): it opens at the
 * half, non-modal with a clear, click-through scrim; a swipe up takes it to
 * the full point, modal with the 40 % scrim; a release after a drag is
 * marked for flick-400 before Base UI's own handler runs, a tap is not; a
 * new body while it stays open is a re-target in the same frame.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  sheetKey = "sol",
}: {
  tier: EditorTier;
  sheetOpen?: boolean;
  toolsOpen?: boolean;
  onPaneChange?: (pane: EditorPane) => void;
  sheetKey?: string;
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
      deck={
        <>
          <p>DECK CONTENT</p>
          {/* An explicit inspection's stand-in (DeckEditor opens the sheet). */}
          <button type="button" onClick={() => setSheetOpen(true)}>
            INSPECT
          </button>
        </>
      }
      tools={<ToolsStub />}
      sheet={({ point, close }) => (
        <div>
          <p>SHEET CONTENT {sheetKey}</p>
          <p data-testid="sheet-point">{point}</p>
          {close}
        </div>
      )}
      sheetTitle="Sol Ring"
      sheetKey={sheetKey}
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
const popup = () => document.querySelector<HTMLElement>("[data-slot=drawer-popup]")!;
const overlay = () => document.querySelector<HTMLElement>("[data-slot=drawer-overlay]");
const viewportModal = () =>
  document.querySelector("[data-slot=drawer-viewport]")?.getAttribute("data-modal");
const sheetPoint = () => screen.getByTestId("sheet-point").textContent;
/** An element's class tokens (a substring check would match a variant's `…:pointer-events-none`). */
const classes = (el: Element | null) => el?.className.split(/\s+/) ?? [];

/**
 * The heights Base UI resolves the snap points against, which jsdom can't
 * lay out: a 390 × 844 phone and the popup at 100dvh − 6rem. Its swipe
 * also asks which element sits under the pointer (the swipe handle).
 */
function stubSheetGeometry() {
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const slot = this.getAttribute("data-slot");
      if (slot === "drawer-viewport") return 844;
      if (slot === "drawer-popup") return 748;
      return 0;
    },
  });
  // jsdom has no elementFromPoint at all; the stub goes again afterwards.
  const doc = document as unknown as { elementFromPoint?: () => Element | null };
  doc.elementFromPoint = () => document.querySelector("[data-slot=drawer-swipe-handle]");
  return () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", height);
    delete doc.elementFromPoint;
  };
}

/** A mouse drag on the swipe handle (Base UI's own swipe), dy px over `steps` moves. */
async function swipe(dy: number, { steps = 10, stepMs = 16 } = {}) {
  const handle = document.querySelector<HTMLElement>("[data-slot=drawer-swipe-handle]")!;
  const at = (y: number, buttons: number) => ({
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: 100,
    clientY: y,
    button: 0,
    buttons,
  });
  fireEvent.pointerDown(handle, at(400, 1));
  for (let i = 1; i <= steps; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    });
    fireEvent.pointerMove(handle, at(400 + (dy * i) / steps, 1));
  }
  fireEvent.pointerUp(handle, at(400 + dy, 0));
}
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
    // The builder's light art and its panes' tints hang off this (globals.css).
    expect(document.querySelector("[data-tier]")?.getAttribute("data-surface")).toBe("editor");
    // The layout's inset variable and the bar's safe-area padding.
    expect(document.querySelector("[data-tier]")?.className).toContain("--editor-bottom-inset");
    expect(bar.className).toContain("pb-[env(safe-area-inset-bottom)]");
    // U3b: the bar is the chrome material (the list primitive's bg-transparent gives way) and keeps its top hairline.
    expect(bar.className).toContain("bg-(--chrome) backdrop-filter-(--chrome-backdrop)");
    expect(bar.className).not.toContain("bg-transparent");
    expect(bar.className).toContain("border-t");
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

  it("the card sheet is a dialog named by the card that opens at the half, non-modal, its scrim clear and click-through; Close closes it; only from sheetOpen", async () => {
    render(<Harness tier="phone" sheetOpen />);
    const sheet = await screen.findByRole("dialog", { name: "Sol Ring" });
    expect(within(sheet).getByText("SHEET CONTENT sol")).toBeTruthy();
    expect(sheetPoint()).toBe("half");
    // Focus moves inside on open (the popup; the swipe handle is inert).
    await act(async () => {});
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(popup().getAttribute("data-game")).toBe("mtg");
    expect(popup().hasAttribute("data-snap-points")).toBe(true);
    // Non-modal below the full point: the viewport lets taps through to the
    // deck, and the scrim is there (so a swipe can fade it) but takes none.
    expect(viewportModal()).toBe("false");
    expect(classes(overlay())).toContain("pointer-events-none");
    expect(overlay()?.className).toContain("bg-black/40");
    expect(overlay()?.className).not.toContain("bg-black/10");
    expect(overlay()?.className).toContain("data-snap-points:[--drawer-overlay-min-opacity:0]");
    expect(overlay()?.className).not.toContain("--drawer-overlay-min-opacity:0.5");
    // The opaque sheet with its release split; the frame's Close sits in the body.
    expect(popup().className).toContain("bg-popover");
    expect(popup().className).toContain("data-[released=swipe]:ease-flick-400");
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

  it("a new body while the sheet stays open is a re-target: the same frame, the body marked to fade; the first body never fades, and a reopen starts over", async () => {
    const { rerender } = render(<Harness tier="phone" sheetOpen />);
    await screen.findByRole("dialog", { name: "Sol Ring" });
    const frame = popup();
    const first = document.querySelector("[data-slot=sheet-body]")!;
    expect(first.hasAttribute("data-swapped")).toBe(false);
    expect(first.className).toContain("motion-safe:data-swapped:animate-dw-in");
    rerender(<Harness tier="phone" sheetOpen sheetKey="signet" />);
    expect(popup()).toBe(frame);
    const swapped = document.querySelector("[data-slot=sheet-body]")!;
    expect(swapped).not.toBe(first);
    expect(swapped.hasAttribute("data-swapped")).toBe(true);
    expect(screen.getByText("SHEET CONTENT signet")).toBeTruthy();
    expect(sheetPoint()).toBe("half");
    // Closed and opened again: a first body, no fade.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "INSPECT" }));
    await screen.findByRole("dialog", { name: "Sol Ring" });
    expect(document.querySelector("[data-slot=sheet-body]")?.hasAttribute("data-swapped")).toBe(
      false,
    );
  });
});

describe("EditorLayout's phone sheet through Base UI's swipe (U4b)", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = stubSheetGeometry();
  });
  afterEach(() => {
    restore();
  });

  it("a swipe up takes it to the full point: modal, the 40 % scrim takes the pointer, data-expanded; a slow swipe down brings it back to the half", async () => {
    render(<Harness tier="phone" sheetOpen />);
    await screen.findByRole("dialog", { name: "Sol Ring" });
    await act(async () => {});
    expect(popup().style.getPropertyValue("--drawer-snap-point-offset")).toBe(
      `${748 - 0.55 * 844}px`,
    );
    await swipe(-300);
    await act(async () => {});
    expect(sheetPoint()).toBe("full");
    expect(viewportModal()).toBe("true");
    expect(popup().hasAttribute("data-expanded")).toBe(true);
    expect(popup().style.getPropertyValue("--drawer-snap-point-offset")).toBe("0px");
    expect(classes(overlay())).not.toContain("pointer-events-none");
    // Slowly back down by about the half's distance: the half again, non-modal.
    await swipe(280, { steps: 40, stepMs: 25 });
    await act(async () => {});
    expect(sheetPoint()).toBe("half");
    expect(viewportModal()).toBe("false");
    expect(classes(overlay())).toContain("pointer-events-none");
  });

  it("a slow swipe down from the half rests at the 9rem peek; a fast one closes it, and the next open is at the half", async () => {
    render(<Harness tier="phone" sheetOpen />);
    await screen.findByRole("dialog", { name: "Sol Ring" });
    await act(async () => {});
    await swipe(320, { steps: 40, stepMs: 25 });
    await act(async () => {});
    expect(sheetPoint()).toBe("peek");
    expect(popup().style.getPropertyValue("--drawer-snap-point-offset")).toBe(`${748 - 144}px`);
    expect(viewportModal()).toBe("false");
    await swipe(200, { steps: 6, stepMs: 16 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    // The next explicit inspection opens it at the half again.
    fireEvent.click(screen.getByRole("button", { name: "INSPECT" }));
    await screen.findByRole("dialog", { name: "Sol Ring" });
    expect(sheetPoint()).toBe("half");
  });

  it("Escape closes it from the full point", async () => {
    render(<Harness tier="phone" sheetOpen />);
    const sheet = await screen.findByRole("dialog", { name: "Sol Ring" });
    await act(async () => {});
    await swipe(-300);
    await act(async () => {});
    expect(sheetPoint()).toBe("full");
    fireEvent.keyDown(sheet, { key: "Escape" });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a release after a drag is marked for flick-400 before Base UI's own handler runs; a press without movement is not, and the next press clears the mark", async () => {
    render(<Harness tier="phone" sheetOpen />);
    await screen.findByRole("dialog", { name: "Sol Ring" });
    await act(async () => {});
    await swipe(-300);
    // Read in the release's own frame: marked (Base UI's data-swiping already dropped).
    expect(popup().getAttribute("data-released")).toBe("swipe");
    await act(async () => {});
    expect(popup().hasAttribute("data-swiping")).toBe(false);
    expect(popup().getAttribute("data-released")).toBe("swipe");
    // A press without movement (Close's, the handle's) clears it and marks nothing.
    const handle = document.querySelector<HTMLElement>("[data-slot=drawer-swipe-handle]")!;
    const at = { pointerId: 2, pointerType: "mouse", clientX: 100, clientY: 120, button: 0 };
    fireEvent.pointerDown(handle, { ...at, buttons: 1 });
    expect(popup().hasAttribute("data-released")).toBe(false);
    fireEvent.pointerUp(handle, { ...at, buttons: 0 });
    expect(popup().hasAttribute("data-released")).toBe(false);
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
    // U4b changes nothing here: no snap points, no scrim, no release split.
    expect(popup().hasAttribute("data-snap-points")).toBe(false);
    expect(overlay()).toBeNull();
    expect(popup().className).not.toContain("released=swipe");
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

describe("EditorLayout's main landmark (U8)", () => {
  it.each(["phone", "md", "wide"] as const)(
    "at %s the panes are the page's <main id=main>, the skip link's target; the header stays outside",
    (tier) => {
      render(<Harness tier={tier} />);
      const main = screen.getByRole("main");
      expect(main.id).toBe("main");
      expect(main.querySelectorAll("section[aria-label]")).toHaveLength(3);
      expect(main.contains(screen.getByText("HEADER"))).toBe(false);
      expect(main.getAttribute("data-pane")).toBe("deck");
    },
  );
});

describe("EditorLayout at wide", () => {
  it("renders the tools inline and neither drawer", () => {
    render(<Harness tier="wide" sheetOpen toolsOpen />);
    expect(within(section("Card detail and suggestions")).getByText("TOOLS CONTENT")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-slot=drawer-popup]")).toBeNull();
  });

  it("the tools pane is a column at wide, so the attribution (mt-auto) rests on its bottom edge (U3a)", () => {
    render(<Harness tier="wide" />);
    const tools = section("Card detail and suggestions");
    expect(tools.className).toContain("wide:flex wide:flex-col");
    expect(tools.className).not.toContain("wide:block");
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

describe("EditorLayout's root under the site header (2026-10-17)", () => {
  it.each(["phone", "md", "wide"] as const)(
    "at %s the root is the viewport minus the site header, never h-dvh, so the document never scrolls under the workspace",
    (tier) => {
      render(<Harness tier={tier} />);
      const root = document.querySelector<HTMLElement>("[data-tier]")!;
      expect(root.dataset.tier).toBe(tier);
      expect(root.className).toContain("h-[calc(100dvh-var(--site-header-height))]");
      expect(root.className).not.toMatch(/\bh-dvh\b/);
      // The root is still the flex column its panes shrink inside (min-h-0 flex-1).
      expect(root.className).toContain("relative isolate flex");
      expect(root.className).toContain("flex-col");
    },
  );

  it("globals.css declares the token as the header's h-14 row plus its 1 px hairline", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--site-header-height: calc(3.5rem + 1px);");
  });
});
