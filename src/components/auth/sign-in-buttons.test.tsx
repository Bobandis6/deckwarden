/**
 * SignInButtons (P2.1; the return path since X1): both providers, and the
 * callbackURL they hand Better Auth — /account always (the claim runs
 * there), with `?next=` only when the value passes safeNextPath. A crafted
 * value must never reach the library: the buttons validate again even though
 * the page already did.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const social = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social } },
}));

import { SignInButtons } from "./sign-in-buttons";

beforeEach(() => {
  social.mockReset();
  social.mockResolvedValue({ data: { redirect: true }, error: null });
});

describe("SignInButtons", () => {
  it("offers Discord and Google, nothing else", () => {
    render(<SignInButtons />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Sign in with Discord",
      "Sign in with Google",
    ]);
  });

  it("without a return path the callback is plain /account", async () => {
    render(<SignInButtons />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Discord" }));
    await waitFor(() => expect(social).toHaveBeenCalledTimes(1));
    expect(social).toHaveBeenCalledWith({ provider: "discord", callbackURL: "/account" });
  });

  it("with a return path the callback is /account?next=…, for either provider", async () => {
    const { unmount } = render(<SignInButtons next="/d/uwvrnv2pv4t6" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Discord" }));
    await waitFor(() => expect(social).toHaveBeenCalledTimes(1));
    expect(social).toHaveBeenLastCalledWith({
      provider: "discord",
      callbackURL: "/account?next=%2Fd%2Fuwvrnv2pv4t6",
    });
    unmount();

    render(<SignInButtons next="/d/uwvrnv2pv4t6" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    await waitFor(() => expect(social).toHaveBeenCalledTimes(2));
    expect(social).toHaveBeenLastCalledWith({
      provider: "google",
      callbackURL: "/account?next=%2Fd%2Fuwvrnv2pv4t6",
    });
  });

  it.each([
    ["//evil.example"],
    ["https://evil.example/d/abc"],
    ["/\\evil.example"],
    ["/%2Fevil.example"],
    ["/account"],
    ["/api/account"],
    [""],
  ])("an unsafe return path (%s) never reaches the library: plain /account", async (next) => {
    render(<SignInButtons next={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Discord" }));
    await waitFor(() => expect(social).toHaveBeenCalledTimes(1));
    expect(social).toHaveBeenCalledWith({ provider: "discord", callbackURL: "/account" });
  });

  it("a refused sign-in shows the message and frees the buttons", async () => {
    social.mockResolvedValue({ data: null, error: { message: "Provider unavailable" } });
    render(<SignInButtons next="/d/uwvrnv2pv4t6" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Discord" }));
    await screen.findByText("Provider unavailable");
    expect(
      (screen.getByRole("button", { name: "Sign in with Discord" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
