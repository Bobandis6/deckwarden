/**
 * ClaimDecks (P2.1; the return since X1, WAVE3.md D1 / REC-1). Without a
 * return path it is what it was: claim this browser's tokens, drop the ones
 * the server confirmed, say so, refresh. With one, the visitor goes back to
 * where the sign-in prompt was — AFTER the claim settles (never before,
 * never instead), immediately when there is nothing to claim, and anyway
 * when the claim fails. The OAuth round trip itself cannot be driven in the
 * browser pane, so this file and callback-url.test.ts are its proof.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { ClaimDecks } from "./claim-decks";

const DECK_A = "3b1f0f6e-5d0b-4b53-9d0e-0f4d5a0a7c11";
const DECK_B = "9a2c7e44-1c3e-4f0a-8a55-6f2f1f0b2d22";
const KEY = (id: string) => `deckwarden:deck-token:${id}`;

const fetchMock = vi.fn();

function holdTokens(ids: string[]) {
  for (const id of ids) window.localStorage.setItem(KEY(id), `token-for-${id}`);
}

/** A claim response the test resolves by hand, to see what happens BEFORE it lands. */
function deferredClaim() {
  let resolve!: (res: Response) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  fetchMock.mockReturnValue(promise);
  return {
    claimed: (ids: string[]) =>
      resolve(new Response(JSON.stringify({ claimedIds: ids }), { status: 200 })),
    refused: (status: number) => resolve(new Response("{}", { status })),
    failed: () => reject(new TypeError("Failed to fetch")),
  };
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClaimDecks without a return path (unchanged)", () => {
  it("no tokens → no request, nothing rendered, no navigation", async () => {
    const { container } = render(<ClaimDecks />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("claims, drops the confirmed tokens, says so and refreshes", async () => {
    holdTokens([DECK_A, DECK_B]);
    const claim = deferredClaim();
    render(<ClaimDecks />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/decks/claim");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      decks: [
        { id: DECK_A, token: `token-for-${DECK_A}` },
        { id: DECK_B, token: `token-for-${DECK_B}` },
      ],
    });

    await act(async () => claim.claimed([DECK_A]));
    expect((await screen.findByRole("status")).textContent).toBe(
      "Moved 1 deck from this browser into your account.",
    );
    // The confirmed token is gone; the skipped one stays for the next visit.
    expect(window.localStorage.getItem(KEY(DECK_A))).toBeNull();
    expect(window.localStorage.getItem(KEY(DECK_B))).toBe(`token-for-${DECK_B}`);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("a refused claim is silent and keeps the tokens", async () => {
    holdTokens([DECK_A]);
    const claim = deferredClaim();
    const { container } = render(<ClaimDecks />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => claim.refused(429));
    await settle();
    expect(container.innerHTML).toBe("");
    expect(window.localStorage.getItem(KEY(DECK_A))).toBe(`token-for-${DECK_A}`);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("ClaimDecks with a return path (X1)", () => {
  it("no tokens → returns at once, with the status line and its link", async () => {
    render(<ClaimDecks next="/d/uwvrnv2pv4t6" />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith("/d/uwvrnv2pv4t6");
    expect(fetchMock).not.toHaveBeenCalled();

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Signed in — taking you back… Go now");
    expect(screen.getByRole("link", { name: "Go now" }).getAttribute("href")).toBe(
      "/d/uwvrnv2pv4t6",
    );
  });

  it("with tokens the claim runs FIRST: no return until it settles, then exactly one", async () => {
    holdTokens([DECK_A, DECK_B]);
    const claim = deferredClaim();
    render(<ClaimDecks next="/d/uwvrnv2pv4t6" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("/api/decks/claim");

    // The claim is in flight: the visitor is still here, the line already says why.
    await settle();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Signed in — taking you back… Go now");

    await act(async () => claim.claimed([DECK_A, DECK_B]));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith("/d/uwvrnv2pv4t6");
    expect(window.localStorage.getItem(KEY(DECK_A))).toBeNull();
    expect(window.localStorage.getItem(KEY(DECK_B))).toBeNull();
    // Leaving the page: no refresh of a list nobody will read.
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("a claim that claims nothing still returns", async () => {
    holdTokens([DECK_A]);
    const claim = deferredClaim();
    render(<ClaimDecks next="/d/uwvrnv2pv4t6" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => claim.claimed([]));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/d/uwvrnv2pv4t6"));
    expect(window.localStorage.getItem(KEY(DECK_A))).toBe(`token-for-${DECK_A}`);
  });

  it("a refused claim returns anyway and keeps the tokens for the next visit", async () => {
    holdTokens([DECK_A]);
    const claim = deferredClaim();
    render(<ClaimDecks next="/d/uwvrnv2pv4t6" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => claim.refused(500));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith("/d/uwvrnv2pv4t6");
    expect(window.localStorage.getItem(KEY(DECK_A))).toBe(`token-for-${DECK_A}`);
  });

  it("a network failure returns anyway", async () => {
    holdTokens([DECK_A]);
    const claim = deferredClaim();
    render(<ClaimDecks next="/d/uwvrnv2pv4t6" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => claim.failed());
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith("/d/uwvrnv2pv4t6");
    expect(window.localStorage.getItem(KEY(DECK_A))).toBe(`token-for-${DECK_A}`);
  });

  it.each([["//evil.example"], ["https://evil.example"], ["/\\evil.example"], ["/account"], [""]])(
    "an unsafe return path (%s) is no return path: the component behaves as without one",
    async (next) => {
      const { container } = render(<ClaimDecks next={next} />);
      await settle();
      expect(router.replace).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe("");
    },
  );
});
