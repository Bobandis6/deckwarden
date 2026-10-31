// @vitest-environment node
/**
 * DELETE /api/account refreshes the ISR listings the account sat on (the
 * 2026-10-30 security audit's hub record): the public decks' hub shelves and
 * the core sitemap, which lists the /u/ profile too — so the call is made
 * whether or not any deck was public, and only after the deletion ran. The
 * deletion itself, the session, the limiter and the refresh are mocked at
 * their module seams; what this pins is the route's order and its arguments.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  signOut: vi.fn(),
  enforceRateLimit: vi.fn(),
  deleteAccount: vi.fn(),
  revalidateDeckListings: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  getSessionUserId: mocks.getSessionUserId,
  auth: { api: { signOut: mocks.signOut } },
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/profile/delete-account", () => ({ deleteAccount: mocks.deleteAccount }));
vi.mock("@/lib/hub/paths", () => ({ revalidateDeckListings: mocks.revalidateDeckListings }));

const { DELETE } = await import("./route");
const { DELETE_CONFIRM_PHRASE } = await import("@/lib/profile/delete-account-phrase");

const USER = "0b5a4f8e-1111-4222-8333-944445555666";
const PUBLIC_DECKS = [{ gameId: 1, leaderIds: ["aaaaaaaa-1111-4111-8111-000000000001"] }];

function del(body: unknown = { confirm: DELETE_CONFIRM_PHRASE }) {
  return new NextRequest("http://localhost:3000/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const m of Object.values(mocks)) if (typeof m === "function") m.mockReset();
  mocks.order = [];
  mocks.getSessionUserId.mockResolvedValue(USER);
  mocks.enforceRateLimit.mockResolvedValue(null);
  mocks.signOut.mockResolvedValue(undefined);
  mocks.deleteAccount.mockImplementation(async () => {
    mocks.order.push("delete");
    return { decksDeleted: 2, publicDecks: PUBLIC_DECKS };
  });
  mocks.revalidateDeckListings.mockImplementation(async (decks: unknown) => {
    mocks.order.push(`revalidate:${JSON.stringify(decks)}`);
    return ["/sitemap.xml"];
  });
});

describe("DELETE /api/account and the listings", () => {
  it("refreshes the listings with the public decks the deletion reported, after it ran", async () => {
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, decksDeleted: 2 });
    expect(mocks.deleteAccount).toHaveBeenCalledWith(USER);
    expect(mocks.order).toEqual(["delete", `revalidate:${JSON.stringify(PUBLIC_DECKS)}`]);
  });

  it("refreshes even with no public deck: the sitemap listed the profile", async () => {
    mocks.deleteAccount.mockResolvedValue({ decksDeleted: 0, publicDecks: [] });
    await DELETE(del());
    expect(mocks.revalidateDeckListings).toHaveBeenCalledWith([]);
  });

  it("a refused call refreshes nothing: signed out, over the cap, or the wrong confirm phrase", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    expect((await DELETE(del())).status).toBe(401);
    mocks.getSessionUserId.mockResolvedValue(USER);
    expect((await DELETE(del({ confirm: "nope" }))).status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    expect(mocks.revalidateDeckListings).not.toHaveBeenCalled();
  });
});
