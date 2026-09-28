// @vitest-environment node
/**
 * The core sitemap's hand list (P2.6, W8b, W10, X4b): every static page,
 * in order, before the public decks, folders and profiles the three
 * queries add — run over the REAL drizzle builders and a fake postgres.js
 * client that answers each query with no rows.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe() {
    return { values: async () => [], then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const { default: sitemap } = await import("./sitemap");

describe("core sitemap", () => {
  it("lists the static pages — /sets beside /cards (X4b)", async () => {
    const paths = (await sitemap()).map((entry) => {
      const url = new URL(entry.url);
      return url.pathname + url.search;
    });
    expect(paths).toEqual([
      "/",
      "/commanders",
      "/leaders",
      "/precons",
      "/cards",
      "/cards?game=optcg",
      "/sets",
      "/tournaments",
      "/tournaments?game=optcg",
      "/legal",
      "/privacy",
    ]);
  });
});
