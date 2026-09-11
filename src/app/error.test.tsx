/**
 * The Warden error page (R5b, F8): the site header, the mark, the title and
 * the Warden line, Try again wired to `retry`, the digest, and the error
 * reported to Sentry once.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false, error: null }) },
}));

import ErrorPage from "./error";

describe("Error", () => {
  it("renders the shell, reports once, retries on Try again, shows the digest", () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<ErrorPage error={error} retry={retry} />);
    expect(screen.getByRole("banner")).toBeTruthy();
    const main = screen.getByRole("main");
    expect(main.querySelector("svg[aria-hidden]")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong");
    expect(main.textContent).toContain("The Warden has reported this one.");
    expect(main.textContent).toContain("abc123");
    expect(main.textContent).not.toMatch(/approve/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    // Base UI's non-native Button over a Link renders <a role="button"> (the P1.8 shape).
    const home = screen.getByRole("button", { name: "Back to Deckwarden" });
    expect(home.tagName).toBe("A");
    expect(home.getAttribute("href")).toBe("/");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });
});
