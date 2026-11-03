/**
 * SEARCH-EXAMPLES: the server's read of the day's examples. `unstable_cache`
 * is stubbed to record its key and options and call straight through (the
 * data cache itself is Next's, read on a local production build); the
 * rows come from a stubbed loadTopCommanders. Pinned: the cache is keyed by
 * the day and revalidates hourly, home's top-30 rows feed the day's draw,
 * and a failed read answers the examples without the commanders.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POOL_SIZE, type MagicShelfRow } from "@/lib/home/shelves";

const cache = vi.hoisted(() => ({
  keyParts: [] as string[],
  options: {} as { revalidate?: number | false; tags?: string[] },
}));
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(
    fn: (...args: A) => Promise<R>,
    keyParts: string[],
    options: { revalidate?: number | false; tags?: string[] },
  ) => {
    cache.keyParts = keyParts;
    cache.options = options;
    return fn;
  },
}));

const queries = vi.hoisted(() => ({ loadTopCommanders: vi.fn() }));
vi.mock("@/lib/hub/queries", () => queries);

import { searchExamples } from "./examples";
import { EXAMPLES_REVALIDATE_SECONDS, loadSearchExamples } from "./load-examples";

const ROWS: MagicShelfRow[] = [
  {
    id: "a",
    name: "Atraxa, Praetors' Voice",
    slug: "a",
    ciMask: 0,
    printingId: null,
    imageOverride: null,
  },
  { id: "b", name: "Edgar Markov", slug: "b", ciMask: 0, printingId: null, imageOverride: null },
];

beforeEach(() => {
  queries.loadTopCommanders.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadSearchExamples", () => {
  it("is cached by Next's data cache under one key, revalidated hourly", () => {
    expect(cache.keyParts).toEqual(["search-examples"]);
    expect(cache.options).toEqual({ revalidate: EXAMPLES_REVALIDATE_SECONDS });
    expect(EXAMPLES_REVALIDATE_SECONDS).toBe(3600);
  });

  it("draws the day's examples from home's top-30 rows", async () => {
    queries.loadTopCommanders.mockResolvedValue(ROWS);
    expect(await loadSearchExamples("2026-11-03")).toEqual(searchExamples("2026-11-03", ROWS));
    expect(queries.loadTopCommanders).toHaveBeenCalledWith(POOL_SIZE);
  });

  it("a failed read logs and answers the examples without the commanders", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    queries.loadTopCommanders.mockRejectedValue(new Error("connection refused"));
    expect((await loadSearchExamples("2026-11-03")).map((e) => e.text)).toEqual([
      "Sol Ring",
      "OP01-001",
    ]);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
