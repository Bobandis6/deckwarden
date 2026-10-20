// @vitest-environment node
/**
 * The folder page's per-viewer deck filter (S6, SECURITY-AUDIT-report.md
 * L5), run over the REAL drizzle builders and a fake postgres.js client
 * that records every statement: a stranger on a PUBLIC folder gets a decks
 * query bound to `public` alone — an unlisted deck filed there is no longer
 * listed to the world — while a stranger on an UNLISTED folder still sees
 * public + unlisted (the folder link is the secret), and the owner sees all
 * three. The folder lookup is stubbed; the session comes from the mock.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

type Call = { sql: string; params: unknown[] };
let calls: Call[] = [];

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[] = []) {
    calls.push({ sql, params });
    return { values: async () => [], then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  viewer: null as string | null,
  folder: null as Record<string, unknown> | null,
}));

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => mocks.viewer }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/decks/folders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/decks/folders")>()),
  loadFolderByPublicId: async () => mocks.folder,
}));

const page = await import("./page");

function folder(visibility: "public" | "unlisted" | "private") {
  return {
    id: FOLDER_ID,
    publicId: "f0lder0id",
    userId: OWNER,
    name: "cEDH lists",
    description: null,
    visibility,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };
}

/** The decks statement the page ran, and the visibilities it bound. */
async function decksQuery(): Promise<{ sql: string; visibilities: unknown[] }> {
  await page.default({
    params: Promise.resolve({ publicId: "f0lder0id" }),
    searchParams: Promise.resolve({}),
  });
  const query = calls.find((c) => c.sql.includes('from "decks"'));
  if (!query) throw new Error(`no decks query among ${calls.length} statement(s)`);
  const visibilities = query.params.filter((p) =>
    ["public", "unlisted", "private"].includes(p as string),
  );
  return { sql: query.sql, visibilities };
}

beforeEach(() => {
  calls = [];
});

describe("the folder page's deck rows", () => {
  it("a stranger on a public folder: public decks only", async () => {
    mocks.folder = folder("public");
    mocks.viewer = STRANGER;
    const { sql, visibilities } = await decksQuery();
    expect(sql).toMatch(/"decks"\."folder_id" = \$\d+ and "decks"\."visibility" in \(\$\d+\)/);
    expect(visibilities).toEqual(["public"]);
  });

  it("signed out on a public folder: the same", async () => {
    mocks.folder = folder("public");
    mocks.viewer = null;
    expect((await decksQuery()).visibilities).toEqual(["public"]);
  });

  it("a stranger on an unlisted folder: public and unlisted decks", async () => {
    mocks.folder = folder("unlisted");
    mocks.viewer = STRANGER;
    const { sql, visibilities } = await decksQuery();
    expect(sql).toMatch(/"decks"\."visibility" in \(\$\d+, \$\d+\)/);
    expect(visibilities).toEqual(["public", "unlisted"]);
  });

  it("the owner: every deck, whatever the folder's visibility", async () => {
    for (const visibility of ["public", "unlisted", "private"] as const) {
      calls = [];
      mocks.folder = folder(visibility);
      mocks.viewer = OWNER;
      expect((await decksQuery()).visibilities).toEqual(["public", "unlisted", "private"]);
    }
  });

  it("a stranger on a private folder: the denial shell, no decks query at all", async () => {
    mocks.folder = folder("private");
    mocks.viewer = STRANGER;
    await page.default({
      params: Promise.resolve({ publicId: "f0lder0id" }),
      searchParams: Promise.resolve({}),
    });
    expect(calls).toEqual([]);
  });
});
