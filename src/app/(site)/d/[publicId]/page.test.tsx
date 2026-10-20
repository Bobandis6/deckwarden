/**
 * The share page's private branches (S6, SECURITY-AUDIT-report.md L4), as
 * the segment layout and the page wire share-access.ts: a private GUEST
 * deck hands the client gate the public id and nothing else (no uuid in the
 * RSC payload); a private ACCOUNT deck is a real 404 from the layout — and
 * from the page, should the layout ever be bypassed — for a stranger and
 * for the signed-out, and passes the layout for its owner's session.
 */
import { describe, expect, it, vi } from "vitest";

import { PrivateShareGate } from "@/components/deck/private-share-gate";

const mocks = vi.hoisted(() => ({
  deck: null as Record<string, unknown> | null,
  viewer: null as string | null,
}));

vi.mock("./deck", () => ({
  getDeck: async () => mocks.deck,
  getViewer: async () => mocks.viewer,
}));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => mocks.viewer }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const page = await import("./page");
const layout = await import("./layout");

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const DECK_ID = "0d7b2b7d-2f2c-4d1c-9c8f-4b2a8f9f2e11";
const PUBLIC_ID = "pr1vate0deck";
const params = Promise.resolve({ publicId: PUBLIC_ID });
const searchParams = Promise.resolve({});
const children = "the page";

function privateDeck(userId: string | null) {
  return { id: DECK_ID, publicId: PUBLIC_ID, visibility: "private", userId };
}

describe("a private guest deck", () => {
  it("renders the client gate with the public id alone — no uuid in the payload", async () => {
    mocks.deck = privateDeck(null);
    mocks.viewer = STRANGER;
    expect(await layout.default({ params, children })).toBe(children);
    const element = (await page.default({ params, searchParams })) as React.ReactElement<{
      publicId: string;
    }>;
    expect(element.type).toBe(PrivateShareGate);
    expect(element.props).toEqual({ publicId: PUBLIC_ID });
    expect(JSON.stringify(element.props)).not.toContain(DECK_ID);
  });
});

describe("a private account deck", () => {
  it("is a 404 for a stranger, from the layout and from the page", async () => {
    mocks.deck = privateDeck(OWNER);
    mocks.viewer = STRANGER;
    await expect(layout.default({ params, children })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(page.default({ params, searchParams })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("is a 404 signed out", async () => {
    mocks.deck = privateDeck(OWNER);
    mocks.viewer = null;
    await expect(layout.default({ params, children })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(page.default({ params, searchParams })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("passes the layout for its owner's session (the page then renders it like any deck)", async () => {
    mocks.deck = privateDeck(OWNER);
    mocks.viewer = OWNER;
    expect(await layout.default({ params, children })).toBe(children);
  });
});

describe("an unknown id", () => {
  it("is a 404 from the layout before anything streams", async () => {
    mocks.deck = null;
    mocks.viewer = OWNER;
    await expect(layout.default({ params, children })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
