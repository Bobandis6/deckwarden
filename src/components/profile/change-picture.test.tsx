/**
 * Change picture (X5, WAVE3.md D5): the pencil, the dialog, Save, and the
 * header after Save — signed in, which only RTL can show (the browser pane
 * is signed out everywhere). The Better Auth client is mocked as a tiny
 * session store: `refetch` with the cookie cache bypassed is what moves it,
 * so "the header's picture changes after one refetch" is the store being
 * re-read by the header, not a test reaching into it.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { avatarArtUrl, type AvatarChoice } from "@/lib/profile/avatar";
import type { SuggestRow } from "@/lib/search/suggest";

type SessionUser = { name: string; image: string | null; avatar: AvatarChoice | null };

const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    data: null as null | { user: SessionUser },
    /** What the server holds — the next bypassed refetch reads it. */
    server: null as null | { user: SessionUser },
  };
  return {
    state,
    listeners,
    refetch: vi.fn(async (opts?: { query?: { disableCookieCache?: boolean } }) => {
      if (opts?.query?.disableCookieCache) state.data = state.server;
      listeners.forEach((l) => l());
    }),
    signInSocial: vi.fn(async () => ({ error: null })),
    refresh: vi.fn(),
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => {
      const data = useSyncExternalStore(
        (l) => {
          store.listeners.add(l);
          return () => store.listeners.delete(l);
        },
        () => store.state.data,
      );
      return { data, isPending: false, error: null, refetch: store.refetch };
    },
    signIn: { social: store.signInSocial },
    signOut: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: store.refresh, push: vi.fn() }),
}));

import { SiteHeader } from "@/components/site-header";

import { ChangePicture, providerPictureLabel } from "./change-picture";

const LIVE = "https://cdn.discordapp.com/avatars/1/live.png";
const SOL_RING: SuggestRow = {
  id: "6ad8011d-3471-4369-9d68-b264cc027487",
  name: "Sol Ring",
  slug: null,
  isLeader: false,
  typeLine: "Artifact",
  colorsMask: 0,
  ciMask: 0,
  externalKey: "oracle-sol",
  image: "https://cards.scryfall.io/small/front/1/b/1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6.jpg",
};
const SOL_ART: AvatarChoice = {
  kind: "art",
  printingId: "1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6",
  cardName: "Sol Ring",
  artist: "Mark Tedin",
};

let putAnswer: { status: number; body: unknown } = { status: 200, body: { avatar: null } };
const puts: unknown[] = [];

/** jsdom never loads images: every probe stays pending, so no picture swaps under a test. */
class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  referrerPolicy = "";
  crossOrigin: string | null = null;
  src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
}

beforeEach(() => {
  store.state.data = { user: { name: "Bobandis6", image: LIVE, avatar: null } };
  store.state.server = store.state.data;
  store.refetch.mockClear();
  store.signInSocial.mockClear();
  store.refresh.mockClear();
  putAnswer = { status: 200, body: { avatar: null } };
  puts.length = 0;
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/profile/avatar") {
        puts.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify(putAnswer.body), { status: putAnswer.status });
      }
      if (url.pathname === "/api/cards/suggest") {
        return new Response(JSON.stringify({ q: url.searchParams.get("q"), results: [SOL_RING] }));
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPicture(props: Partial<Parameters<typeof ChangePicture>[0]> = {}) {
  return render(
    <ChangePicture
      name="Bobandis6"
      image={LIVE}
      avatar={null}
      providers={["discord"]}
      {...props}
    />,
  );
}

const pencil = () => screen.getByRole("button", { name: "Change picture" });
const dialog = () => screen.getByRole("dialog", { name: "Change picture" });

async function openDialog() {
  // A real click focuses the button first; Base UI returns focus to it on close.
  pencil().focus();
  fireEvent.click(pencil());
  return screen.findByRole("dialog", { name: "Change picture" });
}

async function pickSolRing() {
  const box = within(dialog()).getByRole("combobox", { name: "Search a Magic card" });
  fireEvent.input(box, { target: { value: "sol" }, inputType: "insertText" });
  const option = await screen.findByRole("option", { name: /Sol Ring/ });
  fireEvent.click(option);
  return box;
}

describe("the picture button", () => {
  it("is a real button named 'Change picture', the pencil shown on hover, focus and coarse pointers", () => {
    renderPicture();
    const button = pencil();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button"); // Enter and Space open it natively
    const badge = button.querySelector('[data-slot="pencil"]')!;
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    for (const cls of [
      "opacity-0",
      "group-hover:opacity-100",
      "group-focus-visible:opacity-100",
      "pointer-coarse:opacity-100",
    ]) {
      expect(badge.className).toContain(cls);
    }
    // The target is the 48 px picture itself (≥ 44 px).
    expect(button.querySelector('[data-slot="avatar"]')?.className).toContain("size-12");
  });
});

describe("the dialog", () => {
  it("three choices in a labelled radio group, the current one checked; Cancel and Save", async () => {
    renderPicture();
    const d = await openDialog();
    const group = within(d).getByRole("group", { name: "Your picture" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["provider", "art", "initial"]);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    expect(within(d).getByRole("radio", { name: /Discord picture/ })).toBe(radios[0]);
    expect(within(d).getByRole("radio", { name: "Card art" })).toBe(radios[1]);
    expect(within(d).getByRole("radio", { name: "Just my initial" })).toBe(radios[2]);
    expect(within(d).getByText("Updates each time you sign in.")).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("opens on the saved choice: card art checked, its crop credited in full beside it", async () => {
    renderPicture({ avatar: SOL_ART });
    const d = await openDialog();
    expect((within(d).getByRole("radio", { name: "Card art" }) as HTMLInputElement).checked).toBe(
      true,
    );
    const credit = within(d).getByText(
      "Picture: Sol Ring · Art: Mark Tedin · ™ & © Wizards of the Coast",
    );
    expect(credit.className).not.toContain("truncate");
    // Still credited with another choice checked: the crop is still on screen.
    fireEvent.click(within(d).getByRole("radio", { name: "Just my initial" }));
    expect(within(d).getByText(/Art: Mark Tedin/)).toBeTruthy();
  });

  it("Esc cancels: nothing is sent and focus returns to the picture", async () => {
    renderPicture();
    await openDialog();
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Just my initial" }));
    fireEvent.keyDown(document.activeElement ?? dialog(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(pencil()));
  });

  it("Cancel closes without a request", async () => {
    renderPicture();
    const d = await openDialog();
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([]);
  });

  it("Save → PUT the choice → one session refetch with the cookie cache bypassed → refresh → closed", async () => {
    renderPicture();
    const d = await openDialog();
    fireEvent.click(within(d).getByRole("radio", { name: "Just my initial" }));
    putAnswer = { status: 200, body: { avatar: { kind: "initial" } } };
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([{ kind: "initial" }]);
    expect(store.refetch).toHaveBeenCalledTimes(1);
    expect(store.refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
    expect(store.refresh).toHaveBeenCalledTimes(1);
    expect(store.refetch.mock.invocationCallOrder[0]).toBeLessThan(
      store.refresh.mock.invocationCallOrder[0],
    );
  });

  it("card art: typing selects the choice, a pick names the card, Save sends its id", async () => {
    renderPicture();
    const d = await openDialog();
    const box = await pickSolRing();
    expect((within(d).getByRole("radio", { name: "Card art" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(box).toBeTruthy();
    // The preview is the picked card's own image (it carries its artist line).
    expect(d.querySelector(`img[src="${SOL_RING.image}"]`)).toBeTruthy();
    putAnswer = { status: 200, body: { avatar: SOL_ART } };
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([{ kind: "art", cardId: SOL_RING.id }]);
  });

  it("card art with no card picked cannot be saved; Enter in the box presses nothing", async () => {
    renderPicture();
    const d = await openDialog();
    const box = within(d).getByRole("combobox", { name: "Search a Magic card" });
    fireEvent.input(box, { target: { value: "zz" }, inputType: "insertText" });
    expect((within(d).getByRole("radio", { name: "Card art" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((within(d).getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const notPrevented = fireEvent.keyDown(box, { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(puts).toEqual([]);
    expect(dialog()).toBeTruthy();
  });

  it("a refusal keeps the dialog open with the route's sentence; no refetch, no refresh", async () => {
    renderPicture();
    const d = await openDialog();
    await pickSolRing();
    putAnswer = {
      status: 422,
      body: { error: "Scryfall lists no artist for this card's art." },
    };
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect((await within(d).findByRole("alert")).textContent).toBe(
      "Scryfall lists no artist for this card's art.",
    );
    expect(dialog()).toBeTruthy();
    expect(store.refetch).not.toHaveBeenCalled();
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it("Refresh now is the sign-in round trip, back to /account", async () => {
    renderPicture();
    const d = await openDialog();
    fireEvent.click(within(d).getByRole("button", { name: "Refresh now" }));
    await waitFor(() => expect(store.signInSocial).toHaveBeenCalledTimes(1));
    expect(store.signInSocial).toHaveBeenCalledWith({
      provider: "discord",
      callbackURL: "/account",
    });
    expect(puts).toEqual([]);
  });

  it("two linked providers: provider-neutral words and one refresh per provider", async () => {
    expect(providerPictureLabel(["discord"])).toBe("Discord picture");
    expect(providerPictureLabel(["google"])).toBe("Google picture");
    expect(providerPictureLabel(["discord", "google"])).toBe("Your sign-in picture");
    expect(providerPictureLabel([])).toBe("Your sign-in picture");
    renderPicture({ providers: ["discord", "google"] });
    const d = await openDialog();
    expect(within(d).getByRole("radio", { name: /Your sign-in picture/ })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Refresh from Discord" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Refresh from Google" })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Refresh now" })).toBeNull();
  });
});

describe("the header after Save", () => {
  it("changes the 24 px picture after the one refetch — not five minutes later", async () => {
    render(
      <>
        <SiteHeader />
        <ChangePicture name="Bobandis6" image={LIVE} avatar={null} providers={["discord"]} />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Bobandis6" });
    const probes = () => FakeImage.instances.map((i) => i.src);
    expect(probes()).toContain(LIVE);
    expect(probes()).not.toContain(avatarArtUrl(SOL_ART.kind === "art" ? SOL_ART.printingId : ""));

    // The server now holds card art; the cached session does not know yet.
    store.state.server = { user: { name: "Bobandis6", image: LIVE, avatar: SOL_ART } };
    const d = await openDialog();
    await pickSolRing();
    putAnswer = { status: 200, body: { avatar: SOL_ART } };
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(store.refetch).toHaveBeenCalledTimes(1);
    // The header's own 24 px avatar now probes the art crop.
    const headerAvatar = trigger.querySelector('[data-slot="avatar"]')!;
    expect(headerAvatar.className).toContain("size-6");
    const art = avatarArtUrl("1b59533a-3e16-4ab4-9b7a-4bd6a5d1f2d6");
    expect(FakeImage.instances.at(-1)?.src).toBe(art);
  });
});
