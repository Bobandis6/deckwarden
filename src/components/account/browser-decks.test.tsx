/**
 * "On this browser" (X1, WAVE3.md D1) and the hook behind it: claim tokens
 * in this browser → one POST to /api/decks/mine → tiles under a counted
 * heading; no tokens → no request and nothing rendered; a refused or failed
 * request → nothing rendered (the sign-in page is then exactly what it was).
 * YourDecks rides along: home's guest section reads the same hook and its
 * output is pinned unchanged — the id included, though nothing links it now.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YourDecks } from "@/components/deck/your-decks";
import { BrowserDecks } from "./browser-decks";

const KRENKO = {
  id: "3b1f0f6e-5d0b-4b53-9d0e-0f4d5a0a7c11",
  publicId: "k7renko7mob7",
  game: "mtg",
  format: "commander",
  name: "Krenko — Mob Rule",
  visibility: "unlisted",
  updatedAt: "2026-09-20T04:13:26.820Z",
  ciMask: 8,
  likesCount: 0,
  leaderImage: "https://cards.scryfall.io/small/front/c/d/cd9fec9d.jpg",
};

const UNTITLED = {
  id: "9a2c7e44-1c3e-4f0a-8a55-6f2f1f0b2d22",
  publicId: "unt1tl3dd3ck",
  game: "optcg",
  format: "standard",
  name: "Untitled deck",
  visibility: "unlisted",
  updatedAt: "2026-09-21T04:13:26.820Z",
  ciMask: 0,
  likesCount: 0,
  leaderImage: null,
};

const fetchMock = vi.fn();

function holdTokens(decks: { id: string }[]) {
  for (const deck of decks) {
    window.localStorage.setItem(`deckwarden:deck-token:${deck.id}`, `token-for-${deck.id}`);
  }
}

function answer(decks: unknown[], status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ decks }), { status }));
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrowserDecks", () => {
  it("tokens → one verified request → the counted heading, the sentence and home's tiles", async () => {
    holdTokens([UNTITLED, KRENKO]);
    answer([UNTITLED, KRENKO]);
    render(<BrowserDecks />);

    const section = await screen.findByRole("region", { name: "Decks on this browser" });
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(
      "On this browser · 2 decks",
    );
    expect(section.textContent).toContain("Sign in to keep them on every device.");

    // The tiles are home's: the name opens the editor, Share page is the one action.
    const links = within(section)
      .getAllByRole("link")
      .map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Untitled deck", `/decks/${UNTITLED.id}/edit`],
      ["Share page", `/d/${UNTITLED.publicId}`],
      ["Krenko — Mob Rule", `/decks/${KRENKO.id}/edit`],
      ["Share page", `/d/${KRENKO.publicId}`],
    ]);
    // Reading width: two columns at most (the signed-in account grid's rule).
    expect(section.querySelector("ul")?.className).toContain("lg:grid-cols-2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/decks/mine");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      decks: [
        { id: UNTITLED.id, token: `token-for-${UNTITLED.id}` },
        { id: KRENKO.id, token: `token-for-${KRENKO.id}` },
      ],
    });
  });

  it("one deck reads in the singular", async () => {
    holdTokens([KRENKO]);
    answer([KRENKO]);
    render(<BrowserDecks />);
    const section = await screen.findByRole("region", { name: "Decks on this browser" });
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(
      "On this browser · 1 deck",
    );
    expect(section.textContent).toContain("Sign in to keep it on every device.");
  });

  it("the count is what the server verified, not what the browser holds (stale tokens drop out)", async () => {
    holdTokens([UNTITLED, KRENKO]);
    answer([KRENKO]);
    render(<BrowserDecks />);
    const section = await screen.findByRole("region", { name: "Decks on this browser" });
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(
      "On this browser · 1 deck",
    );
  });

  it("no tokens → no request, nothing rendered", async () => {
    const { container } = render(<BrowserDecks />);
    // Give a wrongly-fired effect the chance to show itself.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("tokens for decks that no longer exist → nothing rendered", async () => {
    holdTokens([KRENKO]);
    answer([]);
    const { container } = render(<BrowserDecks />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });

  it("a refused request (429, 500) → nothing rendered", async () => {
    holdTokens([KRENKO]);
    for (const status of [429, 500]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(new Response("{}", { status }));
      const { container, unmount } = render(<BrowserDecks />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(container.innerHTML, `status ${status}`).toBe("");
      unmount();
    }
  });

  it("a network failure → nothing rendered, nothing thrown", async () => {
    holdTokens([KRENKO]);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = render(<BrowserDecks />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe("");
  });
});

describe("YourDecks (home's guest section — output unchanged by the X1 extraction)", () => {
  it("renders the section with its id, its label, its heading and the same tiles", async () => {
    holdTokens([KRENKO]);
    answer([KRENKO]);
    render(<YourDecks />);
    const section = await screen.findByRole("region", { name: "Continue building" });
    // The id stays as content; no link in src/ targets it by hash since X1.
    expect(section.id).toBe("your-decks");
    expect(section.className).toBe("w-full space-y-3");
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe(
      "Continue building",
    );
    const links = within(section)
      .getAllByRole("link")
      .map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("title")]);
    expect(links).toEqual([
      ["Krenko — Mob Rule", `/decks/${KRENKO.id}/edit`, "Edit Krenko — Mob Rule"],
      ["Share page", `/d/${KRENKO.publicId}`, null],
    ]);
    // Home's grid keeps its three columns from `lg`.
    expect(section.querySelector("ul")?.className).toBe("grid gap-3 sm:grid-cols-2 lg:grid-cols-3");
  });

  it("no tokens → nothing rendered", async () => {
    const { container } = render(<YourDecks />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
});
