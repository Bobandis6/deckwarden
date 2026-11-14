// @vitest-environment node
/**
 * The public profile's picture (the 2026-11 security audit's run-2 record):
 * UserAvatar is a client component, so every prop it gets is sent to the
 * visitor. With "Just my initial" stored, the provider URL in users.image
 * stays on the server (image null); the provider picture and card art keep
 * it as before. Run over the REAL drizzle builders and a fake postgres.js
 * client that answers the users select with one row and everything else
 * with no rows.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserAvatar } from "@/components/profile/user-avatar";
import * as schema from "@/db/schema";

const PROVIDER_URL = "https://cdn.discordapp.com/avatars/000000000000000002/dummyhash.png";

const mocks = vi.hoisted(() => ({ avatar: null as unknown }));

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string) {
    // The users select: id, name, image, avatar, username, created_at.
    const rows = sql.includes('from "users"')
      ? [
          [
            "11111111-1111-4111-8111-111111111111",
            "Dummy",
            PROVIDER_URL,
            mocks.avatar,
            "dummy",
            "2026-10-01T00:00:00.000Z",
          ],
        ]
      : [];
    return { values: async () => rows, then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const page = await import("./page");

/** The props of the first UserAvatar element in the page's tree. */
function findAvatarProps(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAvatarProps(child as ReactNode);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown>;
  if (node.type === UserAvatar) return props;
  return findAvatarProps(props.children as ReactNode);
}

async function avatarProps(): Promise<Record<string, unknown>> {
  const tree = await page.default({
    params: Promise.resolve({ username: "dummy" }),
    searchParams: Promise.resolve({}),
  });
  const props = findAvatarProps(tree);
  if (!props) throw new Error("no UserAvatar in the profile page");
  return props;
}

beforeEach(() => {
  mocks.avatar = null;
});

describe("the public profile's UserAvatar image prop", () => {
  it('"Just my initial": the provider URL is not sent', async () => {
    mocks.avatar = { kind: "initial" };
    const props = await avatarProps();
    expect(props.avatar).toEqual({ kind: "initial" });
    expect(props.image).toBeNull();
  });

  it("the provider picture (no choice stored): the URL is sent, as before", async () => {
    mocks.avatar = null;
    const props = await avatarProps();
    expect(props.avatar).toBeNull();
    expect(props.image).toBe(PROVIDER_URL);
  });

  it("card art: the provider picture stays its fallback, as before", async () => {
    mocks.avatar = {
      kind: "art",
      printingId: "22222222-2222-4222-8222-222222222222",
      cardName: "Sol Ring",
      artist: "Mark Tedin",
    };
    const props = await avatarProps();
    expect(props.avatar).toMatchObject({ kind: "art" });
    expect(props.image).toBe(PROVIDER_URL);
  });
});
