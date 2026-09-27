/**
 * UserAvatar (P2.9 round 2): the profile picture on /account and
 * /u/[username] must never render as an empty ring. Provider pictures go
 * stale — a Discord avatar URL embeds a hash that changes with the picture,
 * and the old address then 404s — so a failed load shows the initial, the
 * way the header's slot always has. jsdom never loads images, so the probe
 * Base UI creates is a controllable fake and each test fires the load or
 * error event itself: the initial is present both before and after a
 * failure, and only firing the event proves which state is being asserted.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UserAvatar } from "./user-avatar";

const STALE = "https://cdn.discordapp.com/avatars/1/stale.png";
const LIVE = "https://cdn.discordapp.com/avatars/1/live.png";

/** A controllable Image — the use-leader-art.test.tsx pattern. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  referrerPolicy = "";
  crossOrigin: string | null = null;
  src = "";
  // No `complete` / `naturalWidth`: Base UI's cached-image fast path must find them falsy.
  constructor() {
    FakeImage.instances.push(this);
  }
}

function fire(event: "onload" | "onerror") {
  act(() => {
    FakeImage.instances.at(-1)?.[event]?.();
  });
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserAvatar", () => {
  it("no picture: the initial, no <img>, and no image probe", () => {
    const { container } = render(<UserAvatar name="Bobandis6" image={null} size={48} />);
    expect(screen.getByText("B")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(FakeImage.instances).toHaveLength(0);
  });

  it("a picture that fails to load keeps the initial and renders no <img>", () => {
    const { container } = render(<UserAvatar name="Bobandis6" image={STALE} size={64} />);
    const probe = FakeImage.instances.at(-1);
    expect(probe?.src).toBe(STALE);
    // Provider avatars are cross-origin: the probe must not leak the page URL either.
    expect(probe?.referrerPolicy).toBe("no-referrer");
    fire("onerror");
    expect(screen.getByText("B")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("a picture that loads replaces the initial with a plain <img>", () => {
    const { container } = render(<UserAvatar name="Bobandis6" image={LIVE} size={48} />);
    // Before the load event the initial holds the space — never an empty ring.
    expect(screen.getByText("B")).toBeTruthy();
    fire("onload");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(LIVE);
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.queryByText("B")).toBeNull();
  });

  it("the initial is the first code point: blank → ?, an emoji stays whole", () => {
    const { rerender } = render(<UserAvatar name="   " image={null} size={48} />);
    expect(screen.getByText("?")).toBeTruthy();
    // charAt(0) would split the surrogate pair and mismatch between server and client.
    rerender(<UserAvatar name="🦊 Fox" image={null} size={48} />);
    expect(screen.getByText("🦊")).toBeTruthy();
    rerender(<UserAvatar name="  élan" image={null} size={48} />);
    expect(screen.getByText("É")).toBeTruthy();
  });

  it("size maps to the two page sizes, beats the wrapper's default, and stays decorative", () => {
    const { container, rerender } = render(<UserAvatar name="B" image={null} size={48} />);
    const root = () => container.querySelector('[data-slot="avatar"]');
    expect(root()?.className).toContain("size-12");
    expect(root()?.className).not.toContain("size-8");
    // The <h1> beside it carries the name; the initial must not be announced twice.
    expect(root()?.getAttribute("aria-hidden")).toBe("true");
    rerender(<UserAvatar name="B" image={null} size={64} />);
    expect(root()?.className).toContain("size-16");
    expect(root()?.className).not.toContain("size-8");
  });
});
