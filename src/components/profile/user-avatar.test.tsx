/**
 * UserAvatar (P2.9 round 2): the profile picture on /account and
 * /u/[username] must never render as an empty ring. Provider pictures go
 * stale — a Discord avatar URL embeds a hash that changes with the picture,
 * and the old address then 404s — so a failed load shows the initial, the
 * way the header's slot always has. jsdom never loads images, so the probe
 * Base UI creates is a controllable fake and each test fires the load or
 * error event itself: the initial is present both before and after a
 * failure, and only firing the event proves which state is being asserted.
 *
 * X5: the 24 px header size, and the chosen picture — card art tries its
 * derived crop, then the provider picture, then shows the initial (a stale
 * art choice is never a broken image); "Just my initial" probes nothing;
 * AvatarCredit renders the credit line for card art only.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { avatarArtUrl, type AvatarChoice } from "@/lib/profile/avatar";

import { AvatarCredit, UserAvatar } from "./user-avatar";

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

  it("card art: the derived crop first; a failure falls to the provider picture, then the initial", () => {
    const art: AvatarChoice = {
      kind: "art",
      printingId: "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6",
      cardName: "Sol Ring",
      artist: "Mark Tedin",
    };
    const { container } = render(
      <UserAvatar name="Bobandis6" image={LIVE} avatar={art} size={48} />,
    );
    expect(FakeImage.instances.at(-1)?.src).toBe(avatarArtUrl(art.printingId));
    expect(FakeImage.instances.at(-1)?.referrerPolicy).toBe("no-referrer");
    fire("onerror"); // the printing's crop is gone
    expect(FakeImage.instances.at(-1)?.src).toBe(LIVE);
    expect(screen.getByText("B")).toBeTruthy(); // never an empty ring meanwhile
    fire("onerror"); // and the provider picture too
    expect(screen.getByText("B")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("card art that loads shows the crop", () => {
    const art: AvatarChoice = {
      kind: "art",
      printingId: "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6",
      cardName: "Sol Ring",
      artist: "Mark Tedin",
    };
    const { container } = render(<UserAvatar name="B" image={LIVE} avatar={art} size={64} />);
    fire("onload");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(avatarArtUrl(art.printingId));
  });

  it("'Just my initial': the initial, no probe, even with a provider picture on file", () => {
    const { container } = render(
      <UserAvatar name="Bobandis6" image={LIVE} avatar={{ kind: "initial" }} size={48} />,
    );
    expect(screen.getByText("B")).toBeTruthy();
    expect(FakeImage.instances).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
  });

  it("a new choice restarts the chain from its first source", () => {
    const { rerender } = render(<UserAvatar name="B" image={STALE} size={48} />);
    fire("onerror");
    rerender(<UserAvatar name="B" image={LIVE} size={48} />);
    expect(FakeImage.instances.at(-1)?.src).toBe(LIVE);
  });

  it("AvatarCredit: the credit line for card art, nothing otherwise", () => {
    const { container, rerender } = render(
      <AvatarCredit
        avatar={{
          kind: "art",
          printingId: "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6",
          cardName: "Sol Ring",
          artist: "Mark Tedin",
        }}
      />,
    );
    expect(container.textContent).toBe(
      "Picture: Sol Ring · Art: Mark Tedin · ™ & © Wizards of the Coast",
    );
    rerender(<AvatarCredit avatar={{ kind: "initial" }} />);
    expect(container.textContent).toBe("");
    rerender(<AvatarCredit avatar={null} />);
    expect(container.textContent).toBe("");
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
    // X5: the header's 24 px, the old inline Avatar's size-6 and small type.
    rerender(<UserAvatar name="B" image={null} size={24} />);
    expect(root()?.className).toContain("size-6");
    expect(root()?.className).not.toContain("size-8");
    expect(root()?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("B").className).toContain("text-xs");
  });
});
